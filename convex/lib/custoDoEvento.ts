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
  /**
   * Valor do lançamento vinculado, resolvido por quem lê o banco:
   *
   *   número  → o lançamento existe e vale isso;
   *   `null`  → o vínculo aponta para um lançamento que NÃO EXISTE MAIS;
   *   ausente → quem chamou não resolveu (só em código de teste — há um
   *             teste estrutural exigindo que todo consumidor real resolva).
   *
   * Sem este dado o vínculo mente em silêncio: a compra parece lançada, o
   * custo sumiu do livro, e a margem sai afirmada sobre um custo menor.
   */
  valorLancado?: number | null;
};

/**
 * Tolerância de comparação entre o valor da compra e o do lançamento.
 *
 * `unitPrice * quantity` é aritmética de ponto flutuante: `0.1 * 3` dá
 * `0.30000000000000004`. Comparar por igualdade acusaria divergência em
 * centenas de compras corretas. Meio centavo é a menor diferença que importa
 * para dinheiro.
 */
export const TOLERANCIA_EM_REAIS = 0.005;

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

/**
 * O vínculo aponta para um lançamento que não existe mais.
 *
 * Acontece quando a decoradora apaga a despesa no Financeiro. Antes disto ser
 * detectado, a compra continuava "lançada" para todos os efeitos: o custo
 * sumia do livro, `custoForaDoLivro` ficava zero e a margem era afirmada com
 * confiança sobre um custo menor do que o real.
 */
export function vinculoQuebrado(c: CompraParaCusto): boolean {
  return Boolean(c.transactionId) && c.valorLancado === null;
}

/**
 * Compra CANCELADA que ainda tem despesa viva no livro.
 *
 * O dinheiro não saiu, mas o lançamento continua lá reduzindo a margem. Não
 * apagamos sozinhos — o Financeiro é da decoradora — mas o resultado não pode
 * se declarar completo enquanto isso estiver de pé.
 */
export function canceladaComLancamento(c: CompraParaCusto): boolean {
  return c.cancelada && Boolean(c.transactionId) && typeof c.valorLancado === "number";
}

/**
 * A compra vale uma coisa e o lançamento dela vale outra.
 *
 * Acontece ao corrigir preço ou quantidade DEPOIS de lançar: o vínculo
 * continua, mas o livro guarda o número velho. A margem sairia sobre o valor
 * antigo, com cara de exata. O conserto é lançar de novo — `registerCost` é
 * idempotente e reajusta o mesmo lançamento.
 */
export function valorDivergente(c: CompraParaCusto): boolean {
  if (c.cancelada || !c.transactionId) return false;
  if (typeof c.valorLancado !== "number") return false;
  return Math.abs(c.valorLancado - valorDaCompra(c)) >= TOLERANCIA_EM_REAIS;
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
  /** Vínculo apontando para lançamento apagado. */
  comprasComVinculoQuebrado: number;
  /** Compra cancelada com despesa ainda viva no livro. */
  comprasCanceladasComLancamento: number;
  /** Compra e lançamento com valores diferentes (preço mudou depois). */
  comprasComValorDivergente: number;
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

  // ── AS QUATRO MANEIRAS DE O CUSTO NÃO SER CONFIÁVEL ──────────────────────
  // Cada compra entra em NO MÁXIMO um balde, na ordem de gravidade — senão a
  // mesma compra apareceria em dois motivos e a mensagem contaria duas vezes.
  const quebrados: CompraParaCusto[] = [];
  const canceladasComDespesa: CompraParaCusto[] = [];
  const divergentes: CompraParaCusto[] = [];
  const pendentesDeLancamento: CompraParaCusto[] = [];

  for (const c of compras) {
    if (vinculoQuebrado(c)) quebrados.push(c);
    else if (canceladaComLancamento(c)) canceladasComDespesa.push(c);
    else if (valorDivergente(c)) divergentes.push(c);
    else if (foraDoLivro(c)) pendentesDeLancamento.push(c);
  }

  const custoForaDoLivro = pendentesDeLancamento.reduce((s, c) => s + valorDaCompra(c), 0);

  // Completo = o livro conhece o custo E o vínculo não está mentindo em
  // nenhuma das quatro formas. Basta uma para a margem se calar.
  const completo =
    custoForaDoLivro === 0 &&
    quebrados.length === 0 &&
    canceladasComDespesa.length === 0 &&
    divergentes.length === 0;
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
    comprasComVinculoQuebrado: quebrados.length,
    comprasCanceladasComLancamento: canceladasComDespesa.length,
    comprasComValorDivergente: divergentes.length,
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

  // Ordem de gravidade: o vínculo quebrado é o pior porque o custo SUMIU do
  // livro; os outros três ainda têm dinheiro rastreável em algum lugar.
  const plural = (n: number, um: string, muitos: string) =>
    n === 1 ? `1 ${um}` : `${n} ${muitos}`;

  if (c.comprasComVinculoQuebrado > 0) {
    return `${plural(
      c.comprasComVinculoQuebrado,
      "compra aponta para um lançamento apagado",
      "compras apontam para lançamentos apagados",
    )} — lance de novo no financeiro`;
  }
  if (c.comprasCanceladasComLancamento > 0) {
    return `${plural(
      c.comprasCanceladasComLancamento,
      "compra cancelada ainda tem despesa no financeiro",
      "compras canceladas ainda têm despesa no financeiro",
    )}`;
  }
  if (c.comprasComValorDivergente > 0) {
    return `${plural(
      c.comprasComValorDivergente,
      "compra mudou de valor depois de lançada",
      "compras mudaram de valor depois de lançadas",
    )} — lance de novo para atualizar`;
  }
  if (!c.completo) {
    return c.comprasForaDoLivro === 1
      ? "1 compra ainda não foi lançada no financeiro"
      : `${c.comprasForaDoLivro} compras ainda não foram lançadas no financeiro`;
  }
  if (c.receita === 0) return "Nenhuma receita lançada ainda";
  return "Nenhum custo lançado ainda";
}
