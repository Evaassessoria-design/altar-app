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
// O CICLO DO ACERVO NO BANCO — o exemplo da Mesa Toscana, e o que pode dar errado
//
//   Marina & Gabriel: 8 mesas saíram, 8 voltaram.
//   Conferência: 6 prontas, 1 limpar, 1 reparo → 6/8 disponíveis de novo.
//   Lavada, volta a pronta; reparada, idem — e a disponibilidade acompanha.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona" });
  const outra = await autenticarComo(t, { nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra" });
  const ids = await t.run(async (ctx) => {
    const donaId = (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona")).unique())!._id;
    const mesa = await ctx.db.insert("collectionItems", {
      userId: donaId, nome: "Mesa Toscana", searchName: "mesa toscana", unidade: "un", quantidadeTotal: 8,
    });
    const casamento = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-10-10",
      location: "L", clientName: "C", status: "completed",
    });
    const proximo = await ctx.db.insert("events", {
      userId: donaId, name: "Próximo", type: "wedding", date: "2026-10-24",
      location: "L", clientName: "C", status: "confirmed",
    });
    const reserva = await ctx.db.insert("collectionReservations", {
      userId: donaId, collectionItemId: mesa, eventId: casamento, quantidade: 8,
      inicio: "2026-10-09", fim: "2026-10-11", origem: "manual", saiu: 8,
    });
    const joao = await ctx.db.insert("teamMembers", { userId: donaId, name: "João", role: "galpão" });
    return { mesa, casamento, proximo, reserva, joao };
  });
  const disponivelParaOProximo = () =>
    dona.query(api.acervo.disponibilidade, {
      collectionItemId: ids.mesa, eventId: ids.proximo, inicio: "2026-10-23", fim: "2026-10-25",
    });
  const item = () => t.run((ctx) => ctx.db.get(ids.mesa));
  return { t, dona, outra, ...ids, disponivelParaOProximo, item };
}

describe("conferência de retorno — o exemplo da missão", () => {
  it("8 voltaram: 6 prontas, 1 limpar, 1 reparo → 6 disponíveis para o próximo evento", async () => {
    const { dona, casamento, reserva, joao, disponivelParaOProximo, item } = await cenario();
    const r = await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, responsibleId: joao,
      linhas: [{ reservaId: reserva, voltou: 8, limpeza: 1, reparo: 1 }],
    });
    expect(r).toEqual({ conferidas: 1, pecasForaDeUso: 2 });
    expect(await item()).toMatchObject({ quantidadeTotal: 8, emLimpeza: 1, emManutencao: 1 });
    expect((await disponivelParaOProximo())?.disponivel).toBe(6);
  });

  it("lavada e reparada, cada uma volta a pronta — e a disponibilidade acompanha", async () => {
    const { dona, casamento, reserva, mesa, disponivelParaOProximo } = await cenario();
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 8, limpeza: 1, reparo: 1 }],
    });
    await dona.mutation(api.acervo.moverCondicao, { collectionItemId: mesa, de: "limpeza", para: "pronto", quantidade: 1 });
    expect((await disponivelParaOProximo())?.disponivel).toBe(7);
    await dona.mutation(api.acervo.moverCondicao, { collectionItemId: mesa, de: "reparo", para: "pronto", quantidade: 1 });
    expect((await disponivelParaOProximo())?.disponivel).toBe(8);
  });

  it("retorno parcial: 6 de 8 voltaram — as 2 que faltam continuam fora", async () => {
    const { dona, casamento, reserva, disponivelParaOProximo } = await cenario();
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 6, reparo: 1 }],
    });
    // 8 − 2 que não voltaram − 1 em reparo.
    expect((await disponivelParaOProximo())?.disponivel).toBe(5);
  });

  it("conferir de novo não conta duas vezes", async () => {
    const { dona, casamento, reserva, item } = await cenario();
    const linhas = [{ reservaId: reserva, voltou: 8, limpeza: 1 }];
    await dona.mutation(api.acervo.conferirRetorno, { eventId: casamento, linhas });
    await expect(dona.mutation(api.acervo.conferirRetorno, { eventId: casamento, linhas })).rejects.toThrow(/já foi conferido/);
    expect((await item())?.emLimpeza).toBe(1);
  });

  it("quantidade divergente recusa a conferência INTEIRA, sem gravar nada", async () => {
    const { dona, casamento, reserva, item, t } = await cenario();
    for (const linha of [
      { reservaId: reserva, voltou: 9 },                          // voltou mais do que saiu
      { reservaId: reserva, voltou: 8, limpeza: 5, reparo: 4 },   // condições > voltou
      { reservaId: reserva, voltou: 8, limpeza: -1 },             // negativo
    ]) {
      await expect(dona.mutation(api.acervo.conferirRetorno, { eventId: casamento, linhas: [linha] })).rejects.toThrow();
    }
    const depois = await item();
    expect(depois?.emLimpeza).toBeUndefined();
    expect(depois?.emManutencao).toBeUndefined();
    const r = await t.run((ctx) => ctx.db.get(reserva));
    expect(r?.conferidoEm).toBeUndefined();
  });

  it("reserva de OUTRO evento, ou de outra conta: NOT_FOUND", async () => {
    const { dona, outra, proximo, casamento, reserva } = await cenario();
    await expect(
      dona.mutation(api.acervo.conferirRetorno, { eventId: proximo, linhas: [{ reservaId: reserva, voltou: 8 }] }),
    ).rejects.toThrow(/não encontrad/);
    await expect(
      outra.mutation(api.acervo.conferirRetorno, { eventId: casamento, linhas: [{ reservaId: reserva, voltou: 8 }] }),
    ).rejects.toThrow(/não encontrad/);
  });
});

describe("ocorrência — o histórico nunca é sobrescrito", () => {
  it("guarda condição anterior e nova, quem registrou, evento e observação", async () => {
    const { dona, mesa, casamento, joao } = await cenario();
    await dona.mutation(api.acervo.moverCondicao, {
      collectionItemId: mesa, de: "pronto", para: "reparo", quantidade: 1,
      motivo: "Pé traseiro com folga", eventId: casamento, responsibleId: joao,
    });
    await dona.mutation(api.acervo.moverCondicao, {
      collectionItemId: mesa, de: "reparo", para: "pronto", quantidade: 1, motivo: "Colado",
    });
    const hist = await dona.query(api.acervo.historicoDoItem, { collectionItemId: mesa });
    expect(hist.map((h) => [h.condicaoDe, h.condicaoPara, h.motivo])).toEqual([
      ["reparo", "pronto", "Colado"],
      ["pronto", "reparo", "Pé traseiro com folga"],
    ]);
    expect(hist[1]).toMatchObject({ responsavelNome: "João", eventName: "Marina & Gabriel", fotoUrl: null });
    // Quantas peças — o delta é zero numa mudança de condição.
    expect(hist.map((h) => h.quantidadeMovida)).toEqual([1, 1]);
  });

  it("peça indisponível não é reservável sem aviso: o déficit aparece", async () => {
    const { dona, mesa, proximo, reserva } = await cenario();
    // As 8 voltaram do casamento — senão contariam como fora, não como indisponíveis.
    await dona.mutation(api.acervo.registrarRetorno, { id: reserva, voltou: 8 });
    await dona.mutation(api.acervo.moverCondicao, { collectionItemId: mesa, de: "pronto", para: "indisponivel", quantidade: 3 });
    const r = await dona.mutation(api.acervo.reservar, {
      collectionItemId: mesa, eventId: proximo as Id<"events">, quantidade: 8,
    });
    // A reserva não é cortada (decisão do módulo), mas o déficit é dito.
    expect(r).toMatchObject({ deficit: 3 });
  });

  it("alteração em sequência não passa do que existe", async () => {
    const { dona, mesa } = await cenario();
    await dona.mutation(api.acervo.moverCondicao, { collectionItemId: mesa, de: "pronto", para: "limpeza", quantidade: 5 });
    await expect(
      dona.mutation(api.acervo.moverCondicao, { collectionItemId: mesa, de: "pronto", para: "reparo", quantidade: 4 }),
    ).rejects.toThrow(/Só 3/);
  });

  it("outra conta não mexe na condição da dona", async () => {
    const { outra, mesa, item } = await cenario();
    await expect(
      outra.mutation(api.acervo.moverCondicao, { collectionItemId: mesa, de: "pronto", para: "reparo", quantidade: 1 }),
    ).rejects.toThrow();
    expect((await item())?.emManutencao).toBeUndefined();
  });

  it("baixa comum não deixa o total abaixo do que está fora de uso", async () => {
    const { dona, mesa } = await cenario();
    await dona.mutation(api.acervo.moverCondicao, { collectionItemId: mesa, de: "pronto", para: "limpeza", quantidade: 6 });
    await expect(
      dona.mutation(api.acervo.ajustarEstoque, { collectionItemId: mesa, tipo: "perda", quantidade: 3 }),
    ).rejects.toThrow(/limpeza/);
  });
});

describe("'o que voltou com problema do casamento?' — do histórico, não de memória", () => {
  it("depois da conferência, o pós-evento lista item, condição, quantidade e evento", async () => {
    const { dona, outra, casamento, reserva } = await cenario();
    await dona.mutation(api.acervo.conferirRetorno, {
      eventId: casamento, linhas: [{ reservaId: reserva, voltou: 8, limpeza: 1, reparo: 1 }],
    });
    const p = await dona.query(api.acervo.pendenciasPosEvento, {});
    expect(p.voltaramComProblema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nome: "Mesa Toscana", condicao: "limpeza", quantidade: 1, eventoNome: "Marina & Gabriel" }),
        expect.objectContaining({ nome: "Mesa Toscana", condicao: "reparo", quantidade: 1, eventoNome: "Marina & Gabriel" }),
      ]),
    );
    // Outra conta não vê nada disso.
    const daOutra = await outra.query(api.acervo.pendenciasPosEvento, {});
    expect(daOutra.totalVoltaramComProblema).toBe(0);
  });
});
