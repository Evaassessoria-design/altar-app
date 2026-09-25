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

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// A TELA DE EVENTOS COM UMA CONTA DE VERDADE
//
// A decoradora piloto tem cerca de 40 eventos. `health.listCards` chamava
// `computeHealth` UMA VEZ POR EVENTO, e cada chamada abria seis consultas mais
// um `db.get` por pessoa escalada: cerca de 360 operações de banco para
// desenhar a primeira tela que ela abre. A 300 eventos passaria de 2.500.
//
// O custo agora é FIXO: sete consultas por dono, agrupadas em memória. Estes
// testes protegem as duas coisas que precisam continuar valendo JUNTAS — o
// número de consultas não cresce com os eventos, E a pontuação não mudou.
// ═════════════════════════════════════════════════════════════════════════════

const HEALTH = readFileSync("convex/health.ts", "utf-8");

/**
 * O corpo de `listCards`, SEM comentários.
 *
 * Sem o filtro, a trava casava com a própria explicação: o comentário que
 * conta por que a listagem deixou de chamar `computeHealth` cita o nome dela.
 * É a sexta vez que uma leitura de fonte neste repositório tropeça no próprio
 * texto — por isso o filtro vem antes da busca, não depois.
 */
function corpoDaListagem(): string {
  const i = HEALTH.indexOf("export const listCards");
  const proxima = HEALTH.indexOf("export const", i + 10);
  return HEALTH.slice(i, proxima === -1 ? HEALTH.length : proxima)
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

async function contaCom(eventos: number) {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const userId = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora"))
      .unique())!._id;

    const membro = await ctx.db.insert("teamMembers", {
      userId, name: "Camila", role: "Coordenação", phone: "11999",
    });

    const criados: Id<"events">[] = [];
    for (let i = 0; i < eventos; i++) {
      const eventId = await ctx.db.insert("events", {
        userId,
        name: `Evento ${i}`,
        type: "wedding" as const,
        date: `2026-12-${String((i % 28) + 1).padStart(2, "0")}`,
        location: "Fazenda",
        clientName: "Marina",
        status: "planning" as const,
      });
      criados.push(eventId);
      // Cada evento com um pouco de tudo — é o que fazia a conta explodir.
      await ctx.db.insert("eventTeam", { userId, eventId, teamMemberId: membro });
      await ctx.db.insert("eventSuppliers", {
        userId, eventId, category: "assessoria", companyName: `Assessoria ${i}`,
      });
      await ctx.db.insert("briefings", { userId, eventId, guestCount: "120" });
      await ctx.db.insert("assemblyItems", {
        userId, eventId, area: "ceremony", order: 0, name: "Arranjo",
        includeInAssemblyReport: true, checkOnAssembly: false,
        visibility: "equipe" as const,
        createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
      });
      await ctx.db.insert("transactions", {
        userId, eventId, type: "income" as const, category: "Contrato",
        description: "Sinal", amount: 1000, date: "2026-10-01", isPaid: false,
      });
    }
    return { userId, criados };
  });

  return { t, dona, ids };
}

describe("a listagem lê em LOTE, não por evento", () => {
  it("nenhuma consulta acontece dentro do laço de eventos", () => {
    // A trava é de leitura de fonte porque o custo não aparece em asserção:
    // 40 eventos respondem rápido mesmo do jeito errado, e o defeito só
    // apareceria em produção, com a conta já grande.
    const corpo = corpoDaListagem();
    const laco = corpo.slice(corpo.indexOf("return events.map("));
    expect(laco, "N+1: consulta dentro do laço da listagem").not.toContain("ctx.db");
    expect(corpo, "a listagem voltou a chamar computeHealth por evento").not.toContain(
      "computeHealth",
    );
    expect(corpo).toContain('withIndex("by_user"');
  });

  it("e a listagem NÃO monta a lista de avisos, que ela joga fora", () => {
    // `attention` percorre fornecedor por fornecedor montando frases. O cartão
    // usa percentual, situação, convidados, assessoria e responsável — nada
    // mais. Montar e descartar era trabalho puro.
    expect(corpoDaListagem()).not.toContain("h.attention");
  });
});

describe("a pontuação não mudou ao ler em lote", () => {
  it("a listagem e a tela do evento concordam, evento por evento", async () => {
    // O risco real de separar leitura de cálculo é a listagem passar a
    // responder diferente da tela. Divergindo, a decoradora vê 71% no cartão
    // e 86% ao abrir o mesmo evento.
    const { dona } = await contaCom(12);
    const cartoes = await dona.query(api.health.listCards, {});
    expect(cartoes).toHaveLength(12);

    for (const cartao of cartoes) {
      const doEvento = await dona.query(api.health.getEventHealth, { eventId: cartao._id });
      expect(doEvento!.percent, `divergiu em ${cartao.name}`).toBe(cartao.health.percent);
      expect(doEvento!.status).toBe(cartao.health.status);
      expect(doEvento!.responsible).toBe(cartao.responsible);
      expect(doEvento!.assessoria).toBe(cartao.assessoria);
      expect(doEvento!.guestCount).toBe(cartao.guestCount);
    }
  });

  it("evento vazio continua pontuando baixo, e completo continua alto", async () => {
    const { t, dona, ids } = await contaCom(1);
    const vazio = await t.run((ctx: MutationCtx) =>
      ctx.db.insert("events", {
        userId: ids.userId, name: "Sem nada", type: "other" as const,
        date: "2026-12-20", location: "", clientName: "", status: "planning" as const,
      }),
    );
    const cartoes = await dona.query(api.health.listCards, {});
    const doVazio = cartoes.find((c) => c._id === vazio)!;
    const completo = cartoes.find((c) => c._id === ids.criados[0])!;
    expect(doVazio.health.percent).toBeLessThan(completo.health.percent);
    expect(doVazio.health.status).toBe("incomplete");
  });
});

describe("nada atravessa a fronteira da conta na leitura em lote", () => {
  it("a listagem por DONO não traz evento de outra decoradora", async () => {
    // A leitura passou a ser por usuário em sete tabelas. Um `by_user` errado
    // em qualquer uma delas misturaria contas — e o sintoma seria sutil: a
    // saúde de um evento contaminada por dado alheio, não um vazamento
    // visível na tela.
    const { t, dona } = await contaCom(3);
    const rival = await autenticarComo(t, {
      nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
    });
    await t.run(async (ctx: MutationCtx) => {
      const rivalId = (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|rival"))
        .unique())!._id;
      const eventId = await ctx.db.insert("events", {
        userId: rivalId, name: "Da rival", type: "wedding" as const, date: "2026-12-05",
        location: "Sítio", clientName: "Joana", status: "planning" as const,
      });
      await ctx.db.insert("eventSuppliers", {
        userId: rivalId, eventId, category: "assessoria", companyName: "Assessoria da rival",
      });
      await ctx.db.insert("briefings", { userId: rivalId, eventId, guestCount: "999" });
    });

    const meus = await dona.query(api.health.listCards, {});
    expect(meus).toHaveLength(3);
    expect(meus.some((c) => c.name === "Da rival")).toBe(false);
    expect(meus.some((c) => c.guestCount === "999")).toBe(false);
    expect(meus.some((c) => c.assessoria === "Assessoria da rival")).toBe(false);

    const dela = await rival.query(api.health.listCards, {});
    expect(dela).toHaveLength(1);
    expect(dela[0].assessoria).toBe("Assessoria da rival");
  });
});
