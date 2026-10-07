import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { paraCentavos, recebimentosAtivos, usaRecebimentos, type Recebimento } from "./pagamentosDoEvento";

// ─────────────────────────────────────────────────────────────────────────────
// O DINHEIRO QUE ENTROU NO MÊS
//
// A "Receita do Mês" somava parcela QUITADA pelo VENCIMENTO: R$ 1.200
// recebidos em outubro de uma parcela de R$ 3.000 apareciam como R$ 0, e a
// parcela de novembro paga em outubro contava em novembro. A pergunta da
// decoradora é outra — "quanto entrou este mês?" — e a resposta é esta:
//
//  · Parcela com histórico de recebimentos: cada recebimento ATIVO conta na
//    data em que entrou, pelo valor que entrou (parcial inclusive). Anulado
//    não conta. A baixa da parcela é ignorada aqui — ela é DERIVADA desses
//    mesmos recebimentos, e somar as duas coisas contaria o dinheiro duas vezes.
//
//  · Lançamento antigo pago sem histórico: conta o valor inteiro na data do
//    pagamento (`paidAt`) e, quando ela nunca foi registrada, no vencimento —
//    a única data que existe. Nenhum dado antigo é alterado para isso.
//
// O mês é "AAAA-MM" do fuso do NEGÓCIO, escolhido por quem chama
// (`dataDoDiaNoFuso`); as datas de recebimento já são dias do negócio.
// ─────────────────────────────────────────────────────────────────────────────

export type LancamentoDeReceita = {
  _id: string;
  type: "income" | "expense";
  description: string;
  amount: number;
  date: string;
  isPaid: boolean;
  paidAt?: string;
  paymentMethod?: string;
  eventId?: string;
  recebimentos?: readonly Recebimento[];
};

export type EntradaDoMes = {
  transacaoId: string;
  descricao: string;
  eventId?: string;
  valorCentavos: number;
  /** "AAAA-MM-DD" — quando o dinheiro entrou. */
  data: string;
  forma?: string;
  /** De onde veio a data: um recebimento registrado, ou a baixa antiga. */
  origem: "recebimento" | "baixa_sem_historico";
};

export function entradasDoMes(lancamentos: readonly LancamentoDeReceita[], mes: string): EntradaDoMes[] {
  const entradas: EntradaDoMes[] = [];
  for (const t of lancamentos) {
    if (t.type !== "income") continue;
    if (usaRecebimentos(t)) {
      for (const r of recebimentosAtivos(t)) {
        if (r.data.slice(0, 7) !== mes) continue;
        entradas.push({
          transacaoId: t._id,
          descricao: t.description,
          eventId: t.eventId,
          valorCentavos: paraCentavos(r.valor),
          data: r.data.slice(0, 10),
          forma: r.forma,
          origem: "recebimento",
        });
      }
      continue;
    }
    if (!t.isPaid) continue;
    const data = (t.paidAt ?? t.date).slice(0, 10);
    if (data.slice(0, 7) !== mes) continue;
    entradas.push({
      transacaoId: t._id,
      descricao: t.description,
      eventId: t.eventId,
      valorCentavos: paraCentavos(t.amount),
      data,
      forma: t.paymentMethod,
      origem: "baixa_sem_historico",
    });
  }
  return entradas.sort((a, b) => b.data.localeCompare(a.data));
}

export function totalDoMesEmCentavos(entradas: readonly EntradaDoMes[]): number {
  return entradas.reduce((s, e) => s + e.valorCentavos, 0);
}

/**
 * As entradas do mês de UMA conta, lidas do banco. Um recebimento de outubro
 * pode estar numa parcela que vence em qualquer mês, então o corte por data
 * de vencimento não serve: lê as receitas da conta — por dono, como a lista de
 * eventos (`health.listCards`) — e a regra decide o mês.
 */
export async function lerEntradasDoMes(ctx: QueryCtx, userId: Id<"users">, mes: string) {
  const lancamentos = await ctx.db
    .query("transactions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return entradasDoMes(lancamentos, mes);
}
