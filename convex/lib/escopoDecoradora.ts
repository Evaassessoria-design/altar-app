// ─────────────────────────────────────────────────────────────────────────────
// O ESCOPO DA EMPRESA DE DECORAÇÃO
//
// ── A CONFUSÃO QUE ESTE MÓDULO RESOLVE ──────────────────────────────────────
// O ALTAR é o sistema da DECORADORA — não de assessoria, não de wedding
// planner, e não é exclusivo de casamento. A mesma empresa decora aniversário,
// 15 anos, bodas, formatura, evento corporativo, lançamento, festa infantil.
//
// A lista de categorias de fornecedor, porém, nasceu de uma cabeça de
// assessoria: assessoria, local, buffet, bar, doces, som & iluminação. NENHUMA
// categoria de decoração. O efeito prático apareceu no Dashboard: "Confirmar
// menu final após degustação · Buffet Terra Nova" aparecia como pendência DA
// DECORADORA. Não é. Degustação de menu é problema do cliente com o buffet.
//
// ── A DISTINÇÃO ─────────────────────────────────────────────────────────────
//   · OPERAÇÃO DA DECORADORA → flores, mobiliário, iluminação decorativa,
//     estruturas, materiais, gráfica, personalização, locação, transporte,
//     produção, equipe. É o que ela compra, monta, transporta e paga.
//
//   · CONTEXTO DO EVENTO → buffet, bar, espaço, assessoria, doces, som,
//     fotografia. A decoradora PRECISA saber quem são (para alinhar horário de
//     montagem, ponto de energia, layout), e por isso continuam podendo ser
//     cadastrados. Mas as tarefas internas deles não são pendências dela, e o
//     dinheiro deles não passa pelo caixa dela.
//
// ── A REGRA DO DESCONHECIDO ─────────────────────────────────────────────────
// Categoria é TEXTO LIVRE no schema, de propósito. Uma decoradora que digita
// "Cenografia", "Neon" ou "Paisagismo" está falando da operação dela. Por isso
// o padrão é ESTAR NO ESCOPO: sair exige bater com a lista de contexto. O
// contrário — excluir por omissão — silenciaria o trabalho de quem usa uma
// palavra que não previmos.
// ─────────────────────────────────────────────────────────────────────────────

export type CategoriaFornecedor = { slug: string; label: string };

/**
 * Fornecedores DA OPERAÇÃO da decoradora.
 *
 * Ordem de uso no dia a dia, não alfabética: flores e mobiliário primeiro
 * porque são a maioria dos cadastros.
 */
export const CATEGORIAS_DA_DECORACAO: readonly CategoriaFornecedor[] = [
  { slug: "flores", label: "Flores" },
  { slug: "mobiliario", label: "Mobiliário" },
  { slug: "iluminacao_decorativa", label: "Iluminação decorativa" },
  { slug: "estruturas", label: "Estruturas e marcenaria" },
  { slug: "texteis", label: "Têxteis e mesa posta" },
  { slug: "materiais", label: "Materiais e insumos" },
  { slug: "personalizacao", label: "Gráfica e personalização" },
  { slug: "locacao_pecas", label: "Locação de peças" },
  { slug: "transporte", label: "Transporte e frete" },
  { slug: "producao", label: "Produção e equipe" },
] as const;

/**
 * Fornecedores DO EVENTO — do cliente, não da decoradora.
 *
 * Continuam cadastráveis: a decoradora alinha montagem, energia e layout com
 * eles. Só não viram pendência dela nem custo dela.
 */
export const CATEGORIAS_DO_EVENTO: readonly CategoriaFornecedor[] = [
  { slug: "buffet", label: "Buffet" },
  { slug: "bar", label: "Bar / Drinks" },
  { slug: "doces", label: "Doces e bolo" },
  { slug: "local", label: "Espaço / Local" },
  { slug: "assessoria", label: "Assessoria" },
  { slug: "som_ilum", label: "Som & Iluminação (evento)" },
  { slug: "foto_video", label: "Foto e vídeo" },
] as const;

export const TODAS_AS_CATEGORIAS: readonly CategoriaFornecedor[] = [
  ...CATEGORIAS_DA_DECORACAO,
  ...CATEGORIAS_DO_EVENTO,
];

function normalizar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Palavras que marcam um fornecedor como do EVENTO.
 *
 * Inclui os slugs e as formas que uma pessoa digita à mão. Comparadas sem
 * acento e sem caixa, porque o campo é livre e o demo já tem "Flores" e
 * "Mobiliário" com maiúscula ao lado de "buffet" minúsculo.
 */
const PALAVRAS_DO_EVENTO = new Set(
  [
    ...CATEGORIAS_DO_EVENTO.map((c) => c.slug),
    ...CATEGORIAS_DO_EVENTO.map((c) => c.label),
    "espaco",
    "locacao do espaco",
    "local do evento",
    "bar e drinks",
    "drinks",
    "open bar",
    "doces e bolo",
    "bolo",
    "confeitaria",
    "som",
    "som e iluminacao",
    "som e luz",
    "dj",
    "banda",
    "musica",
    "fotografia",
    "foto",
    "video",
    "cerimonial",
    "celebrante",
    "wedding planner",
  ].map(normalizar),
);

/**
 * A categoria descreve a operação DA DECORADORA?
 *
 * Sem categoria = sim. Categoria desconhecida = sim. Só sai quem bate com a
 * lista de contexto do evento — a exclusão exige reconhecimento explícito.
 */
export function ehEscopoDaDecoradora(categoria: string | undefined | null): boolean {
  if (!categoria?.trim()) return true;
  return !PALAVRAS_DO_EVENTO.has(normalizar(categoria));
}

/** O oposto, para quem lê melhor pela negativa (regra financeira). */
export function ehContextoDoEvento(categoria: string | undefined | null): boolean {
  return !ehEscopoDaDecoradora(categoria);
}

/** Só os fornecedores da operação da decoradora. */
export function fornecedoresDaDecoradora<T extends { category?: string }>(
  lista: readonly T[],
): T[] {
  return lista.filter((f) => ehEscopoDaDecoradora(f.category));
}

/** Rótulo legível. Categoria digitada à mão volta como veio — nunca "inválida". */
export function labelDaCategoria(slug: string | undefined): string {
  if (!slug) return "Sem categoria";
  return TODAS_AS_CATEGORIAS.find((c) => c.slug === slug)?.label ?? slug;
}
