import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Called after auth callback to sync user data
export const updateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: identity.name ?? existing.name,
        email: identity.email ?? existing.email,
      });
      return existing._id;
    }

    // New user — start 14-day trial. First user becomes admin.
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 14);

    const allUsers = await ctx.db.query("users").take(1);
    const isFirstUser = allUsers.length === 0;

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "Usuário",
      email: identity.email ?? "",
      role: isFirstUser ? "admin" : "user",
      subscriptionStatus: "trial",
      trialStartDate: now.toISOString(),
      trialEndDate: trialEnd.toISOString(),
    });
    return userId;
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
  },
});

export const getSubscriptionStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) return null;

    // Check if trial has expired
    if (user.subscriptionStatus === "trial" && user.trialEndDate) {
      const trialEnd = new Date(user.trialEndDate);
      if (trialEnd < new Date()) {
        return { ...user, subscriptionStatus: "expired" as const };
      }
      const daysLeft = Math.ceil(
        (trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      return { ...user, daysLeft };
    }

    return user;
  },
});

export const activateSubscription = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Não autenticado", code: "UNAUTHENTICATED" });

    const caller = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!caller || caller.role !== "admin") {
      throw new ConvexError({ message: "Sem permissão", code: "FORBIDDEN" });
    }

    await ctx.db.patch(args.userId, { subscriptionStatus: "active" });
  },
});

// Mark onboarding as complete
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return;
    await ctx.db.patch(user._id, { onboardingCompleted: true });
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    studioName: v.optional(v.string()),
    currency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Não autenticado", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new ConvexError({ message: "Usuário não encontrado", code: "NOT_FOUND" });

    const patch: {
      name?: string;
      phone?: string;
      studioName?: string;
      currency?: string;
      timezone?: string;
      logoStorageId?: typeof args.logoStorageId;
    } = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.phone !== undefined) patch.phone = args.phone;
    if (args.studioName !== undefined) patch.studioName = args.studioName;
    if (args.currency !== undefined) patch.currency = args.currency;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.logoStorageId !== undefined) patch.logoStorageId = args.logoStorageId;

    await ctx.db.patch(user._id, patch);
  },
});

// Generate upload URL for logo
export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Não autenticado", code: "UNAUTHENTICATED" });
    return await ctx.storage.generateUploadUrl();
  },
});

// Get logo URL
export const getLogoUrl = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user?.logoStorageId) return null;
    return await ctx.storage.getUrl(user.logoStorageId);
  },
});

// ── Internal mutations called by Asaas webhook ──────────────────────────────

export const setAsaasCustomer = internalMutation({
  args: { userId: v.id("users"), asaasCustomerId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { asaasCustomerId: args.asaasCustomerId });
  },
});

export const setAsaasSubscription = internalMutation({
  args: { userId: v.id("users"), asaasSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { asaasSubscriptionId: args.asaasSubscriptionId });
  },
});

export const activateSubscriptionByCustomer = internalMutation({
  args: {
    asaasCustomerId: v.string(),
    asaasSubscriptionId: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_asaas_customer", (q) =>
        q.eq("asaasCustomerId", args.asaasCustomerId),
      )
      .unique();
    if (!user) return;
    await ctx.db.patch(user._id, {
      subscriptionStatus: "active",
      asaasSubscriptionId: args.asaasSubscriptionId ?? user.asaasSubscriptionId,
      subscriptionExpiresAt: args.expiresAt,
    });
  },
});

export const cancelSubscriptionByCustomer = internalMutation({
  args: { asaasCustomerId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_asaas_customer", (q) =>
        q.eq("asaasCustomerId", args.asaasCustomerId),
      )
      .unique();
    if (!user) return;
    await ctx.db.patch(user._id, { subscriptionStatus: "cancelled" });
  },
});

export const cancelSubscriptionBySubscriptionId = internalMutation({
  args: { asaasSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_asaas_subscription", (q) =>
        q.eq("asaasSubscriptionId", args.asaasSubscriptionId),
      )
      .unique();
    if (!user) return;
    await ctx.db.patch(user._id, { subscriptionStatus: "cancelled" });
  },
});
