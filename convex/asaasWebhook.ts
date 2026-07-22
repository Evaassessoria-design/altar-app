import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Avisa o TypeScript que a variável global de ambiente do Node existe
declare const process: { env: Record<string, string | undefined> };

export const asaasReceiver = httpAction(async (ctx, request) => {
  const asaasToken = request.headers.get("asaas-access-token");
  const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;

  if (!asaasToken || asaasToken !== webhookSecret) {
    return new Response("Acesso Proibido", { status: 401 });
  }

  const body = (await request.json()) as {
    event?: string;
    payment?: { id?: string; customer?: string; value?: number };
  };
  const eventType = body.event;
  const customerId = body.payment?.customer;

  // Ativa a assinatura do usuário (Arquitetura A: status vive no próprio usuário).
  // A operação é idempotente — reprocessar o mesmo webhook apenas reafirma "active".
  if (
    customerId &&
    (eventType === "PAYMENT_RECEIVED" || eventType === "PAYMENT_CONFIRMED")
  ) {
    await ctx.runMutation(internal.users.activateSubscriptionByCustomer, {
      asaasCustomerId: customerId,
    });
  }

  // Cancelamentos / estornos → marca a assinatura como cancelada
  if (
    customerId &&
    (eventType === "PAYMENT_REFUNDED" ||
      eventType === "PAYMENT_OVERDUE" ||
      eventType === "SUBSCRIPTION_DELETED")
  ) {
    await ctx.runMutation(internal.users.cancelSubscriptionByCustomer, {
      asaasCustomerId: customerId,
    });
  }

  return new Response(JSON.stringify({ status: "success" }), { status: 200 });
});
