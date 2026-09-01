import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { effectiveSubscriptionStatus, resolveAccess } from "./lib/access";
import { shouldRecordLastSeen } from "./lib/presence";
import {
  getOptionalUser,
  requireIdentity,
  requireUser,
  syncAuthenticatedUser,
} from "./lib/identity";

// Chamado pelo cliente logo após cadastro/login (Better Auth).
// Vincula/cria a linha do app `users` — toda a lógica vive em lib/identity.ts.
export const syncCurrentUser = mutation({
  args: {},
  handler: async (ctx) => syncAuthenticatedUser(ctx),
});

// REMOVIDO: `updateCurrentUser` (legado Hercules/OIDC). Indexava por
// `tokenIdentifier` sem consultar `betterAuthId`/`by_email`, então criava um
// SEGUNDO registro para um usuário que já existia — com trial novo. O vínculo
// correto vive em `syncCurrentUser` → lib/identity.syncAuthenticatedUser.

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => getOptionalUser(ctx),
});

export const getSubscriptionStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    if (!user) return null;

    // Expiração do trial é calculada na leitura (não é persistida). A conta em
    // si vive em lib/access.ts, para que paywall, métricas e a guarda do
    // backend enxerguem exatamente o mesmo estado.
    const now = Date.now();
    const status = effectiveSubscriptionStatus(user, now);
    const effective = { ...user, subscriptionStatus: status };

    let daysLeft: number | undefined;
    if (status === "trial" && user.trialEndDate) {
      daysLeft = Math.ceil((Date.parse(user.trialEndDate) - now) / (1000 * 60 * 60 * 24));
    }

    // A decisão de bloquear nasce no backend (lib/access.ts). O frontend só lê
    // `access.blocked` — não mantém mais a própria lista de status proibidos.
    return { ...effective, daysLeft, access: resolveAccess(user, now) };
  },
});

// `activateSubscription` (admin marcava "active" à mão) foi removida pelo mesmo
// motivo de `admin.updateUserSubscription`: simulava assinatura paga sem nada
// no Asaas. Não tinha nenhum caller na UI. Ativação real chega por
// `activateSubscriptionByCustomer`, abaixo, disparada pelo webhook.

/**
 * Registra que o usuário está usando o app agora.
 *
 * Chamada pelo aplicativo ao abrir e ao trocar de tela. A gravação em si é
 * limitada no SERVIDOR: só acontece quando o carimbo anterior já passou de
 * LAST_SEEN_THROTTLE_MS (30 min). Chamar com frequência é inofensivo — o
 * excesso vira leitura barata, não escrita.
 *
 * Silenciosa por natureza: sem sessão, não faz nada e não lança. Ela roda em
 * segundo plano na interface e nunca deve gerar erro visível para quem usa.
 *
 * Devolve `true` quando gravou — usado nos testes.
 */
export const touchLastSeen = mutation({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const user = await getOptionalUser(ctx);
    if (!user) return false;

    const now = Date.now();
    if (!shouldRecordLastSeen(user.lastSeenAt, now)) return false;

    await ctx.db.patch(user._id, { lastSeenAt: now });
    return true;
  },
});

// Mark onboarding as complete
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    if (!user) return;
    await ctx.db.patch(user._id, { onboardingCompleted: true });
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    studioName: v.optional(v.string()),
    cpfCnpj: v.optional(v.string()),
    currency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    instagram: v.optional(v.string()),
    website: v.optional(v.string()),
    brandColor: v.optional(v.string()),
    brandAccentColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const patch: {
      name?: string;
      phone?: string;
      studioName?: string;
      cpfCnpj?: string;
      currency?: string;
      timezone?: string;
      logoStorageId?: typeof args.logoStorageId;
      instagram?: string;
      website?: string;
      brandColor?: string;
      brandAccentColor?: string;
    } = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.phone !== undefined) patch.phone = args.phone;
    if (args.studioName !== undefined) patch.studioName = args.studioName;
    if (args.cpfCnpj !== undefined) patch.cpfCnpj = args.cpfCnpj;
    if (args.currency !== undefined) patch.currency = args.currency;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.logoStorageId !== undefined) patch.logoStorageId = args.logoStorageId;
    if (args.instagram !== undefined) patch.instagram = args.instagram;
    if (args.website !== undefined) patch.website = args.website;
    // Cor é normalizada na LEITURA (src/lib/brand.ts), não aqui: assim um valor
    // antigo ou digitado à mão nunca quebra um documento já gerado.
    if (args.brandColor !== undefined) patch.brandColor = args.brandColor;
    if (args.brandAccentColor !== undefined) patch.brandAccentColor = args.brandAccentColor;

    await ctx.db.patch(user._id, patch);
  },
});

// Generate upload URL for logo
export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Get logo URL
export const getLogoUrl = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    if (!user?.logoStorageId) return null;
    return await ctx.storage.getUrl(user.logoStorageId);
  },
});

// ── Internal mutations called by Asaas webhook ──────────────────────────────

/** Vínculo de cobrança de uma conta — usado pela conferência com o Asaas. */
export const getBillingRef = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      userId: user._id as string,
      asaasCustomerId: user.asaasCustomerId,
      asaasSubscriptionId: user.asaasSubscriptionId,
      subscriptionStatus: user.subscriptionStatus,
    };
  },
});

export const setAsaasCustomer = internalMutation({
  args: { userId: v.id("users"), asaasCustomerId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { asaasCustomerId: args.asaasCustomerId });
  },
});

export const setAsaasSubscription = internalMutation({
  args: { userId: v.id("users"), asaasSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { asaasSubscriptionId: args.asaasSubscriptionId });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ENCONTRAR O DONO DE UM AVISO DO ASAAS
//
// ── O QUE DEU ERRADO EM PRODUÇÃO ────────────────────────────────────────────
// A ativação procurava o usuário SÓ pelo `asaasCustomerId` e, ao não achar,
// saía em silêncio (`if (!user) return`). Uma cliente pagou no cartão, o Asaas
// confirmou, e a conta continuou em "trial" — sem erro em lugar nenhum.
//
// O cancelamento já tinha a cascata de chaves. Quem TIRAVA acesso era robusto;
// quem DAVA acesso era frágil. Esta função acaba com a assimetria.
//
// ── A ORDEM DAS CHAVES ──────────────────────────────────────────────────────
// 1. `externalReference` — o `_id` do usuário, gravado por NÓS no Asaas. É a
//    única chave que não depende de um id do Asaas ter voltado corretamente
//    para o nosso banco, que foi justamente o que falhou.
// 2. `asaasSubscriptionId` — preciso, mas pode apontar para a assinatura errada
//    quando houve duplicata.
// 3. `asaasCustomerId` — o comportamento antigo, mantido como último recurso.
//
// ── POR QUE NÃO `.unique()` ─────────────────────────────────────────────────
// `.unique()` LANÇA EXCEÇÃO se dois cadastros compartilharem o mesmo id do
// Asaas. Isso derrubaria o webhook com erro 500, e o Asaas pausa a fila depois
// de algumas falhas — um dado inconsistente viraria uma parada geral de
// ativações. Aqui pegamos o cadastro MAIS ANTIGO, de forma determinística, e o
// conflito fica registrado no log de avisos em vez de derrubar o recebimento.
// ─────────────────────────────────────────────────────────────────────────────

export type ChaveDeBusca = "externalReference" | "subscription" | "customer";

export type BuscaDeUsuario = {
  user: Doc<"users"> | null;
  matchedBy?: ChaveDeBusca;
  /** Mais de um cadastro com o mesmo id do Asaas — precisa de atenção humana. */
  conflito?: boolean;
};

export type RefDoAsaas = {
  externalReference?: string;
  asaasSubscriptionId?: string;
  asaasCustomerId?: string;
};

/** O mais antigo, sempre. Determinístico entre execuções. */
function maisAntigo(candidatos: Doc<"users">[]): Doc<"users"> | null {
  if (candidatos.length === 0) return null;
  return [...candidatos].sort((a, b) => a._creationTime - b._creationTime)[0];
}

export async function encontrarUsuarioPorRefAsaas(
  ctx: MutationCtx,
  ref: RefDoAsaas,
): Promise<BuscaDeUsuario> {
  // 1. A referência que nós mesmos gravamos.
  if (ref.externalReference) {
    // `normalizeId` devolve null para texto que não é um id de usuário —
    // `ctx.db.get` lançaria exceção. O Asaas pode devolver qualquer texto aqui.
    const id = ctx.db.normalizeId("users", ref.externalReference);
    if (id) {
      const user = await ctx.db.get(id);
      if (user) return { user, matchedBy: "externalReference" };
    }
  }

  // 2. A assinatura.
  if (ref.asaasSubscriptionId) {
    const achados = await ctx.db
      .query("users")
      .withIndex("by_asaas_subscription", (q) =>
        q.eq("asaasSubscriptionId", ref.asaasSubscriptionId),
      )
      .collect();
    const user = maisAntigo(achados);
    if (user) return { user, matchedBy: "subscription", conflito: achados.length > 1 };
  }

  // 3. O cliente — o caminho antigo.
  if (ref.asaasCustomerId) {
    const achados = await ctx.db
      .query("users")
      .withIndex("by_asaas_customer", (q) => q.eq("asaasCustomerId", ref.asaasCustomerId))
      .collect();
    const user = maisAntigo(achados);
    if (user) return { user, matchedBy: "customer", conflito: achados.length > 1 };
  }

  return { user: null };
}

/**
 * Ativa a assinatura a partir de QUALQUER chave que o aviso trouxer.
 *
 * Além de ativar, RECOSTURA o vínculo: se o usuário foi encontrado pela nossa
 * referência mas o `asaasCustomerId` gravado estava errado (ou faltando), ele é
 * corrigido com o do evento. Sem isso, o próximo aviso falharia de novo pelo
 * mesmo motivo e o problema voltaria sozinho.
 *
 * A assinatura que acabou de ser PAGA passa a ser a assinatura de referência da
 * conta — quando houve duplicata, é ela a verdadeira, não a que ficou gravada.
 *
 * Idempotente: reprocessar o mesmo aviso apenas reafirma o mesmo estado.
 */
export type ResultadoDoAviso = {
  matchedBy: ChaveDeBusca | "not_found";
  conflito: boolean;
  userId?: Id<"users">;
};

async function aplicarAtivacao(
  ctx: MutationCtx,
  args: RefDoAsaas & { expiresAt?: string },
): Promise<ResultadoDoAviso> {
  {
    const { user, matchedBy, conflito } = await encontrarUsuarioPorRefAsaas(ctx, args);
    if (!user) return { matchedBy: "not_found" as const, conflito: false };

    await ctx.db.patch(user._id, {
      subscriptionStatus: "active",
      // O id que veio no aviso do pagamento é o que vale: é a assinatura viva.
      asaasSubscriptionId: args.asaasSubscriptionId ?? user.asaasSubscriptionId,
      asaasCustomerId: args.asaasCustomerId ?? user.asaasCustomerId,
      subscriptionExpiresAt: args.expiresAt ?? user.subscriptionExpiresAt,
      // O pagamento entrou: a contagem de tolerância da inadimplência zera.
      // Sem isso, um cliente que atrasa, paga e atrasa de novo seria bloqueado
      // pela data do atraso ANTIGO.
      overdueSince: undefined,
    });

    return { matchedBy: matchedBy!, conflito: conflito ?? false, userId: user._id };
  }
}

async function aplicarAtraso(ctx: MutationCtx, args: RefDoAsaas): Promise<ResultadoDoAviso> {
  {
    const { user, matchedBy, conflito } = await encontrarUsuarioPorRefAsaas(ctx, args);
    if (!user) return { matchedBy: "not_found" as const, conflito: false };

    const resultado = { matchedBy: matchedBy!, conflito: conflito ?? false, userId: user._id };

    // Já está em atraso: preserva a data original (o Asaas reenvia
    // PAYMENT_OVERDUE mais de uma vez, e reiniciar a contagem a cada aviso
    // faria a tolerância nunca terminar). Só preenche se estiver faltando.
    if (user.subscriptionStatus === "overdue") {
      if (user.overdueSince === undefined) {
        await ctx.db.patch(user._id, { overdueSince: Date.now() });
      }
      return resultado;
    }

    // Só rebaixa quem está ativo. Não sobrescreve cancelled/expired/trial.
    if (user.subscriptionStatus !== "active") return resultado;
    await ctx.db.patch(user._id, {
      subscriptionStatus: "overdue",
      overdueSince: Date.now(),
    });
    return resultado;
  }
}

/**
 * Ativa a assinatura a partir de QUALQUER chave que o aviso trouxer.
 * Ver `encontrarUsuarioPorRefAsaas` para a ordem das chaves e o porquê.
 */
export const activateSubscriptionByAsaasRef = internalMutation({
  args: {
    externalReference: v.optional(v.string()),
    asaasSubscriptionId: v.optional(v.string()),
    asaasCustomerId: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResultadoDoAviso> => aplicarAtivacao(ctx, args),
});

/** Atraso a partir de qualquer chave do aviso. Mesma cascata da ativação. */
export const markSubscriptionOverdueByRef = internalMutation({
  args: {
    externalReference: v.optional(v.string()),
    asaasSubscriptionId: v.optional(v.string()),
    asaasCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResultadoDoAviso> => aplicarAtraso(ctx, args),
});

/**
 * Compatibilidade: continua existindo com o nome e a assinatura antigos, mas
 * agora é a MESMA implementação de `activateSubscriptionByAsaasRef`. Duas
 * implementações do "o que fazer quando o pagamento entra" divergiriam.
 */
export const activateSubscriptionByCustomer = internalMutation({
  args: {
    asaasCustomerId: v.string(),
    asaasSubscriptionId: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResultadoDoAviso> => aplicarAtivacao(ctx, args),
});

/**
 * Pagamento em atraso — NÃO cancela a assinatura.
 *
 * `PAYMENT_OVERDUE` significa apenas que um boleto/cobrança venceu. O Asaas
 * ainda vai tentar recobrar e, se de fato desistir, envia SUBSCRIPTION_DELETED —
 * é aí que cancelamos. Tratar atraso como cancelamento tirava o acesso de quem
 * paga um dia depois do vencimento.
 *
 * O status "overdue" mantém o acesso durante o período de tolerância definido
 * em lib/access.ts (OVERDUE_TOLERANCE_DAYS) e serve de sinal para o painel
 * administrativo. `overdueSince` guarda QUANDO o atraso começou — é o dado que
 * faz a tolerância ter fim, em vez de virar acesso gratuito permanente.
 * Quando o pagamento entra, `activateSubscriptionByCustomer` devolve para
 * "active" e zera essa data sozinho.
 */
export const markSubscriptionOverdue = internalMutation({
  args: { asaasCustomerId: v.string() },
  handler: async (ctx, args): Promise<ResultadoDoAviso> => aplicarAtraso(ctx, args),
});

export const cancelSubscriptionByCustomer = internalMutation({
  args: { asaasCustomerId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_asaas_customer", (q) =>
        q.eq("asaasCustomerId", args.asaasCustomerId),
      )
      .unique();
    if (!user) return;
    await ctx.db.patch(user._id, {
      subscriptionStatus: "cancelled",
      overdueSince: undefined,
    });
  },
});

export const cancelSubscriptionBySubscriptionId = internalMutation({
  args: { asaasSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_asaas_subscription", (q) =>
        q.eq("asaasSubscriptionId", args.asaasSubscriptionId),
      )
      .unique();
    if (!user) return;
    await ctx.db.patch(user._id, {
      subscriptionStatus: "cancelled",
      overdueSince: undefined,
    });
  },
});

/**
 * Cancelamento a partir do que o aviso do Asaas traz — usado pelo webhook.
 *
 * Tenta primeiro pelo ID DA ASSINATURA (mais preciso: um cliente pode ter mais
 * de uma assinatura no Asaas) e cai no ID do cliente quando não encontra
 * ninguém. Esse fallback importa: um cadastro cujo `asaasSubscriptionId` não
 * chegou a ser gravado continua sendo cancelado, como acontecia antes.
 *
 * Devolve como o usuário foi encontrado — útil nos testes e para diagnosticar
 * um aviso que não casou com ninguém.
 */
export const cancelSubscriptionByAsaasRef = internalMutation({
  args: {
    externalReference: v.optional(v.string()),
    asaasSubscriptionId: v.optional(v.string()),
    asaasCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResultadoDoAviso> => {
    const { user, matchedBy, conflito } = await encontrarUsuarioPorRefAsaas(ctx, args);
    if (!user) return { matchedBy: "not_found" as const, conflito: false };

    await ctx.db.patch(user._id, {
      subscriptionStatus: "cancelled",
      overdueSince: undefined,
    });
    return { matchedBy: matchedBy!, conflito: conflito ?? false, userId: user._id };
  },
});
