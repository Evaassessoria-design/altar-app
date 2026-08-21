// ─────────────────────────────────────────────────────────────────────────────
// ÚLTIMO ACESSO — medição barata de quem realmente usa o ALTAR.
//
// O objetivo é responder "esta conta está viva?", não "o que ela clicou". Por
// isso a granularidade é grosseira de propósito: guardamos UM carimbo de tempo
// por usuário e só o reescrevemos quando ele já está velho.
//
// Custo no pior caso: com a janela de 30 minutos, uma pessoa que ficasse o dia
// inteiro dentro do app geraria no máximo ~48 gravações por dia. Na prática são
// 1 a 3 — uma por sessão de trabalho. Sem a janela, seria uma gravação por
// navegação entre telas, o que encareceria o banco sem informação nova.
//
// A decisão de gravar vive AQUI, no servidor: mesmo que o aplicativo chame a
// mutation a cada clique (ou que alguém a chame de fora), o banco só é tocado
// uma vez por janela. A proteção não depende do cliente se comportar bem.
// ─────────────────────────────────────────────────────────────────────────────

/** Intervalo mínimo entre duas gravações de `lastSeenAt`, em milissegundos. */
export const LAST_SEEN_THROTTLE_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Deve gravar o novo carimbo?
 *
 * @param lastSeenAt valor atual no banco (ausente = nunca gravado)
 * @param now epoch ms
 */
export function shouldRecordLastSeen(
  lastSeenAt: number | undefined,
  now: number,
): boolean {
  if (lastSeenAt === undefined) return true;
  // Relógio do servidor voltando (ou carimbo do futuro por dado inconsistente):
  // grava para corrigir, em vez de ficar preso sem nunca mais atualizar.
  if (lastSeenAt > now) return true;
  return now - lastSeenAt >= LAST_SEEN_THROTTLE_MS;
}

/** Janelas usadas nas métricas de "usuários ativos" do painel. */
export const ACTIVE_WINDOWS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
} as const;

/** Acessou dentro da janela? `undefined` (nunca visto) conta como não. */
export function isActiveWithin(
  lastSeenAt: number | undefined,
  windowMs: number,
  now: number,
): boolean {
  if (lastSeenAt === undefined) return false;
  return now - lastSeenAt <= windowMs;
}
