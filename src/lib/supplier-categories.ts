// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIAS DE FORNECEDOR
//
// ── O QUE MUDOU E POR QUÊ ───────────────────────────────────────────────────
// A lista original era de assessoria: assessoria, local, buffet, bar, doces,
// som & iluminação. NENHUMA categoria de decoração — a decoradora não tinha
// onde cadastrar o fornecedor de flores, de mobiliário ou de marcenaria, que é
// justamente a operação dela.
//
// Agora a lista vem de `convex/lib/escopoDecoradora.ts`, dividida em dois
// grupos: a OPERAÇÃO DELA e os fornecedores do EVENTO (contexto). Os do evento
// continuam cadastráveis — a decoradora alinha montagem, energia e layout com o
// buffet e o espaço. Só não viram pendência dela no Dashboard nem custo dela no
// financeiro.
//
// A categoria continua TEXTO LIVRE no schema, de propósito: quem digita
// "Cenografia" ou "Neon" está falando da própria operação, e a função de
// rótulo devolve o valor como veio — nunca "inválido".
// ─────────────────────────────────────────────────────────────────────────────

export {
  CATEGORIAS_DA_DECORACAO,
  CATEGORIAS_DO_EVENTO,
  ehEscopoDaDecoradora,
  labelDaCategoria,
  type CategoriaFornecedor,
} from "@/convex/lib/escopoDecoradora.ts";

import {
  TODAS_AS_CATEGORIAS,
  labelDaCategoria as rotulo,
} from "@/convex/lib/escopoDecoradora.ts";

/** Compatibilidade: a lista completa, na ordem em que aparece no seletor. */
export const SUPPLIER_CATEGORIES = TODAS_AS_CATEGORIAS;
export type SupplierCategory = (typeof TODAS_AS_CATEGORIAS)[number];

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
    [f.companyName, f.contactName, f.phone, f.city, rotulo(f.category)]
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
