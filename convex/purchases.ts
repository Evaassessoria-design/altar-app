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

export const listPurchases = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    return ctx.db
      .query("purchaseItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === user._id));
  },
});

export const addPurchase = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    supplier: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    // Get max order
    const items = await ctx.db
      .query("purchaseItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const maxOrder = items.reduce((m, i) => Math.max(m, i.order), -1);
    return ctx.db.insert("purchaseItems", {
      ...args,
      userId: user._id,
      isPurchased: false,
      order: maxOrder + 1,
    });
  },
});

export const updatePurchase = mutation({
  args: {
    id: v.id("purchaseItems"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    supplier: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    isPurchased: v.optional(v.boolean()),
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

export const togglePurchase = mutation({
  args: { id: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { isPurchased: !item.isPurchased });
  },
});

export const deletePurchase = mutation({
  args: { id: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});
