import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
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

export const listar = query({
  args: {
    status: v.optional(statusDeTrabalhoValidator),
    apenasVencidos: v.optional(v.boolean()),
    limite: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const vertical = verticalDoAmbiente();
    const hoje = diaCivil(Date.now());

    let itens: Doc<"adminWorkItems">[];
    if (args.status) {
      itens = await ctx.db
        .query("adminWorkItems")
        .withIndex("by_vertical_status", (q) =>
          q.eq("vertical", vertical).eq("status", args.status!),
        )
        .order("desc")
        .take(Math.min(args.limite ?? 100, 300));
    } else {
      itens = await ctx.db
        .query("adminWorkItems")
        .withIndex("by_vertical_vence", (q) => q.eq("vertical", vertical))
        .take(Math.min(args.limite ?? 100, 300));
    }

    const comEstado = itens.map((t) => ({
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
    }));

    return args.apenasVencidos ? comEstado.filter((t) => t.vencido) : comEstado;
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

export const atualizar = mutation({
  args: {
    workItemId: v.id("adminWorkItems"),
    status: v.optional(statusDeTrabalhoValidator),
    prioridade: v.optional(prioridadeValidator),
    venceEm: v.optional(v.string()),
    responsavelUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const item = await ctx.db.get(args.workItemId);
    if (!item) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Tarefa não encontrada" });
    }

    const agora = Date.now();
    await ctx.db.patch(args.workItemId, {
      status: args.status ?? item.status,
      prioridade: args.prioridade ?? item.prioridade,
      venceEm: args.venceEm ?? item.venceEm,
      responsavelUserId: args.responsavelUserId ?? item.responsavelUserId,
      concluidoEm: args.status === "concluido" ? agora : item.concluidoEm,
      atualizadoEm: agora,
    });
  },
});
