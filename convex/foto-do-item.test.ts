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
import {
  fotoPrincipal,
  resolverFotoDoItem,
  SEM_FOTO,
  urlDeMiniatura,
} from "./lib/fotoDoItem";

// ═════════════════════════════════════════════════════════════════════════════
// A FOTO DO ITEM VEM DA GALERIA — E A GALERIA CONTINUA DONA DO ARQUIVO
//
// Antes desta rodada a mesma imagem entrava duas vezes no ALTAR: uma na
// Galeria (com ambiente, escopo, legenda e versão leve) e outra dentro do item
// de montagem, que só sabia receber arquivo próprio. A segunda cópia custava
// storage, perdia o contexto e não tinha miniatura — a grade de 40 px baixava
// um original de até 15 MB.
//
// Agora o item APONTA. As travas que isto exige, e que este arquivo protege:
//
//   1. o ponteiro não cria dono novo do arquivo;
//   2. apagar o ITEM não apaga a foto da Galeria;
//   3. apagar a FOTO limpa o ponteiro e o item degrada para o arquivo próprio;
//   4. foto de outro evento da MESMA dona não pode ser apontada;
//   5. foto de outra conta responde NOT_FOUND, nunca FORBIDDEN;
//   6. trocar de caminho apaga o arquivo que ficou órfão, e só ele;
//   7. item antigo, com arquivo próprio e sem ponteiro, continua funcionando.
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

    const evento = async (userId: Id<"users">, name: string) =>
      ctx.db.insert("events", {
        userId, name, type: "wedding", date: "2026-12-05",
        location: "Fazenda", clientName: "Marina", status: "planning",
      });
    const marina = await evento(donaId, "Marina & Gabriel");
    const joana = await evento(donaId, "Joana & Rafael");
    const eventoAlheio = await evento(rivalId, "Evento da rival");

    const storage = (ctx as unknown as {
      storage: { store: (b: Blob) => Promise<Id<"_storage">> };
    }).storage;

    const foto = async (
      userId: Id<"users">,
      eventId: Id<"events">,
      nome: string,
      comPreview = true,
    ) =>
      ctx.db.insert("eventPhotos", {
        userId, eventId,
        storageId: await storage.store(new Blob(["original"])),
        // Versão leve presente em umas e ausente em outras de propósito: as
        // fotos anteriores a `previewStorageId` continuam existindo.
        previewStorageId: comPreview ? await storage.store(new Blob(["leve"])) : undefined,
        filename: nome, category: "antes", order: 0, uploadedAt: AGORA,
      });

    const item = async (
      userId: Id<"users">,
      eventId: Id<"events">,
      name: string,
      proprio?: Id<"_storage">,
    ) =>
      ctx.db.insert("assemblyItems", {
        userId, eventId, area: "furniture", order: 0, name,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe",
        referencePhotoStorageId: proprio,
        createdAt: AGORA, updatedAt: AGORA,
      });

    const fornecedor = async (userId: Id<"users">, eventId: Id<"events">, nome: string) =>
      ctx.db.insert("eventSuppliers", {
        userId, eventId, category: "moveis", companyName: nome,
      });

    // O item ANTIGO: arquivo só dele, nenhum ponteiro. É o estado de todo item
    // cadastrado antes desta rodada.
    const arquivoProprio = await storage.store(new Blob(["foto antiga do item"]));

    return {
      donaId, marina, joana, eventoAlheio, arquivoProprio,
      cadeira: await item(donaId, marina, "Cadeira Dior"),
      mesa: await item(donaId, marina, "Mesa redonda"),
      itemAntigo: await item(donaId, marina, "Aparador", arquivoProprio),
      itemAlheio: await item(rivalId, eventoAlheio, "Item da rival"),
      fotoDeMarina: await foto(donaId, marina, "cadeira.jpg"),
      outraDeMarina: await foto(donaId, marina, "mesa.jpg", false),
      fotoDeJoana: await foto(donaId, joana, "da-joana.jpg"),
      fotoAlheia: await foto(rivalId, eventoAlheio, "da-rival.jpg"),
      fornecedorDeMarina: await fornecedor(donaId, marina, "Móveis Bella"),
      fornecedorDeJoana: await fornecedor(donaId, joana, "Outro fornecedor"),
      fornecedorAlheio: await fornecedor(rivalId, eventoAlheio, "Fornecedor da rival"),
    };
  });

  const linha = (id: Id<"assemblyItems">) =>
    t.run((ctx: MutationCtx) => ctx.db.get(id));
  const arquivoExiste = async (id: Id<"_storage">) =>
    (await t.run((ctx: MutationCtx) => ctx.storage.getUrl(id))) !== null;

  return { t, dona, rival, ids, linha, arquivoExiste };
}

describe("apontar para uma foto da Galeria", () => {
  it("grava o ponteiro sem copiar arquivo nenhum", async () => {
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.cadeira, slot: "reference", photoId: ids.fotoDeMarina,
    });
    const item = await linha(ids.cadeira);
    expect(item?.referencePhotoId).toBe(ids.fotoDeMarina);
    // O caminho antigo continua vazio: nada foi copiado para dentro do item.
    expect(item?.referencePhotoStorageId).toBeUndefined();
  });

  it("a MESMA foto serve a dois itens — é ponteiro, não cópia", async () => {
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.cadeira, slot: "reference", photoId: ids.fotoDeMarina,
    });
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.mesa, slot: "reference", photoId: ids.fotoDeMarina,
    });
    expect((await linha(ids.cadeira))?.referencePhotoId).toBe(ids.fotoDeMarina);
    expect((await linha(ids.mesa))?.referencePhotoId).toBe(ids.fotoDeMarina);
  });

  it("a listagem entrega a versão leve da Galeria para a miniatura", async () => {
    const { dona, ids } = await cenario();
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.cadeira, slot: "reference", photoId: ids.fotoDeMarina,
    });
    const itens = await dona.query(api.assemblyItems.listByEvent, { eventId: ids.marina });
    const cadeira = itens.find((i) => i._id === ids.cadeira)!;
    expect(cadeira.referenceFoto.origem).toBe("galeria");
    expect(cadeira.referenceFoto.previewUrl).not.toBeNull();
    // O nome antigo continua significando o ORIGINAL — nada quebrou.
    expect(cadeira.referencePhotoUrl).toBe(cadeira.referenceFoto.url);
  });

  it("foto da Galeria SEM versão leve não inventa uma", async () => {
    const { dona, ids } = await cenario();
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.cadeira, slot: "reference", photoId: ids.outraDeMarina,
    });
    const itens = await dona.query(api.assemblyItems.listByEvent, { eventId: ids.marina });
    const cadeira = itens.find((i) => i._id === ids.cadeira)!;
    expect(cadeira.referenceFoto.origem).toBe("galeria");
    expect(cadeira.referenceFoto.previewUrl).toBeNull();
    expect(cadeira.referenceFoto.url).not.toBeNull();
  });

  it("trocar o arquivo próprio pelo ponteiro apaga o arquivo órfão", async () => {
    const { dona, ids, linha, arquivoExiste } = await cenario();
    expect(await arquivoExiste(ids.arquivoProprio)).toBe(true);

    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.itemAntigo, slot: "reference", photoId: ids.fotoDeMarina,
    });

    const item = await linha(ids.itemAntigo);
    expect(item?.referencePhotoId).toBe(ids.fotoDeMarina);
    expect(item?.referencePhotoStorageId).toBeUndefined();
    // O arquivo era EXCLUSIVO do item e ninguém mais aponta para ele.
    expect(await arquivoExiste(ids.arquivoProprio)).toBe(false);
  });
});

describe("posse: id do navegador não é prova de nada", () => {
  it("foto de OUTRO evento da mesma dona é recusada", async () => {
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
        id: ids.cadeira, slot: "reference", photoId: ids.fotoDeJoana,
      }),
    ).rejects.toThrow(/não encontrada/i);
  });

  it("foto de OUTRA conta responde NOT_FOUND, nunca FORBIDDEN", async () => {
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
        id: ids.cadeira, slot: "reference", photoId: ids.fotoAlheia,
      }),
    ).rejects.toThrow(/não encontrada/i);
  });

  it("item de outra conta não recebe foto", async () => {
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
        id: ids.itemAlheio, slot: "reference", photoId: ids.fotoDeMarina,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("fornecedor de outro evento da mesma dona é recusado no item", async () => {
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.assemblyItems.update, {
        id: ids.cadeira, supplierId: ids.fornecedorDeJoana,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("fornecedor de outra conta é recusado no item", async () => {
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.assemblyItems.update, {
        id: ids.cadeira, supplierId: ids.fornecedorAlheio,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("fornecedor do PRÓPRIO evento entra", async () => {
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.assemblyItems.update, {
      id: ids.cadeira, supplierId: ids.fornecedorDeMarina, supplierName: "Móveis Bella",
    });
    const item = await linha(ids.cadeira);
    expect(item?.supplierId).toBe(ids.fornecedorDeMarina);
    expect(item?.supplierName).toBe("Móveis Bella");
  });

  it("criar item com fornecedor de outra conta é recusado", async () => {
    const { dona, ids } = await cenario();
    await expect(
      dona.mutation(api.assemblyItems.create, {
        eventId: ids.marina, area: "furniture", name: "Invasor",
        supplierId: ids.fornecedorAlheio,
        includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe",
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("um lote com um fornecedor ruim não cria NENHUM item", async () => {
    const { dona, ids, t } = await cenario();
    const antes = (await t.run((ctx: MutationCtx) =>
      ctx.db.query("assemblyItems").collect())).length;
    await expect(
      dona.mutation(api.assemblyItems.createMany, {
        eventId: ids.marina,
        items: [
          { area: "furniture", name: "Bom", includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe" },
          { area: "furniture", name: "Ruim", supplierId: ids.fornecedorAlheio, includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe" },
        ],
      }),
    ).rejects.toThrow(/não encontrado/i);
    const depois = (await t.run((ctx: MutationCtx) =>
      ctx.db.query("assemblyItems").collect())).length;
    expect(depois).toBe(antes);
  });
});

describe("exclusão: quem é dono do arquivo", () => {
  it("apagar o ITEM não apaga a foto da Galeria", async () => {
    const { dona, ids, t } = await cenario();
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.cadeira, slot: "reference", photoId: ids.fotoDeMarina,
    });
    await dona.mutation(api.assemblyItems.remove, { id: ids.cadeira });

    const foto = await t.run((ctx: MutationCtx) => ctx.db.get(ids.fotoDeMarina));
    expect(foto).not.toBeNull();
    expect(await t.run((ctx: MutationCtx) => ctx.storage.getUrl(foto!.storageId))).not.toBeNull();
  });

  it("apagar a FOTO limpa o ponteiro dos itens que a usavam", async () => {
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.cadeira, slot: "reference", photoId: ids.fotoDeMarina,
    });
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.mesa, slot: "contracted", photoId: ids.fotoDeMarina,
    });

    await dona.mutation(api.gallery.deletePhoto, { id: ids.fotoDeMarina });

    expect((await linha(ids.cadeira))?.referencePhotoId).toBeUndefined();
    expect((await linha(ids.mesa))?.contractedPhotoId).toBeUndefined();
  });

  it("apagar a foto não derruba os itens — eles continuam lá, sem imagem", async () => {
    const { dona, ids } = await cenario();
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.cadeira, slot: "reference", photoId: ids.fotoDeMarina,
    });
    await dona.mutation(api.gallery.deletePhoto, { id: ids.fotoDeMarina });

    const itens = await dona.query(api.assemblyItems.listByEvent, { eventId: ids.marina });
    const cadeira = itens.find((i) => i._id === ids.cadeira)!;
    expect(cadeira.name).toBe("Cadeira Dior");
    expect(cadeira.referenceFoto.origem).toBeNull();
    expect(cadeira.referencePhotoUrl).toBeNull();
  });

  it("`clearPhoto` tira o ponteiro e DEIXA a foto na Galeria", async () => {
    const { dona, ids, linha, t } = await cenario();
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.cadeira, slot: "reference", photoId: ids.fotoDeMarina,
    });
    await dona.mutation(api.assemblyItems.clearPhoto, { id: ids.cadeira, slot: "reference" });

    expect((await linha(ids.cadeira))?.referencePhotoId).toBeUndefined();
    expect(await t.run((ctx: MutationCtx) => ctx.db.get(ids.fotoDeMarina))).not.toBeNull();
  });

  it("`clearPhoto` num arquivo PRÓPRIO apaga o arquivo — o item era o dono", async () => {
    const { dona, ids, arquivoExiste } = await cenario();
    await dona.mutation(api.assemblyItems.clearPhoto, { id: ids.itemAntigo, slot: "reference" });
    expect(await arquivoExiste(ids.arquivoProprio)).toBe(false);
  });
});

describe("compatibilidade com o que já existe", () => {
  it("item antigo, com arquivo próprio e sem ponteiro, continua abrindo", async () => {
    const { dona, ids } = await cenario();
    const itens = await dona.query(api.assemblyItems.listByEvent, { eventId: ids.marina });
    const antigo = itens.find((i) => i._id === ids.itemAntigo)!;
    expect(antigo.referenceFoto.origem).toBe("proprio");
    expect(antigo.referenceFoto.url).not.toBeNull();
    // O caminho antigo não tem versão leve, e não inventamos uma: dizer que
    // tem faria a medição de peso mentir.
    expect(antigo.referenceFoto.previewUrl).toBeNull();
  });

  it("item sem foto nenhuma responde vazio, não quebra", async () => {
    const { dona, ids } = await cenario();
    const itens = await dona.query(api.assemblyItems.listByEvent, { eventId: ids.marina });
    const mesa = itens.find((i) => i._id === ids.mesa)!;
    expect(mesa.referenceFoto.origem).toBeNull();
    expect(mesa.contractedFoto.origem).toBeNull();
  });

  it("enviar arquivo próprio DEPOIS do ponteiro derruba o ponteiro", async () => {
    const { dona, ids, linha, t } = await cenario();
    await dona.mutation(api.assemblyItems.setPhotoDaGaleria, {
      id: ids.cadeira, slot: "reference", photoId: ids.fotoDeMarina,
    });
    const novo = await t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: { store: (b: Blob) => Promise<Id<"_storage">> } })
        .storage.store(new Blob(["nova"])),
    );
    await dona.mutation(api.assemblyItems.setPhoto, {
      id: ids.cadeira, slot: "reference", storageId: novo,
    });

    const item = await linha(ids.cadeira);
    expect(item?.referencePhotoStorageId).toBe(novo);
    // Sem isto a precedência devolveria a foto da Galeria e a decoradora veria
    // a imagem ANTIGA depois de trocar com sucesso.
    expect(item?.referencePhotoId).toBeUndefined();
  });
});

// ── A REGRA SOZINHA, SEM BANCO ───────────────────────────────────────────────
// Os casos que o banco não produz com facilidade, mas que a vida produz.
describe("resolverFotoDoItem — a precedência em si", () => {
  it("ponteiro que resolve vence o arquivo próprio", () => {
    expect(
      resolverFotoDoItem({ _id: "p1", url: "/galeria.jpg", previewUrl: "/leve.jpg" }, "/proprio.jpg"),
    ).toEqual({ url: "/galeria.jpg", previewUrl: "/leve.jpg", origem: "galeria", photoId: "p1" });
  });

  it("ponteiro cujo ARQUIVO sumiu degrada para o próprio", () => {
    // O `getUrl` do Convex devolve `null` para arquivo apagado. Sem esta
    // regra, o item apareceria sem foto embora ainda tivesse a dele.
    expect(
      resolverFotoDoItem({ _id: "p1", url: null, previewUrl: null }, "/proprio.jpg").origem,
    ).toBe("proprio");
  });

  it("ponteiro que não resolve e sem arquivo próprio = sem foto", () => {
    expect(resolverFotoDoItem(null, null)).toEqual(SEM_FOTO);
  });

  it("o contratado manda sobre a referência", () => {
    const ref = resolverFotoDoItem(null, "/ref.jpg");
    const con = resolverFotoDoItem(null, "/con.jpg");
    expect(fotoPrincipal(ref, con)).toEqual({ foto: con, ehReferencia: false });
    expect(fotoPrincipal(ref, SEM_FOTO)).toEqual({ foto: ref, ehReferencia: true });
    expect(fotoPrincipal(SEM_FOTO, SEM_FOTO).foto).toEqual(SEM_FOTO);
  });

  it("a miniatura prefere a versão leve e cai no original", () => {
    expect(urlDeMiniatura({ url: "/o.jpg", previewUrl: "/l.jpg", origem: "galeria" })).toBe("/l.jpg");
    expect(urlDeMiniatura({ url: "/o.jpg", previewUrl: null, origem: "proprio" })).toBe("/o.jpg");
    expect(urlDeMiniatura(SEM_FOTO)).toBeNull();
  });
});

// ── O FORNECEDOR CASADO NA CONVERSÃO ─────────────────────────────────────────
// O convite do briefing traz o fornecedor como TEXTO (`furnitureSupplier` é um
// campo de texto). Criar o item com o nome solto faria a decoradora escolher o
// fornecedor de novo, item a item, para alguém que já está no evento.
//
// O casamento por nome acontece na TELA, mas o que ele produz — um `supplierId`
// — passa pela guarda do servidor como qualquer outro. É isso que este bloco
// protege: a conveniência da tela não afrouxa a regra de posse.
describe("o vínculo de fornecedor vindo da conversão obedece à mesma guarda", () => {
  it("um `supplierId` do próprio evento entra no lote", async () => {
    const { dona, ids, t } = await cenario();
    await dona.mutation(api.assemblyItems.createMany, {
      eventId: ids.marina,
      items: [
        {
          area: "furniture", name: "Cadeira Dior dourada",
          supplierName: "Móveis Bella", supplierId: ids.fornecedorDeMarina,
          includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe",
        },
      ],
    });
    const criado = (await t.run((ctx: MutationCtx) =>
      ctx.db.query("assemblyItems").collect(),
    )).find((i) => i.name === "Cadeira Dior dourada");
    expect(criado?.supplierId).toBe(ids.fornecedorDeMarina);
    expect(criado?.supplierName).toBe("Móveis Bella");
  });

  it("o nome sem vínculo continua valendo como anotação", async () => {
    const { dona, ids, t } = await cenario();
    await dona.mutation(api.assemblyItems.createMany, {
      eventId: ids.marina,
      items: [
        {
          area: "flowers", name: "Rosa branca", supplierName: "Floricultura que não cadastrei",
          includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe",
        },
      ],
    });
    const criado = (await t.run((ctx: MutationCtx) =>
      ctx.db.query("assemblyItems").collect(),
    )).find((i) => i.name === "Rosa branca");
    expect(criado?.supplierId).toBeUndefined();
    expect(criado?.supplierName).toBe("Floricultura que não cadastrei");
  });
});
