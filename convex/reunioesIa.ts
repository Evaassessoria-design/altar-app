"use node";

import { v, ConvexError } from "convex/values";
import OpenAI from "openai";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { requireIdentity } from "./lib/identity";
import { requireActiveAccessAction } from "./lib/accessGuard";
import { getAiConfig } from "./lib/aiConfig";
import { filtrarSugestao, lerJsonDoModelo, type SugestaoDaReuniao } from "./lib/reunioes";

// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÃO DE RESUMO, DECISÕES E PENDÊNCIAS A PARTIR DAS NOTAS
//
// O mesmo fluxo da IA Documental: LER → SUGERIR → MOSTRAR → REVISAR →
// CONFIRMAR. Esta action só LÊ e devolve; ela não chama mutation nenhuma. A
// tela mostra a prévia, a pessoa marca o que aceita, e só então
// `reunioes.atualizar` grava — sem tocar nas anotações originais.
//
// "Não inventar decisões" é garantido por `filtrarSugestao`: item sem trecho
// das notas que o sustente é descartado, e a tela diz quantos foram.
//
// Sem IA configurada, ou com falha do provedor, a reunião continua sendo
// registrada à mão — nada no registro manual depende desta action.
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCOES = `Você ajuda uma decoradora de eventos a organizar as anotações de uma reunião com a cliente.
Use SOMENTE o que está escrito nas anotações. Não suponha, não complete, não acrescente.
Responda apenas com JSON neste formato:
{"resumo":"2 a 5 frases","decisoes":[{"texto":"...","trecho":"..."}],"pendencias":[{"texto":"...","responsavel":"...","trecho":"..."}]}
- "decisoes": o que ficou DECIDIDO. Ideia, dúvida ou "vamos pensar" NÃO é decisão.
- "pendencias": o que alguém ficou de fazer. "responsavel" só se o nome estiver nas anotações; senão omita.
- "trecho": copie EXATAMENTE o pedaço das anotações que sustenta o item.
- Se não houver decisões ou pendências, devolva listas vazias.
Escreva em português do Brasil.`;

export const sugerirResumo = action({
  args: { id: v.id("reunioes") },
  handler: async (ctx, args): Promise<SugestaoDaReuniao> => {
    await requireIdentity(ctx);
    // IA custa por chamada: conta bloqueada não dispara geração.
    await requireActiveAccessAction(ctx);

    // `obter` confere o dono pela sessão: reunião de outra conta volta null.
    const reuniao = await ctx.runQuery(api.reunioes.obter, { id: args.id });
    if (!reuniao) throw new ConvexError({ code: "NOT_FOUND", message: "Reunião não encontrada" });

    const anotacoes = reuniao.anotacoes?.trim() ?? "";
    if (anotacoes.length < 20) {
      throw new ConvexError({
        code: "SEM_ANOTACOES",
        message: "Escreva e salve as anotações da reunião antes de pedir a sugestão.",
      });
    }

    const cfg = getAiConfig("documental");
    const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });

    let bruto = "";
    try {
      const resposta = await client.chat.completions.create({
        model: cfg.model,
        ...(cfg.supportsReasoningEffort ? { reasoning_effort: "low" as const } : {}),
        messages: [
          { role: "system", content: INSTRUCOES },
          {
            role: "user",
            content: `Reunião: ${reuniao.titulo} (${reuniao.data})\n${
              reuniao.pauta ? `Pauta:\n${reuniao.pauta}\n\n` : ""
            }Anotações:\n${anotacoes}`,
          },
        ],
      });
      bruto = resposta.choices[0]?.message?.content ?? "";
    } catch (e) {
      // Falha do provedor vira recado legível; as notas não são afetadas.
      console.error("reunioesIa.sugerirResumo", e);
      throw new ConvexError({
        code: "IA_INDISPONIVEL",
        message: "A sugestão não pôde ser gerada agora. As anotações estão salvas — tente de novo depois.",
      });
    }

    return filtrarSugestao(lerJsonDoModelo(bruto), anotacoes);
  },
});
