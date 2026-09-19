import { v, ConvexError } from "convex/values";
import type { Expression, FilterBuilder, NamedTableInfo } from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import type { DataModel, Doc } from "./_generated/dataModel";
import { requireAdmin } from "./lib/adminGuard";
import { verticalDoAmbiente } from "./lib/central/vertical";
import {
  channelValidator,
  severidadeValidator,
  statusDeSinalValidator,
  tipoDeSinalValidator,
  verticalValidator,
} from "./lib/central/validadores";

// ═════════════════════════════════════════════════════════════════════════════
// OUVIDORIA → PRODUTO
//
// ── POR QUE ISTO NÃO É UMA QUERY AGREGADORA SOBRE CONVERSAS ────────────────
// Um sinal NÃO é espelho da conversa que o originou:
//
//   · tem ciclo de vida PRÓPRIO, que sobrevive ao atendimento — a conversa
//     fecha hoje, o bug segue aberto em Produto por três semanas;
//   · tem `ocorrencias` — nove pessoas pedindo a mesma funcionalidade viram UM
//     sinal com peso 9, e é esse número que prioriza roadmap. Nenhuma
//     agregação sobre conversas produziria isso;
//   · pode nascer fora de conversa nenhuma (reunião, e-mail, suporte).
//
// ── O MERGE É HUMANO NA FASE 1 ─────────────────────────────────────────────
// A IA registra sinal novo e SUGERE semelhantes; quem funde é uma pessoa.
// Fundir errado apaga o pedido de um cliente, e apagar pedido de cliente é
// exatamente o que a Ouvidoria existe para impedir.
// ═════════════════════════════════════════════════════════════════════════════

export const registrarPelaTriagem = internalMutation({
  args: {
    vertical: verticalValidator,
    tipo: tipoDeSinalValidator,
    titulo: v.string(),
    descricao: v.string(),
    severidade: v.optional(severidadeValidator),
    channel: v.optional(channelValidator),
    conversationId: v.optional(v.id("communicationConversations")),
    contactId: v.optional(v.id("adminContacts")),
    agora: v.number(),
  },
  handler: async (ctx, args) => {
    // Uma mesma conversa não gera dois sinais do mesmo tipo: a pessoa que
    // manda três mensagens sobre o mesmo bug relatou UM bug.
    if (args.conversationId) {
      const existentes = await ctx.db
        .query("customerVoiceSignals")
        .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
        .collect();
      const mesmo = existentes.find((s) => s.tipo === args.tipo);
      if (mesmo) {
        await ctx.db.patch(mesmo._id, {
          ocorrencias: mesmo.ocorrencias + 1,
          ultimoRelatoEm: args.agora,
          atualizadoEm: args.agora,
        });
        return mesmo._id;
      }
    }

    return ctx.db.insert("customerVoiceSignals", {
      vertical: args.vertical,
      tipo: args.tipo,
      titulo: args.titulo.slice(0, 160),
      descricao: args.descricao.slice(0, 4_000),
      severidade: args.severidade,
      status: "novo",
      channel: args.channel,
      conversationId: args.conversationId,
      contactId: args.contactId,
      ocorrencias: 1,
      ultimoRelatoEm: args.agora,
      registradoPor: "ia",
      criadoEm: args.agora,
      atualizadoEm: args.agora,
    });
  },
});

export const listar = query({
  args: {
    tipo: v.optional(tipoDeSinalValidator),
    status: v.optional(statusDeSinalValidator),
    severidade: v.optional(severidadeValidator),
    limite: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const vertical = verticalDoAmbiente();
    const limite = Math.min(args.limite ?? 100, 300);

    // Filtros que não couberam no índice escolhido entram na CONSULTA, nunca
    // na página já carregada: "3 bugs críticos entre os 100 mais recentes" não
    // é a resposta que a tela promete.
    const refinar = (
      q: FilterBuilder<NamedTableInfo<DataModel, "customerVoiceSignals">>,
    ): Expression<boolean> => {
      const condicoes: Expression<boolean>[] = [];
      if (args.tipo) condicoes.push(q.eq(q.field("tipo"), args.tipo));
      if (args.status) condicoes.push(q.eq(q.field("status"), args.status));
      if (args.severidade) condicoes.push(q.eq(q.field("severidade"), args.severidade));
      return condicoes.length === 0 ? q.eq(q.field("vertical"), vertical) : q.and(...condicoes);
    };

    const sinais = args.tipo
      ? await ctx.db
          .query("customerVoiceSignals")
          .withIndex("by_vertical_tipo", (q) => q.eq("vertical", vertical).eq("tipo", args.tipo!))
          .order("desc")
          .filter(refinar)
          .take(limite)
      : args.status
        ? await ctx.db
            .query("customerVoiceSignals")
            .withIndex("by_vertical_status", (q) =>
              q.eq("vertical", vertical).eq("status", args.status!),
            )
            .order("desc")
            .filter(refinar)
            .take(limite)
        : await ctx.db
            .query("customerVoiceSignals")
            .withIndex("by_vertical_ocorrencias", (q) => q.eq("vertical", vertical))
            .order("desc")
            .filter(refinar)
            .take(limite);

    return sinais.map((s) => ({
      _id: s._id,
      tipo: s.tipo,
      titulo: s.titulo,
      descricao: s.descricao,
      severidade: s.severidade,
      status: s.status,
      ocorrencias: s.ocorrencias,
      ultimoRelatoEm: s.ultimoRelatoEm,
      conversationId: s.conversationId,
      contactId: s.contactId,
      registradoPor: s.registradoPor,
      criadoEm: s.criadoEm,
    }));
  },
});

/**
 * REGISTRO HUMANO de um sinal — a Ouvidoria pela mão de quem atendeu.
 *
 * Até aqui só a IA registrava, e isso deixava de fora exatamente o caso mais
 * valioso: a pessoa que LEU a conversa e entendeu que aquilo era um bug, não
 * uma dúvida. Também cobre o sinal que nasce fora de conversa nenhuma —
 * reunião, ligação, e-mail.
 *
 * Quando já existe um sinal DO MESMO TIPO para a mesma conversa, isto conta
 * uma OCORRÊNCIA em vez de criar um segundo: a mesma pessoa relatando o mesmo
 * problema duas vezes não são dois problemas. Fundir os de conversas
 * diferentes continua sendo decisão humana explícita (`fundir`).
 */
export const registrar = mutation({
  args: {
    tipo: tipoDeSinalValidator,
    titulo: v.string(),
    descricao: v.string(),
    severidade: v.optional(severidadeValidator),
    conversationId: v.optional(v.id("communicationConversations")),
    contactId: v.optional(v.id("adminContacts")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const titulo = args.titulo.trim();
    if (!titulo) {
      throw new ConvexError({ code: "INVALID", message: "O sinal precisa de um título" });
    }

    const agora = Date.now();
    const vertical = verticalDoAmbiente();

    let channel: Doc<"customerVoiceSignals">["channel"];
    let contactId = args.contactId;

    if (args.conversationId) {
      const conversa = await ctx.db.get(args.conversationId);
      if (!conversa) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
      }
      channel = conversa.channel;
      contactId = contactId ?? conversa.contactId;

      const existentes = await ctx.db
        .query("customerVoiceSignals")
        .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
        .collect();
      const mesmo = existentes.find((s) => s.tipo === args.tipo);
      if (mesmo) {
        await ctx.db.patch(mesmo._id, {
          ocorrencias: mesmo.ocorrencias + 1,
          ultimoRelatoEm: agora,
          // A severidade informada por gente vale mais que a que a IA supôs.
          severidade: args.severidade ?? mesmo.severidade,
          atualizadoEm: agora,
        });
        return { signalId: mesmo._id, criado: false };
      }
    }

    const signalId = await ctx.db.insert("customerVoiceSignals", {
      vertical,
      tipo: args.tipo,
      titulo: titulo.slice(0, 160),
      descricao: args.descricao.trim().slice(0, 4_000),
      severidade: args.severidade,
      status: "novo",
      channel,
      conversationId: args.conversationId,
      contactId,
      ocorrencias: 1,
      ultimoRelatoEm: agora,
      registradoPor: "humano",
      registradoPorUserId: admin._id,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    return { signalId, criado: true };
  },
});

/** Painel de Produto: o que mais dói, por peso de ocorrências. */
export const painelDeProduto = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const vertical = verticalDoAmbiente();

    const sinais = await ctx.db
      .query("customerVoiceSignals")
      .withIndex("by_vertical_ocorrencias", (q) => q.eq("vertical", vertical))
      .order("desc")
      .take(500);

    const abertos = sinais.filter(
      (s) => s.status !== "entregue" && s.status !== "descartado",
    );

    const tipos = ["reclamacao", "sugestao", "bug", "funcionalidade", "elogio"] as const;
    const porTipo = Object.fromEntries(
      tipos.map((tipo) => {
        const doTipo = abertos.filter((s) => s.tipo === tipo);
        return [
          tipo,
          {
            sinais: doTipo.length,
            // Peso: o que mede prioridade não é quantos registros existem, e
            // sim quantas pessoas pediram.
            ocorrencias: doTipo.reduce((soma, s) => soma + s.ocorrencias, 0),
          },
        ];
      }),
    );

    return {
      total: abertos.length,
      porTipo,
      maisPedidos: abertos
        .slice()
        .sort((a, b) => b.ocorrencias - a.ocorrencias)
        .slice(0, 10)
        .map((s) => ({
          _id: s._id,
          tipo: s.tipo,
          titulo: s.titulo,
          ocorrencias: s.ocorrencias,
          status: s.status,
        })),
    };
  },
});

export const atualizar = mutation({
  args: {
    signalId: v.id("customerVoiceSignals"),
    status: v.optional(statusDeSinalValidator),
    severidade: v.optional(severidadeValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const sinal = await ctx.db.get(args.signalId);
    if (!sinal) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Sinal não encontrado" });
    }
    await ctx.db.patch(args.signalId, {
      status: args.status ?? sinal.status,
      severidade: args.severidade ?? sinal.severidade,
      atualizadoEm: Date.now(),
    });
  },
});

/**
 * Funde dois sinais. SEMPRE humano.
 *
 * Soma as ocorrências no sinal que fica e descarta o outro — descartar, não
 * apagar: o registro continua existindo e aponta para onde o pedido foi
 * parar.
 */
export const fundir = mutation({
  args: {
    manterId: v.id("customerVoiceSignals"),
    descartarId: v.id("customerVoiceSignals"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.manterId === args.descartarId) {
      throw new ConvexError({ code: "INVALID", message: "Escolha dois sinais diferentes" });
    }

    const manter = await ctx.db.get(args.manterId);
    const descartar = await ctx.db.get(args.descartarId);
    if (!manter || !descartar) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Sinal não encontrado" });
    }

    const agora = Date.now();
    await ctx.db.patch(args.manterId, {
      ocorrencias: manter.ocorrencias + descartar.ocorrencias,
      ultimoRelatoEm: Math.max(manter.ultimoRelatoEm, descartar.ultimoRelatoEm),
      atualizadoEm: agora,
    });
    await ctx.db.patch(args.descartarId, {
      status: "descartado",
      descricao: `${descartar.descricao}\n\n[Fundido em ${new Date(agora).toISOString()} por ${admin.name}]`,
      atualizadoEm: agora,
    });
  },
});
