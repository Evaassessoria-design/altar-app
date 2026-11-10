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
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { LIMITES, type DadosDoLayout } from "./lib/layoutSalao";

// ═════════════════════════════════════════════════════════════════════════════
// LAYOUT DO SALÃO — as travas que importam
//
//   · layout de outra conta não existe (ler, salvar, duplicar, apagar);
//   · a foto de referência é minha E deste evento — duas festas da mesma
//     decoradora não trocam referência entre si;
//   · copiar para outro evento deixa as fotos para trás;
//   · número absurdo, mesa fora do salão e lista sem teto são recusados no
//     servidor, não só na tela;
//   · apagar o layout não apaga a foto da Galeria.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = "2026-11-10T12:00:00.000Z";

function layoutBase(extra: Partial<DadosDoLayout> = {}): DadosDoLayout {
  return {
    salao: { largura: 26.9, comprimento: 28.4, peDireito: 3.95, cortina: true },
    aberturas: [{ id: "ab1", parede: "esquerda", inicio: 23.6, fim: 26.4, rotulo: "ENTRADA", tipo: "entrada" }],
    pilares: [{ id: "p1", cx: 13.45, cy: 14.75, lado: 0.5 }],
    elementos: [
      { id: "palco", forma: "retangulo", categoria: "palco", rotulo: "PALCO", cx: 13.45, cy: 2.56, largura: 10.84, profundidade: 5.13 },
      { id: "bar", forma: "oval", categoria: "bar", rotulo: "BAR", cx: 13.45, cy: 14.75, largura: 5.6, profundidade: 3 },
    ],
    mesas: { diametro: 1.8, lugares: 10, posicoes: [{ id: "m1", cx: 4.3, cy: 26.4 }, { id: "m2", cx: 7.7, cy: 26.4 }] },
    ...extra,
  };
}

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora" });
  const rival = await autenticarComo(t, { nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival" });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (s: string) =>
      (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", s)).unique())!._id;
    const donaId = await idDe("auth|aurora");
    const rivalId = await idDe("auth|rival");
    const evento = (userId: Id<"users">, name: string) =>
      ctx.db.insert("events", {
        userId, name, type: "wedding", date: "2026-12-05", location: "Salão", clientName: "Cliente", status: "planning",
      });
    const festa = await evento(donaId, "Rafaela & Guilherme");
    // MESMA dona, outro evento — o caso que a checagem de posse sozinha não pega.
    const quinze = await evento(donaId, "15 anos da Helena");
    const alheio = await evento(rivalId, "Evento da rival");
    const storage = (ctx as unknown as { storage: { store: (b: Blob) => Promise<Id<"_storage">> } }).storage;
    const foto = async (userId: Id<"users">, eventId: Id<"events">, nome: string) =>
      ctx.db.insert("eventPhotos", {
        userId, eventId, storageId: await storage.store(new Blob(["x"])),
        filename: nome, category: "antes", order: 0, uploadedAt: AGORA,
      });
    return {
      festa, quinze, alheio,
      fotoDaFesta: await foto(donaId, festa, "bar.jpg"),
      fotoDoQuinze: await foto(donaId, quinze, "bar-15.jpg"),
      fotoAlheia: await foto(rivalId, alheio, "da-rival.jpg"),
    };
  });

  return { t, dona, rival, ids };
}

const comFoto = (fotoId: Id<"eventPhotos">): DadosDoLayout => {
  const d = layoutBase();
  d.elementos[1] = { ...d.elementos[1], fotoId };
  return d;
};

describe("posse do layout", () => {
  it("a dona cria, lê e lista; a rival não enxerga nada", async () => {
    const { dona, rival, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "Opção A", dados: layoutBase(), origem: "em_branco",
    });

    const lido = await dona.query(api.layoutSalao.obter, { layoutId: id });
    expect(lido?.nome).toBe("Opção A");
    expect(await dona.query(api.layoutSalao.listarDoEvento, { eventId: ids.festa })).toHaveLength(1);

    expect(await rival.query(api.layoutSalao.obter, { layoutId: id })).toBeNull();
    expect(await rival.query(api.layoutSalao.listarDoEvento, { eventId: ids.festa })).toEqual([]);
    expect((await rival.query(api.layoutSalao.listarParaReaproveitar, {})).itens).toEqual([]);
  });

  it("a rival não salva, não duplica e não apaga o layout alheio — NOT_FOUND", async () => {
    const { dona, rival, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: layoutBase(), origem: "em_branco",
    });
    await expect(rival.mutation(api.layoutSalao.salvar, { layoutId: id, nome: "x", dados: layoutBase() }))
      .rejects.toThrow(/NOT_FOUND|não encontrado/);
    await expect(rival.mutation(api.layoutSalao.duplicar, { layoutId: id, eventIdDestino: ids.alheio }))
      .rejects.toThrow(/NOT_FOUND|não encontrado/);
    await expect(rival.mutation(api.layoutSalao.remover, { layoutId: id }))
      .rejects.toThrow(/NOT_FOUND|não encontrado/);
    expect((await dona.query(api.layoutSalao.obter, { layoutId: id }))?.nome).toBe("A");
  });

  it("ninguém cria layout em evento de outra conta", async () => {
    const { rival, ids } = await cenario();
    await expect(rival.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "invasão", dados: layoutBase(), origem: "em_branco",
    })).rejects.toThrow(/NOT_FOUND|não encontrado/);
  });

  it("a dona não duplica o próprio layout para dentro do evento da rival", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: layoutBase(), origem: "em_branco",
    });
    await expect(dona.mutation(api.layoutSalao.duplicar, { layoutId: id, eventIdDestino: ids.alheio }))
      .rejects.toThrow(/NOT_FOUND|não encontrado/);
  });
});

describe("foto de referência: minha e deste evento", () => {
  it("aceita foto da Galeria do próprio evento e devolve a URL", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: comFoto(ids.fotoDaFesta), origem: "em_branco",
    });
    const lido = await dona.query(api.layoutSalao.obter, { layoutId: id });
    expect(Object.keys(lido!.fotos)).toEqual([ids.fotoDaFesta]);
  });

  it("recusa foto de OUTRO evento da mesma dona", async () => {
    const { dona, ids } = await cenario();
    await expect(dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: comFoto(ids.fotoDoQuinze), origem: "em_branco",
    })).rejects.toThrow(/NOT_FOUND|não encontrada/);
  });

  it("recusa foto de outra conta — também ao salvar", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: layoutBase(), origem: "em_branco",
    });
    await expect(dona.mutation(api.layoutSalao.salvar, { layoutId: id, nome: "A", dados: comFoto(ids.fotoAlheia) }))
      .rejects.toThrow(/NOT_FOUND|não encontrada/);
  });

  it("copiar para outro evento deixa as fotos para trás", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: comFoto(ids.fotoDaFesta), origem: "em_branco",
    });
    const copia = await dona.mutation(api.layoutSalao.duplicar, { layoutId: id, eventIdDestino: ids.quinze });
    const lida = await dona.query(api.layoutSalao.obter, { layoutId: copia });
    expect(lida!.eventId).toBe(ids.quinze);
    expect(lida!.dados.elementos.every((e) => e.fotoId === undefined)).toBe(true);
    expect(lida!.fotos).toEqual({});
  });

  it("nova opção no MESMO evento mantém as fotos", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: comFoto(ids.fotoDaFesta), origem: "em_branco",
    });
    const copia = await dona.mutation(api.layoutSalao.duplicar, { layoutId: id, eventIdDestino: ids.festa });
    const lida = await dona.query(api.layoutSalao.obter, { layoutId: copia });
    expect(lida!.dados.elementos[1].fotoId).toBe(ids.fotoDaFesta);
  });

  it("apagar o layout não apaga a foto da Galeria", async () => {
    const { t, dona, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: comFoto(ids.fotoDaFesta), origem: "em_branco",
    });
    await dona.mutation(api.layoutSalao.remover, { layoutId: id });
    expect(await t.run((ctx: MutationCtx) => ctx.db.get(ids.fotoDaFesta))).not.toBeNull();
    expect(await dona.query(api.layoutSalao.obter, { layoutId: id })).toBeNull();
  });

  it("foto apagada da Galeria depois some da leitura, e o elemento fica", async () => {
    const { t, dona, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: comFoto(ids.fotoDaFesta), origem: "em_branco",
    });
    await t.run((ctx: MutationCtx) => ctx.db.delete(ids.fotoDaFesta));
    const lido = await dona.query(api.layoutSalao.obter, { layoutId: id });
    expect(lido!.fotos).toEqual({});
    expect(lido!.dados.elementos).toHaveLength(2);
  });
});

describe("o servidor recusa layout sem sentido", () => {
  it.each([
    ["salão de 0 m", layoutBase({ salao: { largura: 0, comprimento: 20 } })],
    ["salão infinito", layoutBase({ salao: { largura: Number.POSITIVE_INFINITY, comprimento: 20 } })],
    ["mesa a 500 m do salão", layoutBase({ mesas: { diametro: 1.8, lugares: 10, posicoes: [{ id: "x", cx: 500, cy: 3 }] } })],
    ["mesa com NaN", layoutBase({ mesas: { diametro: 1.8, lugares: 10, posicoes: [{ id: "x", cx: Number.NaN, cy: 3 }] } })],
    ["0 lugares", layoutBase({ mesas: { diametro: 1.8, lugares: 0, posicoes: [] } })],
    ["abertura maior que a parede", layoutBase({ aberturas: [{ id: "a", parede: "fundo", inicio: 2, fim: 99, rotulo: "X", tipo: "entrada" }] })],
    ["ids repetidos", layoutBase({ mesas: { diametro: 1.8, lugares: 10, posicoes: [{ id: "m", cx: 3, cy: 3 }, { id: "m", cx: 8, cy: 3 }] } })],
  ])("%s", async (_nome, dados) => {
    const { dona, ids } = await cenario();
    await expect(dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "x", dados, origem: "em_branco",
    })).rejects.toThrow(/INVALID|salão|mesa|Lugares|abertura|repetidos/i);
  });

  it("lista sem teto é recusada antes de encostar no banco", async () => {
    const { dona, ids } = await cenario();
    const posicoes = Array.from({ length: LIMITES.mesas + 1 }, (_, i) => ({ id: `m${i}`, cx: 5, cy: 5 }));
    await expect(dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "x", dados: layoutBase({ mesas: { diametro: 1.8, lugares: 10, posicoes } }), origem: "em_branco",
    })).rejects.toThrow(/Máximo/);
  });

  it(`no máximo ${LIMITES.layoutsPorEvento} layouts por evento — o seguinte é recusado`, async () => {
    const { t, dona, ids } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      const ev = (await ctx.db.get(ids.festa))!;
      for (let i = 0; i < LIMITES.layoutsPorEvento; i++) {
        await ctx.db.insert("eventLayouts", {
          userId: ev.userId, eventId: ids.festa, nome: `L${i}`, dados: layoutBase(),
          origem: "em_branco", createdAt: AGORA, updatedAt: AGORA,
        });
      }
    });
    await expect(dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "mais um", dados: layoutBase(), origem: "em_branco",
    })).rejects.toThrow(/já tem/);
  });

  it("salvar duas vezes o mesmo conteúdo não cria linha nova", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "A", dados: layoutBase(), origem: "em_branco",
    });
    await dona.mutation(api.layoutSalao.salvar, { layoutId: id, nome: "A", dados: layoutBase() });
    await dona.mutation(api.layoutSalao.salvar, { layoutId: id, nome: "A", dados: layoutBase() });
    expect(await dona.query(api.layoutSalao.listarDoEvento, { eventId: ids.festa })).toHaveLength(1);
  });

  it("nome vazio vira 'Layout', e o resumo deriva mesas e lugares", async () => {
    const { dona, ids } = await cenario();
    await dona.mutation(api.layoutSalao.criar, {
      eventId: ids.festa, nome: "   ", dados: layoutBase(), origem: "em_branco",
    });
    const [r] = await dona.query(api.layoutSalao.listarDoEvento, { eventId: ids.festa });
    expect(r.nome).toBe("Layout");
    expect(r.mesas).toBe(2);
    expect(r.lugares).toBe(20);
  });
});
