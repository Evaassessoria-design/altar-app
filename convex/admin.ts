import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";

// ─── Auth helpers ──────────────────────────────────────────────────────────

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user || user.role !== "admin") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Acesso restrito a administradores" });
  }
  return user;
}

// ─── Queries ──────────────────────────────────────────────────────────────

export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    return user?.role === "admin";
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();

    const total = users.length;
    const trial = users.filter((u) => u.subscriptionStatus === "trial").length;
    const active = users.filter((u) => u.subscriptionStatus === "active").length;
    const expired = users.filter((u) => u.subscriptionStatus === "expired").length;
    const cancelled = users.filter((u) => u.subscriptionStatus === "cancelled").length;

    // MRR = active subscribers × R$79,90
    const mrr = active * 79.9;

    // Trial conversion rate = active / (active + expired) if > 0
    const conversionDenominator = active + expired;
    const conversionRate = conversionDenominator > 0
      ? Math.round((active / conversionDenominator) * 100)
      : 0;

    // Events count
    const eventsTotal = await ctx.db.query("events").collect();

    return {
      total,
      trial,
      active,
      expired,
      cancelled,
      mrr,
      conversionRate,
      eventsTotal: eventsTotal.length,
    };
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").collect();
    // Annotate with event counts
    const result = await Promise.all(
      users.map(async (u) => {
        const events = await ctx.db
          .query("events")
          .withIndex("by_user", (q) => q.eq("userId", u._id))
          .collect();
        return { ...u, eventCount: events.length };
      }),
    );
    return result;
  },
});

// ─── Mutations ─────────────────────────────────────────────────────────────

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.userId, { role: args.role });
  },
});

export const updateUserSubscription = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("trial"),
      v.literal("active"),
      v.literal("expired"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const patch: {
      subscriptionStatus: "trial" | "active" | "expired" | "cancelled";
      trialEndDate?: string;
    } = { subscriptionStatus: args.status };
    // If reactivating trial, extend 14 days from now
    if (args.status === "trial") {
      const end = new Date();
      end.setDate(end.getDate() + 14);
      patch.trialEndDate = end.toISOString();
    }
    await ctx.db.patch(args.userId, patch);
  },
});

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx);
    if (me._id === args.userId) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Não é possível excluir sua própria conta" });
    }
    await ctx.db.delete(args.userId);
  },
});
