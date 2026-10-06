import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => {
  const usuarioDaSessao = async (ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string; email?: string } | null> };
  }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { _id: identity.subject, email: identity.email ?? "", name: "Pessoa" };
  };
  return {
    authComponent: {
      safeGetAuthUser: usuarioDaSessao,
      getAuthUser: usuarioDaSessao,
      registerRoutes: () => {},
      adapter: () => ({}),
    },
    createAuth: () => ({}),
  };
});

import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// PAGAMENTOS DO CLIENTE — NO BANCO, COM DUAS CONTAS
//
// O que se trava aqui é o que a regra pura não alcança: idempotência do
// envio, recusa ANTES de gravar, histórico que não some, mutations antigas
// que não podem mais mexer na baixa por fora, e a conta rival.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora" });
  const rival = await autenticarComo(t, { nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival" });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (s: string) =>
      (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", s)).unique())!._id;
    const donaId = await idDe("auth|aurora");
    const rivalId = await idDe("auth|rival");
    const evento = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-12-05",
      location: "Fazenda", clientName: "Marina", status: "planning", budget: 90_000,
    });
    const eventoRival = await ctx.db.insert("events", {
      userId: rivalId, name: "Da rival", type: "wedding", date: "2026-12-05",
      location: "X", clientName: "Y", status: "planning",
    });
    const parcela = (valor: number, data: string, isPaid = false, desc = "Parcela") =>
      ctx.db.insert("transactions", {
        userId: donaId, eventId: evento, type: "income", category: "Contrato",
        description: desc, amount: valor, date: data, isPaid,
      });
    return {
      donaId, evento, eventoRival,
      antigaPaga: await parcela(3000, "2026-09-10", true, "Entrada"),
      p1: await parcela(5000, "2026-10-01"),
      p2: await parcela(5000, "2026-11-10"),
    };
  });

  const registrar = (id: Id<"transactions">, valor: number, chave: string, data = "2026-10-05", extra = {}) =>
    dona.mutation(api.financeiro.registrarRecebimento, { id, chave, valor, data, ...extra });
  const linha = (id: Id<"transactions">) => t.run(async (ctx) => (await ctx.db.get(id))!);

  return { t, dona, rival, ids, registrar, linha };
}

describe("recebimento parcial e quitação", () => {
  it("parcial não dá baixa; completar dá, com a data do último", async () => {
    const c = await cenario();
    await c.registrar(c.ids.p1, 2000, "a", "2026-10-02");
    let l = await c.linha(c.ids.p1);
    expect(l.isPaid).toBe(false);
    expect(l.recebimentos).toHaveLength(1);

    await c.registrar(c.ids.p1, 1999.99, "b", "2026-10-03");
    await c.registrar(c.ids.p1, 1000.01, "c", "2026-10-04");
    l = await c.linha(c.ids.p1);
    expect(l.isPaid).toBe(true);
    expect(l.paidAt).toBe("2026-10-04");
    expect(l.recebimentos).toHaveLength(3);
  });

  it("acima do saldo é recusado, e nada é gravado", async () => {
    const c = await cenario();
    await c.registrar(c.ids.p1, 4000, "a");
    await expect(c.registrar(c.ids.p1, 1000.01, "b")).rejects.toThrow(/passa do saldo/);
    expect((await c.linha(c.ids.p1)).recebimentos).toHaveLength(1);
  });

  it("a recusa NÃO manda aumentar a parcela para caber o pagamento", async () => {
    const c = await cenario();
    let recado = "";
    try {
      await c.registrar(c.ids.p1, 6000, "a");
    } catch (e) {
      recado = (e as { data?: { message?: string } }).data?.message ?? "";
    }
    expect(recado).toMatch(/Registre no máximo o saldo/);
    expect(recado).toMatch(/acordo com a cliente mudar de fato/);
    expect(recado).not.toMatch(/corrija|ajuste o valor|aumente/i);
  });

  it("parcela já quitada (inclusive a baixa antiga) não recebe mais", async () => {
    const c = await cenario();
    await expect(c.registrar(c.ids.antigaPaga, 1, "a")).rejects.toThrow(/já está toda recebida/);
  });

  it.each([
    ["zero", 0],
    ["negativo", -10],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("valor %s é recusado", async (_r, valor) => {
    const c = await cenario();
    await expect(c.registrar(c.ids.p1, valor, "a")).rejects.toThrow();
    expect((await c.linha(c.ids.p1)).recebimentos).toBeUndefined();
  });

  it.each(["", "2026-02-30", "05/10/2026"])("data '%s' é recusada", async (data) => {
    const c = await cenario();
    await expect(c.registrar(c.ids.p1, 100, "a", data)).rejects.toThrow(/data/i);
  });

  it("despesa não recebe recebimento", async () => {
    const c = await cenario();
    const despesa = await c.t.run((ctx) =>
      ctx.db.insert("transactions", {
        userId: c.ids.donaId, eventId: c.ids.evento, type: "expense", category: "Flores",
        description: "Flores", amount: 500, date: "2026-10-01", isPaid: false,
      }),
    );
    await expect(c.registrar(despesa, 100, "a")).rejects.toThrow(/receita/);
  });
});

describe("clique repetido e reenvio", () => {
  it("a mesma chave duas vezes grava UM recebimento", async () => {
    const c = await cenario();
    const r1 = await c.registrar(c.ids.p1, 2000, "mesma");
    const r2 = await c.registrar(c.ids.p1, 2000, "mesma");
    expect(r2).toEqual({ id: r1.id, repetido: true });
    expect((await c.linha(c.ids.p1)).recebimentos).toHaveLength(1);
  });

  it("dois envios simultâneos com a mesma chave também", async () => {
    const c = await cenario();
    await Promise.all([c.registrar(c.ids.p1, 2000, "x"), c.registrar(c.ids.p1, 2000, "x")]);
    expect((await c.linha(c.ids.p1)).recebimentos).toHaveLength(1);
  });

  it("o planejamento repetido não cria as parcelas em dobro", async () => {
    const c = await cenario();
    const plano = {
      eventId: c.ids.evento,
      chave: "plano-1",
      parcelas: [
        { descricao: "Parcela 1/2", valor: 3333.34, vencimento: "2027-01-10" },
        { descricao: "Parcela 2/2", valor: 3333.33, vencimento: "2027-02-10" },
      ],
    };
    expect(await c.dona.mutation(api.financeiro.adicionarParcelas, plano)).toEqual({
      criadas: 2,
      repetido: false,
      ignoradas: 0,
    });
    expect(await c.dona.mutation(api.financeiro.adicionarParcelas, plano)).toEqual({ criadas: 0, repetido: true });
    const r = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    expect(r!.parcelas).toHaveLength(5);
  });
});

describe("o mesmo planejamento salvo de novo", () => {
  const plano = (chave: string, eventId: Id<"events">) => ({
    eventId,
    chave,
    parcelas: [
      { descricao: "Parcela 1/2", valor: 3333.34, vencimento: "2027-01-10" },
      { descricao: "Parcela 2/2", valor: 3333.33, vencimento: "2027-02-10" },
    ],
  });

  it("por OUTRO formulário (outra chave) não duplica", async () => {
    const c = await cenario();
    await c.dona.mutation(api.financeiro.adicionarParcelas, plano("form-1", c.ids.evento));
    const r = await c.dona.mutation(api.financeiro.adicionarParcelas, plano("form-2", c.ids.evento));
    expect(r).toEqual({ criadas: 0, repetido: true });
    const d = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    expect(d!.parcelas).toHaveLength(5);
  });

  it("reenvio depois de resposta perdida: mesma chave, nada novo", async () => {
    // A primeira chamada gravou, mas a resposta não chegou à tela; o
    // formulário continua aberto e reenvia com a MESMA chave.
    const c = await cenario();
    await c.dona.mutation(api.financeiro.adicionarParcelas, plano("perdida", c.ids.evento));
    const r = await c.dona.mutation(api.financeiro.adicionarParcelas, plano("perdida", c.ids.evento));
    expect(r).toEqual({ criadas: 0, repetido: true });
  });

  it("prévia que mistura parcela já existente e nova cria só a nova", async () => {
    const c = await cenario();
    await c.dona.mutation(api.financeiro.adicionarParcelas, plano("a", c.ids.evento));
    const r = await c.dona.mutation(api.financeiro.adicionarParcelas, {
      eventId: c.ids.evento,
      chave: "b",
      parcelas: [
        { descricao: "Parcela 2/2", valor: 3333.33, vencimento: "2027-02-10" },
        { descricao: "Parcela extra", valor: 500, vencimento: "2027-03-10" },
      ],
    });
    expect(r).toEqual({ criadas: 1, repetido: false, ignoradas: 1 });
  });

  it("mesmo valor em OUTRO vencimento é parcela nova, não repetição", async () => {
    const c = await cenario();
    await c.dona.mutation(api.financeiro.adicionarParcelas, plano("a", c.ids.evento));
    const r = await c.dona.mutation(api.financeiro.adicionarParcelas, {
      eventId: c.ids.evento,
      chave: "b",
      parcelas: [{ descricao: "Parcela 1/2", valor: 3333.34, vencimento: "2027-04-10" }],
    });
    expect(r.criadas).toBe(1);
  });
});

describe("correção: anular, nunca apagar", () => {
  it("anular devolve o saldo, mantém o histórico e exige motivo", async () => {
    const c = await cenario();
    const { id } = await c.registrar(c.ids.p1, 5000, "a");
    expect((await c.linha(c.ids.p1)).isPaid).toBe(true);

    await expect(
      c.dona.mutation(api.financeiro.anularRecebimento, { id: c.ids.p1, recebimentoId: id, motivo: "  " }),
    ).rejects.toThrow(/por que/);

    await c.dona.mutation(api.financeiro.anularRecebimento, { id: c.ids.p1, recebimentoId: id, motivo: "valor digitado errado" });
    const l = await c.linha(c.ids.p1);
    expect(l.isPaid).toBe(false);
    expect(l.paidAt).toBeUndefined();
    expect(l.recebimentos).toHaveLength(1);
    expect(l.recebimentos![0].anulacao?.motivo).toBe("valor digitado errado");

    // corrigir = registrar o certo
    await c.registrar(c.ids.p1, 4500, "b");
    expect((await c.linha(c.ids.p1)).recebimentos).toHaveLength(2);
  });

  it("anular duas vezes não troca o motivo original", async () => {
    const c = await cenario();
    const { id } = await c.registrar(c.ids.p1, 1000, "a");
    await c.dona.mutation(api.financeiro.anularRecebimento, { id: c.ids.p1, recebimentoId: id, motivo: "primeiro" });
    const r = await c.dona.mutation(api.financeiro.anularRecebimento, { id: c.ids.p1, recebimentoId: id, motivo: "segundo" });
    expect(r).toEqual({ anulado: false });
    expect((await c.linha(c.ids.p1)).recebimentos![0].anulacao?.motivo).toBe("primeiro");
  });

  it("parcela com recebimentos não é excluída, e a baixa manual não passa por fora", async () => {
    const c = await cenario();
    await c.registrar(c.ids.p1, 1000, "a");
    await expect(c.dona.mutation(api.financeiro.deleteTransaction, { id: c.ids.p1 })).rejects.toThrow(/não pode ser excluída/);
    await expect(c.dona.mutation(api.financeiro.togglePaid, { id: c.ids.p1 })).rejects.toThrow(/recebimentos registrados/);
    await expect(
      c.dona.mutation(api.financeiro.registrarPagamento, { id: c.ids.p1, isPaid: true }),
    ).rejects.toThrow(/recebimentos registrados/);
    await expect(
      c.dona.mutation(api.financeiro.updateTransaction, { id: c.ids.p1, isPaid: true }),
    ).rejects.toThrow(/recebimentos registrados/);
    // Forma e observação continuam editáveis: não são a baixa.
    await c.dona.mutation(api.financeiro.registrarPagamento, { id: c.ids.p1, paymentMethod: "PIX", notes: "ok" });
  });

  it("o valor da parcela não desce abaixo do recebido; subir desfaz a quitação", async () => {
    const c = await cenario();
    await c.registrar(c.ids.p1, 5000, "a");
    await expect(
      c.dona.mutation(api.financeiro.updateTransaction, { id: c.ids.p1, amount: 4999.99 }),
    ).rejects.toThrow(/menor do que já foi recebido/);
    await c.dona.mutation(api.financeiro.updateTransaction, { id: c.ids.p1, amount: 6000 });
    const l = await c.linha(c.ids.p1);
    expect(l.isPaid).toBe(false);
    expect(l.amount).toBe(6000);
  });
});

describe("comprovante", () => {
  it("anexar comprovante sozinho não dá baixa", async () => {
    const c = await cenario();
    const storageId = await c.t.run((ctx) => ctx.storage.store(new Blob(["pix"], { type: "application/pdf" })));
    await c.dona.mutation(api.financeiro.anexarComprovante, { id: c.ids.p1, storageId, filename: "pix.pdf" });
    const l = await c.linha(c.ids.p1);
    expect(l.isPaid).toBe(false);
    expect(l.recebimentos).toBeUndefined();
  });

  it("comprovante junto do recebimento entra na lista e fica ligado a ele", async () => {
    const c = await cenario();
    const storageId = await c.t.run((ctx) => ctx.storage.store(new Blob(["pix"], { type: "application/pdf" })));
    await c.registrar(c.ids.p1, 2000, "a", "2026-10-05", {
      comprovante: { storageId, filename: "pix.pdf", contentType: "application/pdf" },
    });
    const l = await c.linha(c.ids.p1);
    expect(l.comprovantes).toHaveLength(1);
    expect(l.recebimentos![0].comprovanteStorageId).toBe(storageId);
  });
});

describe("planejamento preserva o que existe", () => {
  it("acrescentar parcelas não toca nas antigas — nem na já recebida", async () => {
    const c = await cenario();
    await c.registrar(c.ids.p1, 1000, "a");
    const antes = await Promise.all([c.ids.antigaPaga, c.ids.p1, c.ids.p2].map(c.linha));
    await c.dona.mutation(api.financeiro.adicionarParcelas, {
      eventId: c.ids.evento,
      chave: "plano",
      parcelas: [{ descricao: "Parcela extra", valor: 1000, vencimento: "2027-01-10" }],
    });
    const depois = await Promise.all([c.ids.antigaPaga, c.ids.p1, c.ids.p2].map(c.linha));
    expect(depois).toEqual(antes);
  });

  it("uma parcela inválida recusa o lote inteiro", async () => {
    const c = await cenario();
    await expect(
      c.dona.mutation(api.financeiro.adicionarParcelas, {
        eventId: c.ids.evento,
        chave: "ruim",
        parcelas: [
          { descricao: "ok", valor: 1000, vencimento: "2027-01-10" },
          { descricao: "ruim", valor: 1000, vencimento: "2027-02-30" },
        ],
      }),
    ).rejects.toThrow(/Vencimento inválido/);
    const r = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    expect(r!.parcelas).toHaveLength(3);
  });
});

describe("valor contratado", () => {
  it("define, limpa, e o ausente não é trocado pelo orçamento", async () => {
    const c = await cenario();
    let r = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    expect(r!.valorContratado).toBeNull();
    expect(r!.orcamentoEstimado).toBe(90_000);

    await c.dona.mutation(api.financeiro.definirValorContratado, { eventId: c.ids.evento, valor: 13_000.005 });
    r = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    expect(r!.valorContratado).toBe(13_000.01);

    await c.dona.mutation(api.financeiro.definirValorContratado, { eventId: c.ids.evento, valor: null });
    r = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    expect(r!.valorContratado).toBeNull();
  });

  it.each([0, -1, Number.NaN])("valor contratado %s é recusado", async (valor) => {
    const c = await cenario();
    await expect(
      c.dona.mutation(api.financeiro.definirValorContratado, { eventId: c.ids.evento, valor }),
    ).rejects.toThrow();
  });
});

describe("os totais do Financeiro e do Dashboard enxergam o parcial", () => {
  it("getSummary conta o recebido parcial e o que falta", async () => {
    const c = await cenario();
    await c.registrar(c.ids.p1, 2000, "a");
    const s = await c.dona.query(api.financeiro.getSummary, {});
    expect(s.totalIncome).toBe(3000 + 2000);
    expect(s.pendingIncome).toBe(3000 + 5000);
  });

  it("perto da meia-noite, o Dashboard usa o dia do NEGÓCIO, não o do UTC", async () => {
    const c = await cenario();
    // p1 vence em 2026-10-01; uma nova vence em 2026-10-06.
    const hoje6 = await c.t.run((ctx) =>
      ctx.db.insert("transactions", {
        userId: c.ids.donaId, eventId: c.ids.evento, type: "income", category: "Contrato",
        description: "Vence dia 6", amount: 1000, date: "2026-10-06", isPaid: false,
      }),
    );
    expect(hoje6).toBeTruthy();
    const vencidosAs = async (instante: string) => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date(instante) });
      try {
        return await c.dona.query(api.financeiro.getVencidos, {});
      } finally {
        vi.useRealTimers();
      }
    };
    // 21:30 do dia 6 em Brasília = 00:30 UTC do dia 7. Em UTC, "Vence dia 6"
    // já estaria vencida; no negócio, ainda é hoje.
    expect((await vencidosAs("2026-10-07T00:30:00Z")).aReceber.quantidade).toBe(1);
    // 23:59:59 do dia 6 em Brasília: ainda hoje.
    expect((await vencidosAs("2026-10-07T02:59:59Z")).aReceber.quantidade).toBe(1);
    // 00:00 do dia 7 em Brasília: agora sim, venceu.
    expect((await vencidosAs("2026-10-07T03:00:00Z")).aReceber.quantidade).toBe(2);
  });

  it("o fuso escolhido pela conta vale (Manaus, UTC−4)", async () => {
    const c = await cenario();
    await c.t.run(async (ctx) => {
      await ctx.db.patch(c.ids.donaId, { timezone: "America/Manaus" });
      await ctx.db.insert("transactions", {
        userId: c.ids.donaId, eventId: c.ids.evento, type: "income", category: "Contrato",
        description: "Vence dia 6", amount: 1000, date: "2026-10-06", isPaid: false,
      });
    });
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-07T03:30:00Z") }); // 23:30 em Manaus
    try {
      expect((await c.dona.query(api.financeiro.getVencidos, {})).aReceber.quantidade).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    const d = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    expect(d!.fuso).toBe("America/Manaus");
  });

  it("sem fuso escolhido, a aba recebe America/Sao_Paulo", async () => {
    const c = await cenario();
    const d = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    expect(d!.fuso).toBe("America/Sao_Paulo");
  });

  it("vencido do Dashboard é o SALDO da parcial vencida", async () => {
    const c = await cenario();
    await c.registrar(c.ids.p1, 2000, "a");
    // p1 vence em 2026-10-01: com o relógio em 06/10 ela está vencida.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-06T15:00:00Z") });
    try {
      const v = await c.dona.query(api.financeiro.getVencidos, {});
      expect(v.aReceber).toEqual({ quantidade: 1, total: 3000 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isolamento entre contas", () => {
  it("a rival não lê os pagamentos do evento da dona", async () => {
    const c = await cenario();
    expect(await c.rival.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento })).toBeNull();
  });

  it("nem registra, nem anula, nem planeja, nem define valor — e nada muda", async () => {
    const c = await cenario();
    const { id } = await c.registrar(c.ids.p1, 1000, "a");
    const antes = await c.linha(c.ids.p1);

    await expect(
      c.rival.mutation(api.financeiro.registrarRecebimento, { id: c.ids.p1, chave: "r", valor: 1, data: "2026-10-05" }),
    ).rejects.toThrow(/NOT_FOUND|não encontrado/i);
    await expect(
      c.rival.mutation(api.financeiro.anularRecebimento, { id: c.ids.p1, recebimentoId: id, motivo: "x" }),
    ).rejects.toThrow(/NOT_FOUND|não encontrado/i);
    await expect(
      c.rival.mutation(api.financeiro.adicionarParcelas, {
        eventId: c.ids.evento, chave: "r", parcelas: [{ descricao: "x", valor: 1, vencimento: "2027-01-01" }],
      }),
    ).rejects.toThrow(/NOT_FOUND|não encontrado/i);
    await expect(
      c.rival.mutation(api.financeiro.definirValorContratado, { eventId: c.ids.evento, valor: 1 }),
    ).rejects.toThrow(/NOT_FOUND|não encontrado/i);

    expect(await c.linha(c.ids.p1)).toEqual(antes);
  });

  it("deslogado não registra", async () => {
    const c = await cenario();
    await expect(
      c.t.mutation(api.financeiro.registrarRecebimento, { id: c.ids.p1, chave: "z", valor: 1, data: "2026-10-05" }),
    ).rejects.toThrow();
  });
});
