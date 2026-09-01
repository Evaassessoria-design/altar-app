import { query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getOwnedEvent, requireUser } from "./lib/identity";
import { montarResumoOperacional } from "./lib/eventSummary";

// ─────────────────────────────────────────────────────────────────────────────
// SAÚDE DO EVENTO (CORE). Calculada SOMENTE a partir de dados reais já existentes
// no ALTAR — nada é inventado. Cada "check" é um sinal objetivo. O percentual é
// checks aprovados / total. Status: 🟢 completo · 🟡 atenção · 🔴 faltam infos.
// ─────────────────────────────────────────────────────────────────────────────

type HealthCheck = { key: string; label: string; ok: boolean };
export type EventHealth = {
  percent: number;
  status: "complete" | "attention" | "incomplete";
  checks: HealthCheck[];
  attention: string[];
  guestCount?: string;
  assessoria?: string;
  responsible?: string;
};

async function computeHealth(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<EventHealth> {
  const eventId = event._id;
  const [contractDocs, txs, suppliers, team, briefing, assemblyItems] = await Promise.all([
    ctx.db.query("contracts").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("transactions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("eventSuppliers").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("eventTeam").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("briefings").withIndex("by_event", (q) => q.eq("eventId", eventId)).unique(),
    ctx.db.query("assemblyItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
  ]);
  // Documentos sem `kind` são contratos legados (compat. com dados anteriores à multi-documento).
  const contract = contractDocs.find((c) => (c.kind ?? "contract") === "contract");

  const checks: HealthCheck[] = [
    { key: "evento", label: "Dados do evento", ok: !!(event.name && event.date && event.location && event.clientName) },
    { key: "contrato", label: "Contrato anexado", ok: !!contract },
    { key: "contrato_ia", label: "Contrato analisado", ok: !!event.contractAnalyzedAt },
    { key: "financeiro", label: "Financeiro", ok: txs.length > 0 },
    { key: "fornecedores", label: "Fornecedores", ok: suppliers.length > 0 },
    // ── POR QUE "ASSESSORIA DEFINIDA" SAIU ──────────────────────────────────
    // Exigir uma assessoria cadastrada tratava um fornecedor DO CLIENTE como
    // requisito do evento DELA. Aniversário, corporativo, formatura e festa
    // infantil costumam não ter assessoria nenhuma — e casamento também pode
    // não ter. Esses eventos ficavam com uma marca vermelha permanente, por
    // uma ausência que não é falha.
    //
    // No lugar entrou o que É a operação da decoradora: existe projeto de
    // montagem? Usa `assemblyItems`, que já alimenta o Caderno de Montagem, o
    // Projeto de Decoração e o Carregamento. Nenhuma regra nova, nenhum
    // módulo novo — só um dado que já existe.
    { key: "montagem", label: "Montagem planejada", ok: assemblyItems.length > 0 },
    { key: "responsavel", label: "Responsável definido", ok: team.length > 0 },
    { key: "briefing", label: "Convidados (briefing)", ok: !!briefing?.guestCount?.trim() },
  ];

  // Pontos de atenção — apenas ausências objetivas (nada presumido/inventado).
  const attention: string[] = [];
  if (!contract) attention.push("Contrato ainda não anexado");
  else if (!event.contractAnalyzedAt) attention.push("Contrato ainda não processado");
  if (team.length === 0) attention.push("Responsável do evento não definido");
  if (suppliers.length === 0) attention.push("Nenhum fornecedor cadastrado");
  for (const s of suppliers) {
    if (!s.contactName) attention.push(`Fornecedor sem responsável: ${s.companyName}`);
    if (!s.status) attention.push(`Fornecedor sem status: ${s.companyName}`);
    if (!(s.alignments && s.alignments.length > 0)) attention.push(`Fornecedor sem alinhamento: ${s.companyName}`);
  }
  for (const p of event.contractPendings ?? []) attention.push(p);

  const passed = checks.filter((c) => c.ok).length;
  const percent = Math.round((passed / checks.length) * 100);
  const status = percent >= 80 ? "complete" : percent >= 50 ? "attention" : "incomplete";

  let responsible: string | undefined;
  if (team[0]) {
    const member = await ctx.db.get(team[0].teamMemberId);
    responsible = member?.name;
  }

  return {
    percent,
    status,
    checks,
    attention: attention.slice(0, 12),
    guestCount: briefing?.guestCount ?? undefined,
    assessoria: suppliers.find((s) => s.category === "assessoria")?.companyName,
    responsible,
  };
}

// Lista de eventos com os campos do card + saúde (resumo). Reutiliza `events`.
export const listCards = query({
  args: {
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("upcoming"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const all = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const nowIso = new Date().toISOString();
    const filter = args.filter ?? "all";
    const events = all
      .filter((e) => {
        switch (filter) {
          case "upcoming":
            return e.date >= nowIso && e.status !== "completed" && e.status !== "cancelled";
          case "completed":
            return e.status === "completed";
          case "cancelled":
            return e.status === "cancelled";
          default:
            return true;
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return Promise.all(
      events.map(async (event) => {
        const h = await computeHealth(ctx, event);
        return {
          ...event,
          health: { percent: h.percent, status: h.status },
          guestCount: h.guestCount,
          assessoria: h.assessoria,
          responsible: h.responsible,
        };
      }),
    );
  },
});

// Saúde completa de um evento (para a seção dentro do evento).
export const getEventHealth = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return null;
    return computeHealth(ctx, event);
  },
});

/**
 * RESUMO OPERACIONAL — "está tudo bem com este evento?" em contagens reais.
 *
 * Complementa (não substitui) `getEventHealth`, que mede se o CADASTRO está
 * completo. Aqui a pergunta é outra: quantas compras faltam, quantos
 * fornecedores ainda não confirmaram, quem já tem horário de chegada.
 *
 * Toda a aritmética vive em lib/eventSummary.ts, pura e testada. Esta query só
 * lê e repassa — nenhum número nasce aqui.
 *
 * Degrada para `null` quando o evento não é do usuário, seguindo o mesmo
 * padrão de `getEventHealth`.
 */
export const getEventSummary = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return null;
    const eventId = event._id;

    const [checklist, compras, fornecedores, equipe, carregamento, transacoes] =
      await Promise.all([
        ctx.db
          .query("checklistItems")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect(),
        ctx.db
          .query("purchaseItems")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect(),
        ctx.db
          .query("eventSuppliers")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect(),
        ctx.db
          .query("eventTeam")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect(),
        ctx.db
          .query("assemblyItems")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect(),
        ctx.db
          .query("transactions")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect(),
      ]);

    return montarResumoOperacional({
      checklistPre: checklist.filter((i) => i.phase === "pre"),
      checklistPos: checklist.filter((i) => i.phase === "post"),
      compras,
      fornecedores,
      equipe,
      carregamento,
      transacoes,
    });
  },
});
