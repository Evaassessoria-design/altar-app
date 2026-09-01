import { describe, expect, it } from "vitest";
import {
  effectiveSubscriptionStatus,
  isBillingExempt,
  OVERDUE_TOLERANCE_DAYS,
  resolveAccess,
} from "./access";

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
        // Isento por ser conta INTERNA, não por ser administrador — os dois
        // motivos de isenção continuam separados.
        adminExempt: false,
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

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — inadimplência com prazo.
//
// Antes, `overdue` NUNCA bloqueava: era um período de tolerância sem fim. Somado
// ao cancelamento que não chegava (webhook), quem parava de pagar ficava com o
// app liberado para sempre. Agora a tolerância conta a partir de `overdueSince`
// e termina em OVERDUE_TOLERANCE_DAYS.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveAccess — inadimplência (overdue) com tolerância", () => {
  const TOL = OVERDUE_TOLERANCE_DAYS;

  it("não bloqueia no primeiro dia de atraso", () => {
    const d = resolveAccess({ subscriptionStatus: "overdue", overdueSince: NOW }, NOW);
    expect(d.blocked).toBe(false);
    expect(d.overdueDaysLeft).toBe(TOL);
  });

  it("continua liberado ao longo da tolerância, com os dias diminuindo", () => {
    for (let day = 1; day < TOL; day++) {
      const d = resolveAccess(
        { subscriptionStatus: "overdue", overdueSince: NOW - day * DAY },
        NOW,
      );
      expect(d.blocked).toBe(false);
      expect(d.overdueDaysLeft).toBe(TOL - day);
    }
  });

  it("bloqueia exatamente quando a tolerância se esgota", () => {
    const d = resolveAccess(
      { subscriptionStatus: "overdue", overdueSince: NOW - TOL * DAY },
      NOW,
    );
    expect(d).toMatchObject({ blocked: true, reason: "payment_overdue" });
    expect(d.overdueDaysLeft).toBeUndefined();
  });

  it("segue bloqueado bem depois do prazo", () => {
    expect(
      resolveAccess(
        { subscriptionStatus: "overdue", overdueSince: NOW - 90 * DAY },
        NOW,
      ).blocked,
    ).toBe(true);
  });

  it("sem overdueSince continua liberado — cadastros anteriores à regra", () => {
    // Compatibilidade deliberada: preferimos deixar alguém a mais dentro do app
    // do que bloquear um cliente adimplente por falta de dado. O próximo aviso
    // de atraso do Asaas grava a data e a contagem passa a valer.
    const d = resolveAccess({ subscriptionStatus: "overdue" }, NOW);
    expect(d.blocked).toBe(false);
    expect(d.overdueDaysLeft).toBeUndefined();
  });

  it("conta internal inadimplente nunca é bloqueada", () => {
    expect(
      resolveAccess(
        {
          subscriptionStatus: "overdue",
          overdueSince: NOW - 365 * DAY,
          accessType: "internal",
        },
        NOW,
      ),
    ).toMatchObject({ blocked: false, billingExempt: true });
  });

  it("beta vigente inadimplente também não é bloqueada", () => {
    expect(
      resolveAccess(
        {
          subscriptionStatus: "overdue",
          overdueSince: NOW - 365 * DAY,
          accessType: "beta",
          accessExpiresAt: NOW + DAY,
        },
        NOW,
      ).blocked,
    ).toBe(false);
  });

  it("beta VENCIDA e inadimplente há mais que a tolerância é bloqueada", () => {
    expect(
      resolveAccess(
        {
          subscriptionStatus: "overdue",
          overdueSince: NOW - (TOL + 1) * DAY,
          accessType: "beta",
          accessExpiresAt: NOW - DAY,
        },
        NOW,
      ),
    ).toMatchObject({ blocked: true, reason: "payment_overdue", betaExpired: true });
  });

  it("os outros status não ganharam overdueDaysLeft por acidente", () => {
    for (const status of ["trial", "active", "expired", "cancelled"] as const) {
      expect(
        resolveAccess({ subscriptionStatus: status, overdueSince: NOW }, NOW).overdueDaysLeft,
      ).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMINISTRADOR DO ALTAR × PAYWALL
//
// A matriz que estes testes travam é a definição do comportamento esperado:
//
//   ADMIN, sem assinatura e com trial vencido ......... ACESSA
//   Cliente com assinatura ativa ...................... ACESSA
//   Cliente em trial válido ........................... ACESSA
//   Cliente com trial vencido e sem assinatura ........ BLOQUEADO
//   Cliente cancelado / inadimplente .................. comportamento inalterado
//
// O par importa: o primeiro grupo prova que a conta que opera o produto entra;
// o segundo prova que liberar o admin NÃO abriu a porta para ninguém mais.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN = { role: "admin" } as const;

describe("resolveAccess — administrador do ALTAR", () => {
  it("acessa com trial VENCIDO e sem nenhuma assinatura", () => {
    const d = resolveAccess(
      { ...ADMIN, subscriptionStatus: "trial", trialEndDate: "2026-01-01T00:00:00Z" },
      NOW,
    );
    expect(effectiveSubscriptionStatus(
      { subscriptionStatus: "trial", trialEndDate: "2026-01-01T00:00:00Z" },
      NOW,
    )).toBe("expired"); // o trial realmente venceu — não é um falso negativo
    expect(d.blocked).toBe(false);
    expect(d.adminExempt).toBe(true);
    expect(d.billingExempt).toBe(true);
  });

  it.each(["trial", "active", "overdue", "expired", "cancelled"] as const)(
    "acessa qualquer que seja o estado de cobrança (%s)",
    (status) => {
      // Inclusive inadimplência com a tolerância JÁ estourada, que bloqueia
      // qualquer cliente.
      const d = resolveAccess(
        { ...ADMIN, subscriptionStatus: status, overdueSince: NOW - 90 * DAY },
        NOW,
      );
      expect(d.blocked).toBe(false);
      expect(d.adminExempt).toBe(true);
    },
  );

  it("fica fora da receita — não é cliente pagante", () => {
    expect(isBillingExempt({ ...ADMIN, subscriptionStatus: "expired" }, NOW)).toBe(true);
  });

  it("preserva o accessType real, sem forjar cortesia", () => {
    // Admin continua sendo reportado como `client` se nunca recebeu cortesia.
    // Se os dois conceitos fossem misturados, o painel passaria a contar a
    // conta da equipe junto com as contas de cortesia comercial.
    const d = resolveAccess({ ...ADMIN, subscriptionStatus: "expired" }, NOW);
    expect(d.type).toBe("client");
    expect(d.adminExempt).toBe(true);
  });

  it("`internal` continua isento SEM ser admin — os conceitos não se fundiram", () => {
    const d = resolveAccess(
      { subscriptionStatus: "expired", accessType: "internal" },
      NOW,
    );
    expect(d.blocked).toBe(false);
    expect(d.billingExempt).toBe(true);
    expect(d.adminExempt).toBe(false);
  });
});

describe("liberar o admin NÃO afrouxou o paywall de cliente", () => {
  // `role` de cliente comum. Vale tanto o valor "user" gravado no cadastro
  // quanto a ausência do campo.
  it.each([{ role: "user" }, {}])("cliente com trial vencido é BLOQUEADO (%o)", (quem) => {
    const d = resolveAccess(
      { ...quem, subscriptionStatus: "trial", trialEndDate: "2026-01-01T00:00:00Z" },
      NOW,
    );
    expect(d.blocked).toBe(true);
    expect(d.reason).toBe("trial_expired");
    expect(d.adminExempt).toBe(false);
  });

  it("cliente com assinatura ativa ACESSA e continua cobrável", () => {
    const d = resolveAccess({ role: "user", subscriptionStatus: "active" }, NOW);
    expect(d.blocked).toBe(false);
    expect(d.billingExempt).toBe(false); // segue contando no MRR
  });

  it("cliente em trial VÁLIDO acessa", () => {
    const d = resolveAccess(
      { role: "user", subscriptionStatus: "trial", trialEndDate: "2026-12-31T00:00:00Z" },
      NOW,
    );
    expect(d.blocked).toBe(false);
  });

  it("cliente cancelado segue BLOQUEADO", () => {
    expect(resolveAccess({ role: "user", subscriptionStatus: "cancelled" }, NOW)).toMatchObject({
      blocked: true,
      reason: "subscription_cancelled",
    });
  });

  it("inadimplência de cliente mantém EXATAMENTE a regra de tolerância", () => {
    const dentro = resolveAccess(
      { role: "user", subscriptionStatus: "overdue", overdueSince: NOW - 2 * DAY },
      NOW,
    );
    expect(dentro.blocked).toBe(false);
    expect(dentro.overdueDaysLeft).toBe(OVERDUE_TOLERANCE_DAYS - 2);

    const fora = resolveAccess(
      { role: "user", subscriptionStatus: "overdue", overdueSince: NOW - (OVERDUE_TOLERANCE_DAYS + 1) * DAY },
      NOW,
    );
    expect(fora).toMatchObject({ blocked: true, reason: "payment_overdue" });
  });

  it("um `role` qualquer NÃO isenta — só o valor exato de administrador", () => {
    // Trava contra o campo virar porta dos fundos por digitação livre:
    // `role` é v.string() no schema.
    for (const role of ["Admin", "ADMIN", "administrador", "owner", "superadmin", ""]) {
      expect(resolveAccess({ role, subscriptionStatus: "expired" }, NOW).blocked).toBe(true);
    }
  });
});
