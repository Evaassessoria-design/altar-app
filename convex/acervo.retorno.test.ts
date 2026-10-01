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

import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { autenticarComo } from "./test.auth";

// ═════════════════════════════════════════════════════════════════════════════
// O RETORNO DESDE 30/09 — o que volta entra em "em conferência"
//
//   Castiçal Roma: 40 no acervo. O casamento levou 20.
//   Domingo: voltaram 20 → 20 EM CONFERÊNCIA, não prontas.
//   Segunda: conferência → 16 prontas, 2 limpar, 2 reparo.
//
// Os testes tentam quebrar: contar a mesma peça duas vezes, baixar o retorno
// depois de conferido, peça atrasada entrando pronta, reserva antiga, outra
// conta, evento cancelado segurando peça.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario(opcoes: { reservaAntiga?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona" });
  const outra = await autenticarComo(t, { nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra" });
  const ids = await t.run(async (ctx) => {
    const donaId = (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona")).unique())!._id;
    const castical = await ctx.db.insert("collectionItems", {
      userId: donaId, nome: "Castiçal Roma", searchName: "castical roma", unidade: "un", quantidadeTotal: 40,
    });
    const casamento = await ctx.db.insert("events", {
      userId: donaId, name: "Rafaela & Ian", type: "wedding", date: "2026-10-10",
      location: "L", clientName: "C", status: "completed",
    });
    const proximo = await ctx.db.insert("events", {
      userId: donaId, name: "Sofia 15 anos", type: "debutante", date: "2026-10-24",
      location: "L", clientName: "C", status: "confirmed",
    });
    const reserva = await ctx.db.insert("collectionReservations", {
      userId: donaId, collectionItemId: castical, eventId: casamento, quantidade: 20,
      inicio: "2026-10-09", fim: "2026-10-11", origem: "manual", saiu: 20,
      // Reserva de antes de 30/09: o retorno foi gravado sem passar pela
      // conferência — as peças contam como prontas, como sempre contaram.
      ...(opcoes.reservaAntiga ? { voltou: 20 } : {}),
    });
    return { castical, casamento, proximo, reserva };
  });
  const disponivelParaOProximo = async () =>
    (
      await dona.query(api.acervo.disponibilidade, {
        collectionItemId: ids.castical, eventId: ids.proximo, inicio: "2026-10-23", fim: "2026-10-25",
      })
    )!.disponivel;
  const item = () => t.run((ctx) => ctx.db.get(ids.castical));
  const reservaAgora = () => t.run((ctx) => ctx.db.get(ids.reserva));
  const historico = () => dona.query(api.acervo.historicoDoItem, { collectionItemId: ids.castical });
  return { t, dona, outra, ...ids, disponivelParaOProximo, item, reservaAgora, historico };
}

describe("o retorno registrado espera a conferência", () => {
  it("voltaram 20: ficam EM CONFERÊNCIA e não contam para o próximo evento", async () => {
    const { dona, reserva, item, reservaAgora, disponivelParaOProximo } = await cenario();
    expect(await disponivelParaOProximo()).toBe(20); // 20 na rua

    const r = await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    expect(r).toMatchObject({ faltaVoltar: 0, emConferencia: 20 });
    expect(await item()).toMatchObject({ quantidadeTotal: 40, emConferencia: 20 });
    expect(await reservaAgora()).toMatchObject({ voltou: 20, retornoAConferir: 20 });
    // O defeito de antes: 40 disponíveis na segunda de manhã, antes de alguém olhar.
    expect(await disponivelParaOProximo()).toBe(20);
  });

  it("a conferência tira de EM CONFERÊNCIA — a mesma peça nunca conta duas vezes", async () => {
    const { dona, casamento, reserva, item, reservaAgora, disponivelParaOProximo } = await cenario();
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    const r = await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 20, limpeza: 2, reparo: 2 }],
    });
    expect(r).toEqual({ conferidas: 1, pecasForaDeUso: 4 });
    const depois = await item();
    expect(depois?.emConferencia).toBeUndefined();
    expect(depois).toMatchObject({ quantidadeTotal: 40, emLimpeza: 2, emManutencao: 2 });
    expect((await reservaAgora())?.retornoAConferir).toBeUndefined();
    expect(await disponivelParaOProximo()).toBe(36);
  });

  it("a conferência diz que voltaram MENOS que o registrado: a diferença volta a contar como fora", async () => {
    const { dona, casamento, reserva, item, disponivelParaOProximo } = await cenario();
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 18, reparo: 1 }],
    });
    const depois = await item();
    expect(depois?.emConferencia).toBeUndefined();
    expect(depois).toMatchObject({ emManutencao: 1 });
    // 40 − 2 que não voltaram − 1 em reparo.
    expect(await disponivelParaOProximo()).toBe(37);
  });

  it("registrar o mesmo retorno duas vezes não põe peça a mais em conferência", async () => {
    const { dona, reserva, item } = await cenario();
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    expect((await item())?.emConferencia).toBe(20);
  });

  it("corrigir o retorno para baixo ANTES da conferência devolve ao fora só o que esta reserva pôs", async () => {
    const { dona, reserva, item, reservaAgora } = await cenario();
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 15 });
    expect((await item())?.emConferencia).toBe(15);
    expect(await reservaAgora()).toMatchObject({ voltou: 15, retornoAConferir: 15 });
  });

  it("ocorrência no galpão antes da conferência não deixa a conferência negativa", async () => {
    const { dona, casamento, castical, reserva, item } = await cenario();
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    // Alguém já olhou 5 peças no galpão e liberou.
    await dona.mutation(api.acervo.moverCondicao, {
      collectionItemId: castical, de: "conferencia", para: "pronto", quantidade: 5,
    });
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 20, limpeza: 1 }],
    });
    const depois = await item();
    expect(depois?.emConferencia).toBeUndefined();
    expect(depois).toMatchObject({ quantidadeTotal: 40, emLimpeza: 1 });
  });
});

describe("depois da conferência, o retorno só sobe", () => {
  it("baixar o 'voltou' de reserva conferida é recusado — senão a peça contava duas vezes fora", async () => {
    const { dona, casamento, reserva, reservaAgora, item } = await cenario();
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 20, reparo: 2 }],
    });
    await expect(dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 10 })).rejects.toThrow(
      /já foi conferido/,
    );
    expect((await reservaAgora())?.voltou).toBe(20);
    expect((await item())?.emManutencao).toBe(2);
  });

  it("peça que chega DEPOIS da conferência entra em conferência, com linha no histórico", async () => {
    const { dona, casamento, reserva, item, historico, disponivelParaOProximo } = await cenario();
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 18 });
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 18 }],
    });
    expect(await disponivelParaOProximo()).toBe(38);

    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    expect((await item())?.emConferencia).toBe(2);
    // As 2 atrasadas saíram do "fora" mas ninguém as olhou: continuam fora de uso.
    expect(await disponivelParaOProximo()).toBe(38);
    const linhas = await historico();
    expect(linhas[0]).toMatchObject({
      condicaoPara: "conferencia", quantidadeMovida: 2, motivo: "Chegou depois da conferência de retorno",
    });
  });
});

describe("dado antigo e outra conta", () => {
  it("reserva de antes de 30/09: a conferência sai de 'pronto', como sempre saiu", async () => {
    const { dona, casamento, reserva, item, disponivelParaOProximo } = await cenario({ reservaAntiga: true });
    // Sem `retornoAConferir`, nada foi para conferência: as 20 contam prontas.
    expect(await disponivelParaOProximo()).toBe(40);
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 20, indisponivel: 3 }],
    });
    const depois = await item();
    expect(depois?.emConferencia).toBeUndefined();
    expect(depois).toMatchObject({ indisponivel: 3 });
    expect(await disponivelParaOProximo()).toBe(37);
  });

  it("outra conta não registra retorno na reserva da dona", async () => {
    const { outra, reserva, item } = await cenario();
    await expect(outra.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 })).rejects.toThrow(
      /não encontrada/,
    );
    expect((await item())?.emConferencia).toBeUndefined();
  });

  it("nenhum movimento do retorno ou da conferência mexe no total", async () => {
    const { dona, casamento, reserva, item, historico } = await cenario();
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 17 });
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 19, limpeza: 1, reparo: 1, indisponivel: 1 }],
    });
    expect((await item())?.quantidadeTotal).toBe(40);
    for (const linha of await historico()) {
      expect(linha.delta).toBe(0);
      expect(linha.quantidadeAntes).toBe(40);
      expect(linha.quantidadeDepois).toBe(40);
    }
  });
});

describe("o que voltou com problema — só o que a conferência mandou para fora de uso", () => {
  it("o retorno chegando em conferência NÃO é 'voltou com problema'; reparo e limpeza são", async () => {
    const { dona, casamento, reserva } = await cenario();
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 20 });
    let p = await dona.query(api.acervo.pendenciasPosEvento, {});
    expect(p.totalVoltaramComProblema).toBe(0);

    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 20, limpeza: 2, reparo: 1 }],
    });
    p = await dona.query(api.acervo.pendenciasPosEvento, {});
    const porCondicao = Object.fromEntries(p.voltaramComProblema.map((l) => [l.condicao, l.quantidade]));
    expect(porCondicao).toEqual({ limpeza: 2, reparo: 1 });
  });
});

describe("evento cancelado não segura peça", () => {
  it("a reserva do evento cancelado deixa de pesar — e some dos conflitos", async () => {
    const { t, dona, castical, proximo } = await cenario();
    const desmarcado = await t.run(async (ctx) => {
      const ev = await ctx.db.get(proximo);
      const id = await ctx.db.insert("events", {
        userId: ev!.userId, name: "Casamento desmarcado", type: "wedding", date: "2026-10-24",
        location: "L", clientName: "C", status: "cancelled",
      });
      await ctx.db.insert("collectionReservations", {
        userId: ev!.userId, collectionItemId: castical, eventId: id, quantidade: 30,
        inicio: "2026-10-23", fim: "2026-10-25", origem: "manual",
      });
      return id;
    });
    const r = await dona.query(api.acervo.disponibilidade, {
      collectionItemId: castical, eventId: proximo, inicio: "2026-10-23", fim: "2026-10-25",
    });
    if (!r) throw new Error("disponibilidade vazia");
    // 40 − 20 que ainda estão na rua (o casamento de 10/10 não devolveu).
    expect(r.disponivel).toBe(20);
    expect(r.conflitos.map((c) => c.eventId)).not.toContain(desmarcado);
  });

  it("…mas o que saiu para ele e não voltou continua fora", async () => {
    const { t, dona, castical, casamento, proximo } = await cenario();
    await t.run(async (ctx) => ctx.db.patch(casamento, { status: "cancelled" }));
    const r = await dona.query(api.acervo.disponibilidade, {
      collectionItemId: castical, eventId: proximo, inicio: "2026-10-23", fim: "2026-10-25",
    });
    if (!r) throw new Error("disponibilidade vazia");
    expect(r.disponivel).toBe(20);
    expect(r.foraSemVoltar).toBe(20);
  });

  it("reservar para outro evento enxerga o cancelamento dentro da mutation", async () => {
    const { t, dona, castical, proximo } = await cenario();
    await t.run(async (ctx) => {
      const ev = await ctx.db.get(proximo);
      const id = await ctx.db.insert("events", {
        userId: ev!.userId, name: "Desmarcado", type: "wedding", date: "2026-10-24",
        location: "L", clientName: "C", status: "cancelled",
      });
      await ctx.db.insert("collectionReservations", {
        userId: ev!.userId, collectionItemId: castical, eventId: id, quantidade: 40,
        inicio: "2026-10-23", fim: "2026-10-25", origem: "manual",
      });
    });
    const r = await dona.mutation(api.acervo.reservar, {
      collectionItemId: castical, eventId: proximo as Id<"events">, quantidade: 20,
      inicio: "2026-10-23", fim: "2026-10-25",
    });
    expect(r).toMatchObject({ deficit: 0, disponivel: 20 });
  });
});
