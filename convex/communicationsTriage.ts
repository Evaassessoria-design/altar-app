import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  categoriaValidator,
  departamentoValidator,
  prioridadeValidator,
  tipoDeTrabalhoValidator,
  severidadeValidator,
  verticalValidator,
} from "./lib/central/validadores";

// ═════════════════════════════════════════════════════════════════════════════
// GRAVAÇÃO DA TRIAGEM
//
// Separado de convex/communicationsIa.ts porque aquele arquivo é `"use node"`
// — runtime em que o Convex só aceita actions. A action chama o modelo; estas
// mutations gravam o resultado numa única transação.
//
// A divisão também deixa explícito o que é DECISÃO (lá) e o que é ESCRITA
// (aqui): nenhuma regra de negócio nova acontece neste arquivo.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Grava o resultado da triagem numa única transação.
 *
 * Tudo ou nada: se a criação da proposta falhasse depois de a conversa já
 * ter sido reclassificada, ficaria uma conversa roteada sem a resposta que
 * justificava o roteamento.
 */
export const aplicarTriagem = internalMutation({
  args: {
    conversationId: v.id("communicationConversations"),
    messageId: v.optional(v.id("communicationMessages")),
    vertical: verticalValidator,
    departamento: departamentoValidator,
    categoria: categoriaValidator,
    prioridade: prioridadeValidator,
    escalar: v.boolean(),
    motivoDoEscalonamento: v.optional(v.string()),
    confianca: v.number(),
    assunto: v.optional(v.string()),
    resumo: v.string(),
    sinais: v.array(v.string()),
    respostaSugerida: v.optional(v.string()),
    modelo: v.string(),
    promptVersao: v.string(),
    trabalho: v.optional(tipoDeTrabalhoValidator),
    sinalDeProduto: v.optional(
      v.object({
        titulo: v.string(),
        descricao: v.string(),
        severidade: v.optional(severidadeValidator),
      }),
    ),
    agora: v.number(),
  },
  handler: async (ctx, args) => {
    const conversa = await ctx.db.get(args.conversationId);
    if (!conversa) return null;

    const triageId = await ctx.db.insert("communicationTriage", {
      conversationId: args.conversationId,
      messageId: args.messageId,
      vertical: args.vertical,
      channel: conversa.channel,
      departamentoSugerido: args.departamento,
      categoriaSugerida: args.categoria,
      prioridadeSugerida: args.prioridade,
      escalarCeoSugerido: args.escalar,
      confianca: args.confianca,
      resumo: args.resumo,
      sinais: args.sinais,
      respostaSugerida: args.respostaSugerida,
      modelo: args.modelo,
      promptVersao: args.promptVersao,
      aplicada: true,
      aplicadaPor: "auto",
      criadaEm: args.agora,
    });

    // A triagem só CLASSIFICA o que ainda não foi classificado por gente. Um
    // humano que já moveu a conversa não é corrigido pela IA.
    const jaClassificadaPorHumano = await ctx.db
      .query("communicationTriage")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect()
      .then((lista) => lista.some((t) => t.aplicadaPor === "humano"));

    if (!jaClassificadaPorHumano) {
      await ctx.db.patch(args.conversationId, {
        departamento: args.departamento,
        categoria: args.categoria,
        prioridade: args.prioridade,
        assunto: args.assunto ?? conversa.assunto,
        escaladaParaCeo: args.escalar ? true : conversa.escaladaParaCeo,
        escaladaMotivo: args.escalar
          ? (args.motivoDoEscalonamento ?? conversa.escaladaMotivo)
          : conversa.escaladaMotivo,
        escaladaEm: args.escalar ? (conversa.escaladaEm ?? args.agora) : conversa.escaladaEm,
        status: args.escalar ? "escalada_ceo" : conversa.status,
        atualizadaEm: args.agora,
      });
    }

    // ── Tarefa da operação ──────────────────────────────────────────────────
    if (args.trabalho) {
      await ctx.runMutation(internal.adminWorkItems.abrirPelaTriagem, {
        vertical: args.vertical,
        tipo: args.trabalho,
        titulo: args.assunto ?? args.resumo.slice(0, 80),
        descricao: args.resumo,
        prioridade: args.prioridade,
        contactId: conversa.contactId,
        conversationId: args.conversationId,
        agora: args.agora,
      });
    }

    // ── Ouvidoria → Produto ─────────────────────────────────────────────────
    if (args.sinalDeProduto && args.categoria !== "outro") {
      const tipoDeSinal = args.categoria;
      if (
        tipoDeSinal === "reclamacao" ||
        tipoDeSinal === "sugestao" ||
        tipoDeSinal === "bug" ||
        tipoDeSinal === "funcionalidade" ||
        tipoDeSinal === "elogio"
      ) {
        await ctx.runMutation(internal.customerVoice.registrarPelaTriagem, {
          vertical: args.vertical,
          tipo: tipoDeSinal,
          titulo: args.sinalDeProduto.titulo,
          descricao: args.sinalDeProduto.descricao || args.resumo,
          severidade: args.sinalDeProduto.severidade,
          channel: conversa.channel,
          conversationId: args.conversationId,
          contactId: conversa.contactId,
          agora: args.agora,
        });
      }
    }

    // ── Proposta de resposta ────────────────────────────────────────────────
    const contato = await ctx.db.get(conversa.contactId);
    let approvalId = null;

    // Quem pediu para não ser contatado não recebe proposta de resposta — não
    // adianta o Matheus aprovar algo que não pode sair.
    if (args.respostaSugerida && !(contato?.optOut ?? false)) {
      approvalId = await ctx.runMutation(internal.adminApprovals.proporPelaTriagem, {
        vertical: args.vertical,
        conversationId: args.conversationId,
        contactId: conversa.contactId,
        triageId,
        texto: args.respostaSugerida,
        modelo: args.modelo,
        agora: args.agora,
      });

      if (approvalId) {
        await ctx.db.patch(args.conversationId, {
          status: args.escalar ? "escalada_ceo" : "aguardando_aprovacao",
          atualizadaEm: args.agora,
        });
      }
    }

    // ── Aviso aos administradores ───────────────────────────────────────────
    if (args.escalar || approvalId) {
      const admins = await ctx.db
        .query("users")
        .take(500)
        .then((lista) => lista.filter((u) => u.role === "admin"));

      for (const admin of admins) {
        await ctx.db.insert("notifications", {
          userId: admin._id,
          type: args.escalar ? "central_escalado" : "central_aprovacao",
          title: args.escalar
            ? `Central: conversa escalada — ${args.motivoDoEscalonamento ?? "revisar"}`
            : "Central: resposta aguardando aprovação",
          body: args.resumo.slice(0, 300),
          isRead: false,
          createdAt: new Date(args.agora).toISOString(),
        });
      }
    }

    return triageId;
  },
});

/**
 * Registra, no histórico da conversa, a mensagem que de fato saiu.
 *
 * Chamada SOMENTE pelo outbox, depois de o canal confirmar. Inalcançável na
 * Fase 1 — nenhuma mensagem sai.
 */
export const registrarSaidaEnviada = internalMutation({
  args: {
    approvalId: v.id("adminApprovals"),
    externalMessageId: v.string(),
    agora: v.number(),
  },
  handler: async (ctx, args) => {
    const aprovacao = await ctx.db.get(args.approvalId);
    if (!aprovacao?.conversationId) return;

    const conversa = await ctx.db.get(aprovacao.conversationId);
    if (!conversa) return;

    await ctx.db.insert("communicationMessages", {
      conversationId: conversa._id,
      vertical: aprovacao.vertical,
      channel: conversa.channel,
      externalMessageId: args.externalMessageId,
      direcao: "saida",
      tipo: "texto",
      texto: aprovacao.textoAprovado ?? aprovacao.proposta.texto,
      autor: "altar",
      enviadaPorUserId: aprovacao.decididoPorUserId,
      approvalId: aprovacao._id,
      enviadaEm: args.agora,
      statusEntrega: "enviada",
    });

    await ctx.db.patch(conversa._id, {
      ultimaMensagemEm: args.agora,
      ultimaMensagemDirecao: "saida",
      status: "aguardando_cliente",
      atualizadaEm: args.agora,
    });
  },
});
