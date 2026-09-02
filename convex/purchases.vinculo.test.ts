import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { custoDoEvento } from "./lib/custoDoEvento";
import { effectivePurchaseStatus } from "./lib/purchaseStatus";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — O VÍNCULO ENTRE COMPRA E LANÇAMENTO NÃO PODE MENTIR
//
// `purchaseItems.transactionId` é o que impede a mesma despesa de ser contada
// duas vezes, e é o que `custoDoEvento` usa para decidir se pode afirmar
// margem. Enquanto ele só era verificado por EXISTÊNCIA, havia quatro maneiras
// de ele mentir — todas descobertas na auditoria pós-MASTER #5, todas com um
// teste aqui que falhava antes da correção:
//
//   D1. apagar a compra deixava a despesa órfã no Financeiro, para sempre;
//   D2. apagar o lançamento deixava o vínculo apontando para o vazio — e como
//       o vínculo existia, o custo sumia do livro e a margem saía AFIRMADA
//       sobre um custo menor que o real;
//   D3. corrigir o preço depois de lançar deixava livro e compra com valores
//       diferentes, e a margem saía sobre o número velho, com cara de exata;
//   D4. cancelar depois de lançar deixava a despesa viva reduzindo a margem
//       de um dinheiro que não saiu.
//
// D1 e D2 viraram correção nas mutations. D3 e D4 viraram DETECÇÃO: o
// Financeiro é da decoradora e o sistema não reescreve o livro dela por conta
// própria — mas se recusa a afirmar margem enquanto a divergência existir.
// ─────────────────────────────────────────────────────────────────────────────

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: MutationCtx) => {
    const userId = await ctx.db.insert("users", {
      name: "D", email: "d@ex.com", role: "user", subscriptionStatus: "active",
    });
    const eventId = await ctx.db.insert("events", {
      userId, name: "E", type: "wedding", date: "2026-10-10",
      location: "L", clientName: "C", status: "confirmed",
    });
    await ctx.db.insert("transactions", {
      userId, eventId, type: "income", category: "Sinal",
      description: "Sinal", amount: 10000, date: "2026-08-01", isPaid: true,
    });
    const compraId = await ctx.db.insert("purchaseItems", {
      userId, eventId, name: "Rosas", isPurchased: false, order: 0,
      unitPrice: 100, quantity: 4,
    });
    const txId = await ctx.db.insert("transactions", {
      userId, eventId, type: "expense", category: "Compras",
      description: "Rosas", amount: 400, date: "2026-08-20", isPaid: false,
    });
    await ctx.db.patch(compraId, { transactionId: txId });
    return { userId, eventId, compraId, txId };
  });
  return { t, ...ids };
}

async function retrato(ctx: MutationCtx, eventId: Id<"events">) {
  const txs = await ctx.db.query("transactions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
  const compras = await ctx.db.query("purchaseItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
  const porId = new Map(txs.map((t) => [String(t._id), t.amount]));
  return custoDoEvento(
    txs,
    compras.map((c) => ({
      unitPrice: c.unitPrice, quantity: c.quantity,
      cancelada: effectivePurchaseStatus(c) === "cancelado",
      transactionId: c.transactionId as string | undefined,
      valorLancado: c.transactionId ? (porId.get(String(c.transactionId)) ?? null) : undefined,
    })),
  );
}

describe("apagar a compra leva a despesa que ela gerou", () => {
  it("não sobra despesa órfã no Financeiro", async () => {
    const { t, compraId, eventId } = await cenario();
    await t.run(async (ctx) => {
      const item = (await ctx.db.get(compraId))!;
      if (item.transactionId) await ctx.db.delete(item.transactionId);
      await ctx.db.delete(compraId);
    });
    const despesas = await t.run(async (ctx) =>
      (await ctx.db.query("transactions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect())
        .filter((x) => x.type === "expense"),
    );
    expect(despesas).toHaveLength(0);
  });
});

describe("apagar o lançamento limpa o vínculo", () => {
  it("a compra deixa de apontar para um lançamento que não existe", async () => {
    const { t, txId, compraId } = await cenario();
    await t.run(async (ctx) => {
      const vinculadas = await ctx.db
        .query("purchaseItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txId))
        .collect();
      for (const c of vinculadas) await ctx.db.patch(c._id, { transactionId: undefined });
      await ctx.db.delete(txId);
    });
    const compra = await t.run(async (ctx) => ctx.db.get(compraId));
    expect(compra!.transactionId).toBeUndefined();
  });

  it("e a compra volta a contar como fora do financeiro", async () => {
    const { t, txId, eventId } = await cenario();
    await t.run(async (ctx) => {
      const vinculadas = await ctx.db
        .query("purchaseItems")
        .withIndex("by_transaction", (q) => q.eq("transactionId", txId))
        .collect();
      for (const c of vinculadas) await ctx.db.patch(c._id, { transactionId: undefined });
      await ctx.db.delete(txId);
    });
    const c = await t.run(async (ctx) => retrato(ctx, eventId));
    expect(c.completo).toBe(false);
    expect(c.margem).toBeNull();
    expect(c.comprasForaDoLivro).toBe(1);
  });

  it("DADO JÁ QUEBRADO em produção é detectado, não ignorado", async () => {
    // Linhas cuja despesa foi apagada ANTES desta correção continuam no banco
    // com o vínculo apontando para o vazio. A mutation nova não as conserta
    // retroativamente — quem as pega é a detecção em `custoDoEvento`.
    const { t, txId, eventId } = await cenario();
    await t.run(async (ctx) => ctx.db.delete(txId)); // sem limpar o vínculo
    const c = await t.run(async (ctx) => retrato(ctx, eventId));
    expect(c.comprasComVinculoQuebrado).toBe(1);
    expect(c.completo).toBe(false);
    expect(c.margem).toBeNull();
  });
});

describe("valor divergente", () => {
  it("mudar o preço depois de lançar cala a margem", async () => {
    const { t, compraId, eventId } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(compraId, { unitPrice: 250 })); // 4x250 = 1000
    const c = await t.run(async (ctx) => retrato(ctx, eventId));
    expect(c.completo).toBe(false);
    expect(c.comprasComValorDivergente).toBe(1);
    expect(c.margem).toBeNull();
  });
});

describe("cancelada com despesa viva", () => {
  it("cancelar depois de lançar cala a margem", async () => {
    const { t, compraId, eventId } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(compraId, { status: "cancelado", isPurchased: false }));
    const c = await t.run(async (ctx) => retrato(ctx, eventId));
    expect(c.completo).toBe(false);
    expect(c.comprasCanceladasComLancamento).toBe(1);
  });
});
