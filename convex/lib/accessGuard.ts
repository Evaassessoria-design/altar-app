import { ConvexError } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { requireUser } from "./identity";
import { resolveAccess } from "./access";

// ─────────────────────────────────────────────────────────────────────────────
// PAYWALL DE VERDADE — no servidor.
//
// Até aqui o bloqueio existia SÓ na tela: `SubscriptionGuard`, em src/App.tsx,
// redireciona para /paywall. Nenhuma função do backend consultava a regra de
// acesso. Como as funções do Convex são chamáveis direto do navegador, uma
// conta com trial vencido, cancelada ou bloqueada por inadimplência continuava
// podendo criar eventos e — pior — disparar as ações de IA, que custam dinheiro
// real por chamada. O paywall era decorativo.
//
// ── O QUE ESTA GUARDA COBRE (e o que NÃO cobre, de propósito) ────────────────
//
// Aplicada a: criar evento novo, enviar arquivos e todas as ações de IA — ou
// seja, o que gera CUSTO ou entrega valor novo.
//
// NÃO aplicada a leituras nem à edição do que a pessoa já tem. Quem está
// bloqueada continua enxergando e ajustando seus próprios dados. Isso é
// deliberado: trancar o acesso aos próprios dados seria hostil, atrapalharia a
// exportação em PDF de um evento já pago e criaria problema de LGPD.
//
// NUNCA aplicar a: `users.updateProfile`, `users.generateLogoUploadUrl`,
// `users.completeOnboarding` nem `asaas.createCheckoutSession`. São o caminho
// de VOLTA — quem está no paywall precisa completar o CPF/CNPJ para conseguir
// pagar. Bloquear ali prenderia a cliente para fora sem saída.
// ─────────────────────────────────────────────────────────────────────────────

/** Mensagem por motivo — o app mostra direto para quem chamou. */
const MENSAGENS: Record<string, string> = {
  trial_expired:
    "Seu período de teste terminou. Assine para continuar criando no Altar.",
  subscription_cancelled:
    "Sua assinatura está cancelada. Reative para continuar criando no Altar.",
  payment_overdue:
    "Seu pagamento está em atraso e o período de tolerância terminou. Regularize para continuar.",
};

const MENSAGEM_PADRAO = "Assine o Altar para continuar usando este recurso.";

/**
 * Exige uma conta com acesso liberado.
 *
 * Contas `internal` e `beta` vigente passam sempre — a mesma decisão de
 * `resolveAccess`, sem nenhuma regra paralela aqui.
 *
 * Lança `SUBSCRIPTION_REQUIRED`, que o app trata mandando para o paywall.
 */
export async function requireActiveAccess(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  const access = resolveAccess(user);

  if (access.blocked) {
    throw new ConvexError({
      code: "SUBSCRIPTION_REQUIRED",
      reason: access.reason,
      message: (access.reason && MENSAGENS[access.reason]) || MENSAGEM_PADRAO,
    });
  }

  return user;
}

/**
 * Mesma guarda para ACTIONS (que não têm `ctx.db`).
 *
 * Passa por `users.getSubscriptionStatus`, que já devolve a decisão de acesso
 * calculada — inclusive a expiração do trial, que não é gravada no banco.
 */
export async function requireActiveAccessAction(ctx: ActionCtx) {
  const status = await ctx.runQuery(api.users.getSubscriptionStatus);

  if (!status) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
  }

  if (status.access?.blocked) {
    const reason = status.access.reason;
    throw new ConvexError({
      code: "SUBSCRIPTION_REQUIRED",
      reason,
      message: (reason && MENSAGENS[reason]) || MENSAGEM_PADRAO,
    });
  }

  return status;
}
