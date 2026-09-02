import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { resumirPanorama } from "./lib/panoramaDeCompras";
import { effectivePurchaseStatus, isPendingStatus } from "./lib/purchaseStatus";
import {
  comCarimbo,
  descreverUltimaAtualizacao,
  ultimaAtualizacao,
} from "./lib/ultimaAtualizacao";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — PANORAMA DE COMPRAS (leitura transversal).
//
// lib/panoramaDeCompras.test.ts cobre as REGRAS. Aqui exercitamos a LEITURA
// sobre banco real: o índice certo, o evento certo, nenhuma mistura entre
// empresas, e a compra órfã que não vira linha fantasma.
//
// `listPanorama` exige sessão (Better Auth não roda no convex-test), então a
// consulta é espelhada com o usuário injetado e o bloco final amarra o espelho
// à fonte de verdade.
// ─────────────────────────────────────────────────────────────────────────────

const HOJE = "2026-09-02";
const FONTE = readFileSync("convex/purchases.ts", "utf-8");

const CORPO_PANORAMA = (() => {
  const i = FONTE.indexOf("export const listPanorama");
  return FONTE.slice(i, FONTE.indexOf("\nexport ", i + 1));
})();

/** Espelho fiel de `listPanorama` com o usuário injetado. */
async function panoramaEspelho(ctx: MutationCtx, userId: Id<"users">) {
  const [compras, eventos] = await Promise.all([
    ctx.db.query("purchaseItems").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("events").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  ]);
  const porId = new Map(eventos.map((e) => [e._id, e]));
  return compras.flatMap((item) => {
    const evento = porId.get(item.eventId);
    if (!evento || evento.status === "cancelled") return [];
    return [{ ...item, eventName: evento.name, eventDate: evento.date, eventStatus: evento.status }];
  });
}

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const donaId = await ctx.db.insert("users", {
      name: "Dona", email: "dona@ex.com", role: "user", subscriptionStatus: "active",
    });
    const outraId = await ctx.db.insert("users", {
      name: "Outra", email: "outra@ex.com", role: "user", subscriptionStatus: "active",
    });

    const casamento = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-10-10",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });
    const aniversario = await ctx.db.insert("events", {
      userId: donaId, name: "15 anos da Júlia", type: "debutante", date: "2026-11-20",
      location: "Salão", clientName: "Júlia", status: "planning",
    });
    const cancelado = await ctx.db.insert("events", {
      userId: donaId, name: "Evento cancelado", type: "other", date: "2026-12-01",
      location: "—", clientName: "—", status: "cancelled",
    });
    const eventoDaOutra = await ctx.db.insert("events", {
      userId: outraId, name: "Da outra empresa", type: "wedding", date: "2026-10-10",
      location: "—", clientName: "—", status: "confirmed",
    });

    const base = { userId: donaId, isPurchased: false, order: 0 };
    const atrasada = await ctx.db.insert("purchaseItems", {
      ...base, eventId: casamento, name: "Rosas brancas", dueDate: "2026-08-20",
      unitPrice: 8, quantity: 50,
    });
    await ctx.db.insert("purchaseItems", {
      ...base, eventId: aniversario, name: "Toalhas", dueDate: "2026-09-05", unitPrice: 40, quantity: 10,
    });
    const canceladaId = await ctx.db.insert("purchaseItems", {
      ...base, eventId: casamento, name: "Arco desistido", status: "cancelado",
      dueDate: "2026-08-01", unitPrice: 1200,
    });
    const doCanceladoId = await ctx.db.insert("purchaseItems", {
      ...base, eventId: cancelado, name: "Item de evento cancelado", dueDate: "2026-08-01",
    });
    await ctx.db.insert("purchaseItems", {
      userId: outraId, eventId: eventoDaOutra, name: "Compra alheia",
      isPurchased: false, order: 0, dueDate: "2026-08-01", unitPrice: 999,
    });

    return { donaId, outraId, casamento, aniversario, cancelado, atrasada, canceladaId, doCanceladoId };
  });
  return { t, ...ids };
}

describe("listPanorama — leitura transversal", () => {
  it("traz compras de TODOS os eventos da empresa, com nome e data do evento", async () => {
    const { t, donaId } = await cenario();
    const linhas = await t.run(async (ctx) => panoramaEspelho(ctx, donaId));
    expect(linhas.map((l) => l.name).sort()).toEqual(
      ["Arco desistido", "Rosas brancas", "Toalhas"].sort(),
    );
    const rosas = linhas.find((l) => l.name === "Rosas brancas")!;
    expect(rosas.eventName).toBe("Marina & Gabriel");
    expect(rosas.eventDate).toBe("2026-10-10");
  });

  it("NÃO traz compra de outra empresa", async () => {
    const { t, donaId } = await cenario();
    const linhas = await t.run(async (ctx) => panoramaEspelho(ctx, donaId));
    expect(linhas.map((l) => l.name)).not.toContain("Compra alheia");
  });

  it("NÃO traz compra de evento cancelado — não é pendência de ninguém", async () => {
    const { t, donaId } = await cenario();
    const linhas = await t.run(async (ctx) => panoramaEspelho(ctx, donaId));
    expect(linhas.map((l) => l.name)).not.toContain("Item de evento cancelado");
  });

  it("compra órfã (evento apagado) não vira linha fantasma sem nome", async () => {
    const { t, donaId, casamento } = await cenario();
    await t.run(async (ctx) => ctx.db.delete(casamento));
    const linhas = await t.run(async (ctx) => panoramaEspelho(ctx, donaId));
    expect(linhas.every((l) => l.eventName)).toBe(true);
    expect(linhas.map((l) => l.name)).not.toContain("Rosas brancas");
  });

  it("o resumo lido do banco bate com a regra pura", async () => {
    const { t, donaId } = await cenario();
    const linhas = await t.run(async (ctx) => panoramaEspelho(ctx, donaId));
    const r = resumirPanorama(linhas, HOJE);
    expect(r.pendentes).toBe(2); // rosas + toalhas (o arco está cancelado)
    expect(r.atrasadas).toBe(1); // rosas venceram em 20/08
    expect(r.canceladas).toBe(1);
    expect(r.valorPendente).toBe(8 * 50 + 40 * 10);
    expect(r.valorForaDoLivro).toBe(8 * 50 + 40 * 10); // nenhuma foi lançada
  });

  it("lançar o custo tira a compra de 'fora do financeiro'", async () => {
    const { t, donaId, atrasada } = await cenario();
    await t.run(async (ctx) => {
      const item = (await ctx.db.get(atrasada))!;
      const transactionId = await ctx.db.insert("transactions", {
        userId: donaId, eventId: item.eventId, type: "expense", category: "Compras",
        description: item.name, amount: 400, date: "2026-08-20", isPaid: false,
      });
      await ctx.db.patch(atrasada, { transactionId });
    });
    const linhas = await t.run(async (ctx) => panoramaEspelho(ctx, donaId));
    const r = resumirPanorama(linhas, HOJE);
    expect(r.foraDoLivro).toBe(1); // sobrou só a toalha
    expect(r.valorForaDoLivro).toBe(400);
  });
});

describe("o painel e o quadro de atenção contam a mesma coisa", () => {
  it("compra CANCELADA não conta como pendente no painel", async () => {
    // O bug: `dashboard.getStats` filtrava por `!i.isPurchased`, então um item
    // cancelado seguia inflando "compras pendentes" — e o Quadro de Atenção,
    // que já usava a situação efetiva, mostrava outro número para o mesmo
    // evento. Duas telas discordando fazem a decoradora não confiar em nenhuma.
    const { t, donaId } = await cenario();
    const itens = await t.run(async (ctx) =>
      ctx.db.query("purchaseItems").withIndex("by_user", (q) => q.eq("userId", donaId)).collect(),
    );
    const regraAntiga = itens.filter((i) => !i.isPurchased).length;
    const regraCerta = itens.filter((i) => isPendingStatus(effectivePurchaseStatus(i))).length;
    expect(regraAntiga).toBeGreaterThan(regraCerta); // o cenário tem cancelada
    expect(regraCerta).toBe(3); // rosas, toalhas e o item do evento cancelado
  });

  it("`dashboard.getStats` usa a situação efetiva, não `!isPurchased`", () => {
    const dashboard = readFileSync("convex/dashboard.ts", "utf-8");
    const i = dashboard.indexOf("let pendingPurchasesCount");
    const corpo = dashboard.slice(i, dashboard.indexOf("return {", i));
    expect(corpo).toContain("isPendingStatus(effectivePurchaseStatus(i))");
    expect(corpo).not.toMatch(/filter\(\(i\) => !i\.isPurchased\)/);
  });
});

describe("a fonte faz o que o espelho reproduz", () => {
  it("`listPanorama` exige sessão", () => {
    expect(CORPO_PANORAMA).toContain("requireUser");
  });

  it("lê pelo índice por usuário — nunca varre a tabela inteira", () => {
    expect(CORPO_PANORAMA).toContain('withIndex("by_user"');
    expect(CORPO_PANORAMA).not.toMatch(/query\("purchaseItems"\)\s*\.collect\(\)/);
  });

  it("descarta evento cancelado e compra órfã", () => {
    expect(CORPO_PANORAMA).toContain('evento.status === "cancelled"');
    expect(CORPO_PANORAMA).toContain("if (!evento");
  });

  it("não julga urgência: o julgamento é do módulo puro", () => {
    // Se uma regra de prazo aparecer dentro da query, as duas leituras podem
    // divergir — foi assim que painel e quadro de atenção discordaram.
    expect(CORPO_PANORAMA).not.toContain("dueDate <");
    expect(CORPO_PANORAMA).not.toContain("atrasad");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CARIMBO DE ATUALIZAÇÃO sobre banco real.
// A regra vive em lib/ultimaAtualizacao.ts; aqui prova-se que o valor
// realmente chega ao registro e que a leitura antiga continua respondendo.
// ─────────────────────────────────────────────────────────────────────────────
describe("última atualização", () => {
  it("registro ANTIGO, sem carimbo, responde pela data de criação", async () => {
    const { t, donaId } = await cenario();
    const item = await t.run(async (ctx) =>
      ctx.db.query("purchaseItems").withIndex("by_user", (q) => q.eq("userId", donaId)).first(),
    );
    expect(item!.updatedAt).toBeUndefined();
    expect(ultimaAtualizacao(item!)).toBe(new Date(item!._creationTime).toISOString());
    expect(descreverUltimaAtualizacao(item!)).toBe("hoje");
  });

  it("o carimbo gravado passa a valer, e a criação fica para trás", async () => {
    const { t, atrasada } = await cenario();
    const carimbo = "2026-09-02T10:00:00.000Z";
    await t.run(async (ctx) => ctx.db.patch(atrasada, comCarimbo({}, new Date(carimbo))));
    const item = await t.run(async (ctx) => ctx.db.get(atrasada));
    expect(item!.updatedAt).toBe(carimbo);
    expect(ultimaAtualizacao(item!)).toBe(carimbo);
  });

  it("carimbar não apaga nada do registro", async () => {
    const { t, atrasada } = await cenario();
    const antes = await t.run(async (ctx) => ctx.db.get(atrasada));
    await t.run(async (ctx) => ctx.db.patch(atrasada, comCarimbo({})));
    const depois = await t.run(async (ctx) => ctx.db.get(atrasada));
    expect(depois).toMatchObject({
      name: antes!.name,
      dueDate: antes!.dueDate,
      unitPrice: antes!.unitPrice,
      quantity: antes!.quantity,
    });
  });
});
