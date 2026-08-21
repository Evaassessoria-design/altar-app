import { describe, expect, it } from "vitest";
import {
  interpretAsaasWebhook,
  resolveCustomerId,
  resolveSubscriptionId,
  type AsaasWebhookBody,
} from "./asaasEvents";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — cancelamento de assinatura no Asaas.
//
// O bug: o receptor lia o cliente SEMPRE de `body.payment.customer`. Eventos de
// assinatura (SUBSCRIPTION_DELETED) não têm `payment` — trazem `subscription`.
// Resultado: o cliente ficava indefinido, o cancelamento nunca era gravado, e
// quem cancelava seguia com o app liberado e contando no MRR.
//
// Os payloads abaixo reproduzem os DOIS formatos reais do Asaas.
// ─────────────────────────────────────────────────────────────────────────────

/** Evento de cobrança: o cliente vem em `payment`. */
function paymentEvent(event: string): AsaasWebhookBody {
  return {
    event,
    payment: {
      id: "pay_123456",
      customer: "cus_000005113026",
      subscription: "sub_ABC123",
      value: 119.9,
    },
  };
}

/** Evento de assinatura: o cliente vem em `subscription` — NÃO há `payment`. */
function subscriptionEvent(event: string): AsaasWebhookBody {
  return {
    event,
    subscription: {
      id: "sub_ABC123",
      customer: "cus_000005113026",
      status: "INACTIVE",
      value: 119.9,
    },
  };
}

describe("de onde sai o cliente do aviso", () => {
  it("lê o cliente de payment em eventos de cobrança", () => {
    expect(resolveCustomerId(paymentEvent("PAYMENT_RECEIVED"))).toBe("cus_000005113026");
  });

  // Este é o caso que estava quebrado.
  it("lê o cliente de subscription em eventos de assinatura", () => {
    expect(resolveCustomerId(subscriptionEvent("SUBSCRIPTION_DELETED"))).toBe(
      "cus_000005113026",
    );
  });

  it("lê o id da assinatura nos dois formatos", () => {
    expect(resolveSubscriptionId(paymentEvent("PAYMENT_RECEIVED"))).toBe("sub_ABC123");
    expect(resolveSubscriptionId(subscriptionEvent("SUBSCRIPTION_DELETED"))).toBe(
      "sub_ABC123",
    );
  });
});

describe("SUBSCRIPTION_DELETED cancela de verdade", () => {
  it("vira ação de cancelamento com cliente E assinatura preenchidos", () => {
    expect(interpretAsaasWebhook(subscriptionEvent("SUBSCRIPTION_DELETED"))).toEqual({
      action: "cancel",
      customerId: "cus_000005113026",
      subscriptionId: "sub_ABC123",
    });
  });

  it("SUBSCRIPTION_INACTIVATED também cancela", () => {
    expect(interpretAsaasWebhook(subscriptionEvent("SUBSCRIPTION_INACTIVATED")).action).toBe(
      "cancel",
    );
  });

  it("estorno de cobrança continua cancelando, como antes", () => {
    expect(interpretAsaasWebhook(paymentEvent("PAYMENT_REFUNDED"))).toMatchObject({
      action: "cancel",
      customerId: "cus_000005113026",
    });
  });

  it("cancela mesmo quando o aviso só traz a assinatura, sem cliente", () => {
    const intent = interpretAsaasWebhook({
      event: "SUBSCRIPTION_DELETED",
      subscription: { id: "sub_SOZINHA" },
    });
    expect(intent).toMatchObject({ action: "cancel", subscriptionId: "sub_SOZINHA" });
  });
});

describe("os caminhos que já funcionavam continuam iguais", () => {
  it.each(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"])("%s ativa a assinatura", (event) => {
    expect(interpretAsaasWebhook(paymentEvent(event))).toMatchObject({
      action: "activate",
      customerId: "cus_000005113026",
      subscriptionId: "sub_ABC123",
    });
  });

  it("PAYMENT_OVERDUE marca atraso — nunca cancela", () => {
    const intent = interpretAsaasWebhook(paymentEvent("PAYMENT_OVERDUE"));
    expect(intent.action).toBe("overdue");
    expect(intent.customerId).toBe("cus_000005113026");
  });
});

describe("avisos que não devem gerar escrita", () => {
  it("ignora evento sem nome", () => {
    expect(interpretAsaasWebhook({ payment: { customer: "cus_1" } }).action).toBe("ignore");
  });

  it("ignora aviso sem cliente e sem assinatura", () => {
    expect(interpretAsaasWebhook({ event: "SUBSCRIPTION_DELETED" }).action).toBe("ignore");
  });

  it("ignora eventos que não nos dizem respeito", () => {
    // Não queremos que um evento desconhecido mexa em cobrança por engano.
    for (const event of [
      "PAYMENT_CREATED",
      "PAYMENT_UPDATED",
      "SUBSCRIPTION_CREATED",
      "SUBSCRIPTION_UPDATED",
      "PAYMENT_AWAITING_RISK_ANALYSIS",
    ]) {
      expect(interpretAsaasWebhook(paymentEvent(event)).action).toBe("ignore");
    }
  });
});
