import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireTeamMember, requireUser } from "./lib/identity";
import {
  effectivePurchaseStatus,
  isPurchasedForStatus,
  type PurchaseStatus,
} from "./lib/purchaseStatus";
import { limparCampos } from "./lib/limparCampos";
import { emCentavos, motivoDoValorInvalido } from "./lib/dinheiro";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import { safeDeleteFile } from "./lib/cascade";
import { dataDoDia } from "./lib/dataDoDia";
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

/**
 * O que fazer com a despesa quando a compra sai de cena.
 *
 *   manter  → a despesa continua existindo SOZINHA, sem vínculo. O dinheiro
 *             saiu; o registro dele não pode sumir porque a compra mudou de
 *             ideia. É o que preserva pagamento e comprovante.
 *   remover → a despesa é apagada, com os comprovantes dela. Só faz sentido
 *             quando nada foi movimentado.
 */
const decisaoSobreADespesa = v.union(v.literal("manter"), v.literal("remover"));

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

/**
 * Recusa quantidade ou preço que não podem ser gravados.
 *
 * A tela mandava `parseFloat(campo)`, e `parseFloat` devolve `NaN` para o que
 * não começa com número. Um `NaN` aqui vai para o custo do evento e para a
 * margem — e contamina as duas somas inteiras, não só a própria linha. Ver
 * lib/dinheiro.ts.
 */
function exigirNumeroDaCompra(valor: number | null | undefined, campo: string) {
  if (valor === null || valor === undefined) return;
  const motivo = motivoDoValorInvalido(valor);
  if (motivo) throw new ConvexError({ code: "VALOR_INVALIDO", message: `${campo}: ${motivo}` });
}

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
    exigirNumeroDaCompra(args.quantity, "Quantidade");
    exigirNumeroDaCompra(args.unitPrice, "Preço unitário");
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
      quantity: args.quantity === undefined ? undefined : emCentavos(args.quantity),
      unitPrice: args.unitPrice === undefined ? undefined : emCentavos(args.unitPrice),
      status,
      userId: user._id,
      // Coerência desde o cadastro: as duas informações nunca divergem.
      isPurchased: isPurchasedForStatus(status),
      order: maxOrder + 1,
    });
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// O QUE A COMPRA MANDA NO LANÇAMENTO, E O QUE ELA NÃO ENCOSTA
//
// ── A DIVISÃO ───────────────────────────────────────────────────────────────
// Da COMPRA vêm: quanto, de quem, de que categoria e para quando. São dados
// operacionais — corrigir o preço de uma compra tem de chegar ao livro, senão
// a margem do evento sai afirmada sobre um número velho.
//
// Do PAGAMENTO vêm: `isPaid`, `paidAt`, `paymentMethod`, `notes` e os
// `comprovantes`. Esses são decisão dela, tomada no Financeiro, e NADA que
// acontece em Compras pode sobrescrevê-los.
//
// A divisão não é estética. Antes, `registerCost` reaplicava `isPaid` no
// `patch` — então corrigir o preço de uma compra já paga DESMARCAVA o
// pagamento dela. Silenciosamente.
// ═════════════════════════════════════════════════════════════════════════════

/** Os campos que a COMPRA dita. Nenhum deles é do pagamento. */
function camposDaCompra(item: Doc<"purchaseItems">) {
  return {
    type: "expense" as const,
    category: item.category?.trim() || "Compras",
    description: item.supplier?.trim()
      ? `${item.name} — ${item.supplier.trim()}`
      : item.name,
    amount: valorDaCompra(item),
    // O vencimento combinado com o fornecedor. Sem ele, hoje.
    date: item.dueDate?.trim() || dataDoDia(),
    eventId: item.eventId,
  };
}

/**
 * A despesa segue a compra — se já existir uma.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 * Ela corrigia o preço de R$ 400 para R$ 450, via o número novo na tela, e o
 * livro continuava com 400. O sistema até DETECTAVA (`valorDivergente`, em
 * lib/custoDoEvento.ts) — e a correção era ela clicar de novo em um botão
 * cuja existência ninguém explica. Agora a correção chega sozinha.
 *
 * ── O QUE ELA NUNCA FAZ ─────────────────────────────────────────────────────
 * NÃO CRIA lançamento. Sem `transactionId`, editar uma compra continua não
 * pondo nada no livro — quem decide que a despesa existe é `registerCost`.
 *
 * NÃO RECRIA vínculo quebrado. Se o ponteiro aponta para um lançamento que a
 * decoradora apagou no Financeiro, ela apagou de propósito; ressuscitar seria
 * desfazer a decisão dela sem avisar. O painel continua mostrando o vínculo
 * quebrado, que é a verdade.
 *
 * NÃO ENCOSTA NO PAGAMENTO. Ver o cabeçalho acima.
 */
async function sincronizarLancamento(
  ctx: MutationCtx,
  item: Doc<"purchaseItems">,
): Promise<boolean> {
  if (!item.transactionId) return false;
  const lancamento = await ctx.db.get(item.transactionId);
  if (!lancamento || lancamento.userId !== item.userId) return false;
  if (valorDaCompra(item) <= 0) return false;

  await ctx.db.patch(item.transactionId, camposDaCompra(item));
  return true;
}

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
        message: "Informe o preço da compra antes de registrar o custo.",
      });
    }

    const campos = camposDaCompra(item);

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
      // ── COMPRAR NÃO É PAGAR ────────────────────────────────────────────
      // Nasce SEMPRE em aberto. `purchaseStatus.ts` já dizia por escrito que
      // são perguntas diferentes — "dá para receber sem ter pago (boleto a
      // prazo) e para pagar sem ter recebido (sinal antecipado)" — e esta
      // função contradizia o próprio módulo usando "recebido" como sinônimo
      // de "pago". Quem paga é ela, no Financeiro, onde há data, forma e
      // comprovante para registrar isso direito.
      isPaid: false,
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
    exigirNumeroDaCompra(args.quantity, "Quantidade");
    exigirNumeroDaCompra(args.unitPrice, "Preço unitário");
    const { id, ...fields } = args;
    if (typeof fields.quantity === "number") fields.quantity = emCentavos(fields.quantity);
    if (typeof fields.unitPrice === "number") fields.unitPrice = emCentavos(fields.unitPrice);
    const limpos = limparCampos(fields);
    // Mudar a situação reajusta `isPurchased` junto. Sem isso, um item
    // "recebido" poderia continuar contando como pendente no Resumo
    // Operacional, e as duas telas se contradiriam.
    const patch = args.status
      ? { ...limpos, isPurchased: isPurchasedForStatus(args.status) }
      : limpos;
    await ctx.db.patch(id, comCarimbo(patch));

    // Corrigiu preço, quantidade, fornecedor ou vencimento? A despesa que já
    // existe acompanha, sem ela precisar clicar em nada de novo. Compra sem
    // despesa continua sem despesa.
    const depois = (await ctx.db.get(id))!;
    await sincronizarLancamento(ctx, depois);
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
    // Não mexe em dinheiro nenhum: marcar "comprado" não cria despesa, e a
    // despesa que já existe não muda de valor por causa disto.
  },
});

export const deletePurchase = mutation({
  args: {
    id: v.id("purchaseItems"),
    /** Só lido quando há custo registrado. Ausente, a mutation pede a decisão. */
    despesa: v.optional(decisaoSobreADespesa),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });

    // ── A DESPESA QUE ESTA COMPRA GEROU NÃO SOME SOZINHA ─────────────────────
    // Antes, apagar a compra apagava a despesa junto, calada. Fazia sentido
    // enquanto a despesa era só um número — mas ela passou a poder estar
    // PAGA e a carregar COMPROVANTE, e aí apagar em silêncio destrói o
    // documento que prova um pagamento que aconteceu de verdade.
    //
    // Agora é escolha dela, com o retrato do que está em jogo. Sem vínculo,
    // ou com vínculo quebrado, nada muda: exclui direto, como sempre.
    await exigirDecisaoSobreADespesa(ctx, item, args.despesa, "excluir");
    if (item.transactionId) await aplicarDecisao(ctx, item, args.despesa ?? "manter", "excluir");

    await ctx.db.delete(args.id);
    return { despesa: item.transactionId ? (args.despesa ?? "manter") : null };
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
/**
 * A despesa vinculada existe e alguém precisa decidir o que fazer com ela?
 *
 * Devolve `null` quando não há nada a decidir. Quando há, lança com o retrato
 * do que está em jogo — a tela usa isso para PERGUNTAR com as palavras certas
 * ("esta despesa já está paga e tem 1 comprovante") em vez de uma frase
 * genérica que não ajuda ninguém a decidir.
 */
async function exigirDecisaoSobreADespesa(
  ctx: MutationCtx,
  item: Doc<"purchaseItems">,
  decisao: "manter" | "remover" | undefined,
  acao: "cancelar" | "excluir",
) {
  if (!item.transactionId) return null;
  const lancamento = await ctx.db.get(item.transactionId);
  // Vínculo quebrado não é decisão: não há despesa para preservar.
  if (!lancamento || lancamento.userId !== item.userId) return null;
  if (decisao) return lancamento;

  throw new ConvexError({
    code: "DECISAO_NECESSARIA",
    message:
      acao === "cancelar"
        ? "Esta compra tem um custo registrado no financeiro. Diga o que fazer com ele."
        : "Esta compra tem um custo registrado no financeiro. Diga o que fazer com ele antes de excluir.",
    acao,
    valor: lancamento.amount,
    pago: lancamento.isPaid,
    comprovantes: lancamento.comprovantes?.length ?? 0,
  });
}

/** Aplica a decisão. `manter` DESVINCULA — a despesa vira registro próprio. */
async function aplicarDecisao(
  ctx: MutationCtx,
  item: Doc<"purchaseItems">,
  decisao: "manter" | "remover",
  acao: "cancelar" | "excluir",
) {
  if (!item.transactionId) return;
  const lancamento = await ctx.db.get(item.transactionId);
  if (lancamento && lancamento.userId === item.userId) {
    if (decisao === "remover") {
      // Os comprovantes são arquivos desta despesa e saem com ela. Nunca em
      // silêncio: chegar aqui exigiu escolha explícita, com o retrato do que
      // se perde escrito na tela.
      for (const c of lancamento.comprovantes ?? []) await safeDeleteFile(ctx, c.storageId);
      await ctx.db.delete(item.transactionId);
    } else {
      // ── A DESPESA PASSA A LEMBRAR DE ONDE VEIO ──────────────────────────
      // O vínculo operacional some na linha abaixo, e tem de sumir: enquanto
      // ele existe, a compra cancelada é uma inconsistência que cala a margem
      // do evento. Mas ele era a ÚNICA coisa que ligava esta despesa àquela
      // compra — soltar sem mais nada deixava no livro uma linha órfã que,
      // meses depois, ninguém sabe se ainda vale.
      //
      // Então a procedência é gravada AQUI, no único instante em que ela
      // ainda é conhecida. Snapshot, não ponteiro: a compra pode estar sendo
      // excluída nesta mesma mutation. Ver `transactions.origemCompra`.
      await ctx.db.patch(item.transactionId, {
        origemCompra: {
          nome: item.name,
          desfecho: acao === "cancelar" ? ("cancelada" as const) : ("excluida" as const),
          em: dataDoDia(),
        },
      });
    }
  }
  await ctx.db.patch(item._id, { transactionId: undefined });
}

export const setPurchaseStatus = mutation({
  args: {
    id: v.id("purchaseItems"),
    status: purchaseStatus,
    /**
     * Só é lido ao CANCELAR uma compra que tem custo registrado. Ausente
     * nesse caso, a mutation recusa e pede a decisão — nunca escolhe sozinha.
     */
    despesa: v.optional(decisaoSobreADespesa),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }

    // ── CANCELAR É O ÚNICO ESTADO QUE DESFAZ A COMPRA ────────────────────
    // Sair de "comprado" para "cotação" é correção de cadastro; a despesa
    // continua valendo. Cancelar é dizer que a compra não aconteceu — e aí
    // alguém precisa decidir o que foi feito do dinheiro.
    if (args.status === "cancelado") {
      await exigirDecisaoSobreADespesa(ctx, item, args.despesa, "cancelar");
    }

    await ctx.db.patch(
      args.id,
      comCarimbo({ status: args.status, isPurchased: isPurchasedForStatus(args.status) }),
    );

    if (args.status === "cancelado" && args.despesa) {
      await aplicarDecisao(ctx, item, args.despesa, "cancelar");
      return { despesa: args.despesa };
    }

    // Mudou de estado sem cancelar: a despesa que já existe acompanha o que
    // a compra diz — e continua sem encostar em pagamento.
    const depois = (await ctx.db.get(args.id))!;
    await sincronizarLancamento(ctx, depois);
    return { despesa: null };
  },
});
