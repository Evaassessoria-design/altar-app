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

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import { autenticarComoDonoDaPlataforma } from "./test.auth";
import type { MutationCtx } from "./_generated/server";
import { LIVE_ALTAR, type Campanha } from "./lib/campanha";
import {
  campanhasDaRodadaAutomatica,
  DIAS_DE_ROTINA_APOS_A_CAMPANHA,
} from "./lib/escritorio/rodadaAutomatica";

// ═════════════════════════════════════════════════════════════════════════════
// O ESCRITÓRIO RODANDO SOZINHO
//
// O que precisa ser verdade para que "trabalha enquanto você não olha" não
// vire "faz coisas que ninguém pediu": o sistema roda o MESMO ciclo do botão,
// obedece a MESMA política, não duplica, não envia, e fica registrado como
// sistema — nunca em nome de alguém.
// ═════════════════════════════════════════════════════════════════════════════

describe("quais campanhas o sistema roda", () => {
  const c = (data: string): Campanha => ({ ...LIVE_ALTAR, slug: data, data });

  it("roda antes da campanha e até o fim do prazo de follow-up — não depois", () => {
    const hoje = "2026-10-20";
    const escolhidas = campanhasDaRodadaAutomatica(
      [c("2026-10-25"), c("2026-10-06"), c("2026-10-05")],
      hoje,
    ).map((x) => x.data);
    expect(DIAS_DE_ROTINA_APOS_A_CAMPANHA).toBe(14);
    expect(escolhidas).toEqual(["2026-10-25", "2026-10-06"]);
  });
});

describe("a rodada do sistema no banco", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T10:30:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  async function cenario() {
    const t = convexTest(schema, modules);
    // O ciclo do Escritório passou a exigir `platformOwner`. Esta sessão é
  // do dono — que também é admin, então as chamadas de campanha no mesmo
  // teste continuam legítimas (a decisão dá Campanhas ao dono E ao admin).
  const admin = await autenticarComoDonoDaPlataforma(t);
    for (let n = 1; n <= 3; n++) {
      await t.run(async (ctx: MutationCtx) =>
        ctx.db.insert("landingLeads", {
          name: `Marina Alves ${n}`,
          email: `m${n}@exemplo.com.br`,
          whatsapp: `(11) 99990-000${n}`,
          whatsappE164: `+55119999000${n}`,
          intent: "demo" as const,
          campanha: LIVE_ALTAR.slug,
        }),
      );
    }
    const rodarSistema = () => t.mutation(internal.escritorioCiclo.rodarPeloSistema, {});
    const execucoes = () => t.run((ctx) => ctx.db.query("escritorioExecucoes").collect());
    const rascunhos = () => t.run((ctx) => ctx.db.query("campaignDrafts").collect());
    return { t, admin, rodarSistema, execucoes, rascunhos };
  }

  it("prepara rascunhos e registra a rodada como SISTEMA, sem pessoa atribuída", async () => {
    const { rodarSistema, execucoes, rascunhos } = await cenario();
    const r = await rodarSistema();
    expect(r.campanhas).toEqual([LIVE_ALTAR.slug]);

    const [rodada] = await execucoes();
    expect(rodada).toMatchObject({ disparadoPor: "sistema", chamadasDeIa: 0 });
    expect(rodada.disparadoPorUserId).toBeUndefined();
    expect((await rascunhos()).length).toBeGreaterThan(0);
    expect((await rascunhos()).every((d) => d.status === "rascunho")).toBe(true);
  });

  it("rodar de novo não duplica nada — nem se o botão rodar entre as duas", async () => {
    const { admin, rodarSistema, rascunhos } = await cenario();
    await rodarSistema();
    const antes = (await rascunhos()).length;
    await admin.mutation(api.escritorioCiclo.rodarAgora, { campanha: LIVE_ALTAR.slug });
    await rodarSistema();
    expect((await rascunhos()).length).toBe(antes);
  });

  it("capacidade desligada pelo dono continua desligada para o sistema", async () => {
    const { admin, rodarSistema, rascunhos } = await cenario();
    await admin.mutation(api.escritorioCiclo.definirAutonomia, {
      campanha: LIVE_ALTAR.slug, capacidade: "preparar_primeiro_contato", ligada: false,
    });
    await rodarSistema();
    expect(await rascunhos()).toEqual([]);
  });

  it("nada sai: nenhuma aprovação, nenhum item de saída, nenhum estágio mudado", async () => {
    const { t, rodarSistema } = await cenario();
    await rodarSistema();
    const [aprovacoes, leads] = await t.run(async (ctx) => [
      await ctx.db.query("adminApprovals").collect(),
      await ctx.db.query("landingLeads").collect(),
    ] as const);
    expect(aprovacoes).toEqual([]);
    expect(leads.every((l) => l.status === undefined)).toBe(true);
  });

  it("não é alcançável pelo navegador", () => {
    // `internalMutation` não é registrada como pública. (O objeto `api` gerado
    // é um Proxy que responde a qualquer nome — por isso a prova é a fonte.)
    const fonte = readFileSync("convex/escritorioCiclo.ts", "utf-8");
    expect(fonte).toMatch(/export const rodarPeloSistema = internalMutation\(/);
  });

  it("o agendamento existe, mas DESLIGADO neste release (decisão de 06/10/2026)", async () => {
    // A rodada automática gravaria rascunhos em PROD todo dia, com a política
    // ainda não configurada. O ciclo manual continua.
    const { RODADA_AUTOMATICA_LIGADA } = await import("./lib/escritorio/rodadaAutomatica");
    expect(RODADA_AUTOMATICA_LIGADA).toBe(false);
    const crons = (await import("./crons")).default as unknown as { crons: Record<string, unknown> };
    expect(Object.keys(crons.crons)).not.toContain("escritorio roda sozinho");
    // os outros agendamentos continuam — desligar este não pode levar junto o resto
    expect(Object.keys(crons.crons)).toContain("varredura da central de comunicacoes");
    // e só por essa chave — não apagado nem esquecido
    expect(readFileSync("convex/crons.ts", "utf-8")).toMatch(
      /if \(RODADA_AUTOMATICA_LIGADA\) \{\s*crons\.daily\(\s*"escritorio roda sozinho"/,
    );
  });

  it("o botão manual continua exigindo dono da plataforma", () => {
    const ciclo = readFileSync("convex/escritorioCiclo.ts", "utf-8");
    const i = ciclo.indexOf("export const rodarAgora");
    expect(ciclo.slice(i, ciclo.indexOf("\n});", i))).toContain("requirePlatformOwner");
  });
});
