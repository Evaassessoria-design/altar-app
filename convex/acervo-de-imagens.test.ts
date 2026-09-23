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
// A GALERIA VIROU ACERVO DA EMPRESA
//
// `gallery` tinha seis funções e TODAS exigiam `eventId`. Cinco anos de
// trabalho ficavam em setenta álbuns lacrados — não havia como achar o arco de
// oliveiras de 2024 para mostrar à cliente de hoje.
//
// Reaproveitar cria uma LINHA nova apontando para o MESMO arquivo. Nenhum byte
// é copiado. O preço disso é que apagar deixou de poder assumir posse
// exclusiva do arquivo, e é esse o risco que este arquivo existe para travar:
// excluir a foto de 2024 não pode quebrar a de 2026 em silêncio — ela só
// descobriria na frente da cliente.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = "2026-09-23T12:00:00.000Z";

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

    const evento = async (userId: Id<"users">, name: string, date: string) =>
      ctx.db.insert("events", {
        userId, name, type: "wedding", date,
        location: "Fazenda", clientName: "Cliente", status: "planning",
      });

    const storage = (ctx as unknown as {
      storage: { store: (b: Blob) => Promise<Id<"_storage">> };
    }).storage;

    const antigo = await evento(donaId, "Joana & Rafael (2024)", "2024-05-10");
    const marina = await evento(donaId, "Marina & Gabriel", "2026-12-05");
    const eventoAlheio = await evento(rivalId, "Evento da rival", "2026-10-01");

    const arquivoDoArco = await storage.store(new Blob(["arco original"]));
    const previewDoArco = await storage.store(new Blob(["arco leve"]));

    const arco = await ctx.db.insert("eventPhotos", {
      userId: donaId, eventId: antigo,
      storageId: arquivoDoArco, previewStorageId: previewDoArco,
      filename: "arco-oliveiras.jpg", category: "evento", order: 1,
      uploadedAt: "2024-05-11T10:00:00.000Z",
      caption: "Arco de oliveiras", ambiente: "Cerimônia",
      // Classificada como CONTRATADA naquele casamento. Não pode viajar.
      projectScope: "incluso",
    });

    const mesa = await ctx.db.insert("eventPhotos", {
      userId: donaId, eventId: antigo,
      storageId: await storage.store(new Blob(["mesa"])),
      filename: "mesa-posta.jpg", category: "antes", order: 2,
      uploadedAt: "2024-05-11T10:05:00.000Z", ambiente: "Recepção",
    });

    const daRival = await ctx.db.insert("eventPhotos", {
      userId: rivalId, eventId: eventoAlheio,
      storageId: await storage.store(new Blob(["da rival"])),
      filename: "da-rival.jpg", category: "antes", order: 1, uploadedAt: AGORA,
    });

    return {
      donaId, antigo, marina, eventoAlheio,
      arco, mesa, daRival, arquivoDoArco, previewDoArco,
    };
  });

  const arquivoExiste = async (id: Id<"_storage">) =>
    (await t.run((ctx: MutationCtx) => ctx.storage.getUrl(id))) !== null;
  const linha = (id: Id<"eventPhotos">) => t.run((ctx: MutationCtx) => ctx.db.get(id));

  return { t, dona, rival, ids, arquivoExiste, linha };
}

describe("o acervo enxerga os outros eventos", () => {
  it("lista fotos de todos os eventos da empresa, com o nome do evento", async () => {
    const { dona, ids } = await cenario();
    const r = await dona.query(api.gallery.meuAcervo, {});
    expect(r.fotos.map((f) => f.filename).sort()).toEqual([
      "arco-oliveiras.jpg", "mesa-posta.jpg",
    ]);
    expect(r.fotos.find((f) => f.filename === "arco-oliveiras.jpg")?.eventoNome)
      .toBe("Joana & Rafael (2024)");
  });

  it("não enxerga a foto de outra conta", async () => {
    const { dona, rival } = await cenario();
    const daDona = await dona.query(api.gallery.meuAcervo, {});
    expect(daDona.fotos.some((f) => f.filename === "da-rival.jpg")).toBe(false);
    const daRival = await rival.query(api.gallery.meuAcervo, {});
    expect(daRival.fotos).toHaveLength(1);
  });

  it("esconde as fotos do evento em que ela já está", async () => {
    // Ela já as tem à mão na própria grade; repeti-las no seletor é ruído.
    const { dona, ids } = await cenario();
    const r = await dona.query(api.gallery.meuAcervo, { excetoEventoId: ids.antigo });
    expect(r.fotos).toHaveLength(0);
  });

  it("filtra por ambiente com a MESMA chave do resto do produto", async () => {
    // Acento e caixa não podem separar "Cerimônia" de "cerimonia".
    const { dona } = await cenario();
    const r = await dona.query(api.gallery.meuAcervo, { ambiente: "cerimonia" });
    expect(r.fotos.map((f) => f.filename)).toEqual(["arco-oliveiras.jpg"]);
  });

  it("busca por legenda e por nome do arquivo", async () => {
    const { dona } = await cenario();
    expect((await dona.query(api.gallery.meuAcervo, { busca: "oliveiras" })).fotos)
      .toHaveLength(1);
    expect((await dona.query(api.gallery.meuAcervo, { busca: "mesa-posta" })).fotos)
      .toHaveLength(1);
    expect((await dona.query(api.gallery.meuAcervo, { busca: "não existe" })).fotos)
      .toHaveLength(0);
  });

  it("entrega a versão leve para a grade, e o original continua lá", async () => {
    const { dona } = await cenario();
    const arco = (await dona.query(api.gallery.meuAcervo, {}))
      .fotos.find((f) => f.filename === "arco-oliveiras.jpg")!;
    expect(arco.previewUrl).not.toBeNull();
    expect(arco.url).not.toBeNull();
    expect(arco.previewUrl).not.toBe(arco.url);
  });

  it("acervo vazio não quebra", async () => {
    const { rival } = await cenario();
    const t2 = await rival.query(api.gallery.meuAcervo, { busca: "zzz" });
    expect(t2).toEqual({ temMais: false, fotos: [] });
  });
});

describe("reaproveitar não sobe arquivo nenhum", () => {
  it("cria uma linha nova no evento de destino, com o MESMO arquivo", async () => {
    const { dona, ids, linha } = await cenario();
    const nova = await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    const copia = await linha(nova as Id<"eventPhotos">);
    expect(copia?.eventId).toBe(ids.marina);
    // O ponto inteiro: nenhum byte novo.
    expect(copia?.storageId).toBe(ids.arquivoDoArco);
    expect(copia?.previewStorageId).toBe(ids.previewDoArco);
    // E a original continua intacta no evento de 2024.
    expect((await linha(ids.arco))?.eventId).toBe(ids.antigo);
  });

  it("traz o que descreve a IMAGEM, não o que descreve o contrato", async () => {
    const { dona, ids, linha } = await cenario();
    const nova = await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    const copia = await linha(nova as Id<"eventPhotos">);
    // Legenda e ambiente vêm: é o trabalho que ela não deve refazer.
    expect(copia?.caption).toBe("Arco de oliveiras");
    expect(copia?.ambiente).toBe("Cerimônia");
    // `projectScope` NÃO vem: herdar "contratado" de outro casamento afirmaria
    // que a cliente de hoje comprou aquilo, sem ninguém ter dito isso.
    expect(copia?.projectScope).toBeUndefined();
    // E a foto do evento que JÁ ACONTECEU vira planejamento aqui.
    expect(copia?.category).toBe("antes");
  });

  it("o ambiente pode ser trocado no momento de trazer", async () => {
    const { dona, ids, linha } = await cenario();
    const nova = await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina, ambiente: "Jardim das oliveiras",
    });
    expect((await linha(nova as Id<"eventPhotos">))?.ambiente).toBe("Jardim das oliveiras");
  });

  it("trazer duas vezes devolve a mesma linha — não duplica na grade", async () => {
    const { dona, ids } = await cenario();
    const a = await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    const b = await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    expect(b).toBe(a);
  });

  it("foto de outra conta responde NOT_FOUND, nunca FORBIDDEN", async () => {
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.gallery.reaproveitar, {
        photoId: ids.daRival, paraEventoId: ids.marina,
      }),
    ).rejects.toThrow(/não encontrada/i);
  });

  it("evento de destino de outra conta é recusado", async () => {
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.gallery.reaproveitar, {
        photoId: ids.arco, paraEventoId: ids.eventoAlheio,
      }),
    ).rejects.toThrow();
  });
});

describe("apagar não pode quebrar o que ficou", () => {
  it("apagar a CÓPIA não apaga o arquivo que a original ainda usa", async () => {
    const { dona, ids, arquivoExiste, linha } = await cenario();
    const nova = await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    await dona.mutation(api.gallery.deletePhoto, { id: nova as Id<"eventPhotos"> });

    expect(await linha(nova as Id<"eventPhotos">)).toBeNull();
    expect(await linha(ids.arco)).not.toBeNull();
    expect(await arquivoExiste(ids.arquivoDoArco)).toBe(true);
    expect(await arquivoExiste(ids.previewDoArco)).toBe(true);
  });

  it("apagar a ORIGINAL não apaga o arquivo que a cópia ainda usa", async () => {
    // A direção que ninguém testa e que quebra na frente da cliente.
    const { dona, ids, arquivoExiste, linha } = await cenario();
    const nova = await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    await dona.mutation(api.gallery.deletePhoto, { id: ids.arco });

    expect(await linha(ids.arco)).toBeNull();
    expect(await linha(nova as Id<"eventPhotos">)).not.toBeNull();
    expect(await arquivoExiste(ids.arquivoDoArco)).toBe(true);
    expect(await arquivoExiste(ids.previewDoArco)).toBe(true);
  });

  it("apagada a ÚLTIMA linha, o arquivo sai — não vira lixo permanente", async () => {
    const { dona, ids, arquivoExiste } = await cenario();
    const nova = await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    await dona.mutation(api.gallery.deletePhoto, { id: nova as Id<"eventPhotos"> });
    await dona.mutation(api.gallery.deletePhoto, { id: ids.arco });

    expect(await arquivoExiste(ids.arquivoDoArco)).toBe(false);
    expect(await arquivoExiste(ids.previewDoArco)).toBe(false);
  });

  it("foto SEM cópia continua apagando arquivo como sempre apagou", async () => {
    const { t, dona, ids, arquivoExiste } = await cenario();
    const daMesa = (await t.run((ctx: MutationCtx) => ctx.db.get(ids.mesa)))!.storageId;
    await dona.mutation(api.gallery.deletePhoto, { id: ids.mesa });
    expect(await arquivoExiste(daMesa)).toBe(false);
  });

  it("EXCLUIR O EVENTO ANTIGO não leva a foto do evento novo", async () => {
    // A cascata tinha a mesma suposição de posse exclusiva que `deletePhoto`.
    const { dona, ids, arquivoExiste, linha } = await cenario();
    const nova = await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    await dona.mutation(api.events.remove, { id: ids.antigo });

    expect(await linha(nova as Id<"eventPhotos">)).not.toBeNull();
    expect(await arquivoExiste(ids.arquivoDoArco)).toBe(true);
  });

  it("excluído o evento que restava, o arquivo finalmente sai", async () => {
    const { dona, ids, arquivoExiste } = await cenario();
    await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    await dona.mutation(api.events.remove, { id: ids.antigo });
    await dona.mutation(api.events.remove, { id: ids.marina });
    expect(await arquivoExiste(ids.arquivoDoArco)).toBe(false);
  });

  it("a contagem de arquivos removidos não mente para a cascata", async () => {
    const { dona, ids } = await cenario();
    await dona.mutation(api.gallery.reaproveitar, {
      photoId: ids.arco, paraEventoId: ids.marina,
    });
    // O evento antigo tem 2 fotos: o arco (compartilhado, arquivo FICA) e a
    // mesa (exclusiva, arquivo sai). Logo: 1 arquivo.
    const r = await dona.mutation(api.events.remove, { id: ids.antigo });
    expect(r.files).toBe(1);
  });
});
