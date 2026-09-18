import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizarE164 } from "./lib/central/telefone";

/**
 * Mutation pública chamada pela landing page (visitantes não autenticados).
 * Captura pedidos de demonstração e inscrições na Lista Beta.
 *
 * ── POR QUE O TELEFONE É NORMALIZADO AQUI ───────────────────────────────────
 * `whatsapp` continua sendo gravado EXATAMENTE como a pessoa digitou — é o
 * que ela reconhece se for preciso conferir. Ao lado dele passa a ser gravada
 * a forma canônica E.164, que é o que a Central de Comunicações usa para
 * responder "quem é este número?" por índice quando uma mensagem chega.
 *
 * Telefone que não normaliza (lib/central/telefone.ts devolve null) fica sem
 * o campo canônico. Ausente significa "não indexado", nunca "pessoa diferente"
 * — e nenhum número é inventado para preencher a lacuna.
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
      const whatsapp = args.whatsapp ?? existing.whatsapp;
      await ctx.db.patch(existing._id, {
        name: args.name,
        intent: args.intent,
        whatsapp,
        whatsappE164: normalizarE164(whatsapp) ?? undefined,
      });
      return null;
    }

    await ctx.db.insert("landingLeads", {
      ...args,
      email,
      whatsappE164: normalizarE164(args.whatsapp) ?? undefined,
    });
    return null;
  },
});
