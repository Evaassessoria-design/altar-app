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

// ═════════════════════════════════════════════════════════════════════════════
// A VERSÃO LEVE DA FOTO, DO LADO DO BANCO
//
// Um campo opcional (`previewStorageId`) e três garantias:
//
//   · foto ANTIGA, sem versão leve, continua funcionando — não há backfill;
//   · a versão leve NUNCA substitui o original;
//   · os dois arquivos saem juntos quando a foto é apagada; deixar o derivado
//     para trás seria storage órfão cobrado para sempre.
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

  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (s: string) =>
      (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", s))
        .unique())!._id;
    const donaId = await idDe("auth|aurora");
    const rivalId = await idDe("auth|rival");

    const evento = async (userId: Id<"users">, name: string) =>
      ctx.db.insert("events", {
        userId, name, type: "wedding", date: "2026-12-05",
        location: "Fazenda", clientName: "Marina", status: "planning",
      });

    return {
      donaId,
      marina: await evento(donaId, "Marina & Gabriel"),
      eventoAlheio: await evento(rivalId, "Evento da rival"),
    };
  });

  const guardar = (conteudo: string) =>
    t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: Storage }).storage.store(new Blob([conteudo])),
    );

  const arquivoExiste = async (id: Id<"_storage">) =>
    (await t.run(async (ctx: MutationCtx) => ctx.storage.getUrl(id))) !== null;

  return { t, dona, rival, ids, guardar, arquivoExiste };
}

describe("foto NOVA, com versão leve", () => {
  it("grava os dois arquivos, e o original continua sendo o original", async () => {
    const { t, dona, ids, guardar } = await cenario();
    const original = await guardar("original-grande");
    const preview = await guardar("leve");

    const id = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina,
      storageId: original,
      previewStorageId: preview,
      filename: "arco.jpg",
      category: "antes",
    });

    const foto = (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!;
    expect(foto.storageId, "o original foi trocado pela versão leve").toBe(original);
    expect(foto.previewStorageId).toBe(preview);
  });

  it("a listagem devolve as DUAS urls", async () => {
    const { dona, ids, guardar } = await cenario();
    await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina,
      storageId: await guardar("original"),
      previewStorageId: await guardar("leve"),
      filename: "arco.jpg",
      category: "antes",
    });

    const [foto] = await dona.query(api.gallery.listPhotos, { eventId: ids.marina });
    expect(foto.url).toBeTruthy();
    expect(foto.previewUrl).toBeTruthy();
    expect(foto.previewUrl).not.toBe(foto.url);
  });
});

describe("foto ANTIGA, sem versão leve", () => {
  it("é salva e listada igual — nenhum backfill é necessário", async () => {
    const { dona, ids, guardar } = await cenario();
    await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina,
      storageId: await guardar("original"),
      filename: "antiga.jpg",
      category: "antes",
    });

    const [foto] = await dona.query(api.gallery.listPhotos, { eventId: ids.marina });
    expect(foto.url, "a foto antiga perdeu a url").toBeTruthy();
    // `null`, e não `undefined`: a tela distingue "não tem" de "não veio".
    expect(foto.previewUrl).toBeNull();
    expect(foto.previewStorageId).toBeUndefined();
  });

  it("e a geração que falhou no navegador cai no MESMO caminho", async () => {
    // HEIC no Android, canvas indisponível, imagem já pequena: `gerarPreview`
    // devolve null e a tela simplesmente não manda o campo.
    const { dona, ids, guardar } = await cenario();
    const id = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina,
      storageId: await guardar("heic-que-o-navegador-nao-leu"),
      previewStorageId: undefined,
      filename: "IMG_0001.HEIC",
      category: "antes",
    });
    expect(id).toBeTruthy();
  });
});

describe("apagar a foto leva os dois arquivos", () => {
  it("o derivado não fica órfão no storage", async () => {
    const { dona, ids, guardar, arquivoExiste } = await cenario();
    const original = await guardar("original");
    const preview = await guardar("leve");
    const id = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina, storageId: original, previewStorageId: preview,
      filename: "arco.jpg", category: "antes",
    });

    expect(await arquivoExiste(preview)).toBe(true);
    await dona.mutation(api.gallery.deletePhoto, { id });

    expect(await arquivoExiste(original), "o original ficou órfão").toBe(false);
    expect(await arquivoExiste(preview), "a versão leve ficou órfã").toBe(false);
  });

  it("foto SEM versão leve continua sendo apagada sem erro", async () => {
    const { dona, ids, guardar, arquivoExiste } = await cenario();
    const original = await guardar("original");
    const id = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina, storageId: original, filename: "antiga.jpg", category: "antes",
    });
    await dona.mutation(api.gallery.deletePhoto, { id });
    expect(await arquivoExiste(original)).toBe(false);
  });

  it("a cascata do EVENTO também leva os dois", async () => {
    const { dona, ids, guardar, arquivoExiste } = await cenario();
    const original = await guardar("original");
    const preview = await guardar("leve");
    await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina, storageId: original, previewStorageId: preview,
      filename: "arco.jpg", category: "antes",
    });

    await dona.mutation(api.events.remove, { id: ids.marina });
    expect(await arquivoExiste(original)).toBe(false);
    expect(await arquivoExiste(preview), "a cascata esqueceu a versão leve").toBe(false);
  });

  it("e a capa some junto, sem ponteiro quebrado", async () => {
    const { t, dona, ids, guardar } = await cenario();
    const id = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina, storageId: await guardar("o"), previewStorageId: await guardar("l"),
      filename: "capa.jpg", category: "antes",
    });
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: id });
    await dona.mutation(api.gallery.deletePhoto, { id });

    const evento = (await t.run((ctx: MutationCtx) => ctx.db.get(ids.marina)))!;
    expect(evento.coverPhotoId).toBeUndefined();
  });
});

describe("a versão leve não atravessa fronteira", () => {
  it("evento de outra conta não aceita foto nenhuma", async () => {
    const { dona, ids, guardar } = await cenario();
    await expect(
      dona.mutation(api.gallery.savePhoto, {
        eventId: ids.eventoAlheio,
        storageId: await guardar("o"),
        previewStorageId: await guardar("l"),
        filename: "invasao.jpg",
        category: "antes",
      }),
    ).rejects.toThrow();
  });

  it("a rival não enxerga a versão leve da dona", async () => {
    const { dona, rival, ids, guardar } = await cenario();
    await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina, storageId: await guardar("o"), previewStorageId: await guardar("l"),
      filename: "arco.jpg", category: "antes",
    });
    // Listagem degrada para vazio — evento que não é seu não existe.
    expect(await rival.query(api.gallery.listPhotos, { eventId: ids.marina })).toEqual([]);
  });

  it("não existe caminho para TROCAR a versão leve depois", async () => {
    // `savePhoto` é o único que grava o campo. Sem update, a versão leve nunca
    // passa a apontar para o arquivo de outra foto.
    const { dona, ids, guardar, t } = await cenario();
    const id = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.marina, storageId: await guardar("o"), previewStorageId: await guardar("l"),
      filename: "arco.jpg", category: "antes",
    });
    const antes = (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!.previewStorageId;

    await dona.mutation(api.gallery.updatePhoto, { id, caption: "Nova legenda" });

    const depois = (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!.previewStorageId;
    expect(depois).toBe(antes);
  });
});
