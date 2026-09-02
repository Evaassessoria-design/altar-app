import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { authComponent } from "../auth";

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO ÚNICO de resolução de identidade do app.
// Regra da migração: toda função de negócio usa requireUser/getOptionalUser
// daqui. NENHUM outro arquivo do backend conhece detalhes do Better Auth.
// ─────────────────────────────────────────────────────────────────────────────

/** Usuário do app (tabela `users`) da sessão atual, ou null se deslogado. */
export async function getOptionalUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // safeGetAuthUser (API pública do componente) devolve `undefined` em vez de
  // lançar quando a sessão não resolve mais — caso real durante rotação de
  // sessão: o JWT do Convex ainda é válido, então getUserIdentity() responde,
  // mas a sessão que o sustentava já foi apagada. Com `getAuthUser` isso
  // estourava ConvexError("Unauthenticated") e derrubava a tela no ErrorBoundary.
  // Uma função chamada getOptionalUser não deve lançar nesse cenário.
  //
  // Erros de banco ou de programação continuam propagando normalmente: a troca
  // afeta apenas o caso "usuário não resolvido".
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) return null;
  const betterAuthId = String(authUser._id);

  const linked = await ctx.db
    .query("users")
    .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", betterAuthId))
    .unique();
  if (linked) return linked;

  // Fallback de LEITURA: linha pré-existente (pré-migração) com o mesmo e-mail
  // e ainda sem vínculo. O vínculo definitivo (patch) acontece em
  // syncAuthenticatedUser, chamado logo após login/cadastro.
  if (authUser.email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", authUser.email))
      .first();
    if (byEmail && byEmail.betterAuthId === undefined) return byEmail;
  }

  return null;
}

/**
 * Exige usuário do app. Mesma semântica de erro dos antigos helpers locais:
 *  - sem sessão            → UNAUTHENTICATED
 *  - sessão sem linha em `users` → NOT_FOUND
 */
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
  }
  const user = await getOptionalUser(ctx);
  if (!user) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
  }
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTORIZAÇÃO POR EVENTO
// Regra única do app: quem chama só enxerga/altera eventos que são dele.
// Toda função que recebe `eventId` DEVE passar por um destes dois helpers —
// generalização do `assertEventOwner` que já existia em convex/suppliers.ts.
//
//  · requireEventOwner → lança NOT_FOUND (mutations e leituras que já lançavam)
//  · getOwnedEvent     → devolve null    (queries que degradam para vazio)
//
// Ambos usam NOT_FOUND em vez de FORBIDDEN de propósito: um evento de outro
// usuário não deve nem confirmar que existe.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evento do usuário atual, ou `null` se não existe, não é dele, ou não há
 * sessão. Para queries que hoje devolvem vazio em vez de lançar — mantém essa
 * forma e evita quebrar a UI durante transições de rota/logout.
 */
export async function getOwnedEvent(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<Doc<"events"> | null> {
  const user = await getOptionalUser(ctx);
  if (!user) return null;
  const event = await ctx.db.get(eventId);
  if (!event || event.userId !== user._id) return null;
  return event;
}

/**
 * Exige que o evento pertença ao usuário atual. Devolve o par `{ user, event }`
 * porque quase toda função precisa dos dois (evita um segundo `db.get`).
 * Lança UNAUTHENTICATED sem sessão e NOT_FOUND se o evento não for do usuário.
 */
export async function requireEventOwner(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<{ user: Doc<"users">; event: Doc<"events"> }> {
  const user = await requireUser(ctx);
  const event = await ctx.db.get(eventId);
  if (!event || event.userId !== user._id) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Evento não encontrado" });
  }
  return { user, event };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTORIZAÇÃO POR LEAD
// Mesma regra do evento, aplicada ao funil: um lead de outra decoradora não
// pode ser lido, alterado nem ter arquivo anexado. NOT_FOUND (e não FORBIDDEN)
// pelo mesmo motivo — não confirmar que o lead existe.
// ─────────────────────────────────────────────────────────────────────────────

/** Lead do usuário atual, ou `null` (inexistente, de outro dono, ou sem sessão). */
export async function getOwnedLead(
  ctx: QueryCtx | MutationCtx,
  leadId: Id<"leads">,
): Promise<Doc<"leads"> | null> {
  const user = await getOptionalUser(ctx);
  if (!user) return null;
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.userId !== user._id) return null;
  return lead;
}

/** Exige que o lead pertença ao usuário atual. Devolve o par `{ user, lead }`. */
export async function requireLeadOwner(
  ctx: QueryCtx | MutationCtx,
  leadId: Id<"leads">,
): Promise<{ user: Doc<"users">; lead: Doc<"leads"> }> {
  const user = await requireUser(ctx);
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.userId !== user._id) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Lead não encontrado" });
  }
  return { user, lead };
}

// Contexto mínimo com `auth` — cobre QueryCtx, MutationCtx e ActionCtx.
type AuthCtx = { auth: QueryCtx["auth"] };

/** Sessão autenticada (sem exigir linha em `users`), ou null. */
export async function getOptionalIdentity(ctx: AuthCtx) {
  return ctx.auth.getUserIdentity();
}

/**
 * Exige apenas sessão autenticada (para actions e mutations de upload que
 * não dependem da linha em `users`). Lança UNAUTHENTICATED se deslogado.
 */
export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
  }
  return identity;
}

/**
 * Vincula/cria a linha de `users` para a sessão Better Auth atual.
 * Chamado pelo cliente após cadastro/login (mutation users.syncCurrentUser).
 *
 * Ordem de resolução:
 *  1. já vinculado (betterAuthId)      → atualiza perfil básico;
 *  2. e-mail igual de linha PRÉ-EXISTENTE → vincula (caso da migração:
 *     preserva eventos, financeiro e todos os dados ligados por userId);
 *  3. nenhum dos dois                  → cria usuário novo com trial de 14 dias
 *     (primeiro usuário vira admin — regra herdada do modelo atual).
 */
export async function syncAuthenticatedUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const authUser = await authComponent.getAuthUser(ctx);
  const betterAuthId = String(authUser._id);
  const email = authUser.email;
  const name = authUser.name || email || "Usuário";

  const linked = await ctx.db
    .query("users")
    .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", betterAuthId))
    .unique();
  if (linked) {
    await ctx.db.patch(linked._id, {
      name: linked.name || name,
      email: email || linked.email,
    });
    return linked._id;
  }

  if (email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (byEmail) {
      await ctx.db.patch(byEmail._id, { betterAuthId });
      return byEmail._id;
    }
  }

  const isFirstUser = (await ctx.db.query("users").take(1)).length === 0;
  const trial = await resolveTrialForNewUser(ctx, email);

  return ctx.db.insert("users", {
    betterAuthId,
    name,
    email: email || "",
    role: isFirstUser ? "admin" : "user",
    ...trial,
  });
}

/** Duração do período de teste de um cadastro novo. */
export const TRIAL_DAYS = 14;

/**
 * Decide o estado de cobrança inicial de um cadastro NOVO.
 *
 * ── Trial só uma vez por e-mail ─────────────────────────────────────────────
 * Um e-mail que já foi excluído pelo administrador NÃO ganha outro período
 * gratuito. Antes, excluir o usuário no painel apagava só a linha de `users` e
 * deixava a conta de login viva: bastava entrar de novo para ganhar 14 dias
 * novos, quantas vezes quisesse.
 *
 * A conta é recriada mesmo assim — a pessoa consegue entrar, isto não é
 * banimento — porém já expirada: ela cai no paywall e assina para voltar.
 *
 * Separada de `syncAuthenticatedUser` para poder ser testada sem uma sessão
 * Better Auth de verdade (ver lib/identity.trial.test.ts).
 */
export async function resolveTrialForNewUser(
  ctx: MutationCtx,
  email: string | undefined | null,
  now: Date = new Date(),
): Promise<{
  subscriptionStatus: "trial" | "expired";
  trialStartDate: string;
  trialEndDate: string;
}> {
  const normalized = email?.trim().toLowerCase();

  const priorDeletion = normalized
    ? await ctx.db
        .query("deletedAccounts")
        .withIndex("by_email", (q) => q.eq("email", normalized))
        .unique()
    : null;

  if (priorDeletion?.hadTrial === true) {
    // Trial já consumido: a data de fim é AGORA, então `getSubscriptionStatus`
    // e `resolveAccess` tratam a conta como expirada desde o primeiro acesso.
    return {
      subscriptionStatus: "expired",
      trialStartDate: now.toISOString(),
      trialEndDate: now.toISOString(),
    };
  }

  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  return {
    subscriptionStatus: "trial",
    trialStartDate: now.toISOString(),
    trialEndDate: trialEnd.toISOString(),
  };
}
