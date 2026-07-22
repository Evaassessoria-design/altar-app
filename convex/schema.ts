import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Enum-like validators (mirror the unions used in the function args/frontend) ──
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

const leadStage = v.union(
  v.literal("contact"),
  v.literal("quote_sent"),
  v.literal("contracted"),
  v.literal("discarded"),
);

const txType = v.union(v.literal("income"), v.literal("expense"));

const checklistPhase = v.union(v.literal("pre"), v.literal("post"));

const photoCategory = v.union(
  v.literal("antes"),
  v.literal("montagem"),
  v.literal("evento"),
  v.literal("desmontagem"),
);

// All briefing fields are optional free-text (kept in sync with convex/briefing.ts)
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

export default defineSchema({
  // Usuários — modelo por-usuário (Arquitetura A). Assinatura vive no próprio usuário.
  users: defineTable({
    name: v.string(),
    email: v.string(),
    tokenIdentifier: v.string(), // Vínculo com Hercules/OIDC Auth
    role: v.string(), // 'admin' | 'user'
    subscriptionStatus: v.string(), // 'trial' | 'active' | 'expired' | 'cancelled'
    trialStartDate: v.optional(v.string()),
    trialEndDate: v.optional(v.string()),
    onboardingCompleted: v.optional(v.boolean()),
    // Perfil / configurações
    phone: v.optional(v.string()),
    studioName: v.optional(v.string()),
    currency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    // Integração Asaas (assinatura)
    asaasCustomerId: v.optional(v.string()),
    asaasSubscriptionId: v.optional(v.string()),
    subscriptionExpiresAt: v.optional(v.string()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_asaas_customer", ["asaasCustomerId"])
    .index("by_asaas_subscription", ["asaasSubscriptionId"]),

  events: defineTable({
    userId: v.id("users"),
    name: v.string(),
    type: eventType,
    date: v.string(),
    location: v.string(),
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    budget: v.optional(v.number()),
    status: eventStatus,
    notes: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"]),

  leads: defineTable({
    userId: v.id("users"),
    clientName: v.string(),
    clientPhone: v.optional(v.string()),
    eventType: v.optional(v.string()),
    eventDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    stage: leadStage,
    notes: v.optional(v.string()),
    order: v.number(),
    convertedEventId: v.optional(v.id("events")),
  })
    .index("by_user", ["userId"])
    .index("by_user_stage", ["userId", "stage"]),

  briefings: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    ...briefingFields,
  }).index("by_event", ["eventId"]),

  checklistItems: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    phase: checklistPhase,
    name: v.string(),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    notes: v.optional(v.string()),
    order: v.number(),
    isChecked: v.boolean(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_phase", ["eventId", "phase"]),

  teamMembers: defineTable({
    userId: v.id("users"),
    name: v.string(),
    role: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  eventTeam: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    teamMemberId: v.id("teamMembers"),
    scheduledTime: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_member", ["eventId", "teamMemberId"]),

  contracts: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    filename: v.string(),
    uploadedAt: v.string(),
  }).index("by_event", ["eventId"]),

  purchaseItems: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    name: v.string(),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    supplier: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    notes: v.optional(v.string()),
    isPurchased: v.boolean(),
    order: v.number(),
  }).index("by_event", ["eventId"]),

  budgetItems: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    description: v.string(),
    category: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    type: txType,
    notes: v.optional(v.string()),
    order: v.number(),
  }).index("by_event", ["eventId"]),

  eventPhotos: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    filename: v.string(),
    category: photoCategory,
    caption: v.optional(v.string()),
    order: v.number(),
    uploadedAt: v.string(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_category", ["eventId", "category"]),

  transactions: defineTable({
    userId: v.id("users"),
    eventId: v.optional(v.id("events")),
    type: txType,
    category: v.string(),
    description: v.string(),
    amount: v.number(),
    date: v.string(),
    isPaid: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"])
    .index("by_event", ["eventId"]),

  notifications: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("event_soon"),
      v.literal("trial_expiring"),
      v.literal("purchase_pending"),
      v.literal("checklist_incomplete"),
    ),
    title: v.string(),
    body: v.string(),
    isRead: v.boolean(),
    relatedEventId: v.optional(v.id("events")),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "isRead"]),
});
