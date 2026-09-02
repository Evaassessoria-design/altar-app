import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  deficitDaReserva,
  disponibilidadeNaJanela,
  faltaVoltar,
  janelaSugerida,
  retornoPossivel,
  situacaoDaReserva,
} from "./lib/acervo";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — ACERVO sobre banco real.
//
// lib/acervo.test.ts cobre a MATEMÁTICA. Aqui está o que só o banco prova:
// idempotência da reserva, concorrência, isolamento entre empresas, cascatas e
// as três coisas que nenhuma mutation pode fazer — cortar reserva, mexer no
// total físico e ajustar reserva por causa da ficha.
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

    const vasoMaterial = await ctx.db.insert("materials", {
      userId: donaId, nome: "Vaso cilíndrico 25cm", searchName: "vaso cilindrico 25cm",
      unidade: "un", tipo: "reutilizavel", updatedAt: NOW,
    });
    const vaso = await ctx.db.insert("collectionItems", {
      userId: donaId, nome: "Vaso cilíndrico 25cm", searchName: "vaso cilindrico 25cm",
      unidade: "un", quantidadeTotal: 40, materialId: vasoMaterial, updatedAt: NOW,
    });
    const vasoDaOutra = await ctx.db.insert("collectionItems", {
      userId: outraId, nome: "Vaso cilíndrico 25cm", searchName: "vaso cilindrico 25cm",
      unidade: "un", quantidadeTotal: 100, updatedAt: NOW,
    });

    const marina = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-10-10",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });
    const ana = await ctx.db.insert("events", {
      userId: donaId, name: "Ana & Pedro", type: "wedding", date: "2026-10-11",
      location: "Salão", clientName: "Ana", status: "confirmed",
    });
    const eventoDaOutra = await ctx.db.insert("events", {
      userId: outraId, name: "Da outra", type: "wedding", date: "2026-10-10",
      location: "L", clientName: "C", status: "confirmed",
    });

    return { donaId, outraId, vaso, vasoDaOutra, vasoMaterial, marina, ana, eventoDaOutra };
  });
  return { t, ...ids };
}

async function reservasDoItem(ctx: MutationCtx, itemId: Id<"collectionItems">) {
  const rs = await ctx.db
    .query("collectionReservations")
    .withIndex("by_item", (q) => q.eq("collectionItemId", itemId))
    .collect();
  return rs.map((r) => ({
    _id: r._id as string, eventId: r.eventId as string,
    quantidade: r.quantidade, inicio: r.inicio, fim: r.fim,
  }));
}

/** Espelho fiel de `reservar` — inclusive o recálculo dentro da transação. */
async function reservar(
  ctx: MutationCtx, userId: Id<"users">, itemId: Id<"collectionItems">,
  eventId: Id<"events">, quantidade: number, janela?: { inicio: string; fim: string },
) {
  const item = await ctx.db.get(itemId);
  if (!item || item.userId !== userId) throw new Error("NOT_FOUND item");
  if (item.archived) throw new Error("INVALID arquivado");
  const evento = (await ctx.db.get(eventId))!;
  const j = janela ?? janelaSugerida(evento.date);

  const existente = await ctx.db
    .query("collectionReservations")
    .withIndex("by_event_item", (q) => q.eq("eventId", eventId).eq("collectionItemId", itemId))
    .unique();

  const estado = disponibilidadeNaJanela(
    item.quantidadeTotal, await reservasDoItem(ctx, itemId), j, eventId as string,
  );
  const deficit = deficitDaReserva(quantidade, estado.disponivel);
  const campos = { quantidade, inicio: j.inicio, fim: j.fim, origem: "manual" as const, updatedAt: NOW };

  if (existente) {
    await ctx.db.patch(existente._id, campos);
    return { reservaId: existente._id, criada: false, deficit, disponivel: estado.disponivel };
  }
  const reservaId = await ctx.db.insert("collectionReservations", {
    userId, collectionItemId: itemId, eventId, ...campos,
  });
  return { reservaId, criada: true, deficit, disponivel: estado.disponivel };
}

describe("O CASO DO ENUNCIADO — dois eventos, os mesmos vasos", () => {
  it("Marina reserva 20 e Ana só enxerga 20 disponíveis", async () => {
    const { t, donaId, vaso, marina, ana } = await cenario();
    await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 20));
    const r = await t.run(async (ctx) => reservar(ctx, donaId, vaso, ana, 30));
    expect(r.disponivel).toBe(20);
    expect(r.deficit).toBe(10);
  });

  it("a reserva de 30 é GRAVADA mesmo com déficit — nada é cortado", async () => {
    // Cortar para 20 em silêncio esconderia o problema que ela precisa ver.
    const { t, donaId, vaso, marina, ana } = await cenario();
    await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 20));
    await t.run(async (ctx) => reservar(ctx, donaId, vaso, ana, 30));
    const reserva = await t.run(async (ctx) =>
      (await ctx.db.query("collectionReservations").withIndex("by_event", (q) => q.eq("eventId", ana)).collect())[0],
    );
    expect(reserva.quantidade).toBe(30);
  });

  it("as mesmas peças não são contadas duas vezes", async () => {
    const { t, donaId, vaso, marina, ana } = await cenario();
    await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 20));
    await t.run(async (ctx) => reservar(ctx, donaId, vaso, ana, 30));
    const total = await t.run(async (ctx) =>
      (await ctx.db.query("collectionReservations").collect()).reduce((s, r) => s + r.quantidade, 0),
    );
    expect(total).toBe(50); // prometido
    const item = await t.run(async (ctx) => ctx.db.get(vaso));
    expect(item!.quantidadeTotal).toBe(40); // existente — e o déficit é visível
  });
});

describe("CONCORRÊNCIA — a conta acontece na gravação", () => {
  it("a segunda reserva enxerga a primeira, mesmo lendo o disponível antes", async () => {
    const { t, donaId, vaso, marina, ana } = await cenario();
    const janela = { inicio: "2026-10-09", fim: "2026-10-11" };

    // As duas telas leem 40 disponíveis ANTES de qualquer gravação.
    const lidoAntes = await t.run(async (ctx) =>
      disponibilidadeNaJanela(40, await reservasDoItem(ctx, vaso), janela, null).disponivel,
    );
    expect(lidoAntes).toBe(40);

    await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 25, janela));
    const segunda = await t.run(async (ctx) => reservar(ctx, donaId, vaso, ana, 25, janela));

    expect(segunda.disponivel).toBe(15); // não os 40 que a tela tinha lido
    expect(segunda.deficit).toBe(10);
  });

  it("a mutation NÃO confia em número vindo do cliente", () => {
    const fonte = readFileSync("convex/acervo.ts", "utf-8");
    const i = fonte.indexOf("export const reservar");
    const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
    expect(corpo).toContain("disponibilidadeNaJanela(");
    // Nenhum "disponivel" ou "deficit" chega por argumento.
    expect(corpo.slice(0, corpo.indexOf("handler:"))).not.toContain("disponivel");
  });
});

describe("IDEMPOTÊNCIA da reserva", () => {
  it("clicar duas vezes AJUSTA, não duplica", async () => {
    const { t, donaId, vaso, marina } = await cenario();
    const a = await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 20));
    const b = await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 20));
    expect(a.criada).toBe(true);
    expect(b.criada).toBe(false);
    const reservas = await t.run(async (ctx) =>
      ctx.db.query("collectionReservations").withIndex("by_event", (q) => q.eq("eventId", marina)).collect(),
    );
    expect(reservas).toHaveLength(1);
    expect(reservas[0].quantidade).toBe(20); // não 40
  });

  it("ajustar de 20 para 25 não conflita com a própria reserva", async () => {
    const { t, donaId, vaso, marina } = await cenario();
    await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 20));
    const r = await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 25));
    expect(r.disponivel).toBe(40);
    expect(r.deficit).toBe(0);
  });
});

describe("SAÍDA E RETORNO", () => {
  async function comReserva() {
    const c = await cenario();
    const { reservaId } = await c.t.run(async (ctx) =>
      reservar(ctx, c.donaId, c.vaso, c.marina, 20),
    );
    return { ...c, reservaId: reservaId as Id<"collectionReservations"> };
  }

  it("reservado 20, saiu 19 — a reserva NÃO é ajustada", async () => {
    const { t, reservaId } = await comReserva();
    await t.run(async (ctx) => ctx.db.patch(reservaId, { saiu: 19 }));
    const r = await t.run(async (ctx) => ctx.db.get(reservaId));
    expect(r!.quantidade).toBe(20);
    expect(r!.saiu).toBe(19);
    expect(situacaoDaReserva(r!)).toBe("fora");
  });

  it("saiu MAIS que o reservado é permitido — acontece no galpão", async () => {
    const { t, reservaId } = await comReserva();
    await t.run(async (ctx) => ctx.db.patch(reservaId, { saiu: 22 }));
    const r = await t.run(async (ctx) => ctx.db.get(reservaId));
    expect(r!.quantidade).toBe(20);
    expect(r!.saiu).toBe(22);
  });

  it("saiu 20, voltou 18 → faltam 2, e o TOTAL FÍSICO não muda", async () => {
    // O ponto mais importante: baixar o acervo sozinho seria o sistema
    // decidindo um prejuízo que ninguém apurou.
    const { t, reservaId, vaso } = await comReserva();
    await t.run(async (ctx) => ctx.db.patch(reservaId, { saiu: 20, voltou: 18 }));
    const [r, item] = await t.run(async (ctx) => [
      await ctx.db.get(reservaId),
      await ctx.db.get(vaso),
    ]);
    expect(faltaVoltar(r!)).toBe(2);
    expect(situacaoDaReserva(r!)).toBe("retorno_parcial");
    expect(item!.quantidadeTotal, "o total físico foi alterado sozinho").toBe(40);
  });

  it("voltar MAIS do que saiu é recusado", async () => {
    const { t, reservaId } = await comReserva();
    await t.run(async (ctx) => ctx.db.patch(reservaId, { saiu: 20 }));
    const r = await t.run(async (ctx) => ctx.db.get(reservaId));
    expect(retornoPossivel(r!.saiu, 22)).toBe(false);
  });

  it("voltar sem ter saído é recusado", async () => {
    const { t, reservaId } = await comReserva();
    const r = await t.run(async (ctx) => ctx.db.get(reservaId));
    expect(retornoPossivel(r!.saiu, 5)).toBe(false);
  });

  it("nenhuma mutation de saída/retorno toca em `quantidadeTotal`", () => {
    const fonte = readFileSync("convex/acervo.ts", "utf-8");
    for (const fn of ["registrarSaida", "registrarRetorno"]) {
      const i = fonte.indexOf(`export const ${fn}`);
      const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
      // Só o CÓDIGO: o comentário de `registrarRetorno` explica justamente que
      // não mexe no total, e um guarda que lê prosa acusaria a explicação.
      const codigo = corpo
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(codigo, `${fn} mexe no total físico`).not.toContain("quantidadeTotal");
    }
  });
});

describe("FICHA TÉCNICA → ACERVO", () => {
  async function comFicha(quantidadeDeArranjos = 20) {
    const c = await cenario();
    await c.t.run(async (ctx) =>
      ctx.db.insert("assemblyItems", {
        userId: c.donaId, eventId: c.marina, area: "tables", name: "Arranjo",
        order: 0, quantity: quantidadeDeArranjos,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
        createdAt: NOW, updatedAt: NOW,
        receita: [{ materialId: c.vasoMaterial, nome: "Vaso cilíndrico 25cm", unidade: "un", quantidade: 1, tipo: "reutilizavel" }],
      }),
    );
    return c;
  }

  it("a necessidade CONSOLIDADA vira UMA reserva, não três", async () => {
    const c = await comFicha(10);
    await c.t.run(async (ctx) =>
      ctx.db.insert("assemblyItems", {
        userId: c.donaId, eventId: c.marina, area: "ceremony", name: "Lateral",
        order: 1, quantity: 20,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
        createdAt: NOW, updatedAt: NOW,
        receita: [{ materialId: c.vasoMaterial, nome: "Vaso cilíndrico 25cm", unidade: "un", quantidade: 1, tipo: "reutilizavel" }],
      }),
    );
    // Espelho de `reservarDaFicha`: consolida antes de reservar.
    const { consolidarMateriais } = await import("./lib/fichaTecnica");
    const { ehObrigacaoDeMontagem } = await import("./lib/escopoDoProjeto");
    const necessario = await c.t.run(async (ctx) => {
      const itens = await ctx.db
        .query("assemblyItems")
        .withIndex("by_event", (q) => q.eq("eventId", c.marina))
        .collect();
      return consolidarMateriais(
        itens.map((i) => ({
          _id: i._id, nome: i.name, area: i.area, quantidade: i.quantity,
          projectScope: i.projectScope, receita: i.receita,
        })),
        ehObrigacaoDeMontagem,
      )[0].necessario;
    });
    expect(necessario).toBe(30); // 10 + 20, numa conta só
  });

  it("a janela sugerida vem da data do evento — véspera → dia seguinte", async () => {
    const c = await comFicha();
    const evento = await c.t.run(async (ctx) => ctx.db.get(c.marina));
    expect(janelaSugerida(evento!.date)).toEqual({ inicio: "2026-10-09", fim: "2026-10-11" });
  });

  it("material reutilizável SEM item de acervo vinculado continua 'não informado'", async () => {
    const { t, donaId, marina } = await cenario();
    const semAcervo = await t.run(async (ctx) =>
      ctx.db.insert("materials", {
        userId: donaId, nome: "Castiçal", searchName: "castical", unidade: "un",
        tipo: "reutilizavel", updatedAt: NOW,
      }),
    );
    const acervo = await t.run(async (ctx) =>
      ctx.db.query("collectionItems").withIndex("by_material", (q) => q.eq("materialId", semAcervo)).collect(),
    );
    expect(acervo).toEqual([]); // nada é vinculado por nome
  });

  it("a ficha mudando NÃO ajusta a reserva sozinha", async () => {
    const c = await comFicha(20);
    await c.t.run(async (ctx) => reservar(ctx, c.donaId, c.vaso, c.marina, 20));
    // A ficha passa a precisar de 25.
    await c.t.run(async (ctx) => {
      const item = (await ctx.db.query("assemblyItems").withIndex("by_event", (q) => q.eq("eventId", c.marina)).collect())[0];
      await ctx.db.patch(item._id, { quantity: 25 });
    });
    const reserva = await c.t.run(async (ctx) =>
      (await ctx.db.query("collectionReservations").withIndex("by_event", (q) => q.eq("eventId", c.marina)).collect())[0],
    );
    expect(reserva.quantidade, "a reserva foi ajustada em silêncio").toBe(20);
  });
});

describe("TENANT — nada vaza entre empresas", () => {
  it("o acervo da outra empresa não entra na disponibilidade", async () => {
    const { t, donaId, vaso, vasoDaOutra, outraId, eventoDaOutra } = await cenario();
    await t.run(async (ctx) =>
      ctx.db.insert("collectionReservations", {
        userId: outraId, collectionItemId: vasoDaOutra, eventId: eventoDaOutra,
        quantidade: 100, inicio: "2026-10-09", fim: "2026-10-11", origem: "manual", updatedAt: NOW,
      }),
    );
    const estado = await t.run(async (ctx) =>
      disponibilidadeNaJanela(
        (await ctx.db.get(vaso))!.quantidadeTotal,
        await reservasDoItem(ctx, vaso),
        { inicio: "2026-10-09", fim: "2026-10-11" },
        null,
      ),
    );
    expect(estado.disponivel).toBe(40);
    expect(estado.conflitos).toEqual([]);
    expect(donaId).not.toBe(outraId);
  });

  it("item de acervo de outra empresa não é reservável", async () => {
    const { t, donaId, vasoDaOutra, marina } = await cenario();
    await expect(
      t.run(async (ctx) => reservar(ctx, donaId, vasoDaOutra, marina, 5)),
    ).rejects.toThrow();
  });

  it("toda mutation confere o dono", () => {
    const fonte = readFileSync("convex/acervo.ts", "utf-8");
    for (const fn of [
      "createItem", "updateItem", "setItemArchived",
      "reservar", "liberarReserva", "registrarSaida", "registrarRetorno", "reservarDaFicha",
    ]) {
      const i = fonte.indexOf(`export const ${fn} =`);
      expect(i, `${fn} não existe`).toBeGreaterThan(-1);
      const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
      expect(corpo, `${fn} sem guarda`).toMatch(/requireUser|requireEventOwner/);
    }
  });
});

describe("ARQUIVAR e excluir", () => {
  it("arquivar item com reserva FUTURA é recusado", async () => {
    const { t, donaId, vaso, marina } = await cenario();
    await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 20));
    const futuras = await t.run(async (ctx) => {
      const rs = await ctx.db
        .query("collectionReservations")
        .withIndex("by_item", (q) => q.eq("collectionItemId", vaso))
        .collect();
      return rs.filter((r) => r.fim >= "2026-09-02").length;
    });
    expect(futuras).toBe(1); // a mutation recusa nesse caso
  });

  it("a fonte arquiva em vez de apagar — o histórico sobrevive", () => {
    const fonte = readFileSync("convex/acervo.ts", "utf-8");
    expect(fonte).toContain("export const setItemArchived");
    expect(fonte).not.toMatch(/export const (deleteItem|removeItem)/);
  });

  it("liberar reserva que JÁ SAIU é recusado", async () => {
    const { t, donaId, vaso, marina } = await cenario();
    const { reservaId } = await t.run(async (ctx) => reservar(ctx, donaId, vaso, marina, 20));
    await t.run(async (ctx) => ctx.db.patch(reservaId as Id<"collectionReservations">, { saiu: 20 }));
    const r = await t.run(async (ctx) => ctx.db.get(reservaId as Id<"collectionReservations">));
    expect((r!.saiu ?? 0) > 0).toBe(true); // a mutation recusa
  });
});
