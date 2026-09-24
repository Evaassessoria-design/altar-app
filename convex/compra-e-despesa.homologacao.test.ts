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

// ═════════════════════════════════════════════════════════════════════════════
// COMPRA → DESPESA, PERCORRIDA COMO A DECORADORA PERCORRE
//
// Homologação do caminho inteiro, e não de uma função isolada: ela cadastra a
// compra, registra o custo, anexa a nota do fornecedor, paga, corrige o preço,
// e às vezes desfaz tudo porque lançou no evento errado.
//
// ── AS DUAS FRASES QUE ESTE ARQUIVO DEFENDE ─────────────────────────────────
//   COMPRADO ≠ PAGO      comprar é operação; pagar é dinheiro saindo
//   RECEBIDO ≠ PAGO      a mercadoria chegou não diz nada sobre a fatura
//
// Confundi-las é o defeito mais caro possível aqui: o livro passaria a afirmar
// que saiu dinheiro que ainda está na conta dela.
//
// ── E O VAZAMENTO QUE ELE PEGOU ─────────────────────────────────────────────
// `unregisterCost` apagava o lançamento e deixava os comprovantes no storage.
// Era o único caminho de exclusão do Financeiro que fazia isso — os outros
// quatro já apagavam os arquivos. Ver o teste "desfazer o custo leva os
// arquivos junto".
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
    const evento = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-12-05",
      location: "Fazenda Santa Rita", clientName: "Marina", status: "planning",
    });
    return { donaId, evento };
  });

  const comprar = (nome: string, preco: number, quantidade = 1) =>
    dona.mutation(api.purchases.addPurchase, {
      eventId: ids.evento, name: nome, quantity: quantidade, unitPrice: preco,
    });

  /** Um arquivo de verdade no storage, para conferir que ele SOME depois. */
  const arquivo = async (conteudo: string) =>
    t.run(async (ctx) => ctx.storage.store(new Blob([conteudo], { type: "application/pdf" })));

  const lancamento = (id: Id<"transactions">) => t.run(async (ctx) => ctx.db.get(id));
  const arquivoExiste = async (storageId: Id<"_storage">) =>
    (await t.run(async (ctx) => ctx.storage.getUrl(storageId))) !== null;

  return { t, dona, ids, comprar, arquivo, lancamento, arquivoExiste };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPRADO ≠ PAGO
// ─────────────────────────────────────────────────────────────────────────────

describe("a despesa nasce da compra, e nasce EM ABERTO", () => {
  it("registrar o custo não dá baixa em nada", async () => {
    const c = await cenario();
    const compra = await c.comprar("120 Cadeiras Dior", 12);
    const { transactionId, criado } = await c.dona.mutation(api.purchases.registerCost, {
      id: compra as Id<"purchaseItems">,
    });

    expect(criado).toBe(true);
    const linha = await c.lancamento(transactionId);
    expect(linha?.type).toBe("expense");
    expect(linha?.amount).toBe(12 * 1);
    // A frase inteira deste arquivo, em um assert.
    expect(linha?.isPaid).toBe(false);
    expect(linha?.paidAt).toBeUndefined();
    expect(linha?.paymentMethod).toBeUndefined();
  });

  it("marcar a compra como RECEBIDA continua sem pagar nada", async () => {
    const c = await cenario();
    const compra = (await c.comprar("15 Mesas redondas", 90)) as Id<"purchaseItems">;
    const { transactionId } = await c.dona.mutation(api.purchases.registerCost, { id: compra });

    await c.dona.mutation(api.purchases.setPurchaseStatus, {
      id: compra, status: "recebido",
    });

    // A mercadoria chegou. A fatura pode vencer em trinta dias.
    expect((await c.lancamento(transactionId))?.isPaid).toBe(false);
  });

  it("compra CANCELADA não vira custo — recusa em vez de lançar zero", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Arranjo cancelado", 300)) as Id<"purchaseItems">;
    await c.dona.mutation(api.purchases.setPurchaseStatus, { id: compra, status: "cancelado" });

    await expect(
      c.dona.mutation(api.purchases.registerCost, { id: compra }),
    ).rejects.toThrow(/cancelada não vira custo/i);
  });

  it("compra sem preço recusa com o motivo, em vez de gravar R$ 0,00", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Flores a cotar", 0)) as Id<"purchaseItems">;
    await expect(
      c.dona.mutation(api.purchases.registerCost, { id: compra }),
    ).rejects.toThrow(/preço/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O DINHEIRO SAI NO FINANCEIRO, COM DATA, FORMA E DOCUMENTO
// ─────────────────────────────────────────────────────────────────────────────

describe("quem paga é ela, no Financeiro", () => {
  it("registrarPagamento grava quando, como e a observação — na despesa também", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Toalhas de linho", 45, 10)) as Id<"purchaseItems">;
    const { transactionId } = await c.dona.mutation(api.purchases.registerCost, { id: compra });

    await c.dona.mutation(api.financeiro.registrarPagamento, {
      id: transactionId,
      isPaid: true,
      paidAt: "2026-11-30",
      paymentMethod: "Boleto 30 dias",
      notes: "Nota fiscal enviada por e-mail",
    });

    const linha = await c.lancamento(transactionId);
    expect(linha?.isPaid).toBe(true);
    expect(linha?.paidAt).toBe("2026-11-30");
    // Texto livre, e não enum: "Boleto 30 dias" e "permuta" existem na vida real.
    expect(linha?.paymentMethod).toBe("Boleto 30 dias");
    expect(linha?.notes).toBe("Nota fiscal enviada por e-mail");
  });

  it("a nota do fornecedor anexa na DESPESA, como o recibo anexa na receita", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Aluguel de sousplat", 8, 120)) as Id<"purchaseItems">;
    const { transactionId } = await c.dona.mutation(api.purchases.registerCost, { id: compra });
    const nota = await c.arquivo("nota fiscal do fornecedor");

    const { total } = await c.dona.mutation(api.financeiro.anexarComprovante, {
      id: transactionId, storageId: nota, filename: "nf-8812.pdf", contentType: "application/pdf",
    });

    expect(total).toBe(1);
    const comprovantes = await c.dona.query(api.financeiro.comprovantesDoLancamento, {
      id: transactionId,
    });
    expect(comprovantes[0]?.filename).toBe("nf-8812.pdf");
    // A URL é o que faz "visualizar" e "baixar" existirem na tela.
    expect(comprovantes[0]?.url).toBeTruthy();
    // E anexar continua sem dar baixa — a separação vale nos dois tipos.
    expect((await c.lancamento(transactionId))?.isPaid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CORRIGIR O PREÇO
// ─────────────────────────────────────────────────────────────────────────────

describe("o preço muda, e o livro acompanha", () => {
  it("corrigir a compra atualiza a despesa que já existe, sem criar outra", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Velas", 10, 30)) as Id<"purchaseItems">;
    const { transactionId } = await c.dona.mutation(api.purchases.registerCost, { id: compra });
    expect((await c.lancamento(transactionId))?.amount).toBe(300);

    await c.dona.mutation(api.purchases.updatePurchase, { id: compra, unitPrice: 12 });

    const depois = await c.lancamento(transactionId);
    expect(depois?.amount).toBe(360);

    // Uma linha só no livro: sincronizar não pode virar duplicata.
    const doEvento = await c.t.run(async (ctx) =>
      ctx.db.query("transactions").collect(),
    );
    expect(doEvento).toHaveLength(1);
  });

  it("registrar o custo duas vezes é idempotente", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Guardanapos", 3, 100)) as Id<"purchaseItems">;
    const primeira = await c.dona.mutation(api.purchases.registerCost, { id: compra });
    const segunda = await c.dona.mutation(api.purchases.registerCost, { id: compra });

    expect(segunda.criado).toBe(false);
    expect(segunda.transactionId).toBe(primeira.transactionId);
    expect(await c.t.run(async (ctx) => ctx.db.query("transactions").collect())).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DESFAZER — E O VAZAMENTO QUE MORAVA AQUI
// ─────────────────────────────────────────────────────────────────────────────

describe("desfazer o custo leva os arquivos junto", () => {
  it("apagar a despesa gerada pela compra apaga os comprovantes dela", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Cadeiras que foram para o evento errado", 12, 100)) as Id<"purchaseItems">;
    const { transactionId } = await c.dona.mutation(api.purchases.registerCost, { id: compra });

    const nota = await c.arquivo("nota do fornecedor");
    const recibo = await c.arquivo("recibo do pagamento");
    await c.dona.mutation(api.financeiro.anexarComprovante, {
      id: transactionId, storageId: nota, filename: "nf.pdf",
    });
    await c.dona.mutation(api.financeiro.anexarComprovante, {
      id: transactionId, storageId: recibo, filename: "recibo.pdf",
    });
    expect(await c.arquivoExiste(nota)).toBe(true);

    await c.dona.mutation(api.purchases.unregisterCost, { id: compra });

    // A linha some…
    expect(await c.lancamento(transactionId)).toBeNull();
    // …e os arquivos também. Antes ficavam no storage sem nenhuma linha
    // apontando para eles — cobrados para sempre e impossíveis de achar.
    expect(await c.arquivoExiste(nota)).toBe(false);
    expect(await c.arquivoExiste(recibo)).toBe(false);
  });

  it("arquivo que já sumiu não impede desfazer o custo", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Item com anexo perdido", 50)) as Id<"purchaseItems">;
    const { transactionId } = await c.dona.mutation(api.purchases.registerCost, { id: compra });
    const anexo = await c.arquivo("some antes da hora");
    await c.dona.mutation(api.financeiro.anexarComprovante, {
      id: transactionId, storageId: anexo, filename: "some.pdf",
    });
    // Alguém apagou o arquivo por fora. O Convex LANÇA ao apagar o que não
    // existe, e mutation que lança aborta inteira.
    await c.t.run(async (ctx) => ctx.storage.delete(anexo));

    await expect(
      c.dona.mutation(api.purchases.unregisterCost, { id: compra }),
    ).resolves.toEqual({ removido: true });
    expect(await c.lancamento(transactionId)).toBeNull();
  });

  it("desfazer sem custo registrado não faz nada e não explode", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Nunca virou custo", 20)) as Id<"purchaseItems">;
    expect(
      await c.dona.mutation(api.purchases.unregisterCost, { id: compra }),
    ).toEqual({ removido: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CANCELAR — A DECISÃO É DELA, E A PROCEDÊNCIA SOBREVIVE
// ─────────────────────────────────────────────────────────────────────────────

describe("cancelar a compra não decide sozinho o que fazer com o dinheiro", () => {
  it("cancelar com custo registrado RECUSA sem a decisão", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Arranjos altos", 180, 8)) as Id<"purchaseItems">;
    await c.dona.mutation(api.purchases.registerCost, { id: compra });

    await expect(
      c.dona.mutation(api.purchases.setPurchaseStatus, { id: compra, status: "cancelado" }),
    ).rejects.toThrow();
  });

  it("MANTER preserva a despesa, o pagamento, os comprovantes e a procedência", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Arranjos altos", 180, 8)) as Id<"purchaseItems">;
    const { transactionId } = await c.dona.mutation(api.purchases.registerCost, { id: compra });
    const nota = await c.arquivo("nota paga");
    await c.dona.mutation(api.financeiro.anexarComprovante, {
      id: transactionId, storageId: nota, filename: "nf.pdf",
    });
    await c.dona.mutation(api.financeiro.registrarPagamento, {
      id: transactionId, isPaid: true, paidAt: "2026-10-01", paymentMethod: "PIX",
    });

    await c.dona.mutation(api.purchases.setPurchaseStatus, {
      id: compra, status: "cancelado", despesa: "manter",
    });

    const linha = await c.lancamento(transactionId);
    // O dinheiro saiu de verdade: a despesa fica, com tudo que prova isso.
    expect(linha?.isPaid).toBe(true);
    expect(linha?.comprovantes).toHaveLength(1);
    expect(await c.arquivoExiste(nota)).toBe(true);
    // E ela ainda sabe de onde veio, mesmo com o vínculo operacional desfeito.
    expect(linha?.origemDaCompra?.nome).toBe("Arranjos altos");
  });

  it("REMOVER apaga a despesa e os arquivos — nunca em silêncio", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Compra que não aconteceu", 400)) as Id<"purchaseItems">;
    const { transactionId } = await c.dona.mutation(api.purchases.registerCost, { id: compra });
    const anexo = await c.arquivo("orçamento anexado por engano");
    await c.dona.mutation(api.financeiro.anexarComprovante, {
      id: transactionId, storageId: anexo, filename: "orcamento.pdf",
    });

    await c.dona.mutation(api.purchases.setPurchaseStatus, {
      id: compra, status: "cancelado", despesa: "remover",
    });

    expect(await c.lancamento(transactionId)).toBeNull();
    expect(await c.arquivoExiste(anexo)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NADA DISSO ATRAVESSA A FRONTEIRA DA CONTA
// ─────────────────────────────────────────────────────────────────────────────

describe("a compra de uma decoradora não é alcançável pela outra", () => {
  it("a rival não registra custo, não desfaz e não cancela", async () => {
    const c = await cenario();
    const compra = (await c.comprar("Cadeiras da Aurora", 12, 100)) as Id<"purchaseItems">;
    const rival = await autenticarComo(c.t, {
      nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
    });

    for (const chamada of [
      () => rival.mutation(api.purchases.registerCost, { id: compra }),
      () => rival.mutation(api.purchases.unregisterCost, { id: compra }),
      () => rival.mutation(api.purchases.setPurchaseStatus, { id: compra, status: "cancelado" }),
    ]) {
      await expect(chamada()).rejects.toThrow(/NOT_FOUND|não encontrado/i);
    }
  });
});
