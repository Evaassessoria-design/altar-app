import { resolveAccess, effectiveSubscriptionStatus } from "../access";
import { ACTIVE_WINDOWS, isActiveWithin } from "../presence";

// ─────────────────────────────────────────────────────────────────────────────
// O PANORAMA DO NEGÓCIO ALTAR — quantas decoradoras, quantas pagam, quantas
// sumiram.
//
// Extraído de `admin.getOfficeSnapshot` sem mudar uma conta sequer: o mesmo
// número passou a ter dois leitores (a ponte HTTP antiga e o Escritório) e
// duas cópias divergiriam no dia em que uma delas fosse ajustada — foi o que
// já aconteceu com `requireAdmin` antes de virar módulo.
//
// Função pura de propósito: recebe as linhas já lidas em vez de um `ctx`.
// Assim o teste confere a aritmética sem levantar banco, e quem chama continua
// dono da decisão de quanto ler.
//
// ── ISTO NÃO É DADO DE DECORADORA ───────────────────────────────────────────
// Nada aqui é evento, lead ou orçamento de ninguém: são contagens sobre a
// carteira de assinantes do ALTAR. É a fronteira inteira do Escritório em uma
// frase — e o motivo de nenhuma destas contas aparecer no Assistente.
// ─────────────────────────────────────────────────────────────────────────────

/** Preço cheio da assinatura, em reais. */
export const MENSALIDADE = 119.9;

type LinhaDeUsuario = Parameters<typeof resolveAccess>[0] & {
  lastSeenAt?: number;
};

export function panoramaDoNegocio(
  usuarios: LinhaDeUsuario[],
  totalDeEventos: number,
  now: number,
) {
  // Conta interna e conta beta não entram no faturamento: são isentas por tipo
  // de acesso, não por estado de cobrança. Contá-las inflaria o MRR com quem
  // nunca vai pagar.
  const cobraveis = usuarios.filter((u) => !resolveAccess(u, now).billingExempt);
  const statusDe = (u: LinhaDeUsuario) => effectiveSubscriptionStatus(u, now);

  const trial = cobraveis.filter((u) => statusDe(u) === "trial").length;
  const active = cobraveis.filter((u) => statusDe(u) === "active").length;
  const overdue = cobraveis.filter((u) => statusDe(u) === "overdue").length;
  const expired = cobraveis.filter((u) => statusDe(u) === "expired").length;
  const cancelled = cobraveis.filter((u) => statusDe(u) === "cancelled").length;
  const overdueBlocked = cobraveis.filter(
    (u) => statusDe(u) === "overdue" && resolveAccess(u, now).blocked,
  ).length;

  // Só quem CHEGOU AO FIM do trial entra na conversão. Quem ainda está testando
  // não é fracasso nem sucesso ainda, e incluí-lo faria a taxa despencar toda
  // vez que entrasse gente nova.
  const denominador = active + expired;

  return {
    total: usuarios.length,
    trial,
    active,
    overdue,
    overdueBlocked,
    expired,
    cancelled,
    mrr: active * MENSALIDADE,
    conversionRate: denominador > 0 ? Math.round((active / denominador) * 100) : 0,
    eventsTotal: totalDeEventos,
    activeDay: usuarios.filter((u) => isActiveWithin(u.lastSeenAt, ACTIVE_WINDOWS.day, now))
      .length,
    activeWeek: usuarios.filter((u) => isActiveWithin(u.lastSeenAt, ACTIVE_WINDOWS.week, now))
      .length,
    activeMonth: usuarios.filter((u) => isActiveWithin(u.lastSeenAt, ACTIVE_WINDOWS.month, now))
      .length,
    neverSeen: usuarios.filter((u) => u.lastSeenAt === undefined).length,
  };
}
