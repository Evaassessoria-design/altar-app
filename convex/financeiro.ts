import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";

async function getAuthUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Não autenticado", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "Usuário não encontrado", code: "NOT_FOUND" });
  return user;
}

const txType = v.union(v.literal("income"), v.literal("expense"));

export const listTransactions = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
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
    const user = await getAuthUser(ctx);
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
    const user = await getAuthUser(ctx);
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
    const user = await getAuthUser(ctx);
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
    const user = await getAuthUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { isPaid: !tx.isPaid });
  },
});

export const deleteTransaction = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});
