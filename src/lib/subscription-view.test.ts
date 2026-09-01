import { describe, expect, it } from "vitest";
import { resolveSubscriptionView } from "./subscription-view";

// O que a tela de Configurações mostra sobre assinatura. Camada de
// apresentação: não decide acesso nem cobrança — traduz a decisão do backend.

describe("conta isenta de cobrança não vê estado comercial", () => {
  // O bug relatado: a conta interna via "Conta interna — acesso permanente" e,
  // logo abaixo, "Trial expirado / Plano Altar Pro / Assinar agora".
  it("internal com trial expirado: sem selo de status, sem CTA", () => {
    const v = resolveSubscriptionView(
      { type: "internal", billingExempt: true },
      "expired",
    );
    expect(v.showBillingStatus).toBe(false);
    expect(v.showCommercialCta).toBe(false);
    expect(v.exemptCard).toEqual({
      label: "Conta interna",
      detail: "Acesso permanente ao ALTAR",
      note: "Esta conta não requer assinatura.",
    });
  });

  it.each(["trial", "expired", "cancelled", "overdue", "active"])(
    "internal nunca mostra CTA, qualquer que seja o status (%s)",
    (status) => {
      const v = resolveSubscriptionView({ type: "internal", billingExempt: true }, status);
      expect(v.showCommercialCta).toBe(false);
      expect(v.showBillingStatus).toBe(false);
    },
  );

  it("admin do ALTAR sem accessType recebe cartão próprio, não o de cortesia", () => {
    // Os dois conceitos seguem separados: "administrativa" ≠ "interna".
    const v = resolveSubscriptionView(
      { type: "client", billingExempt: true, adminExempt: true },
      "expired",
    );
    expect(v.exemptCard?.label).toBe("Conta administrativa");
    expect(v.showCommercialCta).toBe(false);
  });

  it("beta vigente tem texto próprio", () => {
    const v = resolveSubscriptionView(
      { type: "beta", billingExempt: true, betaExpired: false },
      "trial",
    );
    expect(v.exemptCard?.label).toBe("Acesso beta");
    expect(v.showCommercialCta).toBe(false);
  });
});

describe("cliente comum mantém a experiência comercial correta", () => {
  it("trial: vê status e vê o CTA", () => {
    const v = resolveSubscriptionView({ type: "client", billingExempt: false }, "trial");
    expect(v.showBillingStatus).toBe(true);
    expect(v.showCommercialCta).toBe(true);
    expect(v.exemptCard).toBeNull();
  });

  it("trial expirado: vê status e vê o CTA para assinar", () => {
    const v = resolveSubscriptionView({ type: "client", billingExempt: false }, "expired");
    expect(v.showBillingStatus).toBe(true);
    expect(v.showCommercialCta).toBe(true);
  });

  it("assinante ativo: vê status, sem CTA de compra", () => {
    const v = resolveSubscriptionView({ type: "client", billingExempt: false }, "active");
    expect(v.showBillingStatus).toBe(true);
    expect(v.showCommercialCta).toBe(false);
    expect(v.exemptCard).toBeNull();
  });

  it("beta VENCIDO volta a ser tratado como cliente", () => {
    const v = resolveSubscriptionView(
      { type: "beta", billingExempt: false, betaExpired: true },
      "expired",
    );
    expect(v.exemptCard).toBeNull();
    expect(v.showCommercialCta).toBe(true);
  });

  it("sem dados de acesso ainda (carregando) não esconde nada do cliente", () => {
    // `access` indefinido só acontece enquanto a query não respondeu. O padrão
    // seguro é a experiência de cliente — nunca liberar isenção por omissão.
    const v = resolveSubscriptionView(undefined, "trial");
    expect(v.billingExempt).toBe(false);
    expect(v.showCommercialCta).toBe(true);
  });
});
