import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  authComponent: {
    safeGetAuthUser: async () => null,
    getAuthUser: async () => null,
    registerRoutes: () => {},
    adapter: () => ({}),
  },
  createAuth: () => ({}),
}));

import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

// ═════════════════════════════════════════════════════════════════════════════
// A ÚNICA PORTA ABERTA DO ALTAR
//
// `landingLeads.submit` é a única mutation que escreve sem sessão: a landing
// page chama por quem ainda não tem conta. Qualquer pessoa na internet pode
// chamá-la direto, sem passar pelo formulário.
//
// Ela continua tendo de aceitar quem é de verdade — nome comprido, e-mail
// corporativo, telefone com código de país — e recusar o que o formulário
// nunca mandaria.
// ═════════════════════════════════════════════════════════════════════════════

describe("captação da landing", () => {
  it("aceita o visitante normal e normaliza o telefone para a Central", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.landingLeads.submit, {
      name: "  Helena Prado  ",
      email: "  Helena@Example.COM ",
      whatsapp: "(11) 99999-8888",
      intent: "demo",
    });

    const lead = await t.run(async (ctx) => ctx.db.query("landingLeads").first());
    expect(lead?.name).toBe("Helena Prado");
    // E-mail é a chave de deduplicação: minúsculo e sem espaço, sempre.
    expect(lead?.email).toBe("helena@example.com");
    expect(lead?.whatsapp).toBe("(11) 99999-8888");
    expect(lead?.whatsappE164).toBe("+5511999998888");
  });

  it("o mesmo e-mail atualiza em vez de acumular linha", async () => {
    const t = convexTest(schema, modules);
    const base = { email: "helena@example.com", intent: "demo" as const };

    await t.mutation(api.landingLeads.submit, { ...base, name: "Helena" });
    await t.mutation(api.landingLeads.submit, {
      ...base,
      name: "Helena Prado",
      intent: "beta",
      whatsapp: "11999998888",
    });

    const leads = await t.run(async (ctx) => ctx.db.query("landingLeads").collect());
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Helena Prado");
    expect(leads[0].intent).toBe("beta");
  });

  it("recusa e-mail que não é e-mail", async () => {
    const t = convexTest(schema, modules);
    for (const email of ["", "   ", "helena", "helena@", "@example.com", "helena@example"]) {
      await expect(
        t.mutation(api.landingLeads.submit, { name: "Helena", email, intent: "demo" }),
      ).rejects.toThrow(/e-mail/i);
    }
    const leads = await t.run(async (ctx) => ctx.db.query("landingLeads").collect());
    expect(leads).toHaveLength(0);
  });

  it("recusa cadastro sem nome", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.landingLeads.submit, {
        name: "   ",
        email: "helena@example.com",
        intent: "demo",
      }),
    ).rejects.toThrow(/nome/i);
  });

  it("um campo de um megabyte não entra no banco", async () => {
    // Sem teto, um endpoint aberto vira espaço de armazenamento gratuito.
    const t = convexTest(schema, modules);
    await t.mutation(api.landingLeads.submit, {
      name: "N".repeat(50_000),
      email: "helena@example.com",
      whatsapp: "9".repeat(5_000),
      intent: "beta",
    });

    const lead = await t.run(async (ctx) => ctx.db.query("landingLeads").first());
    // Nome é rótulo: cortar não vira mentira.
    expect(lead!.name.length).toBeLessThanOrEqual(120);
    // Telefone absurdo é DESCARTADO, não cortado — meio número é o número de
    // outra pessoa, e a Central ligaria para ela.
    expect(lead!.whatsapp).toBeUndefined();
    expect(lead!.whatsappE164).toBeUndefined();
  });

  it("e-mail comprido demais é recusado, não truncado", async () => {
    // Truncar produziria um endereço de outra pessoa — e escreveríamos a ela.
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.landingLeads.submit, {
        name: "Helena",
        email: `${"e".repeat(500)}@example.com`,
        intent: "demo",
      }),
    ).rejects.toThrow(/e-mail/i);

    const leads = await t.run(async (ctx) => ctx.db.query("landingLeads").collect());
    expect(leads).toHaveLength(0);
  });

  it("telefone que não normaliza fica sem o campo canônico — e não inventa número", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.landingLeads.submit, {
      name: "Helena",
      email: "helena@example.com",
      whatsapp: "não tenho",
      intent: "demo",
    });

    const lead = await t.run(async (ctx) => ctx.db.query("landingLeads").first());
    expect(lead?.whatsapp).toBe("não tenho");
    expect(lead?.whatsappE164).toBeUndefined();
  });
});
