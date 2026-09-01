import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { effectiveAssemblyStatus, resumirCarregamento } from "./lib/assemblyStatus";

// Regressao do carregamento: o campo novo e aditivo e nao pode interferir em
// `checkOnAssembly`, que a ficha de montagem em PDF usa para desenhar caixinhas.

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Decoradora", email: "d@exemplo.com.br", role: "user", subscriptionStatus: "active",
    });
    const eventId = await ctx.db.insert("events", {
      userId, name: "Marina & Gabriel", date: "2026-10-10", location: "Fazenda",
      clientName: "Marina", type: "wedding", status: "confirmed",
    });
    // Item ANTIGO: sem `operationalStatus`, como todos os ja cadastrados.
    const antigo = await ctx.db.insert("assemblyItems", {
      userId, eventId, area: "cerimonia", order: 0, name: "Arco de flores",
      includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe",
      createdAt: "2026-09-01", updatedAt: "2026-09-01",
    });
    return { userId, eventId, antigo };
  });
  return { t, ...ids };
}

describe("dados antigos", () => {
  it("item sem operationalStatus e lido como pendente", async () => {
    const { t, antigo } = await cenario();
    const item = await t.run(async (ctx) => ctx.db.get(antigo));
    expect(item!.operationalStatus).toBeUndefined();
    expect(effectiveAssemblyStatus(item!)).toBe("pendente");
  });

  it("gravar a situacao NAO altera checkOnAssembly", async () => {
    // Se um mexesse no outro, a ficha de montagem em PDF perderia as
    // caixinhas de conferencia ao alguem mover um item para "carregado".
    const { t, antigo } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(antigo, { operationalStatus: "carregado" }));
    const item = await t.run(async (ctx) => ctx.db.get(antigo));
    expect(item!.operationalStatus).toBe("carregado");
    expect(item!.checkOnAssembly).toBe(true);
    expect(item!.includeInAssemblyReport).toBe(true);
  });

  it("o resumo mistura itens antigos e novos sem quebrar", async () => {
    const { t, userId, eventId } = await cenario();
    await t.run(async (ctx) => {
      await ctx.db.insert("assemblyItems", {
        userId, eventId, area: "cerimonia", order: 1, name: "Vasos",
        includeInAssemblyReport: true, checkOnAssembly: false, visibility: "equipe",
        operationalStatus: "carregado", createdAt: "2026-09-01", updatedAt: "2026-09-01",
      });
    });
    const itens = await t.run(async (ctx) => ctx.db.query("assemblyItems").collect());
    const r = resumirCarregamento(itens);
    expect(r.total).toBe(2);
    expect(r.pendentes).toBe(1);
    expect(r.foraDoGalpao).toBe(1);
  });
});

describe("checkOnAssembly continua sendo preferencia de impressao", () => {
  it("a ficha em PDF ainda o le para desenhar a caixinha", () => {
    // Trava contra alguem "unificar" os dois conceitos por engano.
    const pdf = readFileSync("src/lib/generate-assembly-pdf.ts", "utf-8");
    expect(pdf).toContain("item.checkOnAssembly");
    expect(pdf).not.toContain("operationalStatus");
  });

  it("o modulo de situacao nao conhece checkOnAssembly", () => {
    const lib = readFileSync("convex/lib/assemblyStatus.ts", "utf-8");
    const codigo = lib
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(codigo).not.toContain("checkOnAssembly");
  });
});
