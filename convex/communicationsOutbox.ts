import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { avaliarPortaoDeSaida } from "./lib/central/autonomia";
import { adaptadorDe } from "./lib/channels/registro";

// ═════════════════════════════════════════════════════════════════════════════
// A ÚNICA PORTA DE SAÍDA DA CENTRAL
//
// Este é o ÚNICO arquivo do backend que pode falar com o mundo em nome da
// ALTAR. Nenhuma outra função monta requisição de envio, e o teste estrutural
// `central.saida.test.ts` falha se alguma passar a montar.
//
// ── ORDEM DAS VERIFICAÇÕES ─────────────────────────────────────────────────
//   1. o portão (lib/central/autonomia) — aprovação, autor, env, janela
//   2. opt-out do contato
//   3. canal configurado
//   4. destino conhecido
//
// Só depois das quatro existe `fetch`. Na FASE 1 a verificação 1 sempre
// recusa, porque ALTAR_CENTRAL_ENVIO_HABILITADO não é "true" — e a função
// retorna ANTES de qualquer preparo de requisição.
//
// ── POR QUE O BLOQUEIO NÃO É ERRO ──────────────────────────────────────────
// Recusar não marca a aprovação como `falhou`. Ela continua `aprovada`: foi
// decidida por um humano, apenas não pôde sair. Confundir as duas coisas
// apagaria a diferença entre "o ambiente está fechado" e "a plataforma
// recusou a mensagem".
// ═════════════════════════════════════════════════════════════════════════════

export const executarAprovacao = internalAction({
  args: { approvalId: v.id("adminApprovals") },
  handler: async (ctx, args): Promise<{ enviado: boolean; motivo?: string }> => {
    const dados = await ctx.runQuery(internal.adminApprovals.obterParaEnvio, {
      approvalId: args.approvalId,
    });

    if (!dados) return { enviado: false, motivo: "Aprovação não encontrada." };

    const { aprovacao, conversa, destino, optOut } = dados;

    // ── 1. O PORTÃO ─────────────────────────────────────────────────────────
    const veredicto = avaliarPortaoDeSaida({
      statusDaAprovacao: aprovacao.status,
      decididoPorUserId: aprovacao.decididoPorUserId,
      envioHabilitadoBruto: process.env.ALTAR_CENTRAL_ENVIO_HABILITADO,
      janelaRespostaAte: conversa?.janelaRespostaAte,
      agora: Date.now(),
    });

    if (!veredicto.liberado) {
      await ctx.runMutation(internal.adminApprovals.registrarResultadoDeEnvio, {
        approvalId: args.approvalId,
        sucesso: false,
        erro: veredicto.motivo,
        agora: Date.now(),
      });
      return { enviado: false, motivo: veredicto.motivo };
    }

    // ── 2. OPT-OUT ──────────────────────────────────────────────────────────
    if (optOut) {
      const motivo = "Contato pediu para não ser mais contatado.";
      await ctx.runMutation(internal.adminApprovals.registrarResultadoDeEnvio, {
        approvalId: args.approvalId,
        sucesso: false,
        erro: motivo,
        agora: Date.now(),
      });
      return { enviado: false, motivo };
    }

    // ── 3. CANAL ────────────────────────────────────────────────────────────
    const adaptador = conversa ? adaptadorDe(conversa.channel) : null;
    if (!adaptador || !adaptador.configurado()) {
      const motivo = "Canal não configurado neste ambiente.";
      await ctx.runMutation(internal.adminApprovals.registrarResultadoDeEnvio, {
        approvalId: args.approvalId,
        sucesso: false,
        erro: motivo,
        agora: Date.now(),
      });
      return { enviado: false, motivo };
    }

    // ── 4. DESTINO ──────────────────────────────────────────────────────────
    if (!destino) {
      const motivo = "Contato sem identidade conhecida neste canal.";
      await ctx.runMutation(internal.adminApprovals.registrarResultadoDeEnvio, {
        approvalId: args.approvalId,
        sucesso: false,
        erro: motivo,
        agora: Date.now(),
      });
      return { enviado: false, motivo };
    }

    // ── ENVIO ───────────────────────────────────────────────────────────────
    // Inalcançável na Fase 1: a verificação 1 já retornou acima.
    const requisicao = adaptador.prepararEnvio(destino, aprovacao.texto);

    try {
      const resposta = await fetch(requisicao.url, {
        method: requisicao.metodo,
        headers: requisicao.headers,
        body: requisicao.corpo,
      });

      if (!resposta.ok) {
        const corpo = await resposta.text();
        await ctx.runMutation(internal.adminApprovals.registrarResultadoDeEnvio, {
          approvalId: args.approvalId,
          sucesso: false,
          erro: `Canal recusou (${resposta.status}): ${corpo.slice(0, 500)}`,
          agora: Date.now(),
        });
        return { enviado: false, motivo: `Canal recusou (${resposta.status}).` };
      }

      const corpo = (await resposta.json()) as {
        messages?: { id?: string }[];
      };
      const externalMessageId = corpo.messages?.[0]?.id;

      await ctx.runMutation(internal.adminApprovals.registrarResultadoDeEnvio, {
        approvalId: args.approvalId,
        sucesso: true,
        externalMessageId,
        agora: Date.now(),
      });

      await ctx.runMutation(internal.communicationsTriage.registrarSaidaEnviada, {
        approvalId: args.approvalId,
        externalMessageId: externalMessageId ?? `local:${args.approvalId}`,
        agora: Date.now(),
      });

      return { enviado: true };
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : "Falha desconhecida no envio.";
      await ctx.runMutation(internal.adminApprovals.registrarResultadoDeEnvio, {
        approvalId: args.approvalId,
        sucesso: false,
        erro: motivo,
        agora: Date.now(),
      });
      return { enviado: false, motivo };
    }
  },
});
