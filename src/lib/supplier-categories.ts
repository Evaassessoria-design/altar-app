// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIAS DE FORNECEDOR
//
// Os mesmos slugs que a tela de fornecedores do evento já grava em
// `eventSuppliers.category`. Extraído para um módulo próprio para que o
// Catálogo Central e a tela do evento falem exatamente a mesma língua — se
// cada uma tivesse a sua lista, um fornecedor cadastrado no catálogo apareceria
// como "categoria desconhecida" dentro do evento.
//
// A categoria é TEXTO LIVRE no schema (`v.string()`), de propósito: a tela do
// evento já permite digitar uma categoria fora da lista. Por isso a função de
// rótulo devolve o próprio valor quando não reconhece — nunca "inválido".
// ─────────────────────────────────────────────────────────────────────────────

export type SupplierCategory = { slug: string; label: string };

export const SUPPLIER_CATEGORIES: readonly SupplierCategory[] = [
  { slug: "assessoria", label: "Assessoria" },
  { slug: "local", label: "Local" },
  { slug: "buffet", label: "Buffet" },
  { slug: "bar", label: "Bar / Drinks" },
  { slug: "doces", label: "Doces" },
  { slug: "som_ilum", label: "Som & Iluminação" },
] as const;

/** Rótulo legível. Categoria digitada à mão volta como veio. */
export function labelDaCategoria(slug: string | undefined): string {
  if (!slug) return "Sem categoria";
  return SUPPLIER_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

/**
 * Busca por nome, contato, telefone, cidade ou categoria.
 *
 * Ignora acento e caixa — quem procura "sao paulo" precisa achar "São Paulo".
 * Termo vazio devolve a lista inteira, para o campo de busca não esconder tudo
 * enquanto a pessoa ainda não digitou nada.
 */
export function filtrarFornecedores<
  T extends {
    companyName: string;
    contactName?: string;
    phone?: string;
    city?: string;
    category?: string;
  },
>(lista: readonly T[], termo: string): T[] {
  const alvo = normalizar(termo);
  if (!alvo) return [...lista];
  return lista.filter((f) =>
    [f.companyName, f.contactName, f.phone, f.city, labelDaCategoria(f.category)]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .some((campo) => normalizar(campo).includes(alvo)),
  );
}

function normalizar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
