import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * A varredura agenda o próprio lote seguinte, e um lote agendado fica
 * PENDENTE até o relógio andar. Acompanhar a cadeia inteira é, no teste,
 * deixar o agendador do Convex trabalhar até não sobrar lote nenhum.
 */
async function acompanharAVarredura(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

// ═════════════════════════════════════════════════════════════════════════════
// AS VARREDURAS PRECISAM ALCANÇAR A BASE INTEIRA
//
// Três varreduras liam `take(500)` ou `take(1_000)` da tabela de assinantes e
// filtravam na memória. Nenhuma delas falhava: elas simplesmente PARAVAM na
// linha 500 e seguiam devolvendo sucesso.
//
// O efeito só apareceria como "o ALTAR não me avisou do evento" ou "ninguém
// viu a conversa escalada", meses depois, sem erro em lugar nenhum. Estes
// testes existem para que o teto volte a ser um defeito visível.
// ═════════════════════════════════════════════════════════════════════════════

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const AGORA = Date.parse("2026-09-19T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;

describe("a varredura diária alcança quem está além da primeira página", () => {
  it("o assinante de número 150 também recebe o aviso de trial", async () => {
    const t = convexTest(schema, modules);

    // 150 contas em trial acabando: mais do que cabe num lote (100).
    const ids = await t.run(async (ctx) => {
      const criados: Id<"users">[] = [];
      for (let i = 0; i < 150; i++) {
        criados.push(
          await ctx.db.insert("users", {
            name: `Decoradora ${i}`,
            email: `decoradora${i}@example.com`,
            role: "user",
            subscriptionStatus: "trial",
            trialStartDate: new Date(AGORA - 12 * DIA).toISOString(),
            trialEndDate: new Date(AGORA + 2 * DIA).toISOString(),
          }),
        );
      }
      return criados;
    });

    await t.mutation(internal.notifications.generateDailyAlerts, { agora: AGORA });
    await acompanharAVarredura(t);

    const avisados = await t.run(async (ctx) => {
      const total: string[] = [];
      for (const userId of ids) {
        const n = await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
        if (n) total.push(userId);
      }
      return total;
    });

    expect(avisados.length, `só ${avisados.length} de 150 foram avisados`).toBe(150);
  });

  it("o dia usado é o do COMEÇO da varredura, mesmo atravessando a meia-noite", async () => {
    // A regra "um aviso de trial por dia" compara com `createdAt.slice(0,10)`.
    // Se cada lote lesse o relógio de novo, a virada do dia produziria um
    // segundo aviso para quem caiu no lote seguinte.
    const t = convexTest(schema, modules);
    const quaseMeiaNoite = Date.parse("2026-09-19T23:59:30Z");

    await t.run(async (ctx) => {
      for (let i = 0; i < 120; i++) {
        await ctx.db.insert("users", {
          name: `Decoradora ${i}`,
          email: `d${i}@example.com`,
          role: "user",
          subscriptionStatus: "trial",
          trialStartDate: new Date(quaseMeiaNoite - 12 * DIA).toISOString(),
          trialEndDate: new Date(quaseMeiaNoite + 2 * DIA).toISOString(),
        });
      }
    });

    await t.mutation(internal.notifications.generateDailyAlerts, { agora: quaseMeiaNoite });
    await acompanharAVarredura(t);

    const dias = await t.run(async (ctx) => {
      const todas = await ctx.db.query("notifications").collect();
      return [...new Set(todas.map((n) => n.createdAt.slice(0, 10)))];
    });

    expect(dias).toEqual(["2026-09-19"]);
  });

  it("não duplica aviso quando roda duas vezes no mesmo dia", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Única",
        email: "unica@example.com",
        role: "user",
        subscriptionStatus: "trial",
        trialStartDate: new Date(AGORA - 12 * DIA).toISOString(),
        trialEndDate: new Date(AGORA + 2 * DIA).toISOString(),
      });
    });

    await t.mutation(internal.notifications.generateDailyAlerts, { agora: AGORA });
    await acompanharAVarredura(t);
    await t.mutation(internal.notifications.generateDailyAlerts, { agora: AGORA });
    await acompanharAVarredura(t);

    const total = await t.run(async (ctx) =>
      (await ctx.db.query("notifications").collect()).length,
    );
    expect(total).toBe(1);
  });
});

describe("o administrador é encontrado por índice, não por varredura com teto", () => {
  it("avisa o administrador cadastrado DEPOIS de 550 assinantes", async () => {
    const t = convexTest(schema, modules);

    const { conversationId, adminId } = await t.run(async (ctx) => {
      // 550 contas comuns primeiro: com o antigo `take(500)`, o admin abaixo
      // ficava fora da lista e não recebia nada.
      for (let i = 0; i < 550; i++) {
        await ctx.db.insert("users", {
          name: `Cliente ${i}`,
          email: `cliente${i}@example.com`,
          role: "user",
          subscriptionStatus: "active",
        });
      }

      const adminId = await ctx.db.insert("users", {
        name: "Matheus",
        email: "matheus@altar.example",
        role: "admin",
        subscriptionStatus: "active",
      });

      const contactId = await ctx.db.insert("adminContacts", {
        vertical: "altar_decor",
        displayName: "Beatriz",
        criadoEm: AGORA,
        atualizadoEm: AGORA,
      });

      const conversationId = await ctx.db.insert("communicationConversations", {
        vertical: "altar_decor",
        channel: "whatsapp",
        contactId,
        assunto: "Condição especial",
        status: "aberta",
        ultimaMensagemEm: AGORA,
        ultimaMensagemDirecao: "entrada",
        naoLidas: 1,
        criadaEm: AGORA,
        atualizadaEm: AGORA,
      });

      return { conversationId, adminId };
    });

    await t.mutation(internal.communicationsTriage.aplicarTriagem, {
      conversationId,
      vertical: "altar_decor",
      departamento: "comercial",
      categoria: "conversao",
      prioridade: "urgente",
      escalar: true,
      motivoDoEscalonamento: "Desconto fora da tabela",
      confianca: 0.5,
      resumo: "Rede de 14 decoradoras pedindo condição especial.",
      sinais: ["fora da política"],
      modelo: "teste",
      promptVersao: "teste-1",
      agora: AGORA,
    });

    const avisos = await t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", adminId))
        .collect(),
    );

    expect(avisos).toHaveLength(1);
    expect(avisos[0].type).toBe("central_escalado");
  });
});
