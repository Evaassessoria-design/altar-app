import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => {
  const usuarioDaSessao = async (ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string; email?: string } | null> };
  }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { _id: identity.subject, email: identity.email ?? "", name: "Pessoa" };
  };
  return {
    authComponent: {
      safeGetAuthUser: usuarioDaSessao,
      getAuthUser: usuarioDaSessao,
      registerRoutes: () => {},
      adapter: () => ({}),
    },
    createAuth: () => ({}),
  };
});

import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { LIMITE_DO_LIVRO } from "./financeiro";
import { convidadosDoBriefing } from "./lib/convidados";

// ═════════════════════════════════════════════════════════════════════════════
// TRÊS CORREÇÕES PEQUENAS E INDEPENDENTES
//
//  1. PROCEDÊNCIA — a despesa que sobrevive à compra lembra de onde veio;
//  2. ESCALA      — o livro-caixa tem teto, e a tela diz quando bateu nele;
//  3. CONVIDADOS  — proposta criada a partir do evento lê o briefing.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const donaId = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora"))
      .unique())!._id;
    const marina = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-12-05",
      location: "Fazenda", clientName: "Marina", status: "planning",
    });
    return { donaId, marina };
  });

  const compra = async (nome: string, preco: number) =>
    dona.mutation(api.purchases.addPurchase, {
      eventId: ids.marina, name: nome, quantity: 1, unitPrice: preco,
    });

  return { t, dona, ids, compra };
}

describe("procedência: a despesa lembra de qual compra nasceu", () => {
  it("o lançamento nasce com o nome da compra gravado", async () => {
    const { t, dona, compra } = await cenario();
    const id = await compra("120 Cadeiras Dior", 3600);
    const { transactionId } = await dona.mutation(api.purchases.registerCost, {
      id: id as Id<"purchaseItems">,
    });

    const lancamento = await t.run((ctx: MutationCtx) => ctx.db.get(transactionId));
    expect(lancamento?.origemDaCompra?.nome).toBe("120 Cadeiras Dior");
    expect(lancamento?.origemDaCompra?.purchaseItemId).toBe(id);
    // Comprar não é pagar — a regra de sempre, intacta.
    expect(lancamento?.isPaid).toBe(false);
  });

  it("cancelar a compra e MANTER a despesa preserva a procedência", async () => {
    // Era exatamente o buraco: o vínculo operacional some de propósito (compra
    // cancelada não comanda lançamento), e com ele sumia a única informação de
    // onde aqueles R$ 3.600 tinham vindo.
    const { t, dona, compra } = await cenario();
    const id = await compra("120 Cadeiras Dior", 3600);
    const { transactionId } = await dona.mutation(api.purchases.registerCost, {
      id: id as Id<"purchaseItems">,
    });

    await dona.mutation(api.purchases.setPurchaseStatus, {
      id: id as Id<"purchaseItems">, status: "cancelado", despesa: "manter",
    });

    const compraDepois = await t.run((ctx: MutationCtx) => ctx.db.get(id as Id<"purchaseItems">));
    const lancamento = await t.run((ctx: MutationCtx) => ctx.db.get(transactionId));
    // O vínculo OPERACIONAL saiu…
    expect(compraDepois?.transactionId).toBeUndefined();
    // …e a PROCEDÊNCIA ficou.
    expect(lancamento?.origemDaCompra?.nome).toBe("120 Cadeiras Dior");
  });

  it("excluir a compra e manter a despesa também preserva — é por isso que o NOME vai junto", async () => {
    // Um id sozinho (o precedente de `assemblyItems.compositionId`) morreria
    // aqui, justamente no caso em que a procedência é mais necessária.
    const { t, dona, compra } = await cenario();
    const id = await compra("15 Mesas redondas", 1200);
    const { transactionId } = await dona.mutation(api.purchases.registerCost, {
      id: id as Id<"purchaseItems">,
    });
    await dona.mutation(api.purchases.deletePurchase, {
      id: id as Id<"purchaseItems">, despesa: "manter",
    });

    const lancamento = await t.run((ctx: MutationCtx) => ctx.db.get(transactionId));
    expect(lancamento).not.toBeNull();
    expect(lancamento?.origemDaCompra?.nome).toBe("15 Mesas redondas");
  });

  it("a procedência NÃO reativa sincronização: a compra cancelada não manda mais", async () => {
    const { t, dona, compra } = await cenario();
    const id = await compra("2 Lounges", 900);
    const { transactionId } = await dona.mutation(api.purchases.registerCost, {
      id: id as Id<"purchaseItems">,
    });
    await dona.mutation(api.purchases.setPurchaseStatus, {
      id: id as Id<"purchaseItems">, status: "cancelado", despesa: "manter",
    });

    // Editar a compra depois do desvínculo não pode mexer no livro.
    await dona.mutation(api.purchases.updatePurchase, {
      id: id as Id<"purchaseItems">, unitPrice: 5000,
    });
    const lancamento = await t.run((ctx: MutationCtx) => ctx.db.get(transactionId));
    expect(lancamento?.amount).toBe(900);
  });

  it("lançamento feito à mão no Financeiro não ganha procedência inventada", async () => {
    const { t, dona, ids } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, {
      type: "expense", category: "Combustível", description: "Van",
      amount: 300, date: "2026-11-01", isPaid: false, eventId: ids.marina,
    });
    const linha = await t.run((ctx: MutationCtx) => ctx.db.get(id as Id<"transactions">));
    expect(linha?.origemDaCompra).toBeUndefined();
  });
});

describe("escala: o livro-caixa tem teto, e a tela sabe disso", () => {
  it("abaixo do teto, nada muda e a resposta diz que está inteira", async () => {
    const { dona, compra } = await cenario();
    await compra("Uma compra", 100);
    const r = await dona.query(api.financeiro.listTransactions, {});
    expect(r.temMais).toBe(false);
    const resumo = await dona.query(api.financeiro.getSummary, {});
    expect(resumo.incompleto).toBe(false);
  });

  it("acima do teto, a resposta AVISA em vez de afirmar um total que não viu", async () => {
    const { t, dona, ids } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      for (let i = 0; i < LIMITE_DO_LIVRO + 25; i++) {
        await ctx.db.insert("transactions", {
          userId: ids.donaId, eventId: ids.marina, type: "income",
          category: "Contrato", description: `Parcela ${i}`, amount: 100,
          // Datas distintas e crescentes: o corte tem de cair no passado.
          date: `20${20 + Math.floor(i / 300)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
          isPaid: true,
        });
      }
    });

    const r = await dona.query(api.financeiro.listTransactions, {});
    expect(r.itens).toHaveLength(LIMITE_DO_LIVRO);
    expect(r.temMais).toBe(true);

    const resumo = await dona.query(api.financeiro.getSummary, {});
    expect(resumo.incompleto).toBe(true);
    expect(resumo.limite).toBe(LIMITE_DO_LIVRO);
  });

  it("o corte cai no PASSADO — os mais recentes são os que ficam", async () => {
    const { t, dona, ids } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      for (let i = 0; i < LIMITE_DO_LIVRO + 5; i++) {
        await ctx.db.insert("transactions", {
          userId: ids.donaId, type: "income", category: "X",
          description: `n${i}`, amount: 1,
          // i=0 é o mais ANTIGO.
          date: `2020-01-01`, isPaid: true,
        });
      }
      await ctx.db.insert("transactions", {
        userId: ids.donaId, type: "income", category: "Hoje",
        description: "o mais recente", amount: 1, date: "2026-12-31", isPaid: true,
      });
    });
    const r = await dona.query(api.financeiro.listTransactions, {});
    expect(r.itens[0].description).toBe("o mais recente");
  });

  it("o teto não vaza entre contas", async () => {
    const { t, dona, ids } = await cenario();
    const outra = await autenticarComo(t, {
      nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
    });
    await t.run(async (ctx: MutationCtx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("transactions", {
          userId: ids.donaId, type: "income", category: "X",
          description: `n${i}`, amount: 1, date: "2026-01-01", isPaid: true,
        });
      }
    });
    expect((await outra.query(api.financeiro.listTransactions, {})).itens).toHaveLength(0);
    expect((await dona.query(api.financeiro.listTransactions, {})).itens).toHaveLength(10);
  });
});

describe("convidados: a proposta do evento lê o briefing", () => {
  it("proposta criada a partir do EVENTO herda o número do briefing", async () => {
    const { t, dona, ids } = await cenario();
    await t.run((ctx: MutationCtx) =>
      ctx.db.insert("briefings", { eventId: ids.marina, userId: ids.donaId, guestCount: "180" }),
    );
    const id = await dona.mutation(api.propostas.create, { eventId: ids.marina });
    const p = await t.run((ctx: MutationCtx) => ctx.db.get(id as Id<"proposals">));
    expect(p?.eventoConvidados).toBe(180);
  });

  it("evento SEM briefing não quebra e não inventa número", async () => {
    const { t, dona, ids } = await cenario();
    const id = await dona.mutation(api.propostas.create, { eventId: ids.marina });
    const p = await t.run((ctx: MutationCtx) => ctx.db.get(id as Id<"proposals">));
    expect(p?.eventoConvidados).toBeUndefined();
  });

  it("briefing com FAIXA não vira número — o documento não afirma o que ninguém combinou", async () => {
    const { t, dona, ids } = await cenario();
    await t.run((ctx: MutationCtx) =>
      ctx.db.insert("briefings", {
        eventId: ids.marina, userId: ids.donaId, guestCount: "150 a 180",
      }),
    );
    const id = await dona.mutation(api.propostas.create, { eventId: ids.marina });
    const p = await t.run((ctx: MutationCtx) => ctx.db.get(id as Id<"proposals">));
    expect(p?.eventoConvidados).toBeUndefined();
  });

  it("o lead continua tendo precedência: número gravado vence texto livre", async () => {
    const { t, dona, ids } = await cenario();
    await t.run((ctx: MutationCtx) =>
      ctx.db.insert("briefings", { eventId: ids.marina, userId: ids.donaId, guestCount: "999" }),
    );
    const lead = await t.run((ctx: MutationCtx) =>
      ctx.db.insert("leads", {
        userId: ids.donaId, clientName: "Marina", stage: "contact", order: 0, guestCount: 180,
      }),
    );
    const id = await dona.mutation(api.propostas.create, {
      leadId: lead, eventId: ids.marina,
    });
    const p = await t.run((ctx: MutationCtx) => ctx.db.get(id as Id<"proposals">));
    expect(p?.eventoConvidados).toBe(180);
  });

  it("a regra de leitura sozinha", () => {
    expect(convidadosDoBriefing("180")).toBe(180);
    expect(convidadosDoBriefing(" 180 confirmados ")).toBe(180);
    expect(convidadosDoBriefing("1.200")).toBe(1200);
    expect(convidadosDoBriefing("150 a 180")).toBeUndefined();
    expect(convidadosDoBriefing("entre 150 e 180")).toBeUndefined();
    expect(convidadosDoBriefing("a confirmar")).toBeUndefined();
    expect(convidadosDoBriefing("")).toBeUndefined();
    expect(convidadosDoBriefing(undefined)).toBeUndefined();
    expect(convidadosDoBriefing("0")).toBeUndefined();
  });
});
