import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { resolveAccess, OVERDUE_TOLERANCE_DAYS } from "./lib/access";
import { ACTIVE_WINDOWS, isActiveWithin } from "./lib/presence";
import type { Doc, Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// MÉTRICAS DO PAINEL ADMIN.
//
// A exigência de negócio é explícita: contas internas e beta NÃO podem contar
// como clientes pagantes nem entrar no MRR. Um erro aqui não quebra o app — faz
// coisa pior, que é dar um número de faturamento errado para decidir o negócio.
//
// `getStats` exige sessão de admin (Better Auth), fora do alcance do
// convex-test. Então montamos a mesma população no banco e aplicamos as mesmas
// funções puras que a query usa (`resolveAccess`, `isActiveWithin`), provando a
// classificação. A fiação da query é travada em admin.guard.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const DIA = 86_400_000;

type Perfil = {
  email: string;
  subscriptionStatus: string;
  accessType?: "client" | "beta" | "internal";
  accessExpiresAt?: number;
  overdueSince?: number;
  lastSeenAt?: number;
};

async function seedPopulacao(t: ReturnType<typeof convexTest>, perfis: Perfil[]) {
  return t.run(async (ctx) => {
    const ids: Id<"users">[] = [];
    for (const p of perfis) {
      ids.push(
        await ctx.db.insert("users", {
          name: p.email,
          email: p.email,
          role: "user",
          subscriptionStatus: p.subscriptionStatus,
          accessType: p.accessType,
          accessExpiresAt: p.accessExpiresAt,
          overdueSince: p.overdueSince,
          lastSeenAt: p.lastSeenAt,
        }),
      );
    }
    return ids;
  });
}

/** Reproduz a separação cobrável × isenta que `getStats` faz. */
function classificar(users: Doc<"users">[], now: number) {
  const isentas = users.filter((u) => resolveAccess(u, now).billingExempt);
  const cobraveis = users.filter((u) => !resolveAccess(u, now).billingExempt);
  const contar = (status: string) =>
    cobraveis.filter((u) => u.subscriptionStatus === status).length;

  const active = contar("active");
  return {
    total: users.length,
    isentas: isentas.length,
    internal: users.filter((u) => (u.accessType ?? "client") === "internal").length,
    beta: users.filter((u) => (u.accessType ?? "client") === "beta").length,
    trial: contar("trial"),
    active,
    overdue: contar("overdue"),
    expired: contar("expired"),
    cancelled: contar("cancelled"),
    overdueBlocked: cobraveis.filter(
      (u) => u.subscriptionStatus === "overdue" && resolveAccess(u, now).blocked,
    ).length,
    mrr: active * 119.9,
    activeWeek: users.filter((u) => isActiveWithin(u.lastSeenAt, ACTIVE_WINDOWS.week, now)).length,
    activeDay: users.filter((u) => isActiveWithin(u.lastSeenAt, ACTIVE_WINDOWS.day, now)).length,
    neverSeen: users.filter((u) => u.lastSeenAt === undefined).length,
  };
}

describe("contas internas e beta ficam FORA da receita", () => {
  it("uma conta interna com assinatura 'ativa' não entra no MRR", async () => {
    // O caso perigoso: alguém marca a própria conta como interna mas o status de
    // cobrança ficou "active" de um teste antigo. Ela NÃO pode virar receita.
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPopulacao(t, [
      { email: "interna@altar", subscriptionStatus: "active", accessType: "internal" },
      { email: "cliente@real", subscriptionStatus: "active" },
    ]);

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const m = classificar(users, now);

    expect(m.total).toBe(2);
    expect(m.active).toBe(1); // só o cliente real
    expect(m.mrr).toBeCloseTo(119.9, 2);
    expect(m.internal).toBe(1);
    expect(m.isentas).toBe(1);
  });

  it("beta VIGENTE fica de fora; beta VENCIDA volta a contar", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPopulacao(t, [
      {
        email: "beta.vigente@x",
        subscriptionStatus: "active",
        accessType: "beta",
        accessExpiresAt: now + 30 * DIA,
      },
      {
        email: "beta.vencida@x",
        subscriptionStatus: "active",
        accessType: "beta",
        accessExpiresAt: now - DIA,
      },
    ]);

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const m = classificar(users, now);

    expect(m.beta).toBe(2);
    expect(m.isentas).toBe(1); // só a vigente
    expect(m.active).toBe(1); // a vencida voltou a ser cobrável
    expect(m.mrr).toBeCloseTo(119.9, 2);
  });

  it("MRR é zero quando só existem contas internas", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPopulacao(t, [
      { email: "eva@altar", subscriptionStatus: "active", accessType: "internal" },
      { email: "dev@altar", subscriptionStatus: "trial", accessType: "internal" },
    ]);

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const m = classificar(users, now);

    expect(m.total).toBe(2);
    expect(m.mrr).toBe(0);
    expect(m.active).toBe(0);
    expect(m.trial).toBe(0); // trial de conta interna também não é funil comercial
  });
});

describe("inadimplência: separar 'atrasou' de 'perdeu o acesso'", () => {
  it("conta os dois separadamente", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPopulacao(t, [
      { email: "atrasou.ontem@x", subscriptionStatus: "overdue", overdueSince: now - DIA },
      {
        email: "atrasou.faz.tempo@x",
        subscriptionStatus: "overdue",
        overdueSince: now - (OVERDUE_TOLERANCE_DAYS + 3) * DIA,
      },
      { email: "sem.data@x", subscriptionStatus: "overdue" },
    ]);

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const m = classificar(users, now);

    expect(m.overdue).toBe(3);
    // Só quem passou da tolerância está de fato bloqueado. Quem não tem data
    // (cadastro anterior à regra) segue liberado, por segurança.
    expect(m.overdueBlocked).toBe(1);
  });

  it("inadimplente não conta como assinante ativo nem gera MRR", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPopulacao(t, [
      { email: "atrasado@x", subscriptionStatus: "overdue", overdueSince: now - DIA },
    ]);

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const m = classificar(users, now);

    expect(m.active).toBe(0);
    expect(m.mrr).toBe(0);
  });
});

describe("uso real — quem abriu o app de verdade", () => {
  it("separa ativos do dia, da semana e quem nunca apareceu", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPopulacao(t, [
      { email: "hoje@x", subscriptionStatus: "active", lastSeenAt: now - 2 * 3_600_000 },
      { email: "semana@x", subscriptionStatus: "active", lastSeenAt: now - 3 * DIA },
      { email: "sumido@x", subscriptionStatus: "active", lastSeenAt: now - 60 * DIA },
      { email: "nunca@x", subscriptionStatus: "trial" },
    ]);

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const m = classificar(users, now);

    expect(m.total).toBe(4);
    expect(m.activeDay).toBe(1);
    expect(m.activeWeek).toBe(2);
    expect(m.neverSeen).toBe(1);
  });

  it("cadastro sem registro de acesso não infla o número de ativos", async () => {
    // Cadastros anteriores à medição não podem parecer usuários ativos.
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPopulacao(t, [
      { email: "antigo1@x", subscriptionStatus: "active" },
      { email: "antigo2@x", subscriptionStatus: "active" },
    ]);

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const m = classificar(users, now);

    expect(m.activeWeek).toBe(0);
    expect(m.neverSeen).toBe(2);
  });
});

describe("população mista — o retrato completo", () => {
  it("classifica cada conta em exatamente um balde", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await seedPopulacao(t, [
      { email: "eva@altar", subscriptionStatus: "expired", accessType: "internal", lastSeenAt: now },
      { email: "beta@x", subscriptionStatus: "trial", accessType: "beta", accessExpiresAt: now + 10 * DIA },
      { email: "pagante1@x", subscriptionStatus: "active", lastSeenAt: now - 2 * DIA },
      { email: "pagante2@x", subscriptionStatus: "active", lastSeenAt: now - 40 * DIA },
      { email: "trial@x", subscriptionStatus: "trial", lastSeenAt: now - 3600_000 },
      { email: "atrasado@x", subscriptionStatus: "overdue", overdueSince: now - 2 * DIA },
      { email: "expirado@x", subscriptionStatus: "expired" },
      { email: "cancelado@x", subscriptionStatus: "cancelled" },
    ]);

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    const m = classificar(users, now);

    expect(m.total).toBe(8);
    expect(m.isentas).toBe(2); // eva (internal) + beta vigente
    expect(m.active).toBe(2);
    expect(m.trial).toBe(1); // o trial da conta beta não conta
    expect(m.overdue).toBe(1);
    expect(m.expired).toBe(1); // o expired da conta interna não conta
    expect(m.cancelled).toBe(1);
    expect(m.mrr).toBeCloseTo(239.8, 2);

    // A soma dos baldes cobráveis + isentas fecha o total.
    expect(m.trial + m.active + m.overdue + m.expired + m.cancelled + m.isentas).toBe(m.total);
  });
});
