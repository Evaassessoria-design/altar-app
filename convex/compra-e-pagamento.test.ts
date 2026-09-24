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
import { deleteUserDataCascade } from "./lib/cascade";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// COMPRAR NÃO É PAGAR, E RECEBER TAMBÉM NÃO
//
// `purchaseStatus.ts` já dizia por escrito: "dá para receber sem ter pago
// (boleto a prazo) e para pagar sem ter recebido (sinal antecipado)". E
// `registerCost` contradizia o próprio módulo, gravando `isPaid: status ===
// "recebido"` — recebimento de mercadoria virando sinônimo de pagamento.
//
// A outra metade desta rodada: a despesa passa a SEGUIR a compra. Corrigir o
// preço de R$ 400 para R$ 450 chegava à tela e não chegava ao livro; o sistema
// detectava (`valorDivergente`) e esperava que ela clicasse de novo num botão
// cuja existência ninguém explica.
// ═════════════════════════════════════════════════════════════════════════════

type Storage = { store: (b: Blob) => Promise<Id<"_storage">> };

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });
  const rival = await autenticarComo(t, {
    nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (s: string) =>
      (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", s))
        .unique())!._id;
    const donaId = await idDe("auth|aurora");
    const rivalId = await idDe("auth|rival");
    const evento = async (userId: Id<"users">, name: string) =>
      ctx.db.insert("events", {
        userId, name, type: "wedding" as const, date: "2026-12-05",
        location: "Fazenda", clientName: "Marina", status: "planning" as const,
      });
    return {
      donaId,
      marina: await evento(donaId, "Marina & Gabriel"),
      eventoAlheio: await evento(rivalId, "Evento da rival"),
    };
  });

  /** Uma compra com preço, pronta para virar custo. */
  const compra = async (over: { unitPrice?: number; quantity?: number; dueDate?: string } = {}) =>
    dona.mutation(api.purchases.addPurchase, {
      eventId: ids.marina,
      name: "Rosas brancas",
      supplier: "Flora Bela",
      quantity: over.quantity ?? 100,
      unitPrice: over.unitPrice ?? 4,
      dueDate: over.dueDate,
    });

  const lancamentoDe = async (compraId: Id<"purchaseItems">) => {
    const item = await t.run((ctx: MutationCtx) => ctx.db.get(compraId));
    if (!item?.transactionId) return null;
    return t.run((ctx: MutationCtx) => ctx.db.get(item.transactionId!));
  };
  const linha = (id: Id<"purchaseItems">) => t.run((ctx: MutationCtx) => ctx.db.get(id));
  const guardar = (c: string) =>
    t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: Storage }).storage.store(new Blob([c])),
    );
  const arquivoExiste = async (id: Id<"_storage">) =>
    (await t.run(async (ctx: MutationCtx) => ctx.storage.getUrl(id))) !== null;

  return { t, dona, rival, ids, compra, lancamentoDe, linha, guardar, arquivoExiste };
}

describe("a despesa nasce em aberto", () => {
  it("registrar o custo NÃO marca como pago", async () => {
    const { dona, compra, lancamentoDe } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    expect((await lancamentoDe(id))!.isPaid, "a compra se deu como paga sozinha").toBe(false);
  });

  it("nem quando a compra já está RECEBIDA", async () => {
    // Era o defeito: mercadoria chegar virava pagamento. Dá para receber com
    // boleto a 30 dias e não ter pago nada ainda.
    const { dona, compra, lancamentoDe, linha } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.setPurchaseStatus, {
      id, status: "recebido",
    });
    await dona.mutation(api.purchases.registerCost, { id });
    expect((await lancamentoDe(id))!.isPaid).toBe(false);
    expect((await linha(id))!.status).toBe("recebido");
  });

  it("e marcar RECEBIDO depois de registrar também não paga", async () => {
    const { dona, compra, lancamentoDe } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    await dona.mutation(api.purchases.setPurchaseStatus, { id, status: "recebido" });
    expect((await lancamentoDe(id))!.isPaid).toBe(false);
  });

  it("o pagamento continua sendo decisão dela, no Financeiro", async () => {
    const { dona, compra, lancamentoDe } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;

    await dona.mutation(api.financeiro.registrarPagamento, {
      id: tx._id, isPaid: true, paidAt: "2026-10-08", paymentMethod: "PIX",
    });

    const depois = (await lancamentoDe(id))!;
    expect(depois.isPaid).toBe(true);
    expect(depois.paidAt).toBe("2026-10-08");
    expect(depois.paymentMethod).toBe("PIX");
  });
});

describe("a despesa segue a compra", () => {
  it("corrigir o PREÇO chega ao financeiro sem clicar de novo", async () => {
    const { dona, compra, lancamentoDe } = await cenario();
    const id = await compra({ unitPrice: 4, quantity: 100 });
    await dona.mutation(api.purchases.registerCost, { id });
    expect((await lancamentoDe(id))!.amount).toBe(400);

    await dona.mutation(api.purchases.updatePurchase, { id, unitPrice: 4.5 });

    expect((await lancamentoDe(id))!.amount, "o livro ficou com o número velho").toBe(450);
  });

  it("corrigir a QUANTIDADE também", async () => {
    const { dona, compra, lancamentoDe } = await cenario();
    const id = await compra({ unitPrice: 4, quantity: 100 });
    await dona.mutation(api.purchases.registerCost, { id });
    await dona.mutation(api.purchases.updatePurchase, { id, quantity: 120 });
    expect((await lancamentoDe(id))!.amount).toBe(480);
  });

  it("corrigir o VENCIMENTO também", async () => {
    const { dona, compra, lancamentoDe } = await cenario();
    const id = await compra({ dueDate: "2026-10-10" });
    await dona.mutation(api.purchases.registerCost, { id });
    expect((await lancamentoDe(id))!.date).toBe("2026-10-10");

    await dona.mutation(api.purchases.updatePurchase, { id, dueDate: "2026-11-20" });

    expect((await lancamentoDe(id))!.date).toBe("2026-11-20");
  });

  it("trocar o FORNECEDOR reescreve a descrição", async () => {
    const { dona, compra, lancamentoDe } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    expect((await lancamentoDe(id))!.description).toBe("Rosas brancas — Flora Bela");

    await dona.mutation(api.purchases.updatePurchase, { id, supplier: "Casa das Flores" });

    expect((await lancamentoDe(id))!.description).toBe("Rosas brancas — Casa das Flores");
  });

  it("e NUNCA desfaz o pagamento que ela registrou", async () => {
    // Era o defeito simétrico: `registerCost` reaplicava `isPaid` no patch, e
    // corrigir o preço de uma compra já paga DESMARCAVA o pagamento.
    const { dona, compra, lancamentoDe } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;
    await dona.mutation(api.financeiro.registrarPagamento, {
      id: tx._id, isPaid: true, paidAt: "2026-10-08", paymentMethod: "PIX",
      notes: "Pago na entrega",
    });

    await dona.mutation(api.purchases.updatePurchase, { id, unitPrice: 5 });

    const depois = (await lancamentoDe(id))!;
    expect(depois.amount, "o valor não acompanhou").toBe(500);
    expect(depois.isPaid, "o pagamento foi desfeito").toBe(true);
    expect(depois.paidAt).toBe("2026-10-08");
    expect(depois.paymentMethod).toBe("PIX");
    expect(depois.notes).toBe("Pago na entrega");
  });

  it("nem apaga o comprovante", async () => {
    const { dona, compra, lancamentoDe, guardar } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: tx._id, storageId: await guardar("nf"), filename: "nota.pdf",
    });

    await dona.mutation(api.purchases.updatePurchase, { id, unitPrice: 6 });

    expect((await lancamentoDe(id))!.comprovantes ?? []).toHaveLength(1);
  });
});

describe("editar sem custo registrado não cria nada", () => {
  it("corrigir o preço de uma compra sem custo NÃO põe nada no livro", async () => {
    const { t, dona, compra, linha } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.updatePurchase, { id, unitPrice: 9 });

    expect((await linha(id))!.transactionId).toBeUndefined();
    const todas = await t.run((ctx: MutationCtx) => ctx.db.query("transactions").collect());
    expect(todas, "editar criou despesa sozinho").toHaveLength(0);
  });

  it("mudar de status também não", async () => {
    const { t, dona, compra } = await cenario();
    const id = await compra();
    for (const status of ["cotacao", "aprovado", "comprado", "recebido"] as const) {
      await dona.mutation(api.purchases.setPurchaseStatus, { id, status });
    }
    const todas = await t.run((ctx: MutationCtx) => ctx.db.query("transactions").collect());
    expect(todas, "marcar comprado criou despesa sozinho").toHaveLength(0);
  });

  it("e a Ficha Técnica gerando várias necessidades não gera despesa nenhuma", async () => {
    const { t, dona, ids } = await cenario();
    for (const nome of ["Rosas", "Eucalipto", "Velas", "Vasos"]) {
      await dona.mutation(api.purchases.addPurchase, {
        eventId: ids.marina, name: nome, quantity: 10, unitPrice: 5,
      });
    }
    const todas = await t.run((ctx: MutationCtx) => ctx.db.query("transactions").collect());
    expect(todas).toHaveLength(0);
  });
});

describe("idempotência e vínculo quebrado", () => {
  it("registrar dez vezes produz UM lançamento", async () => {
    const { t, dona, compra } = await cenario();
    const id = await compra();
    for (let i = 0; i < 10; i++) await dona.mutation(api.purchases.registerCost, { id });
    const todas = await t.run((ctx: MutationCtx) => ctx.db.query("transactions").collect());
    expect(todas).toHaveLength(1);
  });

  it("vínculo quebrado NÃO é recriado em silêncio ao editar", async () => {
    // Ela apagou a despesa no Financeiro de propósito. Ressuscitar seria
    // desfazer a decisão dela sem avisar.
    const { t, dona, compra, linha } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const txId = (await linha(id))!.transactionId!;
    // Apaga a linha SEM passar pelo `deleteTransaction`, que limparia o
    // ponteiro — é o estado "vínculo quebrado" que o painel já mostra.
    await t.run(async (ctx: MutationCtx) => ctx.db.delete(txId));

    await dona.mutation(api.purchases.updatePurchase, { id, unitPrice: 7 });

    expect((await linha(id))!.transactionId, "o ponteiro foi apagado sozinho").toBe(txId);
    const todas = await t.run((ctx: MutationCtx) => ctx.db.query("transactions").collect());
    expect(todas, "ressuscitou a despesa que ela apagou").toHaveLength(0);
  });

  it("mas registrar de novo, explicitamente, cria uma nova", async () => {
    const { t, dona, compra } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const txId = (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!.transactionId!;
    await t.run(async (ctx: MutationCtx) => ctx.db.delete(txId));

    const r = await dona.mutation(api.purchases.registerCost, { id });

    expect(r.criado).toBe(true);
  });
});

describe("cancelar e excluir exigem decisão sobre o dinheiro", () => {
  it("cancelar com custo registrado RECUSA sem decisão", async () => {
    const { dona, compra, linha } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });

    await expect(
      dona.mutation(api.purchases.setPurchaseStatus, { id, status: "cancelado" }),
    ).rejects.toThrow(/financeiro/i);

    // Nada mudou: nem o status, nem a despesa.
    expect((await linha(id))!.status).not.toBe("cancelado");
  });

  it("o pedido de decisão diz quanto é, se está pago e quantos comprovantes", async () => {
    const { dona, compra, lancamentoDe, guardar } = await cenario();
    const id = await compra({ unitPrice: 4, quantity: 100 });
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;
    await dona.mutation(api.financeiro.registrarPagamento, { id: tx._id, isPaid: true });
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: tx._id, storageId: await guardar("nf"), filename: "nota.pdf",
    });

    await expect(
      dona.mutation(api.purchases.setPurchaseStatus, { id, status: "cancelado" }),
    ).rejects.toMatchObject({
      data: { code: "DECISAO_NECESSARIA", valor: 400, pago: true, comprovantes: 1 },
    });
  });

  it("MANTER preserva a despesa, o pagamento e o comprovante", async () => {
    const { t, dona, compra, lancamentoDe, linha, guardar, arquivoExiste } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;
    const arquivo = await guardar("nf");
    await dona.mutation(api.financeiro.registrarPagamento, { id: tx._id, isPaid: true });
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: tx._id, storageId: arquivo, filename: "nota.pdf",
    });

    await dona.mutation(api.purchases.setPurchaseStatus, {
      id, status: "cancelado", despesa: "manter",
    });

    const sobrou = await t.run((ctx: MutationCtx) => ctx.db.get(tx._id));
    expect(sobrou, "a despesa paga foi apagada").not.toBeNull();
    expect(sobrou!.isPaid).toBe(true);
    expect(sobrou!.comprovantes ?? []).toHaveLength(1);
    expect(await arquivoExiste(arquivo)).toBe(true);
    // O vínculo some — a compra cancelada deixa de aparecer como inconsistência.
    expect((await linha(id))!.transactionId).toBeUndefined();
    expect((await linha(id))!.status).toBe("cancelado");
  });

  it("REMOVER apaga a despesa e os comprovantes — mas só com escolha explícita", async () => {
    const { t, dona, compra, lancamentoDe, guardar, arquivoExiste } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;
    const arquivo = await guardar("nf");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: tx._id, storageId: arquivo, filename: "nota.pdf",
    });

    await dona.mutation(api.purchases.setPurchaseStatus, {
      id, status: "cancelado", despesa: "remover",
    });

    expect(await t.run((ctx: MutationCtx) => ctx.db.get(tx._id))).toBeNull();
    expect(await arquivoExiste(arquivo), "o comprovante ficou órfão").toBe(false);
  });

  it("cancelar SEM custo registrado continua sendo um clique", async () => {
    const { dona, compra, linha } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.setPurchaseStatus, { id, status: "cancelado" });
    expect((await linha(id))!.status).toBe("cancelado");
  });

  it("EXCLUIR com custo registrado também exige decisão", async () => {
    const { dona, compra, linha } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });

    await expect(
      dona.mutation(api.purchases.deletePurchase, { id }),
    ).rejects.toThrow(/financeiro/i);

    expect(await linha(id), "a compra sumiu mesmo assim").not.toBeNull();
  });

  it("excluir com MANTER deixa a despesa viva e sem dono", async () => {
    const { t, dona, compra, lancamentoDe, linha } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;

    await dona.mutation(api.purchases.deletePurchase, { id, despesa: "manter" });

    expect(await linha(id)).toBeNull();
    expect(await t.run((ctx: MutationCtx) => ctx.db.get(tx._id))).not.toBeNull();
  });

  it("excluir SEM custo registrado continua direto", async () => {
    const { dona, compra, linha } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.deletePurchase, { id });
    expect(await linha(id)).toBeNull();
  });
});

describe("os dois sentidos da exclusão e as cascatas", () => {
  it("apagar a despesa no Financeiro limpa o ponteiro da compra", async () => {
    const { dona, compra, lancamentoDe, linha } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;

    await dona.mutation(api.financeiro.deleteTransaction, { id: tx._id });

    expect((await linha(id))!.transactionId).toBeUndefined();
  });

  it("a cascata do EVENTO leva compra, despesa e comprovante", async () => {
    const { t, dona, compra, lancamentoDe, guardar, arquivoExiste, ids } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;
    const arquivo = await guardar("nf");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: tx._id, storageId: arquivo, filename: "nota.pdf",
    });

    await dona.mutation(api.events.remove, { id: ids.marina });

    expect(await t.run((ctx: MutationCtx) => ctx.db.get(tx._id))).toBeNull();
    expect(await arquivoExiste(arquivo)).toBe(false);
  });

  it("a cascata do USUÁRIO também", async () => {
    const { t, dona, compra, lancamentoDe, guardar, arquivoExiste, ids } = await cenario();
    const id = await compra();
    await dona.mutation(api.purchases.registerCost, { id });
    const tx = (await lancamentoDe(id))!;
    const arquivo = await guardar("nf");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: tx._id, storageId: arquivo, filename: "nota.pdf",
    });

    await t.run(async (ctx: MutationCtx) => {
      await deleteUserDataCascade(ctx, ids.donaId);
    });

    expect(await arquivoExiste(arquivo)).toBe(false);
  });
});

describe("nada atravessa a fronteira da conta", () => {
  it("a rival não registra custo na compra da dona", async () => {
    const { rival, compra } = await cenario();
    const id = await compra();
    await expect(
      rival.mutation(api.purchases.registerCost, { id }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("nem cancela, nem exclui, nem edita", async () => {
    const { rival, compra, linha } = await cenario();
    const id = await compra();
    for (const chamada of [
      () => rival.mutation(api.purchases.setPurchaseStatus, { id, status: "cancelado" }),
      () => rival.mutation(api.purchases.deletePurchase, { id }),
      () => rival.mutation(api.purchases.updatePurchase, { id, unitPrice: 1 }),
    ]) {
      await expect(chamada()).rejects.toThrow(/não encontrado/i);
    }
    expect(await linha(id)).not.toBeNull();
  });

  it("e a sincronização nunca toca lançamento de outra conta", async () => {
    // Ponteiro cruzado não deveria existir; se existir, a sincronização
    // compara o dono antes de escrever.
    const { t, dona, rival, compra, ids, linha } = await cenario();
    const daRival = await rival.mutation(api.purchases.addPurchase, {
      eventId: ids.eventoAlheio, name: "Item da rival", quantity: 1, unitPrice: 10,
    });
    await rival.mutation(api.purchases.registerCost, { id: daRival });
    const txDaRival = (await t.run((ctx: MutationCtx) => ctx.db.get(daRival)))!.transactionId!;

    const minha = await compra();
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.patch(minha, { transactionId: txDaRival });
    });

    await dona.mutation(api.purchases.updatePurchase, { id: minha, unitPrice: 999 });

    const alheio = (await t.run((ctx: MutationCtx) => ctx.db.get(txDaRival)))!;
    expect(alheio.amount, "escreveu no lançamento de outra conta").toBe(10);
    expect((await linha(minha))!.unitPrice).toBe(999);
  });
});
