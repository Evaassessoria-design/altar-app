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
import { autenticarComo, autenticarComoAdmin, autenticarComoDecoradora } from "./test.auth";
import { diaCivil, diaCivilEmDias } from "./lib/central/prazos";

// ═════════════════════════════════════════════════════════════════════════════
// TAREFAS DA OPERAÇÃO
//
// A trava principal é a mesma da caixa de entrada: "apenas vencidas" filtrava
// a PÁGINA já carregada. Com 100 tarefas recentes na frente, a vencida de três
// semanas atrás simplesmente não aparecia — e a tela dizia que estava tudo em
// dia.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = Date.now();
const HOJE = diaCivil(AGORA);
const ONTEM = diaCivilEmDias(AGORA, -1);
const ANTIGA = diaCivilEmDias(AGORA, -30);
const AMANHA = diaCivilEmDias(AGORA, 1);

async function semear(
  t: ReturnType<typeof convexTest>,
  tarefas: {
    titulo: string;
    venceEm?: string;
    status?: "aberto" | "em_andamento" | "concluido" | "cancelado";
    tipo?: "follow_up" | "demonstracao" | "onboarding" | "suporte" | "contato_cobranca";
  }[],
) {
  await t.run(async (ctx) => {
    for (const tarefa of tarefas) {
      await ctx.db.insert("adminWorkItems", {
        vertical: "altar_decor",
        tipo: tarefa.tipo ?? "follow_up",
        titulo: tarefa.titulo,
        status: tarefa.status ?? "aberto",
        venceEm: tarefa.venceEm,
        criadoPor: "humano",
        criadoEm: AGORA,
        atualizadoEm: AGORA,
      });
    }
  });
}

describe("'vencidas' quer dizer TODAS as vencidas", () => {
  it("a tarefa vencida aparece mesmo com muitas tarefas na frente", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await semear(t, [
      ...Array.from({ length: 120 }, (_, i) => ({
        titulo: `Futura ${i}`,
        venceEm: AMANHA,
      })),
      { titulo: "Esquecida", venceEm: ANTIGA },
    ]);

    const vencidas = await admin.query(api.adminWorkItems.listar, {
      apenasVencidos: true,
      limite: 50,
    });

    expect(vencidas.map((t) => t.titulo)).toEqual(["Esquecida"]);
  });

  it("tarefa concluída ou cancelada nunca conta como vencida", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await semear(t, [
      { titulo: "Feita", venceEm: ONTEM, status: "concluido" },
      { titulo: "Cancelada", venceEm: ONTEM, status: "cancelado" },
      { titulo: "Em aberto", venceEm: ONTEM },
    ]);

    const vencidas = await admin.query(api.adminWorkItems.listar, { apenasVencidos: true });
    expect(vencidas.map((t) => t.titulo)).toEqual(["Em aberto"]);
  });

  it("tarefa sem prazo não é atrasada — é só sem prazo", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await semear(t, [{ titulo: "Sem prazo" }]);

    const vencidas = await admin.query(api.adminWorkItems.listar, { apenasVencidos: true });
    expect(vencidas).toEqual([]);

    const todas = await admin.query(api.adminWorkItems.listar, {});
    expect(todas[0].vencido).toBe(false);
    expect(todas[0].venceHoje).toBe(false);
  });

  it("vence hoje não é vencida", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await semear(t, [{ titulo: "É hoje", venceEm: HOJE }]);

    const todas = await admin.query(api.adminWorkItems.listar, {});
    expect(todas[0].venceHoje).toBe(true);
    expect(todas[0].vencido).toBe(false);
  });
});

describe("filtros por tipo e responsável", () => {
  it("filtra por tipo dentro de uma situação", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await semear(t, [
      { titulo: "Ligar para a Helena", tipo: "contato_cobranca" },
      { titulo: "Demonstração da Carla", tipo: "demonstracao" },
    ]);

    const cobranca = await admin.query(api.adminWorkItems.listar, {
      status: "aberto",
      tipo: "contato_cobranca",
    });

    expect(cobranca.map((t) => t.titulo)).toEqual(["Ligar para a Helena"]);
  });

  it("filtra pelo responsável", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const outro = await autenticarComo(t, {
      nome: "Ana",
      email: "ana@altar.example",
      role: "admin",
    });

    const anaId = await t.run(async (ctx) => {
      const ana = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "ana@altar.example"))
        .unique();
      return ana!._id;
    });

    await outro.mutation(api.adminWorkItems.criar, {
      tipo: "follow_up",
      titulo: "Da Ana",
      responsavelUserId: anaId,
    });
    await admin.mutation(api.adminWorkItems.criar, { tipo: "follow_up", titulo: "De ninguém" });

    const daAna = await admin.query(api.adminWorkItems.listar, { responsavelUserId: anaId });
    expect(daAna.map((t) => t.titulo)).toEqual(["Da Ana"]);
  });
});

describe("andamento da tarefa", () => {
  it("concluir grava a data, reabrir a apaga", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    const workItemId = await admin.mutation(api.adminWorkItems.criar, {
      tipo: "follow_up",
      titulo: "Retomar a conversa",
      venceEm: AMANHA,
    });

    await admin.mutation(api.adminWorkItems.atualizar, { workItemId, status: "concluido" });
    const concluida = await t.run(async (ctx) => ctx.db.get(workItemId));
    expect(concluida?.concluidoEm).toBeTypeOf("number");

    await admin.mutation(api.adminWorkItems.atualizar, { workItemId, status: "aberto" });
    const reaberta = await t.run(async (ctx) => ctx.db.get(workItemId));
    expect(reaberta?.status).toBe("aberto");
    // Concluída e aberta ao mesmo tempo seria mentira.
    expect(reaberta?.concluidoEm).toBeUndefined();
  });

  it("dá para tirar o dono e o prazo de uma tarefa", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    const adminId = await t.run(async (ctx) => {
      const usuario = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "matheus@altar.example"))
        .unique();
      return usuario!._id;
    });

    const workItemId = await admin.mutation(api.adminWorkItems.criar, {
      tipo: "follow_up",
      titulo: "Atribuída por engano",
      responsavelUserId: adminId,
      venceEm: AMANHA,
    });

    await admin.mutation(api.adminWorkItems.atualizar, {
      workItemId,
      limparResponsavel: true,
      limparVencimento: true,
    });

    const tarefa = await t.run(async (ctx) => ctx.db.get(workItemId));
    expect(tarefa?.responsavelUserId).toBeUndefined();
    expect(tarefa?.venceEm).toBeUndefined();
  });

  it("tarefa sem título é recusada", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await expect(
      admin.mutation(api.adminWorkItems.criar, { tipo: "follow_up", titulo: "   " }),
    ).rejects.toThrow();
  });

  it("decoradora não vê nem cria tarefa da operação", async () => {
    const t = convexTest(schema, modules);
    await autenticarComoAdmin(t);
    const decoradora = await autenticarComoDecoradora(t);

    await expect(decoradora.query(api.adminWorkItems.listar, {})).rejects.toThrow();
    await expect(
      decoradora.mutation(api.adminWorkItems.criar, { tipo: "follow_up", titulo: "x" }),
    ).rejects.toThrow();
  });
});

describe("quem pode ser responsável", () => {
  it("o seletor lista só administradores, e sem dado de cobrança", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Cliente qualquer",
        email: "cliente@example.com",
        role: "user",
        subscriptionStatus: "active",
        asaasCustomerId: "cus_999",
      });
    });

    const operadores = await admin.query(api.admin.listarOperadores, {});

    expect(operadores.map((o) => o.name)).toEqual(["Matheus"]);
    const primeiro = operadores[0] as Record<string, unknown>;
    expect(primeiro).not.toHaveProperty("subscriptionStatus");
    expect(primeiro).not.toHaveProperty("asaasCustomerId");
  });
});
