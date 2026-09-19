import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { normalizarE164 } from "./lib/central/telefone";

// ── LIMITES DE UM ENDPOINT ABERTO ───────────────────────────────────────────
// Esta é a ÚNICA mutation do ALTAR que escreve sem sessão: qualquer pessoa na
// internet pode chamá-la. A deduplicação por e-mail já impede a enxurrada de
// linhas, mas nada impedia um campo de um megabyte — e o formulário da landing
// nunca mandaria isso.
//
// Os limites são generosos de propósito: cortam o absurdo sem recusar nome
// comprido, e-mail corporativo longo ou telefone com código de país.
const LIMITE_NOME = 120;
const LIMITE_EMAIL = 200;
const LIMITE_WHATSAPP = 40;

/** Mesma forma que o `type="email"` do formulário já exige no navegador. */
const EMAIL_PLAUSIVEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    // O e-mail é RECUSADO quando passa do teto, nunca cortado: um e-mail
    // truncado é o endereço de outra pessoa, e a gente escreveria para ela.
    if (email.length > LIMITE_EMAIL || !EMAIL_PLAUSIVEL.test(email)) {
      throw new ConvexError({
        code: "INVALID",
        message: "Informe um e-mail válido para a gente conseguir responder.",
      });
    }

    // O nome pode ser cortado sem virar mentira — é rótulo, não identificador.
    const name = args.name.trim().slice(0, LIMITE_NOME);
    if (name.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "Informe o seu nome." });
    }

    // O telefone segue a regra do e-mail, mas sem barrar o cadastro: ele é
    // opcional, então um valor absurdo é DESCARTADO. Guardar meio número
    // faria a Central ligar para quem não pediu nada.
    const bruto = args.whatsapp?.trim();
    const whatsappInformado =
      bruto && bruto.length > 0 && bruto.length <= LIMITE_WHATSAPP ? bruto : undefined;

    // Evita duplicados por e-mail: atualiza o registro existente
    // (a intenção mais recente prevalece) em vez de criar outro.
    const existing = await ctx.db
      .query("landingLeads")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      const whatsapp = whatsappInformado ?? existing.whatsapp;
      await ctx.db.patch(existing._id, {
        name,
        intent: args.intent,
        whatsapp,
        whatsappE164: normalizarE164(whatsapp) ?? undefined,
      });
      return null;
    }

    await ctx.db.insert("landingLeads", {
      name,
      email,
      intent: args.intent,
      whatsapp: whatsappInformado,
      whatsappE164: normalizarE164(whatsappInformado) ?? undefined,
    });
    return null;
  },
});
