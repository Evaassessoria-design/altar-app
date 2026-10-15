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
// REUNIÕES SOB ATAQUE
//
// A ata é o registro mais íntimo do evento: o que a cliente disse, o que ela
// recusou, quanto ela pode gastar. Estes testes tentam alcançar a reunião de
// outra empresa, gravar link que vira código, duplicar pelo toque repetido e
// perder a ata ao editar outro campo.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona" });
  const outra = await autenticarComo(t, { nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra" });
  const { eventId, eventoDaOutra } = await t.run(async (ctx) => {
    const ids = await Promise.all(
      ["auth|dona", "auth|outra"].map(async (s) =>
        (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", s)).unique())!._id,
      ),
    );
    const novo = (userId: (typeof ids)[number], name: string) =>
      ctx.db.insert("events", {
        userId, name, type: "wedding", date: "2027-05-22", location: "L", clientName: "C", status: "planning",
      });
    return { eventId: await novo(ids[0], "Helena & Tiago"), eventoDaOutra: await novo(ids[1], "Da outra") };
  });
  return { t, dona, outra, eventId, eventoDaOutra };
}

const BASE = { titulo: "Reunião de briefing", data: "2026-11-03", horario: "19:00" };

describe("criar e editar", () => {
  it("nasce agendada, com link normalizado, e reabre para a ata", async () => {
    const { dona, eventId } = await cenario();
    const id = await dona.mutation(api.reunioes.criar, { eventId, ...BASE, link: "meet.google.com/abc-defg-hij" });
    let r = await dona.query(api.reunioes.obter, { id });
    expect(r).toMatchObject({ situacao: "agendada", link: "https://meet.google.com/abc-defg-hij" });

    await dona.mutation(api.reunioes.atualizar, {
      id,
      situacao: "realizada",
      anotacoes: "Paleta terracota. Tiago manda a lista até sexta.",
      decisoes: ["Paleta terracota", " ", "paleta TERRACOTA"],
      pendencias: [{ texto: "Lista de convidados", responsavel: "Tiago", prazo: "2026-11-07", feita: false }],
    });
    // Reabrir uma realizada: continua editável.
    await dona.mutation(api.reunioes.atualizar, { id, situacao: "agendada" });
    r = await dona.query(api.reunioes.obter, { id });
    expect(r).toMatchObject({
      situacao: "agendada",
      decisoes: ["Paleta terracota"],
      pendencias: [{ texto: "Lista de convidados", responsavel: "Tiago", prazo: "2026-11-07", feita: false }],
    });
  });

  it("editar um campo não apaga a ata nem as decisões", async () => {
    const { dona, eventId } = await cenario();
    const id = await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    await dona.mutation(api.reunioes.atualizar, { id, anotacoes: "Notas originais", decisoes: ["A"] });
    await dona.mutation(api.reunioes.atualizar, { id, titulo: "Briefing (remarcada)", resumo: "Resumo aceito" });
    const r = await dona.query(api.reunioes.obter, { id });
    expect(r).toMatchObject({ titulo: "Briefing (remarcada)", anotacoes: "Notas originais", decisoes: ["A"], resumo: "Resumo aceito" });
  });

  it("null limpa o campo; ausente deixa como está", async () => {
    const { dona, eventId } = await cenario();
    const id = await dona.mutation(api.reunioes.criar, { eventId, ...BASE, link: "https://zoom.us/j/1", participantes: "Helena" });
    await dona.mutation(api.reunioes.atualizar, { id, link: null, horario: null });
    const r = await dona.query(api.reunioes.obter, { id });
    expect(r?.link).toBeUndefined();
    expect(r?.horario).toBeUndefined();
    expect(r?.participantes).toBe("Helena");
  });

  it("recusa link javascript:, data impossível, horário inválido e título vazio", async () => {
    const { dona, eventId } = await cenario();
    await expect(dona.mutation(api.reunioes.criar, { eventId, ...BASE, link: "javascript:alert(1)" })).rejects.toThrow(/https/);
    await expect(dona.mutation(api.reunioes.criar, { eventId, ...BASE, data: "2027-02-30" })).rejects.toThrow(/data válida/);
    await expect(dona.mutation(api.reunioes.criar, { eventId, ...BASE, horario: "25:00" })).rejects.toThrow(/Horário/);
    await expect(dona.mutation(api.reunioes.criar, { eventId, ...BASE, titulo: "   " })).rejects.toThrow(/título/);
    const id = await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    await expect(
      dona.mutation(api.reunioes.atualizar, { id, pendencias: [{ texto: "x", prazo: "amanhã", feita: false }] }),
    ).rejects.toThrow(/Prazo/);
  });

  it("toque repetido não cria duas reuniões", async () => {
    const { t, dona, eventId } = await cenario();
    const a = await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    const b = await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    expect(b).toBe(a);
    // Outra reunião de verdade (outro horário) é criada normalmente.
    const c = await dona.mutation(api.reunioes.criar, { eventId, ...BASE, horario: "20:00" });
    expect(c).not.toBe(a);
    expect(await t.run((ctx) => ctx.db.query("reunioes").collect())).toHaveLength(2);
  });
});

describe("fronteira entre empresas", () => {
  it("a outra conta não lê, não edita, não apaga e não cria no meu evento", async () => {
    const { t, dona, outra, eventId } = await cenario();
    const id = await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    await dona.mutation(api.reunioes.atualizar, { id, anotacoes: "Orçamento máximo R$ 80 mil" });

    expect(await outra.query(api.reunioes.obter, { id })).toBeNull();
    expect(await outra.query(api.reunioes.doEvento, { eventId })).toBeNull();
    await expect(outra.mutation(api.reunioes.atualizar, { id, anotacoes: "x" })).rejects.toThrow(/não encontrada/);
    await expect(outra.mutation(api.reunioes.remover, { id })).rejects.toThrow(/não encontrada/);
    await expect(outra.mutation(api.reunioes.criar, { eventId, ...BASE, titulo: "Intrusa" })).rejects.toThrow(/não encontrado/);

    const r = await t.run((ctx) => ctx.db.get(id));
    expect(r?.anotacoes).toBe("Orçamento máximo R$ 80 mil");
    expect(await t.run((ctx) => ctx.db.query("reunioes").collect())).toHaveLength(1);
  });

  it("sem sessão, nada", async () => {
    const { t, dona, eventId } = await cenario();
    const id = await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    await expect(t.query(api.reunioes.obter, { id })).rejects.toThrow();
    await expect(t.mutation(api.reunioes.criar, { eventId, ...BASE })).rejects.toThrow();
  });

  it("a sugestão da IA também barra a reunião alheia antes de chamar o provedor", async () => {
    const { dona, outra, eventId } = await cenario();
    const id = await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    await dona.mutation(api.reunioes.atualizar, { id, anotacoes: "Notas suficientemente longas para pedir sugestão." });
    await expect(outra.action(api.reunioesIa.sugerirResumo, { id })).rejects.toThrow(/não encontrada/);
  });

  it("sem anotações a sugestão recusa com recado, e o registro manual segue", async () => {
    const { dona, eventId } = await cenario();
    const id = await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    await expect(dona.action(api.reunioesIa.sugerirResumo, { id })).rejects.toThrow(/anotações/);
    await dona.mutation(api.reunioes.atualizar, { id, decisoes: ["Registrada à mão"] });
    expect((await dona.query(api.reunioes.obter, { id }))?.decisoes).toEqual(["Registrada à mão"]);
  });
});

describe("agenda e evento", () => {
  it("a Agenda mostra a reunião pela data DELA, mesmo fora do dia do evento; cancelada não", async () => {
    const { dona, outra, eventId, eventoDaOutra } = await cenario();
    await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    const cancelada = await dona.mutation(api.reunioes.criar, { eventId, ...BASE, titulo: "Prova", data: "2026-11-05" });
    await dona.mutation(api.reunioes.atualizar, { id: cancelada, situacao: "cancelada" });
    await outra.mutation(api.reunioes.criar, { eventId: eventoDaOutra, ...BASE, titulo: "Da outra" });

    const agenda = await dona.query(api.agenda.listarOperacoes, { de: "2026-11-01", ate: "2026-11-30" });
    expect(agenda.eventos).toEqual([]);
    expect(agenda.reunioes).toEqual([
      expect.objectContaining({ titulo: "Reunião de briefing", evento: "Helena & Tiago", data: "2026-11-03", horario: "19:00" }),
    ]);
  });

  it("recorte de datas da Agenda é respeitado", async () => {
    const { dona, eventId } = await cenario();
    await dona.mutation(api.reunioes.criar, { eventId, ...BASE, data: "2026-10-31" });
    await dona.mutation(api.reunioes.criar, { eventId, ...BASE, data: "2026-12-01" });
    const agenda = await dona.query(api.agenda.listarOperacoes, { de: "2026-11-01", ate: "2026-11-30" });
    expect(agenda.reunioes).toEqual([]);
  });

  it("apagar o evento apaga as reuniões dele, e só dele", async () => {
    const { t, dona, outra, eventId, eventoDaOutra } = await cenario();
    await dona.mutation(api.reunioes.criar, { eventId, ...BASE });
    await outra.mutation(api.reunioes.criar, { eventId: eventoDaOutra, ...BASE });
    await dona.mutation(api.events.remove, { id: eventId as Id<"events"> });
    const sobram = await t.run((ctx) => ctx.db.query("reunioes").collect());
    expect(sobram.map((r) => r.eventId)).toEqual([eventoDaOutra]);
  });
});
