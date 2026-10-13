// ─────────────────────────────────────────────────────────────────────────────
// TEXTO LIVRE SEM DINHEIRO
//
// O Caderno da equipe e o da cliente imprimiam texto livre do briefing como
// estava. Num caso real, "Notas Gerais" veio da leitura do contrato com:
//
//   "A estrutura para o bar, no valor de 2800, e o lounge adicional, no valor
//    de 2980, são opcionais e deverão ser contratados futuramente."
//
// e essa frase saía no PDF da EQUIPE. Sem "R$" — por isso esconder o símbolo
// nunca bastou. O que denuncia dinheiro é o contexto: "valor", "pago",
// "parcela", "orçamento", "reais".
//
// ── A REGRA ────────────────────────────────────────────────────────────────
// Texto livre não é fonte de valor em nenhum dos dois cadernos. O único
// dinheiro que um caderno pode levar é o valor ESTRUTURADO do opcional, só no
// da cliente e só quando ela marca "incluir valores" (ver `montar-caderno.ts`).
//
//  · Parágrafo: sai a FRASE que fala de dinheiro; o resto fica. Uma nota com
//    "as flores serão as da época" e "o saldo será pago na véspera" perde só a
//    segunda.
//  · Item de lista (pendência, legenda): sai o trecho de valor; se o que sobra
//    ainda fala de dinheiro ("Definir valor do bar"), sai a linha inteira.
//
// Errar para o lado de omitir é a escolha: uma frase a menos no papel se
// recupera abrindo o evento; um valor impresso na mão da equipe não volta.
// O que foi omitido é CONTADO, e a prévia diz quantos trechos ficaram de fora.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Palavras e formas que indicam dinheiro. Sem `\b` antes de "R$": o cifrão não
 * é caractere de palavra e a âncora falharia exatamente no caso mais óbvio.
 *
 * Fora de propósito: "entrada" sozinha (é ambiente — "arranjo da entrada") e
 * número com ponto de milhar sem contexto ("1.200 pétalas" é quantidade).
 */
const FALA_DE_DINHEIRO = new RegExp(
  [
    String.raw`R\s?\$`,
    String.raw`\bBRL\b`,
    // "reais" só depois de número: "flores reais" é adjetivo, não dinheiro.
    String.raw`\d[\d.,]*\s*(?:mil\s+)?reais\b`,
    String.raw`\bem\s+reais\b`,
    String.raw`\bvalor(?:es)?\b`,
    String.raw`\bpre[çc]os?\b`,
    String.raw`\bcust(?:o|os|ou|am|ar|a)\b`,
    String.raw`\bmargens?\b`,
    String.raw`\blucros?\b`,
    String.raw`\bpaga(?:r|mentos?|s|m|do|da)?\b`,
    String.raw`\bpago\b`,
    String.raw`\bparcel(?:a|as|ado|ada|amento)\b`,
    String.raw`\bsinal\s+de\b`,
    String.raw`\bentrada\s+de\s+(?:R\s?\$|\d)`,
    String.raw`\bsaldo\b`,
    String.raw`\bdescontos?\b`,
    String.raw`\bor[çc]ament(?:o|os|ado|ada)\b`,
    String.raw`\bor[çc]ad[oa]s?\b`,
    String.raw`\binvestimento\b`,
    String.raw`\bcobr(?:ar|ado|ada|an[çc]a|amos)\b`,
    String.raw`\bfatura`,
    String.raw`\bpix\b`,
    String.raw`\bboleto`,
    String.raw`\btaxas?\b`,
    String.raw`\b\d+(?:[.,]\d+)?\s?k\b`,
    String.raw`\b\d+\s?mil\b`,
  ].join("|"),
  "i",
);

/** O trecho que É o valor: "R$ 2.800,00", "2800 reais", "R$2,8 mil". */
const TRECHO_DE_VALOR =
  /R\s?\$\s?[\d.,]+(?:\s?mil)?|\b[\d.,]+\s?(?:mil\s+)?reais\b|\b\d+(?:[.,]\d+)?\s?k\b/gi;

export function falaDeDinheiro(texto: string | undefined | null): boolean {
  return !!texto && FALA_DE_DINHEIRO.test(texto);
}

export type TextoFiltrado = {
  /** `undefined` quando nada sobrou — a seção some, em vez de rótulo vazio. */
  texto?: string;
  /** Quantos trechos saíram por falar de dinheiro. */
  omitidos: number;
};

/**
 * Parágrafo sem as frases que falam de dinheiro.
 *
 * A divisão é por fim de frase SEGUIDO de espaço, e por quebra de linha:
 * "2.800" e "17/10" não quebram, porque o ponto não vem seguido de espaço.
 */
export function paragrafoSemValores(texto: string | undefined | null): TextoFiltrado {
  const t = texto?.trim();
  if (!t) return { omitidos: 0 };
  const frases = t
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter(Boolean);
  const ficam = frases.filter((f) => !falaDeDinheiro(f));
  const sobra = ficam.join(" ").trim();
  return { texto: sobra || undefined, omitidos: frases.length - ficam.length };
}

/**
 * Uma linha curta (pendência, legenda, observação de item) sem dinheiro.
 *
 * Primeiro tira o trecho de valor; se o que sobrou ainda fala de dinheiro, a
 * linha inteira sai. "Bolo cenográfico — R$ 300" vira "Bolo cenográfico";
 * "Definir o valor do bar" sai.
 */
export function linhaSemValores(texto: string | undefined | null): TextoFiltrado {
  const t = texto?.trim();
  if (!t) return { omitidos: 0 };
  if (!falaDeDinheiro(t)) return { texto: t, omitidos: 0 };
  const semTrecho = t
    .replace(TRECHO_DE_VALOR, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s*[—–-]\s*$/, "")
    .replace(/[,:;]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!semTrecho || falaDeDinheiro(semTrecho)) return { omitidos: 1 };
  return { texto: semTrecho, omitidos: 1 };
}

/**
 * Nome de item: nunca some (sumir um item da lista de montagem é pior do que
 * imprimir o nome sem o preço), só perde o trecho de valor.
 */
export function nomeSemValores(nome: string): TextoFiltrado {
  const t = nome.trim();
  if (!falaDeDinheiro(t)) return { texto: t, omitidos: 0 };
  const limpo = t
    .replace(TRECHO_DE_VALOR, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s*[—–-]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { texto: limpo || t.replace(TRECHO_DE_VALOR, "").trim() || "Item", omitidos: 1 };
}
