import { describe, expect, it } from "vitest";
import { montarExtrato, periodoDeTresMeses, periodoDoMes, periodoValido, type LancamentoDoExtrato } from "@/convex/lib/extrato.ts";
import { montarDocumentoDoExtrato, planilhasDoExtrato, xlsxDoExtrato, brlDeCentavos } from "./documento-do-extrato.ts";
import { arquivosDoXlsx, crc32, serialDaData } from "./xlsx.ts";
import { desenharExtrato } from "./gerar-extrato-pdf.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O EXTRATO — MOVIMENTAÇÃO EFETIVA, NÃO VENCIMENTO
//
// Cada teste é um caso que o banco produz de verdade: parcela recebida em
// partes, em meses diferentes, recebimento anulado e corrigido, lançamento
// antigo pago sem data, despesa paga e em aberto.
// ═════════════════════════════════════════════════════════════════════════════

const OUT = { inicio: "2026-10-01", fim: "2026-10-31", evento: "todos", tipo: "todos" } as const;

let n = 0;
function lanc(p: Partial<LancamentoDoExtrato>): LancamentoDoExtrato {
  n++;
  return { _id: `t${n}`, type: "income", description: `Lançamento ${n}`, amount: 1000, date: "2026-10-10", isPaid: false, ...p };
}
const rec = (valor: number, data: string, extra: Record<string, unknown> = {}) => ({
  id: `r${++n}`,
  valor,
  data,
  registradoEm: `${data}T12:00:00Z`,
  chave: `k${n}`,
  ...extra,
});

describe("recebimento parcial entra pelo que entrou", () => {
  it("parcela de R$ 1.000 com R$ 400 recebidos no período: recebido 400, pendente 600", () => {
    const e = montarExtrato([lanc({ amount: 1000, date: "2026-10-15", recebimentos: [rec(400, "2026-10-12")] })], OUT);
    expect(e.totais.recebidoCentavos).toBe(40000);
    expect(e.pendencias).toHaveLength(1);
    expect(e.pendencias[0].valorCentavos).toBe(60000);
    expect(e.totaisPendentes.aReceberCentavos).toBe(60000);
  });

  it("a mesma parcela recebida em meses diferentes: cada mês vê só o seu", () => {
    const t = lanc({ amount: 1000, date: "2026-10-10", recebimentos: [rec(300, "2026-09-20"), rec(400, "2026-10-05")] });
    expect(montarExtrato([t], OUT).totais.recebidoCentavos).toBe(40000);
    expect(montarExtrato([t], { ...OUT, ...periodoDoMes("2026-09") }).totais.recebidoCentavos).toBe(30000);
    expect(montarExtrato([t], { ...OUT, ...periodoDeTresMeses("2026-10") }).totais.recebidoCentavos).toBe(70000);
  });

  it("anulado não conta; a correção (anula e registra de novo) conta só o valor certo", () => {
    const t = lanc({
      recebimentos: [
        rec(500, "2026-10-03", { anulacao: { em: "2026-10-04", motivo: "valor errado" } }),
        rec(600, "2026-10-04"),
      ],
    });
    const e = montarExtrato([t], OUT);
    expect(e.movimentos).toHaveLength(1);
    expect(e.totais.recebidoCentavos).toBe(60000);
  });

  it("dois recebimentos distintos no mesmo dia são dois movimentos (não se fundem nem se perdem)", () => {
    const e = montarExtrato([lanc({ recebimentos: [rec(100, "2026-10-08"), rec(100, "2026-10-08")] })], OUT);
    expect(e.movimentos).toHaveLength(2);
    expect(e.totais.recebidoCentavos).toBe(20000);
  });

  it("parcela com recebimentos e baixa derivada não é contada duas vezes", () => {
    const t = lanc({ amount: 1000, isPaid: true, paidAt: "2026-10-09", recebimentos: [rec(1000, "2026-10-09")] });
    expect(montarExtrato([t], OUT).totais.recebidoCentavos).toBe(100000);
  });
});

describe("data efetiva, nunca vencimento", () => {
  it("lançamento pago com paidAt conta no dia do pagamento", () => {
    const pagoEmNovembro = lanc({ isPaid: true, paidAt: "2026-11-02", date: "2026-10-20" });
    expect(montarExtrato([pagoEmNovembro], OUT).totais.recebidoCentavos).toBe(0);
    expect(montarExtrato([pagoEmNovembro], { ...OUT, ...periodoDoMes("2026-11") }).totais.recebidoCentavos).toBe(100000);
  });

  it("pago SEM data registrada fica fora dos totais e aparece à parte", () => {
    const e = montarExtrato([lanc({ isPaid: true, date: "2026-10-20" })], OUT);
    expect(e.totais.recebidoCentavos).toBe(0);
    expect(e.semDataEfetiva).toHaveLength(1);
    expect(e.semDataEfetiva[0].vencimento).toBe("2026-10-20");
    expect(e.movimentos).toHaveLength(0);
  });

  it("despesa paga é saída no dia; despesa em aberto é pendência a pagar", () => {
    const e = montarExtrato(
      [
        lanc({ type: "expense", amount: 250, isPaid: true, paidAt: "2026-10-07", date: "2026-10-30", fornecedor: "Flores Sol" }),
        lanc({ type: "expense", amount: 80, isPaid: false, date: "2026-10-28" }),
      ],
      OUT,
    );
    expect(e.totais.pagoCentavos).toBe(25000);
    expect(e.totais.resultadoCentavos).toBe(-25000);
    expect(e.movimentos[0].fornecedor).toBe("Flores Sol");
    expect(e.totaisPendentes.aPagarCentavos).toBe(8000);
  });

  it("fronteiras do período são inclusivas e por dia civil", () => {
    const e = montarExtrato(
      [
        lanc({ isPaid: true, paidAt: "2026-10-01" }),
        lanc({ isPaid: true, paidAt: "2026-10-31" }),
        lanc({ isPaid: true, paidAt: "2026-09-30" }),
        lanc({ isPaid: true, paidAt: "2026-11-01" }),
        // Gravação antiga com hora: vale o dia que está escrito.
        lanc({ isPaid: true, paidAt: "2026-10-31T23:59:00" }),
      ],
      OUT,
    );
    expect(e.movimentos.map((m) => m.data)).toEqual(["2026-10-01", "2026-10-31", "2026-10-31"]);
  });

  it("períodos: mês, três meses com as datas certas, bissexto e virada de ano", () => {
    expect(periodoDoMes("2028-02")).toEqual({ inicio: "2028-02-01", fim: "2028-02-29" });
    expect(periodoDeTresMeses("2026-10")).toEqual({ inicio: "2026-08-01", fim: "2026-10-31" });
    expect(periodoDeTresMeses("2026-01")).toEqual({ inicio: "2025-11-01", fim: "2026-01-31" });
    expect(periodoValido("2026-10-31", "2026-10-01")).toBe(false);
    expect(periodoValido("2026-10-01", "2026-10-01")).toBe(true);
  });
});

describe("filtros", () => {
  const base = [
    lanc({ eventId: "ev1", isPaid: true, paidAt: "2026-10-05", amount: 100 }),
    lanc({ eventId: "ev2", isPaid: true, paidAt: "2026-10-05", amount: 200 }),
    lanc({ isPaid: true, paidAt: "2026-10-05", amount: 300 }),
    lanc({ type: "expense", eventId: "ev1", isPaid: true, paidAt: "2026-10-05", amount: 50 }),
  ];
  it.each([
    [{ evento: "ev1" }, 10000, 5000],
    [{ evento: "sem_evento" }, 30000, 0],
    [{ tipo: "receitas" as const }, 60000, 0],
    [{ tipo: "despesas" as const }, 0, 5000],
    [{}, 60000, 5000],
  ])("%o", (f, recebido, pago) => {
    const e = montarExtrato(base, { ...OUT, ...f });
    expect(e.totais.recebidoCentavos).toBe(recebido);
    expect(e.totais.pagoCentavos).toBe(pago);
  });
});

describe("mais de 500 registros", () => {
  it("1.200 lançamentos: nada é cortado e a conta fecha", () => {
    const muitos = Array.from({ length: 1200 }, (_, i) =>
      lanc({ amount: 10, isPaid: true, paidAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}` }),
    );
    const e = montarExtrato(muitos, OUT);
    expect(e.movimentos).toHaveLength(1200);
    expect(e.totais.recebidoCentavos).toBe(1200 * 1000);
    expect(e.lancamentosLidos).toBe(1200);
  });
});

// ── PDF e Excel: o mesmo número ─────────────────────────────────────────────

function documento() {
  const lancamentos = [
    lanc({ eventId: "ev1", amount: 1000, date: "2026-10-15", recebimentos: [rec(400, "2026-10-12", { forma: "PIX", comprovanteStorageId: "tem" })] }),
    lanc({ type: "expense", amount: 250.5, isPaid: true, paidAt: "2026-10-07", description: '=HYPERLINK("http://x","clique")' }),
    lanc({ isPaid: true, date: "2026-10-20", description: "Antigo sem data" }),
  ];
  const extrato = montarExtrato(lancamentos, OUT);
  return montarDocumentoDoExtrato(extrato, {
    empresa: "Ateliê Teste",
    eventos: new Map([["ev1", { name: "Casamento Ana", clientName: "Ana" }]]),
    emitidoEm: new Date(2026, 9, 14, 9, 30),
  });
}

/** Lê uma parte do ZIP pelos cabeçalhos locais (o XLSX é gravado sem compressão). */
function parteDoZip(bytes: Uint8Array, nome: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  let p = 0;
  while (view.getUint32(p, true) === 0x04034b50) {
    const tamanho = view.getUint32(p + 18, true);
    const tamNome = view.getUint16(p + 26, true);
    const n = new TextDecoder().decode(bytes.slice(p + 30, p + 30 + tamNome));
    const dados = bytes.slice(p + 30 + tamNome, p + 30 + tamNome + tamanho);
    if (n === nome) return new TextDecoder().decode(dados);
    p += 30 + tamNome + tamanho;
  }
  throw new Error(`parte ${nome} não encontrada`);
}
const xmlDaPlanilha = (bytes: Uint8Array, i: number) => parteDoZip(bytes, `xl/worksheets/sheet${i}.xml`);

function textoDoPdf(doc: ReturnType<typeof desenharExtrato>): string {
  return (doc.output().match(/\((?:\\.|[^\\)])*\)\s*Tj/g) ?? [])
    .map((l) => l.replace(/\)\s*Tj$/, "").slice(1).replace(/\\([()\\])/g, "$1"))
    .join("\n");
}

describe("PDF e Excel dizem o mesmo", () => {
  const d = documento();
  const xlsx = xlsxDoExtrato(d);

  it("os totais do Excel somam o mesmo que o extrato", () => {
    const movimentos = xmlDaPlanilha(xlsx, 2);
    // Colunas I (Entrada) e J (Saída), estilo moeda (s="2").
    const valores = (col: string) =>
      [...movimentos.matchAll(new RegExp(`<c r="${col}\\d+" s="2"><v>([-\\d.]+)</v></c>`, "g"))].reduce((s, m) => s + Number(m[1]), 0);
    expect(Math.round(valores("I") * 100)).toBe(d.totais.recebidoCentavos);
    expect(Math.round(valores("J") * 100)).toBe(d.totais.pagoCentavos);
  });

  it("o PDF imprime os mesmos totais", () => {
    const pdf = textoDoPdf(desenharExtrato(d, { studioName: "Ateliê Teste" }));
    for (const c of [d.totais.recebidoCentavos, d.totais.pagoCentavos, d.totais.aReceberCentavos]) {
      expect(pdf).toContain(brlDeCentavos(c));
    }
    expect(pdf).toContain("Período: 01/10/2026 a 31/10/2026");
    expect(pdf).toContain("não é saldo bancário");
    expect(pdf).toContain("Pagos sem data registrada");
  });

  it("o PDF não carrega link de arquivo; o comprovante é Sim/Não", () => {
    const cru = desenharExtrato(d, null).output();
    expect(cru).not.toMatch(/\/URI|convex\.cloud|\/api\/storage/);
    expect(d.movimentos.find((m) => m.entradaCentavos)?.comprovante).toBe("Sim");
  });

  it("texto que parece fórmula vira texto, nunca fórmula", () => {
    const movimentos = xmlDaPlanilha(xlsx, 2);
    expect(movimentos).not.toContain("<f>");
    expect(movimentos).toMatch(/t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;http:\/\/x&quot;,&quot;clique&quot;\)<\/t>/);
  });

  it("datas são data e valores são número", () => {
    const movimentos = xmlDaPlanilha(xlsx, 2);
    expect(movimentos).toContain(`<v>${serialDaData("2026-10-07")}</v>`);
    expect(serialDaData("2026-10-07")).toBe(46302);
    expect(movimentos).toContain("<autoFilter");
  });

  it("o arquivo é um ZIP válido, com CRC certo em cada parte", () => {
    expect(xlsx[0]).toBe(0x50);
    expect(xlsx[1]).toBe(0x4b);
    const partes = arquivosDoXlsx(planilhasDoExtrato(d));
    const view = new DataView(xlsx.buffer, xlsx.byteOffset);
    let p = 0;
    for (const a of partes) {
      expect(view.getUint32(p, true)).toBe(0x04034b50);
      const tamanho = view.getUint32(p + 18, true);
      const nome = view.getUint16(p + 26, true);
      const dados = xlsx.slice(p + 30 + nome, p + 30 + nome + tamanho);
      expect(view.getUint32(p + 14, true)).toBe(crc32(dados));
      expect(new TextDecoder().decode(dados)).toBe(a.conteudo);
      p += 30 + nome + tamanho;
    }
  });
});
