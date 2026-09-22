import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireEventOwner, requireUser } from "./lib/identity";
import { emCentavos, motivoDoValorInvalido, somaEmDinheiro } from "./lib/dinheiro";
import { dinheiroVencido } from "./lib/dinheiroVencido";
import { dataDoDia } from "./lib/dataDoDia";
import { requireActiveAccess } from "./lib/accessGuard";
import { safeDeleteFile } from "./lib/cascade";
import { limparCampos } from "./lib/limparCampos";

const txType = v.union(v.literal("income"), v.literal("expense"));

/**
 * Teto de comprovantes por lançamento.
 *
 * Não é preocupação com o limite de 1 MiB da linha do Convex — dez anexos são
 * ~1,5 KB de metadado. É que um lançamento com trinta comprovantes é sinal de
 * que alguém está usando o campo para outra coisa, e a tela ficaria ilegível.
 */
export const LIMITE_DE_COMPROVANTES = 10;

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
    const hoje = dataDoDia();
    // O filtro é do BANCO, não da memória: varrer todo o histórico financeiro
    // — que cresce para sempre — a cada abertura do Dashboard, para achar um
    // punhado de linhas em aberto, é o tipo de consulta que só dói quando a
    // cliente já está grande. O índice lê o que está em aberto e vencido.
    //
    // A regra continua sendo de `lib/dinheiroVencido.ts`: ela refiltra o que
    // recebe, então a consulta pode estreitar sem virar a fonte da verdade.
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user_pago_data", (q) =>
        q.eq("userId", user._id).eq("isPaid", false).lt("date", hoje),
      )
      .collect();
    return dinheiroVencido(txs, hoje);
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

// ═════════════════════════════════════════════════════════════════════════════
// FECHAMENTO DO RECEBIMENTO E COMPROVANTES
//
// ── O PEDIDO ────────────────────────────────────────────────────────────────
// "Precisamos de um espaço para colocar os comprovantes no financeiro dos
// noivos." Quem pediu recebe em parcelas e precisa provar, meses depois, que
// a terceira entrou — para a cliente, para o contador, para si mesma.
//
// ── O QUE ISTO NÃO É ────────────────────────────────────────────────────────
// Não existe tabela de parcelas no ALTAR, e esta rodada não cria uma. Cada
// parcela JÁ É uma linha de `transactions` com `category: "Contrato"` —
// `createReceivablesFromContract` as cria assim desde a leitura do contrato
// por IA. Comprovante é um campo a mais na linha que já existe.
//
// ── A SEPARAÇÃO QUE NÃO PODE BORRAR ─────────────────────────────────────────
// ANEXAR COMPROVANTE NÃO MARCA COMO PAGO. São mutations diferentes porque são
// decisões diferentes: o comprovante é EVIDÊNCIA, o `isPaid` é a decisão dela.
// Acoplar as duas faria um anexo errado virar uma baixa errada — e baixa
// errada é dinheiro que o sistema afirma ter entrado.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O lançamento é meu?
 *
 * `NOT_FOUND`, nunca `FORBIDDEN`: lançamento de outra conta não existe, e a
 * resposta não pode revelar que existe. É o padrão do repositório inteiro.
 *
 * Recebe o `user` já resolvido em vez de chamar `requireUser` aqui dentro: a
 * trava de `tenant.isolation.test.ts` lê o CORPO de cada função pública
 * procurando o nome do guarda, e guarda escondido dentro de helper não é
 * auditável de fora. O teste estava certo — esta forma é a que ele pede.
 */
async function meuLancamento(
  ctx: MutationCtx,
  user: { _id: Id<"users"> },
  id: Id<"transactions">,
) {
  const tx = await ctx.db.get(id);
  if (!tx || tx.userId !== user._id) {
    throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
  }
  return tx;
}

/**
 * Autorização de upload de comprovante.
 *
 * Exige ACESSO ATIVO, como todo upload do ALTAR (`lib/accessGuard.ts`):
 * storage é cobrado, e conta bloqueada não sobe arquivo novo. Ler e baixar o
 * que já existe continua liberado — é o caminho de volta.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireActiveAccess(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * O fechamento do recebimento: quando entrou, como entrou, e a observação.
 *
 * Separada de `updateTransaction` porque responde outra pergunta — aquela
 * edita o lançamento (valor, vencimento, categoria), esta registra o que
 * aconteceu com o dinheiro. `null` limpa, pela convenção de `limparCampos`.
 *
 * `isPaid` é opcional aqui: dá para anotar a forma de pagamento sem dar baixa,
 * e dá para dar baixa sem informar mais nada.
 */
export const registrarPagamento = mutation({
  args: {
    id: v.id("transactions"),
    isPaid: v.optional(v.boolean()),
    paidAt: v.optional(v.union(v.string(), v.null())),
    paymentMethod: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await meuLancamento(ctx, user, args.id);
    const { id, ...campos } = args;
    const limpo = limparCampos({
      ...campos,
      paidAt: typeof campos.paidAt === "string" ? campos.paidAt.trim() || null : campos.paidAt,
      paymentMethod:
        typeof campos.paymentMethod === "string"
          ? campos.paymentMethod.trim() || null
          : campos.paymentMethod,
      notes: typeof campos.notes === "string" ? campos.notes.trim() || null : campos.notes,
    });
    await ctx.db.patch(id, limpo);
  },
});

/**
 * Anexa um comprovante. NÃO toca em `isPaid` — ver o cabeçalho acima.
 *
 * O arquivo já está no storage quando chega aqui; o que esta mutation faz é
 * DIZER que ele pertence a este lançamento. Um `storageId` vindo do navegador
 * não prova posse de nada (o Convex não escopa storage por conta), e é por
 * isso que a única proteção real é esta: só o dono do lançamento grava nele, e
 * o comprovante não tem id próprio que alguém pudesse endereçar de fora.
 */
export const anexarComprovante = mutation({
  args: {
    id: v.id("transactions"),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await meuLancamento(ctx, user, args.id);

    const atuais = tx.comprovantes ?? [];
    // Mesmo arquivo anexado duas vezes (toque repetido, reenvio) não vira duas
    // linhas na lista.
    if (atuais.some((c) => c.storageId === args.storageId)) {
      return { total: atuais.length };
    }
    if (atuais.length >= LIMITE_DE_COMPROVANTES) {
      throw new ConvexError({
        code: "LIMITE",
        message: `Um lançamento aceita até ${LIMITE_DE_COMPROVANTES} comprovantes.`,
      });
    }

    await ctx.db.patch(args.id, {
      comprovantes: [
        ...atuais,
        {
          storageId: args.storageId,
          filename: args.filename.trim() || "comprovante",
          contentType: args.contentType?.trim() || undefined,
          uploadedAt: new Date().toISOString(),
        },
      ],
    });
    return { total: atuais.length + 1 };
  },
});

/**
 * Remove UM comprovante, pelo arquivo.
 *
 * O arquivo sai com `safeDeleteFile`: o Convex LANÇA ao apagar arquivo
 * inexistente, e uma mutation que lança aborta inteira — o comprovante
 * continuaria listado, apontando para nada, e sem jeito de tirar da lista.
 * É o mesmo defeito que a auditoria do pipeline de arquivos fechou.
 */
export const removerComprovante = mutation({
  args: { id: v.id("transactions"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await meuLancamento(ctx, user, args.id);
    const atuais = tx.comprovantes ?? [];
    // Só apaga o arquivo se ele for DESTE lançamento. Sem esta conferência,
    // um storageId qualquer vindo do navegador viraria uma exclusão de arquivo
    // — inclusive de arquivo que não é dela.
    if (!atuais.some((c) => c.storageId === args.storageId)) {
      throw new ConvexError({ message: "Comprovante não encontrado", code: "NOT_FOUND" });
    }

    await safeDeleteFile(ctx, args.storageId);
    await ctx.db.patch(args.id, {
      comprovantes: atuais.filter((c) => c.storageId !== args.storageId),
    });
  },
});

/**
 * Os comprovantes de UM lançamento, com URL para abrir e baixar.
 *
 * Query separada, e não campo da listagem: resolver URL de todo comprovante de
 * toda linha do Financeiro seria uma chamada de storage por anexo em cada
 * abertura da tela. A LISTA só precisa saber QUANTOS existem, e isso já está
 * na própria linha.
 */
export const comprovantesDoLancamento = query({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    // Degrada para vazio: listagem não lança, é o padrão do Bloco 0.
    if (!tx || tx.userId !== user._id) return [];

    return Promise.all(
      (tx.comprovantes ?? []).map(async (c) => ({
        ...c,
        url: await ctx.storage.getUrl(c.storageId),
      })),
    );
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

    // Os comprovantes são arquivos DESTE lançamento e não sobrevivem a ele:
    // deixá-los seria storage órfão cobrado para sempre. `safeDeleteFile`
    // porque arquivo que já sumiu não pode impedir a exclusão da linha.
    for (const c of tx.comprovantes ?? []) await safeDeleteFile(ctx, c.storageId);

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
