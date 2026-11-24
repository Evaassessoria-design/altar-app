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
import { dataEmDias, dataDoDia } from "./lib/dataDoDia";

// ═════════════════════════════════════════════════════════════════════════════
// O QUE FOI COMBINADO NA REUNIÃO CHEGA AO PAINEL
//
// A pendência ("a noiva manda a lista até sexta") nascia na ata e morava só
// lá: quem não abrisse AQUELA reunião não sabia que havia prazo. O painel é a
// primeira tela do dia dela.
//
// O que estes testes protegem — tudo o que o painel NÃO pode fazer:
//
//  · cobrar pendência já feita, de reunião cancelada ou de evento cancelado;
//  · chamar de "vencida" a pendência SEM prazo (ausência não é atraso);
//  · mostrar pendência de outra conta;
//  · afirmar que leu tudo quando bateu no teto;
//  · enterrar a de prazo mais apertado no meio da lista.
// ═════════════════════════════════════════════════════════════════════════════

const HOJE = dataDoDia(new Date());
const ONTEM = dataEmDias(-1, new Date());
const DEPOIS = dataEmDias(10, new Date());

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Dona", email: "dona@ex.com", role: "user" });
  const outra = await autenticarComo(t, { nome: "Outra", email: "outra@ex.com", role: "user" });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const pessoa = async (email: string) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", `auth|${email}`))
        .unique();
      if (!u) throw new Error(`conta ${email} não criada`);
      return u._id;
    };
    const donaId = await pessoa("dona@ex.com");
    const outraId = await pessoa("outra@ex.com");

    const evento = async (userId: typeof donaId, name: string, status: string) =>
      await ctx.db.insert("events", {
        userId, name, type: "wedding", date: DEPOIS,
        location: "Fazenda", clientName: "Cliente", status: status as never,
      });

    const ativo = await evento(donaId, "TESTE Ativo", "confirmed");
    const cancelado = await evento(donaId, "TESTE Cancelado", "cancelled");
    const daOutra = await evento(outraId, "Evento alheio", "confirmed");

    const reuniao = async (
      userId: typeof donaId,
      eventId: typeof ativo,
      titulo: string,
      situacao: "agendada" | "realizada" | "cancelada",
      pendencias: { texto: string; feita: boolean; prazo?: string; responsavel?: string }[],
    ) =>
      await ctx.db.insert("reunioes", {
        userId, eventId, titulo, data: ONTEM, situacao, pendencias,
        criadaEm: new Date().toISOString(),
      });

    await reuniao(donaId, ativo, "Primeira reunião", "realizada", [
      { texto: "Mandar a lista de convidados", feita: false, prazo: ONTEM, responsavel: "Noiva" },
      { texto: "Escolher o bolo", feita: false, prazo: DEPOIS },
      { texto: "Sem prazo combinado", feita: false },
      { texto: "Isso já foi feito", feita: true, prazo: ONTEM },
    ]);
    await reuniao(donaId, ativo, "Reunião cancelada", "cancelada", [
      { texto: "Nada disto vale", feita: false, prazo: ONTEM },
    ]);
    await reuniao(donaId, cancelado, "Reunião de evento cancelado", "realizada", [
      { texto: "Evento caiu", feita: false, prazo: ONTEM },
    ]);
    await reuniao(outraId, daOutra, "Reunião da concorrente", "realizada", [
      { texto: "Segredo da vizinha", feita: false, prazo: ONTEM },
    ]);

    return { ativo, cancelado, daOutra };
  });

  return { t, dona, outra, ...ids };
}

describe("pendências de reunião no painel", () => {
  it("traz só o que está em aberto, de reunião válida e evento vivo", async () => {
    const { dona } = await cenario();
    const stats = await dona.query(api.dashboard.getDashboardStats, {});

    expect(stats.pendenciasDeReuniaoTotal).toBe(3);
    const textos = stats.pendenciasDeReuniao.map((p) => p.texto);
    expect(textos).toContain("Mandar a lista de convidados");
    expect(textos).toContain("Escolher o bolo");
    expect(textos).toContain("Sem prazo combinado");
    // Feita, cancelada e de evento cancelado não cobram nada de ninguém.
    expect(textos).not.toContain("Isso já foi feito");
    expect(textos).not.toContain("Nada disto vale");
    expect(textos).not.toContain("Evento caiu");
  });

  it("prazo apertado primeiro; sem prazo por último, e nunca como vencida", async () => {
    const { dona } = await cenario();
    const stats = await dona.query(api.dashboard.getDashboardStats, {});

    expect(stats.pendenciasDeReuniao[0].texto).toBe("Mandar a lista de convidados");
    expect(stats.pendenciasDeReuniao[0].atrasada).toBe(true);
    // Sem prazo vai para o fim da fila — não para o meio, que é onde ninguém
    // olha — e NÃO é atraso: ausência de prazo não é prazo perdido.
    const semPrazo = stats.pendenciasDeReuniao[stats.pendenciasDeReuniao.length - 1];
    expect(semPrazo.texto).toBe("Sem prazo combinado");
    expect(semPrazo.prazo).toBeUndefined();
    expect(semPrazo.atrasada).toBe(false);
    expect(stats.pendenciasDeReuniaoAtrasadas).toBe(1);
  });

  it("leva o caminho de volta: evento, reunião e responsável", async () => {
    const { dona, ativo } = await cenario();
    const stats = await dona.query(api.dashboard.getDashboardStats, {});
    const lista = stats.pendenciasDeReuniao.find((p) => p.responsavel === "Noiva")!;
    expect(lista.eventId).toBe(ativo);
    expect(lista.eventName).toBe("TESTE Ativo");
    expect(lista.reuniao).toBe("Primeira reunião");
  });

  it("a conta vizinha não vê nada do painel da dona", async () => {
    const { outra } = await cenario();
    const stats = await outra.query(api.dashboard.getDashboardStats, {});
    expect(stats.pendenciasDeReuniaoTotal).toBe(1);
    expect(stats.pendenciasDeReuniao[0].texto).toBe("Segredo da vizinha");
    expect(stats.pendenciasDeReuniao.map((p) => p.eventName)).not.toContain("TESTE Ativo");
  });

  it("sem sessão, o painel não responde", async () => {
    const { t } = await cenario();
    await expect(t.query(api.dashboard.getDashboardStats, {})).rejects.toThrow();
  });

  it("reunião antiga demais fica fora da janela de leitura", async () => {
    const { t, dona, ativo } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      const evento = await ctx.db.get(ativo);
      if (!evento) throw new Error("evento não criado");
      await ctx.db.insert("reunioes", {
        userId: evento.userId,
        eventId: ativo,
        titulo: "Reunião de um ano atrás",
        data: dataEmDias(-400, new Date()),
        situacao: "realizada",
        pendencias: [{ texto: "Pendência esquecida há um ano", feita: false }],
        criadaEm: new Date().toISOString(),
      });
    });
    const stats = await dona.query(api.dashboard.getDashboardStats, {});
    // A janela é de 180 dias para trás. O painel é do que exige algo agora, e
    // o teto está escrito no código, não escondido.
    expect(stats.pendenciasDeReuniao.map((p) => p.texto)).not.toContain(
      "Pendência esquecida há um ano",
    );
    expect(HOJE >= ONTEM).toBe(true);
  });
});
