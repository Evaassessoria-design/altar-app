import { paraCentavos, recebimentosAtivos, saldoEmCentavos, usaRecebimentos, type Recebimento } from "./pagamentosDoEvento";

// ─────────────────────────────────────────────────────────────────────────────
// O EXTRATO — O QUE ENTROU E O QUE SAIU, NO DIA EM QUE ACONTECEU
//
// ── DE ONDE VEM CADA DINHEIRO (auditado em 14/10) ───────────────────────────
// Não existe tabela de recebimentos. Tudo é `transactions`:
//
//  · `date` é o VENCIMENTO. Nunca é usado como data de pagamento aqui.
//  · Parcela com `recebimentos[]`: cada recebimento tem `data` (o dia em que
//    entrou), `valor`, `forma`, comprovante e, se foi corrigido, `anulacao`.
//    Anulado não conta. A baixa da parcela (`isPaid`/`paidAt`) é DERIVADA
//    desses recebimentos — somar as duas contaria o dinheiro duas vezes.
//  · Lançamento sem histórico, pago: o valor inteiro, em `paidAt` ("AAAA-MM-DD",
//    dia do negócio). Quando `paidAt` nunca foi registrado, o banco NÃO sabe
//    quando o dinheiro entrou: o lançamento vai para "pagos sem data
//    registrada", FORA dos totais, em vez de fingir que foi no vencimento.
//    (A "Receita do Mês" do Dashboard usa o vencimento nesse caso; o extrato
//    não, porque é documento para guardar.)
//  · Despesa: mesma regra, saída em vez de entrada.
//
// ── O QUE O EXTRATO NÃO É ───────────────────────────────────────────────────
// Não é saldo bancário: o ALTAR não tem saldo inicial nem conciliação. O
// "Resultado" é recebido menos pago NO PERÍODO, e o documento diz isso.
//
// ── PENDÊNCIAS ──────────────────────────────────────────────────────────────
// Critério único e escrito no documento: o que está EM ABERTO HOJE (saldo de
// parcela ainda não recebido, despesa não paga) com VENCIMENTO DENTRO DO
// PERÍODO. Ficam separadas da movimentação efetiva, com total próprio.
// ─────────────────────────────────────────────────────────────────────────────

export type LancamentoDoExtrato = {
  _id: string;
  type: "income" | "expense";
  description: string;
  category?: string;
  amount: number;
  date: string;
  isPaid: boolean;
  paidAt?: string;
  paymentMethod?: string;
  eventId?: string;
  recebimentos?: readonly Recebimento[];
  temComprovante?: boolean;
  fornecedor?: string;
};

export type FiltrosDoExtrato = {
  /** "AAAA-MM-DD", inclusive. */
  inicio: string;
  /** "AAAA-MM-DD", inclusive. */
  fim: string;
  /** "todos", "sem_evento" ou o id de um evento. */
  evento: string;
  tipo: "todos" | "receitas" | "despesas";
};

export type Movimento = {
  data: string;
  tipo: "entrada" | "saida";
  valorCentavos: number;
  descricao: string;
  categoria?: string;
  eventoId?: string;
  forma?: string;
  temComprovante: boolean;
  fornecedor?: string;
  transacaoId: string;
  /** Um recebimento registrado, ou a baixa de um lançamento sem histórico. */
  origem: "recebimento" | "baixa";
};

export type SemDataEfetiva = {
  transacaoId: string;
  tipo: "entrada" | "saida";
  valorCentavos: number;
  descricao: string;
  vencimento: string;
  eventoId?: string;
};

export type Pendencia = {
  transacaoId: string;
  tipo: "a_receber" | "a_pagar";
  vencimento: string;
  /** O que falta — numa parcela parcial, só o saldo. */
  valorCentavos: number;
  descricao: string;
  eventoId?: string;
  fornecedor?: string;
};

export type Extrato = {
  filtros: FiltrosDoExtrato;
  movimentos: Movimento[];
  totais: { recebidoCentavos: number; pagoCentavos: number; resultadoCentavos: number };
  pendencias: Pendencia[];
  totaisPendentes: { aReceberCentavos: number; aPagarCentavos: number };
  semDataEfetiva: SemDataEfetiva[];
  /** Quantos lançamentos foram lidos — para conferir que nada ficou de fora. */
  lancamentosLidos: number;
};

const diaDe = (v: string | undefined) => (v ?? "").slice(0, 10);
const noPeriodo = (dia: string, f: FiltrosDoExtrato) => dia.length === 10 && dia >= f.inicio && dia <= f.fim;

function passaNoFiltro(t: LancamentoDoExtrato, f: FiltrosDoExtrato): boolean {
  if (f.tipo === "receitas" && t.type !== "income") return false;
  if (f.tipo === "despesas" && t.type !== "expense") return false;
  if (f.evento === "todos") return true;
  if (f.evento === "sem_evento") return !t.eventId;
  return t.eventId === f.evento;
}

export function montarExtrato(lancamentos: readonly LancamentoDoExtrato[], f: FiltrosDoExtrato): Extrato {
  const movimentos: Movimento[] = [];
  const pendencias: Pendencia[] = [];
  const semDataEfetiva: SemDataEfetiva[] = [];

  for (const t of lancamentos) {
    if (!passaNoFiltro(t, f)) continue;
    const tipo = t.type === "income" ? "entrada" : "saida";

    if (usaRecebimentos(t)) {
      // Cada recebimento ATIVO no dia em que entrou, pelo valor que entrou.
      for (const r of recebimentosAtivos(t)) {
        const dia = diaDe(r.data);
        if (!noPeriodo(dia, f)) continue;
        movimentos.push({
          data: dia,
          tipo,
          valorCentavos: paraCentavos(r.valor),
          descricao: t.description,
          categoria: t.category,
          eventoId: t.eventId,
          forma: r.forma ?? undefined,
          temComprovante: !!r.comprovanteStorageId,
          fornecedor: t.fornecedor,
          transacaoId: t._id,
          origem: "recebimento",
        });
      }
    } else if (t.isPaid) {
      const dia = diaDe(t.paidAt);
      if (dia.length === 10) {
        if (noPeriodo(dia, f)) {
          movimentos.push({
            data: dia,
            tipo,
            valorCentavos: paraCentavos(t.amount),
            descricao: t.description,
            categoria: t.category,
            eventoId: t.eventId,
            forma: t.paymentMethod,
            temComprovante: !!t.temComprovante,
            fornecedor: t.fornecedor,
            transacaoId: t._id,
            origem: "baixa",
          });
        }
      } else if (noPeriodo(diaDe(t.date), f)) {
        // Pago, mas o banco não sabe quando. Fora dos totais, à vista.
        semDataEfetiva.push({
          transacaoId: t._id,
          tipo,
          valorCentavos: paraCentavos(t.amount),
          descricao: t.description,
          vencimento: diaDe(t.date),
          eventoId: t.eventId,
        });
      }
    }

    // Pendência: em aberto hoje, com vencimento no período.
    const aberto = usaRecebimentos(t) ? saldoEmCentavos(t) : t.isPaid ? 0 : paraCentavos(t.amount);
    if (aberto > 0 && noPeriodo(diaDe(t.date), f)) {
      pendencias.push({
        transacaoId: t._id,
        tipo: t.type === "income" ? "a_receber" : "a_pagar",
        vencimento: diaDe(t.date),
        valorCentavos: aberto,
        descricao: t.description,
        eventoId: t.eventId,
        fornecedor: t.fornecedor,
      });
    }
  }

  movimentos.sort((a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao));
  pendencias.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  semDataEfetiva.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const recebidoCentavos = movimentos.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.valorCentavos, 0);
  const pagoCentavos = movimentos.filter((m) => m.tipo === "saida").reduce((s, m) => s + m.valorCentavos, 0);
  return {
    filtros: f,
    movimentos,
    totais: { recebidoCentavos, pagoCentavos, resultadoCentavos: recebidoCentavos - pagoCentavos },
    pendencias,
    totaisPendentes: {
      aReceberCentavos: pendencias.filter((p) => p.tipo === "a_receber").reduce((s, p) => s + p.valorCentavos, 0),
      aPagarCentavos: pendencias.filter((p) => p.tipo === "a_pagar").reduce((s, p) => s + p.valorCentavos, 0),
    },
    semDataEfetiva,
    lancamentosLidos: lancamentos.length,
  };
}

// ── Períodos ────────────────────────────────────────────────────────────────

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** "2026-10" → 01/10/2026 a 31/10/2026. */
export function periodoDoMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split("-").map(Number);
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimoDiaDoMes(a, m)).padStart(2, "0")}` };
}

/**
 * Três meses TERMINANDO no mês escolhido: "2026-10" → 01/08/2026 a
 * 31/10/2026. As duas datas aparecem na tela antes de exportar.
 */
export function periodoDeTresMeses(mesFinal: string): { inicio: string; fim: string } {
  const [a, m] = mesFinal.split("-").map(Number);
  const inicio = new Date(Date.UTC(a, m - 3, 1));
  const mesInicial = `${inicio.getUTCFullYear()}-${String(inicio.getUTCMonth() + 1).padStart(2, "0")}`;
  return { inicio: `${mesInicial}-01`, fim: periodoDoMes(mesFinal).fim };
}

export function periodoValido(inicio: string, fim: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(inicio) && /^\d{4}-\d{2}-\d{2}$/.test(fim) && inicio <= fim;
}
