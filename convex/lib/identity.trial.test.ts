import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { modules } from "../test.setup";
import { resolveTrialForNewUser, TRIAL_DAYS } from "./identity";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — trial só uma vez por e-mail.
//
// O bug: `admin.deleteUser` apagava só a linha de `users` e deixava a conta de
// login viva. A pessoa entrava de novo, `syncAuthenticatedUser` não achava
// cadastro e criava um novo COM 14 DIAS DE TRIAL. Excluir usuário era, na
// prática, um botão de "renovar teste grátis", repetível à vontade.
//
// A correção tem duas metades: apagar a conta de login (lib/authAccount.ts) e
// registrar o e-mail em `deletedAccounts`. É a segunda que este teste cobre —
// ela é a rede de segurança que continua valendo mesmo se a remoção do login
// falhar.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-08-21T12:00:00.000Z");

describe("resolveTrialForNewUser — cadastro inédito", () => {
  it("dá trial de 14 dias para um e-mail nunca visto", async () => {
    const t = convexTest(schema, modules);
    const trial = await t.run((ctx) =>
      resolveTrialForNewUser(ctx, "nova@exemplo.com", NOW),
    );

    expect(trial.subscriptionStatus).toBe("trial");
    expect(trial.trialStartDate).toBe(NOW.toISOString());

    const dias =
      (Date.parse(trial.trialEndDate) - Date.parse(trial.trialStartDate)) / 86_400_000;
    expect(dias).toBe(TRIAL_DAYS);
  });

  it("dá trial normal quando não há e-mail nenhum", async () => {
    const t = convexTest(schema, modules);
    const trial = await t.run((ctx) => resolveTrialForNewUser(ctx, undefined, NOW));
    expect(trial.subscriptionStatus).toBe("trial");
  });
});

describe("resolveTrialForNewUser — e-mail já excluído pelo admin", () => {
  /** Registra uma exclusão anterior, como faz `admin.deleteUser`. */
  async function seedDeletion(
    t: ReturnType<typeof convexTest>,
    email: string,
    hadTrial = true,
  ) {
    await t.run(async (ctx) => {
      await ctx.db.insert("deletedAccounts", {
        email,
        deletedAt: "2026-08-01T00:00:00.000Z",
        hadTrial,
      });
    });
  }

  it("NÃO dá um segundo trial — a conta já nasce expirada", async () => {
    const t = convexTest(schema, modules);
    await seedDeletion(t, "voltou@exemplo.com");

    const trial = await t.run((ctx) =>
      resolveTrialForNewUser(ctx, "voltou@exemplo.com", NOW),
    );

    expect(trial.subscriptionStatus).toBe("expired");
    // Fim do trial = agora: cai no paywall já no primeiro acesso.
    expect(trial.trialEndDate).toBe(NOW.toISOString());
  });

  it("reconhece o e-mail independentemente de maiúsculas e espaços", async () => {
    const t = convexTest(schema, modules);
    await seedDeletion(t, "voltou@exemplo.com");

    for (const variante of [
      "VOLTOU@EXEMPLO.COM",
      "  voltou@exemplo.com  ",
      "Voltou@Exemplo.Com",
    ]) {
      const trial = await t.run((ctx) => resolveTrialForNewUser(ctx, variante, NOW));
      expect(trial.subscriptionStatus, `variante ${variante}`).toBe("expired");
    }
  });

  it("não afeta outro e-mail", async () => {
    const t = convexTest(schema, modules);
    await seedDeletion(t, "voltou@exemplo.com");

    const trial = await t.run((ctx) =>
      resolveTrialForNewUser(ctx, "outra.pessoa@exemplo.com", NOW),
    );
    expect(trial.subscriptionStatus).toBe("trial");
  });

  it("um registro com hadTrial=false volta a permitir trial", async () => {
    // Válvula de escape para o futuro: devolver o teste a alguém excluído por
    // engano é editar um campo, não apagar a trava inteira.
    const t = convexTest(schema, modules);
    await seedDeletion(t, "perdoado@exemplo.com", false);

    const trial = await t.run((ctx) =>
      resolveTrialForNewUser(ctx, "perdoado@exemplo.com", NOW),
    );
    expect(trial.subscriptionStatus).toBe("trial");
  });
});
