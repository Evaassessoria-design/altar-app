import { describe, expect, it } from "vitest";
import { isBillingExempt, resolveAccess } from "./access";

// Regras que o Painel Admin exibe e das quais dependem a guarda de checkout
// (convex/asaas.ts) e as métricas de MRR/conversão (convex/admin.ts getStats).
// São testes puros: resolveAccess recebe `now`, então não dependem do relógio.

const NOW = Date.parse("2026-08-18T12:00:00Z");
const DAY = 86_400_000;

describe("resolveAccess — client", () => {
  it("trata accessType ausente como client (usuários pré-existentes)", () => {
    const d = resolveAccess({ subscriptionStatus: "trial" }, NOW);
    expect(d.type).toBe("client");
    expect(d.blocked).toBe(false);
    expect(d.billingExempt).toBe(false);
  });

  it.each(["trial", "active", "overdue"] as const)("não bloqueia client em %s", (status) => {
    expect(resolveAccess({ subscriptionStatus: status }, NOW).blocked).toBe(false);
  });

  it("bloqueia client expirado e cancelado, com o motivo certo", () => {
    expect(resolveAccess({ subscriptionStatus: "expired" }, NOW)).toMatchObject({
      blocked: true,
      reason: "trial_expired",
    });
    expect(resolveAccess({ subscriptionStatus: "cancelled" }, NOW)).toMatchObject({
      blocked: true,
      reason: "subscription_cancelled",
    });
  });
});

describe("resolveAccess — internal", () => {
  // O ponto do tipo `internal`: nunca cobra e nunca bloqueia, aconteça o que
  // acontecer com a assinatura. É o que mantém a conta fora do MRR e do checkout.
  it.each(["trial", "active", "overdue", "expired", "cancelled"] as const)(
    "libera e isenta mesmo com assinatura %s",
    (status) => {
      const d = resolveAccess({ subscriptionStatus: status, accessType: "internal" }, NOW);
      expect(d).toEqual({
        type: "internal",
        blocked: false,
        billingExempt: true,
        betaExpired: false,
      });
    },
  );
});

describe("resolveAccess — beta", () => {
  it("isenta enquanto a validade não passou", () => {
    const d = resolveAccess(
      { subscriptionStatus: "expired", accessType: "beta", accessExpiresAt: NOW + DAY },
      NOW,
    );
    expect(d).toMatchObject({ type: "beta", blocked: false, billingExempt: true, betaExpired: false });
  });

  it("beta sem data não expira", () => {
    const d = resolveAccess({ subscriptionStatus: "cancelled", accessType: "beta" }, NOW);
    expect(d).toMatchObject({ blocked: false, billingExempt: true, betaExpired: false });
  });

  it("expira exatamente no limite (accessExpiresAt <= now)", () => {
    const d = resolveAccess(
      { subscriptionStatus: "active", accessType: "beta", accessExpiresAt: NOW },
      NOW,
    );
    expect(d.betaExpired).toBe(true);
    expect(d.billingExempt).toBe(false);
  });

  it("beta vencido volta a valer a regra de client: bloqueia se a assinatura bloqueia", () => {
    const base = { accessType: "beta" as const, accessExpiresAt: NOW - DAY };
    expect(resolveAccess({ ...base, subscriptionStatus: "expired" }, NOW)).toMatchObject({
      type: "beta",
      blocked: true,
      reason: "trial_expired",
      billingExempt: false,
      betaExpired: true,
    });
    // ...e não bloqueia se a assinatura está em dia.
    expect(resolveAccess({ ...base, subscriptionStatus: "active" }, NOW)).toMatchObject({
      blocked: false,
      billingExempt: false,
      betaExpired: true,
    });
  });
});

describe("isBillingExempt — quem fica fora do MRR e do checkout Asaas", () => {
  it("isenta internal e beta vigente; cobra client e beta vencido", () => {
    expect(isBillingExempt({ subscriptionStatus: "active", accessType: "internal" }, NOW)).toBe(true);
    expect(
      isBillingExempt({ subscriptionStatus: "active", accessType: "beta", accessExpiresAt: NOW + DAY }, NOW),
    ).toBe(true);
    expect(isBillingExempt({ subscriptionStatus: "active" }, NOW)).toBe(false);
    expect(
      isBillingExempt({ subscriptionStatus: "active", accessType: "beta", accessExpiresAt: NOW - DAY }, NOW),
    ).toBe(false);
  });
});
