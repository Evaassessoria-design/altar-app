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
  /** Id do EVENTO no Asaas (`evt_...`), quando enviado. Chave de deduplicação. */
  id?: string;
  event?: string;
  payment?: {
    id?: string;
    customer?: string;
    subscription?: string;
    value?: number;
    status?: string;
    /** O `_id` do usuário no ALTAR — gravado por nós na criação da cobrança. */
    externalReference?: string;
  };
  subscription?: {
    id?: string;
    customer?: string;
    status?: string;
    value?: number;
    /** O `_id` do usuário no ALTAR — gravado por nós na criação da assinatura. */
    externalReference?: string;
  };
};

/** O que o ALTAR deve fazer com um aviso. `ignore` cobre tudo que não nos afeta. */
export type AsaasAction = "activate" | "overdue" | "cancel" | "ignore";

export type AsaasIntent = {
  action: AsaasAction;
  customerId?: string;
  subscriptionId?: string;
  /** Referência que NÓS gravamos no Asaas: o `_id` do usuário no ALTAR. */
  externalReference?: string;
};

const ACTIVATING_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

// Eventos que encerram a assinatura. PAYMENT_REFUNDED (estorno) já era tratado
// e continua igual; os dois de assinatura são os que nunca funcionaram.
const CANCELLING_EVENTS = new Set([
  "PAYMENT_REFUNDED",
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
]);

/**
 * A referência que o ALTAR gravou no Asaas ao criar o cliente e a assinatura:
 * o `_id` do usuário.
 *
 * É a chave MAIS CONFIÁVEL que existe neste fluxo, porque não depende de
 * nenhum identificador do Asaas ter sido gravado de volta corretamente — e foi
 * exatamente isso que falhou em produção. O código anterior a ignorava.
 */
export function resolveExternalReference(body: AsaasWebhookBody): string | undefined {
  const ref = body.payment?.externalReference ?? body.subscription?.externalReference;
  return ref?.trim() ? ref.trim() : undefined;
}

/**
 * Chave que identifica UM aviso, para não processá-lo duas vezes.
 *
 * O Asaas reenvia o mesmo evento quando não recebe 200 — e reenviava também
 * quando recebia, se a fila tivesse sido reprocessada. Usa o id do evento
 * quando ele vem; senão, monta uma chave estável com o que identifica o fato.
 */
export function eventDedupKey(body: AsaasWebhookBody): string {
  if (body.id?.trim()) return body.id.trim();
  return [
    body.event ?? "SEM_EVENTO",
    body.payment?.id ?? body.subscription?.id ?? "SEM_ID",
    body.payment?.status ?? body.subscription?.status ?? "SEM_STATUS",
  ].join(":");
}

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
  const externalReference = resolveExternalReference(body);

  if (!event) return { action: "ignore" };
  // Sem NENHUMA das três chaves não há como saber de quem é o aviso.
  if (!customerId && !subscriptionId && !externalReference) return { action: "ignore" };

  const chaves = { customerId, subscriptionId, externalReference };

  // Ativar não exige mais o `customer`. Era esse "e customerId" que fazia um
  // pagamento confirmado virar nada quando o cliente do Asaas não batia com o
  // gravado — o caso real de produção.
  if (ACTIVATING_EVENTS.has(event)) return { action: "activate", ...chaves };

  if (event === "PAYMENT_OVERDUE") return { action: "overdue", ...chaves };

  if (CANCELLING_EVENTS.has(event)) return { action: "cancel", ...chaves };

  return { action: "ignore" };
}
