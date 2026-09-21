import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireEventOwner, requireUser } from "./lib/identity";
import { emCentavos, motivoDoValorInvalido, somaEmDinheiro } from "./lib/dinheiro";
import { dinheiroVencido } from "./lib/dinheiroVencido";
import { dataDoDia } from "./lib/dataDoDia";

const txType = v.union(v.literal("income"), v.literal("expense"));

/** Recusa o valor que não pode ser gravado, com o recado que a tela mostra. */
function exigirValor(valor: number) {
  const motivo = motivoDoValorInvalido(valor);
  if (motivo) throw new ConvexError({ code: "VALOR_INVALIDO", message: motivo });
}

export const listTransactions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const items = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return items.sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // `somaEmDinheiro` em vez de `reduce` cru por dois motivos: a sobra de
    // ponto flutuante (0.1 + 0.2), e o lançamento antigo que já esteja com
    // `NaN` gravado — ele estragaria TODAS as somas desta tela, e não só a
    // própria linha. Ver lib/dinheiro.ts.
    const soma = (filtro: (t: (typeof txs)[number]) => boolean) =>
      somaEmDinheiro(txs.filter(filtro).map((t) => t.amount));

    const totalIncome = soma((t) => t.type === "income" && t.isPaid);
    const totalExpense = soma((t) => t.type === "expense" && t.isPaid);
    const pendingIncome = soma((t) => t.type === "income" && !t.isPaid);

    // Last 6 months breakdown (paid only)
    const now = new Date();
    const months: { label: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.toISOString().slice(0, 10);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);
      const label = d.toLocaleString("pt-BR", { month: "short" });
      const inMonth = txs.filter((t) => t.isPaid && t.date >= start && t.date <= end);
      months.push({
        label,
        income: somaEmDinheiro(
          inMonth.filter((t) => t.type === "income").map((t) => t.amount),
        ),
        expense: somaEmDinheiro(
          inMonth.filter((t) => t.type === "expense").map((t) => t.amount),
        ),
      });
    }

    return {
      totalIncome,
      totalExpense,
      profit: emCentavos(totalIncome - totalExpense),
      pendingIncome,
      months,
    };
  },
});

/**
 * O que venceu e não foi liquidado — para o painel da manhã.
 *
 * Separada de `getSummary` de propósito: aquele resumo alimenta a TELA do
 * Financeiro e carrega seis meses de histórico; esta responde a uma pergunta
 * só, e é lida no Dashboard toda vez que ele abre.
 *
 * As regras vivem em lib/dinheiroVencido.ts, puras e testadas.
 */
export const getVencidos = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return dinheiroVencido(txs, dataDoDia());
  },
});

export const addTransaction = mutation({
  args: {
    type: txType,
    category: v.string(),
    description: v.string(),
    amount: v.number(),
    date: v.string(),
    isPaid: v.boolean(),
    notes: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    // `eventId` é opcional (lançamento avulso). Quando vier, tem que ser de um
    // evento do próprio usuário.
    const user = args.eventId
      ? (await requireEventOwner(ctx, args.eventId)).user
      : await requireUser(ctx);
    // A tela manda `parseFloat(campo)`, e `parseFloat` devolve `NaN` para
    // qualquer coisa que não comece com número. Um `NaN` gravado aqui não
    // estraga a própria linha: estraga toda soma do Financeiro, para sempre.
    exigirValor(args.amount);
    return ctx.db.insert("transactions", {
      userId: user._id,
      ...args,
      amount: emCentavos(args.amount),
    });
  },
});

export const updateTransaction = mutation({
  args: {
    id: v.id("transactions"),
    type: v.optional(txType),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    date: v.optional(v.string()),
    isPaid: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    if (fields.amount !== undefined) {
      exigirValor(fields.amount);
      fields.amount = emCentavos(fields.amount);
    }
    await ctx.db.patch(id, fields);
  },
});

export const togglePaid = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { isPaid: !tx.isPaid });
  },
});

export const deleteTransaction = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });

    // ── O VÍNCULO NÃO PODE APONTAR PARA O VAZIO ─────────────────────────────
    // Uma compra pode ter gerado este lançamento (`purchaseItems.transactionId`).
    // Apagando só a linha daqui, a compra continuava "lançada" para todos os
    // efeitos — e como `custoDoEvento` só olhava a EXISTÊNCIA do vínculo, o
    // custo sumia do livro e a margem saía afirmada, com confiança, sobre um
    // custo menor do que o real.
    //
    // A compra NÃO é apagada: a decisão de apagar a despesa é do Financeiro,
    // a compra continua sendo trabalho a fazer. Ela só volta a contar como
    // "fora do financeiro", que é a verdade.
    const vinculadas = await ctx.db
      .query("purchaseItems")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.id))
      .collect();
    for (const compra of vinculadas) {
      if (compra.userId !== user._id) continue;
      await ctx.db.patch(compra._id, { transactionId: undefined });
    }

    await ctx.db.delete(args.id);
    return { vinculosLimpos: vinculadas.length };
  },
});

// ── Contrato → contas a receber ──────────────────────────────────────────────
// Estrutura para abastecer o financeiro a partir do contrato: recebe as parcelas
// JÁ CONFIRMADAS pela decoradora e cria lançamentos de receita (isPaid=false).
// Reutiliza a tabela `transactions` existente — sem estrutura financeira nova.
// NÃO é chamado por IA automaticamente: só após confirmação explícita na UI.
export const createReceivablesFromContract = mutation({
  args: {
    eventId: v.id("events"),
    entries: v.array(
      v.object({
        description: v.string(),
        amount: v.number(),
        date: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    // Dedup: se já existem contas a receber do Contrato neste evento, não recria.
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const alreadyHasContract = existing.some(
      (t) => t.type === "income" && t.category === "Contrato",
    );
    if (alreadyHasContract) {
      return { created: 0, alreadyExists: true };
    }
    // Confere TODAS as parcelas antes de gravar a primeira: metade das contas
    // a receber criadas e a outra metade recusada deixaria o evento num estado
    // que ninguém pediu, e a dedup acima impediria a segunda tentativa.
    for (const e of args.entries) exigirValor(e.amount);

    let created = 0;
    for (const e of args.entries) {
      await ctx.db.insert("transactions", {
        userId: user._id,
        eventId: args.eventId,
        type: "income",
        category: "Contrato",
        description: e.description,
        amount: emCentavos(e.amount),
        date: e.date,
        isPaid: false,
      });
      created++;
    }
    return { created, alreadyExists: false };
  },
});
