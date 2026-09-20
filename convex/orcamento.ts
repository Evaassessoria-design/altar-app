import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireUser } from "./lib/identity";
import { emCentavos, motivoDoValorInvalido, somaEmDinheiro } from "./lib/dinheiro";

export const listItems = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // Query de listagem: degrada para vazio (não lança) — preserva o
    // comportamento anterior quando o evento acabou de ser excluído.
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return [];
    return ctx.db
      .query("budgetItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === event.userId).sort((a, b) => a.order - b.order));
  },
});

/**
 * Recusa o número que não pode ser gravado, com o recado que a tela mostra.
 *
 * A tela mandava `parseFloat(campo)`, e `parseFloat` devolve `NaN` para o que
 * não começa com número. Um `NaN` num item do orçamento contamina o total
 * cotado, o comparativo com o real e a margem — todos de uma vez, e sem dizer
 * qual linha causou. Ver lib/dinheiro.ts.
 */
function exigirNumero(valor: number, campo: string) {
  const motivo = motivoDoValorInvalido(valor);
  if (motivo) throw new ConvexError({ code: "VALOR_INVALIDO", message: `${campo}: ${motivo}` });
}

export const getSummary = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { user, event } = await requireEventOwner(ctx, args.eventId);

    const budgetItems = await ctx.db
      .query("budgetItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === user._id));

    // `somaEmDinheiro` em vez de `reduce` cru: a sobra de ponto flutuante, e a
    // linha que já esteja com `NaN` gravado de antes — ela estragaria o
    // orçamento inteiro, e não só a própria linha.
    const cotado = (tipo: "income" | "expense") =>
      somaEmDinheiro(
        budgetItems.filter((i) => i.type === tipo).map((i) => emCentavos(i.quantity * i.unitPrice)),
      );
    const quotedIncome = cotado("income");
    const quotedExpense = cotado("expense");

    // Real costs from purchases
    const purchases = await ctx.db
      .query("purchaseItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === user._id));
    const realPurchases = somaEmDinheiro(
      purchases.map((p) => emCentavos((p.unitPrice ?? 0) * (p.quantity ?? 1))),
    );

    // Real financials from transactions
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()
      .then((items) => items.filter((i) => i.userId === user._id && i.isPaid));
    const realIncome = somaEmDinheiro(
      transactions.filter((t) => t.type === "income").map((t) => t.amount),
    );
    const realExpense = somaEmDinheiro(
      transactions.filter((t) => t.type === "expense").map((t) => t.amount),
    );

    const totalRealExpense = somaEmDinheiro([realExpense, realPurchases]);
    // `event.budget` vem de um formulário e pode estar podre de antes. Zero é
    // o que a tela já tratava como "não informado".
    const estimatedBudget = Number.isFinite(event.budget) ? (event.budget as number) : 0;
    const profit = emCentavos(realIncome - totalRealExpense);
    // A margem é percentual, não dinheiro: uma casa decimal basta, e sem
    // arredondar ela chegava à tela com dezesseis.
    const margin = realIncome > 0 ? Math.round((profit / realIncome) * 1000) / 10 : 0;

    return {
      estimatedBudget,
      quotedIncome,
      quotedExpense,
      quotedProfit: emCentavos(quotedIncome - quotedExpense),
      realIncome,
      realExpense: totalRealExpense,
      profit,
      margin,
      itemCount: budgetItems.length,
    };
  },
});

export const addItem = mutation({
  args: {
    eventId: v.id("events"),
    description: v.string(),
    category: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    type: v.union(v.literal("income"), v.literal("expense")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    exigirNumero(args.quantity, "Quantidade");
    exigirNumero(args.unitPrice, "Valor unitário");
    const items = await ctx.db
      .query("budgetItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const maxOrder = items.reduce((m, i) => Math.max(m, i.order), -1);
    return ctx.db.insert("budgetItems", { ...args, userId: user._id, order: maxOrder + 1 });
  },
});

export const updateItem = mutation({
  args: {
    id: v.id("budgetItems"),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unitPrice: v.optional(v.number()),
    type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    if (fields.quantity !== undefined) exigirNumero(fields.quantity, "Quantidade");
    if (fields.unitPrice !== undefined) exigirNumero(fields.unitPrice, "Valor unitário");
    await ctx.db.patch(id, fields);
  },
});

export const deleteItem = mutation({
  args: { id: v.id("budgetItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    await ctx.db.delete(args.id);
  },
});
