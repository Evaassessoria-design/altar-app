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
// OUVIDORIA → PRODUTO
//
// O que estes testes protegem é o NÚMERO que prioriza roadmap: `ocorrencias`.
// Se o mesmo pedido virar dois registros de peso 1, a Ouvidoria passa a dizer
// que ninguém pediu nada duas vezes — e o que mais dói desaparece da lista.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = Date.parse("2026-09-18T12:00:00Z");

async function conversaCom(t: ReturnType<typeof convexTest>, assunto: string) {
  return t.run(async (ctx) => {
    const contactId = await ctx.db.insert("adminContacts", {
      vertical: "altar_decor",
      displayName: "Helena",
      tipo: "assinante",
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    });
    const conversationId = await ctx.db.insert("communicationConversations", {
      vertical: "altar_decor",
      channel: "whatsapp",
      contactId,
      assunto,
      status: "aberta",
      ultimaMensagemEm: AGORA,
      ultimaMensagemDirecao: "entrada",
      naoLidas: 1,
      criadaEm: AGORA,
      atualizadaEm: AGORA,
    });
    return { conversationId, contactId };
  });
}

describe("registro humano", () => {
  it("quem atendeu registra o sinal, com o próprio nome", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const { conversationId, contactId } = await conversaCom(t, "O PDF sai sem o logo");

    const { signalId, criado } = await admin.mutation(api.customerVoice.registrar, {
      tipo: "bug",
      titulo: "PDF sem logo",
      descricao: "A ficha técnica sai sem a marca da empresa.",
      severidade: "alta",
      conversationId,
      contactId,
    });

    expect(criado).toBe(true);

    const sinal = await t.run(async (ctx) => ctx.db.get(signalId));
    expect(sinal?.registradoPor).toBe("humano");
    expect(sinal?.registradoPorUserId).toBeTruthy();
    expect(sinal?.severidade).toBe("alta");
    expect(sinal?.ocorrencias).toBe(1);
    // O canal é herdado da conversa, não digitado de novo.
    expect(sinal?.channel).toBe("whatsapp");
  });

  it("o mesmo tipo na mesma conversa vira OCORRÊNCIA, não um segundo sinal", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const { conversationId } = await conversaCom(t, "Continua sem o logo");

    const primeiro = await admin.mutation(api.customerVoice.registrar, {
      tipo: "bug",
      titulo: "PDF sem logo",
      descricao: "Primeira vez",
      conversationId,
    });

    const segundo = await admin.mutation(api.customerVoice.registrar, {
      tipo: "bug",
      titulo: "PDF sem logo de novo",
      descricao: "Voltou a acontecer",
      severidade: "critica",
      conversationId,
    });

    expect(segundo.criado).toBe(false);
    expect(segundo.signalId).toBe(primeiro.signalId);

    const sinal = await t.run(async (ctx) => ctx.db.get(primeiro.signalId));
    expect(sinal?.ocorrencias).toBe(2);
    // A severidade informada por gente prevalece sobre a ausência anterior.
    expect(sinal?.severidade).toBe("critica");
  });

  it("tipos diferentes na mesma conversa são sinais diferentes", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const { conversationId } = await conversaCom(t, "Duas coisas");

    const bug = await admin.mutation(api.customerVoice.registrar, {
      tipo: "bug",
      titulo: "PDF sem logo",
      descricao: "x",
      conversationId,
    });
    const pedido = await admin.mutation(api.customerVoice.registrar, {
      tipo: "funcionalidade",
      titulo: "Queria exportar em Excel",
      descricao: "y",
      conversationId,
    });

    expect(pedido.signalId).not.toBe(bug.signalId);
  });

  it("sinal sem conversa nenhuma é aceito — reunião, ligação, e-mail", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    const { criado, signalId } = await admin.mutation(api.customerVoice.registrar, {
      tipo: "sugestao",
      titulo: "Atalho para duplicar evento",
      descricao: "Pedido numa call de onboarding.",
    });

    expect(criado).toBe(true);
    const sinal = await t.run(async (ctx) => ctx.db.get(signalId));
    expect(sinal?.conversationId).toBeUndefined();
    expect(sinal?.channel).toBeUndefined();
  });

  it("título vazio não vira sinal", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await expect(
      admin.mutation(api.customerVoice.registrar, {
        tipo: "bug",
        titulo: "   ",
        descricao: "sem título",
      }),
    ).rejects.toThrow();
  });

  it("decoradora não registra, não lista e não funde", async () => {
    const t = convexTest(schema, modules);
    await autenticarComoAdmin(t);
    const decoradora = await autenticarComoDecoradora(t);

    await expect(
      decoradora.mutation(api.customerVoice.registrar, {
        tipo: "bug",
        titulo: "tentativa",
        descricao: "x",
      }),
    ).rejects.toThrow();

    await expect(decoradora.query(api.customerVoice.listar, {})).rejects.toThrow();
  });
});

describe("filtros e recorrência", () => {
  async function semearSinais(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const base = {
        vertical: "altar_decor" as const,
        status: "novo" as const,
        ocorrencias: 1,
        ultimoRelatoEm: AGORA,
        registradoPor: "ia" as const,
        criadoEm: AGORA,
        atualizadoEm: AGORA,
      };
      await ctx.db.insert("customerVoiceSignals", {
        ...base,
        tipo: "bug",
        titulo: "Bug crítico",
        descricao: "x",
        severidade: "critica",
        ocorrencias: 9,
      });
      await ctx.db.insert("customerVoiceSignals", {
        ...base,
        tipo: "bug",
        titulo: "Bug pequeno",
        descricao: "x",
        severidade: "baixa",
      });
      await ctx.db.insert("customerVoiceSignals", {
        ...base,
        tipo: "sugestao",
        titulo: "Sugestão qualquer",
        descricao: "x",
      });
    });
  }

  it("filtra por severidade dentro do tipo", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    await semearSinais(t);

    const criticos = await admin.query(api.customerVoice.listar, {
      tipo: "bug",
      severidade: "critica",
    });

    expect(criticos.map((s) => s.titulo)).toEqual(["Bug crítico"]);
  });

  it("o painel de Produto pesa por relatos, não por registros", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    await semearSinais(t);

    const painel = await admin.query(api.customerVoice.painelDeProduto, {});

    expect(painel.porTipo.bug.sinais).toBe(2);
    expect(painel.porTipo.bug.ocorrencias).toBe(10);
    expect(painel.maisPedidos[0].titulo).toBe("Bug crítico");
  });

  it("fundir soma as ocorrências e não apaga o sinal descartado", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    const ids = await t.run(async (ctx) => {
      const base = {
        vertical: "altar_decor" as const,
        tipo: "funcionalidade" as const,
        status: "novo" as const,
        descricao: "x",
        ultimoRelatoEm: AGORA,
        registradoPor: "humano" as const,
        criadoEm: AGORA,
        atualizadoEm: AGORA,
      };
      return {
        manter: await ctx.db.insert("customerVoiceSignals", {
          ...base,
          titulo: "Exportar em Excel",
          ocorrencias: 4,
        }),
        descartar: await ctx.db.insert("customerVoiceSignals", {
          ...base,
          titulo: "Planilha do financeiro",
          ocorrencias: 5,
        }),
      };
    });

    await admin.mutation(api.customerVoice.fundir, {
      manterId: ids.manter as Id<"customerVoiceSignals">,
      descartarId: ids.descartar as Id<"customerVoiceSignals">,
    });

    const [manter, descartado] = await t.run(async (ctx) => [
      await ctx.db.get(ids.manter),
      await ctx.db.get(ids.descartar),
    ]);

    expect(manter?.ocorrencias).toBe(9);
    // Nada é apagado: o pedido de quem falou continua legível.
    expect(descartado).not.toBeNull();
    expect(descartado?.status).toBe("descartado");
    expect(descartado?.descricao).toContain("Fundido em");
  });

  it("fundir um sinal com ele mesmo é recusado", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    const id = await t.run(async (ctx) =>
      ctx.db.insert("customerVoiceSignals", {
        vertical: "altar_decor",
        tipo: "bug",
        titulo: "Um sinal",
        descricao: "x",
        status: "novo",
        ocorrencias: 1,
        ultimoRelatoEm: AGORA,
        registradoPor: "humano",
        criadoEm: AGORA,
        atualizadoEm: AGORA,
      }),
    );

    await expect(
      admin.mutation(api.customerVoice.fundir, {
        manterId: id as Id<"customerVoiceSignals">,
        descartarId: id as Id<"customerVoiceSignals">,
      }),
    ).rejects.toThrow();
  });
});
