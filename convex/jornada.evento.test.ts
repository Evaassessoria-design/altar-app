import { afterEach, describe, expect, it, vi } from "vitest";

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
import { api, internal } from "./_generated/api";
import { autenticarComo } from "./test.auth";

// ═════════════════════════════════════════════════════════════════════════════
// A JORNADA DO EVENTO NO BANCO — pela mesma query que a página chama
// ═════════════════════════════════════════════════════════════════════════════

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

async function comADemo() {
  process.env.ALTAR_DEMO = "1";
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@demo.exemplo", role: "user", subject: "auth|aurora",
  });
  const outra = await autenticarComo(t, {
    nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
  });
  const r = await t.mutation(internal.demo.seed, { email: "aurora@demo.exemplo" });
  if (!r.criado) throw new Error("o seed não rodou");
  const eventos = await t.run((ctx) => ctx.db.query("events").collect());
  const porNome = (nome: string) => eventos.find((e) => e.name.includes(nome))!._id;
  return { t, dona, outra, heroi: r.eventId, porNome };
}

describe("getEventJourney", () => {
  it("evento de outra conta: null — a jornada não confirma que ele existe", async () => {
    const { outra, heroi } = await comADemo();
    expect(await outra.query(api.health.getEventJourney, { eventId: heroi })).toBeNull();
  });

  it("evento vazio: você está no briefing, e o próximo é o comercial", async () => {
    const { t, dona } = await comADemo();
    const eventId = await t.run(async (ctx) => {
      const u = (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora")).unique())!;
      return ctx.db.insert("events", {
        userId: u._id, name: "Novo", type: "wedding", date: "2027-05-01",
        location: "L", clientName: "C", status: "planning",
      });
    });
    const j = (await dona.query(api.health.getEventJourney, { eventId }))!;
    expect(j.jornada).toMatchObject({ atual: "briefing", proxima: "comercial", concluidas: 0 });
    expect(j).toMatchObject({ fase: "projeto", proximoPasso: { rotulo: "Briefing" } });
    // A Saúde é a mesma conta da tela antiga — só mudou de lugar.
    const saude = await dona.query(api.health.getEventHealth, { eventId });
    expect(j.saude.percent).toBe(saude!.percent);
  });

  it("Marina & Gabriel semeada: o comercial e o contrato refletem o que a demo tem", async () => {
    const { dona, heroi } = await comADemo();
    const j = (await dona.query(api.health.getEventJourney, { eventId: heroi }))!;
    const etapa = (c: string) => j.jornada.etapas.find((e) => e.chave === c)!;
    expect(etapa("comercial")).toMatchObject({ status: "concluido", detalhe: "Proposta aprovada" });
    expect(etapa("briefing").status).toBe("concluido");
    // O seed não sobe contrato nem foto: a jornada diz isso, não finge.
    expect(etapa("contrato").status).toBe("nao_iniciado");
    expect(etapa("projeto").status).not.toBe("concluido");
    expect(j.fase).toBe("projeto");
    expect(JSON.stringify(j)).not.toMatch(/assinad/i);
  });

  it("Rafaela & Ian, que foi no fim de semana: fase OPERAÇÃO e o retorno por conferir", async () => {
    const { dona, porNome } = await comADemo();
    const j = (await dona.query(api.health.getEventJourney, { eventId: porNome("Rafaela") }))!;
    expect(j.fase).toBe("operacao");
    expect(j.atencao).toContain("Acervo voltou e o retorno ainda não foi conferido");
    const retorno = j.operacao.etapas.find((e) => e.chave === "retorno")!;
    expect(retorno.status).toBe("em_andamento"); // 24 saíram, 20 voltaram
  });

  it("depois da conferência: o que foi para reparo segura o 'disponível de novo'", async () => {
    const { t, dona, porNome } = await comADemo();
    const rafaela = porNome("Rafaela");
    const reserva = await t.run(async (ctx) =>
      (await ctx.db.query("collectionReservations").withIndex("by_event", (q) => q.eq("eventId", rafaela)).first())!,
    );
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: rafaela, linhas: [{ reservaId: reserva._id, voltou: 20, limpeza: 2 }],
    });
    const j = (await dona.query(api.health.getEventJourney, { eventId: rafaela }))!;
    const etapa = (c: string) => j.operacao.etapas.find((e) => e.chave === c)!;
    expect(etapa("conferenciaDeRetorno").status).toBe("concluido");
    expect(etapa("limpezaReparo").status).toBe("em_andamento");
    expect(etapa("disponivel").status).toBe("nao_iniciado");
    expect(j.atencao).not.toContain("Acervo voltou e o retorno ainda não foi conferido");
  });
});
