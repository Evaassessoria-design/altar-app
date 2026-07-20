import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx: any) => {
    // 1. Valida se o usuário está logado
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Não autenticado");

    // 2. Busca o usuário correspondente no banco pelo Hercules Auth
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q: any) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) throw new Error("Usuário não encontrado");

    // 3. Valida as permissões de assinatura da Empresa dele
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q: any) => q.eq("organizationId", user.organizationId))
      .unique();

    if (!subscription || subscription.status !== "ACTIVE" || subscription.expiresAt < Date.now()) {
      throw new Error("Acesso negado: Plano inativo ou expirado");
    }

    // 4. Retorna em tempo real apenas os eventos da Organização dele
    return await ctx.db
      .query("events")
      .withIndex("by_organization", (q: any) => q.eq("organizationId", user.organizationId))
      .collect();
  },
});
