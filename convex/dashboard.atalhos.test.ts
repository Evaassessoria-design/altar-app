import { afterEach, describe, expect, it, vi } from "vitest";

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
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// ATALHOS DO DASHBOARD — O NÚMERO E O DESTINO FECHAM
//
// Cada card leva ao recorte que compõe o número. Para isso o número tem de
// ser verdadeiro: a receita do mês não pode contar o mês seguinte, e o
// checklist e as compras não podem parar nos primeiros eventos.
// ═════════════════════════════════════════════════════════════════════════════

afterEach(() => {
  vi.useRealTimers();
});

async function cenario() {
  // Meio-dia de 15/10/2026 em São Paulo: longe das viradas de dia e de mês.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-15T15:00:00Z") });
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora" });
  const rival = await autenticarComo(t, { nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival" });
  const donaId = await t.run(async (ctx: MutationCtx) =>
    (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora")).unique())!._id,
  );
  return { t, dona, rival, donaId };
}

describe("Receita do Mês", () => {
  it("não conta a parcela do mês seguinte já paga — e fecha com o Financeiro filtrado", async () => {
    const { t, dona, donaId } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      const base = { userId: donaId, type: "income" as const, category: "Contrato", isPaid: true };
      await ctx.db.insert("transactions", { ...base, description: "Outubro", amount: 1000, date: "2026-10-05" });
      await ctx.db.insert("transactions", { ...base, description: "Novembro adiantada", amount: 700, date: "2026-11-05" });
      await ctx.db.insert("transactions", { ...base, description: "Setembro", amount: 300, date: "2026-09-30" });
    });
    const painel = await dona.query(api.dashboard.getDashboardStats, {});
    expect(painel.revenueThisMonth).toBe(1000);
    expect(painel.mesDaReceita).toBe("2026-10");

    const livro = await dona.query(api.financeiro.listTransactions, { mes: painel.mesDaReceita });
    expect(livro.mes).toBe("2026-10");
    expect(livro.itens.map((x) => x.description)).toEqual(["Outubro"]);
    const recebidas = livro.itens.filter((x) => x.type === "income" && x.isPaid).reduce((a, x) => a + x.amount, 0);
    expect(recebidas).toBe(painel.revenueThisMonth);
  });

  it("mês inválido na URL não filtra nada escondido: devolve o livro inteiro e diz que não filtrou", async () => {
    const { t, dona, donaId } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("transactions", { userId: donaId, type: "income", category: "x", description: "a", amount: 1, date: "2026-01-01", isPaid: false });
    });
    for (const mes of ["2026-13", "outubro", "2026-1", ""]) {
      const livro = await dona.query(api.financeiro.listTransactions, { mes });
      expect(livro.mes).toBeNull();
      expect(livro.itens).toHaveLength(1);
    }
  });

  it("o filtro de mês não atravessa a conta", async () => {
    const { t, rival, donaId } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("transactions", { userId: donaId, type: "income", category: "x", description: "da dona", amount: 1, date: "2026-10-01", isPaid: true });
    });
    const livro = await rival.query(api.financeiro.listTransactions, { mes: "2026-10" });
    expect(livro.itens).toHaveLength(0);
  });
});

describe("checklist e compras contam TODOS os eventos dos próximos 30 dias", () => {
  it("com 7 eventos na janela, nenhum fica de fora — e o recorte lista cada um", async () => {
    const { t, dona, donaId } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      for (let i = 1; i <= 7; i++) {
        const ev = await ctx.db.insert("events", {
          userId: donaId, name: `Evento ${i}`, type: "wedding", date: `2026-10-${String(15 + i).padStart(2, "0")}`,
          location: "Salão", clientName: "C", status: "confirmed",
        });
        await ctx.db.insert("checklistItems", { userId: donaId, eventId: ev, name: "Toalhas", order: 0, isChecked: false, phase: "pre" });
        await ctx.db.insert("checklistItems", { userId: donaId, eventId: ev, name: "Conferir", order: 1, isChecked: false, phase: "post" });
        await ctx.db.insert("checklistItems", { userId: donaId, eventId: ev, name: "Feito", order: 2, isChecked: true, phase: "pre" });
        for (let k = 0; k < 2; k++) {
          await ctx.db.insert("purchaseItems", { userId: donaId, eventId: ev, name: `Item ${k}`, isPurchased: false, order: k });
        }
      }
      // Fora da janela de 30 dias: não entra no número.
      const longe = await ctx.db.insert("events", {
        userId: donaId, name: "Longe", type: "wedding", date: "2026-12-20", location: "x", clientName: "C", status: "confirmed",
      });
      await ctx.db.insert("checklistItems", { userId: donaId, eventId: longe, name: "x", order: 0, isChecked: false, phase: "pre" });
    });
    const painel = await dona.query(api.dashboard.getDashboardStats, {});
    expect(painel.pendingChecklistCount).toBe(14);
    expect(painel.checklistPorEvento).toHaveLength(7);
    expect(painel.checklistPorEvento.every((e) => e.pre === 1 && e.post === 1)).toBe(true);
    expect(painel.checklistPorEvento.reduce((a, e) => a + e.pre + e.post, 0)).toBe(painel.pendingChecklistCount);

    expect(painel.pendingPurchasesCount).toBe(14);
    expect(painel.comprasPorEvento.reduce((a, e) => a + e.pendentes, 0)).toBe(painel.pendingPurchasesCount);
  });

  it("cada barra de mês diz qual mês é, para o atalho abrir o mês certo", async () => {
    const { dona } = await cenario();
    const painel = await dona.query(api.dashboard.getDashboardStats, {});
    expect(painel.monthlyData.map((m) => m.mes)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  });
});
