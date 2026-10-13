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
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ehObrigacaoDeMontagem, ehOpcional, escopoDoItem } from "./lib/escopoDoProjeto";

// ═════════════════════════════════════════════════════════════════════════════
// O ITEM OPCIONAL SOB ATAQUE
//
// O opcional é o único item que carrega PREÇO para a cliente
// (`valorOpcional`). Isso faz dele o alvo: a concorrente que cola um id no
// navegador, o número que não é número, e — o mais provável — o opcional que
// escorrega para o caminhão porque alguma regra não o reconheceu.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });
  const outra = await autenticarComo(t, {
    nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
  });
  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (subject: string) =>
      (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", subject))
        .unique())!._id;
    const donaId = await idDe("auth|aurora");
    const eventoDaDona = await ctx.db.insert("events", {
      userId: donaId, name: "Casamento Marina", type: "wedding",
      date: "2026-12-05", location: "Fazenda", clientName: "Marina", status: "planning",
    });
    const lounge = await ctx.db.insert("assemblyItems", {
      userId: donaId, eventId: eventoDaDona, area: "furniture", order: 0, name: "Lounge adicional",
      ambiente: "Lounge", includeInAssemblyReport: true, checkOnAssembly: false, visibility: "cliente",
      createdAt: "2026-10-01", updatedAt: "2026-10-01",
    });
    return { eventoDaDona, lounge };
  });
  return { t, dona, outra, ...ids };
}

describe("a dona marca o opcional e o valor", () => {
  it("grava, lê de volta e limpa o valor com null", async () => {
    const { dona, eventoDaDona, lounge } = await cenario();
    await dona.mutation(api.assemblyItems.update, { id: lounge, projectScope: "opcional", valorOpcional: 2980 });
    let itens = await dona.query(api.assemblyItems.listByEvent, { eventId: eventoDaDona });
    expect(itens[0]).toMatchObject({ projectScope: "opcional", valorOpcional: 2980 });

    await dona.mutation(api.assemblyItems.update, { id: lounge, valorOpcional: null });
    itens = await dona.query(api.assemblyItems.listByEvent, { eventId: eventoDaDona });
    expect(itens[0].valorOpcional).toBeUndefined();
    expect(itens[0].projectScope).toBe("opcional");
  });

  it("zero é cortesia, e é gravado como zero", async () => {
    const { dona, eventoDaDona, lounge } = await cenario();
    await dona.mutation(api.assemblyItems.update, { id: lounge, projectScope: "opcional", valorOpcional: 0 });
    const itens = await dona.query(api.assemblyItems.listByEvent, { eventId: eventoDaDona });
    expect(itens[0].valorOpcional).toBe(0);
  });

  it("confirmar é trocar para incluso: o valor que ela digitou não é apagado", async () => {
    const { dona, eventoDaDona, lounge } = await cenario();
    await dona.mutation(api.assemblyItems.update, { id: lounge, projectScope: "opcional", valorOpcional: 2980 });
    await dona.mutation(api.assemblyItems.update, { id: lounge, projectScope: "incluso" });
    const [item] = await dona.query(api.assemblyItems.listByEvent, { eventId: eventoDaDona });
    expect(item.projectScope).toBe("incluso");
    expect(item.valorOpcional).toBe(2980);
    expect(ehObrigacaoDeMontagem(item)).toBe(true);
  });
});

describe("número que não é dinheiro", () => {
  it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY], [1e12]])("recusa %s e não grava nada", async (valor) => {
    const { dona, eventoDaDona, lounge } = await cenario();
    await expect(
      dona.mutation(api.assemblyItems.update, { id: lounge, projectScope: "opcional", valorOpcional: valor }),
    ).rejects.toThrow();
    const [item] = await dona.query(api.assemblyItems.listByEvent, { eventId: eventoDaDona });
    // A mutation é atômica: o escopo também não mudou.
    expect(item.projectScope).toBeUndefined();
    expect(item.valorOpcional).toBeUndefined();
  });
});

describe("a concorrente", () => {
  it("não muda o item de outra conta — e ouve NOT_FOUND, não \"sem permissão\"", async () => {
    const { outra, dona, eventoDaDona, lounge } = await cenario();
    await expect(
      outra.mutation(api.assemblyItems.update, { id: lounge, projectScope: "opcional", valorOpcional: 1 }),
    ).rejects.toThrow(/não encontrado/i);
    const [item] = await dona.query(api.assemblyItems.listByEvent, { eventId: eventoDaDona });
    expect(item.projectScope).toBeUndefined();
    expect(item.valorOpcional).toBeUndefined();
  });

  it("não lê os itens, as fotos, a planta, a equipe nem o acervo do evento alheio", async () => {
    const { outra, dona, eventoDaDona, lounge } = await cenario();
    await dona.mutation(api.assemblyItems.update, { id: lounge, projectScope: "opcional", valorOpcional: 2980 });
    // As MESMAS consultas que montam o caderno (`fontes-do-caderno.ts`).
    expect(await outra.query(api.assemblyItems.listByEvent, { eventId: eventoDaDona })).toEqual([]);
    expect(await outra.query(api.gallery.listPhotos, { eventId: eventoDaDona })).toEqual([]);
    expect(await outra.query(api.layoutRenders.listByEvent, { eventId: eventoDaDona })).toEqual([]);
    expect(await outra.query(api.team.listEventTeam, { eventId: eventoDaDona })).toEqual([]);
    expect(await outra.query(api.briefing.getChecklist, { eventId: eventoDaDona, phase: "pre" })).toEqual([]);
    expect(await outra.query(api.acervo.doEvento, { eventId: eventoDaDona })).toBeNull();
  });

  it("sem sessão, nada", async () => {
    const { t, lounge } = await cenario();
    await expect(t.mutation(api.assemblyItems.update, { id: lounge, valorOpcional: 1 })).rejects.toThrow();
  });
});

describe("o opcional nunca escorrega para a operação", () => {
  it("não é obrigação de montagem, de compra nem de reserva", () => {
    expect(escopoDoItem({ projectScope: "opcional" })).toBe("opcional");
    expect(ehOpcional({ projectScope: "opcional" })).toBe(true);
    expect(ehObrigacaoDeMontagem({ projectScope: "opcional" })).toBe(false);
    // As três de antes continuam iguais.
    expect(ehObrigacaoDeMontagem({ projectScope: "incluso" })).toBe(true);
    expect(ehObrigacaoDeMontagem({})).toBe(true);
    expect(ehObrigacaoDeMontagem({ projectScope: "referencia" })).toBe(false);
  });

  it("a FOTO não aceita \"opcional\": o escopo novo é só do item", async () => {
    const { t, dona, eventoDaDona } = await cenario();
    const fotoId = await t.run(async (ctx: MutationCtx) => {
      const ev = await ctx.db.get(eventoDaDona);
      // `store` existe no convex-test, mas o tipo de MutationCtx não o expõe
      // — mesmo contorno de acervo-de-imagens.test.ts.
      const storage = (ctx as unknown as {
        storage: { store: (b: Blob) => Promise<Id<"_storage">> };
      }).storage;
      const storageId = await storage.store(new Blob(["x"]));
      return ctx.db.insert("eventPhotos", {
        userId: ev!.userId, eventId: eventoDaDona, storageId, filename: "a.jpg",
        category: "antes", order: 0, uploadedAt: "2026-10-01",
      });
    });
    await expect(
      dona.mutation(api.gallery.updatePhoto, { id: fotoId, projectScope: "opcional" } as never),
    ).rejects.toThrow(/projectScope|validator|opcional/i);
    // Controle: a mesma chamada com um escopo de foto passa — a recusa acima é
    // pelo VALOR, não por argumento errado.
    await dona.mutation(api.gallery.updatePhoto, { id: fotoId, projectScope: "incluso" });
  });
});
