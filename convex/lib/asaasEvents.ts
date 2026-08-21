// ─────────────────────────────────────────────────────────────────────────────
// LEITURA DOS AVISOS (WEBHOOKS) DO ASAAS
//
// Módulo PURO de propósito: nenhuma dependência do Convex, nenhum acesso a
// banco. Aqui mora só a tradução "payload do Asaas → o que o ALTAR deve fazer",
// que era exatamente onde estava o bug de cancelamento — e que agora tem teste
// próprio (lib/asaasEvents.test.ts) com os formatos reais dos dois tipos de
// evento.
//
// O ponto central: o Asaas manda o identificador do cliente em lugares
// DIFERENTES conforme o tipo de evento.
//
//   · eventos de COBRANÇA     → body.payment.customer
//     (PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_REFUNDED…)
//
//   · eventos de ASSINATURA   → body.subscription.customer
//     (SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED, SUBSCRIPTION_UPDATED…)
//
// O código anterior lia SEMPRE de `body.payment`. Em SUBSCRIPTION_DELETED esse
// campo não existe, então o cliente ficava indefinido e o cancelamento era
// silenciosamente ignorado: quem cancelava continuava com o app liberado para
// sempre e ainda contava como assinante ativo no MRR do painel admin.
// ─────────────────────────────────────────────────────────────────────────────

export type AsaasWebhookBody = {
  event?: string;
  payment?: {
    id?: string;
    customer?: string;
    subscription?: string;
    value?: number;
  };
  subscription?: {
    id?: string;
    customer?: string;
    status?: string;
    value?: number;
  };
};

/** O que o ALTAR deve fazer com um aviso. `ignore` cobre tudo que não nos afeta. */
export type AsaasAction = "activate" | "overdue" | "cancel" | "ignore";

export type AsaasIntent = {
  action: AsaasAction;
  customerId?: string;
  subscriptionId?: string;
};

const ACTIVATING_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

// Eventos que encerram a assinatura. PAYMENT_REFUNDED (estorno) já era tratado
// e continua igual; os dois de assinatura são os que nunca funcionaram.
const CANCELLING_EVENTS = new Set([
  "PAYMENT_REFUNDED",
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
]);

/** Cliente do evento, venha ele de `payment` ou de `subscription`. */
export function resolveCustomerId(body: AsaasWebhookBody): string | undefined {
  return body.payment?.customer ?? body.subscription?.customer;
}

/**
 * Id da assinatura, quando o evento carrega um.
 * Em eventos de assinatura é `subscription.id`; numa cobrança gerada por uma
 * assinatura, o Asaas devolve a assinatura de origem em `payment.subscription`.
 */
export function resolveSubscriptionId(body: AsaasWebhookBody): string | undefined {
  return body.subscription?.id ?? body.payment?.subscription;
}

/**
 * Traduz o aviso do Asaas na ação correspondente.
 *
 * Sem cliente E sem assinatura não há como saber de quem é o aviso: nesse caso
 * a ação é `ignore`, e não uma escrita às cegas.
 */
export function interpretAsaasWebhook(body: AsaasWebhookBody): AsaasIntent {
  const event = body.event;
  const customerId = resolveCustomerId(body);
  const subscriptionId = resolveSubscriptionId(body);

  if (!event) return { action: "ignore" };
  if (!customerId && !subscriptionId) return { action: "ignore" };

  if (ACTIVATING_EVENTS.has(event) && customerId) {
    return { action: "activate", customerId, subscriptionId };
  }

  // Atraso é localizado pelo cliente: `markSubscriptionOverdue` indexa por ele.
  if (event === "PAYMENT_OVERDUE" && customerId) {
    return { action: "overdue", customerId, subscriptionId };
  }

  if (CANCELLING_EVENTS.has(event)) {
    return { action: "cancel", customerId, subscriptionId };
  }

  return { action: "ignore" };
}
