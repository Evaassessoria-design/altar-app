// Convex V8 runtime — mutations and queries for AI/contract features
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireIdentity, requireUser } from "./lib/identity";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
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
    const user = await requireUser(ctx);
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
