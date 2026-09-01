import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO DOS AVISOS DO ASAAS
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
// Uma cliente pagou no cartão, o Asaas confirmou, e a conta continuou em
// "trial". Ao investigar, a pergunta mais básica — "o aviso chegou?" — não
// tinha resposta possível: o ALTAR recebia o webhook, agia (ou não) e não
// guardava nada. Não dava para distinguir "o Asaas nunca mandou" de "chegou e
// não casou com ninguém". São problemas diferentes, com soluções diferentes.
//
// ── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────
// O Asaas reenvia um aviso quando não recebe 200 — e uma fila reprocessada
// reenvia tudo. A reserva da chave (`claim`) e a verificação de duplicata
// acontecem DENTRO DA MESMA MUTATION, que no Convex é transacional. Duas
// entregas simultâneas do mesmo aviso não conseguem as duas reservar: a
// segunda enxerga a primeira e devolve "duplicate".
//
// ── O QUE NÃO É GUARDADO ────────────────────────────────────────────────────
// O payload completo NÃO é armazenado. Só o evento, os identificadores, o
// valor e o desfecho. Nada de cartão, nada de dado pessoal.
// ─────────────────────────────────────────────────────────────────────────────

export type DesfechoDoAviso =
  | "received"
  | "applied"
  | "duplicate"
  | "no_match"
  | "ignored"
  | "error";

/**
 * Reserva a chave do aviso. Devolve `duplicate` se já houver registro dela.
 *
 * O registro nasce como `received`; `finish` grava o desfecho. Um aviso que
 * ficar preso em `received` denuncia um processamento que morreu no meio —
 * informação que antes se perdia por completo.
 */
export const claim = internalMutation({
  args: {
    dedupKey: v.string(),
    event: v.string(),
    asaasCustomerId: v.optional(v.string()),
    asaasSubscriptionId: v.optional(v.string()),
    asaasPaymentId: v.optional(v.string()),
    value: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "claimed"; id: Id<"asaasWebhookEvents"> } | { status: "duplicate" }> => {
    const existente = await ctx.db
      .query("asaasWebhookEvents")
      .withIndex("by_dedup_key", (q) => q.eq("dedupKey", args.dedupKey))
      .first();

    if (existente) return { status: "duplicate" };

    const id = await ctx.db.insert("asaasWebhookEvents", {
      ...args,
      receivedAt: Date.now(),
      outcome: "received",
    });
    return { status: "claimed", id };
  },
});

/** Fecha o registro com o desfecho real do processamento. */
export const finish = internalMutation({
  args: {
    id: v.id("asaasWebhookEvents"),
    outcome: v.string(),
    matchedBy: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...campos } = args;
    await ctx.db.patch(id, campos);
  },
});

/** Registro de um aviso duplicado, para que a repetição fique visível. */
export const recordDuplicate = internalMutation({
  args: { dedupKey: v.string(), event: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("asaasWebhookEvents", {
      dedupKey: `${args.dedupKey}#repetido:${Date.now()}`,
      event: args.event,
      receivedAt: Date.now(),
      outcome: "duplicate",
      detail: `Aviso repetido de ${args.dedupKey} — ignorado sem reprocessar.`,
    });
  },
});

/** Usado pela reconciliação para não depender do webhook. */
export const recordReconciliation = internalMutation({
  args: {
    userId: v.id("users"),
    outcome: v.string(),
    detail: v.string(),
    asaasCustomerId: v.optional(v.string()),
    asaasSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agora = Date.now();
    await ctx.db.insert("asaasWebhookEvents", {
      dedupKey: `reconciliacao:${args.userId}:${agora}`,
      event: "RECONCILIACAO",
      receivedAt: agora,
      outcome: args.outcome,
      userId: args.userId,
      detail: args.detail,
      asaasCustomerId: args.asaasCustomerId,
      asaasSubscriptionId: args.asaasSubscriptionId,
    });
  },
});

/** Contas cobráveis com cliente no Asaas que ainda não estão ativas. */
export const listCandidatesForReconciliation = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (u) =>
          !!u.asaasCustomerId &&
          u.subscriptionStatus !== "active" &&
          u.subscriptionStatus !== "cancelled",
      )
      .slice(0, args.limit ?? 50)
      .map((u) => ({
        userId: u._id,
        asaasCustomerId: u.asaasCustomerId!,
        asaasSubscriptionId: u.asaasSubscriptionId,
        subscriptionStatus: u.subscriptionStatus,
      }));
  },
});
