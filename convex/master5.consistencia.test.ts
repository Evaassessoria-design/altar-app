import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { deleteTeamMemberCascade } from "./lib/cascade";
import { custoDoEvento } from "./lib/custoDoEvento";
import { resumirPanorama } from "./lib/panoramaDeCompras";
import { effectivePurchaseStatus } from "./lib/purchaseStatus";
import { resolverResponsavel } from "./lib/responsavel";
import { ultimaAtualizacao } from "./lib/ultimaAtualizacao";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA CRUZADA DO MASTER #5
//
// Cada bloco tem os seus próprios testes. Este arquivo existe para a costura
// ENTRE eles: os pontos onde dois módulos escritos em rodadas diferentes
// podem discordar sobre o mesmo dado — que é exatamente como este projeto
// ganhou, no passado, duas telas mostrando números diferentes para o mesmo
// evento.
// ─────────────────────────────────────────────────────────────────────────────

const HOJE = "2026-09-02";

async function empresaCompleta() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: MutationCtx) => {
    const userId = await ctx.db.insert("users", {
      name: "Decoradora", email: "d@ex.com", role: "user", subscriptionStatus: "active",
    });
    const camila = await ctx.db.insert("teamMembers", {
      userId, name: "Camila", role: "Coordenação",
    });
    const eventoA = await ctx.db.insert("events", {
      userId, name: "Casamento A", type: "wedding", date: "2026-10-10",
      location: "Fazenda", clientName: "A", status: "confirmed", responsibleId: camila,
    });
    const eventoB = await ctx.db.insert("events", {
      userId, name: "Aniversário B", type: "birthday", date: "2026-11-11",
      location: "Salão", clientName: "B", status: "planning",
    });

    // Evento A: receita lançada, uma compra lançada e uma fora do livro.
    const txId = await ctx.db.insert("transactions", {
      userId, eventId: eventoA, type: "expense", category: "Compras",
      description: "Rosas", amount: 400, date: "2026-08-20", isPaid: true,
    });
    await ctx.db.insert("transactions", {
      userId, eventId: eventoA, type: "income", category: "Sinal",
      description: "Sinal", amount: 5000, date: "2026-08-01", isPaid: true,
    });
    await ctx.db.insert("purchaseItems", {
      userId, eventId: eventoA, name: "Rosas", isPurchased: true, order: 0,
      status: "recebido", unitPrice: 400, transactionId: txId,
    });
    await ctx.db.insert("purchaseItems", {
      userId, eventId: eventoA, name: "Velas", isPurchased: false, order: 1,
      unitPrice: 10, quantity: 30, dueDate: "2026-08-25", responsibleId: camila,
    });
    // Cancelada com preço alto: não pode entrar em conta nenhuma.
    await ctx.db.insert("purchaseItems", {
      userId, eventId: eventoA, name: "Arco desistido", isPurchased: false, order: 2,
      status: "cancelado", unitPrice: 9000,
    });

    // Evento B: uma compra fora do livro.
    await ctx.db.insert("purchaseItems", {
      userId, eventId: eventoB, name: "Toalhas", isPurchased: false, order: 0,
      unitPrice: 40, quantity: 10,
    });

    return { userId, camila, eventoA, eventoB };
  });
  return { t, ...ids };
}

/** As compras de um evento, no formato que `custoDoEvento` espera. */
async function comprasDoEvento(ctx: MutationCtx, eventId: Id<"events">) {
  const itens = await ctx.db
    .query("purchaseItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  return itens.map((c) => ({
    unitPrice: c.unitPrice,
    quantity: c.quantity,
    cancelada: effectivePurchaseStatus(c) === "cancelado",
    transactionId: c.transactionId as string | undefined,
  }));
}

describe("Bloco A × Bloco B — 'fora do livro' é o MESMO número", () => {
  it("o total do painel bate com a soma por evento", async () => {
    // Se estes dois divergirem, o painel diz "R$ 700 fora do financeiro" e o
    // evento diz outra coisa — e a decoradora não confia em nenhum dos dois.
    const { t, userId, eventoA, eventoB } = await empresaCompleta();

    const { doPainel, porEvento } = await t.run(async (ctx) => {
      const todas = await ctx.db
        .query("purchaseItems")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const painel = resumirPanorama(todas, HOJE);

      let soma = 0;
      for (const eventId of [eventoA, eventoB]) {
        const lancamentos = await ctx.db
          .query("transactions")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect();
        soma += custoDoEvento(lancamentos, await comprasDoEvento(ctx, eventId)).custoForaDoLivro;
      }
      return { doPainel: painel.valorForaDoLivro, porEvento: soma };
    });

    expect(doPainel).toBe(porEvento);
    expect(doPainel).toBe(10 * 30 + 40 * 10); // velas + toalhas
  });

  it("a compra CANCELADA fica de fora dos dois lados", async () => {
    const { t, userId, eventoA } = await empresaCompleta();
    const { painel, evento } = await t.run(async (ctx) => {
      const todas = await ctx.db
        .query("purchaseItems")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const lancamentos = await ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", eventoA))
        .collect();
      return {
        painel: resumirPanorama(todas, HOJE),
        evento: custoDoEvento(lancamentos, await comprasDoEvento(ctx, eventoA)),
      };
    });
    // O arco desistido custaria R$ 9.000 se fosse contado em qualquer um.
    expect(painel.valorForaDoLivro).toBeLessThan(9000);
    expect(evento.custoForaDoLivro).toBeLessThan(9000);
    expect(painel.canceladas).toBe(1);
  });

  it("enquanto houver compra fora do livro, a margem do evento NÃO é afirmada", async () => {
    const { t, eventoA } = await empresaCompleta();
    const resultado = await t.run(async (ctx) => {
      const lancamentos = await ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", eventoA))
        .collect();
      return custoDoEvento(lancamentos, await comprasDoEvento(ctx, eventoA));
    });
    expect(resultado.completo).toBe(false);
    expect(resultado.margem).toBeNull();
  });

  it("lançar a compra que faltava fecha os dois ao mesmo tempo", async () => {
    const { t, userId, eventoA } = await empresaCompleta();
    await t.run(async (ctx) => {
      const velas = (
        await ctx.db.query("purchaseItems").withIndex("by_user", (q) => q.eq("userId", userId)).collect()
      ).find((c) => c.name === "Velas")!;
      const txId = await ctx.db.insert("transactions", {
        userId, eventId: eventoA, type: "expense", category: "Compras",
        description: "Velas", amount: 300, date: "2026-08-25", isPaid: false,
      });
      await ctx.db.patch(velas._id, { transactionId: txId });
    });

    const { painel, evento } = await t.run(async (ctx) => {
      const doEventoA = await ctx.db
        .query("purchaseItems")
        .withIndex("by_event", (q) => q.eq("eventId", eventoA))
        .collect();
      const lancamentos = await ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", eventoA))
        .collect();
      return {
        painel: resumirPanorama(doEventoA, HOJE),
        evento: custoDoEvento(lancamentos, await comprasDoEvento(ctx, eventoA)),
      };
    });
    expect(painel.foraDoLivro).toBe(0);
    expect(evento.completo).toBe(true);
    expect(evento.margem).not.toBeNull();
  });
});

describe("Bloco D × Bloco C — excluir o membro não estraga o resto", () => {
  it("a compra continua com responsável e continua na conta do painel", async () => {
    const { t, userId, camila } = await empresaCompleta();
    await t.run(async (ctx) => deleteTeamMemberCascade(ctx, camila));

    const { compra, painel } = await t.run(async (ctx) => {
      const todas = await ctx.db
        .query("purchaseItems")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      return { compra: todas.find((c) => c.name === "Velas")!, painel: resumirPanorama(todas, HOJE) };
    });

    expect(resolverResponsavel(compra, [])).toEqual({ nome: "Camila", origem: "anotacao" });
    // E o dinheiro dela não some da conta por causa disso.
    expect(painel.valorForaDoLivro).toBe(10 * 30 + 40 * 10);
  });
});

describe("Bloco E — o carimbo não contamina nenhuma outra leitura", () => {
  it("registro sem carimbo continua respondendo pela criação", async () => {
    const { t, eventoB } = await empresaCompleta();
    const evento = await t.run(async (ctx) => ctx.db.get(eventoB));
    expect(evento!.updatedAt).toBeUndefined();
    expect(ultimaAtualizacao(evento!)).toBe(new Date(evento!._creationTime).toISOString());
  });

  it("o carimbo não muda o que o painel de compras conta", async () => {
    const { t, userId } = await empresaCompleta();
    const antes = await t.run(async (ctx) =>
      resumirPanorama(
        await ctx.db.query("purchaseItems").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
        HOJE,
      ),
    );
    await t.run(async (ctx) => {
      const todas = await ctx.db
        .query("purchaseItems")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const c of todas) await ctx.db.patch(c._id, { updatedAt: "2026-09-02T10:00:00.000Z" });
    });
    const depois = await t.run(async (ctx) =>
      resumirPanorama(
        await ctx.db.query("purchaseItems").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
        HOJE,
      ),
    );
    expect(depois).toEqual(antes);
  });
});
