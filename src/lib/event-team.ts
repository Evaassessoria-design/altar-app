import { parseTime } from "./agenda.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ESCALA DA EQUIPE DO EVENTO — ordem de apresentação.
//
// Reaproveita `parseTime` da Agenda do Evento de propósito: o horário de
// chegada é UM dado só, e a escala e a agenda precisam interpretá-lo do mesmo
// jeito. Duas leituras diferentes do mesmo campo é como as telas começam a
// discordar entre si.
// ─────────────────────────────────────────────────────────────────────────────

export type ScheduledLike = {
  scheduledTime?: string;
  member?: { name: string } | null;
};

/**
 * Ordena a escala por horário de chegada.
 *
 * Quem NÃO tem horário definido vai para o fim — não some da lista, mas também
 * não se mistura com quem já está posicionado no dia. Empate de horário é
 * desempatado pelo nome, para a ordem não mudar sozinha a cada carregamento.
 */
export function sortEventTeam<T extends ScheduledLike>(assignments: readonly T[]): T[] {
  return [...assignments].sort((a, b) => {
    const ta = parseTime(a.scheduledTime);
    const tb = parseTime(b.scheduledTime);
    if (ta === null && tb === null) {
      return (a.member?.name ?? "").localeCompare(b.member?.name ?? "", "pt-BR");
    }
    if (ta === null) return 1;
    if (tb === null) return -1;
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.member?.name ?? "").localeCompare(b.member?.name ?? "", "pt-BR");
  });
}

/** Quantas pessoas já têm horário de chegada definido. */
export function countScheduled(assignments: readonly ScheduledLike[]): number {
  return assignments.filter((a) => parseTime(a.scheduledTime) !== null).length;
}
