import { describe, expect, it, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { modules } from "../test.setup";
import { internal } from "../_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// As travas que impedem um seed de conteúdo para Instagram de rodar no banco
// de produção. Cada camada é testada isoladamente E em conjunto.
//
// O cenário que estas travas existem para evitar: um casamento fictício
// aparecendo no meio dos dados reais de uma cliente pagante.
// ─────────────────────────────────────────────────────────────────────────────

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

const check = internal.demo.checkEnvironment;

describe("camada 1 — variável de ambiente", () => {
  it("BLOQUEIA quando ALTAR_DEMO não está definida", async () => {
    delete process.env.ALTAR_DEMO;
    const t = convexTest(schema, modules);
    const r = await t.query(check, {});
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("ALTAR_DEMO");
  });

  it("BLOQUEIA com valor diferente de \"1\"", async () => {
    const t = convexTest(schema, modules);
    for (const valor of ["0", "true", "sim", ""]) {
      process.env.ALTAR_DEMO = valor;
      expect((await t.query(check, {})).ok, `valor "${valor}"`).toBe(false);
    }
  });

  it("libera num banco vazio com ALTAR_DEMO=1", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    const r = await t.query(check, {});
    expect(r.ok).toBe(true);
    expect(r.usuarios).toBe(0);
  });
});

describe("camada 2 — sinais de produção", () => {
  it("BLOQUEIA se houver conta com cliente Asaas, mesmo com ALTAR_DEMO=1", async () => {
    // O caso perigoso: alguém copia a variável para produção por engano.
    // Um banco com cobrança registrada NÃO é ambiente de demonstração.
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Cliente real", email: "real@x.com", role: "user",
        subscriptionStatus: "active", asaasCustomerId: "cus_REAL",
      }),
    );

    const r = await t.query(check, {});
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("Asaas");
  });

  it("BLOQUEIA também por assinatura Asaas", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Cliente", email: "r2@x.com", role: "user",
        subscriptionStatus: "active", asaasSubscriptionId: "sub_REAL",
      }),
    );
    expect((await t.query(check, {})).ok).toBe(false);
  });

  it("BLOQUEIA quando há usuários demais", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert("users", {
          name: `U${i}`, email: `u${i}@x.com`, role: "user", subscriptionStatus: "trial",
        });
      }
    });
    const r = await t.query(check, {});
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("usuários");
  });

  it("aceita um punhado de contas de teste sem cobrança", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Demo", email: "demo@x.com", role: "admin", subscriptionStatus: "trial",
      });
    });
    expect((await t.query(check, {})).ok).toBe(true);
  });
});

describe("diagnóstico não tem efeito colateral", () => {
  it("checkEnvironment não escreve nada no banco", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.query(check, {});
    await t.run(async (ctx) => {
      expect(await ctx.db.query("users").collect()).toHaveLength(0);
      expect(await ctx.db.query("events").collect()).toHaveLength(0);
    });
  });
});
