import type { Doc } from "../_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// FONTE ÚNICA da regra de acesso do ALTAR.
//
// Separa dois conceitos que antes viviam misturados:
//   · `accessType`        → QUE TIPO de conta é (client / beta / internal)
//   · `subscriptionStatus`→ ESTADO DE COBRANÇA (trial / active / overdue / …)
//
// `accessType` ausente significa "client" — é o caso de todos os usuários que
// já existem. Nenhuma migração, nenhum backfill, nenhuma mudança de
// comportamento para quem já usa o app.
//
// A decisão de bloquear passa a nascer aqui, no backend. O frontend apenas lê
// `blocked`, em vez de manter a própria lista de status proibidos.
// ─────────────────────────────────────────────────────────────────────────────

export type AccessType = "client" | "beta" | "internal";

export type AccessDecision = {
  /** Tipo efetivo. `beta` expirado é reportado como `beta` (com `betaExpired`). */
  type: AccessType;
  /** Se true, a navegação do app deve mandar para o paywall. */
  blocked: boolean;
  /** Motivo do bloqueio — só preenchido quando `blocked`. */
  reason?: "trial_expired" | "subscription_cancelled";
  /** Conta com cobrança dispensada (internal, ou beta ainda vigente). */
  billingExempt: boolean;
  /** `beta` cuja data de acesso já passou — voltou a valer a regra de client. */
  betaExpired: boolean;
};

/** Estados de cobrança que barram um `client`. `overdue` NÃO barra (tolerância). */
const BLOCKING_STATUSES: Record<string, AccessDecision["reason"]> = {
  expired: "trial_expired",
  cancelled: "subscription_cancelled",
};

type AccessInput = Pick<
  Doc<"users">,
  "subscriptionStatus" | "accessType" | "accessExpiresAt"
>;

/**
 * Resolve o acesso a partir do usuário.
 *
 * @param subscriptionStatus já deve vir com a expiração de trial aplicada
 *        (é o que `users.getSubscriptionStatus` calcula na leitura).
 * @param now epoch ms — parâmetro para manter a função pura e testável.
 */
export function resolveAccess(user: AccessInput, now: number = Date.now()): AccessDecision {
  const type: AccessType = user.accessType ?? "client";

  // Interno: acesso permanente, sem cobrança. Nada mais é avaliado.
  if (type === "internal") {
    return { type, blocked: false, billingExempt: true, betaExpired: false };
  }

  // Beta: liberado enquanto a data não passar. Sem data = beta sem prazo.
  if (type === "beta") {
    const expired = user.accessExpiresAt !== undefined && user.accessExpiresAt <= now;
    if (!expired) {
      return { type, blocked: false, billingExempt: true, betaExpired: false };
    }
    // Beta vencido cai exatamente na regra de client, sem exceção.
    const reason = BLOCKING_STATUSES[user.subscriptionStatus];
    return {
      type,
      blocked: reason !== undefined,
      reason,
      billingExempt: false,
      betaExpired: true,
    };
  }

  // Client: comportamento atual, preservado byte a byte.
  const reason = BLOCKING_STATUSES[user.subscriptionStatus];
  return {
    type: "client",
    blocked: reason !== undefined,
    reason,
    billingExempt: false,
    betaExpired: false,
  };
}

/** Atalho para as métricas e para a guarda do checkout. */
export function isBillingExempt(user: AccessInput, now: number = Date.now()): boolean {
  return resolveAccess(user, now).billingExempt;
}
