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

/** Dias depois do evento em que a rodada automática ainda faz sentido. */
export const DIAS_DE_ROTINA_APOS_A_CAMPANHA = DIAS_PARA_DESISTIR_DO_FOLLOW_UP;

export function campanhasDaRodadaAutomatica(
  campanhas: readonly Campanha[],
  hojeISO: string,
): Campanha[] {
  return campanhas.filter((c) => diasAte(c, hojeISO) >= -DIAS_DE_ROTINA_APOS_A_CAMPANHA);
}
