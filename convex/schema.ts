import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Módulo de Organizações (Multi-tenancy correto)
  organizations: defineTable({
    name: v.string(),
    ownerId: v.string(), // ID do usuário dono da empresa
  }),

  // Tabela unificada de planos
  plans: defineTable({
    name: v.string(),
    price: v.number(), // Preço em centavos (Ex: 7990 para R$ 79,90)
  }),

  // Fonte única de verdade das assinaturas
  subscriptions: defineTable({
    organizationId: v.id("organizations"),
    asaasCustomerId: v.string(), // ID do cliente gerado no Asaas
    status: v.string(), // 'ACTIVE', 'PAST_DUE', 'CANCELED'
    planId: v.id("plans"),
    expiresAt: v.number(), // Timestamp Unix de expiração
  })
    .index("by_organization", ["organizationId"])
    .index("by_customer", ["asaasCustomerId"]),

  // Usuários do sistema (Sem o status legado duplicado)
  users: defineTable({
    name: v.string(),
    email: v.string(),
    tokenIdentifier: v.string(), // Vinculação com Hercules/OIDC Auth
    organizationId: v.id("organizations"),
  }).index("by_token", ["tokenIdentifier"]),

  // O Coração do App: Eventos associados estritamente à Organização (Empresa)
  events: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    location: v.string(),
    date: v.string(),
    status: v.string(), // 'lead', 'confirmed', 'completed'
    budget: v.number(), // Centavos
    style: v.optional(v.string()),
  }).index("by_organization", ["organizationId"]),

  // Trava de Idempotência: Grava transações processadas para evitar duplicidade de Pix
  transactions: defineTable({
    asaasPaymentId: v.string(), // ID único da cobrança recebido do Asaas
    organizationId: v.id("organizations"),
    value: v.number(), // Em centavos
    status: v.string(), // 'CONFIRMED', 'PENDING'
    processedAt: v.number(),
  }).index("by_asaas_id", ["asaasPaymentId"]),

  // Demais tabelas do ecossistema Altar mapeadas na auditoria
  briefings: defineTable({
    eventId: v.id("events"),
    content: v.string(),
    status: v.string(),
  }).index("by_event", ["eventId"]),

  checklistItems: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    category: v.string(),
    quantity: v.number(),
    isLoaded: v.boolean(),
  }).index("by_event", ["eventId"]),

  teamMembers: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    role: v.string(),
    whatsapp: v.string(),
  }).index("by_organization", ["organizationId"]),

  eventTeam: defineTable({
    eventId: v.id("events"),
    memberId: v.id("teamMembers"),
    status: v.string(),
  }).index("by_event", ["eventId"]),

  contracts: defineTable({
    eventId: v.id("events"),
    storageId: v.string(),
    status: v.string(),
    extractedData: v.optional(v.string()),
  }).index("by_event", ["eventId"]),

  leads: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    status: v.string(),
    value: v.number(),
  }).index("by_organization", ["organizationId"]),

  purchaseItems: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    price: v.number(),
  }).index("by_event", ["eventId"]),

  budgetItems: defineTable({
    eventId: v.id("events"),
    category: v.string(),
    allocated: v.number(),
  }).index("by_event", ["eventId"]),

  eventPhotos: defineTable({
    eventId: v.id("events"),
    storageId: v.string(),
    category: v.string(),
  }).index("by_event", ["eventId"]),

  notifications: defineTable({
    userId: v.id("users"),
    title: v.string(),
    message: v.string(),
    isRead: v.boolean(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
