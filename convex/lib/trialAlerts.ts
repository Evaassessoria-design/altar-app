import { isBillingExempt } from "./access";
import type { Doc } from "../_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// QUEM MERECE UM AVISO DE FIM DE TRIAL
//
// O aviso de trial existia DUPLICADO em `convex/notifications.ts`: uma vez em
// `generateMyAlerts` (disparado pelo próprio usuário) e outra em
// `generateDailyAlerts` (cron das 8h UTC). As duas cópias decidiam sozinhas,
// olhando só `subscriptionStatus === "trial"`.
//
// Consequência: uma conta ISENTA DE COBRANÇA continuava recebendo "Trial
// expirando em breve" e "Assine agora para continuar" todo dia — cobrança de
// uma assinatura que ela nunca vai precisar fazer.
//
// A decisão passa a ser esta função, única e pura. Ela não inventa regra nova:
// pergunta ao modelo de acesso (`lib/access.ts`) se a conta é cobrável.
//
// ── O QUE `isBillingExempt` COBRE (de propósito) ────────────────────────────
//   · internal          → equipe. Nunca paga, nunca expira. Sem aviso.
//   · admin do ALTAR    → quem opera o produto. Sem aviso.
//   · beta AINDA VIGENTE→ cortesia com prazo em aberto. Sem aviso: pedir
//                         assinatura a quem está em cortesia é contraditório.
//   · beta VENCIDO      → NÃO é isento. Volta a ser tratado como client e
//                         VOLTA a receber o aviso — que é justamente quando
//                         ele passa a fazer sentido.
//   · client            → recebe normalmente, como sempre recebeu.
//
// Nada aqui olha e-mail, nome ou id. A regra é o tipo de acesso.
// ─────────────────────────────────────────────────────────────────────────────

/** Antecedência do aviso, em dias. Mesmo valor que as duas cópias usavam. */
export const TRIAL_ALERT_WINDOW_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

type TrialAlertInput = Pick<
  Doc<"users">,
  "subscriptionStatus" | "accessType" | "accessExpiresAt" | "overdueSince"
> &
  Partial<Pick<Doc<"users">, "trialEndDate" | "role">>;

/**
 * Quantos dias faltam para o fim do trial, SE for o caso de avisar.
 *
 * @returns número de dias (0 = vence hoje) ou `null` quando não se deve avisar.
 */
export function trialAlertDaysLeft(
  user: TrialAlertInput,
  now: number = Date.now(),
): number | null {
  // Conta que não paga não recebe aviso de pagamento. Esta é a correção.
  if (isBillingExempt(user, now)) return null;

  if (user.subscriptionStatus !== "trial" || !user.trialEndDate) return null;

  const daysLeft = Math.ceil((Date.parse(user.trialEndDate) - now) / DAY_MS);
  // Fora da janela: cedo demais, ou o trial já venceu há mais de um dia.
  if (daysLeft > TRIAL_ALERT_WINDOW_DAYS || daysLeft < 0) return null;

  return daysLeft;
}

/** Texto do aviso — idêntico ao que as duas cópias produziam. */
export function trialAlertBody(daysLeft: number): string {
  return daysLeft <= 0
    ? "Seu período de teste expirou. Assine agora para continuar usando o Altar."
    : `Seu período de teste termina em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}. Assine para não perder acesso.`;
}
