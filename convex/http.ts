import { httpRouter } from "convex/server";
import { asaasReceiver } from "./asaasWebhook";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Rotas de autenticação do Better Auth (login, cadastro, sessão, etc.)
authComponent.registerRoutes(http, createAuth, { cors: true });

// Webhook de pagamento Asaas — preservado exatamente como estava
http.route({
  path: "/asaas-webhook",
  method: "POST",
  handler: asaasReceiver,
});

export default http;
