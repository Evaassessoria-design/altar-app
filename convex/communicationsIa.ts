"use node";

import { v } from "convex/values";
import OpenAI from "openai";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAiConfig } from "./lib/aiConfig";
import { verticalDoAmbiente } from "./lib/central/vertical";
import {
  CATEGORIAS,
  ehCategoriaDeOuvidoria,
  resolverTriagem,
  trabalhoSugerido,
  type Categoria,
} from "./lib/central/triagem";
import {
  categoriaValidator,
  departamentoValidator,
  prioridadeValidator,
  verticalValidator,
} from "./lib/central/validadores";

// ═════════════════════════════════════════════════════════════════════════════
// TRIAGEM POR IA — LÊ, CLASSIFICA, ORGANIZA E PROPÕE. NUNCA ENVIA.
//
// Segue o fluxo que o ALTAR já pratica na IA documental (convex/ai.ts:37):
// LER → INTERPRETAR → MOSTRAR → REVISAR → CONFIRMAR → APLICAR. A Central não
// inventa política nova; aplica a que o produto já tem.
//
// ── O QUE ESTA ACTION PODE FAZER ───────────────────────────────────────────
//   gravar o palpite em `communicationTriage`
//   classificar a conversa (departamento, categoria, prioridade)
//   escalar para o CEO quando as regras mandam
//   abrir tarefa em `adminWorkItems`
//   registrar sinal em `customerVoiceSignals`
//   PROPOR uma resposta em `adminApprovals`, sempre `pendente`
//
// ── O QUE ELA NÃO PODE FAZER ───────────────────────────────────────────────
//   falar com o cliente. Nem aqui, nem indiretamente: a única porta é
//   communicationsOutbox.ts, e ela exige decisão humana registrada.
//
// ── IA FORA DO AR NÃO DERRUBA A CENTRAL ────────────────────────────────────
// Sem chave configurada, ou com o modelo devolvendo lixo, a conversa
// permanece em `triagem` com a mensagem salva e visível. Perder a
// classificação é aceitável; perder a mensagem do cliente não é.
// ═════════════════════════════════════════════════════════════════════════════

const VERSAO_DO_PROMPT = "central-triagem-1";

/** Limite de caracteres do histórico enviado ao modelo. */
const LIMITE_DE_CONTEXTO = 6_000;

function montarPrompt(): string {
  return `Você é o atendente de triagem da ALTAR, um SaaS brasileiro para empresas de decoração de eventos.

Você lê conversas do número comercial da ALTAR e as ORGANIZA. Quem fala com você são INTERESSADOS no ALTAR e ASSINANTES do ALTAR — nunca clientes finais das decoradoras.

Classifique a conversa e escreva uma sugestão de resposta em português do Brasil, cordial e objetiva.

Responda SOMENTE com JSON válido, neste formato:
{
  "categoria": "uma de: ${CATEGORIAS.join(" | ")}",
  "prioridade": "baixa | normal | alta | urgente",
  "confianca": 0.0,
  "assunto": "resumo de no máximo 60 caracteres",
  "resumo": "o que a pessoa quer, em uma ou duas frases",
  "sinais": ["trechos curtos que justificam a classificação"],
  "respostaSugerida": "a resposta que a ALTAR enviaria",
  "sinalDeProduto": { "titulo": "", "descricao": "", "severidade": "baixa | media | alta | critica" }
}

REGRAS:
- "confianca" é a SUA certeza na classificação, de 0 a 1. Seja honesto: valor baixo faz a conversa subir para uma pessoa, que é o comportamento desejado quando você não tem certeza.
- "sinalDeProduto" só quando a categoria for reclamacao, sugestao, bug, funcionalidade ou elogio. Caso contrário, omita.
- NUNCA prometa prazo, desconto, reembolso, cancelamento ou qualquer condição comercial ou financeira. Para assunto de cobrança, escreva apenas que uma pessoa da ALTAR vai responder.
- Sua resposta é uma SUGESTÃO que será revisada por uma pessoa antes de qualquer envio.`;
}

type RespostaDaIa = {
  categoria?: string;
  prioridade?: string;
  confianca?: number;
  assunto?: string;
  resumo?: string;
  sinais?: string[];
  respostaSugerida?: string;
  sinalDeProduto?: { titulo?: string; descricao?: string; severidade?: string };
};

function extrairJson(bruto: string): RespostaDaIa | null {
  const texto = bruto.trim();
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) return null;
  try {
    return JSON.parse(texto.slice(inicio, fim + 1)) as RespostaDaIa;
  } catch {
    return null;
  }
}

function confiancaValida(bruta: unknown): number {
  const n = typeof bruta === "number" ? bruta : Number(bruta);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export const triarConversa = internalAction({
  args: {
    conversationId: v.id("communicationConversations"),
    messageId: v.optional(v.id("communicationMessages")),
  },
  handler: async (ctx, args): Promise<{ triada: boolean; motivo?: string }> => {
    const dados = await ctx.runQuery(internal.communications.conversaParaTriagem, {
      conversationId: args.conversationId,
    });
    if (!dados) return { triada: false, motivo: "Conversa não encontrada." };

    const { conversa, contato, mensagens } = dados;

    let config;
    try {
      config = getAiConfig("documental");
    } catch {
      // Sem IA configurada a Central continua funcionando: a conversa fica em
      // triagem, com a mensagem salva, esperando uma pessoa.
      return { triada: false, motivo: "IA não configurada neste ambiente." };
    }

    const historico = mensagens
      .map((m) => `${m.direcao === "entrada" ? "CLIENTE" : "ALTAR"}: ${m.texto ?? `[${m.tipo}]`}`)
      .join("\n")
      .slice(-LIMITE_DE_CONTEXTO);

    let bruto: string;
    try {
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
      const resposta = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: "system", content: montarPrompt() },
          {
            role: "user",
            content: `Canal: ${conversa.channel}\nContato: ${contato?.displayName ?? "desconhecido"} (${contato?.tipo ?? "desconhecido"})\n\nConversa:\n${historico}`,
          },
        ],
        ...(config.supportsReasoningEffort ? { reasoning_effort: "low" } : {}),
      });
      bruto = resposta.choices[0]?.message?.content ?? "";
    } catch (erro) {
      return {
        triada: false,
        motivo: erro instanceof Error ? erro.message : "Falha ao chamar o modelo.",
      };
    }

    const lida = extrairJson(bruto);
    if (!lida) return { triada: false, motivo: "O modelo não devolveu JSON utilizável." };

    // As REGRAS são do ALTAR, não do modelo: a IA propõe categoria e
    // prioridade; departamento e escalonamento saem de lib/central/triagem.ts.
    const resolvida = resolverTriagem(
      {
        categoria: lida.categoria ?? "outro",
        prioridade: lida.prioridade,
        confianca: confiancaValida(lida.confianca),
      },
      {
        tipoDeContato: contato?.tipo,
        jaEscalada: conversa.escaladaParaCeo,
      },
    );

    const categoria = resolvida.categoria as Categoria;

    await ctx.runMutation(internal.communicationsTriage.aplicarTriagem, {
      conversationId: args.conversationId,
      messageId: args.messageId,
      vertical: verticalDoAmbiente(),
      departamento: resolvida.departamento,
      categoria: resolvida.categoria,
      prioridade: resolvida.prioridade,
      escalar: resolvida.escalar,
      motivoDoEscalonamento: resolvida.motivoDoEscalonamento,
      confianca: confiancaValida(lida.confianca),
      assunto: (lida.assunto ?? "").trim().slice(0, 80) || undefined,
      resumo: (lida.resumo ?? "").trim().slice(0, 1_000) || "Sem resumo.",
      sinais: (lida.sinais ?? []).slice(0, 10).map((s) => String(s).slice(0, 200)),
      respostaSugerida: (lida.respostaSugerida ?? "").trim().slice(0, 4_000) || undefined,
      modelo: config.model,
      promptVersao: VERSAO_DO_PROMPT,
      trabalho: trabalhoSugerido(categoria) ?? undefined,
      sinalDeProduto: ehCategoriaDeOuvidoria(categoria)
        ? {
            titulo: (lida.sinalDeProduto?.titulo ?? lida.assunto ?? "Sinal de produto")
              .trim()
              .slice(0, 160),
            descricao: (lida.sinalDeProduto?.descricao ?? lida.resumo ?? "")
              .trim()
              .slice(0, 4_000),
            severidade: ["baixa", "media", "alta", "critica"].includes(
              lida.sinalDeProduto?.severidade ?? "",
            )
              ? (lida.sinalDeProduto!.severidade as "baixa" | "media" | "alta" | "critica")
              : undefined,
          }
        : undefined,
      agora: Date.now(),
    });

    return { triada: true };
  },
});
