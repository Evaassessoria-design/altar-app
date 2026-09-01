import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

// TRAVA: interessado no ALTAR não pode voltar a ser dado invisível.
//
// A tabela `landingLeads` tinha só o caminho de ESCRITA (a landing page
// gravava) e nenhuma leitura. Quem pedia demonstração caía num banco que
// ninguém abria.

describe("landingLeads.submit continua funcionando para visitante", () => {
  it("grava o interessado sem exigir autenticação", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.landingLeads.submit, {
      name: "Ana Decorações",
      email: "Ana@Exemplo.com.br",
      whatsapp: "(11) 90000-0000",
      intent: "demo",
    });
    const gravados = await t.run(async (ctx) => ctx.db.query("landingLeads").collect());
    expect(gravados).toHaveLength(1);
    expect(gravados[0].email).toBe("ana@exemplo.com.br"); // normalizado
    expect(gravados[0].intent).toBe("demo");
  });

  it("não duplica por e-mail — atualiza o registro existente", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.landingLeads.submit, {
      name: "Ana", email: "ana@exemplo.com.br", intent: "demo",
    });
    await t.mutation(api.landingLeads.submit, {
      name: "Ana Silva", email: "ana@exemplo.com.br", intent: "beta",
    });
    const gravados = await t.run(async (ctx) => ctx.db.query("landingLeads").collect());
    expect(gravados).toHaveLength(1);
    expect(gravados[0].name).toBe("Ana Silva");
    expect(gravados[0].intent).toBe("beta");
  });

  it("registro SEM status continua valido — nenhum backfill foi exigido", async () => {
    // O campo `status` entrou opcional. Todo registro anterior a ele precisa
    // continuar gravável e legível.
    const t = convexTest(schema, modules);
    await t.mutation(api.landingLeads.submit, {
      name: "Antigo", email: "antigo@exemplo.com.br", intent: "demo",
    });
    const [lead] = await t.run(async (ctx) => ctx.db.query("landingLeads").collect());
    expect(lead.status).toBeUndefined();
  });
});

describe("leitura administrativa dos interessados", () => {
  const fonte = readFileSync("convex/admin.ts", "utf-8");

  function corpoDe(nome: string): string {
    const i = fonte.indexOf(`export const ${nome} =`);
    expect(i).toBeGreaterThan(-1);
    const proximo = fonte.indexOf("\nexport ", i + 1);
    return fonte.slice(i, proximo === -1 ? undefined : proximo);
  }

  it("listLandingLeads existe e exige administrador", () => {
    expect(corpoDe("listLandingLeads")).toContain("requireAdmin");
  });

  it("setLandingLeadStatus exige administrador", () => {
    expect(corpoDe("setLandingLeadStatus")).toContain("requireAdmin");
  });

  it("o acompanhamento NÃO toca em cobrança nem concede acesso", () => {
    // Marcar "convertido" é anotação comercial: não cria conta, não libera
    // assinatura, não mexe no Asaas.
    const corpo = corpoDe("setLandingLeadStatus");
    expect(corpo).not.toMatch(/subscriptionStatus|accessType|asaas/i);
    expect(corpo).not.toContain('insert("users"');
  });

  it("status ausente é reportado como 'novo'", () => {
    expect(corpoDe("listLandingLeads")).toContain('l.status ?? ("novo" as const)');
  });
});
