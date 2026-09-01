import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Generate daily alerts every day at 8am UTC (5am BRT)
crons.daily(
  "generate daily notifications",
  { hourUTC: 8, minuteUTC: 0 },
  internal.notifications.generateDailyAlerts,
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

export default crons;
