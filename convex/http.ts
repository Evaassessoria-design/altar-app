import { httpRouter } from "convex/server";
import { asaasReceiver } from "./asaasWebhook";
import { authComponent, createAuth } from "./auth";
import { officeSnapshot } from "./officeBridgeHttp";

const http = httpRouter();

// Rotas de autenticação do Better Auth (login, cadastro, sessão, etc.)
authComponent.registerRoutes(http, createAuth, { cors: true });

// Webhook de pagamento Asaas — preservado exatamente como estava
http.route({
  path: "/asaas-webhook",
  method: "POST",
  handler: asaasReceiver,
});

// Ponte administrativa do Escritório Virtual ALTAR — somente leitura.
http.route({
  path: "/office-snapshot",
  method: "GET",
  handler: officeSnapshot,
});

export default http;
