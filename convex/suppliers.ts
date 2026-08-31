import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireEventOwner, requireIdentity, requireUser } from "./lib/identity";
import { dedupKey, normalizeName, normalizePhone } from "./lib/supplierIdentity";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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

    // ── Todo fornecedor novo entra também no CATÁLOGO da empresa ────────────
    // É isto que faz a redigitação sumir da próxima vez: quem cadastra um
    // buffet hoje encontra esse buffet pronto no evento seguinte.
    //
    // Se já existir no catálogo com evidência forte (mesmo nome E mesmo
    // telefone — lib/supplierIdentity.ts), reaproveita em vez de duplicar. Sem
    // essa evidência, cria outro: duplicidade temporária é preferível a fundir
    // fornecedores diferentes, que seria irreversível.
    const supplierId = await ensureInCatalog(ctx, user._id, args);

    return ctx.db.insert("eventSuppliers", {
      userId: user._id,
      ...args,
      supplierId,
      order: maxOrder + 1,
    });
  },
});

/**
 * Encontra (ou cria) o fornecedor correspondente no catálogo da empresa.
 * Devolve sempre um id — o vínculo nunca fica sem catálogo daqui para frente.
 */
async function ensureInCatalog(
  ctx: MutationCtx,
  userId: Id<"users">,
  dados: {
    companyName: string;
    category: string;
    contactName?: string;
    phone?: string;
    email?: string;
    instagram?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    differentials?: string;
    commercialInfo?: string;
    bankInfo?: string;
    logoStorageId?: Id<"_storage">;
  },
): Promise<Id<"suppliers">> {
  const chave = dedupKey(dados.companyName, dados.phone);

  if (chave) {
    const candidatos = await ctx.db
      .query("suppliers")
      .withIndex("by_user_search", (q) =>
        q.eq("userId", userId).eq("searchName", normalizeName(dados.companyName)),
      )
      .collect();
    const igual = candidatos.find((c) => dedupKey(c.companyName, c.phone) === chave);
    if (igual) return igual._id;
  }

  const agora = new Date().toISOString();
  return ctx.db.insert("suppliers", {
    userId,
    companyName: dados.companyName,
    category: dados.category,
    contactName: dados.contactName,
    phone: dados.phone,
    email: dados.email,
    instagram: dados.instagram,
    website: dados.website,
    address: dados.address,
    city: dados.city,
    state: dados.state,
    differentials: dados.differentials,
    commercialInfo: dados.commercialInfo,
    bankInfo: dados.bankInfo,
    logoStorageId: dados.logoStorageId,
    searchName: normalizeName(dados.companyName),
    phoneDigits: normalizePhone(dados.phone) || undefined,
    createdAt: agora,
    updatedAt: agora,
  });
}

/**
 * Adiciona ao evento um fornecedor QUE JÁ EXISTE no catálogo da empresa.
 *
 * É o fim da redigitação: nome, categoria, contato e demais dados de perfil são
 * copiados do catálogo. O que é específico daquele casamento (status, valor,
 * observações operacionais, alinhamentos) continua nascendo vazio aqui, porque
 * pertence à relação fornecedor × evento — não ao fornecedor.
 *
 * A cópia dos dados de perfil é deliberada, não redundância acidental: ela
 * preserva o que valia NAQUELE evento e mantém o registro legível mesmo se o
 * fornecedor for arquivado depois. É o mesmo padrão de `assemblyItems.supplierName`.
 */
export const createFromCatalog = mutation({
  args: {
    eventId: v.id("events"),
    supplierId: v.id("suppliers"),
    /** Permite ajustar a categoria só neste evento, sem mexer no catálogo. */
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);

    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado no catálogo" });
    }

    // Já está neste evento? Não duplica — devolve o vínculo existente.
    const jaNoEvento = await ctx.db
      .query("eventSuppliers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const existente = jaNoEvento.find((v) => v.supplierId === args.supplierId);
    if (existente) return existente._id;

    const maxOrder = jaNoEvento.reduce((m, s) => Math.max(m, s.order ?? -1), -1);

    return ctx.db.insert("eventSuppliers", {
      userId: user._id,
      eventId: args.eventId,
      supplierId: args.supplierId,
      category: args.category ?? supplier.category,
      companyName: supplier.companyName,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      instagram: supplier.instagram,
      website: supplier.website,
      address: supplier.address,
      city: supplier.city,
      state: supplier.state,
      differentials: supplier.differentials,
      commercialInfo: supplier.commercialInfo,
      bankInfo: supplier.bankInfo,
      logoStorageId: supplier.logoStorageId,
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
