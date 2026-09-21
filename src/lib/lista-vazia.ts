// ─────────────────────────────────────────────────────────────────────────────
// VAZIA POR QUÊ?
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// Três telas tratavam "não há nada" e "o filtro escondeu tudo" como o mesmo
// estado. Com 200 lançamentos no Financeiro e o filtro em "Receitas" sem
// nenhuma receita, a tela dizia:
//
//     Nenhum lançamento
//     Adicione receitas e despesas para controlar seu financeiro
//     [ Adicionar Lançamento ]
//
// Ela tem 200. O produto acabou de afirmar, com um convite de primeiro uso,
// que ela não tem nada — e no Orçamento a contradição ficava na mesma tela: a
// aba "Todos" mostrava o número 12 logo acima de "Nenhum item ainda".
//
// É a regra da casa ao contrário: a tela nunca afirma o que não sabe. Aqui ela
// afirmava o que sabia ser falso.
//
// ── POR QUE UM MÓDULO PARA TRÊS LINHAS ──────────────────────────────────────
// Porque a pergunta é sempre a mesma e a resposta errada é sempre a mesma. A
// tela dos fornecedores do evento já acertava, sozinha, com um `filtersActive`
// próprio — três acertos independentes é o que produz o quarto erro.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `null`        — há o que mostrar;
 * `"sem_dados"` — ela ainda não cadastrou nada: é hora de convidar;
 * `"filtro"`    — ela tem dados, o recorte é que não devolveu nada.
 */
export type ListaVazia = "sem_dados" | "filtro" | null;

export function motivoDaListaVazia(total: number, visiveis: number): ListaVazia {
  if (visiveis > 0) return null;
  // `total` só é confiável depois de carregar. Quem chama passa 0/0 enquanto
  // carrega, e "sem_dados" é a resposta certa para uma lista que ainda não
  // chegou — a tela de carregamento vem antes deste estado, de qualquer forma.
  return total > 0 ? "filtro" : "sem_dados";
}
