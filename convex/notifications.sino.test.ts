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
import type { MutationCtx } from "./_generated/server";
import { dataEmDias } from "./lib/dataDoDia";

// ═════════════════════════════════════════════════════════════════════════════
// O SINO QUANDO A CONTA ACABOU DE NASCER
//
// A varredura que enche o sino roda UMA vez por dia, às 8h UTC (`crons.ts`).
// Quem cria a conta às 10h e cadastra o casamento de sábado abria o sino e via
// vazio — e concluía que o ALTAR não avisa nada. `generateMyAlerts` existia
// exatamente para esse caso e não tinha quem a chamasse; agora o próprio sino
// a chama na primeira abertura.
//
// Chamar na abertura significa chamar MUITAS vezes. O que estes testes
// protegem:
//
//  · abrir o sino duas vezes não duplica aviso nenhum;
//  · a conta só vê evento dela — o da concorrente não gera nada aqui;
//  · evento cancelado ou já concluído não cobra preparo de ninguém;
//  · evento fora da janela de sete dias não vira aviso antes da hora.
// ═════════════════════════════════════════════════════════════════════════════

const DAQUI_A_TRES = dataEmDias(3, new Date());
const DAQUI_A_TRINTA = dataEmDias(30, new Date());

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Dona", email: "dona@ex.com", role: "user" });
  const outra = await autenticarComo(t, { nome: "Outra", email: "outra@ex.com", role: "user" });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const pessoa = async (email: string) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", `auth|${email}`))
        .unique();
      if (!u) throw new Error(`conta ${email} não criada`);
      return u._id;
    };
    const donaId = await pessoa("dona@ex.com");
    const outraId = await pessoa("outra@ex.com");

    const evento = async (
      userId: typeof donaId,
      name: string,
      date: string,
      status: string,
    ) =>
      await ctx.db.insert("events", {
        userId, name, type: "wedding", date,
        location: "Fazenda", clientName: "Cliente", status: status as never,
      });

    return {
      donaId,
      proximo: await evento(donaId, "TESTE Sábado", DAQUI_A_TRES, "confirmed"),
      cancelado: await evento(donaId, "TESTE Caiu", DAQUI_A_TRES, "cancelled"),
      concluido: await evento(donaId, "TESTE Já aconteceu", DAQUI_A_TRES, "completed"),
      distante: await evento(donaId, "TESTE Mês que vem", DAQUI_A_TRINTA, "confirmed"),
      daOutra: await evento(outraId, "Evento alheio", DAQUI_A_TRES, "confirmed"),
    };
  });

  return { t, dona, outra, ...ids };
}

async function avisos(t: ReturnType<typeof convexTest>, userId: string) {
  // Filtra em JS de propósito: dentro de `t.run` o `ctx` do convex-test não
  // carrega a tipagem dos índices da tabela (mesma razão de
  // notifications.trial.test.ts). O volume é de teste.
  const todas = await t.run(async (ctx) => ctx.db.query("notifications").collect());
  return todas.filter((n) => n.userId === userId);
}

describe("generateMyAlerts — o sino na primeira abertura", () => {
  it("avisa do evento desta semana e de mais nada", async () => {
    const { t, dona, donaId, proximo } = await cenario();
    await dona.mutation(api.notifications.generateMyAlerts, {});

    const meus = await avisos(t, donaId);
    expect(meus.map((n) => n.type)).toEqual(["event_soon"]);
    expect(meus[0].relatedEventId).toBe(proximo);
    expect(meus[0].isRead).toBe(false);
  });

  it("abrir o sino de novo não duplica aviso", async () => {
    const { t, dona, donaId } = await cenario();
    await dona.mutation(api.notifications.generateMyAlerts, {});
    await dona.mutation(api.notifications.generateMyAlerts, {});
    await dona.mutation(api.notifications.generateMyAlerts, {});

    expect(await avisos(t, donaId)).toHaveLength(1);
  });

  it("não gera nada para a conta da concorrente, nem com evento na mesma data", async () => {
    const { t, dona, outra, daOutra } = await cenario();
    await dona.mutation(api.notifications.generateMyAlerts, {});

    const todas = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(todas.some((n) => n.relatedEventId === daOutra)).toBe(false);

    // E quando a OUTRA abre o sino dela, aí sim — e só o dela.
    await outra.mutation(api.notifications.generateMyAlerts, {});
    const depois = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(depois.filter((n) => n.relatedEventId === daOutra)).toHaveLength(1);
  });

  it("cancelado, concluído e distante ficam de fora", async () => {
    const { t, dona, donaId, cancelado, concluido, distante } = await cenario();
    await dona.mutation(api.notifications.generateMyAlerts, {});

    const meus = await avisos(t, donaId);
    const alvos = meus.map((n) => n.relatedEventId);
    expect(alvos).not.toContain(cancelado);
    expect(alvos).not.toContain(concluido);
    expect(alvos).not.toContain(distante);
  });

  it("sem sessão não escreve nada", async () => {
    const { t } = await cenario();
    await expect(t.mutation(api.notifications.generateMyAlerts, {})).rejects.toThrow();
    const todas = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(todas).toHaveLength(0);
  });
});
