import { describe, expect, it, vi } from "vitest";

// Mesma substituição de sessão dos demais testes de banco — ver test.auth.ts.
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
// O FINANCEIRO RECUSA O QUE ESTRAGARIA TODAS AS CONTAS
//
// `addTransaction` recebia `v.number()` e gravava. A tela mandava
// `parseFloat(campo)` — e `parseFloat` devolve `NaN` para qualquer coisa que
// não comece com número. Uma linha com `NaN` não estraga a própria linha:
// estraga receita, despesa, lucro e previsão, todas, para sempre.
//
// Valor negativo é o mesmo problema mais calado: uma "receita" de -500 abaixa
// o total e a soma continua parecendo legítima. O sinal já vem do TIPO.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona",
  });
  const eventId = await t.run(async (ctx: MutationCtx) => {
    const donaId = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona"))
      .unique())!._id;
    return ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-12-12",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });
  });
  return { t, dona, eventId };
}

const lancamento = {
  type: "income" as const,
  category: "Honorários",
  description: "Sinal do contrato",
  date: "2026-09-10",
  isPaid: true,
};

describe("o que o servidor recusa gravar", () => {
  it("NaN não entra", async () => {
    const { dona } = await cenario();
    await expect(
      dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: NaN }),
    ).rejects.toThrow(/valor em reais/i);
  });

  it("infinito não entra", async () => {
    const { dona } = await cenario();
    await expect(
      dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: Infinity }),
    ).rejects.toThrow();
  });

  it("negativo é recusado com o caminho certo no recado", async () => {
    const { dona } = await cenario();
    await expect(
      dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: -500 }),
    ).rejects.toThrow(/Despesa/);
  });

  it("valor com um zero a mais é recusado", async () => {
    const { dona } = await cenario();
    await expect(
      dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 9e12 }),
    ).rejects.toThrow(/zero a mais/i);
  });

  it("editar também confere — a porta dos fundos", async () => {
    const { t, dona } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, amount: 1500,
    });
    await expect(
      dona.mutation(api.financeiro.updateTransaction, { id, amount: NaN }),
    ).rejects.toThrow();
    const tx = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(tx!.amount).toBe(1500);
  });

  it("as parcelas do contrato são conferidas ANTES de gravar a primeira", async () => {
    // Metade criada e metade recusada deixaria o evento num estado que ninguém
    // pediu — e a dedup impediria a segunda tentativa de consertar.
    const { t, dona, eventId } = await cenario();
    await expect(
      dona.mutation(api.financeiro.createReceivablesFromContract, {
        eventId,
        entries: [
          { description: "Sinal", amount: 5000, date: "2026-09-10" },
          { description: "Saldo", amount: NaN, date: "2026-11-10" },
        ],
      }),
    ).rejects.toThrow();
    const todas = await t.run(async (ctx: MutationCtx) =>
      ctx.db.query("transactions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    );
    expect(todas).toHaveLength(0);
  });
});

describe("o que ele aceita, e como grava", () => {
  it("zero passa — cortesia lançada é lançamento", async () => {
    const { t, dona } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 0 });
    const tx = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(tx!.amount).toBe(0);
  });

  it("a terceira casa é arredondada ao centavo, não recusada", async () => {
    // Um contrato dividido em três dá 1/3 do valor.
    const { t, dona } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, amount: 5000 / 3,
    });
    const tx = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(tx!.amount).toBe(1666.67);
  });
});

describe("as somas da tela", () => {
  it("cem lançamentos de dez centavos dão dez reais exatos", async () => {
    const { dona } = await cenario();
    for (let i = 0; i < 100; i++) {
      await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 0.1 });
    }
    const resumo = await dona.query(api.financeiro.getSummary, {});
    expect(resumo.totalIncome).toBe(10);
  });

  it("um NaN gravado ANTES da trava não zera a tela inteira", async () => {
    // A proteção de trás. Quem já tem a linha podre precisa continuar vendo o
    // total do resto — e conseguir encontrar a linha para apagá-la.
    const { t, dona } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 1500 });
    await t.run(async (ctx: MutationCtx) => {
      const donaId = (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona"))
        .unique())!._id;
      await ctx.db.insert("transactions", {
        userId: donaId, type: "income", category: "Honorários",
        description: "Linha podre", amount: NaN, date: "2026-09-11", isPaid: true,
      });
    });
    const resumo = await dona.query(api.financeiro.getSummary, {});
    expect(resumo.totalIncome).toBe(1500);
    expect(Number.isNaN(resumo.profit)).toBe(false);
  });

  it("o lucro é receita menos despesa, ao centavo", async () => {
    const { dona } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 0.3 });
    await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, type: "expense", category: "Flores", amount: 0.1,
    });
    const resumo = await dona.query(api.financeiro.getSummary, {});
    expect(resumo.profit).toBe(0.2);
  });

  it("o financeiro de uma empresa não enxerga o da outra", async () => {
    const { t, dona } = await cenario();
    const outra = await autenticarComo(t, {
      nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
    });
    await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 1500 });
    const resumo = await outra.query(api.financeiro.getSummary, {});
    expect(resumo.totalIncome).toBe(0);
    expect(await outra.query(api.financeiro.listTransactions, {})).toHaveLength(0);
  });
});
