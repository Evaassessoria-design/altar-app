import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as admin from "./admin";
import * as users from "./users";

// Trava de regressão: o Painel Admin não pode voltar a ter uma ação que grave
// `subscriptionStatus`. Esse estado é do Asaas (webhook → internalMutations).
// Se alguém reintroduzir uma dessas mutations, este teste quebra e explica por quê.

/** Mutations públicas que gravavam estado de cobrança e foram removidas. */
const REMOVED = {
  admin: ["updateUserSubscription"],
  users: ["activateSubscription"],
} as const;

describe("nenhuma ação administrativa escreve estado de cobrança", () => {
  it.each(REMOVED.admin)("convex/admin.ts não exporta %s", (name) => {
    expect(Object.keys(admin)).not.toContain(name);
  });

  it.each(REMOVED.users)("convex/users.ts não exporta %s", (name) => {
    expect(Object.keys(users)).not.toContain(name);
  });

  it("as mutations que o webhook usa continuam existindo", () => {
    // O outro lado da trava: remover a ação insegura não pode ter derrubado o
    // caminho legítimo de cobrança.
    for (const fn of [
      "activateSubscriptionByCustomer",
      "markSubscriptionOverdue",
      "cancelSubscriptionByCustomer",
      "cancelSubscriptionBySubscriptionId",
      // Adicionada com a correção do webhook: casa por assinatura e cai no
      // cliente. É a que o receptor chama hoje.
      "cancelSubscriptionByAsaasRef",
    ]) {
      expect(Object.keys(users)).toContain(fn);
    }
  });

  it("o painel mantém as ações de acesso e de usuário", () => {
    for (const fn of ["listUsers", "getStats", "isAdmin", "setUserAccess", "updateUserRole", "deleteUser"]) {
      expect(Object.keys(admin)).toContain(fn);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — exclusão de usuário completa.
//
// `admin.deleteUser` depende de requireAdmin (sessão Better Auth), fora do
// alcance do convex-test. A cascata em si é testada de verdade em
// lib/cascade.test.ts; aqui travamos a FIAÇÃO: que a mutation continue chamando
// a cascata, registrando o e-mail contra novo trial e removendo o login.
// ─────────────────────────────────────────────────────────────────────────────

const adminSource = readFileSync(join(__dirname, "admin.ts"), "utf8");

function deleteUserBlock(): string {
  const start = adminSource.indexOf("export const deleteUser");
  expect(start, "deleteUser sumiu de convex/admin.ts").toBeGreaterThan(-1);
  const next = adminSource.indexOf("export const", start + 1);
  return adminSource.slice(start, next === -1 ? undefined : next);
}

describe("deleteUser apaga tudo, não só a linha do usuário", () => {
  const block = deleteUserBlock();

  it("chama a cascata de dados", () => {
    expect(block).toContain("deleteUserDataCascade");
  });

  it("registra o e-mail em deletedAccounts (trava do segundo trial)", () => {
    expect(block).toContain("deletedAccounts");
    expect(block).toContain("hadTrial: true");
  });

  it("remove a conta de login no Better Auth", () => {
    expect(block).toContain("deleteBetterAuthAccount");
  });

  it("registra o e-mail ANTES de remover o login e a linha do usuário", () => {
    // Se algo falhar no meio, o pior caso precisa ser "conta travada que ainda
    // consegue entrar" — nunca "trial renovado".
    const registro = block.indexOf("deletedAccounts");
    const login = block.indexOf("deleteBetterAuthAccount");
    const linha = block.lastIndexOf("ctx.db.delete(args.userId)");
    expect(registro).toBeLessThan(login);
    expect(login).toBeLessThan(linha);
  });

  it("continua impedindo o admin de excluir a si mesmo", () => {
    expect(block).toContain("Não é possível excluir sua própria conta");
  });
});

describe("ferramentas internas de acesso da fundadora", () => {
  it("existem e são internas (não alcançáveis pelo app)", () => {
    for (const fn of ["grantInternalAccessByEmail", "inspectAccountByEmail"]) {
      expect(Object.keys(admin)).toContain(fn);
    }
    // `internalMutation`/`internalQuery` — nunca `mutation`/`query` públicas.
    const grant = adminSource.slice(adminSource.indexOf("export const grantInternalAccessByEmail"));
    expect(grant.slice(0, 120)).toContain("internalMutation");
  });

  it("a promoção por e-mail não toca em estado de cobrança", () => {
    const start = adminSource.indexOf("export const grantInternalAccessByEmail");
    const block = adminSource.slice(start, adminSource.indexOf("export const", start + 1));
    // Liberar acesso é accessType; escrever "active" seria forjar assinatura.
    expect(block).not.toMatch(/subscriptionStatus:\s*"/);
    expect(block).toContain('accessType: "internal"');
    expect(block).toContain('role: "admin"');
  });
});
