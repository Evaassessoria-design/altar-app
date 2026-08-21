import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireUser } from "./lib/identity";
import { deleteEventCascade } from "./lib/cascade";
import { requireActiveAccess } from "./lib/accessGuard";

const eventType = v.union(
  v.literal("wedding"),
  v.literal("corporate"),
  v.literal("birthday"),
  v.literal("debutante"),
  v.literal("baptism"),
  v.literal("other"),
);

const eventStatus = v.union(
  v.literal("planning"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const list = query({
  args: {
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("upcoming"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const events = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const nowIso = new Date().toISOString();
    const filter = args.filter ?? "all";

    const filtered = events.filter((e) => {
      switch (filter) {
        case "upcoming":
          return e.date >= nowIso && e.status !== "completed" && e.status !== "cancelled";
        case "completed":
          return e.status === "completed";
        case "cancelled":
          return e.status === "cancelled";
        default:
          return true;
      }
    });

    return filtered.sort((a, b) => a.date.localeCompare(b.date));
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== user._id) return null;
    return event;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: eventType,
    date: v.string(),
    location: v.string(),
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    budget: v.optional(v.number()),
    status: eventStatus,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Criar evento NOVO é o recurso pago central — exige acesso liberado.
    // Editar e ler os eventos que já existem continua livre (ver lib/accessGuard.ts).
    const user = await requireActiveAccess(ctx);
    return ctx.db.insert("events", { userId: user._id, ...args });
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    name: v.optional(v.string()),
    type: v.optional(eventType),
    date: v.optional(v.string()),
    location: v.optional(v.string()),
    clientName: v.optional(v.string()),
    clientPhone: v.optional(v.string()),
    budget: v.optional(v.number()),
    status: v.optional(eventStatus),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== user._id)
      throw new ConvexError({ message: "Evento não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

// Registra o status de importação do contrato por IA + pendências do documento.
export const saveContractImport = mutation({
  args: {
    id: v.id("events"),
    analyzedAt: v.string(),
    pendings: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== user._id)
      throw new ConvexError({ message: "Evento não encontrado", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, {
      contractAnalyzedAt: args.analyzedAt,
      contractPendings: args.pendings,
    });
  },
});

/**
 * Exclui o evento E TODOS os dados ligados a ele.
 *
 * A checagem de dono continua exatamente igual. O que mudou é o que acontece
 * depois: antes só a linha do evento era apagada, deixando briefing, checklist,
 * orçamento, compras, fotos, contratos, financeiro, fornecedores, montagem e
 * plantas órfãos no banco — junto com os arquivos no storage. A tela já
 * prometia à usuária que tudo seria apagado; agora é verdade.
 *
 * A cascata vive em lib/cascade.ts, compartilhada com a exclusão de usuário.
 */
export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== user._id)
      throw new ConvexError({ message: "Evento não encontrado", code: "NOT_FOUND" });
    return deleteEventCascade(ctx, args.id);
  },
});
