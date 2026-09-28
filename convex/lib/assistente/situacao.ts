// ─────────────────────────────────────────────────────────────────────────────
// A TAREFA ESTÁ TRABALHANDO — OU PAROU E NINGUÉM AVISOU?
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// O executor marca `running` e só sai desse estado pelo `concluir` ou pelo
// `falhar`. Se a plataforma matar a action (tempo esgotado, reinício), nenhum
// dos dois roda — e a tarefa fica "trabalhando" para sempre, com a decoradora
// olhando um spinner que não vai acabar.
//
// ── POR QUE DERIVADO, E NÃO UMA VARREDURA QUE GRAVA `failed` ─────────────────
// "Travada" é função de duas coisas que já existem: o status e há quanto
// tempo ele não muda. Gravar isso exigiria um cron e abriria a corrida de
// marcar como falha uma tarefa que termina um segundo depois. Derivado na
// tela, se o executor concluir tarde, a resposta simplesmente aparece.
//
// E fica na TELA, não numa query: query do Convex com `Date.now()` não
// reexecuta com a passagem do tempo, então nunca "descobriria" a trava.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A partir de quanto tempo sem terminar a tarefa é dada como parada.
 *
 * O executor desiste do modelo em 30 s (+ uma nova tentativa) e responde por
 * regra; as leituras são as consultas das telas. Cinco minutos é folga larga
 * para o caminho lento — passou disso, não vai terminar.
 */
export const TRAVADA_APOS_MS = 5 * 60_000;

export type TarefaNoTempo = {
  status: "queued" | "running" | "completed" | "failed" | "refused";
  criadoEm: number;
  iniciadoEm?: number;
};

export type SituacaoDaTarefa = "trabalhando" | "travada" | "terminou";

export function situacaoDaTarefa(tarefa: TarefaNoTempo, agora: number): SituacaoDaTarefa {
  if (tarefa.status !== "queued" && tarefa.status !== "running") return "terminou";
  const desde = tarefa.iniciadoEm ?? tarefa.criadoEm;
  return agora - desde >= TRAVADA_APOS_MS ? "travada" : "trabalhando";
}

/** A frase da tela para a tarefa travada. Diz o que fazer, não o que quebrou. */
export const RECADO_DA_TAREFA_TRAVADA =
  "Este trabalho não terminou. Nenhum dado foi alterado — delegue de novo.";
