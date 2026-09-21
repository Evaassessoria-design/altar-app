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

// ═════════════════════════════════════ ONDE ESTA RECEITA JÁ FOI USADA

describe("a procedência de uma receita da biblioteca", () => {
  it("lista os eventos que a aplicaram, do mais recente para o mais antigo", async () => {
    const { t, dona, itemA, itemB, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [composicao] = await biblioteca(t, donaId);
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.patch(itemB, { compositionId: composicao._id });
    });

    const r = await dona.query(api.compositions.ondeEUsada, { id: composicao._id });
    expect(r!.eventos.map((e) => e.nome)).toEqual(["Ana & Pedro", "Marina & Gabriel"]);
    expect(r!.eventos[1].itens).toEqual(["Arranjo baixo"]);
    expect(r!.temMais).toBe(false);
    expect(r!.materiais).toBe(1);
  });

  it("receita guardada e ainda não aplicada não inventa uso", async () => {
    // O item que a ORIGINOU aponta para ela — e isso é um uso de verdade.
    // O que não pode é a lista trazer evento que nunca a aplicou.
    const { t, dona, itemA, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [composicao] = await biblioteca(t, donaId);
    const r = await dona.query(api.compositions.ondeEUsada, { id: composicao._id });
    expect(r!.eventos).toHaveLength(1);
    expect(r!.eventos[0].nome).toBe("Marina & Gabriel");
  });

  it("dois itens do MESMO evento aparecem numa linha só", async () => {
    const { t, dona, itemA, donaId, rosa } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [composicao] = await biblioteca(t, donaId);
    await t.run(async (ctx: MutationCtx) => {
      const item = (await ctx.db.get(itemA))!;
      await ctx.db.insert("assemblyItems", {
        userId: item.userId, eventId: item.eventId, area: "ceremony", order: 9,
        name: "Arranjo do altar", quantity: 2, compositionId: composicao._id,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "interno",
        createdAt: NOW, updatedAt: NOW,
        receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5 }],
      });
    });
    const r = await dona.query(api.compositions.ondeEUsada, { id: composicao._id });
    expect(r!.eventos).toHaveLength(1);
    expect(r!.eventos[0].itens).toEqual(["Arranjo baixo", "Arranjo do altar"]);
  });

  it("acima do limite a resposta AVISA que há mais — não mente um total", async () => {
    const { t, dona, itemA, donaId, rosa } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [composicao] = await biblioteca(t, donaId);
    await t.run(async (ctx: MutationCtx) => {
      const item = (await ctx.db.get(itemA))!;
      for (let i = 0; i < 30; i++) {
        const eventId = await ctx.db.insert("events", {
          userId: item.userId, name: `Evento ${i}`, type: "wedding",
          date: `2027-0${(i % 9) + 1}-10`, location: "L", clientName: "C", status: "confirmed",
        });
        await ctx.db.insert("assemblyItems", {
          userId: item.userId, eventId, area: "tables", order: i, name: "Arranjo baixo",
          quantity: 1, compositionId: composicao._id, includeInAssemblyReport: true,
          checkOnAssembly: true, visibility: "interno", createdAt: NOW, updatedAt: NOW,
          receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5 }],
        });
      }
    });
    const r = await dona.query(api.compositions.ondeEUsada, { id: composicao._id });
    expect(r!.temMais).toBe(true);
    expect(r!.eventos.length).toBeLessThanOrEqual(25);
  });

  it("a composição de outra empresa responde como inexistente", async () => {
    // Confirmar que o id existe já contaria algo sobre a biblioteca alheia.
    const { t, dona, outra, daOutra, outraId } = await cenario();
    await outra.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: daOutra });
    const [alheia] = await biblioteca(t, outraId);
    expect(await dona.query(api.compositions.ondeEUsada, { id: alheia._id })).toBeNull();
  });

  it("arquivar a receita NÃO muda o item de montagem que a usou", async () => {
    // A regra do snapshot, do lado da manutenção: a biblioteca some do menu e
    // o evento continua montável.
    const { t, dona, itemA, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [composicao] = await biblioteca(t, donaId);
    await dona.mutation(api.compositions.setArchived, { id: composicao._id, archived: true });
    const item = await t.run(async (ctx: MutationCtx) => ctx.db.get(itemA));
    expect(item!.receita![0].quantidade).toBe(5);
    expect(item!.compositionId).toBe(composicao._id);
  });

  it("renomear na biblioteca NÃO renomeia o item do evento", async () => {
    const { t, dona, itemA, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [composicao] = await biblioteca(t, donaId);
    await dona.mutation(api.compositions.update, { id: composicao._id, nome: "Arranjo mesa baixa" });
    const item = await t.run(async (ctx: MutationCtx) => ctx.db.get(itemA));
    expect(item!.name).toBe("Arranjo baixo");
  });

  it("e a busca acompanha o nome novo — senão a colisão deixa de funcionar", async () => {
    const { t, dona, itemA, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [composicao] = await biblioteca(t, donaId);
    await dona.mutation(api.compositions.update, { id: composicao._id, nome: "Arranjo mesa baixa" });
    // Com o searchName parado no nome antigo, guardar "Arranjo baixo" de novo
    // colidiria com uma entrada que já não se chama assim.
    const r = await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    expect(r.atualizada).toBe(false);
    expect(await biblioteca(t, donaId)).toHaveLength(2);
  });
});

// ═════════════════════════════════════ ID DE OUTRA EMPRESA NÃO ABRE NADA

describe("a manutenção da biblioteca é só da dona", () => {
  it("renomear a composição de outra empresa responde NOT_FOUND", async () => {
    const { t, dona, outra, daOutra, outraId } = await cenario();
    await outra.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: daOutra });
    const [alheia] = await biblioteca(t, outraId);
    await expect(
      dona.mutation(api.compositions.update, { id: alheia._id, nome: "Minha agora" }),
    ).rejects.toThrow(/não encontrada/i);
    const [depois] = await biblioteca(t, outraId);
    expect(depois.nome).toBe("Arranjo da outra");
  });

  it("arquivar a composição de outra empresa responde NOT_FOUND", async () => {
    const { t, dona, outra, daOutra, outraId } = await cenario();
    await outra.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: daOutra });
    const [alheia] = await biblioteca(t, outraId);
    await expect(
      dona.mutation(api.compositions.setArchived, { id: alheia._id, archived: true }),
    ).rejects.toThrow(/não encontrada/i);
    const [depois] = await biblioteca(t, outraId);
    expect(depois.archived).toBeUndefined();
  });

  it("substituir não alcança a composição de outra empresa pelo nome igual", async () => {
    // As duas chamam a receita de "Arranjo baixo". A busca é por
    // (userId, searchName): se fosse só pelo nome, autorizar a substituição
    // escreveria por cima da biblioteca alheia.
    const { t, dona, outra, itemA, daOutra, donaId, outraId } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.patch(daOutra, { name: "Arranjo baixo" });
    });
    await outra.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: daOutra });
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, {
      id: itemA, substituirExistente: true,
    });
    expect(await biblioteca(t, donaId)).toHaveLength(1);
    const [alheia] = await biblioteca(t, outraId);
    expect(alheia.receita[0].nome).toBe("Flor qualquer");
  });

  it("`ondeEUsada` não devolve evento de outra empresa nem que o vínculo aponte para lá", async () => {
    // Vínculo cruzado só nasce de dado corrompido — e é exatamente quando a
    // conferência de dono precisa estar lá.
    const { t, dona, itemA, daOutra, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [minha] = await biblioteca(t, donaId);
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.patch(daOutra, { compositionId: minha._id });
    });
    const r = await dona.query(api.compositions.ondeEUsada, { id: minha._id });
    expect(r!.eventos.map((e) => e.nome)).toEqual(["Marina & Gabriel"]);
  });
});

// ═════════════════════════════════════ ONDE ESTE MATERIAL É USADO

describe("o material sabe dizer onde aparece", () => {
  it("lista as composições da biblioteca que o citam, com a quantidade", async () => {
    // "Se eu arquivar a Rosa, o que eu quebro?" Sem resposta, arquivar vira
    // aposta — e o catálogo só cresce, porque ninguém mexe no que não entende.
    const { t, dona, itemA, donaId, rosa } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [composicao] = await biblioteca(t, donaId);

    const r = await dona.query(api.materials.ondeEUsado, { id: rosa });
    expect(r!.nome).toBe("Rosa branca");
    expect(r!.composicoes).toHaveLength(1);
    expect(r!.composicoes[0]._id).toBe(composicao._id);
    expect(r!.composicoes[0].quantidade).toBe(5);
    expect(r!.temMais).toBe(false);
  });

  it("material que nenhuma receita cita devolve lista vazia, não erro", async () => {
    const { t, dona, donaId } = await cenario();
    const solto = await t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("materials", {
        userId: donaId, nome: "Fita de cetim", searchName: "fita de cetim",
        unidade: "m", updatedAt: NOW,
      }),
    );
    const r = await dona.query(api.materials.ondeEUsado, { id: solto });
    expect(r!.composicoes).toEqual([]);
  });

  it("soma quando a MESMA composição usa o material em duas linhas", async () => {
    const { t, dona, donaId, rosa } = await cenario();
    const composicao = await t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("compositions", {
        userId: donaId, nome: "Arranjo duplo", searchName: "arranjo duplo",
        receita: [
          { materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 5 },
          { materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 3 },
        ],
        updatedAt: NOW,
      }),
    );
    const r = await dona.query(api.materials.ondeEUsado, { id: rosa });
    expect(r!.composicoes.find((c) => c._id === composicao)!.quantidade).toBe(8);
  });

  it("a composição arquivada aparece, marcada — ela volta se for reativada", async () => {
    const { t, dona, itemA, donaId, rosa } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    const [composicao] = await biblioteca(t, donaId);
    await dona.mutation(api.compositions.setArchived, { id: composicao._id, archived: true });

    const r = await dona.query(api.materials.ondeEUsado, { id: rosa });
    expect(r!.composicoes).toHaveLength(1);
    expect(r!.composicoes[0].archived).toBe(true);
  });

  it("material de OUTRA empresa responde como inexistente", async () => {
    const { t, dona, outraId } = await cenario();
    const alheio = await t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("materials", {
        userId: outraId, nome: "Rosa alheia", searchName: "rosa alheia",
        unidade: "haste", updatedAt: NOW,
      }),
    );
    expect(await dona.query(api.materials.ondeEUsado, { id: alheio })).toBeNull();
  });

  it("não enxerga a biblioteca da outra empresa nem com o mesmo material", async () => {
    // A varredura é por índice de DONO. Se fosse por materialId solto, a
    // composição alheia que cita um id qualquer entraria na resposta.
    const { t, dona, outra, daOutra, rosa, itemA, donaId } = await cenario();
    await dona.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: itemA });
    await outra.mutation(api.fichaTecnica.salvarNaBiblioteca, { id: daOutra });
    await t.run(async (ctx: MutationCtx) => {
      const itemAlheio = (await ctx.db.get(daOutra))!;
      const alheias = await ctx.db
        .query("compositions")
        .withIndex("by_user", (q) => q.eq("userId", itemAlheio.userId))
        .collect();
      // Força o vínculo cruzado, que só nasceria de dado corrompido.
      await ctx.db.patch(alheias[0]._id, {
        receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste", quantidade: 1 }],
      });
    });

    const r = await dona.query(api.materials.ondeEUsado, { id: rosa });
    expect(r!.composicoes).toHaveLength(1);
    expect(r!.composicoes[0].nome).toBe("Arranjo baixo");
  });

  it("sem sessão, ninguém pergunta", async () => {
    const { t, rosa } = await cenario();
    await expect(t.query(api.materials.ondeEUsado, { id: rosa })).rejects.toThrow();
  });
});
