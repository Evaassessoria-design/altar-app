import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { hasValidOfficeToken } from "./lib/officeBridgeAuth";

// ═════════════════════════════════════════════════════════════════════════════
// PONTE DA CENTRAL PARA O ESCRITÓRIO 3D — SOMENTE LEITURA
//
// O Escritório 3D é VISÃO EXECUTIVA E DE COMANDO. Ele enxerga o volume, a
// fila e a pressão; a operação inteira acontece no Painel Admin ALTAR.
//
// ── POR QUE UM SEGUNDO TOKEN ───────────────────────────────────────────────
// `/office-snapshot` trafega apenas métricas agregadas e continua exatamente
// como está, com `ALTAR_OFFICE_API_TOKEN`. Estas rotas trafegam DADO DE
// PESSOA. Um token separado (`ALTAR_OFFICE_CENTRAL_TOKEN`) significa que
// vazar o token de métricas não expõe conversa nenhuma.
//
// ── NENHUMA ESCRITA, POR DECISÃO ───────────────────────────────────────────
// Não há rota de aprovação aqui. Aprovar exige saber QUEM aprovou, e o token
// autentica um serviço, não uma pessoa. Enquanto o Escritório 3D não
// autenticar o Matheus do lado dele, aprovação acontece só no Painel Admin,
// atrás de `requireAdmin`. Aprovação sem autor não é aprovação.
// ═════════════════════════════════════════════════════════════════════════════

function json(payload: unknown, status: number, extraHeaders?: HeadersInit) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

/** Autentica a ponte da Central. Segredo distinto do de métricas. */
function autorizar(request: Request): Response | null {
  const esperado = process.env.ALTAR_OFFICE_CENTRAL_TOKEN?.trim();

  if (!esperado) {
    return json({ error: "Ponte da Central não configurada." }, 503);
  }
  if (!hasValidOfficeToken(request, esperado)) {
    return json({ error: "Não autorizado." }, 401, {
      "WWW-Authenticate": 'Bearer realm="altar-office-central"',
    });
  }
  return null;
}

/**
 * Indicadores da Central para a sala 3D.
 *
 * Contagens e pressão por departamento. NENHUM nome, telefone ou conteúdo de
 * mensagem — é a mesma disciplina de `/office-snapshot`, aplicada a uma
 * superfície nova.
 */
export const centralPainel = httpAction(async (ctx, request) => {
  const negado = autorizar(request);
  if (negado) return negado;

  const painel = await ctx.runQuery(internal.communications.painelInterno, {
    agora: Date.now(),
  });
  return json(painel, 200);
});
