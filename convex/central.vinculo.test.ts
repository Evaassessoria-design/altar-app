import { describe, expect, it, vi } from "vitest";

// Mesma substituição de sessão dos demais testes da Central — ver test.auth.ts.
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
import { autenticarComoAdmin, autenticarComoDecoradora } from "./test.auth";
import type { Id } from "./_generated/dataModel";

// ═════════════════════════════════════════════════════════════════════════════
// VÍNCULO DO CONTATO — uma AFIRMAÇÃO sobre quem é a pessoa
//
// Vincular diz "esta conversa é desta pessoa", e a operação passa a agir com
// base nisso. Duas coisas precisam ser verdade:
//
//   1. dá para DESFAZER — um vínculo errado (telefone reaproveitado, homônimo,
//      clique trocado) não pode ser permanente;
//   2. fica registrado QUEM fez e QUANDO, nos dois sentidos.
//
// E a fronteira de sempre: nada disto alcança `leads`, que são os clientes das
// decoradoras.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = Date.parse("2026-09-18T12:00:00Z");

async function contatoSolto(t: ReturnType<typeof convexTest>, telefone = "+5511999998888") {
  return t.run(async (ctx) => {
    const contactId = await ctx.db.insert("adminContacts", {
      vertical: "altar_decor",
      displayName: "Número desconhecido",
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    });
    await ctx.db.insert("communicationIdentities", {
      contactId,
      channel: "whatsapp",
      externalId: telefone,
      verificadoPor: "automatico",
      criadoEm: AGORA,
    });
    return contactId;
  });
}

describe("vincular e desvincular, com autor", () => {
  it("vincular grava a decisão como humana, com quem decidiu", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const contactId = await contatoSolto(t);

    const leadId = await t.run(async (ctx) =>
      ctx.db.insert("landingLeads", {
        name: "Helena Prado",
        email: "helena@example.com",
        intent: "demo",
        whatsappE164: "+5511999998888",
      }),
    );

    await admin.mutation(api.communications.vincularContato, {
      contactId,
      landingLeadId: leadId,
    });

    const contato = await t.run(async (ctx) => ctx.db.get(contactId));
    expect(contato?.landingLeadId).toBe(leadId);
    expect(contato?.tipo).toBe("interessado");
    expect(contato?.vinculoOrigem).toBe("humano");
    expect(contato?.vinculoPorUserId).toBeTruthy();
    expect(contato?.vinculoEm).toBeTypeOf("number");
  });

  it("desvincular devolve o contato a 'desconhecido' e registra quem desfez", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const contactId = await contatoSolto(t);

    const leadId = await t.run(async (ctx) =>
      ctx.db.insert("landingLeads", {
        name: "Helena Prado",
        email: "helena@example.com",
        intent: "demo",
      }),
    );

    await admin.mutation(api.communications.vincularContato, { contactId, landingLeadId: leadId });
    const resultado = await admin.mutation(api.communications.desvincularContato, { contactId });

    expect(resultado.removido).toBe(true);

    const contato = await t.run(async (ctx) => ctx.db.get(contactId));
    expect(contato?.landingLeadId).toBeUndefined();
    expect(contato?.userId).toBeUndefined();
    expect(contato?.tipo).toBe("desconhecido");
    expect(contato?.vinculoOrigem).toBeUndefined();
    expect(contato?.vinculoRemovidoEm).toBeTypeOf("number");
    expect(contato?.vinculoRemovidoPorUserId).toBeTruthy();

    // O CONTATO continua existindo — desvincular não apaga ninguém.
    expect(contato).not.toBeNull();
  });

  it("dá para desfazer só um dos lados", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const contactId = await contatoSolto(t);

    const { leadId, userId } = await t.run(async (ctx) => ({
      leadId: await ctx.db.insert("landingLeads", {
        name: "Helena",
        email: "helena@example.com",
        intent: "demo",
      }),
      userId: await ctx.db.insert("users", {
        name: "Helena",
        email: "helena@example.com",
        role: "user",
        subscriptionStatus: "active",
      }),
    }));

    await admin.mutation(api.communications.vincularContato, {
      contactId,
      landingLeadId: leadId,
      userId,
    });

    await admin.mutation(api.communications.desvincularContato, {
      contactId,
      removerAssinante: true,
    });

    const contato = await t.run(async (ctx) => ctx.db.get(contactId));
    expect(contato?.userId).toBeUndefined();
    expect(contato?.landingLeadId).toBe(leadId);
    expect(contato?.tipo).toBe("interessado");
  });

  it("desvincular quem não tem vínculo não inventa registro", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const contactId = await contatoSolto(t);

    const resultado = await admin.mutation(api.communications.desvincularContato, { contactId });
    expect(resultado.removido).toBe(false);

    const contato = await t.run(async (ctx) => ctx.db.get(contactId));
    expect(contato?.vinculoRemovidoEm).toBeUndefined();
  });

  it("uma decoradora não vincula nem desvincula nada", async () => {
    const t = convexTest(schema, modules);
    await autenticarComoAdmin(t);
    const contactId = await contatoSolto(t);
    const decoradora = await autenticarComoDecoradora(t);

    await expect(
      decoradora.mutation(api.communications.desvincularContato, { contactId }),
    ).rejects.toThrow();

    await expect(
      decoradora.query(api.communications.buscarCandidatosDeVinculo, { termo: "helena" }),
    ).rejects.toThrow();
  });
});

describe("encontrar quem vincular", () => {
  it("acha o interessado pelo nome, pelo e-mail e pelo telefone", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("landingLeads", {
        name: "Helena Prado",
        email: "helena@example.com",
        intent: "demo",
        whatsappE164: "+5511999998888",
      });
      await ctx.db.insert("landingLeads", {
        name: "Bruno Lima",
        email: "bruno@example.com",
        intent: "beta",
      });
    });

    const porNome = await admin.query(api.communications.buscarCandidatosDeVinculo, {
      termo: "helena",
    });
    expect(porNome.interessados.map((i) => i.name)).toEqual(["Helena Prado"]);

    const porEmail = await admin.query(api.communications.buscarCandidatosDeVinculo, {
      termo: "bruno@example.com",
    });
    expect(porEmail.interessados.map((i) => i.name)).toContain("Bruno Lima");

    const porTelefone = await admin.query(api.communications.buscarCandidatosDeVinculo, {
      termo: "11999998888",
    });
    expect(porTelefone.interessados.map((i) => i.name)).toEqual(["Helena Prado"]);
  });

  it("acha o assinante — e não conta nada sobre a assinatura dele", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Carla Souza",
        email: "carla@example.com",
        role: "user",
        subscriptionStatus: "active",
        phone: "+5511888887777",
        asaasCustomerId: "cus_123",
      });
    });

    const achados = await admin.query(api.communications.buscarCandidatosDeVinculo, {
      termo: "carla",
    });

    expect(achados.assinantes).toHaveLength(1);
    const assinante = achados.assinantes[0] as Record<string, unknown>;
    expect(assinante.name).toBe("Carla Souza");
    // A Central classifica assunto de cobrança; nunca lê o estado dela.
    expect(assinante).not.toHaveProperty("subscriptionStatus");
    expect(assinante).not.toHaveProperty("asaasCustomerId");
  });

  it("termo curto demais não devolve a base inteira", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("landingLeads", {
        name: "Helena",
        email: "helena@example.com",
        intent: "demo",
      });
    });

    const achados = await admin.query(api.communications.buscarCandidatosDeVinculo, { termo: "h" });
    expect(achados.interessados).toEqual([]);
    expect(achados.assinantes).toEqual([]);
  });

  it("nunca devolve cliente de decoradora: `leads` não é consultada", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    const decoradoraId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Decoradora",
        email: "deco@example.com",
        role: "user",
        subscriptionStatus: "active",
      }),
    );

    // Uma noiva no funil da decoradora, com o MESMO nome do que vamos buscar.
    await t.run(async (ctx) => {
      await ctx.db.insert("leads", {
        userId: decoradoraId as Id<"users">,
        clientName: "Helena Prado",
        stage: "contact",
        order: 0,
      });
    });

    const achados = await admin.query(api.communications.buscarCandidatosDeVinculo, {
      termo: "helena",
    });

    expect(achados.interessados).toEqual([]);
    expect(achados.assinantes).toEqual([]);
  });
});
