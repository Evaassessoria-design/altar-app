import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";

// Os quatro estagios originais NAO podem mudar de id: qualquer lead ja gravado
// cairia numa coluna inexistente e sumiria do funil.

const ORIGINAIS = ["contact", "quote_sent", "contracted", "discarded"] as const;
const NOVOS = ["contacted", "meeting", "negotiating"] as const;

describe("estagios do funil sao aditivos", () => {
  it("os quatro ids originais continuam aceitos pelo schema", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "D", email: "d@exemplo.com.br", role: "user", subscriptionStatus: "active",
      });
      for (const [i, stage] of ORIGINAIS.entries()) {
        await ctx.db.insert("leads", { userId, clientName: `Lead ${stage}`, stage, order: i });
      }
    });
    const leads = await t.run(async (ctx) => ctx.db.query("leads").collect());
    expect(leads.map((l) => l.stage).sort()).toEqual([...ORIGINAIS].sort());
  });

  it("os tres estagios novos sao aceitos", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "D", email: "d2@exemplo.com.br", role: "user", subscriptionStatus: "active",
      });
      for (const [i, stage] of NOVOS.entries()) {
        await ctx.db.insert("leads", { userId, clientName: `Lead ${stage}`, stage, order: i });
      }
    });
    const leads = await t.run(async (ctx) => ctx.db.query("leads").collect());
    expect(leads).toHaveLength(3);
  });

  it("lead ANTIGO sem os campos comerciais novos continua valido", async () => {
    // Nenhum lead existente tem venue, city, guestCount, source... Todos
    // precisam continuar graváveis e legíveis, sem backfill.
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "D", email: "d3@exemplo.com.br", role: "user", subscriptionStatus: "active",
      });
      return ctx.db.insert("leads", { userId, clientName: "Marina", stage: "contact", order: 0 });
    });
    const lead = await t.run(async (ctx) => ctx.db.get(id));
    expect(lead!.venue).toBeUndefined();
    expect(lead!.source).toBeUndefined();
    expect(lead!.nextAction).toBeUndefined();
    expect(lead!.clientName).toBe("Marina");
  });

  it("a tela do funil conhece exatamente os mesmos sete estagios", () => {
    // Se o schema e a tela discordarem, um lead some da visao sem erro nenhum.
    const page = readFileSync("src/pages/app/funil/page.tsx", "utf-8");
    for (const stage of [...ORIGINAIS, ...NOVOS]) {
      expect(page, `estagio "${stage}" nao aparece em STAGES`).toContain(`id: "${stage}"`);
    }
  });
});

describe("converter em evento reaproveita o lead", () => {
  const fonte = readFileSync("convex/funil.ts", "utf-8");
  const corpo = fonte.slice(fonte.indexOf("export const convertToEvent ="));

  it("usa venue, telefone, orcamento e observacoes do lead como reserva", () => {
    expect(corpo).toContain("lead.venue");
    expect(corpo).toContain("lead.clientPhone");
    expect(corpo).toContain("lead.budget");
    expect(corpo).toContain("lead.notes");
  });

  it("o formulario tem PRECEDENCIA sobre o lead", () => {
    // Ela pode estar corrigindo justamente na hora de fechar.
    expect(corpo).toContain("rest.location || lead.venue");
    expect(corpo).toContain("rest.clientPhone ?? lead.clientPhone");
    expect(corpo).toContain("rest.budget ?? lead.budget");
  });

  it("continua exigindo acesso ativo — o paywall nao foi afrouxado", () => {
    expect(corpo).toContain("requireActiveAccess");
  });

  it("NAO cria cliente central — fora desta rodada", () => {
    expect(corpo).not.toContain('insert("clients"');
  });
});
