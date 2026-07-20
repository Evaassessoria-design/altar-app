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

export const listLeads = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return ctx.db
      .query("leads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const createLead = mutation({
  args: {
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    eventType: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    stage: v.union(
      v.literal("contact"),
      v.literal("quote_sent"),
      v.literal("contracted"),
      v.literal("discarded"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    // Get max order for this stage
    const stageleads = await ctx.db
      .query("leads")
      .withIndex("by_user_stage", (q) => q.eq("userId", user._id).eq("stage", args.stage))
      .collect();
    const maxOrder = stageleads.reduce((m, l) => Math.max(m, l.order), -1);
    return ctx.db.insert("leads", { userId: user._id, ...args, order: maxOrder + 1 });
  },
});

export const updateLead = mutation({
  args: {
    id: v.id("leads"),
    clientName: v.optional(v.string()),
    clientPhone: v.optional(v.string()),
    eventType: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    stage: v.optional(
      v.union(
        v.literal("contact"),
        v.literal("quote_sent"),
        v.literal("contracted"),
        v.literal("discarded"),
      ),
    ),
    notes: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const lead = await ctx.db.get(args.id);
    if (!lead || lead.userId !== user._id)
      throw new ConvexError({ message: "Lead não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const deleteLead = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const lead = await ctx.db.get(args.id);
    if (!lead || lead.userId !== user._id)
      throw new ConvexError({ message: "Lead não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});

export const convertToEvent = mutation({
  args: {
    leadId: v.id("leads"),
    eventName: v.string(),
    eventDate: v.string(),
    location: v.string(),
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    budget: v.optional(v.number()),
    type: v.union(
      v.literal("wedding"),
      v.literal("corporate"),
      v.literal("birthday"),
      v.literal("debutante"),
      v.literal("baptism"),
      v.literal("other"),
    ),
  },
  handler: async (ctx, args): Promise<string> => {
    const user = await getAuthUser(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.userId !== user._id)
      throw new ConvexError({ message: "Lead não encontrado", code: "NOT_FOUND" });

    const { leadId, eventName, eventDate, ...rest } = args;
    const eventId = await ctx.db.insert("events", {
      userId: user._id,
      name: eventName,
      date: eventDate,
      ...rest,
      status: "planning",
    });

    await ctx.db.patch(leadId, {
      stage: "contracted",
      convertedEventId: eventId,
    });

    return eventId;
  },
});
