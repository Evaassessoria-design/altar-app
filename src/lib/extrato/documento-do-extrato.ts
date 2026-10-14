import type { Extrato } from "@/convex/lib/extrato.ts";
import { data, gerarXlsx, moeda, texto, type Planilha } from "./xlsx.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O EXTRATO PRONTO PARA PAPEL E PLANILHA
//
// PDF e Excel leem ESTE objeto — o mesmo extrato, as mesmas linhas, os mesmos
// totais. Uma regra aplicada só num dos dois faria o PDF guardado e a
// planilha de conferência discordarem, e ninguém saberia qual está certo.
// ─────────────────────────────────────────────────────────────────────────────

export type EventoDoExtrato = { name: string; clientName: string };

export type DocumentoDoExtrato = {
  empresa: string;
  periodo: string;
  filtros: string;
  emitidoEm: string;
  criterio: string;
  resumo: { rotulo: string; centavos: number; nota?: string }[];
  movimentos: {
    data: string;
    tipo: "Entrada" | "Saída";
    descricao: string;
    cliente?: string;
    evento?: string;
    fornecedor?: string;
    categoria?: string;
    forma?: string;
    entradaCentavos: number;
    saidaCentavos: number;
    comprovante: "Sim" | "Não";
  }[];
  pendencias: {
    vencimento: string;
    tipo: "A receber" | "A pagar";
    descricao: string;
    cliente?: string;
    evento?: string;
    fornecedor?: string;
    centavos: number;
  }[];
  semDataEfetiva: { vencimento: string; tipo: "Entrada" | "Saída"; descricao: string; evento?: string; centavos: number }[];
  totais: { recebidoCentavos: number; pagoCentavos: number; resultadoCentavos: number; aReceberCentavos: number; aPagarCentavos: number };
  lancamentosLidos: number;
};

export const CRITERIO_DO_EXTRATO =
  "Movimentações efetivas: receita na data em que foi recebida e despesa na data em que foi paga, pelo valor efetivo (recebimento parcial entra só pelo que entrou; recebimento anulado não conta). Vencimento não é usado como data de pagamento. Pendências: o que está em aberto hoje com vencimento dentro do período. O resultado é recebido menos pago no período — não é saldo bancário.";

export const brlDeCentavos = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const diaBr = (dia: string) => (dia.length === 10 ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : dia);

export function montarDocumentoDoExtrato(
  extrato: Extrato,
  contexto: { empresa: string; eventos: ReadonlyMap<string, EventoDoExtrato>; emitidoEm: Date; nomeDoEventoFiltrado?: string },
): DocumentoDoExtrato {
  const f = extrato.filtros;
  const ev = (id?: string) => (id ? contexto.eventos.get(id) : undefined);
  const filtroEvento =
    f.evento === "todos" ? "Todos os eventos" : f.evento === "sem_evento" ? "Lançamentos sem evento" : `Evento: ${contexto.nomeDoEventoFiltrado ?? ev(f.evento)?.name ?? "—"}`;
  const filtroTipo = f.tipo === "todos" ? "Todas as movimentações" : f.tipo === "receitas" ? "Somente receitas" : "Somente despesas";
  const t = extrato.totais;
  const p = extrato.totaisPendentes;
  return {
    empresa: contexto.empresa,
    periodo: `${diaBr(f.inicio)} a ${diaBr(f.fim)}`,
    filtros: `${filtroEvento} · ${filtroTipo}`,
    emitidoEm: contexto.emitidoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    criterio: CRITERIO_DO_EXTRATO,
    resumo: [
      { rotulo: "Total recebido no período", centavos: t.recebidoCentavos },
      { rotulo: "Total pago no período", centavos: t.pagoCentavos },
      { rotulo: "Resultado (recebido menos pago)", centavos: t.resultadoCentavos, nota: "Não é saldo bancário" },
      { rotulo: "Pendências a receber", centavos: p.aReceberCentavos, nota: "Em aberto, vencimento no período" },
      { rotulo: "Pendências a pagar", centavos: p.aPagarCentavos, nota: "Em aberto, vencimento no período" },
    ],
    movimentos: extrato.movimentos.map((m) => ({
      data: m.data,
      tipo: m.tipo === "entrada" ? "Entrada" : "Saída",
      descricao: m.descricao,
      cliente: ev(m.eventoId)?.clientName,
      evento: ev(m.eventoId)?.name,
      fornecedor: m.fornecedor,
      categoria: m.categoria,
      forma: m.forma,
      entradaCentavos: m.tipo === "entrada" ? m.valorCentavos : 0,
      saidaCentavos: m.tipo === "saida" ? m.valorCentavos : 0,
      comprovante: m.temComprovante ? "Sim" : "Não",
    })),
    pendencias: extrato.pendencias.map((x) => ({
      vencimento: x.vencimento,
      tipo: x.tipo === "a_receber" ? "A receber" : "A pagar",
      descricao: x.descricao,
      cliente: ev(x.eventoId)?.clientName,
      evento: ev(x.eventoId)?.name,
      fornecedor: x.fornecedor,
      centavos: x.valorCentavos,
    })),
    semDataEfetiva: extrato.semDataEfetiva.map((x) => ({
      vencimento: x.vencimento,
      tipo: x.tipo === "entrada" ? "Entrada" : "Saída",
      descricao: x.descricao,
      evento: ev(x.eventoId)?.name,
      centavos: x.valorCentavos,
    })),
    totais: { ...t, aReceberCentavos: p.aReceberCentavos, aPagarCentavos: p.aPagarCentavos },
    lancamentosLidos: extrato.lancamentosLidos,
  };
}

// ── Excel ───────────────────────────────────────────────────────────────────

export function planilhasDoExtrato(d: DocumentoDoExtrato): Planilha[] {
  return [
    {
      nome: "Resumo",
      cabecalho: ["Item", "Valor", "Observação"],
      larguras: [34, 18, 70],
      linhas: [
        [texto("Empresa"), texto(d.empresa), { tipo: "vazio" }],
        [texto("Período"), texto(d.periodo), { tipo: "vazio" }],
        [texto("Filtros"), texto(d.filtros), { tipo: "vazio" }],
        [texto("Emitido em"), texto(d.emitidoEm), { tipo: "vazio" }],
        [texto("Critério de datas"), { tipo: "vazio" }, texto(d.criterio)],
        ...d.resumo.map((r) => [texto(r.rotulo), moeda(r.centavos), texto(r.nota)]),
        [texto("Lançamentos lidos"), { tipo: "numero", valor: d.lancamentosLidos, formato: "inteiro" }, texto("Todos os lançamentos da conta, para conferência.")],
      ],
    },
    {
      nome: "Movimentações",
      cabecalho: ["Data", "Tipo", "Descrição", "Cliente", "Evento", "Fornecedor", "Categoria", "Forma", "Entrada", "Saída", "Comprovante"],
      larguras: [12, 9, 36, 22, 28, 20, 16, 14, 14, 14, 12],
      linhas: d.movimentos.map((m) => [
        data(m.data),
        texto(m.tipo),
        texto(m.descricao),
        texto(m.cliente),
        texto(m.evento),
        texto(m.fornecedor),
        texto(m.categoria),
        texto(m.forma),
        m.entradaCentavos ? moeda(m.entradaCentavos) : { tipo: "vazio" },
        m.saidaCentavos ? moeda(m.saidaCentavos) : { tipo: "vazio" },
        texto(m.comprovante),
      ]),
    },
    {
      nome: "Pendências",
      cabecalho: ["Vencimento", "Tipo", "Descrição", "Cliente", "Evento", "Fornecedor", "Em aberto"],
      larguras: [12, 10, 36, 22, 28, 20, 14],
      linhas: d.pendencias.map((x) => [
        data(x.vencimento),
        texto(x.tipo),
        texto(x.descricao),
        texto(x.cliente),
        texto(x.evento),
        texto(x.fornecedor),
        moeda(x.centavos),
      ]),
    },
    {
      nome: "Pagos sem data",
      cabecalho: ["Vencimento", "Tipo", "Descrição", "Evento", "Valor (fora dos totais)"],
      larguras: [12, 10, 36, 28, 20],
      linhas: d.semDataEfetiva.map((x) => [data(x.vencimento), texto(x.tipo), texto(x.descricao), texto(x.evento), moeda(x.centavos)]),
    },
  ];
}

export function xlsxDoExtrato(d: DocumentoDoExtrato): Uint8Array {
  return gerarXlsx(planilhasDoExtrato(d));
}
