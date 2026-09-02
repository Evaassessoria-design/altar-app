import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { consolidarMateriais } from "./lib/fichaTecnica";
import { ehObrigacaoDeMontagem } from "./lib/escopoDoProjeto";
import { normalizeName } from "./lib/materiais";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — VINCULAR, DESVINCULAR, RECONHECER
//
// As três ações que fecham o ciclo da Ficha Técnica sem NUNCA alterar a
// compra. É a regra mais importante deste MASTER: mudar a ficha de 185 para
// 210 não pode mexer em quantidade, preço, fornecedor, situação, pagamento ou
// lançamento. O sistema informa; a decoradora decide.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = "2026-09-02T12:00:00.000Z";

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: MutationCtx) => {
    const donaId = await ctx.db.insert("users", {
      name: "Dona", email: "d@ex.com", role: "user", subscriptionStatus: "active",
    });
    const outraId = await ctx.db.insert("users", {
      name: "Outra", email: "o@ex.com", role: "user", subscriptionStatus: "active",
    });
    const fornecedor = await ctx.db.insert("suppliers", {
      userId: donaId, companyName: "Flora Bela", searchName: "flora bela",
      category: "flores", createdAt: NOW, updatedAt: NOW,
    });
    const rosa = await ctx.db.insert("materials", {
      userId: donaId, nome: "Rosa branca", searchName: "rosa branca",
      unidade: "haste", margemPercentual: 10, updatedAt: NOW,
    });
    const rosaDaOutra = await ctx.db.insert("materials", {
      userId: outraId, nome: "Rosa branca", searchName: "rosa branca", unidade: "haste", updatedAt: NOW,
    });
    const eventId = await ctx.db.insert("events", {
      userId: donaId, name: "E", type: "wedding", date: "2026-12-12",
      location: "L", clientName: "C", status: "confirmed",
    });
    const itemId = await ctx.db.insert("assemblyItems", {
      userId: donaId, eventId, area: "tables", name: "Arranjo", order: 0, quantity: 37,
      includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
      createdAt: NOW, updatedAt: NOW,
      receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5, margemPercentual: 10 }],
    });
    // Compra feita à MÃO, antes de existir ficha: sem materialId.
    const compraManual = await ctx.db.insert("purchaseItems", {
      userId: donaId, eventId, name: "rosa  BRANCA", quantity: 200, unit: "haste",
      unitPrice: 4.2, supplier: "Flora Bela", supplierId: fornecedor,
      isPurchased: true, status: "comprado", order: 0, updatedAt: NOW,
    });
    return { donaId, outraId, rosa, rosaDaOutra, eventId, itemId, compraManual, fornecedor };
  });
  return { t, ...ids };
}

async function linhaDoConsolidado(ctx: MutationCtx, eventId: Id<"events">) {
  const itens = await ctx.db
    .query("assemblyItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  return consolidarMateriais(
    itens.map((i) => ({
      _id: i._id, nome: i.name, area: i.area, ambiente: i.ambiente,
      quantidade: i.quantity, projectScope: i.projectScope, receita: i.receita,
    })),
    ehObrigacaoDeMontagem,
  )[0];
}

/** Espelho fiel de `vincularCompra`. */
async function vincular(
  ctx: MutationCtx, userId: Id<"users">,
  purchaseId: Id<"purchaseItems">, materialId: Id<"materials">,
) {
  const compra = await ctx.db.get(purchaseId);
  if (!compra || compra.userId !== userId) throw new Error("NOT_FOUND compra");
  const material = await ctx.db.get(materialId);
  if (!material || material.userId !== userId) throw new Error("NOT_FOUND material");
  if (compra.materialId && compra.materialId !== materialId) throw new Error("CONFLICT");
  if ((compra.unit ?? "") !== material.unidade) throw new Error("INVALID unidade");
  const linha = await linhaDoConsolidado(ctx, compra.eventId);
  await ctx.db.patch(purchaseId, {
    materialId, necessidadeTecnica: linha?.necessario, updatedAt: NOW,
  });
  return { necessidadeTecnica: linha?.necessario ?? null };
}

describe("a necessidade e a sugestão", () => {
  it("37 arranjos × 5 rosas = 185, com margem 10% sugere 203,5 → 204 hastes", async () => {
    const { t, eventId } = await cenario();
    const linha = await t.run(async (ctx) => linhaDoConsolidado(ctx, eventId));
    expect(linha.necessario).toBe(185);
    expect(linha.margemPercentual).toBe(10);
    expect(linha.sugerido).toBe(203.5);
    expect(linha.sugeridoOperacional).toBe(204); // haste é indivisível
  });
});

describe("VINCULAR compra manual", () => {
  it("liga a compra ao material e carimba a necessidade de agora", async () => {
    const { t, donaId, compraManual, rosa } = await cenario();
    const r = await t.run(async (ctx) => vincular(ctx, donaId, compraManual, rosa));
    expect(r.necessidadeTecnica).toBe(185);
    const compra = await t.run(async (ctx) => ctx.db.get(compraManual));
    expect(compra!.materialId).toBe(rosa);
    expect(compra!.necessidadeTecnica).toBe(185);
  });

  it("NÃO toca em quantidade, preço, fornecedor nem situação", async () => {
    const { t, donaId, compraManual, rosa } = await cenario();
    const antes = await t.run(async (ctx) => ctx.db.get(compraManual));
    await t.run(async (ctx) => vincular(ctx, donaId, compraManual, rosa));
    const depois = await t.run(async (ctx) => ctx.db.get(compraManual));
    expect(depois).toMatchObject({
      quantity: antes!.quantity,
      unitPrice: antes!.unitPrice,
      supplier: antes!.supplier,
      supplierId: antes!.supplierId,
      status: antes!.status,
      isPurchased: antes!.isPurchased,
      name: antes!.name,
    });
  });

  it("não cria lançamento no financeiro", async () => {
    const { t, donaId, compraManual, rosa } = await cenario();
    await t.run(async (ctx) => vincular(ctx, donaId, compraManual, rosa));
    expect(await t.run(async (ctx) => ctx.db.query("transactions").collect())).toEqual([]);
  });

  it("recusa unidade diferente — haste e maço não se comparam", async () => {
    const { t, donaId, compraManual, rosa } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(compraManual, { unit: "maco" }));
    await expect(t.run(async (ctx) => vincular(ctx, donaId, compraManual, rosa))).rejects.toThrow();
  });

  it("recusa material de OUTRA empresa", async () => {
    const { t, donaId, compraManual, rosaDaOutra } = await cenario();
    await expect(t.run(async (ctx) => vincular(ctx, donaId, compraManual, rosaDaOutra))).rejects.toThrow();
  });

  it("recusa revincular a um material diferente", async () => {
    const { t, donaId, compraManual, rosa } = await cenario();
    const outro = await t.run(async (ctx) =>
      ctx.db.insert("materials", {
        userId: donaId, nome: "Lisianthus", searchName: "lisianthus", unidade: "haste", updatedAt: NOW,
      }),
    );
    await t.run(async (ctx) => vincular(ctx, donaId, compraManual, rosa));
    await expect(t.run(async (ctx) => vincular(ctx, donaId, compraManual, outro))).rejects.toThrow();
  });
});

describe("DESVINCULAR", () => {
  it("remove o vínculo e o carimbo, e a compra continua existindo", async () => {
    const { t, donaId, compraManual, rosa } = await cenario();
    await t.run(async (ctx) => vincular(ctx, donaId, compraManual, rosa));
    await t.run(async (ctx) =>
      ctx.db.patch(compraManual, { materialId: undefined, necessidadeTecnica: undefined }),
    );
    const compra = await t.run(async (ctx) => ctx.db.get(compraManual));
    expect(compra).not.toBeNull();
    expect(compra!.materialId).toBeUndefined();
    expect(compra!.necessidadeTecnica).toBeUndefined();
    expect(compra!.quantity).toBe(200); // intacta
  });
});

describe("RECONHECER nova necessidade", () => {
  it("atualiza SÓ o carimbo — a compra fica como está", async () => {
    const { t, donaId, compraManual, rosa, itemId, eventId } = await cenario();
    await t.run(async (ctx) => vincular(ctx, donaId, compraManual, rosa));
    // 37 → 42 arranjos: necessidade 185 → 210.
    await t.run(async (ctx) => ctx.db.patch(itemId, { quantity: 42 }));

    const antes = await t.run(async (ctx) => ctx.db.get(compraManual));
    expect(antes!.necessidadeTecnica).toBe(185);

    // Espelho de `reconhecerNecessidade`.
    const r = await t.run(async (ctx) => {
      const linha = await linhaDoConsolidado(ctx, eventId);
      const anterior = (await ctx.db.get(compraManual))!.necessidadeTecnica ?? null;
      await ctx.db.patch(compraManual, { necessidadeTecnica: linha.necessario, updatedAt: NOW });
      return { anterior, atual: linha.necessario };
    });

    expect(r).toEqual({ anterior: 185, atual: 210 });
    const depois = await t.run(async (ctx) => ctx.db.get(compraManual));
    expect(depois!.necessidadeTecnica).toBe(210);
    expect(depois!.quantity, "a compra foi alterada").toBe(200);
    expect(depois!.unitPrice).toBe(4.2);
    expect(depois!.status).toBe("comprado");
  });

  it("depois de reconhecer, a cobertura diz a verdade: faltam 31", async () => {
    // necessário 210, margem 10% → sugerido 231; comprado 200 → faltam 31.
    const { t, donaId, compraManual, rosa, itemId, eventId } = await cenario();
    await t.run(async (ctx) => vincular(ctx, donaId, compraManual, rosa));
    await t.run(async (ctx) => ctx.db.patch(itemId, { quantity: 42 }));
    await t.run(async (ctx) => {
      const linha = await linhaDoConsolidado(ctx, eventId);
      await ctx.db.patch(compraManual, { necessidadeTecnica: linha.necessario });
    });
    const { coberturaDaLinha } = await import("./lib/fichaTecnica");
    const cobertura = await t.run(async (ctx) => {
      const linha = await linhaDoConsolidado(ctx, eventId);
      const compra = (await ctx.db.get(compraManual))!;
      return coberturaDaLinha(linha, [
        { quantity: compra.quantity, cancelada: false, necessidadeTecnica: compra.necessidadeTecnica },
      ]);
    });
    expect(cobertura.alvo).toBe(231);
    expect(cobertura.faltam).toBe(31);
    expect(cobertura.necessidadeMudou).toBe(false); // reconhecida
  });
});

describe("DETECÇÃO da compra semelhante", () => {
  it("acha a compra manual mesmo escrita diferente", async () => {
    const { t, eventId, compraManual } = await cenario();
    const achou = await t.run(async (ctx) => {
      const linha = await linhaDoConsolidado(ctx, eventId);
      const compras = await ctx.db
        .query("purchaseItems")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      return compras.find(
        (c) => !c.materialId && (c.unit ?? "") === linha.unidade &&
          normalizeName(c.name) === normalizeName(linha.nome),
      )?._id;
    });
    expect(achou).toBe(compraManual);
  });

  it("mas NÃO soma a quantidade dela — nome não é identidade", async () => {
    const { t, eventId } = await cenario();
    const { coberturaDaLinha } = await import("./lib/fichaTecnica");
    const cobertura = await t.run(async (ctx) => {
      const linha = await linhaDoConsolidado(ctx, eventId);
      return coberturaDaLinha(linha, [], { temSemelhanteSemVinculo: true });
    });
    expect(cobertura.comprado).toBe(0);
    expect(cobertura.situacao).toBe("sem_vinculo");
  });
});

describe("AUDITORIA HOSTIL — o que atacamos e o que quebrou", () => {
  it("a compra gerada nasce com o SUGERIDO, não com o necessário puro", async () => {
    // Bug real desta auditoria: a tela dizia "providenciar 204" e a compra
    // gerada nascia com 185 — divergindo da própria sugestão exibida.
    const { t, donaId, eventId } = await cenario();
    const criada = await t.run(async (ctx) => {
      const linha = await linhaDoConsolidado(ctx, eventId);
      return ctx.db.insert("purchaseItems", {
        userId: donaId, eventId, name: linha.nome,
        quantity: linha.sugeridoOperacional, unit: linha.unidade,
        isPurchased: false, status: "necessidade", order: 9,
        materialId: linha.materialId as Id<"materials">,
        necessidadeTecnica: linha.necessario, updatedAt: NOW,
      });
    });
    const compra = await t.run(async (ctx) => ctx.db.get(criada));
    expect(compra!.quantity).toBe(204); // 185 + 10%, arredondado para cima
    expect(compra!.necessidadeTecnica).toBe(185); // o carimbo é o necessário
  });

  it("a fonte usa `sugeridoOperacional` na quantidade e `necessario` no carimbo", () => {
    const fonte = readFileSync("convex/fichaTecnica.ts", "utf-8");
    const i = fonte.indexOf("export const gerarCompras");
    const insert = fonte.slice(fonte.indexOf('ctx.db.insert("purchaseItems"', i));
    expect(insert).toContain("quantity: linha.sugeridoOperacional");
    expect(insert).toContain("necessidadeTecnica: linha.necessario");
  });

  it("a margem do catálogo mudando NÃO mexe no evento já montado", async () => {
    const { t, eventId, rosa } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(rosa, { margemPercentual: 90 }));
    const linha = await t.run(async (ctx) => linhaDoConsolidado(ctx, eventId));
    expect(linha.margemPercentual).toBe(10); // o snapshot manda
    expect(linha.sugerido).toBe(203.5);
  });

  it("o sugerido NUNCA fica abaixo do necessário", async () => {
    const { t, eventId } = await cenario();
    const linha = await t.run(async (ctx) => linhaDoConsolidado(ctx, eventId));
    expect(linha.sugerido).toBeGreaterThanOrEqual(linha.necessario);
    expect(linha.sugeridoOperacional).toBeGreaterThanOrEqual(linha.necessario);
  });
});

describe("a fonte faz o que o espelho reproduz", () => {
  const FONTE = readFileSync("convex/fichaTecnica.ts", "utf-8");
  const corpo = (nome: string) => {
    const i = FONTE.indexOf(`export const ${nome} =`);
    expect(i, `${nome} não existe`).toBeGreaterThan(-1);
    return FONTE.slice(i, FONTE.indexOf("\nexport ", i + 1));
  };

  it.each(["vincularCompra", "desvincularCompra", "reconhecerNecessidade"])(
    "%s confere o dono da compra",
    (fn) => {
      expect(corpo(fn)).toContain("compra.userId !== user._id");
    },
  );

  it("`vincularCompra` confere o dono do material e a unidade", () => {
    const c = corpo("vincularCompra");
    expect(c).toContain("material.userId !== user._id");
    expect(c).toContain('(compra.unit ?? "") !== material.unidade');
  });

  it.each(["vincularCompra", "desvincularCompra", "reconhecerNecessidade"])(
    "%s NUNCA grava quantidade, preço, fornecedor ou situação",
    (fn) => {
      const c = corpo(fn);
      const patch = c.slice(c.indexOf("ctx.db.patch"));
      for (const campo of ["quantity:", "unitPrice:", "supplier:", "status:", "isPurchased:", "transactionId:"]) {
        expect(patch, `${fn} grava ${campo}`).not.toContain(campo);
      }
    },
  );

  it("`reconhecerNecessidade` grava só o carimbo", () => {
    const c = corpo("reconhecerNecessidade");
    const patch = c.slice(c.indexOf("ctx.db.patch"), c.indexOf("return {"));
    expect(patch).toContain("necessidadeTecnica: linha.necessario");
    expect(patch).not.toContain("materialId:");
  });

  it("nenhuma delas refaz o cálculo — usa `consolidarMateriais`", () => {
    for (const fn of ["vincularCompra", "reconhecerNecessidade"]) {
      expect(corpo(fn)).toContain("consolidarMateriais");
    }
  });
});
