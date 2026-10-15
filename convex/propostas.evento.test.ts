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
import type { Id } from "./_generated/dataModel";

// ═════════════════════════════════════════════════════════════════════════════
// A PROPOSTA ACEITA APARECE NA JORNADA DO EVENTO
//
// Defeito da homologação de 14/10: a proposta nasce no LEAD, a Jornada lê pelo
// EVENTO, e a conversão não ligava uma ao outro. O evento recém-convertido
// dizia "Sem orçamento nem proposta" com a proposta aprovada ali do lado.
//
// Os testes passam pelas mutations reais — sessão, paywall e posse incluídos —
// e atacam o que a correção podia quebrar: conversão repetida, várias
// propostas, a concorrente, conta bloqueada, evento apagado e o evento
// convertido ANTES da correção (que não ganha backfill).
// ═════════════════════════════════════════════════════════════════════════════

const CONVERSAO = {
  eventName: "Helena & Tiago",
  eventDate: "2027-05-22",
  location: "Fazenda Aurora",
  clientName: "Helena",
  type: "wedding" as const,
};

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona",
  });
  const outra = await autenticarComo(t, {
    nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
  });
  const leadId = await dona.mutation(api.funil.createLead, {
    clientName: "Helena", stage: "negotiating", eventDate: "2027-05-22", venue: "Fazenda Aurora",
  });
  return { t, dona, outra, leadId: leadId as Id<"leads"> };
}

type Sessao = Awaited<ReturnType<typeof cenario>>["dona"];

/** Uma proposta com valor, criada no lead e decidida pela tela. */
async function propostaNoLead(
  s: Sessao,
  leadId: Id<"leads">,
  decisao: "aceita" | "recusada" | "rascunho",
  valor = 18500,
) {
  const id = await s.mutation(api.propostas.create, { leadId });
  await s.mutation(api.propostas.update, {
    id,
    itens: [{ descricao: "Projeto floral", valor }],
    condicoesPagamento: "30% na assinatura",
    validadeAte: "2027-01-31",
  });
  if (decisao !== "rascunho") {
    await s.mutation(api.propostas.registrarDecisao, { id, decisao });
  }
  return id;
}

function etapaComercial(j: { jornada: { etapas: { chave: string; detalhe?: string; status: string }[] } }) {
  return j.jornada.etapas.find((e) => e.chave === "comercial")!;
}

describe("conversão liga a proposta do lead ao evento", () => {
  it("a proposta aceita aparece na Jornada e no cartão do evento", async () => {
    const { t, dona, leadId } = await cenario();
    const propostaId = await propostaNoLead(dona, leadId, "aceita");

    const eventId = await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO });

    const j = (await dona.query(api.health.getEventJourney, { eventId: eventId as Id<"events"> }))!;
    expect(etapaComercial(j)).toMatchObject({ status: "concluido", detalhe: "Proposta aprovada" });

    const doEvento = await dona.query(api.propostas.doEvento, { eventId: eventId as Id<"events"> });
    expect(doEvento.map((p) => p._id)).toEqual([propostaId]);

    // Ganhou o evento e NÃO perdeu o lead: o funil continua contando.
    const p = await t.run((ctx) => ctx.db.get(propostaId));
    expect(p).toMatchObject({ eventId, leadId, status: "aceita" });
    const quadro = await dona.query(api.propostas.resumoPorLead, {});
    expect(quadro.porLead[leadId]?.quantidade).toBe(1);
  });

  it("valor, itens e versão enviada saem da conversão intactos", async () => {
    const { t, dona, leadId } = await cenario();
    const id = await dona.mutation(api.propostas.create, { leadId });
    await dona.mutation(api.propostas.update, {
      id,
      titulo: "Proposta Helena",
      itens: [{ descricao: "Projeto floral", valor: 12000.5 }, { descricao: "Montagem", valor: 3500 }],
      condicoesPagamento: "Sinal de 30%",
      validadeAte: "2027-01-31",
    });
    await dona.mutation(api.propostas.registrarEnvio, { id });
    await dona.mutation(api.propostas.registrarDecisao, { id, decisao: "aceita" });
    const antes = await t.run((ctx) => ctx.db.get(id));

    await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO });

    const depois = await t.run((ctx) => ctx.db.get(id));
    // Tudo igual, campo a campo, exceto o vínculo que a conversão acrescenta.
    const { eventId: vinculo, ...resto } = depois!;
    expect(vinculo).toBeDefined();
    expect(resto).toEqual(antes);
    expect(depois!.itens).toEqual(antes!.itens);
    expect(depois!.versaoEnviada).toEqual(antes!.versaoEnviada);
    expect(depois!.condicoesPagamento).toBe(antes!.condicoesPagamento);
    expect(depois!.decididaEm).toBe(antes!.decididaEm);
    // O vínculo é do sistema: "última alteração" não muda por causa dele.
    expect(depois!.updatedAt).toBe(antes!.updatedAt);
  });

  it("converter DUAS vezes não duplica evento nem proposta", async () => {
    const { t, dona, leadId } = await cenario();
    await propostaNoLead(dona, leadId, "aceita");

    const a = await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO });
    const b = await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO });
    expect(b).toBe(a);

    const { eventos, propostas } = await t.run(async (ctx) => ({
      eventos: await ctx.db.query("events").collect(),
      propostas: await ctx.db.query("proposals").collect(),
    }));
    expect(eventos).toHaveLength(1);
    expect(propostas).toHaveLength(1);
    expect(propostas[0].eventId).toBe(a);
  });

  it("várias propostas do mesmo lead: todas no evento, a aceita decide a etapa", async () => {
    const { dona, leadId } = await cenario();
    const recusada = await propostaNoLead(dona, leadId, "recusada", 25000);
    const aceita = await propostaNoLead(dona, leadId, "aceita", 19000);
    const rascunho = await propostaNoLead(dona, leadId, "rascunho", 21000);

    const eventId = (await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO })) as Id<"events">;

    const doEvento = await dona.query(api.propostas.doEvento, { eventId });
    expect(new Set(doEvento.map((p) => p._id))).toEqual(new Set([recusada, aceita, rascunho]));
    const j = (await dona.query(api.health.getEventJourney, { eventId }))!;
    expect(etapaComercial(j).detalhe).toBe("Proposta aprovada");
  });

  it("só recusada: a Jornada diz recusada, não aprovada nem vazia", async () => {
    const { dona, leadId } = await cenario();
    await propostaNoLead(dona, leadId, "recusada");
    const eventId = (await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO })) as Id<"events">;
    const j = (await dona.query(api.health.getEventJourney, { eventId }))!;
    expect(etapaComercial(j)).toMatchObject({
      status: "em_andamento",
      detalhe: "Proposta recusada — ajustar e reenviar",
    });
  });

  it("proposta criada no lead DEPOIS da conversão nasce ligada ao evento", async () => {
    const { t, dona, leadId } = await cenario();
    const eventId = await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO });
    const aditivo = await dona.mutation(api.propostas.create, { leadId });
    expect((await t.run((ctx) => ctx.db.get(aditivo)))?.eventId).toBe(eventId);
  });
});

describe("fronteiras da ligação", () => {
  it("a proposta da concorrente pendurada no MEU lead não é ligada nem mostrada", async () => {
    const { t, dona, outra, leadId } = await cenario();
    // Só pelo banco: a API recusa (create confere o dono do lead). O teste
    // prova que a ligação e a leitura não confiam no índice `by_lead`.
    const intrusa = await t.run(async (ctx) => {
      const outraId = (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|outra"))
        .unique())!._id;
      return ctx.db.insert("proposals", {
        userId: outraId, leadId, titulo: "Intrusa", clienteNome: "X", itens: [],
        status: "aceita", createdAt: "2026-10-01T00:00:00.000Z",
      });
    });

    const eventId = (await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO })) as Id<"events">;

    expect((await t.run((ctx) => ctx.db.get(intrusa)))?.eventId).toBeUndefined();
    expect(await dona.query(api.propostas.doEvento, { eventId })).toEqual([]);
    const j = (await dona.query(api.health.getEventJourney, { eventId }))!;
    expect(etapaComercial(j).detalhe).toBe("Sem orçamento nem proposta");
    // E a outra conta não enxerga o evento nem as propostas dele.
    expect(await outra.query(api.propostas.doEvento, { eventId })).toEqual([]);
    expect(await outra.query(api.health.getEventJourney, { eventId })).toBeNull();
  });

  it("a outra conta não converte o meu lead, e nada é ligado", async () => {
    const { t, dona, outra, leadId } = await cenario();
    const id = await propostaNoLead(dona, leadId, "aceita");
    await expect(outra.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO })).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(id)))?.eventId).toBeUndefined();
  });

  it("conta bloqueada não converte, e a proposta fica como estava", async () => {
    const { t, dona, leadId } = await cenario();
    const id = await propostaNoLead(dona, leadId, "aceita");
    await t.run(async (ctx) => {
      const u = (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona"))
        .unique())!;
      await ctx.db.patch(u._id, { subscriptionStatus: "cancelled" });
    });
    await expect(dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO })).rejects.toThrow(
      /cancelada|Assine/,
    );
    expect((await t.run((ctx) => ctx.db.get(id)))?.eventId).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(0);
  });

  it("proposta ligada a OUTRO evento vivo fica onde está", async () => {
    const { t, dona, leadId } = await cenario();
    const outroEvento = await t.run(async (ctx) => {
      const lead = (await ctx.db.get(leadId))!;
      return ctx.db.insert("events", {
        userId: lead.userId, name: "Aditivo", type: "wedding", date: "2027-06-01",
        location: "L", clientName: "Helena", status: "planning",
      });
    });
    const id = await dona.mutation(api.propostas.create, { leadId, eventId: outroEvento });

    const eventId = await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO });

    expect((await t.run((ctx) => ctx.db.get(id)))?.eventId).toBe(outroEvento);
    expect(await dona.query(api.propostas.doEvento, { eventId: eventId as Id<"events"> })).toEqual([]);
  });
});

describe("evento apagado e reconvertido", () => {
  it("apagar o evento devolve a proposta ao lead; reconverter liga de novo", async () => {
    const { t, dona, leadId } = await cenario();
    const id = await propostaNoLead(dona, leadId, "aceita");
    const primeiro = (await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO })) as Id<"events">;

    await dona.mutation(api.events.remove, { id: primeiro });

    const solta = await t.run((ctx) => ctx.db.get(id));
    expect(solta).toMatchObject({ leadId, status: "aceita" });
    expect(solta?.eventId).toBeUndefined();

    const segundo = await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO });
    expect(segundo).not.toBe(primeiro);
    expect((await t.run((ctx) => ctx.db.get(id)))?.eventId).toBe(segundo);
  });
});

describe("evento convertido ANTES da correção (sem backfill)", () => {
  /** O estado que existe no banco hoje: lead aponta o evento, proposta só o lead. */
  async function eventoAntigo() {
    const c = await cenario();
    const propostaId = await propostaNoLead(c.dona, c.leadId, "aceita");
    const eventId = await c.t.run(async (ctx) => {
      const lead = (await ctx.db.get(c.leadId))!;
      const id = await ctx.db.insert("events", {
        userId: lead.userId, name: "Helena & Tiago", type: "wedding", date: "2027-05-22",
        location: "Fazenda Aurora", clientName: "Helena", status: "planning",
      });
      await ctx.db.patch(lead._id, { stage: "contracted", convertedEventId: id });
      return id;
    });
    return { ...c, propostaId, eventId };
  }

  it("a Jornada e o cartão enxergam a proposta pelo lead de origem", async () => {
    const { dona, eventId, propostaId } = await eventoAntigo();
    const j = (await dona.query(api.health.getEventJourney, { eventId }))!;
    expect(etapaComercial(j).detalhe).toBe("Proposta aprovada");
    const doEvento = await dona.query(api.propostas.doEvento, { eventId });
    expect(doEvento.map((p) => p._id)).toEqual([propostaId]);
  });

  it("a leitura não grava nada: o dado antigo fica como estava", async () => {
    const { t, dona, eventId, propostaId } = await eventoAntigo();
    await dona.query(api.health.getEventJourney, { eventId });
    await dona.query(api.propostas.doEvento, { eventId });
    expect((await t.run((ctx) => ctx.db.get(propostaId)))?.eventId).toBeUndefined();
  });

  it("tocar 'converter' de novo liga a proposta de vez, sem criar evento", async () => {
    const { t, dona, leadId, eventId, propostaId } = await eventoAntigo();
    const devolvido = await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO });
    expect(devolvido).toBe(eventId);
    expect((await t.run((ctx) => ctx.db.get(propostaId)))?.eventId).toBe(eventId);
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(1);
  });

  it("não aparece duas vezes quando já está ligada E o lead aponta o evento", async () => {
    const { dona, leadId, eventId } = await eventoAntigo();
    await dona.mutation(api.funil.convertToEvent, { leadId, ...CONVERSAO });
    expect(await dona.query(api.propostas.doEvento, { eventId })).toHaveLength(1);
  });
});
