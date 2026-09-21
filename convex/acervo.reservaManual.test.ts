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

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// RESERVAR UMA PEÇA À MÃO
//
// ── O BECO SEM SAÍDA QUE ISTO FECHA ─────────────────────────────────────────
// `acervo.reservar` existe, é idempotente e está testada desde sempre — e
// NENHUMA tela a chamava. Reservar só acontecia por "Reservar da ficha", que
// exige item de montagem + receita + material + vínculo com o acervo: quatro
// passos para dizer "vou levar 20 castiçais".
//
// Pior: quando dois itens do acervo servem o mesmo material, `reservarDaFicha`
// se recusa a escolher (corretamente) e a tela mandava "reserve manualmente o
// que for usar" — uma instrução para uma ação que não existia.
//
// Estes testes chamam a mutation REAL, com sessão de verdade.
// ═════════════════════════════════════════════════════════════════════════════

const NOW = "2026-09-02T12:00:00.000Z";

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona",
  });
  const outra = await autenticarComo(t, {
    nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (subject: string) =>
      (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", subject))
        .unique())!._id;
    const donaId = await idDe("auth|dona");
    const outraId = await idDe("auth|outra");

    const castical = await ctx.db.insert("collectionItems", {
      userId: donaId, nome: "Castiçal Roma", searchName: "castical roma",
      unidade: "un", quantidadeTotal: 40, updatedAt: NOW,
    });
    const arquivado = await ctx.db.insert("collectionItems", {
      userId: donaId, nome: "Castiçal Viena", searchName: "castical viena",
      unidade: "un", quantidadeTotal: 10, archived: true, updatedAt: NOW,
    });
    const daOutra = await ctx.db.insert("collectionItems", {
      userId: outraId, nome: "Castiçal alheio", searchName: "castical alheio",
      unidade: "un", quantidadeTotal: 99, updatedAt: NOW,
    });

    const marina = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-10-10",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });
    const ana = await ctx.db.insert("events", {
      userId: donaId, name: "Ana & Pedro", type: "wedding", date: "2026-10-11",
      location: "Salão", clientName: "Ana", status: "confirmed",
    });
    const eventoDaOutra = await ctx.db.insert("events", {
      userId: outraId, name: "Da outra", type: "wedding", date: "2026-10-10",
      location: "L", clientName: "C", status: "confirmed",
    });

    return { donaId, outraId, castical, arquivado, daOutra, marina, ana, eventoDaOutra };
  });

  return { t, dona, outra, ...ids };
}

const reservasDoEvento = (t: ReturnType<typeof convexTest>, eventId: string) =>
  t.run(async (ctx: MutationCtx) =>
    ctx.db
      .query("collectionReservations")
      .withIndex("by_event", (q) => q.eq("eventId", eventId as never))
      .collect(),
  );

describe("a decoradora reserva direto, sem passar pela ficha", () => {
  it("grava a reserva com a janela pedida", async () => {
    const { t, dona, castical, marina } = await cenario();
    const r = await dona.mutation(api.acervo.reservar, {
      collectionItemId: castical, eventId: marina, quantidade: 20,
      inicio: "2026-10-09", fim: "2026-10-11", origem: "manual",
    });
    expect(r.criada).toBe(true);
    expect(r.deficit).toBe(0);

    const [reserva] = await reservasDoEvento(t, marina);
    expect(reserva.quantidade).toBe(20);
    expect(reserva.origem).toBe("manual");
  });

  it("sem janela, usa a do evento: véspera → dia seguinte", async () => {
    // É a operação real da decoração, e é ela que faz dois eventos em dias
    // vizinhos disputarem a mesma peça.
    const { t, dona, castical, marina } = await cenario();
    await dona.mutation(api.acervo.reservar, {
      collectionItemId: castical, eventId: marina, quantidade: 5,
    });
    const [reserva] = await reservasDoEvento(t, marina);
    expect(reserva.inicio).toBe("2026-10-09");
    expect(reserva.fim).toBe("2026-10-11");
  });

  it("reservar duas vezes AJUSTA — não cria uma segunda", async () => {
    // Duas reservas do mesmo item no mesmo evento contariam a peça duas vezes
    // contra os outros eventos.
    const { t, dona, castical, marina } = await cenario();
    await dona.mutation(api.acervo.reservar, {
      collectionItemId: castical, eventId: marina, quantidade: 20,
    });
    const segunda = await dona.mutation(api.acervo.reservar, {
      collectionItemId: castical, eventId: marina, quantidade: 25,
    });
    expect(segunda.criada).toBe(false);
    const reservas = await reservasDoEvento(t, marina);
    expect(reservas).toHaveLength(1);
    expect(reservas[0].quantidade).toBe(25);
  });

  it("o déficit NÃO bloqueia — ele fica visível", async () => {
    // Cortar a reserva para caber esconderia justamente o problema que a
    // decoradora precisa ver para alugar ou comprar.
    const { t, dona, castical, marina, ana } = await cenario();
    await dona.mutation(api.acervo.reservar, {
      collectionItemId: castical, eventId: ana, quantidade: 30,
      inicio: "2026-10-10", fim: "2026-10-12",
    });
    const r = await dona.mutation(api.acervo.reservar, {
      collectionItemId: castical, eventId: marina, quantidade: 30,
      inicio: "2026-10-09", fim: "2026-10-11",
    });
    expect(r.deficit).toBe(20);
    const [reserva] = await reservasDoEvento(t, marina);
    expect(reserva.quantidade, "a reserva foi cortada para caber").toBe(30);
  });

  it("a conta do disponível é a mesma que a tela mostra antes de gravar", async () => {
    const { dona, castical, marina, ana } = await cenario();
    await dona.mutation(api.acervo.reservar, {
      collectionItemId: castical, eventId: ana, quantidade: 30,
      inicio: "2026-10-10", fim: "2026-10-12",
    });
    const previa = await dona.query(api.acervo.disponibilidade, {
      collectionItemId: castical, eventId: marina, inicio: "2026-10-09", fim: "2026-10-11",
    });
    expect(previa!.disponivel).toBe(10);
    const r = await dona.mutation(api.acervo.reservar, {
      collectionItemId: castical, eventId: marina, quantidade: 30,
      inicio: "2026-10-09", fim: "2026-10-11",
    });
    expect(r.disponivel).toBe(previa!.disponivel);
  });
});

describe("o que a reserva manual recusa", () => {
  it("peça arquivada não é reservável", async () => {
    const { dona, arquivado, marina } = await cenario();
    await expect(
      dona.mutation(api.acervo.reservar, {
        collectionItemId: arquivado, eventId: marina, quantidade: 1,
      }),
    ).rejects.toThrow(/arquivad/i);
  });

  it("janela invertida é erro de digitação, não intenção", async () => {
    const { dona, castical, marina } = await cenario();
    await expect(
      dona.mutation(api.acervo.reservar, {
        collectionItemId: castical, eventId: marina, quantidade: 5,
        inicio: "2026-10-11", fim: "2026-10-09",
      }),
    ).rejects.toThrow(/anterior/i);
  });

  it("quantidade fracionada em unidade indivisível é recusada", async () => {
    const { dona, castical, marina } = await cenario();
    await expect(
      dona.mutation(api.acervo.reservar, {
        collectionItemId: castical, eventId: marina, quantidade: 2.5,
      }),
    ).rejects.toThrow(/inválida/i);
  });

  it("quantidade negativa é recusada", async () => {
    const { dona, castical, marina } = await cenario();
    await expect(
      dona.mutation(api.acervo.reservar, {
        collectionItemId: castical, eventId: marina, quantidade: -5,
      }),
    ).rejects.toThrow(/inválida/i);
  });
});

describe("id de outra empresa não reserva nada", () => {
  it("peça de outra empresa responde NOT_FOUND", async () => {
    const { t, dona, daOutra, marina } = await cenario();
    await expect(
      dona.mutation(api.acervo.reservar, {
        collectionItemId: daOutra, eventId: marina, quantidade: 1,
      }),
    ).rejects.toThrow(/não encontrado/i);
    expect(await reservasDoEvento(t, marina)).toHaveLength(0);
  });

  it("evento de outra empresa responde NOT_FOUND", async () => {
    const { t, dona, castical, eventoDaOutra } = await cenario();
    await expect(
      dona.mutation(api.acervo.reservar, {
        collectionItemId: castical, eventId: eventoDaOutra, quantidade: 1,
      }),
    ).rejects.toThrow(/não encontrado/i);
    expect(await reservasDoEvento(t, eventoDaOutra)).toHaveLength(0);
  });

  it("a prévia de disponibilidade também não abre peça alheia", async () => {
    // Devolve `null` em vez de lançar: é uma leitura que degrada para vazio.
    const { dona, daOutra, marina } = await cenario();
    expect(
      await dona.query(api.acervo.disponibilidade, {
        collectionItemId: daOutra, eventId: marina, inicio: "2026-10-09", fim: "2026-10-11",
      }),
    ).toBeNull();
  });

  it("sem sessão, ninguém reserva", async () => {
    const { t, castical, marina } = await cenario();
    await expect(
      t.mutation(api.acervo.reservar, {
        collectionItemId: castical, eventId: marina, quantidade: 1,
      }),
    ).rejects.toThrow();
  });
});

describe("a tela oferece os dois caminhos", () => {
  const TELA = "src/pages/app/events/[id]/acervo/page.tsx";
  const fonte = readFileSync(TELA, "utf-8");

  it("o botão de reservar à mão existe", () => {
    expect(fonte).toContain("ReservaManualDialog");
    expect(fonte).toMatch(/Reservar peça/);
  });

  it("o estado vazio deixou de mandar só para a ficha", () => {
    // Quem já sabe o que vai levar não precisa modelar uma receita antes.
    const vazio = fonte.slice(fonte.indexOf("<Empty>"), fonte.indexOf("</Empty>"));
    expect(vazio).toContain("Reservar peça");
    expect(vazio).toContain("Ficha Técnica");
  });

  it("o diálogo não decide disponibilidade por conta própria", () => {
    // A prévia vem de `acervo.disponibilidade`, a MESMA regra que a gravação
    // recalcula dentro da mutation.
    const dialogo = readFileSync(
      "src/pages/app/events/[id]/acervo/_components/reserva-manual-dialog.tsx",
      "utf-8",
    );
    expect(dialogo).toContain("api.acervo.disponibilidade");
    expect(dialogo).not.toMatch(/disponibilidadeNaJanela|deficitDaReserva/);
  });

  it("a janela sugerida vem do módulo de domínio, não de uma conta na tela", () => {
    const dialogo = readFileSync(
      "src/pages/app/events/[id]/acervo/_components/reserva-manual-dialog.tsx",
      "utf-8",
    );
    expect(dialogo).toContain("janelaSugerida(dataDoEvento)");
  });
});
