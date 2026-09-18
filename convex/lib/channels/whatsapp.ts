// ─────────────────────────────────────────────────────────────────────────────
// CANAL WHATSAPP — O ÚNICO ARQUIVO DO BACKEND QUE SABE O QUE É WHATSAPP
//
// Fora daqui, do registro de canais e das variáveis de ambiente, a palavra
// "whatsapp" só aparece como VALOR do campo `channel`. Nenhuma tabela, índice,
// query ou tela carrega o nome do canal.
//
// ── DOIS MODOS, UMA NORMALIZAÇÃO ────────────────────────────────────────────
//   meta_cloud  produção. Assinatura HMAC-SHA256 da Meta, envio pela Graph API.
//   mock        desenvolvimento. MESMO formato de payload da Meta, autenticado
//               por um token local. Trocar mock → meta_cloud não muda uma
//               linha de normalização, de schema ou de tela: muda credencial.
//
// O modo mock existe porque o número comercial ainda não está integrado. Ele
// permite validar o fluxo inteiro — recebimento, triagem, fila de aprovação —
// sem token real, sem Phone ID e sem uma única chamada externa.
//
// ── A PORTA NUNCA FICA DESTRANCADA ──────────────────────────────────────────
// Não existe caminho que aceite um POST sem autenticação. Sem segredo de
// produção E sem token de mock, `configurado()` devolve `false` e o gateway
// responde 503. Ausência de configuração fecha a porta; nunca a abre.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AdaptadorDeCanal,
  MensagemNormalizada,
  RequisicaoDeEnvio,
  TipoDeMensagem,
  Verificacao,
} from "./tipos";
import { normalizarE164 } from "../central/telefone";

const GRAPH_VERSAO = "v21.0";
const CABECALHO_ASSINATURA = "X-Hub-Signature-256";
const CABECALHO_MOCK = "X-Altar-Mock-Token";

export type ModoDoCanal = "meta_cloud" | "mock" | "desconfigurado";

/**
 * Modo vigente. `meta_cloud` só é assumido quando existe segredo de
 * verificação — sem ele não há como autenticar a entrada, e um canal que não
 * autentica não é um canal configurado.
 */
export function modoAtual(env: Record<string, string | undefined> = process.env): ModoDoCanal {
  const provider = env.ALTAR_WHATSAPP_PROVIDER?.trim();
  const segredo = env.ALTAR_WHATSAPP_APP_SECRET?.trim();
  const tokenMock = env.ALTAR_CENTRAL_MOCK_TOKEN?.trim();

  if (provider === "mock") return tokenMock ? "mock" : "desconfigurado";
  if (segredo) return "meta_cloud";
  return "desconfigurado";
}

// ─── Assinatura ─────────────────────────────────────────────────────────────

function paraHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Comparação de tempo constante.
 *
 * Comparar hash com `===` vaza, pela duração, quantos caracteres iniciais o
 * atacante acertou. Com 64 caracteres hexadecimais isso é explorável.
 */
export function comparaEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

/** HMAC-SHA256 do corpo cru, em hexadecimal. */
export async function assinar(corpoCru: string, segredo: string): Promise<string> {
  const codificador = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, codificador.encode(corpoCru));
  return paraHex(assinatura);
}

/** Cabeçalho no formato que a Meta envia. Usado também pelos testes. */
export function cabecalhoDeAssinatura(hex: string): string {
  return `sha256=${hex}`;
}

export async function verificarAssinaturaMeta(
  corpoCru: string,
  cabecalho: string | null,
  segredo: string,
): Promise<Verificacao> {
  if (!cabecalho) {
    return { ok: false, motivo: "Requisição sem assinatura." };
  }
  const [esquema, recebido] = cabecalho.trim().split("=");
  if (esquema !== "sha256" || !recebido) {
    return { ok: false, motivo: "Formato de assinatura não reconhecido." };
  }
  const esperado = await assinar(corpoCru, segredo);
  return comparaEmTempoConstante(esperado, recebido.toLowerCase())
    ? { ok: true }
    : { ok: false, motivo: "Assinatura inválida." };
}

// ─── Normalização ───────────────────────────────────────────────────────────

const TIPO_META: Record<string, TipoDeMensagem> = {
  text: "texto",
  image: "imagem",
  audio: "audio",
  voice: "audio",
  video: "video",
  document: "documento",
  location: "localizacao",
  sticker: "imagem",
};

function texto(bruto: Record<string, unknown>): string | undefined {
  const corpo = (bruto.text as { body?: unknown } | undefined)?.body;
  if (typeof corpo === "string" && corpo.trim()) return corpo.trim();

  // Botões e listas chegam com o rótulo escolhido em outro lugar do payload.
  const botao = (bruto.button as { text?: unknown } | undefined)?.text;
  if (typeof botao === "string" && botao.trim()) return botao.trim();

  const interativo = bruto.interactive as
    | { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } }
    | undefined;
  const titulo = interativo?.button_reply?.title ?? interativo?.list_reply?.title;
  if (typeof titulo === "string" && titulo.trim()) return titulo.trim();

  const legenda = (bruto.image ?? bruto.video ?? bruto.document) as
    | { caption?: unknown }
    | undefined;
  if (typeof legenda?.caption === "string" && legenda.caption.trim()) {
    return legenda.caption.trim();
  }

  return undefined;
}

function mime(bruto: Record<string, unknown>): string | undefined {
  const midia = (bruto.image ?? bruto.audio ?? bruto.video ?? bruto.document) as
    | { mime_type?: unknown }
    | undefined;
  return typeof midia?.mime_type === "string" ? midia.mime_type : undefined;
}

/**
 * Payload da Meta Cloud API → mensagens da Central.
 *
 * NUNCA lança. Um payload estranho produz lista vazia, e o gateway registra
 * `ignored` — a Meta reenvia webhook que não responde 200, e um erro aqui
 * viraria uma fila de reentrega infinita por causa de uma mensagem só.
 */
export function normalizarPayloadMeta(corpo: unknown): MensagemNormalizada[] {
  const saida: MensagemNormalizada[] = [];
  const raiz = corpo as { entry?: unknown } | null;
  if (!raiz || typeof raiz !== "object" || !Array.isArray(raiz.entry)) return saida;

  for (const entrada of raiz.entry) {
    const mudancas = (entrada as { changes?: unknown })?.changes;
    if (!Array.isArray(mudancas)) continue;

    for (const mudanca of mudancas) {
      const valor = (mudanca as { value?: unknown })?.value as
        | {
            messages?: unknown;
            contacts?: unknown;
            metadata?: { phone_number_id?: unknown };
          }
        | undefined;
      if (!valor || !Array.isArray(valor.messages)) continue;

      // O nome do perfil vem numa lista paralela, indexada por wa_id.
      const nomes = new Map<string, string>();
      if (Array.isArray(valor.contacts)) {
        for (const contato of valor.contacts) {
          const c = contato as { wa_id?: unknown; profile?: { name?: unknown } };
          if (typeof c.wa_id === "string" && typeof c.profile?.name === "string") {
            nomes.set(c.wa_id, c.profile.name);
          }
        }
      }

      const threadId =
        typeof valor.metadata?.phone_number_id === "string"
          ? valor.metadata.phone_number_id
          : undefined;

      for (const bruta of valor.messages) {
        const m = bruta as Record<string, unknown>;
        if (typeof m.id !== "string" || typeof m.from !== "string") continue;

        const e164 = normalizarE164(m.from);
        if (!e164) continue; // sem telefone reconhecível não há a quem responder

        const tipoBruto = typeof m.type === "string" ? m.type : "";
        // `timestamp` vem em SEGUNDOS no padrão da Meta.
        const segundos = Number(m.timestamp);
        const enviadaEm = Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : Date.now();

        saida.push({
          canal: "whatsapp",
          externalMessageId: m.id,
          externalContactId: e164,
          externalThreadId: threadId,
          displayName: nomes.get(m.from),
          direcao: "entrada",
          tipo: TIPO_META[tipoBruto] ?? "outro",
          texto: texto(m),
          mediaMime: mime(m),
          enviadaEm,
        });
      }
    }
  }

  return saida;
}

// ─── Adaptador ──────────────────────────────────────────────────────────────

export function criarAdaptadorWhatsapp(
  env: Record<string, string | undefined> = process.env,
): AdaptadorDeCanal {
  return {
    canal: "whatsapp",

    configurado() {
      return modoAtual(env) !== "desconfigurado";
    },

    desafioDeVerificacao(url: URL) {
      // Handshake da Meta: ela chama com GET e espera o challenge de volta.
      const esperado = env.ALTAR_WHATSAPP_VERIFY_TOKEN?.trim();
      if (!esperado) return null;
      const modo = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const desafio = url.searchParams.get("hub.challenge");
      if (modo !== "subscribe" || !desafio) return null;
      if (!token || !comparaEmTempoConstante(esperado, token)) return null;
      return desafio;
    },

    async verificarEntrada(corpoCru: string, headers: Headers): Promise<Verificacao> {
      const modo = modoAtual(env);

      if (modo === "desconfigurado") {
        return { ok: false, motivo: "Canal WhatsApp não configurado neste ambiente." };
      }

      if (modo === "mock") {
        const esperado = env.ALTAR_CENTRAL_MOCK_TOKEN?.trim() ?? "";
        const recebido = headers.get(CABECALHO_MOCK)?.trim() ?? "";
        return esperado && comparaEmTempoConstante(esperado, recebido)
          ? { ok: true }
          : { ok: false, motivo: "Token de simulação inválido." };
      }

      const segredo = env.ALTAR_WHATSAPP_APP_SECRET?.trim() ?? "";
      return verificarAssinaturaMeta(corpoCru, headers.get(CABECALHO_ASSINATURA), segredo);
    },

    normalizar(corpo: unknown) {
      return normalizarPayloadMeta(corpo);
    },

    chaveDeDeduplicacao(mensagem: MensagemNormalizada) {
      return `whatsapp:${mensagem.externalMessageId}`;
    },

    prepararEnvio(destino: string, texto: string): RequisicaoDeEnvio {
      // NÃO É EXECUTADO NA FASE 1. O portão de saída (lib/central/autonomia)
      // barra antes de qualquer preparo. Existe para que ligar o envio na
      // Fase 2 não exija redesenhar o adaptador.
      const phoneId = env.ALTAR_WHATSAPP_PHONE_ID?.trim() ?? "";
      const token = env.ALTAR_WHATSAPP_TOKEN?.trim() ?? "";
      return {
        url: `https://graph.facebook.com/${GRAPH_VERSAO}/${phoneId}/messages`,
        metodo: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        corpo: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: destino.replace(/^\+/, ""),
          type: "text",
          text: { preview_url: false, body: texto },
        }),
      };
    },
  };
}
