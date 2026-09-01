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
  reason?: "trial_expired" | "subscription_cancelled" | "payment_overdue";
  /**
   * Conta com cobrança dispensada: administrador do ALTAR, `internal`, ou
   * `beta` ainda vigente. É o que mantém a conta fora do MRR.
   */
  billingExempt: boolean;
  /**
   * Isenta por ser ADMINISTRADOR DO ALTAR (`role: "admin"`).
   *
   * Existe separado de `billingExempt` justamente para NÃO confundir dois
   * conceitos que a arquitetura mantém distintos:
   *   · admin      → quem OPERA o produto. Nunca foi cliente, nunca paga.
   *   · internal/beta → CLIENTE com acesso de cortesia (`accessType`).
   * Um relatório que precise separar "equipe" de "cortesia comercial" lê este
   * campo em vez de deduzir pelo tipo de acesso.
   */
  adminExempt: boolean;
  /** `beta` cuja data de acesso já passou — voltou a valer a regra de client. */
  betaExpired: boolean;
  /**
   * Dias inteiros que ainda restam de tolerância para uma conta inadimplente.
   * Só é preenchido quando o status é `overdue` e a tolerância ainda não acabou
   * — serve para o aviso "regularize em X dias" na interface.
   */
  overdueDaysLeft?: number;
};

/**
 * ── PERÍODO DE TOLERÂNCIA PARA INADIMPLÊNCIA ────────────────────────────────
 * Quantos dias uma conta com pagamento em atraso continua com acesso liberado
 * antes de cair no paywall, contados a partir do PRIMEIRO aviso de atraso
 * enviado pelo Asaas (gravado em `overdueSince`).
 *
 * Este é o único lugar a mudar caso a política comercial mude. Sete dias cobrem
 * o caso comum (boleto pago com alguns dias de atraso, PIX no fim de semana)
 * sem transformar a inadimplência em acesso gratuito permanente — que era o
 * comportamento anterior, em que `overdue` nunca bloqueava.
 */
export const OVERDUE_TOLERANCE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
export const OVERDUE_TOLERANCE_MS = OVERDUE_TOLERANCE_DAYS * DAY_MS;

/**
 * Estados de cobrança que barram um `client` incondicionalmente.
 * `overdue` NÃO está aqui: ele tem regra própria, com prazo (ver abaixo).
 */
const BLOCKING_STATUSES: Record<string, AccessDecision["reason"]> = {
  expired: "trial_expired",
  cancelled: "subscription_cancelled",
};

/**
 * ── ADMINISTRADOR DO ALTAR ──────────────────────────────────────────────────
 * O valor de `role` que identifica quem OPERA o produto (abre o Painel Admin).
 *
 * É o mesmo campo que `convex/admin.ts` já usa em `requireAdmin` — não existe
 * papel novo aqui, nem lista de e-mails, nem variável de ambiente. `role` só é
 * gravado por `admin.updateUserRole` (protegida por `requireAdmin`), pela
 * `internalMutation` de bootstrap e no primeiro cadastro de um banco vazio.
 * Nenhum caminho aberto ao usuário escreve nesse campo.
 */
export const ALTAR_ADMIN_ROLE = "admin";

/** Quem opera o ALTAR. Não confundir com cliente de cortesia (`accessType`). */
export function isAltarAdmin(user: { role?: string }): boolean {
  return user.role === ALTAR_ADMIN_ROLE;
}

type AccessInput = Pick<
  Doc<"users">,
  "subscriptionStatus" | "accessType" | "accessExpiresAt" | "overdueSince"
> &
  Partial<Pick<Doc<"users">, "trialEndDate" | "role">>;

/**
 * Status de cobrança REAL neste instante.
 *
 * O fim do trial não é gravado no banco: a conta continua com
 * `subscriptionStatus: "trial"` para sempre e a expiração é calculada na
 * leitura. Quem não fizer essa conta enxerga um trial vencido como trial ativo
 * — era o que acontecia nas métricas do painel, que contavam trials já mortos
 * na coluna "em trial".
 *
 * Centralizado aqui para que TODO mundo (paywall, guarda do backend, métricas)
 * enxergue exatamente o mesmo estado.
 */
export function effectiveSubscriptionStatus(
  user: AccessInput,
  now: number = Date.now(),
): string {
  if (user.subscriptionStatus !== "trial") return user.subscriptionStatus;
  // Sem data de fim não há como expirar — o trial segue valendo.
  if (!user.trialEndDate) return "trial";
  return Date.parse(user.trialEndDate) < now ? "expired" : "trial";
}

/**
 * Decisão de cobrança de uma conta `client` (ou `beta` já vencida).
 *
 * A tolerância só começa a correr quando existe `overdueSince`. Um cadastro
 * marcado como `overdue` ANTES desta mudança não tem essa data e, por segurança,
 * continua liberado: preferimos deixar alguém a mais dentro do app do que
 * bloquear um cliente adimplente por falta de dado. O próximo aviso de atraso
 * do Asaas grava a data e a contagem passa a valer normalmente.
 */
function resolveBillingBlock(
  user: AccessInput,
  now: number,
): Pick<AccessDecision, "blocked" | "reason" | "overdueDaysLeft"> {
  // Trial vencido vale como expirado mesmo sem nada ter sido gravado no banco.
  const status = effectiveSubscriptionStatus(user, now);

  if (status === "overdue") {
    if (user.overdueSince === undefined) {
      return { blocked: false };
    }
    const elapsed = now - user.overdueSince;
    if (elapsed >= OVERDUE_TOLERANCE_MS) {
      return { blocked: true, reason: "payment_overdue" };
    }
    return {
      blocked: false,
      overdueDaysLeft: Math.ceil((OVERDUE_TOLERANCE_MS - elapsed) / DAY_MS),
    };
  }

  const reason = BLOCKING_STATUSES[status];
  return { blocked: reason !== undefined, reason };
}

/**
 * Resolve o acesso a partir do usuário.
 *
 * @param subscriptionStatus já deve vir com a expiração de trial aplicada
 *        (é o que `users.getSubscriptionStatus` calcula na leitura).
 * @param now epoch ms — parâmetro para manter a função pura e testável.
 */
export function resolveAccess(user: AccessInput, now: number = Date.now()): AccessDecision {
  const type: AccessType = user.accessType ?? "client";

  // ── Administrador do ALTAR: nunca passa pelo paywall ──────────────────────
  // Cobrar assinatura de quem opera o produto é um contrassenso: a conta que
  // administra o ALTAR precisa entrar para atender cliente, conferir cobrança
  // e promover outra conta — inclusive (e principalmente) quando o próprio
  // faturamento está com problema.
  //
  // Antes desta regra o `role` não participava da decisão de acesso: uma conta
  // `role: "admin"` com trial vencido e sem `accessType` caía no paywall e era
  // convidada a comprar o próprio sistema.
  //
  // Isto NÃO é um bypass genérico. É a mesma condição que já governa o Painel
  // Admin (`requireAdmin`), avaliada no backend, sobre um campo que nenhum
  // caminho aberto ao usuário consegue escrever. O paywall de cliente segue
  // exatamente como estava — este ramo só se aplica a `role === "admin"`.
  if (isAltarAdmin(user)) {
    return {
      type,
      blocked: false,
      billingExempt: true,
      adminExempt: true,
      betaExpired:
        type === "beta" && user.accessExpiresAt !== undefined && user.accessExpiresAt <= now,
    };
  }

  // Interno: acesso permanente, sem cobrança. Nada mais é avaliado.
  if (type === "internal") {
    return { type, blocked: false, billingExempt: true, adminExempt: false, betaExpired: false };
  }

  // Beta: liberado enquanto a data não passar. Sem data = beta sem prazo.
  if (type === "beta") {
    const expired = user.accessExpiresAt !== undefined && user.accessExpiresAt <= now;
    if (!expired) {
      return { type, blocked: false, billingExempt: true, adminExempt: false, betaExpired: false };
    }
    // Beta vencido cai exatamente na regra de client, sem exceção.
    return {
      type,
      ...resolveBillingBlock(user, now),
      billingExempt: false,
      adminExempt: false,
      betaExpired: true,
    };
  }

  // Client: trial/active/expired/cancelled seguem idênticos ao comportamento
  // anterior; só `overdue` ganhou prazo.
  return {
    type: "client",
    ...resolveBillingBlock(user, now),
    billingExempt: false,
    adminExempt: false,
    betaExpired: false,
  };
}

/** Atalho para as métricas e para a guarda do checkout. */
export function isBillingExempt(user: AccessInput, now: number = Date.now()): boolean {
  return resolveAccess(user, now).billingExempt;
}
