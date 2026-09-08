import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { resolveAccess, OVERDUE_TOLERANCE_DAYS } from "./lib/access";
import { interpretAsaasWebhook } from "./lib/asaasEvents";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// O CICLO DE INADIMPLÊNCIA, DE PONTA A PONTA
//
// Os testes que já existiam cobrem PEDAÇOS: `users.billing.test.ts` cobre as
// mutations, `lib/access.test.ts` cobre a regra de bloqueio, `asaas.duplicata`
// cobre a guarda de assinatura errada. Nenhum percorre a VIDA de uma conta.
//
// Aqui a conta atravessa o ciclo inteiro numa única linha do tempo:
//
//   paga → ativa → atrasa → tolerância → bloqueia → paga de novo → volta
//
// É o comportamento que o produto promete e que ninguém verificava inteiro.
// Também é o que passa a valer de verdade quando PAYMENT_OVERDUE e
// SUBSCRIPTION_INACTIVATED forem habilitados no webhook do Asaas — hoje esses
// avisos NUNCA chegam, então este fluxo nunca rodou em produção.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const CLIENTE = "cus_CICLO";
const ASSINATURA = "sub_CICLO";
const OUTRA = "sub_OUTRA";

async function seedAtiva(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
): Promise<Id<"users">> {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Decoradora",
      email: "decoradora@exemplo.com",
      role: "user",
      subscriptionStatus: "active",
      asaasCustomerId: CLIENTE,
      asaasSubscriptionId: ASSINATURA,
      ...overrides,
    }),
  );
}

const ler = (t: ReturnType<typeof convexTest>, id: Id<"users">) =>
  t.run((ctx) => ctx.db.get(id));

describe("o ciclo completo: paga → atrasa → bloqueia → paga → volta", () => {
  it("atravessa a vida inteira da conta sem intervenção manual", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAtiva(t);

    // ── T0: em dia ────────────────────────────────────────────────────────
    let user = await ler(t, userId);
    expect(resolveAccess(user!).blocked).toBe(false);
    expect(user!.overdueSince).toBeUndefined();

    // ── T1: o cartão falha, o Asaas avisa ─────────────────────────────────
    await t.mutation(internal.users.markSubscriptionOverdueByRef, {
      externalReference: userId,
      asaasSubscriptionId: ASSINATURA,
      asaasCustomerId: CLIENTE,
    });

    user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("overdue");
    expect(typeof user!.overdueSince).toBe("number");
    const inicio = user!.overdueSince!;

    // ── T2: durante a tolerância, o acesso CONTINUA ───────────────────────
    // Cortar no primeiro dia de atraso puniria um boleto pago no fim de semana.
    for (const dia of [0, 1, 3, OVERDUE_TOLERANCE_DAYS - 1]) {
      const d = resolveAccess(user!, inicio + dia * DAY);
      expect(d.blocked, `D${dia} deveria seguir liberado`).toBe(false);
      expect(d.overdueDaysLeft).toBe(OVERDUE_TOLERANCE_DAYS - dia);
    }

    // ── T3: a tolerância acaba e o acesso cai ─────────────────────────────
    const noPrazo = resolveAccess(user!, inicio + OVERDUE_TOLERANCE_DAYS * DAY);
    expect(noPrazo.blocked).toBe(true);
    expect(noPrazo.reason).toBe("payment_overdue");
    expect(noPrazo.overdueDaysLeft).toBeUndefined();

    // ── T4: a cliente regulariza ──────────────────────────────────────────
    await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: ASSINATURA,
      asaasCustomerId: CLIENTE,
    });

    user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("active");
    // Sem zerar a contagem, um novo atraso seria bloqueado na hora pela data
    // ANTIGA — a cliente pagaria e continuaria barrada.
    expect(user!.overdueSince).toBeUndefined();
    expect(resolveAccess(user!, inicio + 30 * DAY).blocked).toBe(false);
  });

  it("atrasar de novo recomeça a contagem do zero, não continua a antiga", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAtiva(t);
    const chaves = {
      externalReference: userId,
      asaasSubscriptionId: ASSINATURA,
      asaasCustomerId: CLIENTE,
    };

    await t.mutation(internal.users.markSubscriptionOverdueByRef, chaves);
    const primeiro = (await ler(t, userId))!.overdueSince!;

    await t.mutation(internal.users.activateSubscriptionByAsaasRef, chaves);
    await t.mutation(internal.users.markSubscriptionOverdueByRef, chaves);

    const segundo = (await ler(t, userId))!.overdueSince!;
    expect(segundo).toBeGreaterThanOrEqual(primeiro);
    // O que importa: a nova tolerância vale por inteiro a partir de agora.
    const user = await ler(t, userId);
    expect(resolveAccess(user!, segundo + 1000).blocked).toBe(false);
  });
});

describe("avisos repetidos e fora de ordem", () => {
  it("PAYMENT_OVERDUE repetido NÃO reinicia a tolerância", async () => {
    // O Asaas reenvia o aviso de atraso. Se cada reenvio zerasse o relógio, a
    // tolerância nunca terminaria e a inadimplência viraria acesso vitalício.
    const t = convexTest(schema, modules);
    const antigo = Date.now() - 5 * DAY;
    const userId = await seedAtiva(t, {
      subscriptionStatus: "overdue",
      overdueSince: antigo,
    });

    await t.mutation(internal.users.markSubscriptionOverdueByRef, {
      externalReference: userId,
      asaasSubscriptionId: ASSINATURA,
      asaasCustomerId: CLIENTE,
    });

    expect((await ler(t, userId))!.overdueSince).toBe(antigo);
  });

  it("PAYMENT_CONFIRMED que chega DEPOIS do atraso reativa mesmo assim", async () => {
    // Entrega fora de ordem é normal em fila de webhook. O dinheiro entrou:
    // o estado final tem que ser "ativa", não "atrasada".
    const t = convexTest(schema, modules);
    const userId = await seedAtiva(t, {
      subscriptionStatus: "overdue",
      overdueSince: Date.now() - 3 * DAY,
    });

    await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: ASSINATURA,
      asaasCustomerId: CLIENTE,
    });

    const user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("active");
    expect(user!.overdueSince).toBeUndefined();
    expect(resolveAccess(user!).blocked).toBe(false);
  });

  it("atraso NÃO rebaixa quem já está cancelado ou em trial", async () => {
    // `aplicarAtraso` só rebaixa quem está `active`. Sobrescrever um
    // cancelamento com "overdue" devolveria acesso a quem já saiu.
    for (const status of ["cancelled", "trial", "expired"]) {
      const t = convexTest(schema, modules);
      const userId = await seedAtiva(t, { subscriptionStatus: status });
      await t.mutation(internal.users.markSubscriptionOverdueByRef, {
        externalReference: userId,
        asaasSubscriptionId: ASSINATURA,
        asaasCustomerId: CLIENTE,
      });
      expect((await ler(t, userId))!.subscriptionStatus).toBe(status);
    }
  });

  it("o mesmo aviso entregue duas vezes só é reservado uma vez", async () => {
    // A idempotência nasce aqui: `claim` confere e insere na MESMA mutation.
    const t = convexTest(schema, modules);
    const args = { dedupKey: "evt_repetido", event: "PAYMENT_OVERDUE" };

    const primeira = await t.mutation(internal.asaasWebhookLog.claim, args);
    const segunda = await t.mutation(internal.asaasWebhookLog.claim, args);

    expect(primeira.status).toBe("claimed");
    expect(segunda.status).toBe("duplicate");
  });
});

describe("SUBSCRIPTION_INACTIVATED — o evento que hoje nunca chega", () => {
  it("é interpretado como cancelamento, com as chaves certas", () => {
    const intent = interpretAsaasWebhook({
      event: "SUBSCRIPTION_INACTIVATED",
      subscription: {
        id: ASSINATURA,
        customer: CLIENTE,
        externalReference: "user123",
      },
    });
    expect(intent.action).toBe("cancel");
    expect(intent.subscriptionId).toBe(ASSINATURA);
    expect(intent.customerId).toBe(CLIENTE);
  });

  it("da assinatura CERTA cancela e bloqueia de verdade", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAtiva(t);

    await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: ASSINATURA,
      asaasCustomerId: CLIENTE,
    });

    const user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("cancelled");
    expect(resolveAccess(user!).blocked).toBe(true);
    expect(resolveAccess(user!).reason).toBe("subscription_cancelled");
  });

  it("de OUTRA assinatura NÃO derruba a conta", async () => {
    // Mesmo risco do SUBSCRIPTION_DELETED da duplicata, por outro evento.
    const t = convexTest(schema, modules);
    const userId = await seedAtiva(t);

    const r = await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: OUTRA,
      asaasCustomerId: CLIENTE,
    });

    expect(r.matchedBy).toBe("outra_assinatura");
    const user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("active");
    expect(resolveAccess(user!).blocked).toBe(false);
  });

  it("o cancelamento zera a contagem de atraso — não fica lixo para trás", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedAtiva(t, {
      subscriptionStatus: "overdue",
      overdueSince: Date.now() - 2 * DAY,
    });

    await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: ASSINATURA,
      asaasCustomerId: CLIENTE,
    });

    const user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("cancelled");
    expect(user!.overdueSince).toBeUndefined();
  });
});

describe("os demais eventos seguem a regra que já estava escrita", () => {
  it("PAYMENT_REFUNDED continua cancelando", () => {
    const intent = interpretAsaasWebhook({
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_x", customer: CLIENTE, subscription: ASSINATURA },
    });
    expect(intent.action).toBe("cancel");
  });

  it("PAYMENT_DELETED NÃO tem efeito sobre acesso", () => {
    // Confirmado em produção: as duas exclusões de cobrança da assinatura
    // duplicada chegaram e foram registradas como "ignored".
    const intent = interpretAsaasWebhook({
      event: "PAYMENT_DELETED",
      payment: { id: "pay_x", customer: CLIENTE, subscription: ASSINATURA },
    });
    expect(intent.action).toBe("ignore");
  });

  it("SUBSCRIPTION_CREATED e SUBSCRIPTION_UPDATED não mexem em cobrança", () => {
    for (const event of ["SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED"]) {
      expect(interpretAsaasWebhook({ event, subscription: { id: ASSINATURA } }).action).toBe(
        "ignore",
      );
    }
  });

  it("PAYMENT_OVERDUE marca atraso e NUNCA cancela", () => {
    const intent = interpretAsaasWebhook({
      event: "PAYMENT_OVERDUE",
      payment: { id: "pay_x", customer: CLIENTE, subscription: ASSINATURA },
    });
    expect(intent.action).toBe("overdue");
    expect(intent.action).not.toBe("cancel");
  });
});

describe("a conta isenta não entra no ciclo de inadimplência", () => {
  it("internal e beta vigente seguem liberadas mesmo em atraso", async () => {
    const t = convexTest(schema, modules);
    const agora = Date.now();

    for (const perfil of [
      { accessType: "internal" as const },
      { accessType: "beta" as const, accessExpiresAt: agora + 30 * DAY },
    ]) {
      const userId = await seedAtiva(t, {
        ...perfil,
        subscriptionStatus: "overdue",
        overdueSince: agora - 30 * DAY,
      });
      const user = await ler(t, userId);
      const d = resolveAccess(user!, agora);
      expect(d.blocked).toBe(false);
      expect(d.billingExempt).toBe(true);
    }
  });
});
