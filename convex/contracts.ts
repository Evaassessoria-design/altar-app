// Convex V8 runtime — mutations and queries for AI/contract features
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server.d.ts";

async function getAuthUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
  return user;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
    return ctx.storage.generateUploadUrl();
  },
});

export const saveContract = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    filename: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    // Delete old contracts for this event
    const existing = await ctx.db
      .query("contracts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const c of existing) {
      await ctx.storage.delete(c.storageId);
      await ctx.db.delete(c._id);
    }
    return ctx.db.insert("contracts", {
      eventId: args.eventId,
      userId: user._id,
      storageId: args.storageId,
      filename: args.filename,
      uploadedAt: new Date().toISOString(),
    });
  },
});

export const getContract = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const contract = await ctx.db
      .query("contracts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (!contract) return null;
    const url = await ctx.storage.getUrl(contract.storageId);
    return { ...contract, url };
  },
});
