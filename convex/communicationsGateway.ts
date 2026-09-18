import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { adaptadorDe } from "./lib/channels/registro";
import { ehCanal } from "./lib/channels/tipos";
import { verticalDoAmbiente } from "./lib/central/vertical";

// ═════════════════════════════════════════════════════════════════════════════
// GATEWAY DE ENTRADA — AGNÓSTICO DE CANAL
//
// Uma rota por canal, um handler só. O que é específico do WhatsApp (formato
// do payload, assinatura HMAC, telefone) vive em lib/channels/whatsapp.ts;
// aqui não há nenhuma decisão sobre canal além de "qual adaptador responde
// por este nome".
//
// ── A PORTA NUNCA FICA DESTRANCADA ─────────────────────────────────────────
// Não existe caminho que aceite um POST sem autenticação:
//
//   canal desconhecido           → 404
//   canal sem adaptador          → 404
//   canal não configurado        → 503  (ausência de config FECHA a porta)
//   autenticação falhou          → 401
//
// Só depois disso o corpo é lido como mensagem.
//
// ── POR QUE RESPONDER 200 A PAYLOAD ESTRANHO ───────────────────────────────
// A Meta reenvia qualquer webhook que não receba 200 rapidamente. Devolver
// erro para um payload que simplesmente não contém mensagem (status de
// entrega, por exemplo) criaria uma fila de reentrega infinita. O evento é
// registrado como `ignored` em `integrationEvents` e a resposta é 200 — mesmo
// contrato de convex/asaasWebhook.ts.
// ═════════════════════════════════════════════════════════════════════════════

function json(payload: unknown, status: number) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Nome do canal a partir de `/channels/<canal>/webhook`. */
function canalDaRota(url: URL): string | null {
  const partes = url.pathname.split("/").filter(Boolean);
  // ["channels", "<canal>", "webhook"]
  if (partes.length !== 3 || partes[0] !== "channels" || partes[2] !== "webhook") return null;
  return partes[1];
}

/**
 * Handshake de verificação da plataforma (GET).
 *
 * A Meta chama esta rota uma vez, na configuração do webhook, e espera o
 * `hub.challenge` de volta em texto puro.
 */
export const verificarCanal = httpAction(async (_ctx, request) => {
  const url = new URL(request.url);
  const canal = canalDaRota(url);
  if (!canal || !ehCanal(canal)) return new Response("Canal desconhecido.", { status: 404 });

  const adaptador = adaptadorDe(canal);
  if (!adaptador) return new Response("Canal sem adaptador.", { status: 404 });

  const desafio = adaptador.desafioDeVerificacao(url);
  if (desafio === null) return new Response("Verificação recusada.", { status: 403 });

  return new Response(desafio, {
    status: 200,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
});

export const receberDoCanal = httpAction(async (ctx, request) => {
  const recebidoEm = Date.now();
  const url = new URL(request.url);
  const canal = canalDaRota(url);

  if (!canal || !ehCanal(canal)) return json({ erro: "Canal desconhecido." }, 404);

  const adaptador = adaptadorDe(canal);
  if (!adaptador) return json({ erro: "Canal sem adaptador." }, 404);

  if (!adaptador.configurado()) {
    // Ausência de configuração FECHA a porta. Nunca a abre.
    return json({ erro: "Canal não configurado neste ambiente." }, 503);
  }

  // A assinatura é calculada sobre BYTES, então o corpo é lido como texto
  // antes de qualquer parse.
  const corpoCru = await request.text();

  const verificacao = await adaptador.verificarEntrada(corpoCru, request.headers);
  if (!verificacao.ok) {
    // Não registramos o evento: um POST não autenticado não é um evento nosso,
    // e gravá-lo deixaria a trilha de auditoria à mercê de qualquer um.
    return json({ erro: verificacao.motivo }, 401);
  }

  const vertical = verticalDoAmbiente();
  const provider = process.env.ALTAR_WHATSAPP_PROVIDER?.trim() || "meta_cloud";

  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    await ctx.runMutation(internal.communications.registrarEventoBruto, {
      vertical,
      provider,
      channel: canal,
      event: "payload_invalido",
      dedupKey: `${canal}:invalido:${recebidoEm}`,
      outcome: "error",
      erro: "Corpo não é JSON válido.",
      recebidoEm,
    });
    return json({ recebido: true, mensagens: 0 }, 200);
  }

  const mensagens = adaptador.normalizar(corpo);

  if (mensagens.length === 0) {
    await ctx.runMutation(internal.communications.registrarEventoBruto, {
      vertical,
      provider,
      channel: canal,
      event: "sem_mensagem",
      dedupKey: `${canal}:sem_mensagem:${recebidoEm}`,
      outcome: "ignored",
      recebidoEm,
    });
    return json({ recebido: true, mensagens: 0 }, 200);
  }

  const { resultados } = await ctx.runMutation(internal.communications.registrarEntrada, {
    vertical,
    provider,
    mensagens,
    recebidoEm,
  });

  return json(
    {
      recebido: true,
      mensagens: resultados.length,
      aplicadas: resultados.filter((r) => r.outcome === "applied").length,
      duplicadas: resultados.filter((r) => r.outcome === "duplicate").length,
    },
    200,
  );
});
