import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireAdmin } from "./lib/adminGuard";
import { verticalDoAmbiente } from "./lib/central/vertical";
import { aprovacaoExpirou, TTL_APROVACAO_MS } from "./lib/central/prazos";
import { avaliarPortaoDeSaida } from "./lib/central/autonomia";
import {
  propostaValidator,
  statusDeAprovacaoValidator,
  verticalValidator,
} from "./lib/central/validadores";

// ═════════════════════════════════════════════════════════════════════════════
// FILA DE APROVAÇÃO DO MATHEUS
//
// NENHUMA saída externa da Central existe fora daqui. A IA e os operadores
// PROPÕEM; só uma decisão humana registrada nesta tabela pode virar mensagem.
//
// ── NÃO SE CHAMA "RASCUNHOS" DE PROPÓSITO ──────────────────────────────────
// `proposta` é união discriminada. O BLOCO 1 implementa apenas
// `mensagem_saida`, mas a Fase 2 vai querer propor "abrir tarefa", "vincular
// contato", "registrar sinal de produto" — e isso entra sem migração.
//
// ── APROVAR NÃO É ENVIAR ───────────────────────────────────────────────────
// Aprovar grava a decisão e chama o outbox. O outbox consulta o portão de
// saída (lib/central/autonomia.ts), que na Fase 1 recusa porque
// ALTAR_CENTRAL_ENVIO_HABILITADO está desligada. A aprovação fica registrada,
// visível e auditável — e a mensagem NÃO sai. É o comportamento desejado, não
// uma falha.
// ═════════════════════════════════════════════════════════════════════════════

/** Proposta criada pela triagem. A IA nunca cria nada além de `pendente`. */
export const proporPelaTriagem = internalMutation({
  args: {
    vertical: verticalValidator,
    conversationId: v.id("communicationConversations"),
    contactId: v.optional(v.id("adminContacts")),
    triageId: v.optional(v.id("communicationTriage")),
    texto: v.string(),
    modelo: v.optional(v.string()),
    agora: v.number(),
  },
  handler: async (ctx, args) => {
    const texto = args.texto.trim();
    if (!texto) return null;

    // Uma conversa não acumula propostas pendentes: a fila do Matheus tem de
    // mostrar UMA decisão por conversa, não uma pilha do mesmo assunto.
    const pendentes = await ctx.db
      .query("adminApprovals")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    for (const antiga of pendentes) {
      if (antiga.status === "pendente") {
        await ctx.db.patch(antiga._id, {
          status: "expirada",
          recusaMotivo: "Substituída por proposta mais recente",
        });
      }
    }

    return ctx.db.insert("adminApprovals", {
      vertical: args.vertical,
      conversationId: args.conversationId,
      contactId: args.contactId,
      triageId: args.triageId,
      proposta: { kind: "mensagem_saida", texto },
      status: "pendente",
      geradoPor: "ia",
      modelo: args.modelo,
      criadoEm: args.agora,
      expiraEm: args.agora + TTL_APROVACAO_MS,
    });
  },
});

export const listarPendentes = query({
  args: { limite: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const vertical = verticalDoAmbiente();

    const pendentes = await ctx.db
      .query("adminApprovals")
      .withIndex("by_vertical_status", (q) => q.eq("vertical", vertical).eq("status", "pendente"))
      .order("desc")
      .take(Math.min(args.limite ?? 50, 200));

    const agora = Date.now();

    return Promise.all(
      pendentes.map(async (aprovacao) => {
        const conversa = aprovacao.conversationId
          ? await ctx.db.get(aprovacao.conversationId)
          : null;
        const contato = conversa ? await ctx.db.get(conversa.contactId) : null;
        const triagem = aprovacao.triageId ? await ctx.db.get(aprovacao.triageId) : null;

        return {
          _id: aprovacao._id,
          proposta: aprovacao.proposta,
          geradoPor: aprovacao.geradoPor,
          modelo: aprovacao.modelo,
          criadoEm: aprovacao.criadoEm,
          expirada: aprovacaoExpirou(aprovacao, agora),
          conversa: conversa
            ? {
                _id: conversa._id,
                channel: conversa.channel,
                assunto: conversa.assunto,
                departamento: conversa.departamento ?? ("triagem" as const),
                categoria: conversa.categoria,
                prioridade: conversa.prioridade ?? ("normal" as const),
                escaladaParaCeo: conversa.escaladaParaCeo ?? false,
                escaladaMotivo: conversa.escaladaMotivo,
                janelaRespostaAte: conversa.janelaRespostaAte,
              }
            : null,
          contato: contato
            ? {
                _id: contato._id,
                nome: contato.displayName,
                tipo: contato.tipo ?? ("desconhecido" as const),
              }
            : null,
          triagem: triagem
            ? { confianca: triagem.confianca, resumo: triagem.resumo, sinais: triagem.sinais }
            : null,
        };
      }),
    );
  },
});

/**
 * HISTÓRICO DE DECISÕES — o que já foi aprovado, editado, recusado ou expirou.
 *
 * A fila mostra o que falta decidir; esta responde "o que eu decidi, e o que
 * aconteceu depois". Traz o AUTOR pelo nome: uma decisão registrada só por id
 * de usuário não é auditoria, é um enigma.
 */
export const listarPorStatus = query({
  args: { status: statusDeAprovacaoValidator, limite: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const vertical = verticalDoAmbiente();
    const itens = await ctx.db
      .query("adminApprovals")
      .withIndex("by_vertical_status", (q) =>
        q.eq("vertical", vertical).eq("status", args.status),
      )
      .order("desc")
      .take(Math.min(args.limite ?? 50, 200));

    return Promise.all(
      itens.map(async (a) => {
        const decisor = a.decididoPorUserId ? await ctx.db.get(a.decididoPorUserId) : null;
        const conversa = a.conversationId ? await ctx.db.get(a.conversationId) : null;
        const contato = conversa ? await ctx.db.get(conversa.contactId) : null;

        return {
          _id: a._id,
          proposta: a.proposta,
          textoAprovado: a.textoAprovado,
          status: a.status,
          decididoEm: a.decididoEm,
          decididoPor: decisor?.name ?? null,
          recusaMotivo: a.recusaMotivo,
          execucaoErro: a.execucaoErro,
          executadaEm: a.executadaEm,
          conversationId: a.conversationId,
          assunto: conversa?.assunto ?? null,
          contatoNome: contato?.displayName ?? null,
          criadoEm: a.criadoEm,
        };
      }),
    );
  },
});

async function pendenteOuFalha(ctx: MutationCtx, approvalId: Id<"adminApprovals">) {
  const aprovacao = await ctx.db.get(approvalId);
  if (!aprovacao) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Aprovação não encontrada" });
  }
  if (aprovacao.status !== "pendente") {
    throw new ConvexError({
      code: "INVALID",
      message: `Esta proposta já foi decidida (${aprovacao.status}).`,
    });
  }
  return aprovacao;
}

/**
 * O Matheus aprova — opcionalmente editando o texto antes.
 *
 * Grava a decisão COM AUTOR e agenda o outbox. O envio em si continua
 * dependendo do portão de saída; na Fase 1 ele recusa e a proposta fica
 * `aprovada`, nunca `executada`.
 */
export const aprovar = mutation({
  args: {
    approvalId: v.id("adminApprovals"),
    textoEditado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const aprovacao = await pendenteOuFalha(ctx, args.approvalId);

    const editado = args.textoEditado?.trim();
    const houveEdicao = Boolean(editado && editado !== aprovacao.proposta.texto);

    if (editado !== undefined && editado.length === 0) {
      throw new ConvexError({
        code: "INVALID",
        message: "Não é possível aprovar uma resposta vazia.",
      });
    }

    const agora = Date.now();
    await ctx.db.patch(args.approvalId, {
      status: houveEdicao ? "aprovada_editada" : "aprovada",
      textoAprovado: houveEdicao ? editado : undefined,
      decididoPorUserId: admin._id,
      decididoEm: agora,
    });

    if (aprovacao.conversationId) {
      await ctx.db.patch(aprovacao.conversationId, {
        status: "aberta",
        atualizadaEm: agora,
      });
    }

    // O outbox é a ÚNICA porta de saída. Ele decide se sai — e na Fase 1
    // decide que não sai.
    await ctx.scheduler.runAfter(0, internal.communicationsOutbox.executarAprovacao, {
      approvalId: args.approvalId,
    });

    return { status: houveEdicao ? "aprovada_editada" : "aprovada" };
  },
});

export const recusar = mutation({
  args: { approvalId: v.id("adminApprovals"), motivo: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await pendenteOuFalha(ctx, args.approvalId);

    await ctx.db.patch(args.approvalId, {
      status: "recusada",
      decididoPorUserId: admin._id,
      decididoEm: Date.now(),
      recusaMotivo: args.motivo?.trim() || "Recusada sem motivo registrado",
    });
  },
});

// ─── Uso interno pelo outbox e pela varredura ────────────────────────────────

export const obterParaEnvio = internalQuery({
  args: { approvalId: v.id("adminApprovals") },
  handler: async (ctx, args) => {
    const aprovacao = await ctx.db.get(args.approvalId);
    if (!aprovacao) return null;

    const conversa = aprovacao.conversationId
      ? await ctx.db.get(aprovacao.conversationId)
      : null;
    const contato = conversa ? await ctx.db.get(conversa.contactId) : null;

    const identidade = contato
      ? await ctx.db
          .query("communicationIdentities")
          .withIndex("by_contact", (q) => q.eq("contactId", contato._id))
          .filter((q) => q.eq(q.field("channel"), conversa!.channel))
          .first()
      : null;

    return {
      aprovacao: {
        _id: aprovacao._id,
        status: aprovacao.status,
        decididoPorUserId: aprovacao.decididoPorUserId ?? null,
        texto: aprovacao.textoAprovado ?? aprovacao.proposta.texto,
        vertical: aprovacao.vertical,
      },
      conversa: conversa
        ? {
            _id: conversa._id,
            channel: conversa.channel,
            janelaRespostaAte: conversa.janelaRespostaAte ?? null,
          }
        : null,
      destino: identidade?.externalId ?? null,
      optOut: contato?.optOut ?? false,
    };
  },
});

export const registrarResultadoDeEnvio = internalMutation({
  args: {
    approvalId: v.id("adminApprovals"),
    sucesso: v.boolean(),
    erro: v.optional(v.string()),
    externalMessageId: v.optional(v.string()),
    agora: v.number(),
  },
  handler: async (ctx, args) => {
    const aprovacao = await ctx.db.get(args.approvalId);
    if (!aprovacao) return;

    if (!args.sucesso) {
      // O BLOQUEIO DA FASE 1 NÃO É FALHA. A proposta continua `aprovada`: ela
      // foi decidida, só não pôde sair. Marcar `falhou` apagaria a diferença
      // entre "o Matheus aprovou e o ambiente está fechado" e "tentamos
      // enviar e a plataforma recusou".
      await ctx.db.patch(args.approvalId, { execucaoErro: args.erro });
      return;
    }

    await ctx.db.patch(args.approvalId, {
      status: "executada",
      executadaEm: args.agora,
      resultadoExternalMessageId: args.externalMessageId,
      execucaoErro: undefined,
    });
  },
});

/** Varredura diária: aprovação parada perde a validade junto com a janela. */
export const expirarPendentes = internalMutation({
  args: { agora: v.number() },
  handler: async (ctx, args) => {
    const pendentes = await ctx.db
      .query("adminApprovals")
      .withIndex("by_status_criadoEm", (q) => q.eq("status", "pendente"))
      .take(500);

    let expiradas = 0;
    for (const aprovacao of pendentes) {
      if (aprovacaoExpirou(aprovacao, args.agora)) {
        await ctx.db.patch(aprovacao._id, {
          status: "expirada",
          recusaMotivo: "Janela de resposta do canal encerrada antes da decisão",
        });
        expiradas++;
      }
    }
    return { expiradas };
  },
});

/**
 * Varredura diária da Central.
 *
 * Sem argumentos porque um cron agenda valores ESTÁTICOS — o instante tem de
 * ser lido aqui dentro, na hora em que roda.
 */
export const varreduraDiaria = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ expiradas: number }> => {
    return ctx.runMutation(internal.adminApprovals.expirarPendentes, { agora: Date.now() });
  },
});

/**
 * Diagnóstico do portão de saída, para a tela.
 *
 * Responde "se eu aprovar agora, sai?" SEM executar nada. Existe para que o
 * Matheus não descubra pelo silêncio que o ambiente está fechado.
 */
export const diagnosticoDoPortao = query({
  args: { approvalId: v.optional(v.id("adminApprovals")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const aprovacao = args.approvalId ? await ctx.db.get(args.approvalId) : null;
    const conversa = aprovacao?.conversationId
      ? await ctx.db.get(aprovacao.conversationId)
      : null;

    const veredicto = avaliarPortaoDeSaida({
      // Simula a decisão favorável: a pergunta é sobre o AMBIENTE, não sobre
      // o estado atual da proposta.
      statusDaAprovacao: "aprovada",
      decididoPorUserId: "simulado",
      envioHabilitadoBruto: process.env.ALTAR_CENTRAL_ENVIO_HABILITADO,
      janelaRespostaAte: conversa?.janelaRespostaAte ?? null,
      agora: Date.now(),
    });

    return {
      envioExterno:
        process.env.ALTAR_CENTRAL_ENVIO_HABILITADO?.trim() === "true" ? "ligado" : "desligado",
      sairia: veredicto.liberado,
      motivo: veredicto.liberado ? null : veredicto.motivo,
    };
  },
});
