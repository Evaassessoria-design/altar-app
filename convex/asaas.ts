"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";

// Production API
const ASAAS_BASE = "https://api.asaas.com/v3";

function asaasHeaders() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new ConvexError({ message: "ASAAS_API_KEY não configurada. Adicione nos Secrets do Altar.", code: "BAD_REQUEST" });
  return {
    "Content-Type": "application/json",
    "access_token": key,
    "User-Agent": "Altar-SaaS/1.0",
  };
}

async function asaasFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...options,
    headers: {
      ...asaasHeaders(),
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ConvexError({ message: `Asaas retornou resposta inválida: ${text.slice(0, 200)}`, code: "EXTERNAL_SERVICE_ERROR" });
  }

  if (!res.ok) {
    const msg =
      (data as { errors?: Array<{ description: string }> })?.errors?.[0]?.description ??
      (data as { message?: string })?.message ??
      `Erro Asaas HTTP ${res.status}`;
    throw new ConvexError({ message: msg, code: "EXTERNAL_SERVICE_ERROR" });
  }

  return data;
}

// ── Create Asaas customer + subscription and return payment URL ─────────────

export const createCheckoutSession = action({
  args: {
    userName: v.string(),
    userEmail: v.string(),
    userId: v.id("users"),
    existingCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ paymentUrl: string; customerId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Não autenticado", code: "UNAUTHENTICATED" });

    let customerId = args.existingCustomerId ?? "";

    // 1. Create customer if not exists yet
    if (!customerId) {
      const customer = await asaasFetch("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: args.userName || "Usuário Altar",
          email: args.userEmail,
          externalReference: args.userId,
          notificationDisabled: false,
        }),
      }) as { id: string };

      customerId = customer.id;
      await ctx.runMutation(internal.users.setAsaasCustomer, {
        userId: args.userId,
        asaasCustomerId: customerId,
      });
    }

    // 2. Create monthly subscription — UNDEFINED lets customer pick payment method
    const today = new Date();
    const nextDue = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    const subscription = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED",
        value: 79.9,
        nextDueDate: nextDue,
        cycle: "MONTHLY",
        description: "Altar Pro — Plano Mensal",
        externalReference: args.userId,
        // No maxPayments = indefinite
      }),
    }) as { id: string; paymentLink: string | null };

    // Save subscriptionId immediately so webhook can match
    await ctx.runMutation(internal.users.setAsaasSubscription, {
      userId: args.userId,
      asaasSubscriptionId: subscription.id,
    });

    // 3. Get payment URL from first generated charge
    const payments = await asaasFetch(
      `/payments?subscription=${subscription.id}&limit=1`,
    ) as {
      data: Array<{ invoiceUrl: string | null; id: string }>;
    };

    const firstPayment = payments.data?.[0];
    const paymentUrl =
      firstPayment?.invoiceUrl ??
      (firstPayment?.id ? `https://www.asaas.com/i/${firstPayment.id}` : null) ??
      subscription.paymentLink ??
      "https://www.asaas.com";

    return { paymentUrl, customerId };
  },
});

// ── Cancel subscription ─────────────────────────────────────────────────────

export const cancelSubscription = action({
  args: { asaasSubscriptionId: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Não autenticado", code: "UNAUTHENTICATED" });

    await asaasFetch(`/subscriptions/${args.asaasSubscriptionId}`, {
      method: "DELETE",
    });

    await ctx.runMutation(internal.users.cancelSubscriptionBySubscriptionId, {
      asaasSubscriptionId: args.asaasSubscriptionId,
    });

    return { ok: true };
  },
});

// ── Get Asaas customer portal URL ────────────────────────────────────────────

export const getCustomerPortalUrl = action({
  args: { asaasCustomerId: v.string() },
  handler: async (_ctx, args): Promise<{ url: string }> => {
    return { url: `https://www.asaas.com/c/${args.asaasCustomerId}` };
  },
});
