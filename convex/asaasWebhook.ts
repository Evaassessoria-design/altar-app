import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

// Avisa o TypeScript que a variável global de ambiente do Node existe
declare const process: any;

export const asaasReceiver = httpAction(async (ctx: any, request: any) => {
  const asaasToken = request.headers.get("asaas-access-token");
  const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;

  if (!asaasToken || asaasToken !== webhookSecret) {
    return new Response("Acesso Proibido", { status: 401 });
  }

  const body = await request.json();
  const paymentId = body.payment?.id;
  const eventType = body.event;

  if (!paymentId) return new Response("Payload inválido", { status: 400 });

  // Força o tipo any nas variáveis de consulta para passar no modo estrito
  const isDuplicate = await ctx.runQuery(api.financeiro.checkDuplicate, {
    asaasPaymentId: paymentId,
  });

  if (isDuplicate) {
    return new Response(JSON.stringify({ status: "skipped_duplicate" }), { status: 200 });
  }

  if (eventType === "PAYMENT_RECEIVED" || eventType === "PAYMENT_CONFIRMED") {
    const customerId = body.payment.customer;
    const paymentValue = Math.round(body.payment.value * 100);

    await ctx.runMutation(api.financeiro.activateSubscriptionFromWebhook, {
      asaasCustomerId: customerId,
      asaasPaymentId: paymentId,
      value: paymentValue,
    });
  }

  return new Response(JSON.stringify({ status: "success" }), { status: 200 });
});
