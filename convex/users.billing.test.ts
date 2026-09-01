import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { resolveAccess, OVERDUE_TOLERANCE_DAYS } from "./lib/access";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — o caminho de ESCRITA da cobrança.
//
// lib/access.test.ts cobre a REGRA (dada uma conta, bloqueia ou não).
// Aqui exercitamos as internalMutations que o webhook chama de verdade, com
// banco real: elas precisam gravar `overdueSince` no primeiro atraso, NÃO
// reiniciar a contagem nos avisos repetidos do Asaas, e zerá-la quando o
// pagamento entra. Sem isso, a tolerância nunca terminaria.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

async function seedUser(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
): Promise<Id<"users">> {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Cliente",
      email: "cliente@exemplo.com",
      role: "user",
      subscriptionStatus: "active",
      asaasCustomerId: "cus_TESTE",
      asaasSubscriptionId: "sub_TESTE",
      ...overrides,
    }),
  );
}

describe("markSubscriptionOverdue — inicia a contagem da tolerância", () => {
  it("rebaixa de active para overdue e grava quando o atraso começou", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await t.mutation(internal.users.markSubscriptionOverdue, {
      asaasCustomerId: "cus_TESTE",
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("overdue");
    expect(typeof user?.overdueSince).toBe("number");
  });

  it("avisos repetidos NÃO reiniciam a contagem", async () => {
    // O Asaas reenvia PAYMENT_OVERDUE. Se cada aviso zerasse o relógio, a
    // tolerância nunca acabaria — que era exatamente o problema anterior.
    const t = convexTest(schema, modules);
    const inicio = Date.now() - 5 * DAY;
    const userId = await seedUser(t, {
      subscriptionStatus: "overdue",
      overdueSince: inicio,
    });

    await t.mutation(internal.users.markSubscriptionOverdue, {
      asaasCustomerId: "cus_TESTE",
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.overdueSince).toBe(inicio);
  });

  it("preenche a data que faltava numa conta marcada antes desta regra", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { subscriptionStatus: "overdue" });

    await t.mutation(internal.users.markSubscriptionOverdue, {
      asaasCustomerId: "cus_TESTE",
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("overdue");
    expect(typeof user?.overdueSince).toBe("number");
  });

  it.each(["trial", "expired", "cancelled"] as const)(
    "não rebaixa quem está em %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const userId = await seedUser(t, { subscriptionStatus: status });

      await t.mutation(internal.users.markSubscriptionOverdue, {
        asaasCustomerId: "cus_TESTE",
      });

      const user = await t.run((ctx) => ctx.db.get(userId));
      expect(user?.subscriptionStatus).toBe(status);
      expect(user?.overdueSince).toBeUndefined();
    },
  );
});

describe("pagamento entrou — a tolerância zera", () => {
  it("activateSubscriptionByCustomer reativa e limpa overdueSince", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {
      subscriptionStatus: "overdue",
      overdueSince: Date.now() - 6 * DAY,
    });

    await t.mutation(internal.users.activateSubscriptionByCustomer, {
      asaasCustomerId: "cus_TESTE",
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("active");
    expect(user?.overdueSince).toBeUndefined();
  });

  it("atrasar, pagar e atrasar de novo recomeça a contagem do zero", async () => {
    // Sem a limpeza acima, o segundo atraso seria julgado pela data do PRIMEIRO
    // e o cliente cairia no paywall imediatamente, mesmo estando em dia.
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {
      subscriptionStatus: "overdue",
      overdueSince: Date.now() - 300 * DAY,
    });

    await t.mutation(internal.users.activateSubscriptionByCustomer, {
      asaasCustomerId: "cus_TESTE",
    });
    await t.mutation(internal.users.markSubscriptionOverdue, {
      asaasCustomerId: "cus_TESTE",
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user).not.toBeNull();
    const decisao = resolveAccess(user!);
    expect(decisao.blocked).toBe(false);
    expect(decisao.overdueDaysLeft).toBe(OVERDUE_TOLERANCE_DAYS);
  });
});

describe("cancelSubscriptionByAsaasRef — o cancelamento chega ao usuário certo", () => {
  it("encontra pelo id da assinatura", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const via = await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      asaasSubscriptionId: "sub_TESTE",
    });

    expect(via.matchedBy).toBe("subscription");
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("cancelled");
  });

  it("cai no id do cliente quando o cadastro não tem assinatura gravada", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { asaasSubscriptionId: undefined });

    const via = await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      asaasSubscriptionId: "sub_QUE_NAO_CASA",
      asaasCustomerId: "cus_TESTE",
    });

    expect(via.matchedBy).toBe("customer");
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("cancelled");
  });

  it("avisa quando não encontra ninguém, em vez de escrever às cegas", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    const via = await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      asaasSubscriptionId: "sub_DESCONHECIDA",
      asaasCustomerId: "cus_DESCONHECIDO",
    });

    expect(via.matchedBy).toBe("not_found");
  });

  it("o cancelamento deixa a conta bloqueada de verdade", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      asaasSubscriptionId: "sub_TESTE",
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(resolveAccess(user!)).toMatchObject({
      blocked: true,
      reason: "subscription_cancelled",
    });
  });
});
