import { describe, expect, it } from "vitest";
import { TRIAL_ALERT_WINDOW_DAYS, trialAlertBody, trialAlertDaysLeft } from "./trialAlerts";

// A regra que decide quem recebe "Trial expirando em breve" no sino.
// Testes puros: `now` é parâmetro, então não dependem do relógio.

const NOW = Date.parse("2026-09-01T12:00:00Z");
const DAY = 86_400_000;

/** Data de fim de trial a N dias de NOW (negativo = já passou). */
const emDias = (n: number) => new Date(NOW + n * DAY).toISOString();

describe("contas isentas de cobrança NÃO recebem aviso de trial", () => {
  // O bug relatado: conta interna recebia todo dia "Seu período de teste
  // expirou. Assine agora" — cobrança de assinatura que ela nunca fará.
  it("internal não recebe, mesmo com trial vencendo hoje", () => {
    expect(
      trialAlertDaysLeft(
        { subscriptionStatus: "trial", trialEndDate: emDias(0), accessType: "internal" },
        NOW,
      ),
    ).toBeNull();
  });

  it("internal não recebe em nenhum dia da janela", () => {
    for (let d = 0; d <= TRIAL_ALERT_WINDOW_DAYS; d++) {
      expect(
        trialAlertDaysLeft(
          { subscriptionStatus: "trial", trialEndDate: emDias(d), accessType: "internal" },
          NOW,
        ),
      ).toBeNull();
    }
  });

  it("admin do ALTAR não recebe", () => {
    expect(
      trialAlertDaysLeft(
        { role: "admin", subscriptionStatus: "trial", trialEndDate: emDias(1) },
        NOW,
      ),
    ).toBeNull();
  });

  it("beta AINDA VIGENTE não recebe — pedir assinatura a quem está em cortesia é contraditório", () => {
    expect(
      trialAlertDaysLeft(
        {
          subscriptionStatus: "trial",
          trialEndDate: emDias(2),
          accessType: "beta",
          accessExpiresAt: NOW + 30 * DAY,
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("beta VENCIDO VOLTA a receber — é exatamente quando o aviso passa a valer", () => {
    // Contraprova do teste acima: a isenção do beta tem prazo, e o aviso
    // reaparece sozinho quando ele acaba. Nada foi alterado no beta.
    expect(
      trialAlertDaysLeft(
        {
          subscriptionStatus: "trial",
          trialEndDate: emDias(2),
          accessType: "beta",
          accessExpiresAt: NOW - DAY,
        },
        NOW,
      ),
    ).toBe(2);
  });
});

describe("cliente comum continua recebendo exatamente como antes", () => {
  it.each([0, 1, 2, 3])("avisa a %i dia(s) do fim", (d) => {
    expect(
      trialAlertDaysLeft({ subscriptionStatus: "trial", trialEndDate: emDias(d) }, NOW),
    ).toBe(d);
  });

  it("não avisa cedo demais (fora da janela de 3 dias)", () => {
    expect(
      trialAlertDaysLeft({ subscriptionStatus: "trial", trialEndDate: emDias(7) }, NOW),
    ).toBeNull();
  });

  it("não avisa depois que o trial já passou", () => {
    expect(
      trialAlertDaysLeft({ subscriptionStatus: "trial", trialEndDate: emDias(-2) }, NOW),
    ).toBeNull();
  });

  it("assinante ativo não recebe aviso de trial", () => {
    expect(
      trialAlertDaysLeft({ subscriptionStatus: "active", trialEndDate: emDias(1) }, NOW),
    ).toBeNull();
  });

  it("sem data de fim não há o que avisar", () => {
    expect(trialAlertDaysLeft({ subscriptionStatus: "trial" }, NOW)).toBeNull();
  });

  it("accessType ausente é tratado como client", () => {
    expect(
      trialAlertDaysLeft({ subscriptionStatus: "trial", trialEndDate: emDias(1) }, NOW),
    ).toBe(1);
  });

  it("o texto do aviso não mudou", () => {
    expect(trialAlertBody(0)).toBe(
      "Seu período de teste expirou. Assine agora para continuar usando o Altar.",
    );
    expect(trialAlertBody(1)).toBe(
      "Seu período de teste termina em 1 dia. Assine para não perder acesso.",
    );
    expect(trialAlertBody(3)).toBe(
      "Seu período de teste termina em 3 dias. Assine para não perder acesso.",
    );
  });
});
