import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  eventDedupKey,
  interpretAsaasWebhook,
  type AsaasWebhookBody,
} from "./lib/asaasEvents";

// Avisa o TypeScript que a variável global de ambiente do Node existe
declare const process: { env: Record<string, string | undefined> };

// ─────────────────────────────────────────────────────────────────────────────
// Receptor dos avisos do Asaas.
//
// A LEITURA do payload (qual evento é, de quem é) vive em lib/asaasEvents.ts,
// que é puro e testado. Aqui fica a autenticação do webhook, o REGISTRO do
// aviso e o despacho para as internalMutations.
//
// ── O REGISTRO NÃO É ENFEITE ────────────────────────────────────────────────
// Um pagamento confirmado em produção não ativou a assinatura, e a pergunta
// "o aviso chegou?" era impossível de responder porque nada era guardado.
// Agora todo aviso vira uma linha com o desfecho: aplicado, repetido, sem dono,
// ignorado ou erro. Sem isso, o próximo problema seria investigado às cegas
// exatamente como este foi.
//
// ── SEMPRE 200, MENOS QUANDO O SEGREDO NÃO BATE ─────────────────────────────
// Um erro nosso não pode virar erro de entrega: o Asaas PAUSA a fila depois de
// algumas falhas seguidas, e uma fila pausada interrompe as ativações de TODOS
// os clientes. Falha de processamento fica gravada como "error" e o Asaas
// recebe 200.
// ─────────────────────────────────────────────────────────────────────────────

export const asaasReceiver = httpAction(async (ctx, request) => {
  const asaasToken = request.headers.get("asaas-access-token");
  const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;

  if (!asaasToken || asaasToken !== webhookSecret) {
    return new Response("Acesso Proibido", { status: 401 });
  }

  const body = (await request.json()) as AsaasWebhookBody;
  const intent = interpretAsaasWebhook(body);
  const dedupKey = eventDedupKey(body);
  const evento = body.event ?? "SEM_EVENTO";

  // ── Reserva da chave: é aqui que a idempotência acontece ──────────────────
  // A checagem e a inserção estão na MESMA mutation, que é transacional. Duas
  // entregas simultâneas do mesmo aviso não conseguem as duas reservar.
  const reserva = await ctx.runMutation(internal.asaasWebhookLog.claim, {
    dedupKey,
    event: evento,
    asaasCustomerId: intent.customerId,
    asaasSubscriptionId: intent.subscriptionId,
    asaasPaymentId: body.payment?.id,
    value: body.payment?.value ?? body.subscription?.value,
  });

  if (reserva.status === "duplicate") {
    await ctx.runMutation(internal.asaasWebhookLog.recordDuplicate, { dedupKey, event: evento });
    return new Response(JSON.stringify({ status: "duplicate" }), { status: 200 });
  }

  const chaves = {
    externalReference: intent.externalReference,
    asaasSubscriptionId: intent.subscriptionId,
    asaasCustomerId: intent.customerId,
  };

  try {
    let resultado: { matchedBy: string; conflito: boolean; userId?: string } | null = null;

    switch (intent.action) {
      // Ativa a assinatura do usuário (Arquitetura A: status vive no próprio
      // usuário). Idempotente — reprocessar o mesmo aviso apenas reafirma "active".
      case "activate":
        resultado = await ctx.runMutation(
          internal.users.activateSubscriptionByAsaasRef,
          chaves,
        );
        break;

      // Atraso NÃO é cancelamento imediato. O Asaas continua tentando recobrar; se
      // desistir, manda SUBSCRIPTION_DELETED. Até lá vale o período de tolerância
      // definido em lib/access.ts — o acesso é mantido por alguns dias e só então
      // bloqueado. A mutation grava QUANDO o atraso começou, que é o que faz a
      // tolerância ter fim.
      case "overdue":
        resultado = await ctx.runMutation(internal.users.markSubscriptionOverdueByRef, chaves);
        break;

      // Cancelamentos e estornos, pela mesma cascata de chaves da ativação.
      case "cancel":
        resultado = await ctx.runMutation(internal.users.cancelSubscriptionByAsaasRef, chaves);
        break;

      case "ignore":
        break;
    }

    if (intent.action === "ignore") {
      await ctx.runMutation(internal.asaasWebhookLog.finish, {
        id: reserva.id,
        outcome: "ignored",
        detail: `Evento sem efeito sobre cobrança: ${evento}`,
      });
    } else if (!resultado || resultado.matchedBy === "not_found") {
      // Dinheiro se moveu no Asaas e não achamos dono. É o silêncio que custou
      // o caso de produção — agora ele fica visível no Painel Administrativo.
      await ctx.runMutation(internal.asaasWebhookLog.finish, {
        id: reserva.id,
        outcome: "no_match",
        detail:
          "Nenhuma conta encontrada por externalReference, assinatura ou cliente. " +
          "Verifique o vínculo desta conta com o Asaas.",
      });
    } else {
      await ctx.runMutation(internal.asaasWebhookLog.finish, {
        id: reserva.id,
        outcome: "applied",
        matchedBy: resultado.matchedBy,
        userId: resultado.userId as never,
        detail: resultado.conflito
          ? "ATENÇÃO: mais de uma conta com o mesmo id do Asaas. Usada a mais antiga."
          : undefined,
      });
    }
  } catch (erro) {
    await ctx.runMutation(internal.asaasWebhookLog.finish, {
      id: reserva.id,
      outcome: "error",
      detail: erro instanceof Error ? erro.message.slice(0, 300) : "Falha desconhecida",
    });
  }

  return new Response(JSON.stringify({ status: "success" }), { status: 200 });
});
