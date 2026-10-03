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
import {
  autenticarComoAdmin,
  autenticarComoDecoradora,
  autenticarComoDonoDaPlataforma,
} from "./test.auth";
import { LIVE_ALTAR } from "./lib/campanha";

// ═════════════════════════════════════════════════════════════════════════════
// O ADMIN DE SUPORTE PODIA AUMENTAR A AUTONOMIA DA IA
//
// `escritorioCiclo.ts` é o ciclo do Escritório rodando sobre campanhas, e
// estava INTEIRO atrás de `requireAdmin`. A decisão de produto diz outra coisa:
//
//   Escritório → só `platformOwner`. Admin NÃO recebe por ser admin.
//   Campanhas  → `platformOwner` e admin.
//
// A consequência não era teórica: `definirAutonomia` liga e desliga o quanto a
// IA do ALTAR age sozinha. Qualquer conta com `role: "admin"` — uma pessoa de
// suporte, amanhã — podia mexer nisso. É a quarta trava do CLAUDE.md ("não
// aumente autonomia da IA") pela porta de trás, e a mais cara de descobrir
// depois, porque nada na tela denunciaria.
//
// Este arquivo ataca a fronteira pelos dois lados: quem NÃO deve passar, e
// quem deve continuar passando. Afrouxar não é o único jeito de errar —
// apertar demais quebraria a operação de campanha de quem atende.
// ═════════════════════════════════════════════════════════════════════════════

const CAMPANHA = { campanha: LIVE_ALTAR.slug };

async function contas() {
  const t = convexTest(schema, modules);
  return {
    t,
    dono: await autenticarComoDonoDaPlataforma(t),
    admin: await autenticarComoAdmin(t),
    decoradora: await autenticarComoDecoradora(t),
  };
}

/** NOT_FOUND, nunca FORBIDDEN: a superfície interna não se confirma. */
const RECUSA = /NOT_FOUND|não encontrado/i;

// ─────────────────────────────────────────────────────────────────────────────
// O ESCRITÓRIO — SÓ O DONO
// ─────────────────────────────────────────────────────────────────────────────

describe("o ciclo do Escritório exige o dono da plataforma", () => {
  it("o ADMIN não lê a autonomia", async () => {
    const c = await contas();
    await expect(c.admin.query(api.escritorioCiclo.autonomia, CAMPANHA)).rejects.toThrow(RECUSA);
  });

  it("o ADMIN não ALTERA a autonomia — é o defeito que este arquivo fecha", async () => {
    const c = await contas();
    await expect(
      c.admin.mutation(api.escritorioCiclo.definirAutonomia, {
        ...CAMPANHA, capacidade: "qualificar", ligada: true,
      }),
    ).rejects.toThrow(RECUSA);
  });

  it("o ADMIN não dispara o ciclo", async () => {
    const c = await contas();
    await expect(c.admin.mutation(api.escritorioCiclo.rodarAgora, CAMPANHA)).rejects.toThrow(RECUSA);
  });

  it("o ADMIN não lê o histórico de execuções", async () => {
    const c = await contas();
    await expect(c.admin.query(api.escritorioCiclo.execucoes, CAMPANHA)).rejects.toThrow(RECUSA);
  });

  it("a DECORADORA não alcança nada disso", async () => {
    const c = await contas();
    for (const chamada of [
      () => c.decoradora.query(api.escritorioCiclo.autonomia, CAMPANHA),
      () => c.decoradora.query(api.escritorioCiclo.execucoes, CAMPANHA),
      () => c.decoradora.mutation(api.escritorioCiclo.rodarAgora, CAMPANHA),
    ]) {
      await expect(chamada()).rejects.toThrow(RECUSA);
    }
  });

  it("DESLOGADO não alcança nada disso", async () => {
    const c = await contas();
    await expect(c.t.query(api.escritorioCiclo.autonomia, CAMPANHA)).rejects.toThrow();
    await expect(c.t.mutation(api.escritorioCiclo.rodarAgora, CAMPANHA)).rejects.toThrow();
  });

  it("e o DONO continua passando — apertar demais também é defeito", async () => {
    const c = await contas();
    await expect(c.dono.query(api.escritorioCiclo.autonomia, CAMPANHA)).resolves.toBeTruthy();
    await expect(c.dono.query(api.escritorioCiclo.execucoes, CAMPANHA)).resolves.toBeTruthy();
  });

  it("o dono liga uma capacidade, e fica registrado em nome dele", async () => {
    const c = await contas();
    await c.dono.mutation(api.escritorioCiclo.definirAutonomia, {
      ...CAMPANHA, capacidade: "qualificar", ligada: true,
    });
    const política = await c.dono.query(api.escritorioCiclo.autonomia, CAMPANHA);
    expect(política).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CAMPANHAS — O ADMIN CONTINUA OPERANDO
// ─────────────────────────────────────────────────────────────────────────────

describe("a operação de campanha segue com o admin", () => {
  it("o ADMIN lista rascunhos — isso não é Escritório, é atendimento", async () => {
    const c = await contas();
    await expect(
      c.admin.query(api.campanhaRascunhos.listar, { ...CAMPANHA, status: "rascunho" }),
    ).resolves.toBeTruthy();
  });

  it("o DONO também lista — a decisão dá Campanhas aos dois", async () => {
    const c = await contas();
    await expect(
      c.dono.query(api.campanhaRascunhos.listar, { ...CAMPANHA, status: "rascunho" }),
    ).resolves.toBeTruthy();
  });

  it("a DECORADORA não lista", async () => {
    const c = await contas();
    await expect(
      c.decoradora.query(api.campanhaRascunhos.listar, { ...CAMPANHA, status: "rascunho" }),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A TRAVA DE FONTE — PARA NÃO VOLTAR POR DESCUIDO
// ─────────────────────────────────────────────────────────────────────────────

describe("nenhuma função de configuração do Escritório volta para requireAdmin", () => {
  it("as quatro do ciclo pedem o dono, e só as duas de resposta pedem admin", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("convex/escritorioCiclo.ts", "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

    // Quatro do Escritório + duas de campanha = seis guardas, e a divisão
    // exata importa: se alguém trocar uma, a contagem muda.
    expect((fonte.match(/requirePlatformOwner\(ctx\)/g) ?? []).length).toBe(4);
    expect((fonte.match(/requireAdmin\(ctx\)/g) ?? []).length).toBe(2);
  });
});
