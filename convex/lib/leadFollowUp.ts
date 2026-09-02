import { diasEntre } from "./attention";

// ─────────────────────────────────────────────────────────────────────────────
// LEADS QUE PRECISAM DE VOCÊ
//
// O Funil já mostra em que estágio cada oportunidade está. O que ele não
// respondia é a pergunta que custa dinheiro:
//
//   "Qual oportunidade eu estou deixando esfriar?"
//
// ── DUAS PERGUNTAS DIFERENTES ───────────────────────────────────────────────
//   · SEM PRÓXIMA AÇÃO → ninguém decidiu o que fazer a seguir. É uma falha de
//     processo, e vale independente de quando foi a última conversa.
//   · PARADO → existe (ou não) uma ação, mas faz tempo demais que nada
//     acontece PARA AQUELE ESTÁGIO.
//
// São coisas distintas de propósito: um lead pode ter próxima ação anotada e
// mesmo assim estar esquecido há três semanas.
//
// ── POR QUE O PRAZO É POR ESTÁGIO ───────────────────────────────────────────
// "Qualquer lead com mais de X dias" produz alerta demais e informação de
// menos. Um contato novo que não foi respondido em 2 dias já é urgente;
// uma negociação de fim de ano pode passar uma semana sem novidade sem que
// isso signifique abandono. O prazo acompanha o que o estágio espera.
//
// ── ESTÁGIOS QUE NÃO ALERTAM ────────────────────────────────────────────────
// `contracted` e `discarded` são estados FINAIS. Cobrar follow-up de um lead
// já fechado ou já perdido é ruído puro — e foi um pedido explícito.
// ─────────────────────────────────────────────────────────────────────────────

export type EstagioLead =
  | "contact"
  | "contacted"
  | "meeting"
  | "quote_sent"
  | "negotiating"
  | "contracted"
  | "discarded";

/** Estágios finais: fechado ou perdido. Nunca geram cobrança. */
export const ESTAGIOS_FINAIS: readonly EstagioLead[] = ["contracted", "discarded"];

/**
 * Dias de silêncio tolerados em cada estágio antes de a oportunidade contar
 * como parada.
 *
 * Contato novo é o mais curto de propósito: é o momento em que a decoradora
 * perde negócio para quem respondeu primeiro.
 */
export const PRAZO_POR_ESTAGIO: Record<string, number> = {
  contact: 2,
  contacted: 5,
  meeting: 7,
  quote_sent: 5,
  negotiating: 7,
};

/** Prazo de um estágio; estágio desconhecido cai no mais tolerante. */
export function prazoDoEstagio(stage: string): number {
  return PRAZO_POR_ESTAGIO[stage] ?? 7;
}

export type LeadParaAcompanhar = {
  _id: string;
  clientName: string;
  stage: string;
  nextAction?: string;
  lastInteraction?: string;
  /** Epoch ms de criação — usado só quando não há `lastInteraction`. */
  _creationTime: number;
};

/** O lead ainda está em jogo? */
export function estaAtivo(lead: { stage: string }): boolean {
  return !(ESTAGIOS_FINAIS as readonly string[]).includes(lead.stage);
}

/** Não decidiram o próximo passo. */
export function semProximaAcao(lead: LeadParaAcompanhar): boolean {
  return estaAtivo(lead) && !lead.nextAction?.trim();
}

/**
 * Dias desde o último sinal de vida do lead.
 *
 * Usa `lastInteraction` quando existe. Sem ela, cai na criação: um lead
 * cadastrado há trinta dias sem nenhuma conversa registrada está esquecido,
 * e fingir que não sabemos disso seria pior do que estimar.
 *
 * `diasEntre` (lib/attention.ts) ancora as duas datas ao meio-dia UTC — é o
 * mesmo helper do painel de atenção, e é o que impede o bug de "dia anterior".
 */
export function diasSemContato(lead: LeadParaAcompanhar, hojeISO: string): number {
  const ultima = lead.lastInteraction?.trim();
  if (ultima) {
    const dias = diasEntre(ultima, hojeISO);
    return Number.isNaN(dias) ? 0 : Math.max(0, dias);
  }
  const criado = new Date(lead._creationTime);
  const criadoISO = `${criado.getUTCFullYear()}-${String(criado.getUTCMonth() + 1).padStart(2, "0")}-${String(criado.getUTCDate()).padStart(2, "0")}`;
  const dias = diasEntre(criadoISO, hojeISO);
  return Number.isNaN(dias) ? 0 : Math.max(0, dias);
}

/** Passou do prazo que o estágio dele tolera. */
export function estaParado(lead: LeadParaAcompanhar, hojeISO: string): boolean {
  if (!estaAtivo(lead)) return false;
  return diasSemContato(lead, hojeISO) >= prazoDoEstagio(lead.stage);
}

export type ResumoDeFollowUp = {
  semAcao: LeadParaAcompanhar[];
  parados: LeadParaAcompanhar[];
  /** Quantas oportunidades distintas pedem alguma coisa. */
  total: number;
};

/**
 * Separa as duas listas e conta as oportunidades DISTINTAS.
 *
 * Um lead pode estar nas duas — sem ação E parado. No total ele conta uma vez
 * só: o Dashboard fala de oportunidades, não de motivos.
 */
export function resumirFollowUp(
  leads: readonly LeadParaAcompanhar[],
  hojeISO: string,
): ResumoDeFollowUp {
  const semAcao = leads.filter((l) => semProximaAcao(l));
  const parados = leads.filter((l) => estaParado(l, hojeISO));
  const distintos = new Set([...semAcao, ...parados].map((l) => l._id));
  return { semAcao, parados, total: distintos.size };
}
