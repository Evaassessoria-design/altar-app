import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { effectivePurchaseStatus } from "./lib/purchaseStatus";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// A INVARIANTE QUE ESTE MÓDULO PRECISA MANTER
//
// `status` e `isPurchased` descrevem o mesmo fato com granularidades
// diferentes. Se divergirem, o Resumo Operacional diz que falta comprar um
// item que a tela de Compras mostra como recebido — e a decoradora deixa de
// confiar nos dois.
// ─────────────────────────────────────────────────────────────────────────────

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Decoradora", email: "d@exemplo.com.br", role: "user", subscriptionStatus: "active",
    });
    const outroUserId = await ctx.db.insert("users", {
      name: "Outra", email: "o@exemplo.com.br", role: "user", subscriptionStatus: "active",
    });
    const eventId = await ctx.db.insert("events", {
      userId, name: "Marina & Gabriel", date: "2026-10-10", location: "Fazenda",
      clientName: "Marina", type: "wedding", status: "confirmed",
    });
    // Item ANTIGO: sem `status`, como todos os cadastrados antes desta mudança.
    const antigoPendente = await ctx.db.insert("purchaseItems", {
      userId, eventId, name: "Espuma floral", isPurchased: false, order: 0,
    });
    const antigoComprado = await ctx.db.insert("purchaseItems", {
      userId, eventId, name: "Fita de cetim", isPurchased: true, order: 1,
    });
    const supplierOutraEmpresa = await ctx.db.insert("suppliers", {
      userId: outroUserId, companyName: "Flores da Concorrente", searchName: "flores da concorrente",
      category: "flores", createdAt: "2026-01-01", updatedAt: "2026-01-01",
    });
    return { userId, eventId, antigoPendente, antigoComprado, supplierOutraEmpresa };
  });
  return { t, ...ids };
}

describe("dados antigos continuam corretos, sem backfill", () => {
  it("item sem status é lido como necessidade ou comprado, conforme o booleano", async () => {
    const { t, antigoPendente, antigoComprado } = await cenario();
    const [pend, comp] = await t.run(async (ctx) => [
      await ctx.db.get(antigoPendente),
      await ctx.db.get(antigoComprado),
    ]);
    expect(pend!.status).toBeUndefined();
    expect(comp!.status).toBeUndefined();
    expect(effectivePurchaseStatus(pend!)).toBe("necessidade");
    expect(effectivePurchaseStatus(comp!)).toBe("comprado");
  });
});

describe("status e isPurchased nunca divergem", () => {
  async function mudarPara(status: string) {
    const { t, antigoPendente } = await cenario();
    await t.run(async (ctx) => {
      const { isPurchasedForStatus } = await import("./lib/purchaseStatus");
      await ctx.db.patch(antigoPendente, {
        status: status as never,
        isPurchased: isPurchasedForStatus(status as never),
      });
    });
    return t.run(async (ctx) => ctx.db.get(antigoPendente));
  }

  it.each([
    ["necessidade", false],
    ["cotacao", false],
    ["aprovado", false],
    ["comprado", true],
    ["recebido", true],
    ["cancelado", false],
  ])("situacao %s => isPurchased %s", async (status, esperado) => {
    const item = await mudarPara(status);
    expect(item!.isPurchased).toBe(esperado);
    expect(effectivePurchaseStatus(item!)).toBe(status);
  });

  it("a mutation setPurchaseStatus grava os dois campos juntos", () => {
    // Trava de fonte: se alguém remover o `isPurchased` do patch, as duas
    // informações voltam a divergir sem nenhum teste de dados perceber.
    const fonte = readFileSync("convex/purchases.ts", "utf-8");
    const i = fonte.indexOf("export const setPurchaseStatus =");
    const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
    expect(corpo).toContain("status: args.status");
    expect(corpo).toContain("isPurchased: isPurchasedForStatus(args.status)");
  });
});

describe("isolamento entre empresas", () => {
  it("nao aceita fornecedor do catalogo de OUTRA empresa", async () => {
    const { t, eventId, supplierOutraEmpresa } = await cenario();
    // A guarda vive em addPurchase/updatePurchase; conferimos a fonte porque
    // o convex-test nao autentica (o componente Better Auth nao e registrado).
    const fonte = readFileSync("convex/purchases.ts", "utf-8");
    for (const fn of ["addPurchase", "updatePurchase"]) {
      const i = fonte.indexOf(`export const ${fn} =`);
      const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
      expect(corpo, `${fn} nao valida o dono do fornecedor`).toContain(
        "supplier.userId !== user._id",
      );
    }
    // E o dado de apoio existe mesmo, de outra empresa.
    const s = await t.run(async (ctx) => ctx.db.get(supplierOutraEmpresa));
    expect(s).not.toBeNull();
    expect(eventId).toBeDefined();
  });

  it("listAllPurchases usa indice por usuario — nunca varre a tabela", async () => {
    const fonte = readFileSync("convex/purchases.ts", "utf-8");
    const i = fonte.indexOf("export const listAllPurchases =");
    const corpo = fonte.slice(i);
    expect(corpo).toContain('withIndex("by_user"');
    expect(corpo).toContain("requireUser");
  });
});
