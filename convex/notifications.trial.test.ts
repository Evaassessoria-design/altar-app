import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — o sino, com banco de verdade.
//
// lib/trialAlerts.test.ts cobre a REGRA pura. Aqui rodamos a mutation que o
// cron das 8h UTC executa (`internal.notifications.generateDailyAlerts`) sobre
// um banco com contas de tipos diferentes, e conferimos QUEM ficou com a
// notificação gravada.
//
// É o teste que reproduz o problema relatado: a conta interna acordava todo dia
// com "Trial expirando em breve" / "Assine agora".
//
// `generateDailyAlerts` é internalMutation e varre todos os usuários — não
// depende de sessão, então roda inteira no convex-test (o componente Better
// Auth não está registrado aqui).
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** Trial terminando amanhã: dentro da janela de aviso para um cliente. */
const AMANHA = new Date(Date.now() + DAY).toISOString();

async function seedUser(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown>,
): Promise<Id<"users">> {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Conta",
      email: `${Math.random().toString(36).slice(2)}@exemplo.com`,
      role: "user",
      subscriptionStatus: "trial",
      trialEndDate: AMANHA,
      ...overrides,
    } as never),
  );
}

async function avisosDeTrial(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  // Filtra em JS de propósito: dentro de `t.run` o `ctx` do convex-test não
  // carrega a tipagem dos índices da tabela, e um `withIndex` aqui quebra o
  // typecheck que o `npx convex dev` roda. O volume é de teste — irrelevante.
  const todas = await t.run(async (ctx) => ctx.db.query("notifications").collect());
  return todas.filter((n) => n.userId === userId && n.type === "trial_expiring");
}

describe("generateDailyAlerts — aviso de trial por tipo de conta", () => {
  it("não notifica internal, mas notifica o cliente no MESMO banco", async () => {
    const t = convexTest(schema, modules);

    const interna = await seedUser(t, { accessType: "internal" });
    const cliente = await seedUser(t, {});

    await t.mutation(internal.notifications.generateDailyAlerts, {});

    // O par importa: se ninguém recebesse, o teste passaria por engano.
    expect(await avisosDeTrial(t, interna)).toHaveLength(0);
    expect(await avisosDeTrial(t, cliente)).toHaveLength(1);
  });

  it("não notifica admin do ALTAR", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedUser(t, { role: "admin" });

    await t.mutation(internal.notifications.generateDailyAlerts, {});

    expect(await avisosDeTrial(t, admin)).toHaveLength(0);
  });

  it("não notifica beta vigente, mas notifica beta vencido", async () => {
    const t = convexTest(schema, modules);

    const vigente = await seedUser(t, {
      accessType: "beta",
      accessExpiresAt: Date.now() + 30 * DAY,
    });
    const vencido = await seedUser(t, {
      accessType: "beta",
      accessExpiresAt: Date.now() - DAY,
    });

    await t.mutation(internal.notifications.generateDailyAlerts, {});

    expect(await avisosDeTrial(t, vigente)).toHaveLength(0);
    expect(await avisosDeTrial(t, vencido)).toHaveLength(1);
  });

  it("assinante ativo não recebe aviso de trial", async () => {
    const t = convexTest(schema, modules);
    const ativo = await seedUser(t, { subscriptionStatus: "active" });

    await t.mutation(internal.notifications.generateDailyAlerts, {});

    expect(await avisosDeTrial(t, ativo)).toHaveLength(0);
  });

  it("não duplica: rodar duas vezes no mesmo dia gera um aviso só", async () => {
    const t = convexTest(schema, modules);
    const cliente = await seedUser(t, {});

    await t.mutation(internal.notifications.generateDailyAlerts, {});
    await t.mutation(internal.notifications.generateDailyAlerts, {});

    expect(await avisosDeTrial(t, cliente)).toHaveLength(1);
  });

  it("a correção não mexeu em cobrança: nenhum campo financeiro foi tocado", async () => {
    const t = convexTest(schema, modules);
    const interna = await seedUser(t, {
      accessType: "internal",
      asaasCustomerId: "cus_teste",
      asaasSubscriptionId: "sub_teste",
    });

    await t.mutation(internal.notifications.generateDailyAlerts, {});

    const depois = await t.run(async (ctx) => ctx.db.get(interna));
    expect(depois?.subscriptionStatus).toBe("trial");
    expect(depois?.trialEndDate).toBe(AMANHA);
    expect(depois?.asaasCustomerId).toBe("cus_teste");
    expect(depois?.asaasSubscriptionId).toBe("sub_teste");
    expect(depois?.accessType).toBe("internal");
  });
});
