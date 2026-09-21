import { describe, expect, it, vi } from "vitest";

// Mesma substituição de sessão dos demais testes de banco — ver test.auth.ts.
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

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// TODO VÍNCULO TEM VOLTA
//
// Duas ações da Ficha Técnica e das Compras criavam ligação e não tinham
// inverso na tela — as duas mutations existiam, testadas, sem caminho:
//
//  · "Vincular a esta necessidade" carimba `materialId` na compra e zera o
//    déficit da linha. Vinculada a compra errada, a ficha afirma cobertura que
//    não existe e a decoradora compra a menos.
//  · "Lançar no financeiro" cria a despesa. Lançado por engano — preço errado,
//    compra de outro evento, clique trocado — o custo do evento sai afirmado
//    sobre ele, e o rótulo verde "no financeiro" não levava a lugar nenhum.
// ═════════════════════════════════════════════════════════════════════════════

const NOW = "2026-09-02T12:00:00.000Z";

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona",
  });
  const outra = await autenticarComo(t, {
    nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (subject: string) =>
      (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", subject))
        .unique())!._id;
    const donaId = await idDe("auth|dona");
    const outraId = await idDe("auth|outra");

    const rosa = await ctx.db.insert("materials", {
      userId: donaId, nome: "Rosa branca", searchName: "rosa branca",
      unidade: "haste", updatedAt: NOW,
    });
    const eventId = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-10-10",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });
    const eventoDaOutra = await ctx.db.insert("events", {
      userId: outraId, name: "Da outra", type: "wedding", date: "2026-10-10",
      location: "L", clientName: "C", status: "confirmed",
    });
    return { donaId, outraId, rosa, eventId, eventoDaOutra };
  });

  return { t, dona, outra, ...ids };
}

const novaCompra = (
  dona: Awaited<ReturnType<typeof autenticarComo>>,
  eventId: string,
  extra: Record<string, unknown> = {},
) =>
  dona.mutation(api.purchases.addPurchase, {
    eventId: eventId as never,
    name: "Rosa branca",
    unit: "haste",
    quantity: 200,
    unitPrice: 4.2,
    ...extra,
  });

describe("desvincular a compra da ficha técnica", () => {
  it("tira o carimbo e a necessidade, e não toca no resto da compra", async () => {
    const { t, dona, eventId, rosa } = await cenario();
    const compraId = await novaCompra(dona, eventId);
    await dona.mutation(api.fichaTecnica.vincularCompra, { purchaseId: compraId, materialId: rosa });

    const vinculada = await t.run(async (ctx: MutationCtx) => ctx.db.get(compraId));
    expect(vinculada!.materialId).toBe(rosa);

    const r = await dona.mutation(api.fichaTecnica.desvincularCompra, { purchaseId: compraId });
    expect(r.desvinculado).toBe(true);

    const depois = await t.run(async (ctx: MutationCtx) => ctx.db.get(compraId));
    expect(depois!.materialId).toBeUndefined();
    expect(depois!.necessidadeTecnica).toBeUndefined();
    // O que a decoradora negociou continua intacto.
    expect(depois!.quantity).toBe(200);
    expect(depois!.unitPrice).toBe(4.2);
    expect(depois!.name).toBe("Rosa branca");
  });

  it("desvincular duas vezes não é erro", async () => {
    const { dona, eventId, rosa } = await cenario();
    const compraId = await novaCompra(dona, eventId);
    await dona.mutation(api.fichaTecnica.vincularCompra, { purchaseId: compraId, materialId: rosa });
    await dona.mutation(api.fichaTecnica.desvincularCompra, { purchaseId: compraId });
    const segunda = await dona.mutation(api.fichaTecnica.desvincularCompra, { purchaseId: compraId });
    expect(segunda.desvinculado).toBe(false);
  });

  it("compra de outra empresa responde NOT_FOUND", async () => {
    const { t, dona, outra, eventoDaOutra } = await cenario();
    const alheia = await novaCompra(outra, eventoDaOutra);
    await expect(
      dona.mutation(api.fichaTecnica.desvincularCompra, { purchaseId: alheia }),
    ).rejects.toThrow(/não encontrada/i);
    expect((await t.run(async (ctx: MutationCtx) => ctx.db.get(alheia)))!.name).toBe("Rosa branca");
  });

  it("sem sessão, ninguém desvincula", async () => {
    const { t, dona, eventId } = await cenario();
    const compraId = await novaCompra(dona, eventId);
    await expect(
      t.mutation(api.fichaTecnica.desvincularCompra, { purchaseId: compraId }),
    ).rejects.toThrow();
  });

  it("a ficha devolve a compra vinculada com nome — não só um id", async () => {
    // Sem nome, "Desvincular" seria uma aposta: a decoradora não saberia qual
    // compra está saindo.
    const { t, dona, eventId, rosa, donaId } = await cenario();
    const compraId = await novaCompra(dona, eventId);
    await dona.mutation(api.fichaTecnica.vincularCompra, { purchaseId: compraId, materialId: rosa });
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("assemblyItems", {
        userId: donaId, eventId: eventId as never, area: "tables", order: 0,
        name: "Arranjo baixo", quantity: 20, includeInAssemblyReport: true,
        checkOnAssembly: true, visibility: "interno", createdAt: NOW, updatedAt: NOW,
        receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5 }],
      });
    });

    const ficha = await dona.query(api.fichaTecnica.getFicha, { eventId: eventId as never });
    const linha = ficha!.consolidado.find((l) => l.nome === "Rosa branca")!;
    expect(linha.comprasVinculadas).toHaveLength(1);
    expect(linha.comprasVinculadas[0].name).toBe("Rosa branca");
    expect(linha.comprasVinculadas[0].quantity).toBe(200);
    expect(linha.comprasVinculadas[0].cancelada).toBe(false);
  });

  it("desvincular faz a cobertura da ficha voltar a mostrar a falta", async () => {
    // É o ponto: o vínculo errado ESCONDE o déficit. Desfazê-lo tem de
    // devolver o número verdadeiro.
    const { t, dona, eventId, rosa, donaId } = await cenario();
    const compraId = await novaCompra(dona, eventId);
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("assemblyItems", {
        userId: donaId, eventId: eventId as never, area: "tables", order: 0,
        name: "Arranjo baixo", quantity: 20, includeInAssemblyReport: true,
        checkOnAssembly: true, visibility: "interno", createdAt: NOW, updatedAt: NOW,
        receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5 }],
      });
    });
    await dona.mutation(api.fichaTecnica.vincularCompra, { purchaseId: compraId, materialId: rosa });

    const coberta = await dona.query(api.fichaTecnica.getFicha, { eventId: eventId as never });
    expect(coberta!.consolidado[0].cobertura.situacao).toBe("coberto");

    await dona.mutation(api.fichaTecnica.desvincularCompra, { purchaseId: compraId });
    const depois = await dona.query(api.fichaTecnica.getFicha, { eventId: eventId as never });
    expect(depois!.consolidado[0].cobertura.situacao).not.toBe("coberto");
    expect(depois!.consolidado[0].comprasVinculadas).toHaveLength(0);
  });
});

describe("desfazer o lançamento no financeiro", () => {
  it("apaga o lançamento que a compra gerou e solta o vínculo", async () => {
    const { t, dona, eventId } = await cenario();
    const compraId = await novaCompra(dona, eventId, { status: "recebido" });
    const { transactionId } = await dona.mutation(api.purchases.registerCost, { id: compraId });

    const r = await dona.mutation(api.purchases.unregisterCost, { id: compraId });
    expect(r.removido).toBe(true);

    expect(await t.run(async (ctx: MutationCtx) => ctx.db.get(transactionId))).toBeNull();
    expect(
      (await t.run(async (ctx: MutationCtx) => ctx.db.get(compraId)))!.transactionId,
    ).toBeUndefined();
  });

  it("a compra continua lá — é o Financeiro que muda, não a operação", async () => {
    const { t, dona, eventId } = await cenario();
    const compraId = await novaCompra(dona, eventId, { status: "recebido" });
    await dona.mutation(api.purchases.registerCost, { id: compraId });
    await dona.mutation(api.purchases.unregisterCost, { id: compraId });

    const compra = await t.run(async (ctx: MutationCtx) => ctx.db.get(compraId));
    expect(compra).not.toBeNull();
    expect(compra!.unitPrice).toBe(4.2);
    expect(compra!.quantity).toBe(200);
  });

  it("NÃO apaga despesa que a decoradora criou à mão", async () => {
    // Só alcança o lançamento que nasceu da compra. Uma despesa avulsa com o
    // mesmo valor não pode sumir junto.
    const { t, dona, eventId } = await cenario();
    const avulsa = await dona.mutation(api.financeiro.addTransaction, {
      type: "expense", category: "Flores", description: "Despesa à mão",
      amount: 840, date: "2026-09-10", isPaid: true,
    });
    const compraId = await novaCompra(dona, eventId, { status: "recebido" });
    await dona.mutation(api.purchases.registerCost, { id: compraId });
    await dona.mutation(api.purchases.unregisterCost, { id: compraId });

    expect(await t.run(async (ctx: MutationCtx) => ctx.db.get(avulsa))).not.toBeNull();
  });

  it("desfazer duas vezes não é erro", async () => {
    const { dona, eventId } = await cenario();
    const compraId = await novaCompra(dona, eventId, { status: "recebido" });
    await dona.mutation(api.purchases.registerCost, { id: compraId });
    await dona.mutation(api.purchases.unregisterCost, { id: compraId });
    expect((await dona.mutation(api.purchases.unregisterCost, { id: compraId })).removido).toBe(false);
  });

  it("lançar de novo depois de desfazer volta a funcionar", async () => {
    // O ciclo inteiro: lançar → desfazer → lançar. Sem isto, desfazer seria
    // uma porta que tranca por fora.
    const { dona, eventId } = await cenario();
    const compraId = await novaCompra(dona, eventId, { status: "recebido" });
    await dona.mutation(api.purchases.registerCost, { id: compraId });
    await dona.mutation(api.purchases.unregisterCost, { id: compraId });
    const denovo = await dona.mutation(api.purchases.registerCost, { id: compraId });
    expect(denovo.criado).toBe(true);
  });

  it("compra de outra empresa responde NOT_FOUND", async () => {
    const { dona, outra, eventoDaOutra } = await cenario();
    const alheia = await novaCompra(outra, eventoDaOutra, { status: "recebido" });
    await outra.mutation(api.purchases.registerCost, { id: alheia });
    await expect(
      dona.mutation(api.purchases.unregisterCost, { id: alheia }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("sem sessão, ninguém desfaz", async () => {
    const { t, dona, eventId } = await cenario();
    const compraId = await novaCompra(dona, eventId, { status: "recebido" });
    await dona.mutation(api.purchases.registerCost, { id: compraId });
    await expect(t.mutation(api.purchases.unregisterCost, { id: compraId })).rejects.toThrow();
  });
});

describe("as duas ações têm caminho na tela", () => {
  it("a ficha técnica oferece desvincular", () => {
    const fonte = readFileSync("src/pages/app/events/[id]/ficha-tecnica/page.tsx", "utf-8");
    expect(fonte).toContain("api.fichaTecnica.desvincularCompra");
    expect(fonte).toMatch(/Desvincular/);
    // E diz QUAL compra, senão o botão é uma aposta.
    expect(fonte).toContain("Compra vinculada:");
  });

  it("compras oferece desfazer o lançamento, e pergunta antes", () => {
    // Apaga um lançamento do Financeiro: é destrutivo, e a regra da casa é
    // perguntar (ver src/lib/acoes-destrutivas.test.ts).
    const fonte = readFileSync("src/pages/app/compras/page.tsx", "utf-8");
    expect(fonte).toContain("api.purchases.unregisterCost");
    const bloco = fonte.slice(
      fonte.indexOf("const handleDesfazerCusto"),
      fonte.indexOf("await unregisterCost"),
    );
    expect(bloco).toContain("window.confirm");
  });

  it("o rótulo verde deixou de ser um beco sem saída", () => {
    const fonte = readFileSync("src/pages/app/compras/page.tsx", "utf-8");
    const trecho = fonte.slice(
      fonte.indexOf("no financeiro") - 700,
      fonte.indexOf("no financeiro"),
    );
    expect(trecho).toContain("onDesfazerCusto");
  });
});
