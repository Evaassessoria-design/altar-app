// ─────────────────────────────────────────────────────────────────────────────
// DINHEIRO — o que o Financeiro aceita gravar, e como soma
//
// Regra pura, sem banco: `convex/financeiro.ts` chama na gravação e nas somas.
//
// ── O QUE ISTO IMPEDE ───────────────────────────────────────────────────────
// `addTransaction` recebia `v.number()` e gravava o que viesse. A tela manda
// `parseFloat(campo)`, e `parseFloat` devolve `NaN` para qualquer coisa que
// não comece com número. Um único lançamento com `NaN` não estraga só a
// própria linha: TODAS as somas do Financeiro passam a ser `NaN`, para sempre,
// porque `NaN + qualquer coisa` é `NaN`. A decoradora abre a tela e lê
// "R$ NaN" em receita, despesa, lucro e a previsão — sem nenhuma pista de qual
// linha causou.
//
// Valor negativo é o mesmo problema mais silencioso: uma "receita" de -500
// diminui o total e a soma continua parecendo legítima. O sinal já é dado pelo
// TIPO do lançamento (receita ou despesa); repeti-lo no valor é contar duas
// vezes.
//
// ── POR QUE ARREDONDAR EM VEZ DE RECUSAR ────────────────────────────────────
// Um contrato dividido em três parcelas dá 1/3 de um valor, e refusar
// "1666,666..." travaria a decoradora numa conta que o próprio sistema fez. O
// valor entra arredondado ao centavo, que é a unidade em que dinheiro existe.
//
// ── POR QUE A SOMA TAMBÉM ARREDONDA ─────────────────────────────────────────
// `0.1 + 0.2` é `0.30000000000000004` em qualquer linguagem com ponto
// flutuante. Somando cem lançamentos, a sobra aparece — e um lucro de
// "R$ 0,00" exibido como "R$ 0,01" não é erro de tela, é a soma.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Teto de um lançamento: um bilhão de reais.
 *
 * Não existe para proteger o banco — existe porque um número desses é sempre
 * erro de digitação (um zero a mais repetido), e gravá-lo faz a decoradora
 * desconfiar do produto inteiro ao ver o painel.
 */
export const VALOR_MAXIMO = 1_000_000_000;

/** Valor gravável: número real, não negativo, dentro do teto. */
export function valorMonetarioValido(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0 && valor <= VALOR_MAXIMO;
}

/**
 * O valor como ele é gravado: arredondado ao centavo.
 *
 * `Math.round(x * 100) / 100` sobre um valor já sujo de ponto flutuante pode
 * errar a última casa (`1.005 * 100` é `100.49999...`). O desvio é corrigido
 * antes do arredondamento, que é o que `toFixed` faz por dentro.
 */
export function emCentavos(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.round(Number((valor * 100).toFixed(6))) / 100;
}

/** Recado humano para o valor recusado. `null` quando ele passa. */
export function motivoDoValorInvalido(valor: number): string | null {
  if (!Number.isFinite(valor)) return "Informe um valor em reais.";
  if (valor < 0) {
    // Não é "valor inválido": ela quis dizer algo, e o produto sabe o quê.
    return "O valor não pode ser negativo. Para registrar uma saída, escolha Despesa.";
  }
  if (valor > VALOR_MAXIMO) return "Esse valor parece ter um zero a mais. Confira.";
  return null;
}

/** Soma que não acumula sobra de ponto flutuante. */
export function somaEmDinheiro(valores: readonly number[]): number {
  return emCentavos(valores.reduce((s, v) => s + emCentavos(v), 0));
}
