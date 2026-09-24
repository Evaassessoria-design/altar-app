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
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// A MESMA FOTO, UMA VEZ SÓ
//
// A decoradora subia trinta fotos do projeto na Galeria, classificava cada uma
// por ambiente e escopo — e, para pendurar UMA delas num item de montagem,
// tinha de enviar o mesmo arquivo de novo. Dois uploads no 4G do sítio, dois
// arquivos cobrados, e duas verdades: reclassificar na Galeria não mexia na
// cópia presa ao item.
//
// O ponteiro é o mesmo de `events.coverPhotoId`. O que estes testes protegem:
// que o arquivo continue sendo UM, que a foto da Galeria nunca seja apagada
// pelo item, e que a foto de um evento não apareça em outro.
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
        userId, name, type: "wedding" as const, date: "2026-12-05",
        location: "Fazenda", clientName: "Marina", status: "planning" as const,
      });
    return {
      donaId,
      marina: await evento(donaId, "Marina & Gabriel"),
      joana: await evento(donaId, "Joana & Pedro"),
      eventoAlheio: await evento(rivalId, "Evento da rival"),
    };
  });

  const guardar = (c: string) =>
    t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: Storage }).storage.store(new Blob([c])),
    );
  const arquivoExiste = async (id: Id<"_storage">) =>
    (await t.run(async (ctx: MutationCtx) => ctx.storage.getUrl(id))) !== null;
  const linha = (id: Id<"assemblyItems">) => t.run((ctx: MutationCtx) => ctx.db.get(id));

  const item = (eventId: Id<"events">) =>
    dona.mutation(api.assemblyItems.create, {
      eventId, area: "ceremony", name: "Poltrona", visibility: "equipe" as const,
      includeInAssemblyReport: true, checkOnAssembly: false,
    });

  /** Uma foto na Galeria, com versão leve — é o caso normal desde o upload. */
  const foto = async (eventId: Id<"events">, filename = "altar.jpg") => {
    const storageId = await guardar(`original-${filename}`);
    const previewStorageId = await guardar(`leve-${filename}`);
    const id = await dona.mutation(api.gallery.savePhoto, {
      eventId, storageId, previewStorageId, filename, category: "antes" as const,
    });
    return { id, storageId, previewStorageId };
  };

  return { t, dona, rival, ids, guardar, arquivoExiste, linha, item, foto };
}

describe("escolher da galeria em vez de reenviar", () => {
  it("o item passa a exibir a foto SEM arquivo próprio", async () => {
    const { dona, ids, item, foto, linha } = await cenario();
    const i = await item(ids.marina);
    const f = await foto(ids.marina);

    await dona.mutation(api.assemblyItems.setPhotoFromGallery, {
      id: i, slot: "reference", photoId: f.id,
    });

    const depois = (await linha(i))!;
    expect(depois.referencePhotoId).toBe(f.id);
    expect(depois.referencePhotoStorageId, "criou cópia do arquivo").toBeUndefined();

    const lista = await dona.query(api.assemblyItems.listByEvent, { eventId: ids.marina });
    expect(lista[0].referencePhotoUrl).toBeTruthy();
  });

  it("e a URL sai da versão LEVE — a miniatura tem 22mm", async () => {
    const { t, dona, ids, item, foto } = await cenario();
    const i = await item(ids.marina);
    const f = await foto(ids.marina);
    await dona.mutation(api.assemblyItems.setPhotoFromGallery, {
      id: i, slot: "reference", photoId: f.id,
    });

    const lista = await dona.query(api.assemblyItems.listByEvent, { eventId: ids.marina });
    const urlLeve = await t.run((ctx: MutationCtx) => ctx.storage.getUrl(f.previewStorageId));
    expect(lista[0].referencePhotoUrl, "baixou o original para desenhar um selo").toBe(urlLeve);
  });

  it("os dois slots apontam para fotos diferentes sem se atrapalhar", async () => {
    const { dona, ids, item, foto, linha } = await cenario();
    const i = await item(ids.marina);
    const inspiracao = await foto(ids.marina, "inspiracao.jpg");
    const contratado = await foto(ids.marina, "contratado.jpg");

    await dona.mutation(api.assemblyItems.setPhotoFromGallery, {
      id: i, slot: "reference", photoId: inspiracao.id,
    });
    await dona.mutation(api.assemblyItems.setPhotoFromGallery, {
      id: i, slot: "contracted", photoId: contratado.id,
    });

    const depois = (await linha(i))!;
    expect(depois.referencePhotoId).toBe(inspiracao.id);
    expect(depois.contractedPhotoId).toBe(contratado.id);
  });

  it("trocar upload por foto da galeria APAGA o arquivo que era só do item", async () => {
    const { dona, ids, item, foto, guardar, arquivoExiste, linha } = await cenario();
    const i = await item(ids.marina);
    const arquivoProprio = await guardar("upload antigo");
    await dona.mutation(api.assemblyItems.setPhoto, {
      id: i, slot: "reference", storageId: arquivoProprio,
    });
    const f = await foto(ids.marina);

    await dona.mutation(api.assemblyItems.setPhotoFromGallery, {
      id: i, slot: "reference", photoId: f.id,
    });

    expect(await arquivoExiste(arquivoProprio), "o arquivo exclusivo ficou órfão").toBe(false);
    expect((await linha(i))!.referencePhotoStorageId).toBeUndefined();
  });

  it("e NUNCA apaga a foto da Galeria — ela é de lá", async () => {
    const { dona, ids, item, foto, arquivoExiste } = await cenario();
    const i = await item(ids.marina);
    const f = await foto(ids.marina);
    await dona.mutation(api.assemblyItems.setPhotoFromGallery, {
      id: i, slot: "reference", photoId: f.id,
    });

    await dona.mutation(api.assemblyItems.remove, { id: i });

    expect(await arquivoExiste(f.storageId), "excluir o item levou a foto da Galeria").toBe(true);
    expect(await arquivoExiste(f.previewStorageId)).toBe(true);
    expect(
      await dona.query(api.gallery.listPhotos, { eventId: ids.marina }),
      "a foto sumiu da Galeria",
    ).toHaveLength(1);
  });

  it("enviar arquivo novo DESFAZ o ponteiro", async () => {
    // Os dois juntos fariam a leitura preferir a foto da Galeria, e ela veria
    // a antiga depois de enviar a nova.
    const { dona, ids, item, foto, guardar, linha } = await cenario();
    const i = await item(ids.marina);
    const f = await foto(ids.marina);
    await dona.mutation(api.assemblyItems.setPhotoFromGallery, {
      id: i, slot: "reference", photoId: f.id,
    });

    await dona.mutation(api.assemblyItems.setPhoto, {
      id: i, slot: "reference", storageId: await guardar("nova"),
    });

    const depois = (await linha(i))!;
    expect(depois.referencePhotoId, "o ponteiro sobreviveu ao upload").toBeUndefined();
    expect(depois.referencePhotoStorageId).toBeDefined();
  });

  it("item sem ponteiro nenhum continua lendo o arquivo próprio", async () => {
    // O estado de tudo que já existe. Nenhum backfill.
    const { dona, ids, item, guardar } = await cenario();
    const i = await item(ids.marina);
    await dona.mutation(api.assemblyItems.setPhoto, {
      id: i, slot: "reference", storageId: await guardar("antiga"),
    });

    const lista = await dona.query(api.assemblyItems.listByEvent, { eventId: ids.marina });
    expect(lista[0].referencePhotoUrl).toBeTruthy();
  });
});

describe("apagar a foto na Galeria não deixa ponteiro morto", () => {
  it("o item volta a ficar sem foto, e a linha fica limpa", async () => {
    const { dona, ids, item, foto, linha } = await cenario();
    const i = await item(ids.marina);
    const f = await foto(ids.marina);
    await dona.mutation(api.assemblyItems.setPhotoFromGallery, {
      id: i, slot: "reference", photoId: f.id,
    });

    await dona.mutation(api.gallery.deletePhoto, { id: f.id });

    expect((await linha(i))!.referencePhotoId, "ponteiro quebrado ficou no banco").toBeUndefined();
    const lista = await dona.query(api.assemblyItems.listByEvent, { eventId: ids.marina });
    expect(lista[0].referencePhotoUrl).toBeNull();
  });

  it("limpa os DOIS slots quando a mesma foto servia aos dois", async () => {
    const { dona, ids, item, foto, linha } = await cenario();
    const i = await item(ids.marina);
    const f = await foto(ids.marina);
    for (const slot of ["reference", "contracted"] as const) {
      await dona.mutation(api.assemblyItems.setPhotoFromGallery, { id: i, slot, photoId: f.id });
    }

    await dona.mutation(api.gallery.deletePhoto, { id: f.id });

    const depois = (await linha(i))!;
    expect(depois.referencePhotoId).toBeUndefined();
    expect(depois.contractedPhotoId).toBeUndefined();
  });

  it("e não encosta nos itens que apontam para OUTRA foto", async () => {
    const { dona, ids, item, foto, linha } = await cenario();
    const i = await item(ids.marina);
    const apagada = await foto(ids.marina, "a.jpg");
    const mantida = await foto(ids.marina, "b.jpg");
    await dona.mutation(api.assemblyItems.setPhotoFromGallery, {
      id: i, slot: "reference", photoId: mantida.id,
    });

    await dona.mutation(api.gallery.deletePhoto, { id: apagada.id });

    expect((await linha(i))!.referencePhotoId).toBe(mantida.id);
  });
});

describe("nada atravessa a fronteira", () => {
  it("foto de OUTRO evento é recusada, mesmo sendo da mesma conta", async () => {
    // Os dois eventos são dela e nenhuma regra de posse é violada — e ainda
    // assim seria a foto do casamento da Joana no caderno da Marina.
    const { dona, ids, item, foto } = await cenario();
    const i = await item(ids.marina);
    const daJoana = await foto(ids.joana);

    await expect(
      dona.mutation(api.assemblyItems.setPhotoFromGallery, {
        id: i, slot: "reference", photoId: daJoana.id,
      }),
    ).rejects.toThrow(/não encontrada/i);
  });

  it("foto de outra CONTA é recusada", async () => {
    const { t, dona, rival, ids, item, guardar } = await cenario();
    const i = await item(ids.marina);
    const storageId = await guardar("rival");
    const daRival = await rival.mutation(api.gallery.savePhoto, {
      eventId: ids.eventoAlheio, storageId, filename: "r.jpg", category: "antes" as const,
    });

    await expect(
      dona.mutation(api.assemblyItems.setPhotoFromGallery, {
        id: i, slot: "reference", photoId: daRival,
      }),
    ).rejects.toThrow(/não encontrada/i);

    // E nada foi gravado no item.
    expect((await t.run((ctx: MutationCtx) => ctx.db.get(i)))!.referencePhotoId).toBeUndefined();
  });

  it("a rival não aponta foto nenhuma no item da dona", async () => {
    const { rival, ids, item, foto } = await cenario();
    const i = await item(ids.marina);
    const f = await foto(ids.marina);

    await expect(
      rival.mutation(api.assemblyItems.setPhotoFromGallery, {
        id: i, slot: "reference", photoId: f.id,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });
});
