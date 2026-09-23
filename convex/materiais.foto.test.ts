import { describe, expect, it, vi } from "vitest";

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
import { deleteUserDataCascade } from "./lib/cascade";
import { materiaisDoProjeto } from "./lib/materiaisDoProjeto";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// A FOTO DO MATERIAL MORA NO CATÁLOGO
//
// "Rosa, lisianthus, boca-de-leão, eucalipto" não diz nada para quem não
// trabalha com flor. A foto que resolve isso é sempre a MESMA — lisianthus é
// lisianthus em todo casamento —, e por isso ela pende do MATERIAL e não do
// evento: um envio, todos os eventos.
//
// O que estes testes protegem: a posse, o arquivo que não pode vazar, e a
// fronteira de audiência do que chega ao Projeto Visual.
// ═════════════════════════════════════════════════════════════════════════════

type Storage = { store: (b: Blob) => Promise<Id<"_storage">> };

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });
  const rival = await autenticarComo(t, {
    nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
  });

  const donaId = await t.run(async (ctx: MutationCtx) =>
    (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora"))
      .unique())!._id,
  );

  const guardar = (c: string) =>
    t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: Storage }).storage.store(new Blob([c])),
    );
  const arquivoExiste = async (id: Id<"_storage">) =>
    (await t.run(async (ctx: MutationCtx) => ctx.storage.getUrl(id))) !== null;
  const linha = (id: Id<"materials">) => t.run((ctx: MutationCtx) => ctx.db.get(id));

  const material = async (nome = "Lisianthus branco") =>
    (await dona.mutation(api.materials.create, { nome, unidade: "haste" as const })).materialId;

  return { t, dona, rival, donaId, guardar, arquivoExiste, linha, material };
}

describe("definir e trocar a foto", () => {
  it("a foto fica no material e a lista devolve a URL", async () => {
    const { dona, guardar, material } = await cenario();
    const id = await material();
    await dona.mutation(api.materials.definirFoto, { id, storageId: await guardar("flor") });

    const lista = await dona.query(api.materials.list, {});
    expect(lista.find((m) => m._id === id)!.fotoUrl).toBeTruthy();
  });

  it("material sem foto devolve null, e não uma URL quebrada", async () => {
    const { dona, material } = await cenario();
    const id = await material();
    const lista = await dona.query(api.materials.list, {});
    expect(lista.find((m) => m._id === id)!.fotoUrl).toBeNull();
  });

  it("trocar a foto APAGA a anterior — arquivo órfão é cobrado para sempre", async () => {
    const { dona, guardar, arquivoExiste, material } = await cenario();
    const id = await material();
    const primeira = await guardar("flor errada");
    await dona.mutation(api.materials.definirFoto, { id, storageId: primeira });

    await dona.mutation(api.materials.definirFoto, { id, storageId: await guardar("certa") });

    expect(await arquivoExiste(primeira), "a foto trocada ficou no storage").toBe(false);
  });

  it("reenviar o MESMO arquivo não o destrói", async () => {
    // Sem a comparação, um toque repetido no botão deixaria o material
    // apontando para um arquivo recém-apagado.
    const { dona, guardar, arquivoExiste, linha, material } = await cenario();
    const id = await material();
    const arquivo = await guardar("flor");
    await dona.mutation(api.materials.definirFoto, { id, storageId: arquivo });

    await dona.mutation(api.materials.definirFoto, { id, storageId: arquivo });

    expect(await arquivoExiste(arquivo), "apagou o arquivo que acabou de vincular").toBe(true);
    expect((await linha(id))!.fotoStorageId).toBe(arquivo);
  });

  it("remover leva o arquivo junto, e repetir não quebra", async () => {
    const { dona, guardar, arquivoExiste, linha, material } = await cenario();
    const id = await material();
    const arquivo = await guardar("flor");
    await dona.mutation(api.materials.definirFoto, { id, storageId: arquivo });

    expect(await dona.mutation(api.materials.removerFoto, { id })).toEqual({ removida: true });
    expect(await arquivoExiste(arquivo)).toBe(false);
    expect((await linha(id))!.fotoStorageId).toBeUndefined();
    expect(await dona.mutation(api.materials.removerFoto, { id })).toEqual({ removida: false });
  });

  it("arquivar NÃO apaga a foto — arquivar tem volta", async () => {
    const { dona, guardar, arquivoExiste, material } = await cenario();
    const id = await material();
    const arquivo = await guardar("flor");
    await dona.mutation(api.materials.definirFoto, { id, storageId: arquivo });

    await dona.mutation(api.materials.setArchived, { id, archived: true });

    expect(await arquivoExiste(arquivo), "arquivar destruiu a foto").toBe(true);
  });
});

describe("nada atravessa a fronteira da conta", () => {
  it("a rival não põe foto no material da dona", async () => {
    const { rival, guardar, material } = await cenario();
    const id = await material();
    await expect(
      rival.mutation(api.materials.definirFoto, { id, storageId: await guardar("x") }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("nem remove a foto dela", async () => {
    const { dona, rival, guardar, arquivoExiste, material } = await cenario();
    const id = await material();
    const arquivo = await guardar("flor");
    await dona.mutation(api.materials.definirFoto, { id, storageId: arquivo });

    await expect(rival.mutation(api.materials.removerFoto, { id })).rejects.toThrow(
      /não encontrado/i,
    );
    expect(await arquivoExiste(arquivo), "a rival apagou o arquivo da dona").toBe(true);
  });

  it("e o catálogo da rival não aparece na lista da dona", async () => {
    const { dona, rival, guardar } = await cenario();
    const daRival = (
      await rival.mutation(api.materials.create, { nome: "Rosa da rival", unidade: "haste" })
    ).materialId;
    await rival.mutation(api.materials.definirFoto, { id: daRival, storageId: await guardar("r") });

    const lista = await dona.query(api.materials.list, {});
    expect(lista.some((m) => m._id === daRival)).toBe(false);
  });
});

describe("a cascata da conta leva a foto", () => {
  it("excluir a conta não deixa a foto do material no storage", async () => {
    // `materials` sai no laço de linhas da cascata; sem o laço de arquivos
    // antes dele, a foto de cada rosa ficaria cobrada e sem dono.
    const { t, dona, donaId, guardar, arquivoExiste, material } = await cenario();
    const id = await material();
    const arquivo = await guardar("flor");
    await dona.mutation(api.materials.definirFoto, { id, storageId: arquivo });

    await t.run(async (ctx: MutationCtx) => {
      await deleteUserDataCascade(ctx, donaId);
    });

    expect(await arquivoExiste(arquivo), "a foto do material ficou órfã").toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O QUE CHEGA AO PROJETO VISUAL
//
// Esta é a tela que a decoradora VIRA PARA A NOIVA. A linha consolidada da
// Ficha Técnica carrega custo estimado, margem, cobertura e compras
// vinculadas — nada disso pode viajar até aqui, nem escondido na renderização.
// ═════════════════════════════════════════════════════════════════════════════
describe("materiaisParaOProjeto — a fronteira de audiência", () => {
  async function comFicha() {
    const base = await cenario();
    const eventId = await base.t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("events", {
        userId: base.donaId,
        name: "Marina & Gabriel",
        type: "wedding" as const,
        date: "2026-12-05",
        location: "Fazenda",
        clientName: "Marina",
        status: "planning" as const,
      }),
    );
    const item = await base.dona.mutation(api.assemblyItems.create, {
      eventId,
      area: "ceremony",
      name: "Arranjo do altar",
      quantity: 10,
      visibility: "cliente" as const,
      includeInAssemblyReport: true,
      checkOnAssembly: false,
    });
    return { ...base, eventId, item };
  }

  it("devolve nome, categoria e foto — e NADA de dinheiro", async () => {
    const { dona, guardar, material, eventId, item } = await comFicha();
    const rosa = await material("Rosa branca");
    await dona.mutation(api.materials.update, {
      id: rosa, categoria: "Flores", custoReferencia: 6.9, margemPercentual: 10,
    });
    await dona.mutation(api.materials.definirFoto, { id: rosa, storageId: await guardar("rosa") });
    await dona.mutation(api.fichaTecnica.setReceita, {
      id: item,
      receita: [
        {
          materialId: rosa, nome: "Rosa branca", unidade: "haste" as const,
          quantidade: 8, custoReferencia: 6.9, margemPercentual: 10,
          categoria: "Flores",
        },
      ],
    });

    const lista = await dona.query(api.fichaTecnica.materiaisParaOProjeto, { eventId });

    expect(lista).toHaveLength(1);
    expect(lista[0].nome).toBe("Rosa branca");
    expect(lista[0].categoria).toBe("Flores");
    expect(lista[0].fotoUrl).toBeTruthy();
    // A trava: as chaves do objeto são EXATAMENTE estas três. Um `...linha`
    // numa rodada futura publica o custo da empresa para a noiva.
    expect(Object.keys(lista[0]).sort()).toEqual(["categoria", "fotoUrl", "nome"]);
  });

  it("nenhum valor de custo ou margem aparece no que sai, em nenhuma chave", async () => {
    const { dona, material, eventId, item } = await comFicha();
    const rosa = await material("Rosa branca");
    await dona.mutation(api.fichaTecnica.setReceita, {
      id: item,
      receita: [
        {
          materialId: rosa, nome: "Rosa branca", unidade: "haste" as const,
          quantidade: 8, custoReferencia: 6.9, margemPercentual: 10,
        },
      ],
    });

    const lista = await dona.query(api.fichaTecnica.materiaisParaOProjeto, { eventId });
    const serializado = JSON.stringify(lista);
    for (const vazamento of ["6.9", "custo", "margem", "cobertura", "necessario"]) {
      expect(serializado, `vazou "${vazamento}" para a tela da cliente`).not.toContain(vazamento);
    }
  });

  it("item classificado como REFERÊNCIA não leva material nenhum ao projeto", async () => {
    // Inspiração não é obrigação e não é escolha contratada. A regra já é de
    // `ehObrigacaoDeMontagem`; este teste impede que a projeção a contorne.
    const { dona, material, eventId, item } = await comFicha();
    const rosa = await material("Rosa branca");
    await dona.mutation(api.fichaTecnica.setReceita, {
      id: item,
      receita: [{ materialId: rosa, nome: "Rosa branca", unidade: "haste" as const, quantidade: 8 }],
    });
    await dona.mutation(api.assemblyItems.update, { id: item, projectScope: "referencia" });

    expect(await dona.query(api.fichaTecnica.materiaisParaOProjeto, { eventId })).toEqual([]);
  });

  it("a mesma flor em duas unidades vira UMA entrada, e a foto sobrevive", async () => {
    const { dona, guardar, material, eventId, item } = await comFicha();
    const emHaste = await material("Rosa branca");
    const emMaco = (
      await dona.mutation(api.materials.create, { nome: "Rosa branca", unidade: "maco" })
    ).materialId;
    await dona.mutation(api.materials.definirFoto, {
      id: emMaco, storageId: await guardar("rosa"),
    });
    await dona.mutation(api.fichaTecnica.setReceita, {
      id: item,
      receita: [
        { materialId: emHaste, nome: "Rosa branca", unidade: "haste" as const, quantidade: 8 },
        { materialId: emMaco, nome: "Rosa branca", unidade: "maco" as const, quantidade: 2 },
      ],
    });

    const lista = await dona.query(api.fichaTecnica.materiaisParaOProjeto, { eventId });
    expect(lista, "a mesma flor apareceu duas vezes para a cliente").toHaveLength(1);
    expect(lista[0].fotoUrl, "a entrada sem foto apagou a foto da outra").toBeTruthy();
  });

  it("evento de outra conta devolve vazio, sem dizer que existe", async () => {
    const { rival, eventId } = await comFicha();
    expect(await rival.query(api.fichaTecnica.materiaisParaOProjeto, { eventId })).toEqual([]);
  });
});

describe("materiaisDoProjeto — a construção, sem banco", () => {
  const semFoto = () => null;

  it("ordena em português, não por ordem de chegada", () => {
    // A ordem não pode ser "as com foto primeiro": a lista se reorganizaria a
    // cada envio, e a cliente que leu o projeto na terça veria outra na quinta.
    const lista = materiaisDoProjeto(
      [{ nome: "Eucalipto" }, { nome: "Áster" }, { nome: "Boca-de-leão" }],
      semFoto,
    );
    expect(lista.map((m) => m.nome)).toEqual(["Áster", "Boca-de-leão", "Eucalipto"]);
  });

  it("linha sem nome não vira quadro vazio na apresentação", () => {
    expect(materiaisDoProjeto([{ nome: "   " }, { nome: "Rosa" }], semFoto)).toHaveLength(1);
  });

  it("o rótulo é o texto dela — a normalização só serve para juntar", () => {
    const lista = materiaisDoProjeto(
      [{ nome: "Boca-de-Leão", materialId: "a" }, { nome: "boca de leao", materialId: "b" }],
      semFoto,
    );
    expect(lista).toHaveLength(1);
    expect(lista[0].nome, "reescreveu o que ela digitou").toBe("Boca-de-Leão");
  });

  it("a categoria da segunda entrada preenche a que faltava na primeira", () => {
    const lista = materiaisDoProjeto(
      [{ nome: "Rosa", materialId: "a" }, { nome: "Rosa", materialId: "b", categoria: "Flores" }],
      semFoto,
    );
    expect(lista[0].categoria).toBe("Flores");
  });

  it("linha sem vínculo de catálogo não busca foto nenhuma", () => {
    // Material digitado à mão na receita não tem `materialId`. Chamar o
    // resolvedor com `undefined` quebraria a consulta.
    const buscou: string[] = [];
    const lista = materiaisDoProjeto([{ nome: "Fita de cetim" }], (id) => {
      buscou.push(id);
      return null;
    });
    expect(buscou).toEqual([]);
    expect(lista[0].fotoUrl).toBeNull();
  });
});
