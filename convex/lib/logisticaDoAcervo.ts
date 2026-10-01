import { quantidadeLimpa } from "./fichaTecnica";
import { faltaVoltar, normalizarJanela, type ReservaParaCalculo } from "./acervo";
import { condicoesDoItem, type ItemComCondicoes } from "./condicaoDoAcervo";

// ═════════════════════════════════════════════════════════════════════════════
// ONDE AS PEÇAS ESTÃO — o eixo que a condição não responde
//
// ── DOIS EIXOS, NUNCA SOMADOS ───────────────────────────────────────────────
// CONDIÇÃO é do item e é gravada em contadores (`lib/condicaoDoAcervo.ts`):
// pronto, limpar, reparo, indisponível, em conferência. LUGAR é das reservas
// e é sempre derivado aqui: no galpão, fora num evento, prometido para os
// próximos eventos.
//
// Um castiçal pode estar PRONTO e FORA (foi para o casamento de sábado e
// ninguém o trouxe); outro EM REPARO e NO GALPÃO. Um enum único ("reservado",
// "em reparo", "no evento"…) obrigaria a escolher um dos dois, e a peça pronta
// que está na rua sumiria de uma das contas.
//
// ── O DEFEITO QUE ISTO FECHA ────────────────────────────────────────────────
// Até 30/09 o `/acervo` dizia "28 prontas" para um item com 4 peças ainda no
// evento de sábado: "pronto" é condição, e a peça na rua continua pronta (ela
// saiu pronta). Para a pergunta do galpão — "quantas posso pôr no caminhão
// agora?" — a resposta era 24.
//
// ── O QUE NÃO ESTÁ AQUI ─────────────────────────────────────────────────────
// Separado e carregado são do ITEM DE MONTAGEM (`assemblyItems.operationalStatus`),
// marcados pela equipe, sem quantidade por peça de acervo. "Pré-reserva" não
// existe no modelo: toda reserva é reserva. "Voltou e ninguém olhou" é a
// condição EM CONFERÊNCIA (o retorno registrado entra nela). Ver
// docs/jornada-evento/acervo-ciclo-de-vida.md.
// ═════════════════════════════════════════════════════════════════════════════

export type LogisticaDoItem = {
  /** Fisicamente no galpão: o total menos o que saiu e não voltou. */
  noGalpao: number;
  /** Saiu para algum evento e não voltou. */
  fora: number;
  /**
   * Prontas E no galpão — o que pode ir para o caminhão agora. Não é
   * "disponível para o evento X": isso depende da janela, e continua sendo
   * `disponibilidadeNaJanela`.
   */
  prontasNoGalpao: number;
  /** Prometido a eventos que ainda não saíram (cancelados não contam). */
  reservadoAFrente: number;
  eventosAFrente: number;
};

export function logisticaDoItem(
  item: ItemComCondicoes,
  reservas: readonly ReservaParaCalculo[],
  hoje: string,
): LogisticaDoItem {
  const fora = quantidadeLimpa(reservas.reduce((s, r) => s + faltaVoltar(r), 0));
  const aFrente = reservas.filter(
    (r) =>
      !r.eventoCancelado &&
      (r.saiu ?? 0) === 0 &&
      normalizarJanela({ inicio: r.inicio, fim: r.fim }).fim >= hoje,
  );
  const total = quantidadeLimpa(Math.max(0, item.quantidadeTotal));
  return {
    noGalpao: quantidadeLimpa(Math.max(0, total - fora)),
    fora,
    // A peça na rua ainda conta como "pronto" no contador de condição (saiu
    // pronta); aqui ela sai da conta.
    prontasNoGalpao: quantidadeLimpa(Math.max(0, condicoesDoItem(item).pronto - fora)),
    reservadoAFrente: quantidadeLimpa(aFrente.reduce((s, r) => s + r.quantidade, 0)),
    eventosAFrente: new Set(aFrente.map((r) => r.eventId)).size,
  };
}
