import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
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

  const authUser = await authComponent.getAuthUser(ctx);
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

/** Igual a getOptionalUser, mas lança UNAUTHENTICATED se não houver sessão. */
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await getOptionalUser(ctx);
  if (!user) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
  }
  return user;
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

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 14);
  const isFirstUser = (await ctx.db.query("users").take(1)).length === 0;

  return ctx.db.insert("users", {
    betterAuthId,
    name,
    email: email || "",
    role: isFirstUser ? "admin" : "user",
    subscriptionStatus: "trial",
    trialStartDate: now.toISOString(),
    trialEndDate: trialEnd.toISOString(),
  });
}
