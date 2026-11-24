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
// A QUEM ELA PAGOU — NA DESPESA LANÇADA À MÃO
//
// Só a despesa NASCIDA DE UMA COMPRA tinha fornecedor, e por caminho de volta
// (`purchaseItems.by_transaction`). O eletricista, o motoboy e a van saíam com
// a coluna vazia no extrato que vai para a contadora.
//
// O que estes testes protegem:
//
//  · receita NÃO guarda fornecedor — do outro lado dela está a cliente;
//  · o que ela digitou manda; a compra é o caminho de volta;
//  · `null` LIMPA e `""` não grava fornecedor em branco;
//  · fornecedor de outra conta não vaza para o extrato dela.
// ═════════════════════════════════════════════════════════════════════════════

const MES = "2026-11";

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Dona", email: "dona@ex.com", role: "user" });
  const outra = await autenticarComo(t, { nome: "Outra", email: "outra@ex.com", role: "user" });
  return { t, dona, outra };
}

describe("fornecedor da despesa lançada à mão", () => {
  it("grava o que ela digitou e devolve no extrato", async () => {
    const { dona } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, {
      type: "expense",
      category: "Serviços",
      description: "Instalação elétrica do salão",
      amount: 500,
      date: `${MES}-10`,
      isPaid: true,
      paidAt: `${MES}-10`,
      supplier: "  Eletricista do Zé  ",
    });

    const pagina = await dona.query(api.financeiro.extratoPagina, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    const linha = pagina.page.find((l) => l.description === "Instalação elétrica do salão");
    // Espaço em volta não vira parte do nome.
    expect(linha?.fornecedor).toBe("Eletricista do Zé");
  });

  it("receita não guarda fornecedor, mesmo se o campo vier preenchido", async () => {
    const { t, dona } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, {
      type: "income",
      category: "Entrada",
      description: "Sinal da cliente",
      amount: 1000,
      date: `${MES}-05`,
      isPaid: false,
      supplier: "não deveria ficar",
    });
    const linhas = await t.run(async (ctx: MutationCtx) =>
      ctx.db.query("transactions").collect(),
    );
    const receita = linhas.find((l) => l.description === "Sinal da cliente");
    expect(receita?.supplier).toBeUndefined();
  });

  it("campo em branco não grava fornecedor vazio", async () => {
    const { t, dona } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, {
      type: "expense",
      category: "Serviços",
      description: "Despesa sem fornecedor",
      amount: 80,
      date: `${MES}-11`,
      isPaid: false,
      supplier: "   ",
    });
    const linhas = await t.run(async (ctx: MutationCtx) =>
      ctx.db.query("transactions").collect(),
    );
    const despesa = linhas.find((l) => l.description === "Despesa sem fornecedor");
    // AUSENTE, não string vazia: é a diferença entre "não informado" e
    // "informado como nada".
    expect(despesa?.supplier).toBeUndefined();
  });

  it("editar limpa com null e troca com texto", async () => {
    const { t, dona } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, {
      type: "expense",
      category: "Serviços",
      description: "Van da montagem",
      amount: 300,
      date: `${MES}-12`,
      isPaid: false,
      supplier: "Van do Carlos",
    });

    await dona.mutation(api.financeiro.updateTransaction, { id, supplier: "Van da Dona Rita" });
    let linha = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(linha?.supplier).toBe("Van da Dona Rita");

    await dona.mutation(api.financeiro.updateTransaction, { id, supplier: null });
    linha = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(linha?.supplier).toBeUndefined();
    // Limpar o fornecedor não mexeu em mais nada da linha.
    expect(linha?.description).toBe("Van da montagem");
    // `transactions.amount` está em REAIS (`emCentavos` aqui só arredonda em
    // duas casas; o mundo de centavos é o das parcelas, em
    // `lib/pagamentosDoEvento.ts`). Limpar o fornecedor não mexeu no valor.
    expect(linha?.amount).toBe(300);
  });

  it("o que ela digitou tem precedência sobre o fornecedor da compra", async () => {
    const { t, dona } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, {
      type: "expense",
      category: "Flores",
      description: "Rosas da cerimônia",
      amount: 400,
      date: `${MES}-13`,
      isPaid: true,
      paidAt: `${MES}-13`,
      supplier: "Floricultura da esquina",
    });

    // A mesma despesa também é apontada por uma compra, com OUTRO fornecedor.
    await t.run(async (ctx: MutationCtx) => {
      const dona = await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona@ex.com"))
        .unique();
      if (!dona) throw new Error("conta não criada");
      const eventId = await ctx.db.insert("events", {
        userId: dona._id, name: "TESTE", type: "wedding", date: `${MES}-20`,
        location: "Fazenda", clientName: "Cliente", status: "confirmed",
      });
      await ctx.db.insert("purchaseItems", {
        userId: dona._id, eventId, name: "Rosas", quantity: 1,
        isPurchased: true,
        order: 0,
        supplier: "CEASA", transactionId: id,
      });
    });

    const pagina = await dona.query(api.financeiro.extratoPagina, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    const linha = pagina.page.find((l) => l.description === "Rosas da cerimônia");
    expect(linha?.fornecedor).toBe("Floricultura da esquina");
  });

  it("a conta vizinha não vê a despesa nem o fornecedor dela", async () => {
    const { dona, outra } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, {
      type: "expense",
      category: "Serviços",
      description: "Segredo da dona",
      amount: 100,
      date: `${MES}-14`,
      isPaid: false,
      supplier: "Fornecedor da dona",
    });
    const pagina = await outra.query(api.financeiro.extratoPagina, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(pagina.page.map((l) => l.description)).not.toContain("Segredo da dona");
    expect(JSON.stringify(pagina.page)).not.toContain("Fornecedor da dona");
  });
});
