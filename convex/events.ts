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

const eventType = v.union(
  v.literal("wedding"),
  v.literal("corporate"),
  v.literal("birthday"),
  v.literal("debutante"),
  v.literal("baptism"),
  v.literal("other"),
);

const eventStatus = v.union(
  v.literal("planning"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const list = query({
  args: {
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("upcoming"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const events = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const nowIso = new Date().toISOString();
    const filter = args.filter ?? "all";

    const filtered = events.filter((e) => {
      switch (filter) {
        case "upcoming":
          return e.date >= nowIso && e.status !== "completed" && e.status !== "cancelled";
        case "completed":
          return e.status === "completed";
        case "cancelled":
          return e.status === "cancelled";
        default:
          return true;
      }
    });

    return filtered.sort((a, b) => a.date.localeCompare(b.date));
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== user._id) return null;
    return event;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: eventType,
    date: v.string(),
    location: v.string(),
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    budget: v.optional(v.number()),
    status: eventStatus,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    return ctx.db.insert("events", { userId: user._id, ...args });
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    name: v.optional(v.string()),
    type: v.optional(eventType),
    date: v.optional(v.string()),
    location: v.optional(v.string()),
    clientName: v.optional(v.string()),
    clientPhone: v.optional(v.string()),
    budget: v.optional(v.number()),
    status: v.optional(eventStatus),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== user._id)
      throw new ConvexError({ message: "Evento não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== user._id)
      throw new ConvexError({ message: "Evento não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});
