import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Mutation pública chamada pela landing page (visitantes não autenticados).
 * Captura pedidos de demonstração e inscrições na Lista Beta.
 */
export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    whatsapp: v.optional(v.string()),
    intent: v.union(v.literal("demo"), v.literal("beta")),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    // Evita duplicados por e-mail: atualiza o registro existente
    // (a intenção mais recente prevalece) em vez de criar outro.
    const existing = await ctx.db
      .query("landingLeads")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        intent: args.intent,
        whatsapp: args.whatsapp ?? existing.whatsapp,
      });
      return null;
    }

    await ctx.db.insert("landingLeads", { ...args, email });
    return null;
  },
});
