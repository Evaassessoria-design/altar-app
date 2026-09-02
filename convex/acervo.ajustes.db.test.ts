import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { aplicarAjuste, aplicarContagem } from "./lib/ajusteDeAcervo";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — AJUSTE DE ESTOQUE sobre banco real.
//
// lib/ajusteDeAcervo.test.ts cobre a matemática. Aqui está o que só o banco
// prova: que o estoque de partida é lido DENTRO da transação (concorrência),
// que reserva/saída/retorno continuam sem mexer no total, que o histórico
// guarda antes e depois, e que uma empresa não ajusta o acervo da outra.
//
// O componente Better Auth não é registrado no convex-test, então mutation
// autenticada não roda aqui. O padrão da casa: ESPELHO FIEL da mutation, mais
// uma guarda estrutural que amarra o espelho à fonte real — sem ela o espelho
// poderia divergir da mutation sem nenhum teste reclamar.
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
    const vaso = await ctx.db.insert("collectionItems", {
      userId: donaId, nome: "Vaso 25cm", searchName: "vaso 25cm",
      unidade: "un", quantidadeTotal: 40, updatedAt: NOW,
    });
    const vasoDaOutra = await ctx.db.insert("collectionItems", {
      userId: outraId, nome: "Vaso 25cm", searchName: "vaso 25cm",
      unidade: "un", quantidadeTotal: 100, updatedAt: NOW,
    });
    const marina = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-10-10",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });
    const eventoDaOutra = await ctx.db.insert("events", {
      userId: outraId, name: "Da outra", type: "wedding", date: "2026-10-10",
      location: "L", clientName: "C", status: "confirmed",
    });
    return { donaId, outraId, vaso, vasoDaOutra, marina, eventoDaOutra };
  });
  return { t, ...ids };
}

/** Espelho fiel de `ajustarEstoque` — inclusive a leitura dentro da transação. */
async function ajustar(
  ctx: MutationCtx, userId: Id<"users">, itemId: Id<"collectionItems">,
  tipo: "entrada" | "perda" | "quebra" | "avaria" | "descarte",
  quantidade: number, extra?: { motivo?: string; eventId?: Id<"events"> },
) {
  const item = await ctx.db.get(itemId);
  if (!item || item.userId !== userId) throw new Error("NOT_FOUND item");

  let eventId: Id<"events"> | undefined;
  if (extra?.eventId) {
    const e = await ctx.db.get(extra.eventId);
    if (!e || e.userId !== userId) throw new Error("NOT_FOUND evento");
    eventId = extra.eventId;
  }

  const r = aplicarAjuste({
    quantidadeAtual: item.quantidadeTotal, tipo, quantidade, unidade: item.unidade,
  });
  if (!r.ok) throw new Error(`AJUSTE_INVALIDO ${r.motivo}`);

  await ctx.db.patch(itemId, { quantidadeTotal: r.quantidadeDepois, updatedAt: NOW });
  await ctx.db.insert("collectionAdjustments", {
    userId, collectionItemId: itemId, tipo, delta: r.delta,
    quantidadeAntes: item.quantidadeTotal, quantidadeDepois: r.quantidadeDepois,
    motivo: extra?.motivo, eventId,
  });
  return r;
}

/** Espelho fiel de `registrarContagem`. */
async function contar(
  ctx: MutationCtx, userId: Id<"users">, itemId: Id<"collectionItems">, contada: number,
) {
  const item = await ctx.db.get(itemId);
  if (!item || item.userId !== userId) throw new Error("NOT_FOUND item");
  const r = aplicarContagem({
    quantidadeAtual: item.quantidadeTotal, quantidadeContada: contada, unidade: item.unidade,
  });
  if (!r.ok) throw new Error(`AJUSTE_INVALIDO ${r.motivo}`);
  await ctx.db.patch(itemId, { quantidadeTotal: r.quantidadeDepois, updatedAt: NOW });
  await ctx.db.insert("collectionAdjustments", {
    userId, collectionItemId: itemId, tipo: "acerto_inventario", delta: r.delta,
    quantidadeAntes: item.quantidadeTotal, quantidadeDepois: r.quantidadeDepois,
  });
  return r;
}

const totalDe = (ctx: MutationCtx, id: Id<"collectionItems">) =>
  ctx.db.get(id).then((i) => i!.quantidadeTotal);

describe("ajuste move o estoque", () => {
  it("entrada aumenta", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "entrada", 20);
      expect(await totalDe(ctx, vaso)).toBe(60);
    });
  });

  it("perda reduz", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "perda", 1);
      expect(await totalDe(ctx, vaso)).toBe(39);
    });
  });

  it("quebra reduz", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "quebra", 2);
      expect(await totalDe(ctx, vaso)).toBe(38);
    });
  });

  it("contagem física ajusta para o que foi contado", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await contar(ctx, donaId, vaso, 37);
      expect(await totalDe(ctx, vaso)).toBe(37);
    });
  });

  it("não deixa o estoque negativo, e não grava nada quando recusa", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await expect(ajustar(ctx, donaId, vaso, "perda", 41)).rejects.toThrow("AJUSTE_INVALIDO");
      expect(await totalDe(ctx, vaso)).toBe(40);
      const hist = await ctx.db.query("collectionAdjustments").collect();
      expect(hist).toHaveLength(0);
    });
  });
});

describe("concorrência — o estoque de partida vem da transação, não da tela", () => {
  it("duas baixas seguidas partem do valor já atualizado", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "quebra", 30);
      await ajustar(ctx, donaId, vaso, "quebra", 5);
      // 40 → 10 → 5. Se a segunda tivesse usado o 40 que a tela mostrava,
      // o resultado seria 35 e cinco vasos apareceriam do nada.
      expect(await totalDe(ctx, vaso)).toBe(5);
    });
  });

  it("a segunda baixa é RECUSADA quando a primeira já esvaziou", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "perda", 38);
      // Duas pessoas leram "40 disponíveis" e as duas mandaram baixar 38.
      await expect(ajustar(ctx, donaId, vaso, "perda", 38)).rejects.toThrow("AJUSTE_INVALIDO");
      expect(await totalDe(ctx, vaso)).toBe(2);
    });
  });
});

describe("ajuste NÃO é reserva, saída nem retorno", () => {
  it("reservar, dar saída e registrar retorno parcial não mexem no total", async () => {
    const { t, donaId, vaso, marina } = await cenario();
    await t.run(async (ctx) => {
      const reserva = await ctx.db.insert("collectionReservations", {
        userId: donaId, collectionItemId: vaso, eventId: marina, quantidade: 20,
        inicio: "2026-10-09", fim: "2026-10-11", origem: "manual", updatedAt: NOW,
      });
      expect(await totalDe(ctx, vaso)).toBe(40);

      await ctx.db.patch(reserva, { saiu: 20 });
      expect(await totalDe(ctx, vaso)).toBe(40);

      // Voltaram 19 de 20: uma peça não voltou. O sistema NÃO conclui perda.
      await ctx.db.patch(reserva, { voltou: 19 });
      expect(await totalDe(ctx, vaso)).toBe(40);
    });
  });

  it("só a baixa EXPLÍCITA muda o total", async () => {
    const { t, donaId, vaso, marina } = await cenario();
    await t.run(async (ctx) => {
      await ctx.db.insert("collectionReservations", {
        userId: donaId, collectionItemId: vaso, eventId: marina, quantidade: 20,
        inicio: "2026-10-09", fim: "2026-10-11", origem: "manual", saiu: 20, voltou: 19,
        updatedAt: NOW,
      });
      expect(await totalDe(ctx, vaso)).toBe(40);

      // A decoradora decide: aquele vaso quebrou.
      await ajustar(ctx, donaId, vaso, "quebra", 1, { eventId: marina, motivo: "quebrou no retorno" });
      expect(await totalDe(ctx, vaso)).toBe(39);
    });
  });
});

describe("histórico", () => {
  it("guarda antes, depois, delta e motivo", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "perda", 3, { motivo: "sumiu no galpão" });
      const [a] = await ctx.db.query("collectionAdjustments").collect();
      expect(a.quantidadeAntes).toBe(40);
      expect(a.quantidadeDepois).toBe(37);
      expect(a.delta).toBe(-3);
      expect(a.motivo).toBe("sumiu no galpão");
    });
  });

  it("mantém o vínculo com o evento quando a perda veio de um", async () => {
    const { t, donaId, vaso, marina } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "quebra", 2, { eventId: marina });
      const [a] = await ctx.db.query("collectionAdjustments").collect();
      expect(a.eventId).toBe(marina);
    });
  });

  it("ajuste sem evento não inventa vínculo", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "entrada", 10);
      const [a] = await ctx.db.query("collectionAdjustments").collect();
      expect(a.eventId).toBeUndefined();
    });
  });

  it("a sequência reconstrói a história sem virar fonte de verdade", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "quebra", 2);
      await ajustar(ctx, donaId, vaso, "entrada", 10);
      await contar(ctx, donaId, vaso, 47);
      const hist = await ctx.db.query("collectionAdjustments").collect();
      expect(hist.map((h) => [h.quantidadeAntes, h.quantidadeDepois])).toEqual([
        [40, 38], [38, 48], [48, 47],
      ]);
      // O item continua sendo quem manda: o histórico só concorda com ele.
      expect(await totalDe(ctx, vaso)).toBe(47);
    });
  });

  it("correção se faz com ajuste compensatório — o erro continua na história", async () => {
    const { t, donaId, vaso } = await cenario();
    await t.run(async (ctx) => {
      await ajustar(ctx, donaId, vaso, "perda", 5, { motivo: "erro de contagem" });
      await ajustar(ctx, donaId, vaso, "entrada", 5, { motivo: "estorno do lançamento errado" });
      expect(await totalDe(ctx, vaso)).toBe(40);
      expect(await ctx.db.query("collectionAdjustments").collect()).toHaveLength(2);
    });
  });
});

describe("isolamento entre empresas", () => {
  it("uma empresa não ajusta o acervo da outra", async () => {
    const { t, donaId, vasoDaOutra } = await cenario();
    await t.run(async (ctx) => {
      await expect(ajustar(ctx, donaId, vasoDaOutra, "perda", 1)).rejects.toThrow("NOT_FOUND item");
      expect(await totalDe(ctx, vasoDaOutra)).toBe(100);
    });
  });

  it("não dá para carimbar o ajuste com evento de outra empresa", async () => {
    const { t, donaId, vaso, eventoDaOutra } = await cenario();
    await t.run(async (ctx) => {
      await expect(
        ajustar(ctx, donaId, vaso, "perda", 1, { eventId: eventoDaOutra }),
      ).rejects.toThrow("NOT_FOUND evento");
      expect(await totalDe(ctx, vaso)).toBe(40);
    });
  });
});

// ── A guarda que amarra o espelho à mutation de verdade ─────────────────────
describe("a mutation real mantém as propriedades que o espelho assume", () => {
  const FONTE = readFileSync("convex/acervo.ts", "utf-8");
  const CODIGO = FONTE.split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  const corpo = (nome: string) => {
    const i = CODIGO.indexOf(`export const ${nome} = mutation(`);
    expect(i, `não achei ${nome}`).toBeGreaterThan(-1);
    return CODIGO.slice(i, i + 2600);
  };

  it("ajustarEstoque decide pelo domínio, não por conta própria", () => {
    expect(corpo("ajustarEstoque")).toContain("aplicarAjuste");
  });

  it("registrarContagem idem", () => {
    expect(corpo("registrarContagem")).toContain("aplicarContagem");
  });

  it.each(["ajustarEstoque", "registrarContagem"])(
    "%s lê o item no servidor em vez de receber a quantidade atual da tela",
    (nome) => {
      const c = corpo(nome);
      expect(c).toContain("itemDoUsuario");
      expect(c).toContain("item.quantidadeTotal");
      // Se a tela pudesse mandar o "antes", duas abas concorrentes gravariam
      // partindo do mesmo número velho.
      expect(c).not.toMatch(/args\.quantidadeAtual|args\.quantidadeAntes/);
    },
  );

  it.each(["ajustarEstoque", "registrarContagem"])("%s grava o histórico junto", (nome) => {
    expect(corpo(nome)).toContain('insert("collectionAdjustments"');
  });

  it("nenhuma outra mutation do acervo escreve em quantidadeTotal", () => {
    // Reserva, saída e retorno nunca podem virar baixa automática.
    // Por intenção, não por contagem: quem PODE gravar o total é só quem
    // deveria. `createItem` grava o saldo de abertura; as duas de ajuste
    // gravam com histórico. Mais ninguém — nem `updateItem`, que teria sido
    // uma segunda porta sem rastro.
    for (const proibida of [
      "updateItem", "setItemArchived", "registrarSaida", "registrarRetorno",
      "reservar", "liberarReserva", "reservarDaFicha",
    ]) {
      const i = CODIGO.indexOf(`export const ${proibida} = mutation(`);
      expect(CODIGO.slice(i, i + 2200)).not.toContain("quantidadeTotal:");
    }
  });

  it("o histórico não tem mutation de edição nem de exclusão", () => {
    // Imutabilidade por ausência de porta: corrigir é lançar um compensatório.
    expect(CODIGO).not.toMatch(/patch\(\s*\w*[Aa]just/);
    expect(CODIGO).not.toMatch(/delete\(\s*\w*[Aa]just/);
    expect(CODIGO).not.toContain('query("collectionAdjustments").*delete');
  });
});
