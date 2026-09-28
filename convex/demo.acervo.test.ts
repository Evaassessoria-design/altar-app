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
// A DEMO CONTANDO A SEGUNDA-FEIRA PÓS-EVENTO
//
// Rafaela & Ian foi no fim de semana: saíram 24 castiçais, voltaram 20, e 8
// dos que voltaram estão no conserto. O que a tela precisa mostrar — pela
// mesma consulta que ela chama — é o que isso faz com os próximos eventos:
// Sofia & Tomás fica sem peça; Marina & Gabriel, o herói, continua coberto.
// Se o herói passar a acusar falta, o bloco 3 da live muda de história sem
// ninguém ter decidido isso.
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
  const r = await t.mutation(internal.demo.seed, {});
  expect(r.criado).toBe(true);
  return { dona, eventId: r.eventId };
}

describe("/acervo — o bloco Pós-evento com a demo semeada", () => {
  it("nomeia o que não voltou de Rafaela & Ian e o que está no conserto", async () => {
    const { dona } = await comADemo();
    const p = await dona.query(api.acervo.pendenciasPosEvento, {});
    expect(p.fora).toEqual([
      expect.objectContaining({
        nome: "Castiçal de vidro 25cm", quantidade: 4, eventoNome: "Casamento Rafaela & Ian",
      }),
    ]);
    expect(p.emManutencao).toEqual([
      expect.objectContaining({ nome: "Castiçal de vidro 25cm", quantidade: 8 }),
    ]);
  });

  it("o impacto cai em Sofia & Tomás — '30 necessárias · 24 disponíveis'", async () => {
    const { dona } = await comADemo();
    const p = await dona.query(api.acervo.pendenciasPosEvento, {});
    expect(p.impacto).toContainEqual(
      expect.objectContaining({
        eventoNome: "Casamento Sofia & Tomás",
        nome: "Castiçal de vidro 25cm",
        necessario: 30, disponivel: 24, emManutencao: 8, foraSemVoltar: 4, deficit: 6,
      }),
    );
  });

  it("o herói continua coberto nos castiçais: a história do bloco 3 não muda", async () => {
    const { dona, eventId } = await comADemo();
    const p = await dona.query(api.acervo.pendenciasPosEvento, {});
    expect(
      p.impacto.some((l) => l.eventId === eventId && l.nome === "Castiçal de vidro 25cm"),
    ).toBe(false);
    const doHeroi = await dona.query(api.acervo.doEvento, { eventId });
    const casticais = doHeroi!.reservas.find((r) => r.item?.nome === "Castiçal de vidro 25cm");
    expect(casticais).toMatchObject({ disponivel: 24, deficit: 0, emManutencao: 8, foraSemVoltar: 4 });
  });

  it("o histórico explica o conserto, com o evento de onde a peça voltou", async () => {
    const { dona } = await comADemo();
    const itens = await dona.query(api.acervo.listItems, {});
    const castical = itens.find((i) => i.nome === "Castiçal de vidro 25cm")!;
    const hist = await dona.query(api.acervo.historicoDoItem, { collectionItemId: castical._id });
    expect(hist[0]).toMatchObject({
      tipo: "manutencao_envio", manutencaoAntes: 0, manutencaoDepois: 8,
      eventName: "Casamento Rafaela & Ian",
    });
  });
});
