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
// UM ARQUIVO QUE JÁ NÃO EXISTE NÃO PODE TRANCAR A LINHA
//
// O Convex LANÇA ao apagar arquivo inexistente ("Delete on non-existent doc"),
// e uma mutation que lança aborta inteira. Então todo `ctx.storage.delete`
// solto é uma exclusão que pode ficar pela metade — com o pior desfecho
// possível: o ARQUIVO some e a LINHA fica, ou a linha fica e a tela diz que
// apagou.
//
// `lib/cascade.ts` escreveu essa regra inteira e exportou `safeDeleteFile`
// "porque a regra vale fora da cascata também". Três caminhos não a seguiam,
// e os testes abaixo falham em todos eles sem a correção:
//
//   gallery.deletePhoto        → a foto sobrevivia e não podia ser apagada
//   assemblyItems.remove       → o item sobrevivia
//   assemblyItems.setPhoto     → a foto NOVA não era gravada
//   contracts.saveContract     → a substituição do contrato travava
//
// Nenhum é alcançável pela interface hoje — nada no ALTAR apaga arquivo
// deixando a linha. Mas as funções do Convex são chamáveis do navegador, e a
// versão leve da foto acabou de DOBRAR o número de arquivos por linha.
// ═════════════════════════════════════════════════════════════════════════════

type Storage = { store: (b: Blob) => Promise<Id<"_storage">> };

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const uid = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora"))
      .unique())!._id;
    return {
      uid,
      evento: await ctx.db.insert("events", {
        userId: uid, name: "Marina & Gabriel", type: "wedding" as const,
        date: "2026-12-05", location: "Fazenda", clientName: "Marina",
        status: "planning" as const,
      }),
    };
  });

  const guardar = (conteudo: string) =>
    t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: Storage }).storage.store(new Blob([conteudo])),
    );
  /** O arquivo some por fora — é o estado que trancava tudo. */
  const sumirArquivo = (id: Id<"_storage">) =>
    t.run(async (ctx: MutationCtx) => ctx.storage.delete(id));

  return { t, dona, ids, guardar, sumirArquivo };
}

describe("a foto sai mesmo quando o arquivo já sumiu", () => {
  it("deletePhoto apaga a LINHA, não só tenta apagar o arquivo", async () => {
    const { t, dona, ids, guardar, sumirArquivo } = await cenario();
    const arquivo = await guardar("original");
    const foto = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.evento, storageId: arquivo, filename: "arco.jpg", category: "antes",
    });
    await sumirArquivo(arquivo);

    await dona.mutation(api.gallery.deletePhoto, { id: foto });

    expect(
      await t.run((ctx: MutationCtx) => ctx.db.get(foto)),
      "a foto ficou no banco e não pode mais ser apagada",
    ).toBeNull();
  });

  it("e também quando foi a VERSÃO LEVE que sumiu", async () => {
    const { t, dona, ids, guardar, sumirArquivo } = await cenario();
    const original = await guardar("original");
    const preview = await guardar("leve");
    const foto = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.evento, storageId: original, previewStorageId: preview,
      filename: "arco.jpg", category: "antes",
    });
    await sumirArquivo(preview);

    await dona.mutation(api.gallery.deletePhoto, { id: foto });

    expect(await t.run((ctx: MutationCtx) => ctx.db.get(foto))).toBeNull();
    // O original tinha de sair junto — a falha no derivado não podia
    // interromper a exclusão antes de chegar nele.
    expect(await t.run((ctx: MutationCtx) => ctx.storage.getUrl(original))).toBeNull();
  });
});

describe("versão leve não pode ser o próprio original", () => {
  it("o apelido é recusado na gravação", async () => {
    // Um arquivo com dois nomes faria a grade baixar o original achando que
    // baixava a miniatura — e, antes da correção de `deletePhoto`, tornava a
    // foto indelével.
    const { t, dona, ids, guardar } = await cenario();
    const arquivo = await guardar("um-arquivo-so");
    const foto = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.evento, storageId: arquivo, previewStorageId: arquivo,
      filename: "arco.jpg", category: "antes",
    });

    const linha = (await t.run((ctx: MutationCtx) => ctx.db.get(foto)))!;
    expect(linha.storageId).toBe(arquivo);
    expect(linha.previewStorageId, "guardou o apelido como se fosse preview").toBeUndefined();
  });

  it("e a foto continua podendo ser apagada", async () => {
    const { t, dona, ids, guardar } = await cenario();
    const arquivo = await guardar("um-arquivo-so");
    const foto = await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.evento, storageId: arquivo, previewStorageId: arquivo,
      filename: "arco.jpg", category: "antes",
    });
    await dona.mutation(api.gallery.deletePhoto, { id: foto });
    expect(await t.run((ctx: MutationCtx) => ctx.db.get(foto))).toBeNull();
  });
});

describe("o item de montagem sai, e a troca de foto acontece", () => {
  const criarItem = (dona: Awaited<ReturnType<typeof cenario>>["dona"], eventId: Id<"events">) =>
    dona.mutation(api.assemblyItems.create, {
      eventId, area: "ceremony", name: "Arco de oliveiras",
      includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe",
    });

  it("remove apaga o item mesmo com arquivo inexistente", async () => {
    const { t, dona, ids, guardar, sumirArquivo } = await cenario();
    const item = await criarItem(dona, ids.evento);
    const arquivo = await guardar("foto-do-item");
    await dona.mutation(api.assemblyItems.setPhoto, {
      id: item, slot: "reference", storageId: arquivo,
    });
    await sumirArquivo(arquivo);

    await dona.mutation(api.assemblyItems.remove, { id: item });

    expect(await t.run((ctx: MutationCtx) => ctx.db.get(item))).toBeNull();
  });

  it("setPhoto GRAVA a foto nova mesmo quando a anterior já sumiu", async () => {
    // Era o pior dos quatro: a decoradora trocava a foto, o pedido falhava, e
    // a antiga continuava ali — sem ninguém explicar por quê.
    const { t, dona, ids, guardar, sumirArquivo } = await cenario();
    const item = await criarItem(dona, ids.evento);
    const antiga = await guardar("antiga");
    const nova = await guardar("nova");
    await dona.mutation(api.assemblyItems.setPhoto, {
      id: item, slot: "reference", storageId: antiga,
    });
    await sumirArquivo(antiga);

    await dona.mutation(api.assemblyItems.setPhoto, {
      id: item, slot: "reference", storageId: nova,
    });

    const linha = (await t.run((ctx: MutationCtx) => ctx.db.get(item)))!;
    expect(linha.referencePhotoStorageId, "a foto nova não foi gravada").toBe(nova);
  });
});

describe("o contrato pode ser substituído mesmo com arquivo órfão", () => {
  it("saveContract troca o documento sem travar", async () => {
    const { t, dona, ids, guardar, sumirArquivo } = await cenario();
    const velho = await guardar("contrato-velho");
    await dona.mutation(api.contracts.saveContract, {
      eventId: ids.evento, storageId: velho, filename: "contrato.pdf",
    });
    await sumirArquivo(velho);

    const novo = await guardar("contrato-novo");
    await dona.mutation(api.contracts.saveContract, {
      eventId: ids.evento, storageId: novo, filename: "contrato-v2.pdf",
    });

    const linhas = await t.run((ctx: MutationCtx) =>
      ctx.db.query("contracts").withIndex("by_event", (q) => q.eq("eventId", ids.evento)).collect(),
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].storageId).toBe(novo);
  });
});

describe("a cascata já seguia a regra, e continua seguindo", () => {
  it("o evento inteiro sai com arquivo faltando no meio", async () => {
    const { t, dona, ids, guardar, sumirArquivo } = await cenario();
    const bom = await guardar("ok");
    const sumido = await guardar("vai-sumir");
    await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.evento, storageId: bom, filename: "a.jpg", category: "antes",
    });
    await dona.mutation(api.gallery.savePhoto, {
      eventId: ids.evento, storageId: sumido, filename: "b.jpg", category: "antes",
    });
    await sumirArquivo(sumido);

    await dona.mutation(api.events.remove, { id: ids.evento });

    expect(await t.run((ctx: MutationCtx) => ctx.db.get(ids.evento))).toBeNull();
    expect(await t.run((ctx: MutationCtx) => ctx.storage.getUrl(bom))).toBeNull();
  });
});
