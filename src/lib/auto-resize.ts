// ─────────────────────────────────────────────────────────────────────────────
// ALTURA DE CAMPO DE TEXTO LONGO — o cálculo, separado do DOM
//
// "Observações" do lead era um `<Input>` de uma linha. Texto longo corria para
// o lado, some do campo de visão e escrever fica desconfortável — e quem usa o
// ALTAR escreve observação de cliente no meio de um atendimento.
//
// O cálculo mora aqui, fora do React, porque é ele que precisa de teste: o
// jsdom não faz layout (scrollHeight é sempre 0), então testar crescimento
// pela árvore renderizada não provaria nada. Aqui as medidas entram como
// número e a decisão sai como número.
//
// O CSS moderno tem `field-sizing: content`, que faz isto nativamente — mas só
// em navegadores recentes, e sem teto de altura. Um campo que cresce para
// sempre empurra o botão "Salvar" para fora do modal.
// ─────────────────────────────────────────────────────────────────────────────

export type MedidasDoCampo = {
  /** Altura do conteúdo medida pelo navegador (inclui padding). */
  scrollHeight: number;
  /** Altura de uma linha de texto. */
  lineHeight: number;
  /** Padding vertical somado (topo + base). */
  padding: number;
  /** Borda vertical somada (topo + base). */
  border: number;
  /** Altura mínima, em linhas. */
  minRows: number;
  /** Altura máxima, em linhas. Depois disso, rola. */
  maxRows: number;
};

export type AlturaDoCampo = {
  /** Altura final em pixels. */
  altura: number;
  /** `auto` só depois do teto — antes disso a barra de rolagem é ruído. */
  overflowY: "auto" | "hidden";
  /** Chegou no teto. */
  noLimite: boolean;
};

/**
 * Decide a altura do campo a partir das medidas do navegador.
 *
 * Regras, nesta ordem:
 *  1. nunca menor que `minRows` — campo vazio não encolhe até sumir;
 *  2. cresce com o conteúdo;
 *  3. nunca maior que `maxRows` — a partir daí rola por dentro.
 */
export function alturaDoCampo(m: MedidasDoCampo): AlturaDoCampo {
  const linha = m.lineHeight > 0 ? m.lineHeight : 20;
  const minRows = Math.max(1, m.minRows);
  const maxRows = Math.max(minRows, m.maxRows);

  const minima = linha * minRows + m.padding + m.border;
  const maxima = linha * maxRows + m.padding + m.border;

  // `scrollHeight` já traz o padding; falta a borda para virar altura de caixa
  // (box-sizing: border-box, que é o padrão do Tailwind).
  const desejada = m.scrollHeight + m.border;

  const noLimite = desejada > maxima;
  const altura = Math.min(Math.max(desejada, minima), maxima);

  return { altura, overflowY: noLimite ? "auto" : "hidden", noLimite };
}
