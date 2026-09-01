import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireUser } from "./lib/identity";
import { requireActiveAccess } from "./lib/accessGuard";

export const listLeads = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("leads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const createLead = mutation({
  args: {
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    eventType: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    stage: v.union(
      v.literal("contact"),
      v.literal("contacted"),
      v.literal("meeting"),
      v.literal("quote_sent"),
      v.literal("negotiating"),
      v.literal("contracted"),
      v.literal("discarded"),
    ),
    notes: v.optional(v.string()),
    partnerName: v.optional(v.string()),
    venue: v.optional(v.string()),
    city: v.optional(v.string()),
    guestCount: v.optional(v.number()),
    source: v.optional(v.string()),
    responsible: v.optional(v.string()),
    lastInteraction: v.optional(v.string()),
    nextAction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Get max order for this stage
    const stageleads = await ctx.db
      .query("leads")
      .withIndex("by_user_stage", (q) => q.eq("userId", user._id).eq("stage", args.stage))
      .collect();
    const maxOrder = stageleads.reduce((m, l) => Math.max(m, l.order), -1);
    return ctx.db.insert("leads", { userId: user._id, ...args, order: maxOrder + 1 });
  },
});

export const updateLead = mutation({
  args: {
    id: v.id("leads"),
    clientName: v.optional(v.string()),
    clientPhone: v.optional(v.string()),
    eventType: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    stage: v.optional(
      v.union(
        v.literal("contact"),
        v.literal("contacted"),
        v.literal("meeting"),
        v.literal("quote_sent"),
        v.literal("negotiating"),
        v.literal("contracted"),
        v.literal("discarded"),
      ),
    ),
    notes: v.optional(v.string()),
    partnerName: v.optional(v.string()),
    venue: v.optional(v.string()),
    city: v.optional(v.string()),
    guestCount: v.optional(v.number()),
    source: v.optional(v.string()),
    responsible: v.optional(v.string()),
    lastInteraction: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const lead = await ctx.db.get(args.id);
    if (!lead || lead.userId !== user._id)
      throw new ConvexError({ message: "Lead não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const deleteLead = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const lead = await ctx.db.get(args.id);
    if (!lead || lead.userId !== user._id)
      throw new ConvexError({ message: "Lead não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});

export const convertToEvent = mutation({
  args: {
    leadId: v.id("leads"),
    eventName: v.string(),
    eventDate: v.string(),
    location: v.string(),
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    budget: v.optional(v.number()),
    type: v.union(
      v.literal("wedding"),
      v.literal("corporate"),
      v.literal("birthday"),
      v.literal("debutante"),
      v.literal("baptism"),
      v.literal("other"),
    ),
  },
  handler: async (ctx, args): Promise<string> => {
    // MESMA guarda de `events.create`: converter um lead CRIA UM EVENTO, que é o
    // recurso pago central do ALTAR. Antes esta mutation exigia apenas sessão
    // (`requireUser`), então era um caminho paralelo que escapava do paywall —
    // uma conta com trial vencido, cancelada ou bloqueada por inadimplência
    // continuava criando eventos pelo funil.
    //
    // A ordem importa: o acesso é verificado ANTES de ler o lead, para que uma
    // conta bloqueada receba SUBSCRIPTION_REQUIRED em vez de NOT_FOUND — a
    // mensagem certa leva ao paywall; a errada faria a pessoa achar que perdeu
    // o lead.
    const user = await requireActiveAccess(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.userId !== user._id)
      throw new ConvexError({ message: "Lead não encontrado", code: "NOT_FOUND" });

    // ── IDEMPOTÊNCIA ─────────────────────────────────────────────────────────
    // Converter DUAS VEZES o mesmo lead criava DOIS eventos, e o lead ficava
    // apontando só para o último — o primeiro virava um evento órfão que a
    // decoradora teria de encontrar e apagar à mão.
    //
    // A tela desabilita o botão enquanto envia e o esconde depois, mas isso é
    // decoração: a mutation é chamável direto do navegador, e um Enter repetido
    // com a rede lenta bastava. A garantia tem que ser do servidor.
    //
    // Se o evento apontado ainda existe, devolvemos ELE em vez de criar outro.
    // Se foi apagado, o ponteiro está velho e a conversão pode acontecer de
    // novo — é o caso legítimo de "converti, apaguei o evento, quero refazer".
    if (lead.convertedEventId) {
      const jaConvertido = await ctx.db.get(lead.convertedEventId);
      if (jaConvertido && jaConvertido.userId === user._id) {
        return jaConvertido._id;
      }
    }

    const { leadId, eventName, eventDate, ...rest } = args;
    // Reaproveita o que a decoradora já anotou durante a negociação, em vez de
    // exigir que ela redigite. O que veio no formulário tem precedência — ela
    // pode estar corrigindo justamente na hora de fechar.
    const eventId = await ctx.db.insert("events", {
      userId: user._id,
      name: eventName,
      date: eventDate,
      ...rest,
      location: rest.location || lead.venue || "",
      clientPhone: rest.clientPhone ?? lead.clientPhone,
      budget: rest.budget ?? lead.budget,
      notes: lead.notes,
      status: "planning",
    });

    await ctx.db.patch(leadId, {
      stage: "contracted",
      convertedEventId: eventId,
    });

    return eventId;
  },
});
