import type { MutationCtx } from "../_generated/server";
import { components } from "../_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// REMOÇÃO DA CONTA DE LOGIN (Better Auth)
//
// A senha e as sessões do ALTAR não vivem na tabela `users`: vivem dentro do
// componente Better Auth, num banco separado. Por isso apagar a linha de
// `users` NÃO impedia a pessoa de entrar de novo — o login continuava válido,
// e o próximo acesso criava um cadastro novo, com trial novo.
//
// Aqui removemos, nesta ordem:
//   1. sessões    → derruba quem está logado agora;
//   2. credenciais (`account`) → a senha deixa de existir;
//   3. o usuário do Better Auth.
//
// Tokens pendentes (`verification`, ex.: um "esqueci minha senha" em aberto)
// não são varridos: esse modelo é indexado por `identifier`, não por usuário, e
// os tokens expiram sozinhos em 1 hora. Sem usuário do outro lado, um token
// remanescente não redefine senha nenhuma.
//
// Usamos o adapter do componente (`deleteOne`) em laço, porque `deleteMany`
// exige paginação e aqui o volume por usuário é sempre pequeno. O laço é
// LIMITADO: nenhuma exclusão pode virar loop infinito dentro de uma mutation.
//
// Este módulo é o ÚNICO lugar do app que fala com o Better Auth fora de
// convex/auth.ts e lib/identity.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Teto de segurança por modelo. Uma conta real tem poucas sessões. */
const MAX_ROWS_PER_MODEL = 200;

export type AuthRemoval = {
  removed: boolean;
  sessions: number;
  accounts: number;
  reason?: string;
};

/**
 * Apaga em laço, uma a uma, até acabar.
 *
 * `deleteOne` devolve a linha removida, ou `undefined` quando não há mais
 * nenhuma — é a nossa condição de parada.
 */
async function deleteAllSessions(ctx: MutationCtx, betterAuthId: string): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < MAX_ROWS_PER_MODEL; i++) {
    const row = await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: {
        model: "session" as const,
        where: [{ field: "userId" as const, operator: "eq" as const, value: betterAuthId }],
      },
    });
    if (!row) break;
    deleted += 1;
  }
  return deleted;
}

async function deleteAllAccounts(ctx: MutationCtx, betterAuthId: string): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < MAX_ROWS_PER_MODEL; i++) {
    const row = await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: {
        model: "account" as const,
        where: [{ field: "userId" as const, operator: "eq" as const, value: betterAuthId }],
      },
    });
    if (!row) break;
    deleted += 1;
  }
  return deleted;
}

/**
 * Remove por completo a conta de login de um usuário.
 *
 * NUNCA lança: é chamada no meio da exclusão do usuário, quando os dados já
 * saíram e o e-mail já foi travado contra novo trial. Uma falha aqui deixa uma
 * credencial órfã — indesejável, mas muito melhor do que abortar a exclusão
 * pela metade. O motivo volta no retorno para aparecer no painel.
 */
export async function deleteBetterAuthAccount(
  ctx: MutationCtx,
  betterAuthId: string,
): Promise<AuthRemoval> {
  try {
    const sessions = await deleteAllSessions(ctx, betterAuthId);
    const accounts = await deleteAllAccounts(ctx, betterAuthId);

    await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: {
        model: "user" as const,
        where: [{ field: "_id" as const, operator: "eq" as const, value: betterAuthId }],
      },
    });

    return { removed: true, sessions, accounts };
  } catch (error) {
    return {
      removed: false,
      sessions: 0,
      accounts: 0,
      reason: error instanceof Error ? error.message : "falha ao remover conta de login",
    };
  }
}
