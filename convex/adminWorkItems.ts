import { v, ConvexError } from "convex/values";
import type { Expression, FilterBuilder, NamedTableInfo } from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import type { DataModel, Doc } from "./_generated/dataModel";
import { requireAdmin } from "./lib/adminGuard";
import { verticalDoAmbiente } from "./lib/central/vertical";
import { diaCivil, diaCivilEmDias, trabalhoVenceHoje, trabalhoVencido } from "./lib/central/prazos";
import { prazoEmDias, type Prioridade } from "./lib/central/triagem";
import {
  prioridadeValidator,
  statusDeTrabalhoValidator,
  tipoDeTrabalhoValidator,
  verticalValidator,
} from "./lib/central/validadores";

// ═════════════════════════════════════════════════════════════════════════════
// TAREFAS DA OPERAÇÃO — follow-up, demonstração, onboarding, suporte, contato
// de cobrança.
//
// ── POR QUE ISTO NÃO É UM CAMPO DE TEXTO NA CONVERSA ────────────────────────
// "Próxima ação" como texto solto na conversa some quando a conversa fecha,
// não tem dono, não tem prazo, não aparece em lista por responsável — e não
// consegue existir sem conversa. Mas um follow-up de trial nasce do
// calendário, não de mensagem nenhuma.
//
// ── CONTATO DE COBRANÇA NÃO É COBRANÇA ─────────────────────────────────────
// `contato_cobranca` significa "falar com a pessoa sobre o pagamento dela".
// Nada aqui toca em `transactions`, em assinatura ou no Asaas. A Central
// classifica e lembra; quem movimenta dinheiro continua sendo o fluxo de
// cobrança existente, por decisão humana, fora deste módulo.
// ═════════════════════════════════════════════════════════════════════════════

/** Tarefa nascida da triagem. Interna: a IA propõe tarefa, nunca mensagem. */
export const abrirPelaTriagem = internalMutation({
  args: {
    vertical: verticalValidator,
    tipo: tipoDeTrabalhoValidator,
    titulo: v.string(),
    descricao: v.optional(v.string()),
    prioridade: prioridadeValidator,
    contactId: v.optional(v.id("adminContacts")),
    conversationId: v.optional(v.id("communicationConversations")),
    agora: v.number(),
  },
  handler: async (ctx, args) => {
    // Uma conversa não acumula tarefas iguais em aberto: cada mensagem nova do
    // cliente reabriria a mesma pendência e a fila viraria ruído.
    if (args.conversationId) {
      const existentes = await ctx.db
        .query("adminWorkItems")
        .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
        .collect();
      const repetida = existentes.find(
        (t) => t.tipo === args.tipo && (t.status === "aberto" || t.status === "em_andamento"),
      );
      if (repetida) return repetida._id;
    }

    return ctx.db.insert("adminWorkItems", {
      vertical: args.vertical,
      tipo: args.tipo,
      titulo: args.titulo.slice(0, 160),
      descricao: args.descricao,
      prioridade: args.prioridade,
      status: "aberto",
      contactId: args.contactId,
      conversationId: args.conversationId,
      venceEm: diaCivilEmDias(args.agora, prazoEmDias(args.prioridade as Prioridade)),
      criadoPor: "ia",
      criadoEm: args.agora,
      atualizadoEm: args.agora,
    });
  },
});

/**
 * Lista de tarefas da operação, com filtros aplicados NA CONSULTA.
 *
 * `apenasVencidos` filtrava a página depois de carregada — ou seja, devolvia
 * "as vencidas ENTRE as 100 mais recentes". Quem lê a tela entende "estas são
 * as vencidas" e vai dormir tranquilo com a centésima primeira em atraso. A
 * condição agora entra na consulta, e a regra de vencimento é a mesma de
 * `lib/central/prazos.ts`: sem data não há atraso, e tarefa concluída ou
 * cancelada nunca está vencida.
 */
export const listar = query({
  args: {
    status: v.optional(statusDeTrabalhoValidator),
    tipo: v.optional(tipoDeTrabalhoValidator),
    responsavelUserId: v.optional(v.id("users")),
    contactId: v.optional(v.id("adminContacts")),
    conversationId: v.optional(v.id("communicationConversations")),
    apenasVencidos: v.optional(v.boolean()),
    limite: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const vertical = verticalDoAmbiente();
    const hoje = diaCivil(Date.now());
    const limite = Math.min(args.limite ?? 100, 300);

    const refinar = (
      q: FilterBuilder<NamedTableInfo<DataModel, "adminWorkItems">>,
    ): Expression<boolean> => {
      const condicoes: Expression<boolean>[] = [];
      if (args.tipo) condicoes.push(q.eq(q.field("tipo"), args.tipo));
      if (args.responsavelUserId) {
        condicoes.push(q.eq(q.field("responsavelUserId"), args.responsavelUserId));
      }
      if (args.contactId) condicoes.push(q.eq(q.field("contactId"), args.contactId));
      if (args.conversationId) {
        condicoes.push(q.eq(q.field("conversationId"), args.conversationId));
      }
      if (args.apenasVencidos) {
        condicoes.push(
          q.and(
            q.neq(q.field("venceEm"), undefined),
            q.lt(q.field("venceEm"), hoje),
            q.neq(q.field("status"), "concluido"),
            q.neq(q.field("status"), "cancelado"),
          ),
        );
      }
      return condicoes.length === 0 ? q.eq(q.field("vertical"), vertical) : q.and(...condicoes);
    };

    const itens: Doc<"adminWorkItems">[] = args.status
      ? await ctx.db
          .query("adminWorkItems")
          .withIndex("by_vertical_status", (q) =>
            q.eq("vertical", vertical).eq("status", args.status!),
          )
          .order("desc")
          .filter(refinar)
          .take(limite)
      : await ctx.db
          .query("adminWorkItems")
          .withIndex("by_vertical_vence", (q) => q.eq("vertical", vertical))
          .filter(refinar)
          .take(limite);

    return itens.map((t) => ({
      _id: t._id,
      tipo: t.tipo,
      titulo: t.titulo,
      descricao: t.descricao,
      prioridade: t.prioridade ?? ("normal" as const),
      status: t.status,
      venceEm: t.venceEm,
      vencido: trabalhoVencido(t, hoje),
      venceHoje: trabalhoVenceHoje(t, hoje),
      contactId: t.contactId,
      conversationId: t.conversationId,
      responsavelUserId: t.responsavelUserId,
      criadoPor: t.criadoPor,
      criadoEm: t.criadoEm,
      concluidoEm: t.concluidoEm,
    }));
  },
});

export const criar = mutation({
  args: {
    tipo: tipoDeTrabalhoValidator,
    titulo: v.string(),
    descricao: v.optional(v.string()),
    prioridade: v.optional(prioridadeValidator),
    venceEm: v.optional(v.string()),
    contactId: v.optional(v.id("adminContacts")),
    conversationId: v.optional(v.id("communicationConversations")),
    responsavelUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const titulo = args.titulo.trim();
    if (!titulo) {
      throw new ConvexError({ code: "INVALID", message: "A tarefa precisa de um título" });
    }
    const agora = Date.now();

    return ctx.db.insert("adminWorkItems", {
      vertical: verticalDoAmbiente(),
      tipo: args.tipo,
      titulo: titulo.slice(0, 160),
      descricao: args.descricao,
      prioridade: args.prioridade,
      status: "aberto",
      contactId: args.contactId,
      conversationId: args.conversationId,
      responsavelUserId: args.responsavelUserId,
      venceEm: args.venceEm,
      criadoPor: "humano",
      criadoPorUserId: admin._id,
      criadoEm: agora,
      atualizadoEm: agora,
    });
  },
});

/**
 * Muda o andamento da tarefa.
 *
 * `limparResponsavel` e `limparVencimento` existem porque `undefined` em
 * argumento significa "não mexa neste campo" — sem eles, tirar o dono de uma
 * tarefa atribuída por engano seria impossível pela tela.
 */
export const atualizar = mutation({
  args: {
    workItemId: v.id("adminWorkItems"),
    status: v.optional(statusDeTrabalhoValidator),
    prioridade: v.optional(prioridadeValidator),
    venceEm: v.optional(v.string()),
    responsavelUserId: v.optional(v.id("users")),
    limparResponsavel: v.optional(v.boolean()),
    limparVencimento: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const item = await ctx.db.get(args.workItemId);
    if (!item) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Tarefa não encontrada" });
    }

    const agora = Date.now();
    const status = args.status ?? item.status;

    await ctx.db.patch(args.workItemId, {
      status,
      prioridade: args.prioridade ?? item.prioridade,
      venceEm: args.limparVencimento ? undefined : (args.venceEm ?? item.venceEm),
      responsavelUserId: args.limparResponsavel
        ? undefined
        : (args.responsavelUserId ?? item.responsavelUserId),
      // Reabrir uma tarefa apaga a data de conclusão: manter a antiga diria
      // que ela foi concluída e continua aberta ao mesmo tempo.
      concluidoEm:
        status === "concluido" ? (item.concluidoEm ?? agora) : undefined,
      atualizadoEm: agora,
    });
  },
});
