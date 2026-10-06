import { describe, expect, it } from "vitest";
import {
  baixaDerivada,
  dataValida,
  estadoDaParcela,
  parcelaAtrasada,
  planejarParcelas,
  recebidoEmCentavos,
  resumirPagamentos,
  saldoEmCentavos,
  somarMeses,
  type ParcelaLike,
  type Recebimento,
} from "./pagamentosDoEvento";

// ─────────────────────────────────────────────────────────────────────────────
// A REGRA DOS PAGAMENTOS, NAS BORDAS
//
// Tudo em centavos. O que estes testes guardam é o que custa caro errar:
// parcela que soma um centavo a menos, parcial contado como zero, atraso que
// some porque a parcela recebeu "alguma coisa", parcela antiga que muda de
// significado.
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0;
const rec = (valor: number, data = "2026-10-01", anulado = false): Recebimento => ({
  id: `r${++seq}`,
  valor,
  data,
  registradoEm: "2026-10-01T12:00:00Z",
  chave: `k${seq}`,
  anulacao: anulado ? { em: "2026-10-02T12:00:00Z", motivo: "lançado errado" } : undefined,
});
const parcela = (amount: number, date: string, recebimentos?: Recebimento[], isPaid = false): ParcelaLike => ({
  amount,
  date,
  isPaid,
  recebimentos,
});

describe("parcela antiga não muda de significado", () => {
  it("baixa antiga (isPaid sem recebimentos) vale o valor inteiro", () => {
    const p = parcela(5000, "2026-09-10", undefined, true);
    expect(recebidoEmCentavos(p)).toBe(500_000);
    expect(saldoEmCentavos(p)).toBe(0);
    expect(estadoDaParcela(p)).toBe("recebida");
  });

  it("em aberto sem recebimentos vale zero recebido", () => {
    const p = parcela(5000, "2026-09-10");
    expect(recebidoEmCentavos(p)).toBe(0);
    expect(estadoDaParcela(p)).toBe("pendente");
  });

  it("NaN gravado antes das travas não contamina", () => {
    expect(saldoEmCentavos(parcela(NaN, "2026-09-10"))).toBe(0);
  });
});

describe("recebimento parcial, múltiplo e quitação", () => {
  it("parcial: estado parcial, saldo é o que falta", () => {
    const p = parcela(5000, "2026-11-10", [rec(2000)]);
    expect(estadoDaParcela(p)).toBe("parcial");
    expect(saldoEmCentavos(p)).toBe(300_000);
    expect(baixaDerivada(p)).toEqual({ isPaid: false, paidAt: undefined });
  });

  it("vários recebimentos até quitar: recebida, paidAt = último", () => {
    const p = parcela(5000, "2026-11-10", [rec(2000, "2026-10-01"), rec(1999.99, "2026-10-15"), rec(1000.01, "2026-10-20")]);
    expect(saldoEmCentavos(p)).toBe(0);
    expect(estadoDaParcela(p)).toBe("recebida");
    expect(baixaDerivada(p)).toEqual({ isPaid: true, paidAt: "2026-10-20" });
  });

  it("recebimento anulado deixa de contar, mas o histórico continua", () => {
    const p = parcela(5000, "2026-11-10", [rec(5000, "2026-10-01", true), rec(1000)]);
    expect(recebidoEmCentavos(p)).toBe(100_000);
    expect(estadoDaParcela(p)).toBe("parcial");
    expect(p.recebimentos).toHaveLength(2);
  });

  it("tudo anulado volta a pendente — e não à baixa antiga", () => {
    // `isPaid: true` gravado por baixo não ressuscita: com recebimentos, quem
    // decide são eles.
    const p = parcela(5000, "2026-11-10", [rec(5000, "2026-10-01", true)], true);
    expect(estadoDaParcela(p)).toBe("pendente");
    expect(baixaDerivada(p).isPaid).toBe(false);
  });
});

describe("atraso", () => {
  const HOJE = "2026-10-06";

  it("parcialmente recebida e vencida É atrasada", () => {
    expect(parcelaAtrasada(parcela(5000, "2026-10-01", [rec(2000)]), HOJE)).toBe(true);
  });

  it("vence hoje não é atraso", () => {
    expect(parcelaAtrasada(parcela(5000, HOJE), HOJE)).toBe(false);
  });

  it("quitada e vencida não é atraso", () => {
    expect(parcelaAtrasada(parcela(5000, "2026-10-01", [rec(5000)]), HOJE)).toBe(false);
  });

  it("vencimento com hora ('2026-10-05T18:00') compara pelo dia", () => {
    expect(parcelaAtrasada(parcela(5000, "2026-10-05T18:00"), HOJE)).toBe(true);
    expect(parcelaAtrasada(parcela(5000, "2026-10-06T18:00"), HOJE)).toBe(false);
  });
});

describe("parcelamento: a soma é exata", () => {
  it("10.000 em 3: 3.333,34 + 3.333,33 + 3.333,33 — sobra distribuída", () => {
    const plano = planejarParcelas({ totalCentavos: 1_000_000, quantidade: 3, primeiroVencimento: "2026-11-10" });
    expect(plano.map((p) => p.valorCentavos)).toEqual([333_334, 333_333, 333_333]);
    expect(plano.reduce((s, p) => s + p.valorCentavos, 0)).toBe(1_000_000);
  });

  it.each([
    [1, 7],
    [100, 3],
    [999_999, 7],
    [12_345_678, 11],
    [5, 12],
  ])("%d centavos em %d parcelas somam exato e diferem no máximo 1 centavo", (total, n) => {
    const plano = planejarParcelas({ totalCentavos: total, quantidade: n, primeiroVencimento: "2026-01-31" });
    const valores = plano.map((p) => p.valorCentavos);
    expect(valores.reduce((s, v) => s + v, 0)).toBe(total);
    expect(Math.max(...valores) - Math.min(...valores)).toBeLessThanOrEqual(1);
  });

  it("entrada sai antes e o resto é parcelado", () => {
    const plano = planejarParcelas({
      totalCentavos: 1_000_000,
      entrada: { valorCentavos: 300_000, vencimento: "2026-10-10" },
      quantidade: 2,
      primeiroVencimento: "2026-11-10",
    });
    expect(plano.map((p) => [p.descricao, p.valorCentavos, p.vencimento])).toEqual([
      ["Entrada", 300_000, "2026-10-10"],
      ["Parcela 1/2", 350_000, "2026-11-10"],
      ["Parcela 2/2", 350_000, "2026-12-10"],
    ]);
  });

  it("dia 31 vira o último dia do mês curto, sem pular mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMeses("2026-01-31", 2)).toBe("2026-03-31");
    expect(somarMeses("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("datas inválidas não passam", () => {
  it.each(["2026-02-30", "2026-13-01", "10/10/2026", "", "2026-1-1"])("%s", (d) => {
    expect(dataValida(d)).toBe(false);
  });
  it("2028-02-29 existe", () => expect(dataValida("2028-02-29")).toBe(true));
});

describe("o resumo do evento", () => {
  const HOJE = "2026-10-06";
  const parcelas = [
    parcela(3000, "2026-09-10", undefined, true), // baixa antiga
    parcela(3500, "2026-10-01", [rec(1000)]), // parcial e vencida
    parcela(3500, "2026-11-10"), // próxima
  ];

  it("contratado definido: saldo = contratado − recebido", () => {
    const r = resumirPagamentos(12_000, parcelas, HOJE);
    expect(r.contratadoCentavos).toBe(1_200_000);
    expect(r.recebidoCentavos).toBe(400_000);
    expect(r.saldoCentavos).toBe(800_000);
    expect(r.baseDoSaldo).toBe("contratado");
    expect(r.vencidoCentavos).toBe(250_000);
    expect(r.parcelasVencidas).toBe(1);
    expect(r.diferencaDoPlanoCentavos).toBe(200_000); // falta parcelar R$ 2.000
    expect(r.proxima).toEqual({ vencimento: "2026-11-10", saldoCentavos: 350_000, indice: 2 });
  });

  it("sem contratado: diz que não há — e não usa o orçamento no lugar", () => {
    const r = resumirPagamentos(undefined, parcelas, HOJE);
    expect(r.contratadoCentavos).toBeNull();
    expect(r.diferencaDoPlanoCentavos).toBeNull();
    expect(r.baseDoSaldo).toBe("parcelas");
    expect(r.saldoCentavos).toBe(250_000 + 350_000);
  });

  it("sem parcelas: nada vencido e nenhuma próxima", () => {
    const r = resumirPagamentos(10_000, [], HOJE);
    expect(r.proxima).toBeNull();
    expect(r.vencidoCentavos).toBe(0);
    expect(r.saldoCentavos).toBe(1_000_000);
  });
});
