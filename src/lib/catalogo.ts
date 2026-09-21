// ─────────────────────────────────────────────────────────────────────────────
// O CATÁLOGO DO ESTÚDIO — BUSCA E ORDENAÇÃO
//
// Regra pura: recebe o que a consulta já leu e decide o que aparece e em que
// ordem. Fora do componente para ser testada sem renderizar nada.
//
// ── POR QUE FILTRAR AQUI, E NÃO NA CONSULTA ─────────────────────────────────
// O catálogo é da EMPRESA: materiais e composições de UMA decoradora, lidos
// por índice de dono, e são dezenas ou poucas centenas — não milhares. A lista
// inteira já vem, e buscar em memória sobre ela é exato.
//
// Isso é diferente de filtrar uma PÁGINA: ali o resultado mentiria ("os
// urgentes ENTRE os 50 primeiros" lido como "os urgentes"). Aqui não há
// página; se um dia houver, a busca desce para a consulta junto com ela.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeName } from "@/convex/lib/materiais.ts";

/** O que a busca do catálogo enxerga de um material. */
export type MaterialBuscavel = {
  nome: string;
  categoria?: string;
  unidade: string;
};

/** O que a busca enxerga de uma composição. */
export type ComposicaoBuscavel = {
  nome: string;
  categoria?: string;
  receita: readonly { nome: string }[];
};

/**
 * Compara ignorando acento e caixa — "acucar" acha "Açúcar".
 *
 * Reaproveita `normalizeName`, a MESMA normalização que a deduplicação do
 * catálogo usa. Duas normalizações diferentes fariam a busca não encontrar
 * exatamente o material que o cadastro considerou repetido.
 */
function contem(texto: string | undefined, termo: string): boolean {
  if (!texto) return false;
  return normalizeName(texto).includes(termo);
}

/** Materiais que casam com a busca. Busca vazia devolve tudo, na ordem. */
export function filtrarMateriais<T extends MaterialBuscavel>(
  materiais: readonly T[],
  busca: string,
): T[] {
  const termo = normalizeName(busca.trim());
  if (!termo) return [...materiais];
  return materiais.filter((m) => contem(m.nome, termo) || contem(m.categoria, termo));
}

/**
 * Composições que casam com a busca.
 *
 * Busca também PELO MATERIAL: "quais receitas levam eucalipto?" é a pergunta
 * que ela faz quando o fornecedor avisa que faltou eucalipto. Sem isso, seria
 * preciso abrir uma a uma.
 */
export function filtrarComposicoes<T extends ComposicaoBuscavel>(
  composicoes: readonly T[],
  busca: string,
): T[] {
  const termo = normalizeName(busca.trim());
  if (!termo) return [...composicoes];
  return composicoes.filter(
    (c) =>
      contem(c.nome, termo) ||
      contem(c.categoria, termo) ||
      c.receita.some((linha) => contem(linha.nome, termo)),
  );
}

/**
 * As categorias presentes, para o filtro.
 *
 * Sai do que EXISTE, não de uma lista fixa: a decoradora escreve a categoria
 * que quiser, e um seletor com opções que ninguém usou seria ruído.
 */
export function categoriasPresentes(
  itens: readonly { categoria?: string }[],
): string[] {
  const vistas = new Set<string>();
  for (const i of itens) {
    const c = i.categoria?.trim();
    if (c) vistas.add(c);
  }
  return [...vistas].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
