import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireUser } from "./lib/identity";
import {
  effectivePurchaseStatus,
  isPurchasedForStatus,
  type PurchaseStatus,
} from "./lib/purchaseStatus";

/** Validador reutilizado por `addPurchase`, `updatePurchase` e `setStatus`. */
const purchaseStatus = v.union(
  v.literal("necessidade"),
  v.literal("cotacao"),
  v.literal("aprovado"),
  v.literal("comprado"),
  v.literal("recebido"),
  v.literal("cancelado"),
);

export const listPurchases = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // Query de listagem: degrada para vazio (não lança) — ver orcamento.listItems.
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return [];
    return ctx.db
      .query("purchaseItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === event.userId));
  },
});

export const addPurchase = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    supplier: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(purchaseStatus),
    responsible: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    // Fornecedor do catálogo tem que ser da MESMA empresa — senão daria para
    // pendurar o fornecedor de outra decoradora num item seu.
    if (args.supplierId) {
      const supplier = await ctx.db.get(args.supplierId);
      if (!supplier || supplier.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
      }
    }
    // Get max order
    const items = await ctx.db
      .query("purchaseItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const maxOrder = items.reduce((m, i) => Math.max(m, i.order), -1);
    const status: PurchaseStatus = args.status ?? "necessidade";
    return ctx.db.insert("purchaseItems", {
      ...args,
      status,
      userId: user._id,
      // Coerência desde o cadastro: as duas informações nunca divergem.
      isPurchased: isPurchasedForStatus(status),
      order: maxOrder + 1,
    });
  },
});

export const updatePurchase = mutation({
  args: {
    id: v.id("purchaseItems"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    supplier: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    isPurchased: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    status: v.optional(purchaseStatus),
    responsible: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    if (args.supplierId) {
      const supplier = await ctx.db.get(args.supplierId);
      if (!supplier || supplier.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
      }
    }
    const { id, ...fields } = args;
    // Mudar a situação reajusta `isPurchased` junto. Sem isso, um item
    // "recebido" poderia continuar contando como pendente no Resumo
    // Operacional, e as duas telas se contradiriam.
    const patch = args.status
      ? { ...fields, isPurchased: isPurchasedForStatus(args.status) }
      : fields;
    await ctx.db.patch(id, patch);
  },
});

export const togglePurchase = mutation({
  args: { id: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { isPurchased: !item.isPurchased });
  },
});

export const deletePurchase = mutation({
  args: { id: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});

/**
 * Avança a situação operacional de um item.
 *
 * Atalho de UMA ação para a tela — mudar a situação é o gesto mais frequente
 * na lista de compras, e passar por `updatePurchase` exigiria montar o objeto
 * inteiro.
 *
 * NÃO toca em pagamento: `transactions.isPaid` é outro assunto, e é lá que o
 * dinheiro vive.
 */
export const setPurchaseStatus = mutation({
  args: { id: v.id("purchaseItems"), status: purchaseStatus },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.id, {
      status: args.status,
      isPurchased: isPurchasedForStatus(args.status),
    });
  },
});

/**
 * Compras do usuário inteiro, com a situação já resolvida e o evento anexado.
 *
 * Serve à tela /compras, que hoje precisa cruzar evento por evento para saber
 * o que está pendente. `status` ausente vem derivado de `isPurchased`, então
 * item antigo aparece corretamente sem nenhum backfill.
 */
export const listAllPurchases = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const itens = await ctx.db
      .query("purchaseItems")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return Promise.all(
      itens.map(async (i) => {
        const event = await ctx.db.get(i.eventId);
        const supplier = i.supplierId ? await ctx.db.get(i.supplierId) : null;
        return {
          ...i,
          status: effectivePurchaseStatus(i),
          eventName: event?.name ?? null,
          eventDate: event?.date ?? null,
          // Nome do catálogo quando houver vínculo; senão o texto histórico.
          supplierName: supplier?.companyName ?? i.supplier ?? null,
        };
      }),
    );
  },
});
