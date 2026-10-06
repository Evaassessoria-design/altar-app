// ─────────────────────────────────────────────────────────────────────────────
// PAGAMENTOS DO EVENTO — A REGRA, EM CENTAVOS
//
// Regra pura, sem banco: `convex/financeiro.ts` chama ao gravar, e a tela do
// evento chama ao desenhar. Os dois lados usam a MESMA conta.
//
// ── O QUE JÁ EXISTIA, E O QUE FALTAVA ───────────────────────────────────────
// Cada parcela do cliente JÁ É uma linha de `transactions` (receita do
// evento). O que não existia era receber PARTE dela: `isPaid` é sim ou não, e
// a cliente que pagou R$ 2.000 de uma parcela de R$ 5.000 ficava ou "paga"
// (mentira) ou "em aberto por R$ 5.000" (outra mentira).
//
// Os recebimentos moram DENTRO da parcela (`transactions.recebimentos`), como
// os comprovantes já moravam. Não há tabela nova nem segundo financeiro.
//
// ── POR QUE CENTAVOS ────────────────────────────────────────────────────────
// `amount` é gravado em reais, já arredondado ao centavo (`lib/dinheiro.ts`).
// Aqui toda conta é feita em centavos INTEIROS: 1/3 de R$ 10.000 vira
// 333.333 + 333.333 + 333.334 centavos, e a soma bate exato. Em reais com
// ponto flutuante, ela não bate.
//
// ── A PARCELA ANTIGA ────────────────────────────────────────────────────────
// Parcela sem `recebimentos` foi baixada pelo fluxo de antes (`togglePaid`):
// `isPaid: true` vale o valor inteiro recebido, `false` vale zero. Nenhuma
// linha existente muda de significado.
// ─────────────────────────────────────────────────────────────────────────────

/** Um recebimento registrado numa parcela. Ver `transactions.recebimentos`. */
export type Recebimento = {
  id: string;
  /** Em reais, arredondado ao centavo — mesma unidade de `amount`. */
  valor: number;
  /** Dia civil em que o dinheiro entrou, "AAAA-MM-DD". */
  data: string;
  forma?: string;
  /** Comprovante deste recebimento, entre os `comprovantes` da parcela. */
  comprovanteStorageId?: string;
  registradoEm: string;
  /** Chave do envio — o mesmo envio repetido não vira dois recebimentos. */
  chave: string;
  /** Anulado = corrigido. Continua no histórico; deixa de contar. */
  anulacao?: { em: string; motivo: string };
};

export type ParcelaLike = {
  amount: number;
  isPaid: boolean;
  /** Vencimento. */
  date: string;
  recebimentos?: readonly Recebimento[];
};

/** O que as contas de valor precisam: sem vencimento. */
export type ValorDaParcela = Pick<ParcelaLike, "amount" | "isPaid" | "recebimentos">;

export type EstadoDaParcela = "pendente" | "parcial" | "recebida";

/** Reais (já no centavo) → centavos inteiros. `NaN` vira 0, nunca contamina a soma. */
export function paraCentavos(reais: number): number {
  return Number.isFinite(reais) ? Math.round(reais * 100) : 0;
}

/** Centavos inteiros → reais. */
export function deCentavos(centavos: number): number {
  return centavos / 100;
}

/** Os recebimentos que contam: os não anulados. */
export function recebimentosAtivos(p: ValorDaParcela): Recebimento[] {
  return (p.recebimentos ?? []).filter((r) => !r.anulacao);
}

/** A parcela usa o fluxo de recebimentos (já teve algum, mesmo anulado)? */
export function usaRecebimentos(p: ValorDaParcela): boolean {
  return (p.recebimentos?.length ?? 0) > 0;
}

/** Quanto entrou nesta parcela, em centavos. */
export function recebidoEmCentavos(p: ValorDaParcela): number {
  if (!usaRecebimentos(p)) return p.isPaid ? paraCentavos(p.amount) : 0;
  return recebimentosAtivos(p).reduce((s, r) => s + paraCentavos(r.valor), 0);
}

/** Quanto falta, em centavos. Nunca negativo. */
export function saldoEmCentavos(p: ValorDaParcela): number {
  return Math.max(0, paraCentavos(p.amount) - recebidoEmCentavos(p));
}

/** Pendente, parcialmente recebida ou recebida. */
export function estadoDaParcela(p: ValorDaParcela): EstadoDaParcela {
  const recebido = recebidoEmCentavos(p);
  if (saldoEmCentavos(p) === 0 && paraCentavos(p.amount) > 0) return "recebida";
  return recebido > 0 ? "parcial" : "pendente";
}

/**
 * Atrasada: tem saldo e o vencimento já passou — INCLUSIVE a parcialmente
 * recebida. Vencer HOJE não é atraso: o dia ainda não acabou (mesma regra de
 * `lib/dinheiroVencido.ts`).
 *
 * `hoje` vem de quem chama, e é de propósito: a tela passa o dia no fuso do
 * aparelho (`hojeDateKey`), o servidor passa `dataDoDia()` (UTC). Ver
 * `convex/lib/dataDoDia.ts` sobre a diferença depois das 21h.
 */
export function parcelaAtrasada(p: ParcelaLike, hoje: string): boolean {
  return saldoEmCentavos(p) > 0 && dataValida(p.date) && p.date.slice(0, 10) < hoje.slice(0, 10);
}

/**
 * `isPaid` e `paidAt` DERIVADOS dos recebimentos.
 *
 * Eles continuam gravados porque o resto do ALTAR lê os dois (Dashboard,
 * Financeiro, o índice de vencidos). Para não divergirem, só esta função os
 * escreve quando a parcela usa recebimentos.
 *
 * `paidAt` é a data do recebimento mais recente: a parcela ficou quitada
 * quando entrou o último dinheiro, não quando o primeiro entrou.
 */
export function baixaDerivada(p: ValorDaParcela): { isPaid: boolean; paidAt: string | undefined } {
  const quitada = saldoEmCentavos(p) === 0 && paraCentavos(p.amount) > 0;
  if (!quitada) return { isPaid: false, paidAt: undefined };
  const datas = recebimentosAtivos(p).map((r) => r.data).sort();
  return { isPaid: true, paidAt: datas[datas.length - 1] };
}

/** "AAAA-MM-DD" de verdade (mês 1–12, dia que existe naquele mês). */
export function dataValida(data: string | undefined): data is string {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(data)) return false;
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * A mesma data `n` meses depois, segurando o dia no fim do mês quando ele não
 * existe: 31/01 + 1 mês = 28/02 (ou 29/02), nunca 03/03.
 */
export function somarMeses(data: string, n: number): string {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

export type ParcelaPlanejada = { descricao: string; valorCentavos: number; vencimento: string };

/**
 * A prévia do parcelamento: entrada opcional + N parcelas mensais.
 *
 * O arredondamento é DISTRIBUÍDO: os centavos que sobram da divisão vão um
 * para cada parcela, das primeiras para as últimas, e a soma é exata. Jogar a
 * sobra toda na última parcela também fecharia a conta, mas uma parcela de
 * R$ 3.333,35 entre duas de R$ 3.333,33 parece erro de digitação.
 */
export function planejarParcelas(opcoes: {
  totalCentavos: number;
  entrada?: { valorCentavos: number; vencimento: string } | null;
  quantidade: number;
  primeiroVencimento: string;
}): ParcelaPlanejada[] {
  const { totalCentavos, entrada, quantidade, primeiroVencimento } = opcoes;
  const plano: ParcelaPlanejada[] = [];
  let restante = totalCentavos;
  if (entrada && entrada.valorCentavos > 0) {
    plano.push({ descricao: "Entrada", valorCentavos: entrada.valorCentavos, vencimento: entrada.vencimento });
    restante -= entrada.valorCentavos;
  }
  if (quantidade <= 0 || restante <= 0) return plano;
  const base = Math.floor(restante / quantidade);
  const sobra = restante - base * quantidade;
  for (let i = 0; i < quantidade; i++) {
    plano.push({
      descricao: `Parcela ${i + 1}/${quantidade}`,
      valorCentavos: base + (i < sobra ? 1 : 0),
      vencimento: somarMeses(primeiroVencimento, i),
    });
  }
  return plano;
}

export type ResumoDosPagamentos = {
  /** `null` = valor contratado não definido. A tela diz isso; não inventa. */
  contratadoCentavos: number | null;
  parceladoCentavos: number;
  recebidoCentavos: number;
  /**
   * O que falta receber. Com valor contratado: contratado − recebido. Sem
   * ele: o saldo das parcelas lançadas — e `baseDoSaldo` diz qual das duas.
   */
  saldoCentavos: number;
  baseDoSaldo: "contratado" | "parcelas";
  vencidoCentavos: number;
  parcelasVencidas: number;
  /** Contratado − parcelado. Positivo = falta parcelar; negativo = parcelou a mais. */
  diferencaDoPlanoCentavos: number | null;
  /** A próxima parcela com saldo que ainda não venceu. */
  proxima: { vencimento: string; saldoCentavos: number; indice: number } | null;
};

/** O quadro do evento: contratado, recebido, saldo, vencido e a próxima. */
export function resumirPagamentos(
  contratado: number | undefined | null,
  parcelas: readonly ParcelaLike[],
  hoje: string,
): ResumoDosPagamentos {
  const contratadoCentavos =
    typeof contratado === "number" && Number.isFinite(contratado) ? paraCentavos(contratado) : null;
  const parceladoCentavos = parcelas.reduce((s, p) => s + paraCentavos(p.amount), 0);
  const recebidoCentavos = parcelas.reduce((s, p) => s + recebidoEmCentavos(p), 0);
  const saldoDasParcelas = parcelas.reduce((s, p) => s + saldoEmCentavos(p), 0);
  const vencidas = parcelas.filter((p) => parcelaAtrasada(p, hoje));

  let proxima: ResumoDosPagamentos["proxima"] = null;
  parcelas.forEach((p, indice) => {
    if (saldoEmCentavos(p) === 0 || parcelaAtrasada(p, hoje) || !dataValida(p.date)) return;
    if (!proxima || p.date < proxima.vencimento) {
      proxima = { vencimento: p.date.slice(0, 10), saldoCentavos: saldoEmCentavos(p), indice };
    }
  });

  return {
    contratadoCentavos,
    parceladoCentavos,
    recebidoCentavos,
    saldoCentavos:
      contratadoCentavos === null ? saldoDasParcelas : Math.max(0, contratadoCentavos - recebidoCentavos),
    baseDoSaldo: contratadoCentavos === null ? "parcelas" : "contratado",
    vencidoCentavos: vencidas.reduce((s, p) => s + saldoEmCentavos(p), 0),
    parcelasVencidas: vencidas.length,
    diferencaDoPlanoCentavos: contratadoCentavos === null ? null : contratadoCentavos - parceladoCentavos,
    proxima,
  };
}
