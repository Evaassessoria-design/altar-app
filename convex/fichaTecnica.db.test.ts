import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { consolidarMateriais, coberturaDaLinha } from "./lib/fichaTecnica";
import { ehObrigacaoDeMontagem } from "./lib/escopoDoProjeto";
import { chaveDoMaterial } from "./lib/materiais";
import { effectivePurchaseStatus } from "./lib/purchaseStatus";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — FICHA TÉCNICA sobre banco real.
//
// lib/fichaTecnica.test.ts cobre a MATEMÁTICA. Aqui está o que só o banco
// prova: o snapshot que protege histórico, o isolamento entre empresas, a
// idempotência da geração de compras e a coerência com o resto do sistema.
//
// As mutations exigem sessão (Better Auth não roda no convex-test), então a
// mecânica é espelhada fielmente e o bloco final amarra o espelho à fonte.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = "2026-09-02T12:00:00.000Z";

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
      userId: donaId, nome: "Rosa branca", searchName: "rosa branca",
      unidade: "haste", categoria: "Flores", custoReferencia: 4.2, updatedAt: NOW,
    });
    const vaso = await ctx.db.insert("materials", {
      userId: donaId, nome: "Vaso vidro X", searchName: "vaso vidro x",
      unidade: "un", categoria: "Peças", tipo: "reutilizavel", updatedAt: NOW,
    });
    const rosaDaOutra = await ctx.db.insert("materials", {
      userId: outraId, nome: "Rosa branca", searchName: "rosa branca",
      unidade: "haste", updatedAt: NOW,
    });

    const composicaoId = await ctx.db.insert("compositions", {
      userId: donaId, nome: "Arranjo baixo branco", searchName: "arranjo baixo branco",
      receita: [
        { materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5, custoReferencia: 4.2 },
        { materialId: vaso, nome: "Vaso vidro X", unidade: "un", quantidade: 1, tipo: "reutilizavel" },
      ],
      updatedAt: NOW,
    });

    const eventId = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-12-12",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });

    const base = {
      userId: donaId, eventId, order: 0, includeInAssemblyReport: true,
      checkOnAssembly: true, visibility: "interno" as const, createdAt: NOW, updatedAt: NOW,
    };
    const mesasId = await ctx.db.insert("assemblyItems", {
      ...base, area: "tables", name: "Arranjo baixo branco", ambiente: "Mesa dos convidados",
      quantity: 20, compositionId: composicaoId,
      receita: [
        { materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5, custoReferencia: 4.2 },
        { materialId: vaso, nome: "Vaso vidro X", unidade: "un", quantidade: 1, tipo: "reutilizavel" },
      ],
    });
    const cerimoniaId = await ctx.db.insert("assemblyItems", {
      ...base, order: 1, area: "ceremony", name: "Arranjo lateral", quantity: 10,
      receita: [
        { materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5, custoReferencia: 4.2 },
      ],
    });
    // Referência visual: NÃO consome material nenhum.
    await ctx.db.insert("assemblyItems", {
      ...base, order: 2, area: "lounge", name: "Lounge inspiração", quantity: 100,
      projectScope: "referencia",
      receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 99 }],
    });

    return { donaId, outraId, eventId, rosa, vaso, rosaDaOutra, composicaoId, mesasId, cerimoniaId };
  });
  return { t, ...ids };
}

/** Espelho fiel da leitura de `fichaTecnica.getFicha`. */
async function consolidado(ctx: MutationCtx, eventId: Id<"events">) {
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
  );
}

describe("consolidado sobre banco real", () => {
  it("soma 20×5 + 10×5 = 150 rosas, ignorando a referência visual", async () => {
    const { t, eventId } = await cenario();
    const linhas = await t.run(async (ctx) => consolidado(ctx, eventId));
    const rosa = linhas.find((l) => l.nome === "Rosa branca")!;
    expect(rosa.necessario).toBe(150);
    expect(rosa.origens).toHaveLength(2); // as mesas e a cerimônia, não o lounge
  });

  it("o vaso do acervo aparece como retornável e fora da compra padrão", async () => {
    const { t, eventId } = await cenario();
    const linhas = await t.run(async (ctx) => consolidado(ctx, eventId));
    const vaso = linhas.find((l) => l.nome === "Vaso vidro X")!;
    expect(vaso.necessario).toBe(20);
    expect(vaso.retornavel).toBe(true);
    expect(vaso.normalmenteCompra).toBe(false);
  });

  it("item SEM receita não quebra a ficha", async () => {
    const { t, eventId, donaId } = await cenario();
    await t.run(async (ctx) =>
      ctx.db.insert("assemblyItems", {
        userId: donaId, eventId, area: "bar", name: "Bar", order: 9,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
        createdAt: NOW, updatedAt: NOW,
      }),
    );
    const linhas = await t.run(async (ctx) => consolidado(ctx, eventId));
    expect(linhas.find((l) => l.nome === "Rosa branca")!.necessario).toBe(150);
  });
});

describe("SNAPSHOT — editar a receita mestre não mexe em evento existente", () => {
  it("mudar a composição da biblioteca de 5 para 7 rosas não recalcula o evento", async () => {
    const { t, eventId, composicaoId, rosa } = await cenario();
    const antes = await t.run(async (ctx) => consolidado(ctx, eventId));
    expect(antes.find((l) => l.nome === "Rosa branca")!.necessario).toBe(150);

    await t.run(async (ctx) =>
      ctx.db.patch(composicaoId, {
        receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 7 }],
      }),
    );

    const depois = await t.run(async (ctx) => consolidado(ctx, eventId));
    expect(depois.find((l) => l.nome === "Rosa branca")!.necessario).toBe(150);
  });

  it("um evento NOVO recebe a versão nova da receita", async () => {
    const { t, donaId, composicaoId, rosa } = await cenario();
    await t.run(async (ctx) =>
      ctx.db.patch(composicaoId, {
        receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 7 }],
      }),
    );
    const novoEvento = await t.run(async (ctx) => {
      const eventId = await ctx.db.insert("events", {
        userId: donaId, name: "Outro", type: "birthday", date: "2027-01-10",
        location: "L", clientName: "C", status: "planning",
      });
      const composicao = (await ctx.db.get(composicaoId))!;
      await ctx.db.insert("assemblyItems", {
        userId: donaId, eventId, area: "tables", name: "Arranjo", order: 0, quantity: 10,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
        createdAt: NOW, updatedAt: NOW,
        receita: composicao.receita.map((c) => ({ ...c })), // é o que `aplicarComposicao` faz
      });
      return eventId;
    });
    const linhas = await t.run(async (ctx) => consolidado(ctx, novoEvento));
    expect(linhas.find((l) => l.nome === "Rosa branca")!.necessario).toBe(70); // 10 × 7
  });

  it("ARQUIVAR o material não apaga a linha da ficha de um evento executado", async () => {
    const { t, eventId, rosa } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(rosa, { archived: true }));
    const linhas = await t.run(async (ctx) => consolidado(ctx, eventId));
    expect(linhas.find((l) => l.nome === "Rosa branca")!.necessario).toBe(150);
  });

  it("RENOMEAR o material não reescreve o histórico do evento", async () => {
    const { t, eventId, rosa } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(rosa, { nome: "Rosa branca importada" }));
    const linhas = await t.run(async (ctx) => consolidado(ctx, eventId));
    // O snapshot guarda o nome de quando a ficha foi montada.
    expect(linhas.some((l) => l.nome === "Rosa branca")).toBe(true);
  });
});

describe("isolamento entre empresas", () => {
  it("o catálogo de uma empresa não enxerga o material da outra", async () => {
    const { t, donaId, rosaDaOutra } = await cenario();
    const meus = await t.run(async (ctx) =>
      ctx.db.query("materials").withIndex("by_user", (q) => q.eq("userId", donaId)).collect(),
    );
    expect(meus.map((m) => m._id)).not.toContain(rosaDaOutra);
  });

  it("duas empresas podem ter o MESMO material sem colidir", async () => {
    const { t, rosa, rosaDaOutra } = await cenario();
    const [a, b] = await t.run(async (ctx) => [await ctx.db.get(rosa), await ctx.db.get(rosaDaOutra)]);
    expect(a!.searchName).toBe(b!.searchName); // mesma chave...
    expect(a!.userId).not.toBe(b!.userId); // ...mas donos diferentes
  });

  it("a composição de uma empresa não aparece para a outra", async () => {
    const { t, outraId } = await cenario();
    const dela = await t.run(async (ctx) =>
      ctx.db.query("compositions").withIndex("by_user", (q) => q.eq("userId", outraId)).collect(),
    );
    expect(dela).toEqual([]);
  });
});

describe("deduplicação do catálogo", () => {
  it("'Rosa Branca' e 'rosa branca' na mesma unidade são o mesmo material", () => {
    expect(chaveDoMaterial("Rosa Branca", "haste")).toBe(chaveDoMaterial("  rosa   branca ", "haste"));
  });

  it("'Rosa Avalanche' NUNCA se funde com 'Rosa branca'", () => {
    expect(chaveDoMaterial("Rosa Avalanche", "haste")).not.toBe(chaveDoMaterial("Rosa branca", "haste"));
  });

  it("a mesma flor em unidades diferentes são materiais diferentes", () => {
    // Preços diferentes, e somá-las no consolidado seria mentira aritmética.
    expect(chaveDoMaterial("Rosa branca", "haste")).not.toBe(chaveDoMaterial("Rosa branca", "maco"));
  });

  it("sem nome não há identidade — cadastro próprio", () => {
    expect(chaveDoMaterial("", "haste")).toBeNull();
    expect(chaveDoMaterial("   ", "haste")).toBeNull();
  });
});

// ── FICHA → COMPRA ──────────────────────────────────────────────────────────

/** Espelho fiel de `gerarCompras`. */
async function gerarEspelho(
  ctx: MutationCtx,
  userId: Id<"users">,
  eventId: Id<"events">,
  materialIds?: Id<"materials">[],
) {
  const linhas = await consolidado(ctx, eventId);
  const compras = await ctx.db
    .query("purchaseItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const pedidos = materialIds?.length ? new Set(materialIds as string[]) : null;
  let ordem = compras.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  let criadas = 0, jaExistiam = 0, divergentes = 0;
  const ignoradas: string[] = [];

  for (const linha of linhas) {
    if (!linha.materialId) { ignoradas.push(linha.nome); continue; }
    if (pedidos && !pedidos.has(linha.materialId)) continue;
    if (!pedidos && !linha.normalmenteCompra) continue;
    const existente = compras.find(
      (c) => c.materialId === linha.materialId && (c.unit ?? "") === linha.unidade,
    );
    if (existente) {
      jaExistiam += 1;
      if (typeof existente.necessidadeTecnica === "number" &&
          Math.abs(existente.necessidadeTecnica - linha.necessario) > 0.001) divergentes += 1;
      continue;
    }
    await ctx.db.insert("purchaseItems", {
      userId, eventId, name: linha.nome, quantity: linha.necessario, unit: linha.unidade,
      isPurchased: false, status: "necessidade", order: ordem++,
      materialId: linha.materialId as Id<"materials">,
      necessidadeTecnica: linha.necessario, updatedAt: NOW,
    });
    criadas += 1;
  }
  return { criadas, jaExistiam, divergentes, ignoradas };
}

describe("ficha → compra", () => {
  it("gera a necessidade como compra, com a quantidade consolidada", async () => {
    const { t, donaId, eventId } = await cenario();
    const r = await t.run(async (ctx) => gerarEspelho(ctx, donaId, eventId));
    expect(r.criadas).toBe(1); // só a rosa: o vaso é acervo
    const compras = await t.run(async (ctx) =>
      ctx.db.query("purchaseItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    );
    expect(compras).toHaveLength(1);
    expect(compras[0]).toMatchObject({ name: "Rosa branca", quantity: 150, unit: "haste", necessidadeTecnica: 150 });
  });

  it("IDEMPOTENTE: rodar duas vezes não cria duas compras", async () => {
    const { t, donaId, eventId } = await cenario();
    await t.run(async (ctx) => gerarEspelho(ctx, donaId, eventId));
    const segunda = await t.run(async (ctx) => gerarEspelho(ctx, donaId, eventId));
    expect(segunda.criadas).toBe(0);
    expect(segunda.jaExistiam).toBe(1);
    const compras = await t.run(async (ctx) =>
      ctx.db.query("purchaseItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    );
    expect(compras).toHaveLength(1);
  });

  it("material do ACERVO não vira compra por padrão", async () => {
    const { t, donaId, eventId, vaso } = await cenario();
    await t.run(async (ctx) => gerarEspelho(ctx, donaId, eventId));
    const compras = await t.run(async (ctx) =>
      ctx.db.query("purchaseItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    );
    expect(compras.some((c) => c.materialId === vaso)).toBe(false);
  });

  it("mas PODE ser pedido explicitamente", async () => {
    const { t, donaId, eventId, vaso } = await cenario();
    const r = await t.run(async (ctx) => gerarEspelho(ctx, donaId, eventId, [vaso]));
    expect(r.criadas).toBe(1);
  });

  it("mudar a ficha depois NÃO reescreve a compra — só sinaliza", async () => {
    const { t, donaId, eventId, cerimoniaId } = await cenario();
    await t.run(async (ctx) => gerarEspelho(ctx, donaId, eventId));
    // A cerimônia passa de 10 para 22 arranjos: necessidade 150 → 210.
    await t.run(async (ctx) => ctx.db.patch(cerimoniaId, { quantity: 22 }));

    const r = await t.run(async (ctx) => gerarEspelho(ctx, donaId, eventId));
    expect(r.divergentes).toBe(1);
    const compra = await t.run(async (ctx) =>
      (await ctx.db.query("purchaseItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect())[0],
    );
    // A quantidade negociada continua intacta.
    expect(compra.quantity).toBe(150);
    expect(compra.necessidadeTecnica).toBe(150);
  });

  it("a cobertura mostra necessidade × comprado, sem forçar igualdade", async () => {
    const { t, donaId, eventId, rosa } = await cenario();
    await t.run(async (ctx) => {
      await ctx.db.insert("purchaseItems", {
        userId: donaId, eventId, name: "Rosa branca", quantity: 200, unit: "haste",
        isPurchased: false, order: 0, materialId: rosa, necessidadeTecnica: 150, updatedAt: NOW,
      });
    });
    const cobertura = await t.run(async (ctx) => {
      const linhas = await consolidado(ctx, eventId);
      const compras = await ctx.db
        .query("purchaseItems")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      const linha = linhas.find((l) => l.nome === "Rosa branca")!;
      return coberturaDaLinha(
        linha,
        compras.filter((c) => c.materialId === linha.materialId).map((c) => ({
          quantity: c.quantity,
          cancelada: effectivePurchaseStatus(c) === "cancelado",
          necessidadeTecnica: c.necessidadeTecnica,
        })),
      );
    });
    expect(cobertura.necessario).toBe(150);
    expect(cobertura.comprado).toBe(200);
    expect(cobertura.faltam).toBe(0);
    expect(cobertura.necessidadeMudou).toBe(false);
  });

  it("compra CANCELADA volta a deixar a necessidade descoberta", async () => {
    const { t, donaId, eventId, rosa } = await cenario();
    await t.run(async (ctx) =>
      ctx.db.insert("purchaseItems", {
        userId: donaId, eventId, name: "Rosa branca", quantity: 200, unit: "haste",
        isPurchased: false, order: 0, status: "cancelado", materialId: rosa, updatedAt: NOW,
      }),
    );
    const cobertura = await t.run(async (ctx) => {
      const linhas = await consolidado(ctx, eventId);
      const compras = await ctx.db
        .query("purchaseItems")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      const linha = linhas.find((l) => l.nome === "Rosa branca")!;
      return coberturaDaLinha(linha, compras.map((c) => ({
        quantity: c.quantity, cancelada: effectivePurchaseStatus(c) === "cancelado",
      })));
    });
    expect(cobertura.comprado).toBe(0);
    expect(cobertura.faltam).toBe(150);
  });

  it("linha SEM material do catálogo não gera compra — não haveria idempotência", async () => {
    const { t, donaId, eventId } = await cenario();
    await t.run(async (ctx) =>
      ctx.db.insert("assemblyItems", {
        userId: donaId, eventId, area: "bar", name: "Painel", order: 8, quantity: 2,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
        createdAt: NOW, updatedAt: NOW,
        receita: [{ nome: "Madeira crua", unidade: "m", quantidade: 3 }],
      }),
    );
    const r = await t.run(async (ctx) => gerarEspelho(ctx, donaId, eventId));
    expect(r.ignoradas).toContain("Madeira crua");
  });
});

describe("a fonte faz o que o espelho reproduz", () => {
  const FONTE = readFileSync("convex/fichaTecnica.ts", "utf-8");
  const corpo = (nome: string) => {
    const i = FONTE.indexOf(`export const ${nome} =`);
    expect(i, `${nome} não existe`).toBeGreaterThan(-1);
    return FONTE.slice(i, FONTE.indexOf("\nexport ", i + 1));
  };

  it("toda função confere o dono", () => {
    for (const fn of ["getFicha", "setReceita", "aplicarComposicao", "limparReceita", "gerarCompras"]) {
      expect(corpo(fn)).toMatch(/requireUser|requireEventOwner|getOwnedEvent/);
    }
  });

  it("`aplicarComposicao` COPIA a receita — nunca guarda referência", () => {
    const c = corpo("aplicarComposicao");
    expect(c).toContain("composicao.receita.map((c) => ({ ...c }))");
  });

  it("a leitura NÃO busca a receita pela composição — senão o snapshot morre", () => {
    expect(corpo("getFicha")).not.toContain('query("compositions")');
  });

  it("`gerarCompras` não reescreve compra existente", () => {
    const c = corpo("gerarCompras");
    expect(c).toContain("jaExistiam");
    expect(c).not.toMatch(/ctx\.db\.patch\([^)]*quantity/);
  });

  it("o cálculo não é refeito aqui — vem do módulo puro", () => {
    // `quantidade * quantidade` espalhado é como a tela e o PDF divergiriam.
    expect(FONTE).toContain("consolidarMateriais");
    expect(FONTE).not.toMatch(/quantity\s*\*\s*/);
  });

  it("a regra de escopo é a MESMA do Caderno de Montagem", () => {
    expect(FONTE).toContain("ehObrigacaoDeMontagem");
    const front = readFileSync("src/lib/decoration-project.ts", "utf-8");
    expect(front).toContain('from "@/convex/lib/escopoDoProjeto.ts"');
  });
});
