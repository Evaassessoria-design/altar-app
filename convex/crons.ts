import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Generate daily alerts every day at 8am UTC (5am BRT)
// Começa no primeiro lote; a própria varredura agenda os seguintes até o fim
// da base (convex/notifications.ts).
crons.daily(
  "generate daily notifications",
  { hourUTC: 8, minuteUTC: 0 },
  internal.notifications.generateDailyAlerts,
  {},
);

// Confere diariamente as contas que têm cliente no Asaas e ainda não constam
// como ativas. É a rede de segurança para quando o aviso de pagamento não
// chega — fila pausada no Asaas, evento não habilitado, segredo trocado. Sem
// ela, um cliente que pagou fica preso no paywall até reclamar.
//
// Só ATIVA. Nunca rebaixa ninguém: cancelamento e inadimplência continuam
// vindo exclusivamente dos avisos do Asaas.
crons.daily(
  "conferir assinaturas no asaas",
  { hourUTC: 9, minuteUTC: 0 },
  internal.asaas.reconcileStaleSubscriptions,
  {},
);

// Varredura da Central de Comunicações.
//
// Uma proposta de resposta parada perde a validade junto com a janela de 24h
// do canal que a motivou: aprovar depois disso produziria uma mensagem que o
// WhatsApp já não aceita. Marcar `expirada` mantém a fila do Matheus com o
// que ainda é decidível — e o registro do que não foi decidido a tempo.
//
// NÃO envia nada, NÃO cobra nada e NÃO altera conversa. Só a fila.
crons.daily(
  "varredura da central de comunicacoes",
  { hourUTC: 7, minuteUTC: 30 },
  internal.adminApprovals.varreduraDiaria,
  {},
);

export default crons;
