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
import type { Id } from "./_generated/dataModel";

// ═════════════════════════════════════════════════════════════════════════════
// A BIBLIOTECA DE COMPOSIÇÕES ENCHE SEM ENCHER DE REPETIDO
//
// "Arranjo baixo clássico branco" é a mesma receita em quinze casamentos, e o
// jeito de ela chegar à biblioteca é `salvarNaBiblioteca`: a decoradora monta a
// ficha de um item e guarda para os próximos eventos. É o caminho certo —
// biblioteca que exige formulário em branco fica vazia para sempre.
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// A mutation fazia `insert`, sempre. Guardar "Arranjo baixo clássico" a partir
// de três eventos criava TRÊS entradas de mesmo nome, e o menu da ficha
// passava a oferecer três linhas idênticas — sem como escolher entre elas.
//
// Sobrescrever sozinha também não serve: dois arranjos diferentes com o mesmo
// apelido existem, e a biblioteca não tem lixeira. Por isso a colisão é
// RECUSADA, e quem pergunta é a tela.
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
    const donaId = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona"))
      .unique())!._id;
    const outraId = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|outra"))
      .unique())!._id;

    const rosa = await ctx.db.insert("materials", {
      userId: donaId, nome: "Rosa branca", searchName: "rosa branca",
      unidade: "haste", custoReferencia: 4.2, updatedAt: NOW,
    });
    const eventoA = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-12-12",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });
    const eventoB = await ctx.db.insert("events", {
      userId: donaId, name: "Ana & Pedro", type: "wedding", date: "2027-02-20",
      location: "Salão", clientName: "Ana", status: "confirmed",
    });
    const eventoDaOutra = await ctx.db.insert("events", {
      userId: outraId, name: "Da outra", type: "wedding", date: "2026-12-12",
      location: "L", clientName: "C", status: "confirmed",
    });

    const base = {
      userId: donaId, order: 0, includeInAssemblyReport: true,
      checkOnAssembly: true, visibility: "interno" as const, createdAt: NOW, updatedAt: NOW,
    };
    const itemA = await ctx.db.insert("assemblyItems", {
      ...base, eventId: eventoA, area: "tables", name: "Arranjo baixo", quantity: 20,
      receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5 }],
    });
    const itemB = await ctx.db.insert("assemblyItems", {
      ...base, eventId: eventoB, area: "tables", name: "arranjo  BAIXO", quantity: 12,
      receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 9 }],
    });
    const semReceita = await ctx.db.insert("assemblyItems", {
      ...base, eventId: eventoA, area: "lounge", name: "Lounge", quantity: 1,
    });
    const daOutra = await ctx.db.insert("assemblyItems", {
      ...base, userId: outraId, eventId: eventoDaOutra, area: "tables",
      name: "Arranjo da outra", quantity: 1,
      receita: [{ nome: "Flor qualquer", unidade: "haste", quantidade: 3 }],
    });

    return { donaId, outraId, itemA, itemB, semReceita, daOutra, rosa };
  });

  return { t, dona, outra, ...ids };
}

const biblioteca = (t: ReturnType<typeof convexTest>, userId: Id<"users">) =>
  t.run(async (ctx: MutationCtx) =>
    ctx.db.query("compositions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  );

describe("guardar a receita para os próximos eventos", () => {
  it("a primeira vez cria, e o item passa a apontar para ela", async () => {
    const { t, dona, itemA, donaId } = await cenario();
    const r = await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    expect(r.atualizada).toBe(false);

    const guardadas = await biblioteca(t, donaId);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].nome).toBe("Arranjo baixo");
    expect(guardadas[0].receita[0].quantidade).toBe(5);

    const item = await t.run(async (ctx: MutationCtx) => ctx.db.get(itemA));
    expect(item!.compositionId).toBe(guardadas[0]._id);
  });

  it("guardar DUAS vezes não cria a gêmea — e a segunda é recusada", async () => {
    const { t, dona, itemA, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    await expect(
      dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA }),
    ).rejects.toThrow(/já existe/i);
    expect(await biblioteca(t, donaId)).toHaveLength(1);
  });

  it("o recado diz QUAL nome colidiu — senão a tela não tem o que perguntar", async () => {
    const { dona, itemA } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    await expect(
      dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA }),
    ).rejects.toThrow(/Arranjo baixo/);
  });

  it("nome diferente só na grafia continua sendo o mesmo nome", async () => {
    // "arranjo  BAIXO" e "Arranjo baixo" são a mesma coisa para quem lê o
    // menu. A mesma regra estreita do catálogo de materiais.
    const { t, dona, itemA, itemB, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    await expect(
      dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemB }),
    ).rejects.toThrow(/já existe/i);
    expect(await biblioteca(t, donaId)).toHaveLength(1);
  });

  it("autorizada, a substituição atualiza a receita — e não cria outra", async () => {
    const { t, dona, itemA, itemB, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const r = await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, {
      id: itemB,
      substituirExistente: true,
    });
    expect(r.atualizada).toBe(true);

    const guardadas = await biblioteca(t, donaId);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].receita[0].quantidade).toBe(9);
    // O nome passa a ser o do item que substituiu — é o que ela acabou de ver.
    expect(guardadas[0].nome).toBe("arranjo  BAIXO");
  });

  it("substituir NÃO mexe no evento que já usava a receita antiga", async () => {
    // A regra do snapshot, que é o que protege histórico: o item A continua
    // com 5 rosas por unidade mesmo depois de a biblioteca virar 9.
    const { t, dona, itemA, itemB } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, {
      id: itemB, substituirExistente: true,
    });
    const item = await t.run(async (ctx: MutationCtx) => ctx.db.get(itemA));
    expect(item!.receita![0].quantidade).toBe(5);
  });

  it("um nome explícito vale mais que o nome do item", async () => {
    const { t, dona, itemA, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, {
      id: itemA, nome: "  Arranjo mesa família  ",
    });
    const [guardada] = await biblioteca(t, donaId);
    expect(guardada.nome).toBe("Arranjo mesa família");
  });

  it("a composição arquivada de mesmo nome também colide", async () => {
    // Deixar passar criaria uma segunda entrada com o nome da que está
    // guardada — e reativar a antiga traria a confusão de volta.
    const { t, dona, itemA, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    await t.run(async (ctx: MutationCtx) => {
      const [c] = await ctx.db
        .query("compositions")
        .withIndex("by_user", (q) => q.eq("userId", donaId))
        .collect();
      await ctx.db.patch(c._id, { archived: true });
    });
    await expect(
      dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA }),
    ).rejects.toThrow(/já existe/i);
  });

  it("substituir uma arquivada a traz de volta — senão a tela some com o que ela salvou", async () => {
    const { t, dona, itemA, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    await t.run(async (ctx: MutationCtx) => {
      const [c] = await ctx.db
        .query("compositions")
        .withIndex("by_user", (q) => q.eq("userId", donaId))
        .collect();
      await ctx.db.patch(c._id, { archived: true });
    });
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, {
      id: itemA, substituirExistente: true,
    });
    const [c] = await biblioteca(t, donaId);
    expect(c.archived).toBeUndefined();
  });
});

describe("o que a biblioteca recusa", () => {
  it("item sem ficha técnica não vira composição vazia", async () => {
    const { dona, semReceita } = await cenario();
    await expect(
      dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: semReceita }),
    ).rejects.toThrow(/ainda não tem ficha/i);
  });

  it("item de OUTRA empresa responde NOT_FOUND — não 'sem permissão'", async () => {
    // Confirmar a existência de um id alheio já é vazamento.
    const { dona, daOutra } = await cenario();
    await expect(
      dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: daOutra }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("o nome de outra empresa NÃO colide com o meu", async () => {
    // A busca é por (userId, searchName). Se fosse só pelo nome, a biblioteca
    // de uma decoradora impediria a outra de guardar a dela.
    const { t, dona, outra, itemA, daOutra, donaId, outraId } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.patch(daOutra, { name: "Arranjo baixo" });
    });
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    await outra.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: daOutra });
    expect(await biblioteca(t, donaId)).toHaveLength(1);
    expect(await biblioteca(t, outraId)).toHaveLength(1);
  });

  it("sem sessão, ninguém guarda nada", async () => {
    const { t, itemA } = await cenario();
    await expect(
      t.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA }),
    ).rejects.toThrow();
  });
});

describe("o que a biblioteca copia", () => {
  it("a receita é CÓPIA — editar o item depois não muda a biblioteca", async () => {
    const { t, dona, itemA, donaId, rosa } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.patch(itemA, {
        receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 99 }],
      });
    });
    const [guardada] = await biblioteca(t, donaId);
    expect(guardada.receita[0].quantidade).toBe(5);
  });
});
