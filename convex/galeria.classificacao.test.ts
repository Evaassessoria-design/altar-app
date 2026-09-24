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

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// "É ASSIM QUE QUEREMOS" NÃO É "FOI ASSIM QUE FICOU"
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// `updatePhoto` ACEITAVA `projectScope` e `ambiente` nos argumentos e os
// DESCARTAVA na gravação: o patch só carregava `caption` e `category`. A tela
// mandava a classificação, recebia "Legenda salva!" em verde, e nada era
// gravado. `savePhoto` nem aceitava os dois campos.
//
// O estrago não é perder um campo. A distinção entre REFERÊNCIA ("é assim que
// queremos") e INCLUSO ("está contratado") é o que impede uma foto de
// inspiração de ser lida como item do projeto aprovado — o schema documenta
// isso em oito linhas, `scopeMeta` desenha o selo, `AVISO_REFERENCIA` escreve
// o aviso, e nada disso chegava ao banco.
//
// Em `assemblyItems` a mesma regra sempre funcionou. Só nas FOTOS ela era
// jogada fora, e em silêncio.
//
// ── E O AMBIENTE ────────────────────────────────────────────────────────────
// `eventPhotos.ambiente` existia no schema sem nenhuma tela que o escrevesse.
// Setenta fotos de um casamento moravam todas em "antes", e a pergunta do
// galpão — "quais são as referências da mesa do bolo?" — não tinha resposta.
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
    const eventoDaDona = await evento(donaId, "Casamento Marina");
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
    const fotoDaDona = await foto(donaId, eventoDaDona, "inspiracao.jpg");
    const fotoAlheia = await foto(rivalId, eventoAlheio, "da-rival.jpg");

    return { donaId, eventoDaDona, eventoAlheio, fotoDaDona, fotoAlheia };
  });

  return { t, dona, rival, ids };
}

describe("a classificação da foto é GRAVADA", () => {
  it("referência e ambiente sobrevivem ao update", async () => {
    const { t, dona, ids } = await cenario();

    await dona.mutation(api.gallery.updatePhoto, {
      id: ids.fotoDaDona,
      caption: "Arranjo baixo âmbar",
      projectScope: "referencia",
      ambiente: "Mesa do bolo",
    });

    const foto = (await t.run((ctx: MutationCtx) => ctx.db.get(ids.fotoDaDona)))!;
    expect(foto.projectScope, "a classificação foi descartada").toBe("referencia");
    expect(foto.ambiente, "o ambiente foi descartado").toBe("Mesa do bolo");
    expect(foto.caption).toBe("Arranjo baixo âmbar");
  });

  it("e já no envio, sem precisar de um segundo passo", async () => {
    const { t, dona, ids } = await cenario();
    const storageId = await t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: { store: (b: Blob) => Promise<Id<"_storage">> } })
        .storage.store(new Blob(["y"])),
    );

    const id = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.eventoDaDona,
      storageId,
      filename: "nova.jpg",
      category: "antes",
      projectScope: "nao_incluso",
      ambiente: "  Lounge  ",
    });

    const foto = (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!;
    expect(foto.projectScope).toBe("nao_incluso");
    // Espaço em volta não vira ambiente novo: "Lounge " e "Lounge" seriam dois
    // botões de filtro para a mesma coisa.
    expect(foto.ambiente).toBe("Lounge");
  });

  it("string vazia LIMPA o ambiente; ausente não mexe", async () => {
    const { t, dona, ids } = await cenario();
    await dona.mutation(api.gallery.updatePhoto, {
      id: ids.fotoDaDona, ambiente: "Cerimônia", projectScope: "incluso",
    });

    // Ausente: a classificação continua onde estava.
    await dona.mutation(api.gallery.updatePhoto, { id: ids.fotoDaDona, caption: "só a legenda" });
    let foto = (await t.run((ctx: MutationCtx) => ctx.db.get(ids.fotoDaDona)))!;
    expect(foto.ambiente).toBe("Cerimônia");
    expect(foto.projectScope).toBe("incluso");

    // Vazio: tirar a foto do ambiente errado tem de ser possível.
    await dona.mutation(api.gallery.updatePhoto, { id: ids.fotoDaDona, ambiente: "" });
    foto = (await t.run((ctx: MutationCtx) => ctx.db.get(ids.fotoDaDona)))!;
    expect(foto.ambiente).toBeUndefined();
    expect(foto.projectScope, "limpar o ambiente não pode levar a classificação").toBe("incluso");
  });
});

describe("a pergunta do galpão tem resposta", () => {
  it("filtra por ambiente NA CONSULTA, não na página já carregada", async () => {
    const { dona, ids } = await cenario();
    await dona.mutation(api.gallery.updatePhoto, {
      id: ids.fotoDaDona, ambiente: "Mesa do bolo", projectScope: "referencia",
    });

    const doBolo = await dona.query(api.gallery.listPhotos, {
      eventId: ids.eventoDaDona, ambiente: "Mesa do bolo",
    });
    expect(doBolo).toHaveLength(1);
    expect(doBolo[0]._id).toBe(ids.fotoDaDona);

    expect(
      await dona.query(api.gallery.listPhotos, { eventId: ids.eventoDaDona, ambiente: "Bar" }),
    ).toHaveLength(0);

    // Sem filtro, continua vindo tudo.
    expect(await dona.query(api.gallery.listPhotos, { eventId: ids.eventoDaDona })).toHaveLength(1);
  });

  it("o nome do ambiente não é sensível a caixa nem a espaço", async () => {
    // Ela digita "mesa do bolo" numa foto e "Mesa do Bolo" na outra. São o
    // mesmo ambiente para quem está procurando.
    const { dona, ids } = await cenario();
    await dona.mutation(api.gallery.updatePhoto, { id: ids.fotoDaDona, ambiente: "Mesa do Bolo" });
    expect(
      await dona.query(api.gallery.listPhotos, { eventId: ids.eventoDaDona, ambiente: " mesa do bolo " }),
    ).toHaveLength(1);
  });
});

describe("foto de outra conta", () => {
  it("não pode ser classificada", async () => {
    const { t, dona, ids } = await cenario();
    await expect(
      dona.mutation(api.gallery.updatePhoto, {
        id: ids.fotoAlheia, projectScope: "incluso", ambiente: "Invadido",
      }),
    ).rejects.toThrow(/permiss/i);

    const intacta = (await t.run((ctx: MutationCtx) => ctx.db.get(ids.fotoAlheia)))!;
    expect(intacta.projectScope).toBeUndefined();
    expect(intacta.ambiente).toBeUndefined();
  });

  it("não pode receber foto nova pelo evento alheio", async () => {
    const { t, dona, ids } = await cenario();
    const storageId = await t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: { store: (b: Blob) => Promise<Id<"_storage">> } })
        .storage.store(new Blob(["z"])),
    );
    await expect(
      dona.mutation(api.gallery.savePhoto, {
        eventId: ids.eventoAlheio, storageId, filename: "x.jpg", category: "antes",
      }),
    ).rejects.toThrow();
  });

  it("e o evento alheio não lista foto nenhuma", async () => {
    const { dona, rival, ids } = await cenario();
    await rival.mutation(api.gallery.updatePhoto, {
      id: ids.fotoAlheia, ambiente: "Mesa do bolo",
    });
    // Mesmo com o ambiente igual, a consulta é presa ao dono do evento.
    expect(
      await dona.query(api.gallery.listPhotos, {
        eventId: ids.eventoAlheio, ambiente: "Mesa do bolo",
      }),
    ).toEqual([]);
  });
});

describe("a tela oferece o caminho que o dado sempre teve", () => {
  const TELA = readFileSync("src/pages/app/events/[id]/fotos/page.tsx", "utf-8");

  it("tem campo de ambiente, com sugestão do que já foi usado", () => {
    expect(TELA).toContain('id="foto-ambiente"');
    expect(TELA).toContain("ambientesUsados");
    expect(TELA).toContain("<datalist");
  });

  it("o filtro só aparece quando há ambiente classificado", () => {
    // Numa conta que ainda não usa o campo, uma fileira vazia de botões é
    // ruído — e ruído no primeiro dia é o que faz desconfiar da tela.
    expect(TELA).toMatch(/ambientesUsados\.length > 0 && \(/);
  });

  it("o estado vazio diz QUAL recorte está vazio e oferece a saída", () => {
    expect(TELA).toMatch(/Nenhuma foto em “\{ambienteFiltro\}”/);
    expect(TELA).toContain("Ver todos os ambientes");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// "SÓ PARA MIM" — O EIXO DE AUDIÊNCIA DA FOTO
//
// `projectScope` diz o que a imagem É no projeto; `category` diz QUANDO ela
// foi tirada. Nenhum dos dois diz PARA QUEM ela pode aparecer — e desde que
// existe um PDF que sai da empresa para os noivos, o documento vinha usando
// `category === "antes"` como substituto.
//
// O substituto falha no caso que mais importa: a foto do problema (o
// fornecedor mandou a cor errada) é tirada antes do evento, não tem
// classificação nenhuma, e ia impressa.
// ═════════════════════════════════════════════════════════════════════════════
describe("a foto pode ser marcada como interna", () => {
  const linha = (t: Awaited<ReturnType<typeof cenario>>["t"], id: Id<"eventPhotos">) =>
    t.run((ctx: MutationCtx) => ctx.db.get(id));

  it("marcar grava, e a leitura devolve", async () => {
    const { t, dona, ids } = await cenario();
    await dona.mutation(api.gallery.updatePhoto, {
      id: ids.fotoDaDona,
      visibility: "interno",
    });
    expect((await linha(t, ids.fotoDaDona))!.visibility).toBe("interno");

    const listadas = await dona.query(api.gallery.listPhotos, { eventId: ids.eventoDaDona });
    expect(listadas.find((f) => f._id === ids.fotoDaDona)!.visibility).toBe("interno");
  });

  it("DESMARCAR é possível — `null` limpa", async () => {
    // Sem isto, marcar por engano seria irreversível: `undefined` some no
    // transporte e o pedido de desmarcar nunca chegaria ao servidor.
    const { t, dona, ids } = await cenario();
    await dona.mutation(api.gallery.updatePhoto, { id: ids.fotoDaDona, visibility: "interno" });
    await dona.mutation(api.gallery.updatePhoto, { id: ids.fotoDaDona, visibility: null });
    expect((await linha(t, ids.fotoDaDona))!.visibility).toBeUndefined();
  });

  it("ausente é o padrão, e não vira 'interno' sozinho", async () => {
    // Nenhuma foto já enviada muda de comportamento. Se o ausente valesse
    // "interno", o documento de todo evento que já existe sairia vazio.
    const { t, dona, ids } = await cenario();
    await dona.mutation(api.gallery.updatePhoto, {
      id: ids.fotoDaDona,
      caption: "Mesa posta",
    });
    expect((await linha(t, ids.fotoDaDona))!.visibility).toBeUndefined();
  });

  it("classificar não apaga a marcação, e marcar não apaga a classificação", async () => {
    // São eixos separados: mexer num não pode zerar o outro em silêncio.
    const { t, dona, ids } = await cenario();
    await dona.mutation(api.gallery.updatePhoto, {
      id: ids.fotoDaDona, visibility: "interno", projectScope: "referencia",
    });
    await dona.mutation(api.gallery.updatePhoto, { id: ids.fotoDaDona, ambiente: "Bar" });

    const depois = (await linha(t, ids.fotoDaDona))!;
    expect(depois.visibility).toBe("interno");
    expect(depois.projectScope).toBe("referencia");
    expect(depois.ambiente).toBe("Bar");
  });

  it("a rival não marca a foto da dona", async () => {
    const { t, rival, ids } = await cenario();
    await expect(
      rival.mutation(api.gallery.updatePhoto, { id: ids.fotoDaDona, visibility: "interno" }),
    ).rejects.toThrow(/permiss/i);
    expect((await linha(t, ids.fotoDaDona))!.visibility).toBeUndefined();
  });

  it("nem a dona desmarca a foto da rival", async () => {
    const { t, dona, ids } = await cenario();
    await expect(
      dona.mutation(api.gallery.updatePhoto, { id: ids.fotoAlheia, visibility: null }),
    ).rejects.toThrow(/permiss/i);
    expect((await linha(t, ids.fotoAlheia))!.visibility).toBeUndefined();
  });
});
