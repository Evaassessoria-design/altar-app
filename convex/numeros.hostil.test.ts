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

import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// NENHUMA MUTATION GRAVA UM NÚMERO IMPOSSÍVEL
//
// ── POR QUE A TELA NÃO BASTA ────────────────────────────────────────────────
// Toda `mutation` do Convex é função PÚBLICA. A conferência que o formulário
// faz protege quem usa o formulário — não protege o produto. E `v.number()`
// aceita `NaN` e `Infinity`: são números de ponto flutuante válidos, e o
// validador do Convex os grava sem reclamar.
//
// ── O ESTRAGO É SILENCIOSO E NÃO DIZ A ORIGEM ───────────────────────────────
// `NaN + qualquer coisa` é `NaN`. UM lead com orçamento `NaN` faz a coluna
// inteira do funil somar "R$ NaN"; um item de montagem com quantidade `NaN`
// atravessa o consolidado, a geração de compras e a folha de carregamento. Em
// nenhum dos casos a tela sabe dizer qual linha causou.
//
// ── OS TRÊS BURACOS REAIS QUE ESTE ARQUIVO FECHOU ───────────────────────────
//  1. `funil.convertToEvent` gravava em `events` pela PORTA LATERAL: a guarda
//     de orçamento vive em `events.create`, e a conversão não passa por lá;
//  2. `acervo.registrarContagem` transformava `NaN` em "contei ZERO" —
//     `quantidadeLimpa(NaN)` é 0 e `quantidadeFisicaValida(0)` é verdadeiro,
//     então o estoque da peça era ZERADO e o histórico registrava a contagem
//     como se alguém tivesse contado mesmo. Era o único que GRAVAVA o estrago;
//  3. `funil.createLead`/`updateLead` espalhavam `...args` direto no banco.
// ═════════════════════════════════════════════════════════════════════════════

/** Os três valores que `v.number()` aceita e nenhum negócio aceita. */
const IMPOSSIVEIS = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });
  const ids = await t.run(async (ctx: MutationCtx) => {
    const userId = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora"))
      .unique())!._id;
    const eventId = await ctx.db.insert("events", {
      userId, name: "Casamento", type: "wedding", date: "2026-12-05",
      location: "Fazenda", clientName: "Marina", status: "planning",
    });
    const itemId = await ctx.db.insert("assemblyItems", {
      userId, eventId, area: "cerimonia", name: "Arranjo baixo", quantity: 18,
      order: 0, includeInAssemblyReport: true, checkOnAssembly: false, visibility: "interno",
      createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z",
    });
    const pecaId = await ctx.db.insert("collectionItems", {
      userId, nome: "Vaso âmbar", searchName: "vaso ambar", unidade: "un",
      quantidadeTotal: 58, updatedAt: "2026-09-01T12:00:00.000Z",
    });
    return { userId, eventId, itemId, pecaId };
  });
  return { t, dona, ids };
}

describe("funil — o orçamento que envenena a coluna inteira", () => {
  it("createLead recusa orçamento impossível", async () => {
    const { dona } = await cenario();
    for (const budget of [...IMPOSSIVEIS, -1, 2_000_000_000]) {
      await expect(
        dona.mutation(api.funil.createLead, {
          clientName: "Teste", stage: "contact", budget,
        }),
        `budget ${String(budget)} passou`,
      ).rejects.toThrow(/Orçamento/i);
    }
  });

  it("e recusa um número de convidados impossível ou quebrado", async () => {
    const { dona } = await cenario();
    for (const guestCount of [...IMPOSSIVEIS, -3, 180.5]) {
      await expect(
        dona.mutation(api.funil.createLead, {
          clientName: "Teste", stage: "contact", guestCount,
        }),
        `guestCount ${String(guestCount)} passou`,
      ).rejects.toThrow(/Convidados/i);
    }
  });

  it("updateLead também — e o lead continua com o valor bom", async () => {
    const { t, dona } = await cenario();
    const id = await dona.mutation(api.funil.createLead, {
      clientName: "Marina", stage: "contact", budget: 186_500,
    });
    await expect(
      dona.mutation(api.funil.updateLead, { id, budget: Number.NaN }),
    ).rejects.toThrow(/Orçamento/i);
    expect((await t.run((ctx: MutationCtx) => ctx.db.get(id)))!.budget).toBe(186_500);
  });

  it("a soma da coluna continua sendo um número", async () => {
    // A prova do estrago: bastava UM lead podre para o total parar de existir.
    const { dona } = await cenario();
    await dona.mutation(api.funil.createLead, {
      clientName: "A", stage: "contact", budget: 100,
    });
    await dona.mutation(api.funil.createLead, {
      clientName: "B", stage: "contact", budget: 200,
    });
    const leads = await dona.query(api.funil.listLeads, {});
    const total = leads.reduce((s, l) => s + (l.budget ?? 0), 0);
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBe(300);
  });
});

describe("funil — a porta lateral da conversão", () => {
  it("convertToEvent não grava no evento o que `events.create` recusaria", async () => {
    // A guarda de orçamento vive em `events.create`. A conversão insere em
    // `events` DIRETO, sem passar por lá — era um caminho inteiro por fora.
    const { t, dona } = await cenario();
    const leadId = await dona.mutation(api.funil.createLead, {
      clientName: "Marina", stage: "contracted",
    });

    await expect(
      dona.mutation(api.funil.convertToEvent, {
        leadId,
        eventName: "Casamento Marina",
        eventDate: "2026-12-05",
        type: "wedding",
        location: "Fazenda",
        clientName: "Marina",
        budget: Number.NaN,
      }),
    ).rejects.toThrow(/Orçamento/i);

    // E nada foi criado pela metade.
    const eventos = await t.run(async (ctx: MutationCtx) =>
      (await ctx.db.query("events").collect()).filter((e) => e.name === "Casamento Marina"),
    );
    expect(eventos).toHaveLength(0);
  });
});

describe("acervo — a contagem que zerava a peça", () => {
  it("registrarContagem recusa o valor impossível em vez de contar zero", async () => {
    const { t, dona, ids } = await cenario();
    for (const quantidadeContada of IMPOSSIVEIS) {
      await expect(
        dona.mutation(api.acervo.registrarContagem, {
          collectionItemId: ids.pecaId, quantidadeContada,
        }),
        `contagem ${String(quantidadeContada)} passou`,
      ).rejects.toThrow(/quantidade contada/i);
    }
    // O estrago era GRAVADO: a peça ficava com zero e o histórico registrava a
    // contagem como se alguém tivesse contado mesmo.
    const peca = (await t.run((ctx: MutationCtx) => ctx.db.get(ids.pecaId)))!;
    expect(peca.quantidadeTotal).toBe(58);
    const historico = await t.run((ctx: MutationCtx) =>
      ctx.db.query("collectionAdjustments").collect(),
    );
    expect(historico).toHaveLength(0);
  });

  it("e a contagem de verdade continua funcionando, zero inclusive", async () => {
    const { t, dona, ids } = await cenario();
    await dona.mutation(api.acervo.registrarContagem, {
      collectionItemId: ids.pecaId, quantidadeContada: 0, motivo: "Sumiram todos",
    });
    expect(
      (await t.run((ctx: MutationCtx) => ctx.db.get(ids.pecaId)))!.quantidadeTotal,
    ).toBe(0);
  });

  it("o ajuste recusa com o recado certo — não com 'um ajuste de zero'", async () => {
    // `quantidadeLimpa(NaN)` é 0, então o ajuste caía na mensagem do zero e
    // mandava a decoradora procurar o problema no lugar errado.
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.acervo.ajustarEstoque, {
        collectionItemId: ids.pecaId, tipo: "perda", quantidade: Number.NaN,
      }),
    ).rejects.toThrow(/quantidade do ajuste/i);
  });
});

describe("montagem e carregamento — a quantidade que vira compra e papel", () => {
  it("assemblyItems.update recusa quantidade impossível", async () => {
    const { t, dona, ids } = await cenario();
    for (const quantity of [...IMPOSSIVEIS, -1]) {
      await expect(
        dona.mutation(api.assemblyItems.update, { id: ids.itemId, quantity }),
        `quantity ${String(quantity)} passou`,
      ).rejects.toThrow(/Quantidade/i);
    }
    expect((await t.run((ctx: MutationCtx) => ctx.db.get(ids.itemId)))!.quantity).toBe(18);
  });

  it("mas `null` continua LIMPANDO a quantidade", async () => {
    // A distinção entre "limpar" e "valor inválido" é a que o catálogo já
    // tinha perdido uma vez, apagando o custo de quem digitava "1.500,00".
    const { t, dona, ids } = await cenario();
    await dona.mutation(api.assemblyItems.update, { id: ids.itemId, quantity: null });
    expect(
      (await t.run((ctx: MutationCtx) => ctx.db.get(ids.itemId)))!.quantity,
    ).toBeUndefined();
  });

  it("o item de checklist recusa quantidade impossível", async () => {
    const { dona, ids } = await cenario();
    for (const quantity of [...IMPOSSIVEIS, -2]) {
      await expect(
        dona.mutation(api.briefing.addChecklistItem, {
          eventId: ids.eventId, phase: "pre", name: "Vasos", quantity,
        }),
        `quantity ${String(quantity)} passou`,
      ).rejects.toThrow(/Quantidade/i);
    }
  });
});
