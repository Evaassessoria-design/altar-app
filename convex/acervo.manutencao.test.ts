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
import { dataEmDias } from "./lib/dataDoDia";
import {
  disponibilidadeNaJanela,
  pendenciasDoAcervo,
  picoDeReservas,
  type ReservaParaPendencias,
} from "./lib/acervo";
import { aplicarManutencao, baixaRespeitaManutencao } from "./lib/ajusteDeAcervo";

// ═════════════════════════════════════════════════════════════════════════════
// A SEGUNDA-FEIRA PÓS-EVENTO
//
// O primeiro conteúdo da campanha da live fala dela: o que voltou, o que não
// voltou, o que foi para o conserto, e o que isso faz com o sábado seguinte.
// Até 28/09 o ALTAR respondia a metade — e o número de disponibilidade MENTIA
// exatamente nesse cenário: peça que não voltou de um evento encerrado não
// descontava de nada. Cada bloco abaixo tranca uma parte da resposta.
// ═════════════════════════════════════════════════════════════════════════════

const r = (
  id: string,
  eventId: string,
  quantidade: number,
  inicio: string,
  fim: string,
  mov: { saiu?: number; voltou?: number } = {},
) => ({ _id: id, eventId, quantidade, inicio, fim, ...mov });

describe("disponibilidade: o que não está no galpão não atende o próximo evento", () => {
  const sabado = { inicio: "2026-10-16", fim: "2026-10-18" };

  it("peça que não voltou de evento encerrado desconta do próximo", () => {
    // Casamento de domingo: saíram 12, voltaram 10. Sábado seguinte pede 12.
    const d = disponibilidadeNaJanela(
      12,
      [r("a", "domingo", 12, "2026-10-09", "2026-10-11", { saiu: 12, voltou: 10 })],
      sabado,
      "sabado",
    );
    expect(d.foraSemVoltar).toBe(2);
    expect(d.disponivel).toBe(10);
    expect(d.pendentesDeRetorno).toEqual([{ reservaId: "a", eventId: "domingo", quantidade: 2 }]);
  });

  it("peça em manutenção desconta — é da empresa, mas não vai ao evento", () => {
    const d = disponibilidadeNaJanela(12, [], sabado, "sabado", 2);
    expect(d.emManutencao).toBe(2);
    expect(d.disponivel).toBe(10);
  });

  it("'12 necessárias, 10 disponíveis, 2 em manutenção' — os números conversam", () => {
    const d = disponibilidadeNaJanela(12, [], sabado, "sabado", 2);
    expect(d.total - d.emManutencao - d.foraSemVoltar - d.reservadoPorOutros).toBe(d.disponivel);
  });

  it("reserva que saiu MAIS do que o prometido segura o excesso enquanto corre", () => {
    const d = disponibilidadeNaJanela(
      30,
      [r("a", "outro", 20, "2026-10-16", "2026-10-18", { saiu: 22 })],
      sabado,
      "sabado",
    );
    expect(d.reservadoPorOutros).toBe(22);
    expect(d.disponivel).toBe(8);
  });

  it("evento que ainda vem DEPOIS não tem peça fora para descontar", () => {
    const d = disponibilidadeNaJanela(
      12,
      [r("a", "depois", 12, "2026-10-23", "2026-10-25", { saiu: 12 })],
      sabado,
      "sabado",
    );
    expect(d.foraSemVoltar).toBe(0);
    expect(d.disponivel).toBe(12);
  });

  it("tudo voltou: nada muda em relação ao comportamento antigo", () => {
    const d = disponibilidadeNaJanela(
      12,
      [r("a", "domingo", 12, "2026-10-09", "2026-10-11", { saiu: 12, voltou: 12 })],
      sabado,
      "sabado",
    );
    expect(d.disponivel).toBe(12);
  });

  it("o pior dia da lista geral também desconta conserto e peça fora", () => {
    const reservas = [
      r("a", "domingo", 12, "2026-10-09", "2026-10-11", { saiu: 12, voltou: 10 }),
      r("b", "sabado", 12, "2026-10-16", "2026-10-18"),
    ];
    // Sem conserto e sem peça fora, 12 cobriria o sábado.
    expect(picoDeReservas(12, reservas, "2026-10-13").deficit).toBe(2);
    expect(picoDeReservas(12, reservas, "2026-10-13", 1).deficit).toBe(3);
  });
});

describe("manutenção: três operações, nenhuma inventa ou some com peça", () => {
  const base = { quantidadeAtual: 12, unidade: "un" };

  it("envio não mexe no total e respeita o que já está no conserto", () => {
    expect(aplicarManutencao({ ...base, emManutencao: undefined, operacao: "manutencao_envio", quantidade: 2 }))
      .toEqual({ ok: true, delta: 0, quantidadeDepois: 12, manutencaoDepois: 2 });
    const r2 = aplicarManutencao({ ...base, emManutencao: 11, operacao: "manutencao_envio", quantidade: 2 });
    expect(r2.ok).toBe(false);
  });

  it("retorno devolve à disponibilidade; sem conserto baixa o total junto", () => {
    expect(aplicarManutencao({ ...base, emManutencao: 2, operacao: "manutencao_retorno", quantidade: 2 }))
      .toEqual({ ok: true, delta: 0, quantidadeDepois: 12, manutencaoDepois: 0 });
    expect(aplicarManutencao({ ...base, emManutencao: 2, operacao: "manutencao_descarte", quantidade: 1 }))
      .toEqual({ ok: true, delta: -1, quantidadeDepois: 11, manutencaoDepois: 1 });
  });

  it("não volta do conserto o que não foi para lá", () => {
    for (const operacao of ["manutencao_retorno", "manutencao_descarte"] as const) {
      expect(aplicarManutencao({ ...base, emManutencao: undefined, operacao, quantidade: 1 }).ok).toBe(false);
      expect(aplicarManutencao({ ...base, emManutencao: 1, operacao, quantidade: 2 }).ok).toBe(false);
    }
  });

  it("recusa quantidade impossível: zero, negativa, NaN e fração de peça", () => {
    for (const quantidade of [0, -1, Number.NaN, 1.5]) {
      expect(
        aplicarManutencao({ ...base, emManutencao: 0, operacao: "manutencao_envio", quantidade }).ok,
        String(quantidade),
      ).toBe(false);
    }
  });

  it("baixa comum não deixa o total abaixo do que está no conserto", () => {
    expect(baixaRespeitaManutencao(5, 7)).toMatch(/em manutenção/);
    expect(baixaRespeitaManutencao(7, 7)).toBeNull();
    expect(baixaRespeitaManutencao(0, undefined)).toBeNull();
  });
});

describe("pendências: a resposta da segunda-feira num lugar só", () => {
  const hoje = "2026-10-13";
  const itens = [
    { _id: "vaso", nome: "Vaso", unidade: "un", quantidadeTotal: 12, emManutencao: 2 },
    { _id: "castical", nome: "Castiçal", unidade: "un", quantidadeTotal: 30 },
  ];
  const reservas: ReservaParaPendencias[] = [
    { ...r("a", "domingo", 12, "2026-10-09", "2026-10-11", { saiu: 12, voltou: 10 }), collectionItemId: "vaso" },
    { ...r("b", "sabado", 12, "2026-10-16", "2026-10-18"), collectionItemId: "vaso" },
    { ...r("c", "sabado", 10, "2026-10-16", "2026-10-18"), collectionItemId: "castical" },
  ];

  it("nomeia o que não voltou, o que está no conserto e o impacto no sábado", () => {
    const p = pendenciasDoAcervo(itens, reservas, hoje);
    expect(p.fora).toEqual([
      expect.objectContaining({ itemId: "vaso", eventId: "domingo", quantidade: 2 }),
    ]);
    expect(p.emManutencao).toEqual([expect.objectContaining({ itemId: "vaso", quantidade: 2 })]);
    expect(p.impacto).toEqual([
      expect.objectContaining({
        itemId: "vaso", eventId: "sabado", necessario: 12,
        emManutencao: 2, foraSemVoltar: 2, disponivel: 8, deficit: 4,
      }),
    ]);
  });

  it("item que cobre a reserva não aparece como impacto — sem alarme falso", () => {
    const p = pendenciasDoAcervo(itens, reservas, hoje);
    expect(p.impacto.some((l) => l.itemId === "castical")).toBe(false);
  });

  it("durante a janela do evento a peça está onde deve estar — não é 'fora'", () => {
    const p = pendenciasDoAcervo(itens, reservas, "2026-10-10");
    expect(p.fora).toEqual([]);
  });

  it("reserva que já saiu do galpão não é mais impacto: as peças estão com ela", () => {
    const saiu: ReservaParaPendencias[] = [
      { ...r("b", "sabado", 12, "2026-10-16", "2026-10-18", { saiu: 12 }), collectionItemId: "vaso" },
    ];
    expect(pendenciasDoAcervo(itens, saiu, "2026-10-17").impacto).toEqual([]);
  });
});

// ── NO BANCO, PELAS MUTATIONS REAIS ─────────────────────────────────────────

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona",
  });
  const outra = await autenticarComo(t, {
    nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
  });
  const ids = await t.run(async (ctx) => {
    const donaId = (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona")).unique())!._id;
    const vaso = await ctx.db.insert("collectionItems", {
      userId: donaId, nome: "Vaso", searchName: "vaso", unidade: "un", quantidadeTotal: 12,
    });
    const passado = await ctx.db.insert("events", {
      userId: donaId, name: "Casamento de domingo", type: "wedding", date: dataEmDias(-4),
      location: "L", clientName: "C", status: "completed",
    });
    const proximo = await ctx.db.insert("events", {
      userId: donaId, name: "Sábado que vem", type: "wedding", date: dataEmDias(5),
      location: "L", clientName: "C", status: "confirmed",
    });
    await ctx.db.insert("collectionReservations", {
      userId: donaId, collectionItemId: vaso, eventId: passado, quantidade: 12,
      inicio: dataEmDias(-5), fim: dataEmDias(-3), origem: "manual", saiu: 12, voltou: 10,
    });
    await ctx.db.insert("collectionReservations", {
      userId: donaId, collectionItemId: vaso, eventId: proximo, quantidade: 12,
      inicio: dataEmDias(4), fim: dataEmDias(6), origem: "manual",
    });
    return { vaso, passado, proximo };
  });
  return { t, dona, outra, ...ids };
}

describe("registrarManutencao no banco", () => {
  it("enviar ao conserto grava a linha auditável e tira da disponibilidade do evento", async () => {
    const { dona, vaso, passado, proximo } = await cenario();
    await dona.mutation(api.acervo.registrarManutencao, {
      collectionItemId: vaso, operacao: "manutencao_envio", quantidade: 1,
      motivo: "voltou com a borda lascada", eventId: passado,
    });

    const hist = await dona.query(api.acervo.historicoDoItem, { collectionItemId: vaso });
    expect(hist[0]).toMatchObject({
      tipo: "manutencao_envio", delta: 0, manutencaoAntes: 0, manutencaoDepois: 1,
    });

    // 12 − 2 que não voltaram − 1 no conserto = 9 para o sábado.
    const d = await dona.query(api.acervo.disponibilidade, {
      collectionItemId: vaso, eventId: proximo, inicio: dataEmDias(4), fim: dataEmDias(6),
    });
    expect(d).toMatchObject({ foraSemVoltar: 2, emManutencao: 1, disponivel: 9 });
  });

  it("zerar a manutenção volta o campo a AUSENTE, não a 0", async () => {
    const { t, dona, vaso } = await cenario();
    await dona.mutation(api.acervo.registrarManutencao, {
      collectionItemId: vaso, operacao: "manutencao_envio", quantidade: 1,
    });
    await dona.mutation(api.acervo.registrarManutencao, {
      collectionItemId: vaso, operacao: "manutencao_retorno", quantidade: 1,
    });
    const item = await t.run((ctx) => ctx.db.get(vaso));
    expect(item?.emManutencao).toBeUndefined();
  });

  it("item de outra conta: NOT_FOUND, e nada é gravado", async () => {
    const { t, outra, vaso } = await cenario();
    await expect(
      outra.mutation(api.acervo.registrarManutencao, {
        collectionItemId: vaso, operacao: "manutencao_envio", quantidade: 1,
      }),
    ).rejects.toThrow();
    const item = await t.run((ctx) => ctx.db.get(vaso));
    expect(item?.emManutencao).toBeUndefined();
    const linhas = await t.run((ctx) => ctx.db.query("collectionAdjustments").collect());
    expect(linhas).toHaveLength(0);
  });

  it("evento de outra conta como procedência é recusado", async () => {
    const { t, dona, vaso } = await cenario();
    const eventoAlheio = await t.run(async (ctx) => {
      const outraId = (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|outra")).unique())!._id;
      return ctx.db.insert("events", {
        userId: outraId, name: "Da outra", type: "wedding", date: dataEmDias(1),
        location: "L", clientName: "C", status: "confirmed",
      });
    });
    await expect(
      dona.mutation(api.acervo.registrarManutencao, {
        collectionItemId: vaso, operacao: "manutencao_envio", quantidade: 1,
        eventId: eventoAlheio as Id<"events">,
      }),
    ).rejects.toThrow();
  });

  it("baixa comum que deixaria o total abaixo do conserto é recusada", async () => {
    const { dona, vaso } = await cenario();
    await dona.mutation(api.acervo.registrarManutencao, {
      collectionItemId: vaso, operacao: "manutencao_envio", quantidade: 5,
    });
    await expect(
      dona.mutation(api.acervo.ajustarEstoque, { collectionItemId: vaso, tipo: "perda", quantidade: 10 }),
    ).rejects.toThrow(/em manutenção/);
    await expect(
      dona.mutation(api.acervo.registrarContagem, { collectionItemId: vaso, quantidadeContada: 3 }),
    ).rejects.toThrow(/em manutenção/);
  });
});

describe("pendenciasPosEvento no banco", () => {
  it("a dona vê o que não voltou e o impacto no sábado, com o nome dos eventos", async () => {
    const { dona } = await cenario();
    const p = await dona.query(api.acervo.pendenciasPosEvento, {});
    expect(p.fora).toEqual([
      expect.objectContaining({ quantidade: 2, eventoNome: "Casamento de domingo" }),
    ]);
    expect(p.impacto).toEqual([
      expect.objectContaining({ necessario: 12, disponivel: 10, deficit: 2, eventoNome: "Sábado que vem" }),
    ]);
  });

  it("outra conta não vê nada da dona", async () => {
    const { outra } = await cenario();
    const p = await outra.query(api.acervo.pendenciasPosEvento, {});
    expect(p).toMatchObject({ totalFora: 0, totalEmManutencao: 0, totalImpacto: 0 });
  });
});
