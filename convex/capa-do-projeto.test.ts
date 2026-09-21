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
// A CAPA DO PROJETO VISUAL
//
// Um ponteiro do evento para uma foto da galeria. A forma é a mesma de
// `events.responsibleId`, que já aponta para `teamMembers` — e as travas são
// as mesmas do resto do produto:
//
//   · id vindo do navegador NÃO é prova de posse;
//   · dado de outra conta responde NOT_FOUND, nunca FORBIDDEN;
//   · e aqui há uma terceira pergunta: a foto é DESTE evento?
//
// A terceira existe porque os dois eventos podem ser da mesma decoradora. Sem
// ela, a capa de Marina & Gabriel poderia ser uma foto do casamento da Joana:
// nenhuma regra de posse é violada, e mesmo assim é a foto errada no
// documento errado.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = "2026-09-21T12:00:00.000Z";

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
    const marina = await evento(donaId, "Marina & Gabriel");
    // MESMA dona, outro casamento — o caso que a checagem de posse não pega.
    const joana = await evento(donaId, "Joana & Rafael");
    const eventoAlheio = await evento(rivalId, "Evento da rival");

    const storage = (ctx as unknown as {
      storage: { store: (b: Blob) => Promise<Id<"_storage">> };
    }).storage;
    const foto = async (userId: Id<"users">, eventId: Id<"events">, nome: string) =>
      ctx.db.insert("eventPhotos", {
        userId, eventId,
        storageId: await storage.store(new Blob(["x"])),
        filename: nome, category: "antes", order: 0, uploadedAt: AGORA,
      });

    return {
      donaId,
      marina,
      joana,
      eventoAlheio,
      fotoDeMarina: await foto(donaId, marina, "arco.jpg"),
      outraDeMarina: await foto(donaId, marina, "mesa.jpg"),
      fotoDeJoana: await foto(donaId, joana, "da-joana.jpg"),
      fotoAlheia: await foto(rivalId, eventoAlheio, "da-rival.jpg"),
    };
  });

  const capaDe = async (id: Id<"events">) =>
    (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!.coverPhotoId;

  return { t, dona, rival, ids, capaDe };
}

describe("escolher a capa", () => {
  it("a decoradora define a capa com uma foto do próprio evento", async () => {
    const { dona, ids, capaDe } = await cenario();
    await dona.mutation(api.events.update, {
      id: ids.marina,
      coverPhotoId: ids.fotoDeMarina,
    });
    expect(await capaDe(ids.marina)).toBe(ids.fotoDeMarina);
  });

  it("trocar a capa substitui, não acumula", async () => {
    const { dona, ids, capaDe } = await cenario();
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoDeMarina });
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.outraDeMarina });
    expect(await capaDe(ids.marina)).toBe(ids.outraDeMarina);
  });

  it("`null` REMOVE a capa — e é por isso que ele existe", async () => {
    // `undefined` some no transporte do Convex: sem o `null`, "tirar a capa"
    // nunca chegaria ao servidor e a tela ainda diria "salvo".
    const { dona, ids, capaDe } = await cenario();
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoDeMarina });
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: null });
    expect(await capaDe(ids.marina)).toBeUndefined();
  });

  it("campo AUSENTE não mexe na capa", async () => {
    // Editar o nome do evento não pode apagar a capa por omissão.
    const { dona, ids, capaDe } = await cenario();
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoDeMarina });
    await dona.mutation(api.events.update, { id: ids.marina, name: "Marina & Gabriel ❤" });
    expect(await capaDe(ids.marina)).toBe(ids.fotoDeMarina);
  });

  it("evento nasce SEM capa — ninguém escolhe por ela", async () => {
    const { ids, capaDe } = await cenario();
    expect(await capaDe(ids.marina)).toBeUndefined();
  });
});

describe("a capa não atravessa fronteira nenhuma", () => {
  it("conta A não usa foto da conta B", async () => {
    const { dona, ids, capaDe } = await cenario();
    await expect(
      dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoAlheia }),
    ).rejects.toThrow(/não encontrada/i);
    expect(await capaDe(ids.marina)).toBeUndefined();
  });

  it("e o evento de OUTRA conta não aceita foto minha", async () => {
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.events.update, {
        id: ids.eventoAlheio,
        coverPhotoId: ids.fotoDeMarina,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("foto de OUTRO evento da MESMA dona também é recusada", async () => {
    // A checagem de posse sozinha deixaria isto passar: os dois eventos e a
    // foto são dela. É a pergunta que faltava.
    const { dona, ids, capaDe } = await cenario();
    await expect(
      dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoDeJoana }),
    ).rejects.toThrow(/não encontrada/i);
    expect(await capaDe(ids.marina)).toBeUndefined();
  });

  it("id inexistente não vira capa", async () => {
    const { dona, ids, t } = await cenario();
    // Um id com forma válida que não corresponde a linha nenhuma: é o que
    // chega quando alguém edita a requisição à mão.
    const fantasma = await t.run(async (ctx: MutationCtx) => {
      const id = await ctx.db.insert("eventPhotos", {
        userId: ids.donaId, eventId: ids.marina,
        storageId: (await (ctx as unknown as {
          storage: { store: (b: Blob) => Promise<Id<"_storage">> };
        }).storage.store(new Blob(["z"]))),
        filename: "fantasma.jpg", category: "antes", order: 0, uploadedAt: AGORA,
      });
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: fantasma }),
    ).rejects.toThrow(/não encontrada/i);
  });

  it("deslogado não define capa nenhuma", async () => {
    const { t, ids } = await cenario();
    await expect(
      t.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoDeMarina }),
    ).rejects.toThrow();
  });
});

describe("apagar a foto que é capa", () => {
  it("não deixa ponteiro quebrado no evento", async () => {
    const { dona, ids, capaDe } = await cenario();
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoDeMarina });
    await dona.mutation(api.gallery.deletePhoto, { id: ids.fotoDeMarina });
    expect(await capaDe(ids.marina)).toBeUndefined();
  });

  it("apagar OUTRA foto não mexe na capa", async () => {
    const { dona, ids, capaDe } = await cenario();
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoDeMarina });
    await dona.mutation(api.gallery.deletePhoto, { id: ids.outraDeMarina });
    expect(await capaDe(ids.marina)).toBe(ids.fotoDeMarina);
  });

  it("apagar foto de um evento não toca na capa de outro", async () => {
    const { dona, ids, capaDe } = await cenario();
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoDeMarina });
    await dona.mutation(api.events.update, { id: ids.joana, coverPhotoId: ids.fotoDeJoana });
    await dona.mutation(api.gallery.deletePhoto, { id: ids.fotoDeJoana });
    expect(await capaDe(ids.joana)).toBeUndefined();
    expect(await capaDe(ids.marina), "a capa do vizinho foi atingida").toBe(ids.fotoDeMarina);
  });

  it("a exclusão do evento inteiro continua limpando tudo", async () => {
    const { t, dona, ids } = await cenario();
    await dona.mutation(api.events.update, { id: ids.marina, coverPhotoId: ids.fotoDeMarina });
    await dona.mutation(api.events.remove, { id: ids.marina });
    const sobrou = await t.run((ctx: MutationCtx) => ctx.db.get(ids.fotoDeMarina));
    expect(sobrou).toBeNull();
  });
});
