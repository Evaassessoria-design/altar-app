import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import { getOptionalUser, requireUser } from "./lib/identity";
import { resolveAccess } from "./lib/access";

// ─── Auth helpers ──────────────────────────────────────────────────────────

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Acesso restrito a administradores" });
  }
  return user;
}

// ─── Queries ──────────────────────────────────────────────────────────────

export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    return user?.role === "admin";
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();

    const total = users.length;

    // Contas isentas (internal / beta vigente) NÃO são receita. Ficam fora do
    // MRR e da taxa de conversão para não inflarem as métricas do negócio.
    const exempt = users.filter((u) => resolveAccess(u).billingExempt);
    const internal = users.filter((u) => (u.accessType ?? "client") === "internal").length;
    const beta = users.filter((u) => (u.accessType ?? "client") === "beta").length;
    const billable = users.filter((u) => !resolveAccess(u).billingExempt);

    const trial = billable.filter((u) => u.subscriptionStatus === "trial").length;
    const active = billable.filter((u) => u.subscriptionStatus === "active").length;
    const overdue = billable.filter((u) => u.subscriptionStatus === "overdue").length;
    const expired = billable.filter((u) => u.subscriptionStatus === "expired").length;
    const cancelled = billable.filter((u) => u.subscriptionStatus === "cancelled").length;

    // MRR = assinantes ativos e cobráveis × R$119,90
    const mrr = active * 119.9;

    // Conversão = ativos / (ativos + expirados), só entre contas cobráveis
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
      overdue,
      expired,
      cancelled,
      internal,
      beta,
      exemptTotal: exempt.length,
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

/**
 * Define o tipo de acesso de um usuário. É a única porta para marcar uma conta
 * como interna ou beta — protegida por requireAdmin, sem comparação de e-mail
 * em lugar nenhum. Nenhum usuário é alterado automaticamente.
 */
export const setUserAccess = mutation({
  args: {
    userId: v.id("users"),
    accessType: v.union(
      v.literal("client"),
      v.literal("beta"),
      v.literal("internal"),
    ),
    // Epoch ms. Só faz sentido com accessType "beta".
    accessExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    }
    if (args.accessType === "beta" && args.accessExpiresAt === undefined) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Defina a data de expiração do acesso beta.",
      });
    }
    await ctx.db.patch(args.userId, {
      accessType: args.accessType,
      // Fora do beta a data não tem efeito — limpamos para não deixar resíduo.
      accessExpiresAt: args.accessType === "beta" ? args.accessExpiresAt : undefined,
    });
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
