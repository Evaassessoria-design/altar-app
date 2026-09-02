import { normalizeName } from "./supplierIdentity";

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAIS — vocabulário e identidade do catálogo.
//
// Um material é o INSUMO de que a decoração é feita: rosa branca, eucalipto,
// vaso cilíndrico 25cm, vela palito, tecido cru, castiçal, cabo de aço.
//
// ── O QUE UM MATERIAL NÃO É ─────────────────────────────────────────────────
// Não é item de montagem (`assemblyItems` — "arranjo baixo na mesa 4"), não é
// compra (`purchaseItems` — "comprei 200 rosas da Flora Bela") e não é
// lançamento (`transactions` — o livro-caixa). O material é o VOCABULÁRIO que
// esses três usam para falar da mesma coisa.
//
// ── POR QUE NÃO É "FLORICULTURA" ────────────────────────────────────────────
// A tentação, num sistema de decoração, é modelar flor. Mas a mesma conta vale
// para metros de tecido, chapas de madeira, velas, castiçais e cabos. Por isso
// aqui não existe "haste" privilegiada: unidade é uma lista aberta e o tipo
// diz o que acontece com o material DEPOIS do evento, não o que ele é.
// ─────────────────────────────────────────────────────────────────────────────

// ── UNIDADES ────────────────────────────────────────────────────────────────
// Lista fechada de propósito: unidade digitada livremente vira "un", "und",
// "unid" e "unidade" no mesmo catálogo, e aí o consolidado não consegue somar
// nada com segurança. Cinco variações do mesmo insumo é pior que uma opção
// faltando — e acrescentar uma opção aqui é uma linha.
export const UNIDADES = [
  { valor: "un", rotulo: "Unidade", decimal: false },
  { valor: "haste", rotulo: "Haste", decimal: false },
  { valor: "maco", rotulo: "Maço", decimal: false },
  { valor: "duzia", rotulo: "Dúzia", decimal: false },
  { valor: "caixa", rotulo: "Caixa", decimal: false },
  { valor: "pacote", rotulo: "Pacote", decimal: false },
  { valor: "rolo", rotulo: "Rolo", decimal: false },
  { valor: "m", rotulo: "Metro", decimal: true },
  { valor: "m2", rotulo: "Metro quadrado", decimal: true },
  { valor: "kg", rotulo: "Quilo", decimal: true },
  { valor: "l", rotulo: "Litro", decimal: true },
] as const;

export type Unidade = (typeof UNIDADES)[number]["valor"];

/** Rótulo da unidade. Valor desconhecido volta como veio — nada é inventado. */
export function rotuloDaUnidade(valor: string | undefined | null): string {
  if (!valor) return "";
  return UNIDADES.find((u) => u.valor === valor)?.rotulo ?? valor;
}

/** Unidade que aceita fração (2,5 metros de tecido faz sentido; 2,5 vasos não). */
export function aceitaDecimal(valor: string | undefined | null): boolean {
  return UNIDADES.find((u) => u.valor === valor)?.decimal ?? false;
}

/**
 * A unidade é INDIVISÍVEL de forma conhecida? (não existe meia rosa)
 *
 * Diferente de `!aceitaDecimal`: unidade DESCONHECIDA não é "indivisível", é
 * "não sei". E arredondar o que não se conhece inventa uma regra de negócio
 * que ninguém validou — melhor mostrar 110,25 do que comprar 111 por conta
 * própria. Só existe para valor corrompido: o schema aceita só a lista acima.
 */
export function ehIndivisivel(valor: string | undefined | null): boolean {
  const unidade = UNIDADES.find((u) => u.valor === valor);
  return unidade ? !unidade.decimal : false;
}

/** Abreviação para a tela: "185 haste", "2,5 m". */
export function abreviarUnidade(valor: string | undefined | null): string {
  if (!valor) return "";
  return valor === "m2" ? "m²" : valor;
}

// ── TIPO DE MATERIAL ────────────────────────────────────────────────────────
// O tipo responde UMA pergunta: o que acontece com este material depois do
// evento? É essa resposta que a operação precisa — não a natureza física.
//
//   consumivel        some (flor, fita, espuma floral)
//   reutilizavel      volta para o acervo (vaso, castiçal)
//   locacao           volta para o fornecedor (mobiliário alugado)
//   compra_especifica comprado para ESTE evento; depois vira acervo ou sai
//
// NÃO é estoque: aqui não há saldo, movimentação nem patrimônio. É só a
// classificação que permite a Folha de Carregamento saber o que espera de
// volta — e a Ficha Técnica saber o que não precisa virar compra.
export const TIPOS_DE_MATERIAL = [
  {
    valor: "consumivel",
    rotulo: "Consumível",
    detalhe: "Acaba no evento — flores, fitas, espuma",
    retornavel: false,
    precisaComprar: true,
  },
  {
    valor: "reutilizavel",
    rotulo: "Acervo próprio",
    detalhe: "Volta para o galpão — vasos, castiçais",
    retornavel: true,
    precisaComprar: false,
  },
  {
    valor: "locacao",
    rotulo: "Locação",
    detalhe: "Volta para o fornecedor — mobiliário alugado",
    retornavel: true,
    precisaComprar: false,
  },
  {
    valor: "compra_especifica",
    rotulo: "Compra para o evento",
    detalhe: "Comprado especialmente para este projeto",
    retornavel: false,
    precisaComprar: true,
  },
] as const;

export type TipoDeMaterial = (typeof TIPOS_DE_MATERIAL)[number]["valor"];

type MaterialLike = { tipo?: string };

/**
 * Tipo efetivo. AUSENTE = `consumivel`.
 *
 * É o padrão seguro: um material sem classificação NÃO é prometido como
 * retornável (a equipe não sai procurando no caminhão o que nunca voltou) e
 * ENTRA na lista de compras, que é onde a decoradora quer revisar.
 */
export function tipoEfetivo(material: MaterialLike): TipoDeMaterial {
  const encontrado = TIPOS_DE_MATERIAL.find((t) => t.valor === material.tipo);
  return encontrado ? encontrado.valor : "consumivel";
}

export function metaDoTipo(tipo: TipoDeMaterial) {
  return TIPOS_DE_MATERIAL.find((t) => t.valor === tipo)!;
}

/** Espera-se de volta depois do evento? Ponte com a Folha de Carregamento. */
export function ehRetornavel(material: MaterialLike): boolean {
  return metaDoTipo(tipoEfetivo(material)).retornavel;
}

/**
 * Normalmente vira compra?
 *
 * Vaso do acervo NÃO vira: ele já é da empresa. Isso não proíbe comprar —
 * a decoradora pode gerar a compra mesmo assim; só não entra por padrão.
 */
export function normalmenteVeraCompra(material: MaterialLike): boolean {
  return metaDoTipo(tipoEfetivo(material)).precisaComprar;
}

// ── IDENTIDADE E DEDUPLICAÇÃO ───────────────────────────────────────────────
// Mesmo princípio já provado no catálogo de fornecedores
// (lib/supplierIdentity.ts, cuja `normalizeName` é reaproveitada aqui em vez
// de reescrita): em caso de dúvida, PREFERIR DUPLICIDADE a fundir coisas
// diferentes. Fundir é irreversível; duplicar a decoradora resolve depois.
//
// "Rosa Avalanche" e "Rosa branca" são materiais DIFERENTES e nada aqui vai
// aproximá-los: só colidem nomes que normalizam para exatamente o mesmo texto.

/**
 * Chave de deduplicação de um material dentro de UMA empresa.
 *
 * Nome normalizado + unidade. A unidade entra na chave de propósito: "rosa
 * branca" em haste e "rosa branca" em maço são compras diferentes, com preços
 * diferentes, e somá-las no consolidado seria mentira aritmética.
 *
 * `null` quando não há nome — aí não há identidade, e o cadastro é próprio.
 */
export function chaveDoMaterial(
  nome: string | undefined | null,
  unidade: string | undefined | null,
): string | null {
  const normalizado = normalizeName(nome);
  if (!normalizado) return null;
  return `${normalizado}|${(unidade ?? "").trim().toLowerCase()}`;
}

/** Os dois cadastros são seguramente o mesmo material? Nunca por semelhança. */
export function ehMesmoMaterial(
  a: { nome?: string | null; unidade?: string | null },
  b: { nome?: string | null; unidade?: string | null },
): boolean {
  const chaveA = chaveDoMaterial(a.nome, a.unidade);
  const chaveB = chaveDoMaterial(b.nome, b.unidade);
  if (chaveA === null || chaveB === null) return false;
  return chaveA === chaveB;
}

export { normalizeName };
