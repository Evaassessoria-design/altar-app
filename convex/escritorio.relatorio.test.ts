import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { LIVE_ALTAR } from "./lib/campanha";
import {
  janelaDoRelatorio,
  montarFeed,
  montarRelatorio,
  SILENCIO_DO_ESCRITORIO_MS,
  type FatosDoRelatorio,
} from "./lib/escritorio/relatorio";

// ═════════════════════════════════════════════════════════════════════════════
// O CENTRO DE COMANDO DO ESCRITÓRIO
//
// Três coisas precisam ser verdade:
//   · o relatório põe cada fato na gaveta certa, e só diz o que aconteceu;
//   · o silêncio do Escritório (a rodada automática parou) vira aviso;
//   · só o dono da plataforma enxerga — admin, decoradora e anônimo, não.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = Date.parse("2026-09-28T12:00:00Z");
const HORA = 60 * 60 * 1000;

const vazio = (over: Partial<FatosDoRelatorio> = {}): FatosDoRelatorio => ({
  desde: AGORA - 24 * HORA,
  agora: AGORA,
  negocio: { inadimplentes: 0, bloqueadas: 0, testeVencido: 0 },
  rodadas: [],
  ultimaRodada: {
    criadoEm: AGORA - HORA, disparadoPor: "sistema", analisadas: 10,
    mensagensPreparadas: 0, decisoesParaVoce: 0, duplicidadesApontadas: 0, resumo: "Tudo em dia.",
  },
  rascunhos: { porRevisar: 0, aprovadosSemEnvio: 0, decididos: [] },
  respostas: [],
  interessadosNovos: [],
  central: { pendentes: 0, decididas: [], expiradas: [] },
  ...over,
});

describe("o relatório põe cada fato na gaveta certa", () => {
  it("sem nada acontecendo, diz que está tudo em dia — e não inventa trabalho", () => {
    const r = montarRelatorio(vazio());
    expect(r.tudoEmDia).toBe(true);
    expect(r.realizado).toEqual([]);
    expect(montarFeed(vazio()).atividades).toEqual([]);
  });

  it("dinheiro e janela do canal são urgentes", () => {
    const r = montarRelatorio(vazio({
      negocio: { inadimplentes: 2, bloqueadas: 1, testeVencido: 0 },
      central: { pendentes: 1, decididas: [], expiradas: [] },
    }));
    expect(r.urgente.map((l) => l.texto).join(" ")).toMatch(/1 resposta da Central espera aprovação/);
    expect(r.urgente.map((l) => l.texto).join(" ")).toMatch(/2 assinaturas inadimplentes \(1 já bloqueada\)/);
    expect(r.tudoEmDia).toBe(false);
  });

  it("o Escritório calado por mais de um dia vira ATENÇÃO — é o cron que parou", () => {
    const parado = vazio({
      ultimaRodada: { ...vazio().ultimaRodada!, criadoEm: AGORA - SILENCIO_DO_ESCRITORIO_MS - 1 },
    });
    expect(montarRelatorio(parado).atencao[0].texto).toMatch(/não roda há mais de um dia/);
    expect(montarRelatorio(vazio({ ultimaRodada: null })).atencao[0].texto).toMatch(/nenhuma vez/);
  });

  it("interesse é oportunidade; dúvida de preço é 'aguardando você'", () => {
    const r = montarRelatorio(vazio({
      respostas: [
        { em: AGORA, leadNome: "Marina", intencao: "quero_participar", precisaDeHumano: false },
        { em: AGORA, leadNome: "Bia", intencao: "duvida_preco", precisaDeHumano: true },
      ],
      interessadosNovos: [{ em: AGORA, nome: "Carla" }],
    }));
    expect(r.oportunidades.map((l) => l.texto)).toEqual([
      "1 novo interessado: Carla.",
      "1 resposta de interesse: Marina.",
    ]);
    expect(r.aguardandoVoce.map((l) => l.texto)).toContain("1 resposta pede você: Bia.");
  });

  it("'acompanha N' é da rodada mais recente — somar rodadas contaria a mesma pessoa duas vezes", () => {
    const rodada = (analisadas: number, preparadas: number, por: "humano" | "sistema") => ({
      criadoEm: AGORA, disparadoPor: por, analisadas, mensagensPreparadas: preparadas,
      decisoesParaVoce: 0, duplicidadesApontadas: 0, resumo: "",
    });
    const r = montarRelatorio(vazio({ rodadas: [rodada(12, 2, "sistema"), rodada(12, 3, "humano")] }));
    expect(r.realizado[0].texto).toBe(
      "O Escritório rodou 2 vezes (1 sozinho): acompanha 12 interessados e preparou 5 mensagens.",
    );
  });

  it("lista longa de nomes é cortada e contada, nunca some no meio", () => {
    const r = montarRelatorio(vazio({
      interessadosNovos: ["A", "B", "C", "D", "E"].map((nome) => ({ em: AGORA, nome })),
    }));
    expect(r.oportunidades[0].texto).toBe("5 novos interessados: A, B, C e mais 2.");
  });

  it("o feed diz quem fez, em ordem de tempo, e avisa quando corta", () => {
    const f = vazio({
      rodadas: [{ ...vazio().ultimaRodada!, criadoEm: AGORA - 2 * HORA, resumo: "Preparou 2." }],
      interessadosNovos: [{ em: AGORA - HORA, nome: "Carla" }],
      rascunhos: {
        porRevisar: 0, aprovadosSemEnvio: 0,
        decididos: [{ em: AGORA, status: "enviado_manualmente", leadNome: "Marina" }],
      },
    });
    const { atividades } = montarFeed(f);
    expect(atividades.map((a) => [a.ator, a.texto])).toEqual([
      ["pessoa", "Mensagem para Marina marcada como enviada."],
      ["landing", "Novo interessado: Carla."],
      ["sistema", "Rodada automática: Preparou 2."],
    ]);
    expect(montarFeed(f, 2).cortado).toBe(true);
  });
});

describe("o período do relatório", () => {
  it("visita recente → 24h; visita de 3 dias → desde ela; mais de 7 dias → 7 dias", () => {
    expect(janelaDoRelatorio(AGORA - HORA, AGORA).base).toBe("ultimas_24h");
    expect(janelaDoRelatorio(undefined, AGORA).base).toBe("ultimas_24h");
    expect(janelaDoRelatorio(Number.NaN, AGORA).base).toBe("ultimas_24h");
    expect(janelaDoRelatorio(AGORA - 72 * HORA, AGORA)).toEqual({
      desde: AGORA - 72 * HORA, base: "ultima_visita",
    });
    expect(janelaDoRelatorio(AGORA - 30 * 24 * HORA, AGORA).base).toBe("ultimos_7_dias");
  });
});

// ── NO BANCO ────────────────────────────────────────────────────────────────

describe("centroDeComando no banco", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  async function cenario() {
    const t = convexTest(schema, modules);
    const dono = await autenticarComo(t, {
      nome: "Dono", email: "dono@altar.example", role: "admin", subject: "auth|dono",
    });
    const admin = await autenticarComo(t, {
      nome: "Suporte", email: "suporte@altar.example", role: "admin", subject: "auth|suporte",
    });
    const decoradora = await autenticarComo(t, {
      nome: "Decoradora", email: "decoradora@example.com", role: "user", subject: "auth|deco",
    });
    await t.run(async (ctx) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dono"))
        .unique();
      await ctx.db.patch(u!._id, { platformOwner: true });
      for (const [i, status] of (["respondeu", "confirmou", undefined, "convertido"] as const).entries()) {
        await ctx.db.insert("landingLeads", {
          name: `Pessoa ${i}`, email: `p${i}@exemplo.com.br`, intent: "demo",
          campanha: LIVE_ALTAR.slug, ...(status ? { status } : {}),
        });
      }
    });
    return { t, dono, admin, decoradora };
  }

  it("só o dono da plataforma enxerga — admin de suporte e decoradora, não", async () => {
    const { t, dono, admin, decoradora } = await cenario();
    await expect(dono.query(api.escritorio.centroDeComando, {})).resolves.toBeTruthy();
    await expect(admin.query(api.escritorio.centroDeComando, {})).rejects.toThrow();
    await expect(decoradora.query(api.escritorio.centroDeComando, {})).rejects.toThrow();
    await expect(t.query(api.escritorio.centroDeComando, {})).rejects.toThrow();
  });

  it("a rodada automática aparece no feed como sistema, e os novos interessados como landing", async () => {
    const { t, dono } = await cenario();
    await t.mutation(internal.escritorioCiclo.rodarPeloSistema, {});
    const c = await dono.query(api.escritorio.centroDeComando, {});
    const atores = new Set(c.feed.atividades.map((a) => a.ator));
    expect(atores.has("sistema")).toBe(true);
    expect(atores.has("landing")).toBe(true);
    expect(c.feed.atividades.find((a) => a.ator === "sistema")?.texto).toMatch(/^Rodada automática:/);
  });

  it("os cards de interessados somam o total — ninguém some entre os estágios", async () => {
    const { dono } = await cenario();
    const p = await dono.query(api.escritorio.panorama, {});
    const i = p.interessados;
    expect(i.novo + i.emAndamento + i.convertido + i.descartado).toBe(i.total);
    expect(i.emAndamento).toBe(2);
  });
});
