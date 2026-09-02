import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  chaveDeConsolidacao,
  coberturaDaLinha,
  consolidarMateriais,
} from "./lib/fichaTecnica";
import { ehObrigacaoDeMontagem } from "./lib/escopoDoProjeto";
import { normalizeName } from "./lib/materiais";
import { effectivePurchaseStatus } from "./lib/purchaseStatus";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA HOSTIL PÓS-MASTER #6
//
// Escrito para PROVAR que a Ficha Técnica está errada. Quatro defeitos reais
// saíram daqui — cada um tem o seu teste, e cada um falhava antes da correção:
//
//   D1. a chave de consolidação usava outra normalização que a do catálogo:
//       "Eucalípto" e "Eucalipto" viravam duas linhas;
//   D2. compra cadastrada À MÃO para o mesmo material não era vista, e "Gerar
//       compras" criava uma SEGUNDA compra de rosas — dinheiro em dobro;
//   D3. N+1: um `db.get` por material dentro do laço da geração;
//   D4. dois snapshots discordando sobre o tipo do material fundiam em
//       silêncio, adotando o primeiro.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = "2026-09-02T12:00:00.000Z";
const consolidar = (c: Parameters<typeof consolidarMateriais>[0]) =>
  consolidarMateriais(c, ehObrigacaoDeMontagem);
const comp = (
  _id: string,
  quantidade: number | undefined,
  receita: { materialId?: string; nome: string; unidade: string; quantidade: number; tipo?: string }[],
  extra: { area?: string; ambiente?: string; projectScope?: string } = {},
) => ({ _id, nome: `Comp ${_id}`, area: extra.area ?? "tables", ...extra, quantidade, receita });

// ═══════════════════════════════════════════════════════════════ 1. SNAPSHOT

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: MutationCtx) => {
    const donaId = await ctx.db.insert("users", {
      name: "Dona", email: "dona@ex.com", role: "user", subscriptionStatus: "active",
    });
    const outraId = await ctx.db.insert("users", {
      name: "Outra", email: "outra@ex.com", role: "user", subscriptionStatus: "active",
    });
    const rosa = await ctx.db.insert("materials", {
      userId: donaId, nome: "Rosa branca", searchName: "rosa branca", unidade: "haste", updatedAt: NOW,
    });
    const lis = await ctx.db.insert("materials", {
      userId: donaId, nome: "Lisianthus", searchName: "lisianthus", unidade: "haste", updatedAt: NOW,
    });
    const materialDaOutra = await ctx.db.insert("materials", {
      userId: outraId, nome: "Rosa alheia", searchName: "rosa alheia", unidade: "haste", updatedAt: NOW,
    });
    const composicaoId = await ctx.db.insert("compositions", {
      userId: donaId, nome: "Arranjo clássico", searchName: "arranjo classico", updatedAt: NOW,
      receita: [
        { materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5 },
        { materialId: lis, nome: "Lisianthus", unidade: "haste", quantidade: 3 },
      ],
    });
    const composicaoDaOutra = await ctx.db.insert("compositions", {
      userId: outraId, nome: "Alheia", searchName: "alheia", receita: [], updatedAt: NOW,
    });

    const evento = async (nome: string) =>
      ctx.db.insert("events", {
        userId: donaId, name: nome, type: "wedding", date: "2026-12-12",
        location: "L", clientName: "C", status: "confirmed",
      });
    const eventoA = await evento("Evento A");
    const eventoB = await evento("Evento B");
    const eventoDaOutra = await ctx.db.insert("events", {
      userId: outraId, name: "Da outra", type: "wedding", date: "2026-12-12",
      location: "L", clientName: "C", status: "confirmed",
    });

    const itemBase = (eventId: Id<"events">) => ({
      userId: donaId, eventId, area: "tables", name: "Arranjo", order: 0, quantity: 10,
      includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno" as const,
      createdAt: NOW, updatedAt: NOW,
    });
    const composicao = (await ctx.db.get(composicaoId))!;
    // Aplicar = COPIAR (é o que `aplicarComposicao` faz).
    const itemA = await ctx.db.insert("assemblyItems", {
      ...itemBase(eventoA),
      compositionId: composicaoId,
      receita: composicao.receita.map((c) => ({ ...c })),
    });

    return {
      donaId, outraId, rosa, lis, materialDaOutra, composicaoId, composicaoDaOutra,
      eventoA, eventoB, eventoDaOutra, itemA,
    };
  });
  return { t, ...ids };
}

async function fichaDoEvento(ctx: MutationCtx, eventId: Id<"events">) {
  const itens = await ctx.db
    .query("assemblyItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  return consolidar(
    itens.map((i) => ({
      _id: i._id, nome: i.name, area: i.area, ambiente: i.ambiente,
      quantidade: i.quantity, projectScope: i.projectScope, receita: i.receita,
    })),
  );
}

describe("SNAPSHOT — A: alterar a composição central não mexe no Evento A", () => {
  it("o evento fica EXATAMENTE com a receita antiga", async () => {
    const { t, eventoA, composicaoId, rosa, lis } = await cenario();
    expect((await t.run(async (ctx) => fichaDoEvento(ctx, eventoA))).map((l) => `${l.nome}:${l.necessario}`))
      .toEqual(["Lisianthus:30", "Rosa branca:50"]);

    // 5 rosas + 3 lis  →  7 rosas + 1 lis + 2 velas
    await t.run(async (ctx) =>
      ctx.db.patch(composicaoId, {
        receita: [
          { materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 7 },
          { materialId: lis, nome: "Lisianthus", unidade: "haste", quantidade: 1 },
          { nome: "Vela palito", unidade: "un", quantidade: 2 },
        ],
      }),
    );

    const depois = await t.run(async (ctx) => fichaDoEvento(ctx, eventoA));
    expect(depois.map((l) => `${l.nome}:${l.necessario}`)).toEqual(["Lisianthus:30", "Rosa branca:50"]);
    expect(depois.some((l) => l.nome === "Vela palito"), "vela nova vazou para o evento antigo").toBe(false);
  });
});

describe("SNAPSHOT — B: o Evento B recebe a receita NOVA", () => {
  it("aplicar depois da alteração traz a versão nova", async () => {
    const { t, donaId, eventoB, composicaoId, rosa } = await cenario();
    await t.run(async (ctx) =>
      ctx.db.patch(composicaoId, {
        receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 7 }],
      }),
    );
    await t.run(async (ctx) => {
      const composicao = (await ctx.db.get(composicaoId))!;
      await ctx.db.insert("assemblyItems", {
        userId: donaId, eventId: eventoB, area: "tables", name: "Arranjo", order: 0, quantity: 10,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
        createdAt: NOW, updatedAt: NOW, compositionId: composicaoId,
        receita: composicao.receita.map((c) => ({ ...c })),
      });
    });
    const linhas = await t.run(async (ctx) => fichaDoEvento(ctx, eventoB));
    expect(linhas.find((l) => l.nome === "Rosa branca")!.necessario).toBe(70);
  });
});

describe("SNAPSHOT — C/D: mexer no material central não quebra a ficha antiga", () => {
  it("RENOMEAR preserva o nome que a equipe vai executar", async () => {
    const { t, eventoA, rosa } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(rosa, { nome: "Rosa importada", searchName: "rosa importada" }));
    const linhas = await t.run(async (ctx) => fichaDoEvento(ctx, eventoA));
    expect(linhas.find((l) => l.nome === "Rosa branca")!.necessario).toBe(50);
  });

  it("ARQUIVAR não some com a linha", async () => {
    const { t, eventoA, rosa } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(rosa, { archived: true }));
    expect((await t.run(async (ctx) => fichaDoEvento(ctx, eventoA)))).toHaveLength(2);
  });

  it("EXCLUIR o material (pior caso) não quebra — o snapshot carrega o suficiente", async () => {
    // É a prova de que o snapshot NÃO depende do registro central: nome,
    // unidade, quantidade e tipo estão todos na cópia.
    const { t, eventoA, rosa } = await cenario();
    await t.run(async (ctx) => ctx.db.delete(rosa));
    const linhas = await t.run(async (ctx) => fichaDoEvento(ctx, eventoA));
    const linha = linhas.find((l) => l.nome === "Rosa branca")!;
    expect(linha.necessario).toBe(50);
    expect(linha.unidade).toBe("haste");
    expect(linha.tipo).toBe("consumivel");
  });
});

describe("SNAPSHOT — E: excluir a composição central não tira a ficha do evento", () => {
  it("a receita do item sobrevive", async () => {
    const { t, eventoA, composicaoId } = await cenario();
    await t.run(async (ctx) => ctx.db.delete(composicaoId));
    expect((await t.run(async (ctx) => fichaDoEvento(ctx, eventoA))).length).toBe(2);
  });
});

describe("SNAPSHOT — G: material/composição de OUTRO tenant", () => {
  it("`resolverReceita` recusa material alheio", () => {
    const fonte = readFileSync("convex/compositions.ts", "utf-8");
    const i = fonte.indexOf("async function resolverReceita");
    const corpo = fonte.slice(i, fonte.indexOf("\nconst UNIDADES_VALIDAS", i));
    expect(corpo).toContain("material.userId !== userId");
  });

  it("`aplicarComposicao` recusa composição alheia", () => {
    const fonte = readFileSync("convex/fichaTecnica.ts", "utf-8");
    const i = fonte.indexOf("export const aplicarComposicao");
    const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
    expect(corpo).toContain("composicao.userId !== user._id");
  });

  it("o consolidado de uma empresa nunca lê item da outra", async () => {
    const { t, eventoDaOutra } = await cenario();
    expect(await t.run(async (ctx) => fichaDoEvento(ctx, eventoDaOutra))).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════ 2. CONSOLIDADO

describe("CHAVE DE CONSOLIDAÇÃO — deliberada, não acidental", () => {
  it("com materialId, a identidade é o ID", () => {
    expect(chaveDeConsolidacao({ materialId: "m1", nome: "Rosa", unidade: "haste" })).toBe("id:m1|haste");
  });

  it("dois IDs diferentes com nome/unidade iguais NÃO se fundem", () => {
    // Se fossem o mesmo material, a deduplicação do catálogo já teria fundido.
    // Fundir aqui esconderia um cadastro duplicado em vez de mostrá-lo.
    const linhas = consolidar([
      comp("a", 1, [{ materialId: "m1", nome: "Rosa", unidade: "haste", quantidade: 10 }]),
      comp("b", 1, [{ materialId: "m2", nome: "Rosa", unidade: "haste", quantidade: 5 }]),
    ]);
    expect(linhas).toHaveLength(2);
  });

  it("sem materialId, a identidade é o nome com a MESMA normalização do catálogo", () => {
    // D1: antes era `trim().toLowerCase()`, que não tira acento nem pontuação.
    expect(chaveDeConsolidacao({ nome: "Eucalípto", unidade: "haste" })).toBe(
      chaveDeConsolidacao({ nome: "eucalipto", unidade: "haste" }),
    );
    expect(chaveDeConsolidacao({ nome: "Vaso (25cm)", unidade: "un" })).toBe(
      chaveDeConsolidacao({ nome: "Vaso 25cm", unidade: "un" }),
    );
  });

  it("a normalização é literalmente a do catálogo, não uma cópia parecida", () => {
    expect(chaveDeConsolidacao({ nome: "Rosa Branca", unidade: "haste" })).toBe(
      `nome:${normalizeName("Rosa Branca")}|haste`,
    );
  });

  it("com ID e sem ID NÃO se fundem — e isso é deliberado", () => {
    // Uma linha do catálogo e uma linha solta digitada à mão podem ser coisas
    // diferentes. Fundi-las por nome é a heurística perigosa que não fazemos.
    const linhas = consolidar([
      comp("a", 1, [{ materialId: "m1", nome: "Rosa", unidade: "haste", quantidade: 10 }]),
      comp("b", 1, [{ nome: "Rosa", unidade: "haste", quantidade: 5 }]),
    ]);
    expect(linhas).toHaveLength(2);
  });
});

describe("MATEMÁTICA HOSTIL", () => {
  it("mesmo material repetido DENTRO da mesma receita soma", () => {
    const linhas = consolidar([
      comp("a", 10, [
        { materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 3 },
        { materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 2 },
      ]),
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].necessario).toBe(50);
    expect(linhas[0].origens).toHaveLength(2);
  });

  it("mesmo material em vários ambientes rastreia cada origem", () => {
    const linhas = consolidar([
      comp("a", 10, [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 5 }], { area: "tables", ambiente: "Mesas" }),
      comp("b", 4, [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 5 }], { area: "ceremony" }),
      comp("c", 1, [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 30 }], { area: "cake" }),
    ]);
    expect(linhas[0].necessario).toBe(100);
    expect(linhas[0].origens.map((o) => o.necessario)).toEqual([50, 20, 30]);
  });

  it("composição com quantidade 0 não consome nada", () => {
    expect(consolidar([comp("a", 0, [{ nome: "Rosa", unidade: "haste", quantidade: 5 }])])[0].necessario).toBe(0);
  });

  it("componente com quantidade 0 não consome nada", () => {
    expect(consolidar([comp("a", 10, [{ nome: "Rosa", unidade: "haste", quantidade: 0 }])])[0].necessario).toBe(0);
  });

  it("2,5 × 7 = 17,5 (decimal legítimo)", () => {
    expect(consolidar([comp("a", 7, [{ nome: "Tecido", unidade: "m", quantidade: 2.5 }])])[0].necessario).toBe(17.5);
  });

  it("valores muito pequenos não somem", () => {
    expect(consolidar([comp("a", 2, [{ nome: "Cola", unidade: "l", quantidade: 0.005 }])])[0].necessario).toBe(0.01);
  });

  it("valores grandes não perdem precisão", () => {
    expect(consolidar([comp("a", 5000, [{ nome: "Rosa", unidade: "haste", quantidade: 12 }])])[0].necessario).toBe(60000);
  });

  it("quantidade nula/ausente no componente vira 0, nunca NaN", () => {
    const linhas = consolidar([comp("a", 10, [{ nome: "X", unidade: "un", quantidade: undefined as never }])]);
    expect(linhas[0].necessario).toBe(0);
    expect(Number.isNaN(linhas[0].necessario)).toBe(false);
  });

  it("receita vazia e item sem receita não geram linha", () => {
    expect(consolidar([comp("a", 10, []), { _id: "b", nome: "B", area: "x", quantidade: 5 }])).toEqual([]);
  });

  it("item LEGADO (sem receita e sem escopo) não quebra nem inventa material", () => {
    expect(consolidar([{ _id: "legacy", nome: "Mesa antiga", area: "tables" }])).toEqual([]);
  });
});

describe("TIPO AMBÍGUO — D4", () => {
  it("dois snapshots discordando sobre o tipo levantam a bandeira", () => {
    const linhas = consolidar([
      comp("a", 1, [{ materialId: "m", nome: "Vaso", unidade: "un", quantidade: 2, tipo: "consumivel" }]),
      comp("b", 1, [{ materialId: "m", nome: "Vaso", unidade: "un", quantidade: 3, tipo: "reutilizavel" }]),
    ]);
    expect(linhas[0].tipoAmbiguo).toBe(true);
    expect(linhas[0].necessario).toBe(5); // a conta continua certa
  });

  it("tipos iguais não levantam bandeira nenhuma", () => {
    const linhas = consolidar([
      comp("a", 1, [{ materialId: "m", nome: "Vaso", unidade: "un", quantidade: 2, tipo: "reutilizavel" }]),
      comp("b", 1, [{ materialId: "m", nome: "Vaso", unidade: "un", quantidade: 3, tipo: "reutilizavel" }]),
    ]);
    expect(linhas[0].tipoAmbiguo).toBe(false);
  });

  it("mudar o tipo no catálogo NÃO muda o evento já montado", () => {
    // O tipo vive no snapshot. Reclassificar o vaso hoje não pode mudar, em
    // silêncio, o que a ficha de um evento passado diz sobre retorno.
    const linhas = consolidar([comp("a", 5, [{ materialId: "m", nome: "Vaso", unidade: "un", quantidade: 1, tipo: "reutilizavel" }])]);
    expect(linhas[0].retornavel).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════ 3. UNIDADES

describe("UNIDADES — haste nunca vira maço", () => {
  it("100 hastes + 3 maços NÃO viram 103", () => {
    const linhas = consolidar([
      comp("a", 20, [{ materialId: "m", nome: "Rosa branca", unidade: "haste", quantidade: 5 }]),
      comp("b", 3, [{ materialId: "m", nome: "Rosa branca", unidade: "maco", quantidade: 1 }]),
    ]);
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => `${l.necessario} ${l.unidade}`).sort()).toEqual(["100 haste", "3 maco"]);
  });

  it("maiúsculas e espaços não separam o que é igual", () => {
    const linhas = consolidar([
      comp("a", 1, [{ nome: "  ROSA   Branca ", unidade: "haste", quantidade: 10 }]),
      comp("b", 1, [{ nome: "rosa branca", unidade: "haste", quantidade: 5 }]),
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].necessario).toBe(15);
  });

  it("nenhuma conversão de unidade é inventada em lugar nenhum", () => {
    const fonte = readFileSync("convex/lib/fichaTecnica.ts", "utf-8");
    for (const suspeito of ["* 12", "/ 12", "converter", "fatorDeConversao"]) {
      expect(fonte, `conversão de unidade em ${suspeito}`).not.toContain(suspeito);
    }
  });
});

// ═══════════════════════════════════════════════════════ 4. FICHA → COMPRA

/** Espelho fiel de `gerarCompras`. */
async function gerar(
  ctx: MutationCtx,
  userId: Id<"users">,
  eventId: Id<"events">,
  materialIds?: Id<"materials">[],
) {
  const linhas = await fichaDoEvento(ctx, eventId);
  const compras = await ctx.db
    .query("purchaseItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const pedidos = materialIds?.length ? new Set(materialIds as string[]) : null;
  let ordem = compras.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  let criadas = 0, jaExistiam = 0, divergentes = 0;
  const ignoradas: string[] = [], possiveisDuplicatas: string[] = [];

  for (const linha of linhas) {
    if (!linha.materialId) { ignoradas.push(linha.nome); continue; }
    if (pedidos && !pedidos.has(linha.materialId)) continue;
    if (!pedidos && !linha.normalmenteCompra) continue;
    const existente = compras.find((c) => c.materialId === linha.materialId && (c.unit ?? "") === linha.unidade);
    if (existente) {
      jaExistiam += 1;
      if (typeof existente.necessidadeTecnica === "number" &&
          Math.abs(existente.necessidadeTecnica - linha.necessario) > 0.001) divergentes += 1;
      continue;
    }
    const semelhante = compras.find(
      (c) => !c.materialId && (c.unit ?? "") === linha.unidade && normalizeName(c.name) === normalizeName(linha.nome),
    );
    if (semelhante) { possiveisDuplicatas.push(linha.nome); continue; }
    await ctx.db.insert("purchaseItems", {
      userId, eventId, name: linha.nome, quantity: linha.necessario, unit: linha.unidade,
      isPurchased: false, status: "necessidade", order: ordem++,
      materialId: linha.materialId as Id<"materials">,
      necessidadeTecnica: linha.necessario, updatedAt: NOW,
    });
    compras.push({ materialId: linha.materialId, unit: linha.unidade, name: linha.nome, order: ordem } as never);
    criadas += 1;
  }
  return { criadas, jaExistiam, divergentes, ignoradas, possiveisDuplicatas };
}

const comprasDo = (ctx: MutationCtx, eventId: Id<"events">) =>
  ctx.db.query("purchaseItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();

describe("FICHA → COMPRA", () => {
  it("A: gerar duas vezes mantém UMA compra", async () => {
    const { t, donaId, eventoA } = await cenario();
    await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    const segunda = await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    expect(segunda.criadas).toBe(0);
    expect(segunda.jaExistiam).toBe(2);
    expect(await t.run(async (ctx) => comprasDo(ctx, eventoA))).toHaveLength(2);
  });

  it("B: necessidade 50 → 110 não muda a compra em silêncio", async () => {
    const { t, donaId, eventoA, itemA } = await cenario();
    await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    await t.run(async (ctx) => ctx.db.patch(itemA, { quantity: 22 }));
    const r = await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    expect(r.divergentes).toBe(2);
    const rosa = (await t.run(async (ctx) => comprasDo(ctx, eventoA))).find((c) => c.name === "Rosa branca")!;
    expect(rosa.quantity).toBe(50);
    expect(rosa.necessidadeTecnica).toBe(50);
  });

  it("C: comprar 200 para precisar de 50 continua válido", async () => {
    const { t, donaId, eventoA } = await cenario();
    await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    await t.run(async (ctx) => {
      const rosa = (await comprasDo(ctx, eventoA)).find((c) => c.name === "Rosa branca")!;
      await ctx.db.patch(rosa._id, { quantity: 200 });
    });
    const r = await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    expect(r.criadas).toBe(0); // não recria nem "corrige"
  });

  it("D: necessidade cai e a compra maior NÃO é reduzida", async () => {
    const { t, donaId, eventoA, itemA } = await cenario();
    await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    await t.run(async (ctx) => ctx.db.patch(itemA, { quantity: 4 })); // 50 → 20
    await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    const rosa = (await t.run(async (ctx) => comprasDo(ctx, eventoA))).find((c) => c.name === "Rosa branca")!;
    expect(rosa.quantity).toBe(50);
  });

  it("E: compra CANCELADA não conta como cobertura", async () => {
    const { t, donaId, eventoA } = await cenario();
    await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    await t.run(async (ctx) => {
      const rosa = (await comprasDo(ctx, eventoA)).find((c) => c.name === "Rosa branca")!;
      await ctx.db.patch(rosa._id, { status: "cancelado" });
    });
    const cobertura = await t.run(async (ctx) => {
      const linha = (await fichaDoEvento(ctx, eventoA)).find((l) => l.nome === "Rosa branca")!;
      const compras = (await comprasDo(ctx, eventoA)).filter((c) => c.materialId === linha.materialId);
      return coberturaDaLinha(linha, compras.map((c) => ({
        quantity: c.quantity, cancelada: effectivePurchaseStatus(c) === "cancelado",
      })));
    });
    expect(cobertura.comprado).toBe(0);
    expect(cobertura.temCompra).toBe(false);
    expect(cobertura.faltam).toBe(50);
  });

  it("F: compra EXCLUÍDA some da cobertura e volta a poder ser gerada", async () => {
    const { t, donaId, eventoA } = await cenario();
    await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    await t.run(async (ctx) => {
      const rosa = (await comprasDo(ctx, eventoA)).find((c) => c.name === "Rosa branca")!;
      await ctx.db.delete(rosa._id);
    });
    const r = await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    expect(r.criadas).toBe(1);
    expect(await t.run(async (ctx) => comprasDo(ctx, eventoA))).toHaveLength(2);
  });

  it("G: material em DUAS composições gera UMA compra consolidada", async () => {
    const { t, donaId, eventoA, rosa } = await cenario();
    await t.run(async (ctx) =>
      ctx.db.insert("assemblyItems", {
        userId: donaId, eventId: eventoA, area: "ceremony", name: "Lateral", order: 1, quantity: 4,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
        createdAt: NOW, updatedAt: NOW,
        receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5 }],
      }),
    );
    await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    const doRosa = (await t.run(async (ctx) => comprasDo(ctx, eventoA))).filter((c) => c.materialId === rosa);
    expect(doRosa).toHaveLength(1);
    expect(doRosa[0].quantity).toBe(70); // 50 + 20, numa compra só
  });

  it("H: compra cadastrada À MÃO não vira compra duplicada — D2", async () => {
    // O defeito mais caro achado nesta auditoria: a linha manual não tem
    // `materialId`, então a checagem por id não a encontrava e a geração
    // criava uma SEGUNDA compra de rosas.
    const { t, donaId, eventoA } = await cenario();
    await t.run(async (ctx) =>
      ctx.db.insert("purchaseItems", {
        userId: donaId, eventId: eventoA, name: "rosa  BRANCA", quantity: 200, unit: "haste",
        isPurchased: false, order: 0, updatedAt: NOW, // sem materialId, e escrito diferente
      }),
    );
    const r = await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    expect(r.possiveisDuplicatas).toEqual(["Rosa branca"]);
    const rosas = (await t.run(async (ctx) => comprasDo(ctx, eventoA))).filter(
      (c) => normalizeName(c.name) === "rosa branca",
    );
    expect(rosas, "gerou compra duplicada por cima da manual").toHaveLength(1);
  });

  it("H'': a FONTE detecta a compra manual — não só o espelho do teste", () => {
    // O espelho acima reproduz a lógica; esta trava é sobre o código real.
    // Sem ela, remover a detecção em `gerarCompras` passaria despercebido e
    // a decoradora compraria rosas duas vezes.
    const fonte = readFileSync("convex/fichaTecnica.ts", "utf-8");
    const i = fonte.indexOf("export const gerarCompras");
    const corpo = fonte.slice(i);
    expect(corpo).toContain("possiveisDuplicatas");
    expect(corpo).toContain("normalizeName(c.name) === normalizeName(linha.nome)");
    // E a detecção tem de IMPEDIR a criação, não só contar.
    const trecho = corpo.slice(corpo.indexOf("const semelhante"));
    expect(trecho.slice(0, 300)).toMatch(/possiveisDuplicatas\.push[\s\S]{0,60}continue;/);
  });

  it("H': unidade diferente NÃO é considerada duplicata", async () => {
    // "Rosa branca" em maço é outra compra — recusar seria esconder trabalho.
    const { t, donaId, eventoA } = await cenario();
    await t.run(async (ctx) =>
      ctx.db.insert("purchaseItems", {
        userId: donaId, eventId: eventoA, name: "Rosa branca", quantity: 3, unit: "maco",
        isPurchased: false, order: 0, updatedAt: NOW,
      }),
    );
    const r = await t.run(async (ctx) => gerar(ctx, donaId, eventoA));
    expect(r.possiveisDuplicatas).toEqual([]);
    expect(r.criadas).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════ PERFORMANCE

describe("PERFORMANCE — 50 itens × 15 componentes", () => {
  it("o consolidado é uma passada só, sem consulta por linha", async () => {
    const { t, donaId, eventoB } = await cenario();
    const materiais = await t.run(async (ctx) => {
      const ids: Id<"materials">[] = [];
      for (let m = 0; m < 15; m++) {
        ids.push(
          await ctx.db.insert("materials", {
            userId: donaId, nome: `Material ${m}`, searchName: `material ${m}`,
            unidade: "un", updatedAt: NOW,
          }),
        );
      }
      for (let i = 0; i < 50; i++) {
        await ctx.db.insert("assemblyItems", {
          userId: donaId, eventId: eventoB, area: "tables", name: `Item ${i}`, order: i, quantity: 10,
          includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
          createdAt: NOW, updatedAt: NOW,
          receita: ids.map((materialId, m) => ({
            materialId, nome: `Material ${m}`, unidade: "un" as const, quantidade: 2,
          })),
        });
      }
      return ids;
    });

    const inicio = Date.now();
    const linhas = await t.run(async (ctx) => fichaDoEvento(ctx, eventoB));
    const duracao = Date.now() - inicio;

    expect(materiais).toHaveLength(15);
    expect(linhas).toHaveLength(15);
    expect(linhas[0].necessario).toBe(1000); // 50 × 10 × 2
    expect(linhas[0].origens).toHaveLength(50);
    expect(duracao, "consolidado lento demais para 750 componentes").toBeLessThan(3000);
  });

  it("a geração de compras não busca material dentro do laço — D3", () => {
    const fonte = readFileSync("convex/fichaTecnica.ts", "utf-8");
    const i = fonte.indexOf("export const gerarCompras");
    const corpo = fonte.slice(i);
    const laco = corpo.slice(corpo.indexOf("for (const linha of linhas)"));
    expect(laco, "N+1: db.get por material dentro do laço").not.toMatch(/await ctx\.db\.get\(/);
    expect(corpo).toContain("const catalogo = new Map(");
  });

  it("`getFicha` lê o banco um número FIXO de vezes, nunca por linha", () => {
    const fonte = readFileSync("convex/fichaTecnica.ts", "utf-8");
    const i = fonte.indexOf("export const getFicha");
    const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));

    // O que importa não é o número de consultas (são poucas e fixas: itens,
    // compras e reservas de acervo) — é que NENHUMA aconteça dentro de um
    // laço. Uma consulta por linha do consolidado é o N+1 que este teste
    // existe para impedir; um limite mágico só envelheceria a cada campo novo.
    const dentroDeLaco = /\.map\(async|for \([^)]*\) \{[\s\S]{0,200}?ctx\.db/;
    expect(corpo, "consulta dentro de laço em getFicha").not.toMatch(dentroDeLaco);
    expect((corpo.match(/ctx\.db\s*\n?\s*\.query/g) ?? []).length).toBeLessThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════ FRONTEND × BACKEND / ESCOPO

describe("FRONTEND não reimplementa regra crítica", () => {
  const telas = [
    "src/pages/app/events/[id]/ficha-tecnica/page.tsx",
    "src/pages/app/events/[id]/ficha-tecnica/_components/receita-dialog.tsx",
  ];

  it.each(telas)("%s não soma nem multiplica por conta própria", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    expect(fonte).not.toMatch(/\.reduce\(/);
    expect(fonte).not.toMatch(/quantidade\s*\*|quantity\s*\*/);
  });

  it.each(telas)("%s não decide escopo nem retorno por conta própria", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    // `projectScope === "referencia"` na tela seria a segunda regra.
    expect(fonte).not.toMatch(/projectScope\s*===/);
    expect(fonte).not.toMatch(/tipo\s*===\s*"reutilizavel"/);
  });
});

describe("PROJECT SCOPE — uma regra só em toda a base", () => {
  it("nenhum módulo define escopo por conta própria", () => {
    for (const arquivo of [
      "convex/lib/fichaTecnica.ts",
      "convex/fichaTecnica.ts",
      "src/lib/loading-sheet.ts",
      "src/lib/decoration-project.ts",
    ]) {
      const fonte = readFileSync(arquivo, "utf-8");
      expect(fonte, `${arquivo} compara projectScope na mão`).not.toMatch(
        /projectScope\s*===\s*"(referencia|nao_incluso)"/,
      );
    }
  });

  it("referência visual com receita ENORME é ignorada", () => {
    const linhas = consolidar([
      comp("ref", 1000, [{ nome: "Rosa", unidade: "haste", quantidade: 99 }], { projectScope: "referencia" }),
      comp("real", 2, [{ nome: "Rosa", unidade: "haste", quantidade: 5 }]),
    ]);
    expect(linhas[0].necessario).toBe(10);
  });

  it("'não incluso' também é ignorado", () => {
    expect(consolidar([comp("a", 10, [{ nome: "X", unidade: "un", quantidade: 5 }], { projectScope: "nao_incluso" })])).toEqual([]);
  });
});

describe("CARREGAMENTO — 185 rosas não são item de retorno", () => {
  it("a folha de carregamento nunca lê a receita", () => {
    const folha = readFileSync("src/lib/loading-sheet.ts", "utf-8");
    expect(folha).not.toContain("receita");
    expect(folha).not.toContain("consolidarMateriais");
    expect(folha).not.toContain("retornavel");
  });
});

// ═══════════════════════════════════════════════════ 13. MULTI-TENANT

describe("TENANT — empresa A tentando usar dado da empresa B", () => {
  const guardas: [string, string, string][] = [
    ["convex/materials.ts", "create", "fornecedor.userId !== user._id"],
    ["convex/materials.ts", "update", "material.userId !== user._id"],
    ["convex/materials.ts", "setArchived", "material.userId !== user._id"],
    ["convex/compositions.ts", "update", "composicao.userId !== user._id"],
    ["convex/compositions.ts", "duplicate", "original.userId !== user._id"],
    ["convex/compositions.ts", "setArchived", "composicao.userId !== user._id"],
    ["convex/fichaTecnica.ts", "setReceita", "item.userId !== user._id"],
    ["convex/fichaTecnica.ts", "aplicarComposicao", "composicao.userId !== user._id"],
    ["convex/fichaTecnica.ts", "limparReceita", "item.userId !== user._id"],
    ["convex/fichaTecnica.ts", "salvarNaBiblioteca", "item.userId !== user._id"],
  ];

  it.each(guardas)("%s → %s confere o dono", (arquivo, fn, guarda) => {
    const fonte = readFileSync(arquivo, "utf-8");
    const i = fonte.indexOf(`export const ${fn} =`);
    expect(i, `${fn} não existe mais`).toBeGreaterThan(-1);
    const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
    expect(corpo, `${arquivo}:${fn} não confere o dono`).toContain(guarda);
  });

  it("`gerarCompras` só lê o catálogo do próprio usuário", () => {
    const fonte = readFileSync("convex/fichaTecnica.ts", "utf-8");
    const i = fonte.indexOf("export const gerarCompras");
    const corpo = fonte.slice(i);
    expect(corpo).toContain('withIndex("by_user", (q) => q.eq("userId", user._id))');
    expect(corpo).toContain("requireEventOwner");
  });

  it("material alheio não entra na receita, nem por id direto", async () => {
    const { t, donaId, materialDaOutra } = await cenario();
    // Espelho de `resolverReceita`: a checagem é o dono do material.
    const recusou = await t.run(async (ctx) => {
      const m = await ctx.db.get(materialDaOutra);
      return !m || m.userId !== donaId;
    });
    expect(recusou).toBe(true);
  });

  it("composição alheia não é aplicável", async () => {
    const { t, donaId, composicaoDaOutra } = await cenario();
    const recusou = await t.run(async (ctx) => {
      const c = await ctx.db.get(composicaoDaOutra);
      return !c || c.userId !== donaId;
    });
    expect(recusou).toBe(true);
  });
});

// ═══════════════════════════════════════════════ 10. DUPLICAR COMPOSIÇÃO

describe("DUPLICAR composição", () => {
  it("gera novo id, copia componentes e não compartilha o array", async () => {
    const { t, donaId, composicaoId } = await cenario();
    const copiaId = await t.run(async (ctx) => {
      const original = (await ctx.db.get(composicaoId))!;
      return ctx.db.insert("compositions", {
        userId: donaId, nome: `${original.nome} (cópia)`, searchName: "copia",
        receita: original.receita.map((c) => ({ ...c })), updatedAt: NOW,
      });
    });
    expect(copiaId).not.toBe(composicaoId);

    // Editar a cópia não pode encostar na original.
    await t.run(async (ctx) =>
      ctx.db.patch(copiaId, { receita: [{ nome: "Só isto", unidade: "un", quantidade: 1 }] }),
    );
    const [original, copia] = await t.run(async (ctx) => [
      await ctx.db.get(composicaoId),
      await ctx.db.get(copiaId),
    ]);
    expect(original!.receita).toHaveLength(2);
    expect(copia!.receita).toHaveLength(1);
    expect(original!.userId).toBe(copia!.userId);
  });

  it("a fonte faz cópia profunda, não referência", () => {
    const fonte = readFileSync("convex/compositions.ts", "utf-8");
    const i = fonte.indexOf("export const duplicate");
    const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
    expect(corpo).toContain("original.receita.map((c) => ({ ...c }))");
    expect(corpo).not.toMatch(/receita: original\.receita,/);
  });
});
