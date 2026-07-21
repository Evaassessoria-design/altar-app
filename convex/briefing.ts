import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server.d.ts";

async function getUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Não autenticado", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "Usuário não encontrado", code: "NOT_FOUND" });
  return user;
}

// Briefing fields validator (all optional strings)
const briefingFields = {
  guestCount: v.optional(v.string()),
  theme: v.optional(v.string()),
  ceremonyTime: v.optional(v.string()),
  receptionTime: v.optional(v.string()),
  venueContact: v.optional(v.string()),
  venueRules: v.optional(v.string()),
  colorPalette: v.optional(v.string()),
  decorStyle: v.optional(v.string()),
  referenceImages: v.optional(v.string()),
  atmosphereDescription: v.optional(v.string()),
  tableClothColor: v.optional(v.string()),
  napkinStyle: v.optional(v.string()),
  centerpiece: v.optional(v.string()),
  ceremony_arch: v.optional(v.string()),
  aisle_decor: v.optional(v.string()),
  flowerTypes: v.optional(v.string()),
  flowerColors: v.optional(v.string()),
  bouquetStyle: v.optional(v.string()),
  boutonniere: v.optional(v.string()),
  flowerSupplier: v.optional(v.string()),
  flowerBudget: v.optional(v.string()),
  corsage: v.optional(v.string()),
  flowersNotes: v.optional(v.string()),
  guestTableType: v.optional(v.string()),
  guestTableCount: v.optional(v.string()),
  guestChairType: v.optional(v.string()),
  guestChairCount: v.optional(v.string()),
  sweetTableIncluded: v.optional(v.string()),
  sweetTableStyle: v.optional(v.string()),
  loungeIncluded: v.optional(v.string()),
  loungeDescription: v.optional(v.string()),
  signTable: v.optional(v.string()),
  furnitureSupplier: v.optional(v.string()),
  furnitureNotes: v.optional(v.string()),
  lightingType: v.optional(v.string()),
  lightingEffects: v.optional(v.string()),
  uplighting: v.optional(v.string()),
  stringLights: v.optional(v.string()),
  candleUse: v.optional(v.string()),
  lightingSupplier: v.optional(v.string()),
  lightingNotes: v.optional(v.string()),
  cakeSupplier: v.optional(v.string()),
  cakeFlavor: v.optional(v.string()),
  cakeLayers: v.optional(v.string()),
  cakeDesign: v.optional(v.string()),
  sweetsIncluded: v.optional(v.string()),
  sweetsDescription: v.optional(v.string()),
  weddingFavors: v.optional(v.string()),
  drinkService: v.optional(v.string()),
  cakeNotes: v.optional(v.string()),
  generalNotes: v.optional(v.string()),
  specialRequests: v.optional(v.string()),
  restrictions: v.optional(v.string()),
  vendorContacts: v.optional(v.string()),
  setupTime: v.optional(v.string()),
  teardownTime: v.optional(v.string()),
  parkingInfo: v.optional(v.string()),
  accessibilityNeeds: v.optional(v.string()),
  insuranceInfo: v.optional(v.string()),
  emergencyContact: v.optional(v.string()),
  otherNotes: v.optional(v.string()),
} as const;

export const getBriefing = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("briefings")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();
  },
});

export const upsertBriefing = mutation({
  args: { eventId: v.id("events"), ...briefingFields },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const { eventId, ...fields } = args;

    // Verify ownership
    const event = await ctx.db.get(eventId);
    if (!event || event.userId !== user._id) {
      throw new ConvexError({ message: "Evento não encontrado", code: "NOT_FOUND" });
    }

    const existing = await ctx.db
      .query("briefings")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("briefings", { eventId, userId: user._id, ...fields });
  },
});

// Mutation for AI to partially update briefing fields by key-value map (passed as JSON string)
export const upsertBriefingFields = mutation({
  args: {
    eventId: v.id("events"),
    fields: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Não autenticado", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "Usuário não encontrado", code: "NOT_FOUND" });

    const existing = await ctx.db
      .query("briefings")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();

    // Only keep known briefing field keys to avoid injecting arbitrary fields
    const allowedKeys = new Set([
      "guestCount","theme","ceremonyTime","receptionTime","venueContact","venueRules",
      "colorPalette","decorStyle","referenceImages","atmosphereDescription","tableClothColor",
      "napkinStyle","centerpiece","ceremony_arch","aisle_decor",
      "flowerTypes","flowerColors","bouquetStyle","boutonniere","flowerSupplier","flowerBudget",
      "corsage","flowersNotes","guestTableType","guestTableCount","guestChairType","guestChairCount",
      "sweetTableIncluded","sweetTableStyle","loungeIncluded","loungeDescription","signTable",
      "furnitureSupplier","furnitureNotes","lightingType","lightingEffects","uplighting","stringLights",
      "candleUse","lightingSupplier","lightingNotes","cakeSupplier","cakeFlavor","cakeLayers",
      "cakeDesign","sweetsIncluded","sweetsDescription","weddingFavors","drinkService","cakeNotes",
      "generalNotes","specialRequests","restrictions","vendorContacts","setupTime","teardownTime",
      "parkingInfo","accessibilityNeeds","insuranceInfo","emergencyContact","otherNotes",
    ]);
    const safeFields = Object.fromEntries(
      Object.entries(args.fields).filter(([k]) => allowedKeys.has(k)),
    );

    if (existing) {
      await ctx.db.patch(existing._id, safeFields);
    } else {
      await ctx.db.insert("briefings", { eventId: args.eventId, userId: user._id, ...safeFields });
    }
  },
});

// Checklist queries/mutations
export const getChecklist = query({
  args: { eventId: v.id("events"), phase: v.union(v.literal("pre"), v.literal("post")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("checklistItems")
      .withIndex("by_event_phase", (q) =>
        q.eq("eventId", args.eventId).eq("phase", args.phase),
      )
      .order("asc")
      .collect();
  },
});

export const addChecklistItem = mutation({
  args: {
    eventId: v.id("events"),
    phase: v.union(v.literal("pre"), v.literal("post")),
    name: v.string(),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.userId !== user._id) {
      throw new ConvexError({ message: "Evento não encontrado", code: "NOT_FOUND" });
    }
    // Auto-compute order if not provided
    let order = args.order;
    if (order === undefined) {
      const existing = await ctx.db
        .query("checklistItems")
        .withIndex("by_event_phase", (q) => q.eq("eventId", args.eventId).eq("phase", args.phase))
        .collect();
      order = existing.reduce((m, i) => Math.max(m, i.order), -1) + 1;
    }
    return await ctx.db.insert("checklistItems", {
      eventId: args.eventId,
      phase: args.phase,
      name: args.name,
      category: args.category,
      quantity: args.quantity,
      unit: args.unit,
      userId: user._id,
      isChecked: false,
      order,
    });
  },
});

export const toggleChecklistItem = mutation({
  args: { id: v.id("checklistItems"), isChecked: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.id, { isChecked: args.isChecked });
  },
});

export const updateChecklistItem = mutation({
  args: {
    id: v.id("checklistItems"),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

export const deleteChecklistItem = mutation({
  args: { id: v.id("checklistItems") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.id);
  },
});
