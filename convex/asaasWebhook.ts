import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { interpretAsaasWebhook, type AsaasWebhookBody } from "./lib/asaasEvents";

// Avisa o TypeScript que a variável global de ambiente do Node existe
declare const process: { env: Record<string, string | undefined> };

// ─────────────────────────────────────────────────────────────────────────────
// Receptor dos avisos do Asaas.
//
// A LEITURA do payload (qual evento é, de quem é) vive em lib/asaasEvents.ts,
// que é puro e testado. Aqui fica só a autenticação do webhook e o despacho
// para as internalMutations — mantendo este arquivo trivial de auditar.
// ─────────────────────────────────────────────────────────────────────────────

export const asaasReceiver = httpAction(async (ctx, request) => {
  const asaasToken = request.headers.get("asaas-access-token");
  const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;

  if (!asaasToken || asaasToken !== webhookSecret) {
    return new Response("Acesso Proibido", { status: 401 });
  }

  const body = (await request.json()) as AsaasWebhookBody;
  const { action, customerId, subscriptionId } = interpretAsaasWebhook(body);

  switch (action) {
    // Ativa a assinatura do usuário (Arquitetura A: status vive no próprio
    // usuário). Idempotente — reprocessar o mesmo aviso apenas reafirma "active".
    case "activate":
      if (customerId) {
        await ctx.runMutation(internal.users.activateSubscriptionByCustomer, {
          asaasCustomerId: customerId,
          asaasSubscriptionId: subscriptionId,
        });
      }
      break;

    // Atraso NÃO é cancelamento imediato. O Asaas continua tentando recobrar; se
    // desistir, manda SUBSCRIPTION_DELETED. Até lá vale o período de tolerância
    // definido em lib/access.ts — o acesso é mantido por alguns dias e só então
    // bloqueado. `markSubscriptionOverdue` grava QUANDO o atraso começou, que é
    // o que faz a tolerância ter fim.
    case "overdue":
      if (customerId) {
        await ctx.runMutation(internal.users.markSubscriptionOverdue, {
          asaasCustomerId: customerId,
        });
      }
      break;

    // Cancelamentos e estornos. `cancelSubscriptionByAsaasRef` tenta primeiro
    // pelo id da assinatura (mais preciso — um cliente pode ter mais de uma no
    // Asaas) e cai no id do cliente quando não encontra, que era o
    // comportamento anterior.
    case "cancel":
      await ctx.runMutation(internal.users.cancelSubscriptionByAsaasRef, {
        asaasSubscriptionId: subscriptionId,
        asaasCustomerId: customerId,
      });
      break;

    case "ignore":
      break;
  }

  return new Response(JSON.stringify({ status: "success" }), { status: 200 });
});
