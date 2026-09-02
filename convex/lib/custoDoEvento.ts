// ─────────────────────────────────────────────────────────────────────────────
// O CUSTO DE UM EVENTO — QUAL É A FONTE DA VERDADE
//
// ── O QUE A AUDITORIA ENCONTROU ─────────────────────────────────────────────
// O dinheiro do evento vivia em TRÊS ilhas que nunca se falavam:
//
//   budgetItems    → o orçamento no papel (vendido e custo previsto)
//   transactions   → o financeiro: é ele que alimenta margem e Dashboard
//   purchaseItems  → as compras, com `unitPrice` e `quantity`
//
// As compras têm dinheiro e NÃO entravam em cálculo nenhum. A decoradora
// registrava R$ 12.000 em flores e mobiliário e a margem do evento seguia
// como se nada tivesse sido comprado. O valor aparecia solto no Resumo
// Operacional, ao lado da margem, sem participar dela.
//
// ── A DECISÃO: `transactions` É O LIVRO-CAIXA ───────────────────────────────
// Escolhida a arquitetura (A): a compra é OPERACIONAL, a transação é
// CONTÁBIL. Uma compra só vira custo no resultado quando existe uma transação
// ligada a ela.
//
// Por quê, e não o contrário:
//
//   1. NÃO PODE CONTAR DUAS VEZES, por construção. Somar compras + transações
//      duplicaria o custo de quem já lançava as duas coisas — e nada no
//      sistema impedia isso. O livro-caixa soma transações, uma vez.
//   2. `transactions` já É o livro-caixa de tudo: Financeiro, Dashboard,
//      margem, receita do mês. Trocar a fonte obrigaria a mexer em todos.
//   3. Compatível com o que existe: transação antiga continua válida; compra
//      antiga sem vínculo simplesmente ainda não está no livro — que é a
//      verdade de hoje, não uma regressão.
//   4. Rastreável: o vínculo (`transactionId`) diz exatamente qual lançamento
//      nasceu de qual compra.
//
// ── E O QUE NÃO FOI LANÇADO? ────────────────────────────────────────────────
// Uma compra com preço e SEM vínculo é dinheiro que saiu e não está no livro.
// Esconder isso produziria uma margem bonita e falsa. Em vez disso o resultado
// se declara INCOMPLETO e diz quanto falta lançar.
//
// "Custo real incompleto — R$ 12.400 em compras fora do financeiro"
// é melhor do que "Margem 37,42%" com metade das compras de fora.
// ─────────────────────────────────────────────────────────────────────────────

export type CompraParaCusto = {
  unitPrice?: number;
  quantity?: number;
  /** Situação efetiva já resolvida por quem chama (lib/purchaseStatus). */
  cancelada: boolean;
  /** Lançamento gerado a partir desta compra, quando existe. */
  transactionId?: string;
};

export type LancamentoParaCusto = {
  type: string;
  amount: number;
  isPaid: boolean;
};

/**
 * Valor de uma compra. Sem preço = zero, nunca `NaN`.
 *
 * Recebe só o que de fato usa (preço e quantidade) em vez de `CompraParaCusto`
 * inteiro: assim o `panoramaDeCompras`, que trabalha com o item cru do banco,
 * reaproveita a MESMA conta em vez de escrever outra.
 */
export function valorDaCompra(c: { unitPrice?: number; quantity?: number }): number {
  if (typeof c.unitPrice !== "number" || !Number.isFinite(c.unitPrice)) return 0;
  const qtd =
    typeof c.quantity === "number" && Number.isFinite(c.quantity) ? c.quantity : 1;
  return c.unitPrice * qtd;
}

/**
 * A compra tem dinheiro definido e AINDA NÃO virou lançamento no livro-caixa.
 *
 * Regra única, usada tanto pelo cálculo de custo quanto pelo panorama
 * operacional — duas telas que discordassem sobre "o que falta lançar" fariam
 * a decoradora não confiar em nenhuma das duas.
 *
 * Compra cancelada não é dinheiro que saiu; compra já lançada está no livro;
 * compra sem preço não tem o que lançar.
 */
export function foraDoLivro(c: CompraParaCusto): boolean {
  return !c.cancelada && !c.transactionId && valorDaCompra(c) > 0;
}

export type CustoDoEvento = {
  /** Vendido ao cliente — entradas do livro-caixa. */
  receita: number;
  /** Já recebido do que foi vendido. */
  recebido: number;
  /** Saídas lançadas, pagas ou não. É o custo que o livro conhece. */
  custoLancado: number;
  /** Saídas já liquidadas. */
  custoPago: number;
  /** Lançado menos pago: o que ainda falta pagar. */
  saldoAPagar: number;
  /** Compras com preço que AINDA NÃO viraram lançamento. */
  custoForaDoLivro: number;
  /** Quantas compras estão nessa situação. */
  comprasForaDoLivro: number;
  /**
   * O custo conhecido está completo?
   *
   * `false` quando existe compra com preço fora do livro — e aí nenhuma
   * margem deve ser apresentada como número fechado.
   */
  completo: boolean;
  /**
   * Receita menos custo lançado.
   *
   * `null` quando falta base (sem receita ou sem custo) OU quando o custo
   * está incompleto. Margem sobre metade das compras é pior que margem
   * nenhuma: a primeira engana, a segunda avisa.
   */
  margem: number | null;
  margemPercentual: number | null;
};

/**
 * O retrato financeiro do evento.
 *
 * Recebe os lançamentos (livro-caixa) e as compras (operação). As compras só
 * afetam o resultado por AUSÊNCIA: as que ainda não foram lançadas denunciam
 * que o custo conhecido está incompleto.
 */
export function custoDoEvento(
  lancamentos: readonly LancamentoParaCusto[],
  compras: readonly CompraParaCusto[],
): CustoDoEvento {
  const soma = (tipo: string, apenasPagos: boolean) =>
    lancamentos
      .filter((t) => t.type === tipo && (!apenasPagos || t.isPaid))
      .reduce((s, t) => s + t.amount, 0);

  const receita = soma("income", false);
  const custoLancado = soma("expense", false);
  const custoPago = soma("expense", true);

  const pendentesDeLancamento = compras.filter(foraDoLivro);
  const custoForaDoLivro = pendentesDeLancamento.reduce((s, c) => s + valorDaCompra(c), 0);

  const completo = custoForaDoLivro === 0;
  const temBase = receita > 0 && custoLancado > 0;
  const podeCalcularMargem = temBase && completo;

  return {
    receita,
    recebido: soma("income", true),
    custoLancado,
    custoPago,
    saldoAPagar: custoLancado - custoPago,
    custoForaDoLivro,
    comprasForaDoLivro: pendentesDeLancamento.length,
    completo,
    margem: podeCalcularMargem ? receita - custoLancado : null,
    margemPercentual: podeCalcularMargem
      ? Math.round(((receita - custoLancado) / receita) * 100)
      : null,
  };
}

/**
 * Por que a margem não está sendo mostrada — em português, para a tela.
 *
 * `null` quando a margem existe e pode ser exibida.
 */
export function motivoDaMargemAusente(c: CustoDoEvento): string | null {
  if (c.margem !== null) return null;
  if (!c.completo) {
    return c.comprasForaDoLivro === 1
      ? "1 compra ainda não foi lançada no financeiro"
      : `${c.comprasForaDoLivro} compras ainda não foram lançadas no financeiro`;
  }
  if (c.receita === 0) return "Nenhuma receita lançada ainda";
  return "Nenhum custo lançado ainda";
}
