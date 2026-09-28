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
import { autenticarComoAdmin, autenticarComoDecoradora } from "./test.auth";
import { LIVE_ALTAR } from "./lib/campanha";
import {
  PESO_DO_ESTAGIO,
  PESOS,
  prioridadeDoInteressado,
} from "./lib/prioridadeDoInteressado";

// ═════════════════════════════════════════════════════════════════════════════
// PRIORIDADE DO INTERESSADO — a nota que se explica
//
// O que precisa ser verdade para o número não virar o "87" que ninguém usa:
// cada ponto tem motivo, ausência não pontua nem desconta, e quem saiu do
// funil não recebe nota — recebe desfecho.
// ═════════════════════════════════════════════════════════════════════════════

const HOJE = "2026-09-28";

describe("a nota e os seus motivos", () => {
  it("o exemplo da missão: pediu demo, quer participar, telefone, empresa — alto interesse", () => {
    const p = prioridadeDoInteressado(
      {
        origem: "landing", intent: "demo", status: "respondeu",
        whatsappE164: "+5511999990001", empresa: "Ateliê Flor",
        ultimaIntencao: "quero_participar", ultimaInteracao: "2026-09-27",
      },
      HOJE,
    );
    expect(p.temperatura).toBe("quente");
    expect(p.pontos).toBe(
      PESOS.procurouOAltar + PESOS.pediuDemonstracao + PESO_DO_ESTAGIO.respondeu! +
      PESOS.respostaDeInteresse + PESOS.whatsapp + PESOS.empresa,
    );
    // Todo ponto tem motivo, e os motivos somam a nota.
    expect(p.fatores.reduce((s, f) => s + f.pontos, 0)).toBe(p.pontos);
    expect(p.fatores.map((f) => f.texto)).toContain("Respondeu com interesse");
  });

  it("contato antigo desconta, e o motivo diz há quantos dias", () => {
    const p = prioridadeDoInteressado(
      { origem: "landing", intent: "demo", ultimaInteracao: "2026-08-01" },
      HOJE,
    );
    expect(p.fatores).toContainEqual({ texto: "Sem contato há 58 dias", pontos: PESOS.paradoUmMes });
  });

  it("não saber não é defeito: campo ausente não pontua nem desconta", () => {
    const p = prioridadeDoInteressado({ origem: "prospeccao" }, HOJE);
    expect(p.pontos).toBe(0);
    expect(p.fatores).toEqual([]);
    expect(p.temperatura).toBe("fria");
  });

  it("data de interação ilegível não vira 'parado'", () => {
    const p = prioridadeDoInteressado({ ultimaInteracao: "ontem" }, HOJE);
    expect(p.fatores.some((f) => f.texto.startsWith("Sem contato"))).toBe(false);
  });

  it("cliente e perdido saem do funil: nota zero, e o motivo é o desfecho", () => {
    for (const status of ["convertido", "descartado"]) {
      const p = prioridadeDoInteressado(
        { status, intent: "demo", whatsappE164: "+5511999990001" },
        HOJE,
      );
      expect(p).toMatchObject({ pontos: 0, temperatura: "fora" });
    }
  });

  it("a nota fica entre 0 e 100, por mais sinais que se somem", () => {
    const p = prioridadeDoInteressado(
      {
        origem: "indicacao", intent: "demo", status: "testando",
        whatsappE164: "+5511999990001", empresa: "X", eventosPorAno: 200,
        ultimaIntencao: "confirmacao",
      },
      HOJE,
    );
    expect(p.pontos).toBe(100);
  });

  it("os pesos estão fixados — mudar a fórmula tem de ser uma decisão, não um acidente", () => {
    expect(PESOS).toMatchInlineSnapshot(`
      {
        "empresa": 5,
        "paradoDuasSemanas": -10,
        "paradoUmMes": -20,
        "pediuBeta": 5,
        "pediuDemonstracao": 10,
        "porteGrande": 10,
        "procurouOAltar": 25,
        "respostaComDuvida": 10,
        "respostaDeInteresse": 20,
        "whatsapp": 10,
      }
    `);
  });
});

describe("a lista da campanha", () => {
  async function cenario() {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const decoradora = await autenticarComoDecoradora(t);
    await t.run(async (ctx) => {
      // Inserida PRIMEIRO: na ordem de sempre (mais recentes) ela vem por último.
      await ctx.db.insert("landingLeads", {
        name: "Quente", email: "q@exemplo.com.br", intent: "demo", campanha: LIVE_ALTAR.slug,
        whatsappE164: "+5511999990001", empresa: "Ateliê", status: "interessado",
      });
      await ctx.db.insert("landingLeads", {
        name: "Fria", email: "f@exemplo.com.br", intent: "demo", campanha: LIVE_ALTAR.slug,
        origem: "prospeccao",
      });
    });
    return { admin, decoradora };
  }

  it("cada pessoa vem com nota explicada e próxima ação", async () => {
    const { admin } = await cenario();
    const r = await admin.query(api.admin.listLandingLeads, { campanha: LIVE_ALTAR.slug });
    for (const p of r.leads) {
      expect(p.prioridade.fatores.reduce((s, f) => s + f.pontos, 0)).toBe(p.prioridade.pontos);
      expect(p.proximaAcao.acao.length).toBeGreaterThan(0);
    }
  });

  it("'prioridade' ordena pela nota; sem pedir, a ordem de sempre não muda", async () => {
    const { admin } = await cenario();
    const recentes = await admin.query(api.admin.listLandingLeads, { campanha: LIVE_ALTAR.slug });
    expect(recentes.leads.map((l) => l.name)).toEqual(["Fria", "Quente"]);
    const porNota = await admin.query(api.admin.listLandingLeads, {
      campanha: LIVE_ALTAR.slug, ordem: "prioridade",
    });
    expect(porNota.leads.map((l) => l.name)).toEqual(["Quente", "Fria"]);
  });

  it("a decoradora não lê a lista do negócio ALTAR", async () => {
    const { decoradora } = await cenario();
    await expect(
      decoradora.query(api.admin.listLandingLeads, { campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
  });
});
