// ─────────────────────────────────────────────────────────────────────────────
// AUTONOMIA — O PORTÃO DE SAÍDA DA CENTRAL
//
// Este módulo existe para que a pergunta "esta mensagem pode sair?" tenha UMA
// resposta, escrita em função pura, testável isoladamente, e impossível de
// contornar por engano em outro arquivo.
//
// ── FASE 1 ──────────────────────────────────────────────────────────────────
// Nenhuma mensagem externa sai automaticamente. `podeEnviarSemAprovacao`
// devolve `false` para TODOS os níveis, inclusive "autonomo". O nível existe
// desde já porque a Fase 2 precisa ser uma mudança de DADO, não uma reescrita:
// quando a autonomia for liberada, esta função passa a consultar o nível e
// nada mais no caminho muda.
//
// ── AS QUATRO TRAVAS ────────────────────────────────────────────────────────
// `avaliarPortaoDeSaida` verifica, de forma INDEPENDENTE:
//
//   1. a aprovação está aprovada                → decisão existe
//   2. a aprovação tem autor humano registrado  → decisão tem dono
//   3. o envio externo está habilitado por env  → o ambiente permite
//   4. a janela de resposta do canal está aberta→ o canal aceita
//
// Independentes de propósito: cada uma sozinha barra a saída, e o teste de
// cada uma não depende das outras. Derrubar a Fase 1 exigiria derrubar as
// quatro ao mesmo tempo.
// ─────────────────────────────────────────────────────────────────────────────

export const NIVEIS = ["leitura", "sugestao", "envio_assistido", "autonomo"] as const;
export type Nivel = (typeof NIVEIS)[number];

/** Ausente ou inválido cai no mais restritivo que ainda é útil. */
export const NIVEL_PADRAO: Nivel = "sugestao";

export function ehNivel(valor: unknown): valor is Nivel {
  return typeof valor === "string" && (NIVEIS as readonly string[]).includes(valor);
}

export function resolverNivel(bruto?: string | null): Nivel {
  const limpo = bruto?.trim();
  return ehNivel(limpo) ? limpo : NIVEL_PADRAO;
}

/**
 * FASE 1: sempre `false`.
 *
 * Não é um `TODO`. É a política vigente, expressa em código e coberta por
 * teste, para que ligar autonomia por acidente seja impossível — inclusive se
 * alguém gravar o nível "autonomo" no banco antes da hora.
 */
export function podeEnviarSemAprovacao(_nivel: Nivel): boolean {
  return false;
}

/**
 * O ambiente permite falar com o mundo?
 *
 * Só a string exata "true" habilita. Qualquer outro valor — inclusive "1",
 * "sim", "TRUE" com espaço, ou a env ausente — mantém o portão fechado. Um
 * env var mal digitado NUNCA pode ser interpretado como autorização.
 */
export function envioExternoHabilitado(bruto?: string | null): boolean {
  return bruto?.trim() === "true";
}

/** Estado do envio, para exibição no painel executivo. */
export function rotuloDoEnvio(bruto?: string | null): "ligado" | "desligado" {
  return envioExternoHabilitado(bruto) ? "ligado" : "desligado";
}

export type EstadoDoPortao = {
  /** Status atual do registro em `adminApprovals`. */
  statusDaAprovacao: string;
  /** Quem decidiu. Ausente = ninguém decidiu, por mais que o status diga. */
  decididoPorUserId?: string | null;
  /** Valor CRU de ALTAR_CENTRAL_ENVIO_HABILITADO. */
  envioHabilitadoBruto?: string | null;
  /** Fim da janela de resposta do canal, epoch ms. Ausente = sem janela. */
  janelaRespostaAte?: number | null;
  agora: number;
};

export type VeredictoDoPortao =
  | { liberado: true }
  | { liberado: false; motivo: string; codigo: CodigoDeBloqueio };

export const CODIGOS_DE_BLOQUEIO = [
  "nao_aprovada",
  "sem_autor",
  "envio_desabilitado",
  "janela_expirada",
] as const;
export type CodigoDeBloqueio = (typeof CODIGOS_DE_BLOQUEIO)[number];

/** Status de `adminApprovals` que representam decisão humana favorável. */
export const STATUS_APROVADOS = ["aprovada", "aprovada_editada"] as const;

/**
 * A ÚNICA autorização de saída da Central.
 *
 * Devolve o primeiro bloqueio encontrado, na ordem em que um humano
 * investigaria: "foi aprovada?" antes de "quem aprovou?" antes de "o ambiente
 * deixa?" antes de "o canal ainda aceita?".
 */
export function avaliarPortaoDeSaida(estado: EstadoDoPortao): VeredictoDoPortao {
  if (!(STATUS_APROVADOS as readonly string[]).includes(estado.statusDaAprovacao)) {
    return {
      liberado: false,
      codigo: "nao_aprovada",
      motivo: `Aprovação em estado "${estado.statusDaAprovacao}" — só sai o que foi aprovado.`,
    };
  }

  if (!estado.decididoPorUserId) {
    return {
      liberado: false,
      codigo: "sem_autor",
      motivo: "Aprovação sem autor registrado — aprovação sem autor não é aprovação.",
    };
  }

  if (!envioExternoHabilitado(estado.envioHabilitadoBruto)) {
    return {
      liberado: false,
      codigo: "envio_desabilitado",
      motivo:
        "Envio externo desligado neste ambiente (ALTAR_CENTRAL_ENVIO_HABILITADO). " +
        "A resposta fica aprovada e registrada, mas não sai.",
    };
  }

  if (
    estado.janelaRespostaAte !== undefined &&
    estado.janelaRespostaAte !== null &&
    estado.agora > estado.janelaRespostaAte
  ) {
    return {
      liberado: false,
      codigo: "janela_expirada",
      motivo: "Janela de resposta do canal expirou — é preciso um novo contato do cliente.",
    };
  }

  return { liberado: true };
}
