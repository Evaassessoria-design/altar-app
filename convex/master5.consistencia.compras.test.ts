import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { effectivePurchaseStatus, isPendingStatus } from "./lib/purchaseStatus";
import { resumirPanorama } from "./lib/panoramaDeCompras";
import type { MutationCtx } from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — "COMPRA PENDENTE" SIGNIFICA A MESMA COISA EM TODO LUGAR
//
// `isPurchased === false` inclui o item CANCELADO. Quem usa esse filtro cru
// afirma que a decoradora ainda precisa comprar uma peça que ela própria
// tirou da lista. O MASTER #5 corrigiu isso no Dashboard; a auditoria achou
// os mesmos três casos ainda de pé:
//
//   · notificações: nag recorrente por causa de item cancelado;
//   · cabeçalho da seção na tela de Compras ("3/10 adquiridos");
//   · PDF do evento — pior de todos, porque manda a equipe procurar no galpão
//     uma peça que ninguém comprou de propósito.
//
// A regra única é `isPendingStatus(effectivePurchaseStatus(item))`.
// ─────────────────────────────────────────────────────────────────────────────

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: MutationCtx) => {
    const userId = await ctx.db.insert("users", {
      name: "D", email: "d@ex.com", role: "user", subscriptionStatus: "active",
    });
    const eventId = await ctx.db.insert("events", {
      userId, name: "E", type: "wedding", date: "2026-10-10",
      location: "L", clientName: "C", status: "confirmed",
    });
    const base = { userId, eventId, order: 0 };
    await ctx.db.insert("purchaseItems", { ...base, name: "Rosas", isPurchased: false });
    await ctx.db.insert("purchaseItems", { ...base, name: "Velas", isPurchased: true, status: "recebido" });
    await ctx.db.insert("purchaseItems", {
      ...base, name: "Arco desistido", isPurchased: false, status: "cancelado",
    });
    return { userId, eventId };
  });
  return { t, ...ids };
}

describe("a mesma pergunta, a mesma resposta", () => {
  it("cancelado não é pendência para NENHUM módulo", async () => {
    const { t, eventId } = await cenario();
    const itens = await t.run(async (ctx) =>
      ctx.db.query("purchaseItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    );

    const regraCrua = itens.filter((i) => !i.isPurchased).length; // 2 — conta o cancelado
    const regraCerta = itens.filter((i) => isPendingStatus(effectivePurchaseStatus(i))).length;
    const doPainel = resumirPanorama(itens, "2026-09-02").pendentes;

    expect(regraCrua).toBe(2);
    expect(regraCerta).toBe(1);
    expect(doPainel).toBe(regraCerta); // painel e regra concordam
  });

  it("o denominador impresso também exclui o cancelado", async () => {
    const { t, eventId } = await cenario();
    const itens = await t.run(async (ctx) =>
      ctx.db.query("purchaseItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    );
    const naConta = itens.filter((i) => effectivePurchaseStatus(i) !== "cancelado");
    expect(`${naConta.filter((i) => i.isPurchased).length}/${naConta.length}`).toBe("1/2");
  });
});

describe("nenhum módulo volta a usar o filtro cru", () => {
  it.each([
    ["convex/notifications.ts", "notificação de compra pendente"],
    ["convex/dashboard.ts", "contagem do painel"],
  ])("%s usa a situação efetiva", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    expect(fonte).toContain("isPendingStatus(effectivePurchaseStatus(");
    // O filtro cru no banco é o defeito voltando.
    expect(fonte).not.toMatch(/q\.eq\(q\.field\("isPurchased"\), false\)/);
  });

  it.each([
    ["src/lib/generate-event-pdf.ts", "PDF do evento"],
    ["src/pages/app/compras/page.tsx", "cabeçalho da seção"],
  ])("%s não conta cancelado no denominador", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    expect(fonte).toContain('effectivePurchaseStatus');
    expect(fonte).toContain("naConta");
  });
});
