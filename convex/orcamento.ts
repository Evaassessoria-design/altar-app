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

export const listItems = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    return ctx.db
      .query("budgetItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === user._id).sort((a, b) => a.order - b.order));
  },
});

export const getSummary = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const event = await ctx.db.get(args.eventId);
    if (!event || event.userId !== user._id)
      throw new ConvexError({ message: "Evento não encontrado", code: "NOT_FOUND" });

    const budgetItems = await ctx.db
      .query("budgetItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === user._id));

    const quotedIncome = budgetItems
      .filter((i) => i.type === "income")
      .reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const quotedExpense = budgetItems
      .filter((i) => i.type === "expense")
      .reduce((s, i) => s + i.quantity * i.unitPrice, 0);

    // Real costs from purchases
    const purchases = await ctx.db
      .query("purchaseItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === user._id));
    const realPurchases = purchases.reduce(
      (s, p) => s + (p.unitPrice ?? 0) * (p.quantity ?? 1),
      0,
    );

    // Real financials from transactions
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === user._id && i.isPaid));
    const realIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const realExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);

    const totalRealExpense = realExpense + realPurchases;
    const estimatedBudget = event.budget ?? 0;
    const profit = realIncome - totalRealExpense;
    const margin = realIncome > 0 ? (profit / realIncome) * 100 : 0;

    return {
      estimatedBudget,
      quotedIncome,
      quotedExpense,
      quotedProfit: quotedIncome - quotedExpense,
      realIncome,
      realExpense: totalRealExpense,
      profit,
      margin,
      itemCount: budgetItems.length,
    };
  },
});

export const addItem = mutation({
  args: {
    eventId: v.id("events"),
    description: v.string(),
    category: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    type: v.union(v.literal("income"), v.literal("expense")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const items = await ctx.db
      .query("budgetItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const maxOrder = items.reduce((m, i) => Math.max(m, i.order), -1);
    return ctx.db.insert("budgetItems", { ...args, userId: user._id, order: maxOrder + 1 });
  },
});

export const updateItem = mutation({
  args: {
    id: v.id("budgetItems"),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unitPrice: v.optional(v.number()),
    type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const deleteItem = mutation({
  args: { id: v.id("budgetItems") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});
