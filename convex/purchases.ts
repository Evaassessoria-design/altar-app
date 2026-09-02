import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireTeamMember, requireUser } from "./lib/identity";
import {
  effectivePurchaseStatus,
  isPurchasedForStatus,
  type PurchaseStatus,
} from "./lib/purchaseStatus";
import { limparCampos } from "./lib/limparCampos";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import { valorDaCompra } from "./lib/custoDoEvento";

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

/**
 * PANORAMA — todas as compras da empresa, com o evento de cada uma.
 *
 * A tela de Compras é organizada por evento e responde "o que falta neste
 * casamento?". Esta consulta responde a outra pergunta, a de segunda-feira:
 * "o que eu preciso resolver esta semana, em TODOS os eventos?". Antes só dava
 * para respondê-la abrindo evento por evento e somando de cabeça — uma compra
 * atrasada de um evento distante ficava escondida atrás de um acordeão fechado.
 *
 * Devolve o item CRU mais o mínimo do evento (nome, data, situação). O
 * julgamento — o que é urgente, o que está fora do livro — mora em
 * lib/panoramaDeCompras.ts, puro e testado; aqui só se lê o banco.
 *
 * Eventos cancelados ficam de fora: comprar para um evento cancelado não é
 * pendência de ninguém. Concluídos entram, porque uma compra atrasada de
 * evento que já aconteceu ainda pode ter conta a pagar.
 */
export const listPanorama = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const [compras, eventos] = await Promise.all([
      ctx.db
        .query("purchaseItems")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("events")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    const porId = new Map(eventos.map((e) => [e._id, e]));

    return compras.flatMap((item) => {
      const evento = porId.get(item.eventId);
      // Compra órfã (evento apagado fora da cascata) não vira linha fantasma
      // sem nome na tela — some, como já sumiu do resto do app.
      if (!evento || evento.status === "cancelled") return [];
      return [
        {
          ...item,
          eventName: evento.name,
          eventDate: evento.date,
          eventStatus: evento.status,
        },
      ];
    });
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
    /** Vínculo com a equipe. O texto acima continua valendo como anotação. */
    responsibleId: v.optional(v.id("teamMembers")),
    supplierId: v.optional(v.id("suppliers")),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    await requireTeamMember(ctx, user._id, args.responsibleId);
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

/**
 * Lança (ou reajusta) o custo desta compra no livro-caixa.
 *
 * ── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────
 * É esta função que impede a mesma despesa de contar duas vezes. Se a compra
 * já tem `transactionId` e o lançamento ainda existe, ela ATUALIZA aquele
 * registro. Só cria um novo quando não há nenhum — ou quando o antigo foi
 * apagado à mão no Financeiro, caso em que o ponteiro está velho.
 *
 * Chamar dez vezes seguidas produz UM lançamento, com o valor atual.
 *
 * ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
 * Não decide se a compra foi paga. `isPaid` do lançamento espelha a situação
 * operacional (recebido = pago), mas a decoradora continua dona do Financeiro:
 * se ela marcar o lançamento como pago lá, nada aqui desfaz isso — só um novo
 * lançamento da mesma compra reajusta, e aí é escolha dela.
 */
export const registerCost = mutation({
  args: { id: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });

    const status = effectivePurchaseStatus(item);
    if (status === "cancelado") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Compra cancelada não vira custo. Nada foi lançado.",
      });
    }

    const valor = valorDaCompra(item);
    if (valor <= 0) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Informe o preço da compra antes de lançar no financeiro.",
      });
    }

    // A data do lançamento é o vencimento quando existe — é a data que a
    // decoradora combinou com o fornecedor. Sem ela, hoje.
    const hoje = new Date();
    const data =
      item.dueDate?.trim() ||
      `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

    const campos = {
      type: "expense" as const,
      category: item.category?.trim() || "Compras",
      description: item.supplier?.trim()
        ? `${item.name} — ${item.supplier.trim()}`
        : item.name,
      amount: valor,
      date: data,
      // "Recebido" é o único estado em que a mercadoria chegou. Antes disso a
      // despesa existe mas não está liquidada.
      isPaid: status === "recebido",
      eventId: item.eventId,
    };

    // Reaproveita o lançamento existente — este `if` é a idempotência.
    if (item.transactionId) {
      const existente = await ctx.db.get(item.transactionId);
      if (existente && existente.userId === user._id) {
        await ctx.db.patch(item.transactionId, campos);
        return { transactionId: item.transactionId, criado: false };
      }
    }

    const transactionId = await ctx.db.insert("transactions", {
      userId: user._id,
      ...campos,
    });
    await ctx.db.patch(args.id, { transactionId });
    return { transactionId, criado: true };
  },
});

/**
 * Desfaz o vínculo e apaga o lançamento que nasceu desta compra.
 *
 * Só apaga o lançamento que ELA gerou — nunca um que a decoradora tenha
 * criado à mão no Financeiro. Idempotente: sem vínculo, não faz nada.
 */
export const unregisterCost = mutation({
  args: { id: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });

    if (!item.transactionId) return { removido: false };

    const lancamento = await ctx.db.get(item.transactionId);
    if (lancamento && lancamento.userId === user._id) {
      await ctx.db.delete(item.transactionId);
    }
    await ctx.db.patch(args.id, { transactionId: undefined });
    return { removido: true };
  },
});

export const updatePurchase = mutation({
  args: {
    id: v.id("purchaseItems"),
    name: v.optional(v.string()),
    // O formulário de edição é um formulário COMPLETO: o que a decoradora
    // apagou lá precisa sumir aqui. `null` = limpar (convex/lib/limparCampos.ts).
    category: v.optional(v.union(v.string(), v.null())),
    quantity: v.optional(v.union(v.number(), v.null())),
    unit: v.optional(v.union(v.string(), v.null())),
    supplier: v.optional(v.union(v.string(), v.null())),
    unitPrice: v.optional(v.union(v.number(), v.null())),
    isPurchased: v.optional(v.boolean()),
    notes: v.optional(v.union(v.string(), v.null())),
    status: v.optional(purchaseStatus),
    responsible: v.optional(v.union(v.string(), v.null())),
    responsibleId: v.optional(v.union(v.id("teamMembers"), v.null())),
    supplierId: v.optional(v.union(v.id("suppliers"), v.null())),
    dueDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    await requireTeamMember(ctx, user._id, args.responsibleId);
    if (args.supplierId) {
      const supplier = await ctx.db.get(args.supplierId);
      if (!supplier || supplier.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
      }
    }
    const { id, ...fields } = args;
    const limpos = limparCampos(fields);
    // Mudar a situação reajusta `isPurchased` junto. Sem isso, um item
    // "recebido" poderia continuar contando como pendente no Resumo
    // Operacional, e as duas telas se contradiriam.
    const patch = args.status
      ? { ...limpos, isPurchased: isPurchasedForStatus(args.status) }
      : limpos;
    await ctx.db.patch(id, comCarimbo(patch));
  },
});

export const togglePurchase = mutation({
  args: { id: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, comCarimbo({ isPurchased: !item.isPurchased }));
  },
});

export const deletePurchase = mutation({
  args: { id: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });

    // ── A DESPESA QUE ESTA COMPRA GEROU SAI JUNTO ────────────────────────────
    // Antes, apagar a compra deixava a despesa órfã no Financeiro: a linha
    // "Rosas — R$ 400" sumia de Compras e os R$ 400 continuavam pesando na
    // margem para sempre, sem nada que os ligasse de volta a coisa alguma.
    //
    // Só o lançamento que ELA gerou (o do vínculo) — nunca um que a
    // decoradora tenha criado à mão. É a mesma regra de `unregisterCost`.
    if (item.transactionId) {
      const lancamento = await ctx.db.get(item.transactionId);
      if (lancamento && lancamento.userId === user._id) {
        await ctx.db.delete(item.transactionId);
      }
    }
    await ctx.db.delete(args.id);
    return { lancamentoRemovido: Boolean(item.transactionId) };
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
    await ctx.db.patch(
      args.id,
      comCarimbo({ status: args.status, isPurchased: isPurchasedForStatus(args.status) }),
    );
  },
});
