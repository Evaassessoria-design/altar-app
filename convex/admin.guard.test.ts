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
