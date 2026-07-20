import { mutation, query } from "./_generated/server";

// Query chamada pelo Webhook para checar duplicidade de Pix
export const checkDuplicate = query({
  args: {} as any, // Ignora a checagem estrita de argumentos na validação local
  handler: async (ctx: any, args: any) => {
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_asaas_id", (q: any) => q.eq("asaasPaymentId", args.asaasPaymentId))
      .unique();
    return tx !== null;
  },
});

// Mutation que atualiza a assinatura e trava o ID do Pix na tabela de transações
export const activateSubscriptionFromWebhook = mutation({
  args: {} as any,
  handler: async (ctx: any, args: any) => {
    // Localiza a assinatura ativa pelo ID do cliente Asaas
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_customer", (q: any) => q.eq("asaasCustomerId", args.asaasCustomerId))
      .unique();

    if (!subscription) {
      throw new Error("Assinatura não localizada para o CustomerId fornecido");
    }

    // 1. Muda o status para ACTIVE e acrescenta mais 30 dias de acesso
    await ctx.db.patch(subscription._id, {
      status: "ACTIVE",
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // +30 dias em ms
    });

    // 2. Registra na tabela de transações garantindo a idempotência para o futuro
    await ctx.db.insert("transactions", {
      asaasPaymentId: args.asaasPaymentId,
      organizationId: subscription.organizationId,
      value: args.value,
      status: "CONFIRMED",
      processedAt: Date.now(),
    });
  },
});
