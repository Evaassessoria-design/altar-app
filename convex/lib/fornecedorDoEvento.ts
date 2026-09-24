import type { Doc } from "../_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// O FORNECEDOR NO EVENTO — O QUE É DELE E O QUE É DAQUELE CASAMENTO
//
// ── A CONTRADIÇÃO QUE ESTE MÓDULO RESOLVE ───────────────────────────────────
// O schema afirma, em `eventSuppliers.supplierId`:
//
//   "as telas leem daqui e só consultam o catálogo quando há vínculo"
//
// A segunda metade da frase nunca foi verdade. `suppliers.listByEvent` lia
// `eventSuppliers` e ponto — o catálogo não era consultado nem quando o
// vínculo existia. Na prática: a decoradora corrigia o telefone da
// floricultura no catálogo e o número velho continuava em todos os eventos,
// inclusive nos que ainda vão acontecer. Ela ligava para o número errado.
//
// ── A LINHA, E POR QUE ELA CAI AQUI ─────────────────────────────────────────
// IDENTIDADE é como se fala com ele e como ele se apresenta. Muda uma vez e
// passa a valer em todo lugar: um telefone antigo não é histórico, é um
// telefone errado.
//
//   contactName · phone · email · instagram · website
//   address · city · state · logoStorageId
//
// COMBINADO é o que aconteceu NAQUELE evento. Muda por evento e NÃO pode ser
// reescrito pelo catálogo, senão o registro do casamento de junho passa a
// dizer o que foi negociado em dezembro:
//
//   category · status · alignments · nextAction · operational
//   notes · commercialInfo · bankInfo · differentials · favorite · order
//
// `bankInfo` fica do lado do combinado de propósito: "para qual conta eu
// paguei este evento" é registro do que foi feito, e mudar isso para trás
// apagaria a rastreabilidade de um pagamento já efetuado.
//
// ── NÃO É SINCRONIZAÇÃO ─────────────────────────────────────────────────────
// Nada é copiado, nada é gravado nos dois lugares e não há sentido inverso
// automático. A LEITURA prefere o catálogo; a cópia no evento continua no
// banco como FALLBACK — vínculos anteriores ao catálogo, campos que o catálogo
// não tem preenchidos, e o dia em que alguém quiser saber o que estava
// gravado ali. Nada é destruído.
// ─────────────────────────────────────────────────────────────────────────────

/** Os campos que pertencem ao FORNECEDOR, não ao evento. */
export const CAMPOS_DE_IDENTIDADE = [
  "contactName",
  "phone",
  "email",
  "instagram",
  "website",
  "address",
  "city",
  "state",
  "logoStorageId",
] as const;

export type CampoDeIdentidade = (typeof CAMPOS_DE_IDENTIDADE)[number];

type Identidade = Partial<Pick<Doc<"eventSuppliers">, CampoDeIdentidade>>;

/** Texto que não diz nada não deve vencer um texto que diz. */
const vazio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim());

/**
 * A identidade que a tela deve mostrar.
 *
 * O catálogo manda CAMPO A CAMPO, e não em bloco: um catálogo com o telefone
 * preenchido e o Instagram vazio não pode apagar o Instagram que estava
 * gravado no evento. Essa era a diferença entre "corrigir o telefone" e
 * "perder metade do cadastro ao vincular".
 *
 * `companyName` fica FORA de propósito: renomear a empresa no catálogo não
 * pode reescrever o nome que saiu no Caderno impresso de um evento passado.
 * É a mesma razão de `assemblyItems.supplierName` existir.
 */
export function identidadeDoFornecedor(
  doEvento: Identidade,
  doCatalogo: Identidade | null | undefined,
): Identidade {
  if (!doCatalogo) return {};
  const resolvida: Identidade = {};
  for (const campo of CAMPOS_DE_IDENTIDADE) {
    const preferida = doCatalogo[campo];
    if (!vazio(preferida)) {
      (resolvida as Record<string, unknown>)[campo] = preferida;
    } else if (!vazio(doEvento[campo])) {
      (resolvida as Record<string, unknown>)[campo] = doEvento[campo];
    }
  }
  return resolvida;
}

/** Este campo é do fornecedor (e portanto do catálogo, quando há vínculo)? */
export function ehIdentidade(campo: string): campo is CampoDeIdentidade {
  return (CAMPOS_DE_IDENTIDADE as readonly string[]).includes(campo);
}

/**
 * Separa um patch vindo da tela em "vai para o catálogo" e "fica no evento".
 *
 * Sem isto, corrigir o telefone na tela do evento gravava no evento — e o
 * catálogo, que é onde os OUTROS eventos leem, continuava errado. A correção
 * precisava ser feita duas vezes, e ninguém faz duas vezes.
 *
 * Só se aplica quando há vínculo. Sem vínculo não existe outro lugar, e tudo
 * continua indo para o evento exatamente como antes.
 */
export function separarPatch<T extends Record<string, unknown>>(
  campos: T,
): { paraOCatalogo: Partial<T>; paraOEvento: Partial<T> } {
  const paraOCatalogo: Record<string, unknown> = {};
  const paraOEvento: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    (ehIdentidade(chave) ? paraOCatalogo : paraOEvento)[chave] = valor;
  }
  return { paraOCatalogo: paraOCatalogo as Partial<T>, paraOEvento: paraOEvento as Partial<T> };
}
