// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE CANAL — O QUE TODO CANAL ENTREGA À CENTRAL
//
// A Central não conhece WhatsApp. Ela conhece `MensagemNormalizada`. Tudo o
// que é específico de um canal — formato do payload, verificação de
// assinatura, identificador do contato, formato de envio — mora atrás deste
// contrato, num único arquivo por canal.
//
// Acrescentar Instagram, e-mail ou chat é escrever UM arquivo em
// `lib/channels/` e acrescentar UMA linha em `registro.ts`. Nenhuma tabela,
// nenhum índice, nenhuma query e nenhuma tela mudam.
// ─────────────────────────────────────────────────────────────────────────────

export const CANAIS = ["whatsapp", "instagram", "email", "chat"] as const;
export type Canal = (typeof CANAIS)[number];

export function ehCanal(valor: unknown): valor is Canal {
  return typeof valor === "string" && (CANAIS as readonly string[]).includes(valor);
}

export const TIPOS_DE_MENSAGEM = [
  "texto",
  "imagem",
  "audio",
  "video",
  "documento",
  "localizacao",
  "outro",
] as const;
export type TipoDeMensagem = (typeof TIPOS_DE_MENSAGEM)[number];

export type Direcao = "entrada" | "saida";

/**
 * Uma mensagem, já traduzida para a linguagem da Central.
 *
 * `externalContactId` é o handle do outro lado NO CANAL — para WhatsApp, o
 * telefone em E.164; para Instagram seria o id da conta; para e-mail, o
 * endereço. É por ele que `communicationIdentities` encontra a pessoa.
 */
export type MensagemNormalizada = {
  canal: Canal;
  externalMessageId: string;
  externalContactId: string;
  externalThreadId?: string;
  displayName?: string;
  direcao: Direcao;
  tipo: TipoDeMensagem;
  texto?: string;
  mediaMime?: string;
  /** Epoch ms. Canal que só entrega segundos é convertido no adaptador. */
  enviadaEm: number;
};

export type Verificacao = { ok: true } | { ok: false; motivo: string };

/**
 * Como o canal quer ser chamado quando (e SE) houver envio.
 *
 * Na Fase 1 nada disto é executado: o portão de saída barra antes. O tipo
 * existe para que o dia de ligar o envio não exija redesenhar o adaptador.
 */
export type RequisicaoDeEnvio = {
  url: string;
  metodo: "POST";
  headers: Record<string, string>;
  corpo: string;
};

export type AdaptadorDeCanal = {
  canal: Canal;

  /**
   * O canal está configurado neste ambiente?
   *
   * `false` faz o gateway responder 503 em vez de aceitar mensagem que não
   * consegue autenticar. Porta não configurada fica FECHADA, nunca aberta.
   */
  configurado(): boolean;

  /** Handshake de verificação da plataforma (GET), quando o canal tem um. */
  desafioDeVerificacao(url: URL): string | null;

  /**
   * Autentica o corpo recebido. Recebe o texto CRU — assinatura se calcula
   * sobre bytes, não sobre o objeto já parseado.
   */
  verificarEntrada(corpoCru: string, headers: Headers): Promise<Verificacao>;

  /** Payload da plataforma → mensagens da Central. Nunca lança. */
  normalizar(corpo: unknown): MensagemNormalizada[];

  /** Identificador estável do lote recebido, para idempotência. */
  chaveDeDeduplicacao(mensagem: MensagemNormalizada): string;

  prepararEnvio(destino: string, texto: string): RequisicaoDeEnvio;
};
