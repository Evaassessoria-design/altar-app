import { describe, expect, it } from "vitest";
import { dinheiroVencido } from "./dinheiroVencido";

// ═════════════════════════════════════════════════════════════════════════════
// "O SINAL DA MARINA CAIU?"
//
// O painel da manhã respondia por evento e por oportunidade. Dinheiro ficava
// de fora: o Dashboard mostrava "Receita do mês" e "Despesas do mês", dois
// totais que não pedem nada de ninguém.
//
// `transactions` guarda a resposta desde sempre — receita com `isPaid: false`
// e data no passado — e nenhuma tela perguntava.
// ═════════════════════════════════════════════════════════════════════════════

const HOJE = "2026-09-21";
const t = (
  type: string,
  amount: number,
  isPaid: boolean,
  date: string | undefined,
) => ({ type, amount, isPaid, date });

describe("o que venceu e não entrou", () => {
  it("receita vencida e não recebida entra", () => {
    const r = dinheiroVencido([t("income", 43_500, false, "2026-09-10")], HOJE);
    expect(r.aReceber).toEqual({ quantidade: 1, total: 43_500 });
    expect(r.temAlgo).toBe(true);
  });

  it("receita já recebida NÃO entra, mesmo vencida", () => {
    const r = dinheiroVencido([t("income", 43_500, true, "2026-09-10")], HOJE);
    expect(r.aReceber.quantidade).toBe(0);
    expect(r.temAlgo).toBe(false);
  });

  it("receita futura não entra — ainda não venceu", () => {
    const r = dinheiroVencido([t("income", 43_500, false, "2026-10-05")], HOJE);
    expect(r.aReceber.quantidade).toBe(0);
  });

  it("o que vence HOJE não é vencido", () => {
    // Um lançamento datado de hoje ainda tem o dia inteiro para acontecer.
    // Chamá-lo de vencido às 9 da manhã ensina a ignorar o painel.
    const r = dinheiroVencido([t("income", 1_000, false, HOJE)], HOJE);
    expect(r.aReceber.quantidade).toBe(0);
  });

  it("ontem é vencido", () => {
    const r = dinheiroVencido([t("income", 1_000, false, "2026-09-20")], HOJE);
    expect(r.aReceber.quantidade).toBe(1);
  });
});

describe("o que ela deve", () => {
  it("despesa vencida e não paga entra em `aPagar`", () => {
    const r = dinheiroVencido([t("expense", 17_000, false, "2026-09-03")], HOJE);
    expect(r.aPagar).toEqual({ quantidade: 1, total: 17_000 });
    expect(r.aReceber.quantidade).toBe(0);
  });

  it("as duas listas não se misturam", () => {
    const r = dinheiroVencido(
      [
        t("income", 43_500, false, "2026-09-10"),
        t("expense", 17_000, false, "2026-09-03"),
        t("expense", 14_200, false, "2026-09-05"),
      ],
      HOJE,
    );
    expect(r.aReceber).toEqual({ quantidade: 1, total: 43_500 });
    expect(r.aPagar).toEqual({ quantidade: 2, total: 31_200 });
  });
});

describe("lançamento sem data não é vencido", () => {
  it("data ausente fica de fora", () => {
    // "Vencido" é uma afirmação sobre uma data. Sem data não há afirmação, e
    // contar como vencido seria inventar.
    const r = dinheiroVencido([t("income", 1_000, false, undefined)], HOJE);
    expect(r.aReceber.quantidade).toBe(0);
    expect(r.temAlgo).toBe(false);
  });

  it.each(["", "ontem", "10/09/2026", "2026-9-1"])("data inválida %s fica de fora", (date) => {
    const r = dinheiroVencido([t("income", 1_000, false, date)], HOJE);
    expect(r.aReceber.quantidade).toBe(0);
  });

  it("data com hora continua sendo lida pelo dia", () => {
    // O Financeiro grava dia civil, mas nada impede um registro com instante.
    const r = dinheiroVencido([t("income", 1_000, false, "2026-09-10T23:00:00Z")], HOJE);
    expect(r.aReceber.quantidade).toBe(1);
  });
});

describe("um lançamento podre não estraga o aviso", () => {
  it("NaN gravado antes das travas não vira 'R$ NaN'", () => {
    // A soma é `somaEmDinheiro`, que resiste. Sem isso, um único registro
    // ruim transformava o painel inteiro em NaN.
    const r = dinheiroVencido(
      [t("income", 43_500, false, "2026-09-10"), t("income", NaN, false, "2026-09-11")],
      HOJE,
    );
    expect(r.aReceber.total).toBe(43_500);
    expect(r.aReceber.quantidade).toBe(2);
  });

  it("soma ao centavo, sem sobra de ponto flutuante", () => {
    const r = dinheiroVencido(
      [t("income", 0.1, false, "2026-09-10"), t("income", 0.2, false, "2026-09-11")],
      HOJE,
    );
    expect(r.aReceber.total).toBe(0.3);
  });
});

describe("nada a dizer", () => {
  it("lista vazia não acusa nada", () => {
    const r = dinheiroVencido([], HOJE);
    expect(r.temAlgo).toBe(false);
    expect(r.aReceber.total).toBe(0);
    expect(r.aPagar.total).toBe(0);
  });

  it("tudo pago e em dia não acusa nada", () => {
    const r = dinheiroVencido(
      [t("income", 100, true, "2026-09-01"), t("expense", 50, true, "2026-09-02")],
      HOJE,
    );
    expect(r.temAlgo).toBe(false);
  });
});
