import { internalMutation, mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/identity";
import { dedupKey, normalizeName, normalizePhone } from "./lib/supplierIdentity";

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO CENTRAL DE FORNECEDORES — "este fornecedor pertence a esta empresa".
//
// Distinto de convex/suppliers.ts, que trata do vínculo "este fornecedor NESTE
// evento". A relação é: suppliers → eventSuppliers → events.
//
// REGRA FUNDAMENTAL desta rodada: excluir um evento apaga o VÍNCULO, nunca o
// fornecedor do catálogo. Um fornecedor é usado em vários eventos; apagá-lo
// junto com um deles destruiria dado de todos os outros. Ver lib/cascade.ts e o
// teste dedicado em lib/cascade.test.ts.
//
// Nada aqui remove campo antigo. `eventSuppliers` continua com todos os dados
// de perfil que já tinha, servindo de fallback para registros não vinculados e
// de histórico do que valia naquele evento.
// ─────────────────────────────────────────────────────────────────────────────

/** Campos de perfil que se repetem entre eventos — o que vale a pena reutilizar. */
const profileFields = {
  contactName: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  instagram: v.optional(v.string()),
  website: v.optional(v.string()),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  differentials: v.optional(v.string()),
  commercialInfo: v.optional(v.string()),
  bankInfo: v.optional(v.string()),
  notes: v.optional(v.string()),
  logoStorageId: v.optional(v.id("_storage")),
} as const;

// ─── Leitura ────────────────────────────────────────────────────────────────

/**
 * Catálogo da empresa. Fornecedores arquivados ficam de fora por padrão —
 * eles continuam nomeando os eventos passados, mas não poluem a escolha.
 */
export const list = query({
  args: {
    category: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const rows = args.category
      ? await ctx.db
          .query("suppliers")
          .withIndex("by_user_category", (q) =>
            q.eq("userId", user._id).eq("category", args.category!),
          )
          .collect()
      : await ctx.db
          .query("suppliers")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

    const visiveis = args.includeArchived
      ? rows
      : rows.filter((s) => s.archivedAt === undefined);

    return visiveis.sort((a, b) => a.companyName.localeCompare(b.companyName, "pt-BR"));
  },
});

export const get = query({
  args: { supplierId: v.id("suppliers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.userId !== user._id) return null;
    return supplier;
  },
});

/** Em quais eventos este fornecedor já foi usado. Usa o índice `by_supplier`. */
export const listEventsForSupplier = query({
  args: { supplierId: v.id("suppliers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.userId !== user._id) return [];

    const vinculos = await ctx.db
      .query("eventSuppliers")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
      .collect();

    const resultado = await Promise.all(
      vinculos
        .filter((v) => v.userId === user._id)
        .map(async (v) => {
          const event = await ctx.db.get(v.eventId);
          return event ? { eventId: event._id, name: event.name, date: event.date, status: v.status } : null;
        }),
    );
    return resultado.filter((r) => r !== null);
  },
});

// ─── Escrita ────────────────────────────────────────────────────────────────

/** Deriva os campos calculados. Um lugar só, para busca e dedup não divergirem. */
function derived(companyName: string, phone: string | undefined) {
  return {
    searchName: normalizeName(companyName),
    phoneDigits: normalizePhone(phone) || undefined,
  };
}

export const create = mutation({
  args: {
    companyName: v.string(),
    category: v.string(),
    ...profileFields,
  },
  handler: async (ctx, args): Promise<Id<"suppliers">> => {
    const user = await requireUser(ctx);
    const agora = new Date().toISOString();
    return ctx.db.insert("suppliers", {
      userId: user._id,
      ...args,
      ...derived(args.companyName, args.phone),
      createdAt: agora,
      updatedAt: agora,
    });
  },
});

export const update = mutation({
  args: {
    supplierId: v.id("suppliers"),
    companyName: v.optional(v.string()),
    category: v.optional(v.string()),
    favorite: v.optional(v.boolean()),
    ...profileFields,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
    }

    const { supplierId, ...campos } = args;
    const companyName = campos.companyName ?? supplier.companyName;
    const phone = campos.phone !== undefined ? campos.phone : supplier.phone;

    await ctx.db.patch(supplierId, {
      ...campos,
      ...derived(companyName, phone),
      updatedAt: new Date().toISOString(),
    });
  },
});

/**
 * Arquiva (ou desarquiva) um fornecedor.
 *
 * Não existe exclusão de fornecedor com histórico: os eventos passados
 * precisam continuar nomeando quem entregou o quê. Arquivar tira das listas de
 * escolha e preserva tudo. É a mesma lógica de preservar histórico usada no
 * resto do sistema.
 */
export const setArchived = mutation({
  args: { supplierId: v.id("suppliers"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
    }
    await ctx.db.patch(args.supplierId, {
      archivedAt: args.archived ? Date.now() : undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});

// ─── Backfill ───────────────────────────────────────────────────────────────

/**
 * Cria o catálogo a partir dos fornecedores já cadastrados nos eventos.
 *
 * IDEMPOTENTE: rodar de novo não duplica nada. Vínculos que já apontam para o
 * catálogo são pulados; fornecedores que já existem são reaproveitados.
 *
 * DEDUPLICAÇÃO CONSERVADORA (lib/supplierIdentity.ts): só funde quando nome
 * normalizado E telefone normalizado batem, e ambos existem. Sem telefone, cada
 * registro vira um fornecedor próprio — duplicidade temporária é preferível a
 * fundir duas empresas diferentes, o que seria irreversível.
 *
 * NÃO APAGA NADA. Só preenche `supplierId` nos vínculos e insere no catálogo.
 *
 * Interna de propósito: roda pelo painel do Convex, por quem opera o
 * deployment. Não é alcançável pelo aplicativo.
 *
 * Uso:  internal.supplierCatalog.backfillFromEventSuppliers  { }
 *       (opcional: { "userId": "..." } para processar uma empresa só)
 */
export const backfillFromEventSuppliers = internalMutation({
  args: { userId: v.optional(v.id("users")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const vinculos = args.userId
      ? await ctx.db
          .query("eventSuppliers")
          .filter((q) => q.eq(q.field("userId"), args.userId))
          .take(args.limit ?? 2000)
      : await ctx.db.query("eventSuppliers").take(args.limit ?? 2000);

    let jaVinculados = 0;
    let criados = 0;
    let reaproveitados = 0;
    let semNome = 0;

    // Cache por empresa: chave de dedup → id no catálogo. Evita reconsultar e
    // garante que dois vínculos idênticos no mesmo lote virem um fornecedor só.
    const cache = new Map<string, Id<"suppliers">>();

    for (const vinculo of vinculos) {
      if (vinculo.supplierId) {
        jaVinculados++;
        continue;
      }
      if (!vinculo.companyName?.trim()) {
        semNome++;
        continue;
      }

      const chave = dedupKey(vinculo.companyName, vinculo.phone);
      const chaveCache = chave ? `${vinculo.userId}|${chave}` : null;

      let supplierId: Id<"suppliers"> | undefined =
        chaveCache ? cache.get(chaveCache) : undefined;

      // Já existe no catálogo? Só reaproveita com evidência forte.
      if (!supplierId && chave) {
        const candidatos = await ctx.db
          .query("suppliers")
          .withIndex("by_user_search", (q) =>
            q.eq("userId", vinculo.userId).eq("searchName", normalizeName(vinculo.companyName)),
          )
          .collect();
        const igual = candidatos.find(
          (c) => dedupKey(c.companyName, c.phone) === chave,
        );
        if (igual) {
          supplierId = igual._id;
          reaproveitados++;
        }
      }

      if (!supplierId) {
        const agora = new Date().toISOString();
        supplierId = await ctx.db.insert("suppliers", {
          userId: vinculo.userId,
          companyName: vinculo.companyName,
          category: vinculo.category,
          contactName: vinculo.contactName,
          phone: vinculo.phone,
          email: vinculo.email,
          instagram: vinculo.instagram,
          website: vinculo.website,
          address: vinculo.address,
          city: vinculo.city,
          state: vinculo.state,
          differentials: vinculo.differentials,
          commercialInfo: vinculo.commercialInfo,
          bankInfo: vinculo.bankInfo,
          logoStorageId: vinculo.logoStorageId,
          favorite: vinculo.favorite,
          ...derived(vinculo.companyName, vinculo.phone),
          createdAt: agora,
          updatedAt: agora,
        });
        criados++;
      }

      if (chaveCache) cache.set(chaveCache, supplierId);

      // Único efeito no registro existente: preencher o vínculo. Nenhum campo
      // antigo é alterado ou removido.
      await ctx.db.patch(vinculo._id, { supplierId });
    }

    return {
      analisados: vinculos.length,
      jaVinculados,
      criados,
      reaproveitados,
      semNome,
    };
  },
});

/** Diagnóstico: quanto do catálogo já foi preenchido. Somente leitura. */
export const backfillStatus = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const vinculos = await ctx.db.query("eventSuppliers").take(5000);
    const catalogo = await ctx.db.query("suppliers").take(5000);
    return {
      vinculosTotal: vinculos.length,
      vinculosComCatalogo: vinculos.filter((v) => v.supplierId !== undefined).length,
      fornecedoresNoCatalogo: catalogo.length,
    };
  },
});
