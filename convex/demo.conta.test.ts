import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";

// ═════════════════════════════════════════════════════════════════════════════
// A CONTA DA DEMONSTRAÇÃO, PRONTA PARA A LIVE
//
// A auditoria de 28/09 achou a conta demo com o teste vencido (o paywall
// cortaria o bloco 2 ao vivo) e como admin (a barra lateral mostraria "Painel
// Admin" na transmissão). `prepararConta` resolve os dois — e, como mexe em
// acesso, as travas importam mais do que o caminho feliz.
// ═════════════════════════════════════════════════════════════════════════════

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

const VENCIDO = "2026-09-15T13:03:12.934Z";

async function banco(contas: { email: string; asaas?: boolean }[]) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const c of contas) {
      await ctx.db.insert("users", {
        name: c.email, email: c.email, role: "admin", subscriptionStatus: "trial",
        trialEndDate: VENCIDO, ...(c.asaas ? { asaasCustomerId: "cus_123" } : {}),
      });
    }
  });
  const usuarios = () => t.run((ctx) => ctx.db.query("users").collect());
  return { t, usuarios };
}

describe("prepararConta", () => {
  it("libera o acesso e tira o admin — o paywall não corta nada", async () => {
    process.env.ALTAR_DEMO = "1";
    const { t, usuarios } = await banco([{ email: "demo@exemplo.com.br" }]);
    const r = await t.mutation(internal.demo.prepararConta, {});
    expect(r).toEqual({
      email: "demo@exemplo.com.br", role: "user", accessType: "internal", bloqueada: false,
    });
    // O trial vencido continua registrado: é fato, não é o que decide o acesso.
    expect((await usuarios())[0].trialEndDate).toBe(VENCIDO);
    // Idempotente.
    await expect(t.mutation(internal.demo.prepararConta, {})).resolves.toMatchObject({ bloqueada: false });
  });

  it("sem ALTAR_DEMO, recusa — e não mexe em ninguém", async () => {
    delete process.env.ALTAR_DEMO;
    const { t, usuarios } = await banco([{ email: "demo@exemplo.com.br" }]);
    await expect(t.mutation(internal.demo.prepararConta, {})).rejects.toThrow(/DEMO_ONLY|demonstração/);
    const [u] = await usuarios();
    expect(u.role).toBe("admin");
    expect(u.accessType).toBeUndefined();
  });

  it("banco com rastro de cobrança é produção — recusa mesmo com a variável", async () => {
    process.env.ALTAR_DEMO = "1";
    const { t, usuarios } = await banco([{ email: "cliente@ex.com", asaas: true }]);
    await expect(t.mutation(internal.demo.prepararConta, {})).rejects.toThrow();
    expect((await usuarios())[0].accessType).toBeUndefined();
  });

  it("mais de uma conta sem e-mail: não escolhe sozinha", async () => {
    process.env.ALTAR_DEMO = "1";
    const { t, usuarios } = await banco([{ email: "a@ex.com" }, { email: "b@ex.com" }]);
    await expect(t.mutation(internal.demo.prepararConta, {})).rejects.toThrow(/Informe/);
    expect((await usuarios()).every((u) => u.accessType === undefined)).toBe(true);
    await t.mutation(internal.demo.prepararConta, { email: "B@EX.COM" });
    const [a, b] = await usuarios();
    expect(a.accessType).toBeUndefined();
    expect(b).toMatchObject({ accessType: "internal", role: "user" });
  });
});
