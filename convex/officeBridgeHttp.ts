import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { hasValidOfficeToken } from "./lib/officeBridgeAuth";

function json(payload: unknown, status: number, extraHeaders?: HeadersInit) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

/**
 * Ponte servidor-a-servidor usada pelo Escritório Virtual ALTAR.
 *
 * Somente leitura, sem CORS e sem dados individuais. O segredo existe apenas
 * nas variáveis protegidas dos dois serviços e nunca é enviado ao navegador.
 */
export const officeSnapshot = httpAction(async (ctx, request) => {
  const expectedToken = process.env.ALTAR_OFFICE_API_TOKEN?.trim();

  if (!expectedToken) {
    return json({ error: "Integração administrativa não configurada." }, 503);
  }

  if (!hasValidOfficeToken(request, expectedToken)) {
    return json({ error: "Não autorizado." }, 401, {
      "WWW-Authenticate": 'Bearer realm="altar-office"',
    });
  }

  const snapshot = await ctx.runQuery(internal.admin.getOfficeSnapshot, {
    now: Date.now(),
  });
  return json(snapshot, 200);
});
