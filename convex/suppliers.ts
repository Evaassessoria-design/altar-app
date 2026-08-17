import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireEventOwner, requireIdentity, requireUser } from "./lib/identity";

// ─────────────────────────────────────────────────────────────────────────────
// Fornecedores do evento (Dossiê operacional + perfil). Isolamento por usuário:
// toda operação valida que o evento/fornecedor pertence ao usuário atual.
//
// Arquitetura: hoje o fornecedor vive DENTRO do evento (eventSuppliers). Os
// campos de "perfil" foram adicionados aqui de forma incremental; no futuro o
// perfil pode ser extraído para uma tabela global reutilizável sem quebrar isto.
// ─────────────────────────────────────────────────────────────────────────────

const operationalValidator = v.array(
  v.object({
    label: v.string(),
    value: v.string(),
    group: v.optional(v.string()),
  }),
);

const statusValidator = v.union(
  v.literal("cotacao"),
  v.literal("em_negociacao"),
  v.literal("contratado"),
  v.literal("confirmado"),
  v.literal("finalizado"),
);

const alignmentsValidator = v.array(
  v.object({
    date: v.string(),
    note: v.string(),
    by: v.optional(v.string()),
    nextAction: v.optional(v.string()),
  }),
);

// Campos de perfil/operação compartilhados entre create e update (opcionais).
const profileArgs = {
  contactName: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  notes: v.optional(v.string()),
  logoStorageId: v.optional(v.id("_storage")),
  instagram: v.optional(v.string()),
  website: v.optional(v.string()),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  differentials: v.optional(v.string()),
  commercialInfo: v.optional(v.string()),
  bankInfo: v.optional(v.string()),
  status: v.optional(statusValidator),
  alignments: v.optional(alignmentsValidator),
  nextAction: v.optional(v.string()),
  favorite: v.optional(v.boolean()),
  operational: v.optional(operationalValidator),
} as const;

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventOwner(ctx, args.eventId);
    const rows = await ctx.db
      .query("eventSuppliers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return Promise.all(
      rows.map(async (s) => ({
        ...s,
        logoUrl: s.logoStorageId ? await ctx.storage.getUrl(s.logoStorageId) : null,
      })),
    );
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    category: v.string(),
    companyName: v.string(),
    ...profileArgs,
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);

    const existing = await ctx.db
      .query("eventSuppliers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const maxOrder = existing.reduce((m, s) => Math.max(m, s.order ?? -1), -1);

    return ctx.db.insert("eventSuppliers", {
      userId: user._id,
      ...args,
      order: maxOrder + 1,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("eventSuppliers"),
    category: v.optional(v.string()),
    companyName: v.optional(v.string()),
    ...profileArgs,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.id);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ message: "Fornecedor não encontrado", code: "NOT_FOUND" });
    }
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("eventSuppliers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.id);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ message: "Fornecedor não encontrado", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.id);
  },
});

// Upload de logo — reutiliza a infraestrutura de storage existente do ALTAR.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return ctx.storage.generateUploadUrl();
  },
});
