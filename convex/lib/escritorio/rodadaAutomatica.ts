import { diasAte, type Campanha } from "../campanha";
import { DIAS_PARA_DESISTIR_DO_FOLLOW_UP } from "../proximaAcao";

// ─────────────────────────────────────────────────────────────────────────────
// O ESCRITÓRIO RODANDO SOZINHO — QUANDO, E QUANDO NÃO
//
// ── O QUE MUDOU ─────────────────────────────────────────────────────────────
// Até 28/09 o ciclo só rodava com clique ("Rodar agora" em /campanha). O
// "Escritório que trabalha enquanto você não está olhando" dependia de alguém
// olhar. Agora um cron diário roda o MESMO ciclo — mesma regra, mesma
// política de autonomia, mesma idempotência — com `disparadoPor: "sistema"`.
//
// ── O QUE CONTINUA IGUAL, E É O QUE TORNA ISTO SEGURO ───────────────────────
// O ciclo não envia nada, não chama modelo e não altera estágio de ninguém:
// escreve RASCUNHO para uma pessoa revisar. Rodar sozinho não muda o nível de
// risco de nada — muda só quem aperta o botão. Capacidade desligada na
// política continua desligada para o sistema também.
//
// ── ATÉ QUANDO ──────────────────────────────────────────────────────────────
// Uma campanha tem data. Depois dela, o ciclo ainda serve para o follow-up de
// quem participou — até o prazo em que o próprio follow-up desiste
// (`DIAS_PARA_DESISTIR_DO_FOLLOW_UP`). Passado isso, rodar todo dia uma
// campanha encerrada só gravaria "tudo em dia" para sempre no histórico.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A rodada automática está LIGADA nesta versão?
 *
 * DESLIGADA no release de outubro/2026 (decisão de 06/10): o cron gravaria
 * rascunhos em PROD todo dia, a partir dos interessados reais da campanha,
 * com as capacidades verdes ligadas por padrão — antes de alguém ter
 * configurado a política. O ciclo MANUAL ("Rodar agora", só `platformOwner`)
 * continua igual.
 *
 * Uma chave só: o agendamento (`convex/crons.ts`), a frase da tela do
 * Escritório e o aviso do relatório leem daqui — ligar de novo é trocar este
 * valor, e nenhuma tela fica prometendo o que não acontece.
 */
export const RODADA_AUTOMATICA_LIGADA = false;

/** Dias depois do evento em que a rodada automática ainda faz sentido. */
export const DIAS_DE_ROTINA_APOS_A_CAMPANHA = DIAS_PARA_DESISTIR_DO_FOLLOW_UP;

export function campanhasDaRodadaAutomatica(
  campanhas: readonly Campanha[],
  hojeISO: string,
): Campanha[] {
  return campanhas.filter((c) => diasAte(c, hojeISO) >= -DIAS_DE_ROTINA_APOS_A_CAMPANHA);
}
