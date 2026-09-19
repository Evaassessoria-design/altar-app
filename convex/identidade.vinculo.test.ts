import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => {
  const usuarioDaSessao = async (ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string; email?: string; name?: string } | null> };
  }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { _id: identity.subject, email: identity.email ?? "", name: identity.name ?? "Pessoa" };
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

// ═════════════════════════════════════════════════════════════════════════════
// QUEM É O DONO DESTA LINHA
//
// `syncAuthenticatedUser` liga a sessão do Better Auth à linha de `users` que
// carrega TODOS os dados da decoradora — eventos, financeiro, acervo, tudo
// pende de `userId`. Errar esse vínculo não vaza um campo: entrega a empresa
// inteira para a pessoa errada.
//
// O vínculo por e-mail existe para a MIGRAÇÃO, e só para ela: a linha antiga
// não tem `betterAuthId`. A verificação de e-mail está desligada nesta fase,
// então um endereço digitado não prova nada — e uma linha que já tem dono não
// pode ser adotada por cima.
// ═════════════════════════════════════════════════════════════════════════════

describe("vínculo da sessão com a conta", () => {
  it("adota a linha legada (sem betterAuthId) — é o caminho da migração", async () => {
    const t = convexTest(schema, modules);

    const legada = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Decoradora Antiga",
        email: "antiga@example.com",
        role: "user",
        subscriptionStatus: "active",
        tokenIdentifier: "hercules|antiga",
      }),
    );

    const sessao = t.withIdentity({
      subject: "auth|antiga",
      tokenIdentifier: "auth|antiga",
      email: "antiga@example.com",
    });
    await sessao.mutation(api.users.syncCurrentUser, {});

    const linha = await t.run(async (ctx) => ctx.db.get(legada));
    expect(linha?.betterAuthId).toBe("auth|antiga");

    // E nada foi duplicado: continua sendo a MESMA conta, com os mesmos dados.
    const todas = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(todas).toHaveLength(1);
  });

  it("NÃO adota a linha de quem já tem conta de login", async () => {
    // O ataque: cadastrar-se com o e-mail de outra pessoa e herdar a empresa
    // dela. Sem verificação de e-mail, digitar o endereço não prova nada.
    const t = convexTest(schema, modules);

    const vitima = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Decoradora",
        email: "vitima@example.com",
        role: "user",
        subscriptionStatus: "active",
        betterAuthId: "auth|vitima",
      }),
    );

    const invasor = t.withIdentity({
      subject: "auth|invasor",
      tokenIdentifier: "auth|invasor",
      email: "vitima@example.com",
    });
    await invasor.mutation(api.users.syncCurrentUser, {});

    const linhaDaVitima = await t.run(async (ctx) => ctx.db.get(vitima));
    expect(linhaDaVitima?.betterAuthId).toBe("auth|vitima");

    // O invasor fica com uma conta PRÓPRIA e vazia, nunca com a da vítima.
    const todas = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(todas).toHaveLength(2);
    const doInvasor = todas.find((u) => u.betterAuthId === "auth|invasor");
    expect(doInvasor).toBeDefined();
    expect(doInvasor?._id).not.toBe(vitima);
  });

  it("o invasor não enxerga nem um evento da conta alheia", async () => {
    const t = convexTest(schema, modules);

    const vitima = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Decoradora",
        email: "vitima@example.com",
        role: "user",
        subscriptionStatus: "active",
        betterAuthId: "auth|vitima",
      });
      await ctx.db.insert("events", {
        userId,
        name: "Casamento da cliente dela",
        type: "wedding",
        date: "2026-12-01",
        location: "Local",
        clientName: "Cliente",
        status: "planning",
      });
      return userId;
    });

    const invasor = t.withIdentity({
      subject: "auth|invasor",
      tokenIdentifier: "auth|invasor",
      email: "vitima@example.com",
    });
    await invasor.mutation(api.users.syncCurrentUser, {});

    const eventos = await invasor.query(api.events.list, {});
    expect(eventos).toEqual([]);

    // E a vítima continua com o dela.
    const dela = await t.run(async (ctx) =>
      ctx.db
        .query("events")
        .withIndex("by_user", (q) => q.eq("userId", vitima))
        .collect(),
    );
    expect(dela).toHaveLength(1);
  });

  it("entrar duas vezes não cria conta nova nem troca o vínculo", async () => {
    const t = convexTest(schema, modules);
    const sessao = t.withIdentity({
      subject: "auth|nova",
      tokenIdentifier: "auth|nova",
      email: "nova@example.com",
      name: "Decoradora Nova",
    });

    await sessao.mutation(api.users.syncCurrentUser, {});
    await sessao.mutation(api.users.syncCurrentUser, {});

    const todas = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(todas).toHaveLength(1);
    expect(todas[0].betterAuthId).toBe("auth|nova");
    // Primeiro cadastro de um banco vazio vira administrador — regra herdada.
    expect(todas[0].role).toBe("admin");
  });
});
