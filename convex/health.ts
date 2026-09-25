import { query } from "./_generated/server";
import { responsavelDoEvento } from "./lib/responsavel";
import { dataDoDia } from "./lib/dataDoDia";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getOwnedEvent, requireUser } from "./lib/identity";
import { montarResumoOperacional } from "./lib/eventSummary";
import { saudeDoEvento } from "./lib/saudeDoEvento";

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
  /** Telefone do responsável, quando ele é membro da equipe com telefone. */
  responsiblePhone?: string;
};

/**
 * A saúde de UM evento, lendo o banco por evento.
 *
 * Continua assim para a tela do evento, onde a pergunta é sobre um só e a
 * lista completa de avisos é usada. A LISTA não passa por aqui — ver
 * `listCards`, que lê em lote. A conta é a mesma nos dois caminhos
 * (`lib/saudeDoEvento.ts`); só a leitura muda.
 */
async function computeHealth(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<EventHealth> {
  const eventId = event._id;
  const [documentos, txs, fornecedores, escalas, briefing, itens] = await Promise.all([
    ctx.db.query("contracts").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("transactions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("eventSuppliers").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("eventTeam").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("briefings").withIndex("by_event", (q) => q.eq("eventId", eventId)).unique(),
    ctx.db.query("assemblyItems").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
  ]);

  const equipe = (await Promise.all(escalas.map((t) => ctx.db.get(t.teamMemberId))))
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .map((m) => ({ _id: m._id as string, name: m.name, role: m.role, phone: m.phone }));

  return saudeDoEvento({
    evento: event,
    documentos,
    temLancamento: txs.length > 0,
    fornecedores,
    equipe,
    guestCount: briefing?.guestCount,
    temItensDeMontagem: itens.length > 0,
  });
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

    // Dia, não instante — ver lib/dataDoDia.ts.
    const hoje = dataDoDia();
    const filter = args.filter ?? "all";
    const events = all
      .filter((e) => {
        switch (filter) {
          case "upcoming":
            return e.date >= hoje && e.status !== "completed" && e.status !== "cancelled";
          case "completed":
            return e.status === "completed";
          case "cancelled":
            return e.status === "cancelled";
          default:
            return true;
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── A SAÚDE DE TODOS, EM SETE CONSULTAS ────────────────────────────────
    // Antes: uma chamada de `computeHealth` por evento, e cada uma abria seis
    // consultas mais um `db.get` por pessoa escalada. Com os 40 eventos da
    // decoradora piloto isso era cerca de 360 operações de banco para desenhar
    // UMA tela — a primeira que ela abre, e a primeira de uma demonstração. A
    // 300 eventos passaria de 2.500.
    //
    // Agora as mesmas tabelas são lidas UMA VEZ, por dono, e agrupadas em
    // memória. O custo deixa de crescer com o número de eventos.
    //
    // A conta não mudou de lugar: é a mesma `saudeDoEvento` que a tela de um
    // evento usa. Duas pontuações diferentes para o mesmo evento seria o
    // defeito que separar leitura de cálculo existe para impedir.
    const [documentos, txs, fornecedores, escalas, briefings, itens, membros] =
      await Promise.all([
        ctx.db.query("contracts").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
        ctx.db.query("transactions").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
        ctx.db.query("eventSuppliers").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
        ctx.db.query("eventTeam").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
        ctx.db.query("briefings").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
        ctx.db.query("assemblyItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
        ctx.db.query("teamMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ]);

    /** Agrupa por evento de uma vez — um `filter` por evento seria O(n²). */
    function agrupar<T extends { eventId?: Id<"events"> }>(linhas: readonly T[]) {
      const mapa = new Map<string, T[]>();
      for (const linha of linhas) {
        if (!linha.eventId) continue;
        const atual = mapa.get(linha.eventId);
        if (atual) atual.push(linha);
        else mapa.set(linha.eventId, [linha]);
      }
      return mapa;
    }

    const docsPorEvento = agrupar(documentos);
    const txPorEvento = agrupar(txs);
    const fornecedoresPorEvento = agrupar(fornecedores);
    const escalasPorEvento = agrupar(escalas);
    const itensPorEvento = agrupar(itens);
    const briefingPorEvento = new Map(briefings.map((b) => [b.eventId as string, b]));
    const membroPorId = new Map(membros.map((m) => [m._id as string, m]));

    return events.map((event) => {
      const equipe = (escalasPorEvento.get(event._id) ?? [])
        .map((t) => membroPorId.get(t.teamMemberId))
        .filter((m): m is NonNullable<typeof m> => m !== undefined)
        .map((m) => ({ _id: m._id as string, name: m.name, role: m.role, phone: m.phone }));

      const h = saudeDoEvento({
        evento: event,
        documentos: docsPorEvento.get(event._id) ?? [],
        temLancamento: (txPorEvento.get(event._id) ?? []).length > 0,
        fornecedores: fornecedoresPorEvento.get(event._id) ?? [],
        equipe,
        guestCount: briefingPorEvento.get(event._id)?.guestCount,
        temItensDeMontagem: (itensPorEvento.get(event._id) ?? []).length > 0,
      });

      return {
        ...event,
        health: { percent: h.percent, status: h.status },
        guestCount: h.guestCount,
        assessoria: h.assessoria,
        responsible: h.responsible,
      };
    });
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
