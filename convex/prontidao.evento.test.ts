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
import { prontidaoDoEvento, type DadosDeProntidao } from "./lib/prontidaoDoEvento";

// ═════════════════════════════════════════════════════════════════════════════
// "ESTE EVENTO ESTÁ PRONTO PARA SER MOSTRADO?"
//
// A saúde do evento mede se a OPERAÇÃO está coberta. Esta pergunta é outra: a
// tela abre cheia ou abre vazia? Um evento pode estar 100% saudável e o
// Projeto Visual abrir em branco — foi o que a auditoria da live encontrou na
// conta de demonstração.
// ═════════════════════════════════════════════════════════════════════════════

const nada: DadosDeProntidao = {
  temCapa: false,
  fotos: 0,
  fotosClassificadas: 0,
  fotosComAmbiente: 0,
  temFotoInterna: false,
  itensDeMontagem: 0,
  itensComFotoDaGaleria: 0,
  materiaisNaFicha: 0,
  materiaisComFoto: 0,
  documentos: 0,
  fornecedores: 0,
  temConceito: false,
};

describe("a regra, sem banco", () => {
  it("evento vazio NÃO é apresentável, e diz o que falta", () => {
    const r = prontidaoDoEvento(nada);
    expect(r.apresentavel).toBe(false);
    expect(r.faltando).toBeGreaterThan(0);
    const capa = r.itens.find((i) => i.chave === "capa")!;
    expect(capa.situacao).toBe("faltando");
    expect(capa.acao).toContain("capa");
  });

  it("um item só é ATENÇÃO, não pronto — funciona e parece pobre", () => {
    // Reduzir a sim/não faria o aviso mentir nos dois sentidos: uma foto
    // classificada funciona, seis convencem.
    const r = prontidaoDoEvento({ ...nada, fotos: 1 });
    expect(r.itens.find((i) => i.chave === "fotos")!.situacao).toBe("atencao");
  });

  it("o detalhe traz NÚMERO, nunca uma promessa sem conta atrás", () => {
    const r = prontidaoDoEvento({ ...nada, fotos: 8, fotosClassificadas: 3 });
    expect(r.itens.find((i) => i.chave === "classificacao")!.detalhe).toBe(
      "3 de 8 com contratado/inspiração",
    );
  });

  it("evento completo é apresentável", () => {
    const r = prontidaoDoEvento({
      temCapa: true,
      fotos: 10,
      fotosClassificadas: 10,
      fotosComAmbiente: 10,
      temFotoInterna: true,
      itensDeMontagem: 6,
      itensComFotoDaGaleria: 2,
      materiaisNaFicha: 5,
      materiaisComFoto: 4,
      documentos: 2,
      fornecedores: 3,
      temConceito: true,
    });
    expect(r.apresentavel).toBe(true);
    expect(r.faltando).toBe(0);
    expect(r.atencao).toBe(0);
  });

  it("basta UM faltando para não apresentar", () => {
    // Todos os "faltando" são itens que fazem uma tela abrir vazia na frente
    // de quem está assistindo.
    const r = prontidaoDoEvento({
      temCapa: false,
      fotos: 10,
      fotosClassificadas: 10,
      fotosComAmbiente: 10,
      temFotoInterna: true,
      itensDeMontagem: 6,
      itensComFotoDaGaleria: 2,
      materiaisNaFicha: 5,
      materiaisComFoto: 4,
      documentos: 2,
      fornecedores: 3,
      temConceito: true,
    });
    expect(r.apresentavel).toBe(false);
  });
});

describe("a consulta, com banco", () => {
  async function cenario() {
    const t = convexTest(schema, modules);
    const dona = await autenticarComo(t, {
      nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
    });
    const rival = await autenticarComo(t, {
      nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
    });
    const ids = await t.run(async (ctx: MutationCtx) => {
      const idDe = async (sub: string) =>
        (await ctx.db
          .query("users")
          .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", sub))
          .unique())!._id;
      const donaId = await idDe("auth|aurora");
      const evento = async (userId: Id<"users">, name: string) =>
        ctx.db.insert("events", {
          userId, name, type: "wedding" as const, date: "2026-12-05",
          location: "Fazenda", clientName: "Marina", status: "planning" as const,
        });
      return {
        donaId,
        marina: await evento(donaId, "Marina & Gabriel"),
        alheio: await evento(await idDe("auth|rival"), "Da rival"),
      };
    });
    return { t, dona, rival, ids };
  }

  it("evento recém-criado diz exatamente o que falta", async () => {
    const { dona, ids } = await cenario();
    const r = await dona.query(api.health.getEventReadiness, { eventId: ids.marina });
    expect(r!.apresentavel).toBe(false);
    expect(r!.itens.find((i) => i.chave === "fotos")!.detalhe).toBe("0 fotos");
  });

  it("conta as fotos, a classificação, o ambiente e a interna", async () => {
    const { t, dona, ids } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      const storage = (ctx as unknown as {
        storage: { store: (b: Blob) => Promise<Id<"_storage">> };
      }).storage;
      const foto = async (over: Record<string, unknown>) =>
        ctx.db.insert("eventPhotos", {
          userId: ids.donaId, eventId: ids.marina,
          storageId: await storage.store(new Blob(["x"])),
          filename: "f.jpg", category: "antes" as const, order: 0,
          uploadedAt: "2026-09-01T00:00:00.000Z",
          ...over,
        });
      const capa = await foto({ projectScope: "incluso", ambiente: "Cerimônia" });
      await foto({ visibility: "interno" });
      await ctx.db.patch(ids.marina, { coverPhotoId: capa });
    });

    const r = await dona.query(api.health.getEventReadiness, { eventId: ids.marina });
    expect(r!.itens.find((i) => i.chave === "capa")!.situacao).toBe("pronto");
    expect(r!.itens.find((i) => i.chave === "fotos")!.detalhe).toBe("2 fotos");
    expect(r!.itens.find((i) => i.chave === "classificacao")!.detalhe).toContain("1 de 2");
    expect(r!.itens.find((i) => i.chave === "foto_interna")!.situacao).toBe("pronto");
  });

  it("conta os materiais da ficha que têm foto no catálogo", async () => {
    const { t, dona, ids } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      const storage = (ctx as unknown as {
        storage: { store: (b: Blob) => Promise<Id<"_storage">> };
      }).storage;
      const comFoto = await ctx.db.insert("materials", {
        userId: ids.donaId, nome: "Rosa", searchName: "rosa", unidade: "haste" as const,
        fotoStorageId: await storage.store(new Blob(["x"])),
      });
      const semFoto = await ctx.db.insert("materials", {
        userId: ids.donaId, nome: "Vaso", searchName: "vaso", unidade: "un" as const,
      });
      await ctx.db.insert("assemblyItems", {
        userId: ids.donaId, eventId: ids.marina, area: "ceremony", order: 0,
        name: "Arranjo", includeInAssemblyReport: true, checkOnAssembly: false,
        visibility: "cliente" as const,
        createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
        receita: [
          { materialId: comFoto, nome: "Rosa", unidade: "haste" as const, quantidade: 10 },
          { materialId: semFoto, nome: "Vaso", unidade: "un" as const, quantidade: 2 },
        ],
      });
    });

    const r = await dona.query(api.health.getEventReadiness, { eventId: ids.marina });
    expect(r!.itens.find((i) => i.chave === "materiais")!.detalhe).toBe("1 de 2 com foto");
  });

  it("evento de outra conta responde `null`, sem dizer que existe", async () => {
    const { dona, ids } = await cenario();
    expect(await dona.query(api.health.getEventReadiness, { eventId: ids.alheio })).toBeNull();
  });

  it("e o material de outra conta não conta como foto", async () => {
    // O vínculo da receita nasce de `setReceita`, que confere o dono — a
    // conferência aqui é a segunda tranca.
    const { t, dona, rival, ids } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      const storage = (ctx as unknown as {
        storage: { store: (b: Blob) => Promise<Id<"_storage">> };
      }).storage;
      const rivalId = (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|rival"))
        .unique())!._id;
      const daRival = await ctx.db.insert("materials", {
        userId: rivalId, nome: "Rosa da rival", searchName: "rosa da rival",
        unidade: "haste" as const, fotoStorageId: await storage.store(new Blob(["x"])),
      });
      await ctx.db.insert("assemblyItems", {
        userId: ids.donaId, eventId: ids.marina, area: "ceremony", order: 0,
        name: "Arranjo", includeInAssemblyReport: true, checkOnAssembly: false,
        visibility: "cliente" as const,
        createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
        receita: [
          { materialId: daRival, nome: "Rosa", unidade: "haste" as const, quantidade: 10 },
        ],
      });
      void rival;
    });

    const r = await dona.query(api.health.getEventReadiness, { eventId: ids.marina });
    expect(r!.itens.find((i) => i.chave === "materiais")!.detalhe).toBe("0 de 1 com foto");
  });
});
