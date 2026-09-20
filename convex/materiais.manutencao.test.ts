import { describe, expect, it, vi } from "vitest";

// Sessão real, componente Better Auth substituído — ver convex/test.auth.ts.
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
import type { Id } from "./_generated/dataModel";

// ═════════════════════════════════════════════════════════════════════════════
// CORRIGIR O CATÁLOGO SEM REESCREVER O PASSADO
//
// `materials.update` e `setArchived` existiam, testadas no servidor, e nenhuma
// tela as chamava: um "Rosa brnaca" digitado errado dentro de uma receita ficava
// para sempre, e o catálogo só crescia.
//
// Agora há caminho na interface — e com ele vem o risco que estes testes
// prendem: a correção NÃO pode vazar para trás. A receita guarda um SNAPSHOT
// (nome, unidade, tipo, categoria, custo, margem copiados no momento da linha).
// É esse snapshot que impede um evento executado em junho de mudar porque
// alguém renomeou uma flor em setembro.
//
// Se um dia `update` passar a alcançar as receitas, a decoradora abre um evento
// já entregue e encontra outros números — sem ter tocado nele.
// ═════════════════════════════════════════════════════════════════════════════

const NOW = "2026-09-20T12:00:00.000Z";

async function cenario() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const donaId = await ctx.db.insert("users", {
      name: "Dona",
      email: "dona@ex.com",
      role: "user",
      subscriptionStatus: "active",
      betterAuthId: "auth|dona",
    });
    const outraId = await ctx.db.insert("users", {
      name: "Outra",
      email: "outra@ex.com",
      role: "user",
      subscriptionStatus: "active",
      betterAuthId: "auth|outra",
    });

    const rosa = await ctx.db.insert("materials", {
      userId: donaId,
      nome: "Rosa brnaca",
      searchName: "rosa brnaca",
      unidade: "haste",
      categoria: "Flores",
      tipo: "consumivel",
      custoReferencia: 4.2,
      margemPercentual: 10,
      updatedAt: NOW,
    });

    const daOutra = await ctx.db.insert("materials", {
      userId: outraId,
      nome: "Rosa da outra",
      searchName: "rosa da outra",
      unidade: "haste",
      updatedAt: NOW,
    });

    const eventId = await ctx.db.insert("events", {
      userId: donaId,
      name: "Evento já entregue",
      type: "wedding",
      date: "2026-06-01",
      location: "Fazenda",
      clientName: "Marina",
      status: "completed",
    });

    // O snapshot como ele foi congelado em junho — com o nome errado e tudo.
    const itemId = await ctx.db.insert("assemblyItems", {
      userId: donaId,
      eventId,
      area: "tables",
      order: 0,
      name: "Arranjo baixo",
      quantity: 20,
      includeInAssemblyReport: true,
      checkOnAssembly: true,
      visibility: "equipe",
      createdAt: NOW,
      updatedAt: NOW,
      receita: [
        {
          materialId: rosa,
          nome: "Rosa brnaca",
          unidade: "haste",
          quantidade: 5,
          tipo: "consumivel",
          categoria: "Flores",
          custoReferencia: 4.2,
          margemPercentual: 10,
        },
      ],
    });

    return { donaId, outraId, rosa, daOutra, eventId, itemId };
  });

  const dona = t.withIdentity({
    subject: "auth|dona",
    tokenIdentifier: "auth|dona",
    email: "dona@ex.com",
  });
  const outra = t.withIdentity({
    subject: "auth|outra",
    tokenIdentifier: "auth|outra",
    email: "outra@ex.com",
  });

  return { t, dona, outra, ...ids };
}

/** A receita congelada do evento já entregue. */
async function receitaDoEvento(
  t: Awaited<ReturnType<typeof cenario>>["t"],
  itemId: Id<"assemblyItems">,
) {
  return t.run(async (ctx) => (await ctx.db.get(itemId))!.receita);
}

describe("corrigir o material não reescreve o evento antigo", () => {
  it("renomear conserta o catálogo e NÃO toca na receita congelada", async () => {
    const { t, dona, rosa, itemId } = await cenario();

    await dona.mutation(api.materials.update, { id: rosa, nome: "Rosa branca" });

    const catalogo = await t.run(async (ctx) => (await ctx.db.get(rosa))!);
    expect(catalogo.nome).toBe("Rosa branca");

    // O evento de junho continua exatamente como foi entregue.
    const receita = await receitaDoEvento(t, itemId);
    expect(receita![0].nome).toBe("Rosa brnaca");
  });

  it("mudar custo e margem não muda o custo daquele evento", async () => {
    // O pior caso: a conta de um evento fechado mudaria de valor sozinha.
    const { t, dona, rosa, itemId } = await cenario();

    await dona.mutation(api.materials.update, {
      id: rosa,
      custoReferencia: 99,
      margemPercentual: 50,
    });

    const receita = await receitaDoEvento(t, itemId);
    expect(receita![0].custoReferencia).toBe(4.2);
    expect(receita![0].margemPercentual).toBe(10);
  });

  it("arquivar não apaga nem esvazia a receita que cita o material", async () => {
    const { t, dona, rosa, itemId } = await cenario();

    await dona.mutation(api.materials.setArchived, { id: rosa, archived: true });

    const receita = await receitaDoEvento(t, itemId);
    expect(receita).toHaveLength(1);
    expect(receita![0].nome).toBe("Rosa brnaca");

    // E o material continua existindo — arquivar não é apagar.
    expect(await t.run(async (ctx) => ctx.db.get(rosa))).not.toBeNull();
  });

  it("arquivado some da escolha; reativado volta", async () => {
    const { dona, rosa } = await cenario();

    await dona.mutation(api.materials.setArchived, { id: rosa, archived: true });
    expect((await dona.query(api.materials.list, {})).map((m) => m._id)).not.toContain(rosa);

    await dona.mutation(api.materials.setArchived, { id: rosa, archived: false });
    expect((await dona.query(api.materials.list, {})).map((m) => m._id)).toContain(rosa);
  });
});

describe("o material é de quem o cadastrou", () => {
  it("editar material de outra conta responde NOT_FOUND", async () => {
    // Id vindo do navegador não é prova de posse. E a resposta é NOT_FOUND, não
    // FORBIDDEN: não se confirma nem que o material existe.
    const { outra, rosa } = await cenario();

    await expect(
      outra.mutation(api.materials.update, { id: rosa, nome: "Sequestrada" }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("arquivar material de outra conta responde NOT_FOUND", async () => {
    const { outra, rosa } = await cenario();
    await expect(
      outra.mutation(api.materials.setArchived, { id: rosa, archived: true }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("o material continua intacto depois da tentativa", async () => {
    const { t, outra, rosa } = await cenario();
    await expect(
      outra.mutation(api.materials.update, { id: rosa, nome: "Sequestrada" }),
    ).rejects.toThrow();

    const depois = await t.run(async (ctx) => (await ctx.db.get(rosa))!);
    expect(depois.nome).toBe("Rosa brnaca");
    expect(depois.archived).toBeUndefined();
  });

  it("sem sessão não edita nada", async () => {
    const { t, rosa } = await cenario();
    await expect(t.mutation(api.materials.update, { id: rosa, nome: "X" })).rejects.toThrow();
  });

  it("a lista de uma conta nunca traz material da outra", async () => {
    const { dona, outra, daOutra, rosa } = await cenario();
    expect((await dona.query(api.materials.list, {})).map((m) => m._id)).not.toContain(daOutra);
    expect((await outra.query(api.materials.list, {})).map((m) => m._id)).not.toContain(rosa);
  });
});

describe("ausente, null e zero são três coisas diferentes", () => {
  it("campo ausente não é tocado", async () => {
    const { t, dona, rosa } = await cenario();
    await dona.mutation(api.materials.update, { id: rosa, nome: "Rosa branca" });

    const depois = await t.run(async (ctx) => (await ctx.db.get(rosa))!);
    expect(depois.categoria).toBe("Flores");
    expect(depois.custoReferencia).toBe(4.2);
    expect(depois.margemPercentual).toBe(10);
  });

  it("null LIMPA o campo", async () => {
    const { t, dona, rosa } = await cenario();
    await dona.mutation(api.materials.update, {
      id: rosa,
      categoria: null,
      custoReferencia: null,
      margemPercentual: null,
    });

    const depois = await t.run(async (ctx) => (await ctx.db.get(rosa))!);
    expect(depois.categoria).toBeUndefined();
    expect(depois.custoReferencia).toBeUndefined();
    expect(depois.margemPercentual).toBeUndefined();
  });

  it("zero é margem CONFIGURADA valendo zero, não ausência", async () => {
    // A distinção existe porque "sem margem" e "margem de 0%" produzem o mesmo
    // número e significam coisas diferentes na hora de revisar a compra.
    const { t, dona, rosa } = await cenario();
    await dona.mutation(api.materials.update, { id: rosa, margemPercentual: 0 });

    const depois = await t.run(async (ctx) => (await ctx.db.get(rosa))!);
    expect(depois.margemPercentual).toBe(0);
  });
});

describe("o que a edição se recusa a gravar", () => {
  it("custo negativo", async () => {
    const { dona, rosa } = await cenario();
    await expect(
      dona.mutation(api.materials.update, { id: rosa, custoReferencia: -1 }),
    ).rejects.toThrow(/negativ/i);
  });

  it("margem acima do teto de sanidade", async () => {
    // 100% já é "compre o dobro"; acima disso é erro de digitação.
    const { dona, rosa } = await cenario();
    await expect(
      dona.mutation(api.materials.update, { id: rosa, margemPercentual: 500 }),
    ).rejects.toThrow();
  });

  it("renomear reescreve a chave de busca junto", async () => {
    // Sem isso o material some da busca e a próxima criação abriria um
    // DUPLICADO com o nome novo — exatamente o problema que a edição veio
    // resolver.
    const { t, dona, rosa } = await cenario();
    await dona.mutation(api.materials.update, { id: rosa, nome: "  Rosa Branca  " });

    const depois = await t.run(async (ctx) => (await ctx.db.get(rosa))!);
    expect(depois.nome).toBe("Rosa Branca");
    expect(depois.searchName).toBe("rosa branca");
  });
});
