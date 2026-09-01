import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireIdentity, requireUser } from "./lib/identity";

// ─────────────────────────────────────────────────────────────────────────────
// Itens operacionais de montagem. Camada de dados do Caderno de Montagem.
//
// Segurança: mesmo padrão do Bloco 0 — `requireEventOwner` nas escritas por
// eventId, `getOwnedEvent` nas listagens (degrada para vazio) e checagem de
// `row.userId` nas operações por id do item.
// ─────────────────────────────────────────────────────────────────────────────

const visibility = v.union(
  v.literal("interno"),
  v.literal("cliente"),
  v.literal("equipe"),
);

// Campos editáveis compartilhados entre create e update.
const itemFields = {
  name: v.string(),
  model: v.optional(v.string()),
  quantity: v.optional(v.number()),
  unit: v.optional(v.string()),
  supplierId: v.optional(v.id("eventSuppliers")),
  supplierName: v.optional(v.string()),
  ambiente: v.optional(v.string()),
  notes: v.optional(v.string()),
  includeInAssemblyReport: v.boolean(),
  checkOnAssembly: v.boolean(),
  visibility,
} as const;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    if (!(await getOwnedEvent(ctx, args.eventId))) return [];

    const rows = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    return Promise.all(
      rows
        .sort((a, b) => a.order - b.order)
        .map(async (item) => ({
          ...item,
          referencePhotoUrl: item.referencePhotoStorageId
            ? await ctx.storage.getUrl(item.referencePhotoStorageId)
            : null,
          contractedPhotoUrl: item.contractedPhotoStorageId
            ? await ctx.storage.getUrl(item.contractedPhotoStorageId)
            : null,
        })),
    );
  },
});

export const create = mutation({
  args: { eventId: v.id("events"), area: v.string(), ...itemFields },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    const existing = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const now = new Date().toISOString();

    return ctx.db.insert("assemblyItems", {
      userId: user._id,
      ...args,
      order: existing.reduce((m, i) => Math.max(m, i.order), -1) + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Criação em lote — usada pelo fluxo "Criar itens a partir do briefing", que
 * só chega aqui DEPOIS da decoradora revisar e confirmar a sugestão na UI.
 * Nada é criado automaticamente.
 */
export const createMany = mutation({
  args: {
    eventId: v.id("events"),
    items: v.array(v.object({ area: v.string(), ...itemFields })),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    const existing = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    let order = existing.reduce((m, i) => Math.max(m, i.order), -1) + 1;
    const now = new Date().toISOString();

    for (const item of args.items) {
      await ctx.db.insert("assemblyItems", {
        userId: user._id,
        eventId: args.eventId,
        ...item,
        order: order++,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { created: args.items.length };
  },
});

export const update = mutation({
  args: {
    id: v.id("assemblyItems"),
    area: v.optional(v.string()),
    name: v.optional(v.string()),
    model: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    supplierId: v.optional(v.id("eventSuppliers")),
    supplierName: v.optional(v.string()),
    ambiente: v.optional(v.string()),
    notes: v.optional(v.string()),
    includeInAssemblyReport: v.optional(v.boolean()),
    checkOnAssembly: v.optional(v.boolean()),
    operationalStatus: v.optional(
      v.union(
        v.literal("pendente"),
        v.literal("separado"),
        v.literal("carregado"),
        v.literal("conferido"),
        v.literal("retornou"),
      ),
    ),
    visibility: v.optional(visibility),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: new Date().toISOString() });
  },
});

/** Define (ou troca) uma das duas fotos do item. */
export const setPhoto = mutation({
  args: {
    id: v.id("assemblyItems"),
    slot: v.union(v.literal("reference"), v.literal("contracted")),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }

    const field =
      args.slot === "reference"
        ? "referencePhotoStorageId"
        : "contractedPhotoStorageId";

    // Troca de foto: remove o arquivo anterior para não deixar órfão no storage.
    const previous = item[field];
    if (previous) await ctx.storage.delete(previous);

    await ctx.db.patch(args.id, {
      [field]: args.storageId,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("assemblyItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    // As fotos pertencem exclusivamente ao item — saem junto.
    if (item.referencePhotoStorageId) await ctx.storage.delete(item.referencePhotoStorageId);
    if (item.contractedPhotoStorageId) await ctx.storage.delete(item.contractedPhotoStorageId);
    await ctx.db.delete(args.id);
  },
});
