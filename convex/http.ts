import { httpRouter } from "convex/server";
import { asaasReceiver } from "./asaasWebhook";
import { authComponent, createAuth } from "./auth";
import { officeSnapshot } from "./officeBridgeHttp";
import { centralPainel } from "./officeCentralHttp";
import { receberDoCanal, verificarCanal } from "./communicationsGateway";

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

// ── CENTRAL DE COMUNICAÇÕES — ENTRADA ────────────────────────────────────────
// Uma rota por canal. O WhatsApp é o primeiro; Instagram e e-mail entram aqui
// com duas linhas cada, sem tocar em mais nada do backend.
//
// GET  = handshake de verificação da plataforma (hub.challenge da Meta)
// POST = recebimento, autenticado por HMAC (produção) ou token local (mock)
http.route({
  path: "/channels/whatsapp/webhook",
  method: "GET",
  handler: verificarCanal,
});

http.route({
  path: "/channels/whatsapp/webhook",
  method: "POST",
  handler: receberDoCanal,
});

// ── CENTRAL DE COMUNICAÇÕES — PONTE DO ESCRITÓRIO 3D ─────────────────────────
// Somente leitura, token PRÓPRIO (ALTAR_OFFICE_CENTRAL_TOKEN), sem escrita
// administrativa. O 3D é visão executiva; a operação é o Painel Admin.
http.route({
  path: "/office/central/painel",
  method: "GET",
  handler: centralPainel,
});

export default http;
