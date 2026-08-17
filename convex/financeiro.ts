import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireEventOwner, requireUser } from "./lib/identity";

const txType = v.union(v.literal("income"), v.literal("expense"));

export const listTransactions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const items = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return items.sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const totalIncome = txs
      .filter((t) => t.type === "income" && t.isPaid)
      .reduce((s, t) => s + t.amount, 0);
    const totalExpense = txs
      .filter((t) => t.type === "expense" && t.isPaid)
      .reduce((s, t) => s + t.amount, 0);
    const pendingIncome = txs
      .filter((t) => t.type === "income" && !t.isPaid)
      .reduce((s, t) => s + t.amount, 0);

    // Last 6 months breakdown (paid only)
    const now = new Date();
    const months: { label: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.toISOString().slice(0, 10);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);
      const label = d.toLocaleString("pt-BR", { month: "short" });
      const inMonth = txs.filter((t) => t.isPaid && t.date >= start && t.date <= end);
      months.push({
        label,
        income: inMonth.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
        expense: inMonth.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      });
    }

    return {
      totalIncome,
      totalExpense,
      profit: totalIncome - totalExpense,
      pendingIncome,
      months,
    };
  },
});

export const addTransaction = mutation({
  args: {
    type: txType,
    category: v.string(),
    description: v.string(),
    amount: v.number(),
    date: v.string(),
    isPaid: v.boolean(),
    notes: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    // `eventId` é opcional (lançamento avulso). Quando vier, tem que ser de um
    // evento do próprio usuário.
    const user = args.eventId
      ? (await requireEventOwner(ctx, args.eventId)).user
      : await requireUser(ctx);
    return ctx.db.insert("transactions", { userId: user._id, ...args });
  },
});

export const updateTransaction = mutation({
  args: {
    id: v.id("transactions"),
    type: v.optional(txType),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    date: v.optional(v.string()),
    isPaid: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const togglePaid = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { isPaid: !tx.isPaid });
  },
});

export const deleteTransaction = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});

// ── Contrato → contas a receber ──────────────────────────────────────────────
// Estrutura para abastecer o financeiro a partir do contrato: recebe as parcelas
// JÁ CONFIRMADAS pela decoradora e cria lançamentos de receita (isPaid=false).
// Reutiliza a tabela `transactions` existente — sem estrutura financeira nova.
// NÃO é chamado por IA automaticamente: só após confirmação explícita na UI.
export const createReceivablesFromContract = mutation({
  args: {
    eventId: v.id("events"),
    entries: v.array(
      v.object({
        description: v.string(),
        amount: v.number(),
        date: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    // Dedup: se já existem contas a receber do Contrato neste evento, não recria.
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const alreadyHasContract = existing.some(
      (t) => t.type === "income" && t.category === "Contrato",
    );
    if (alreadyHasContract) {
      return { created: 0, alreadyExists: true };
    }
    let created = 0;
    for (const e of args.entries) {
      await ctx.db.insert("transactions", {
        userId: user._id,
        eventId: args.eventId,
        type: "income",
        category: "Contrato",
        description: e.description,
        amount: e.amount,
        date: e.date,
        isPaid: false,
      });
      created++;
    }
    return { created, alreadyExists: false };
  },
});
