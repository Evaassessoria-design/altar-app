import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// A PROPOSTA ACEITA CHEGA AO EVENTO
//
// ── O DEFEITO (homologação de 14/10) ────────────────────────────────────────
// A proposta feita no funil nasce com `leadId`. A Jornada do evento e o cartão
// "Proposta comercial" leem `proposals.by_event` — e nenhum caminho passava o
// `eventId` para ela. Resultado: a cliente aceitava, a decoradora convertia o
// lead, e o evento recém-nascido dizia "Sem orçamento nem proposta".
//
// ── A CORREÇÃO TEM DUAS METADES ─────────────────────────────────────────────
//  1. ESCRITA, na conversão (`vincularPropostasDoLead`): as propostas do lead
//     que ainda não têm evento passam a apontar para o evento criado. O
//     `leadId` FICA — o funil continua contando a proposta no card do lead, e
//     a origem comercial não se perde.
//  2. LEITURA, para os eventos convertidos ANTES desta correção
//     (`propostasDoEvento`): o evento acha o lead de origem pelo índice
//     `leads.by_converted_event` e soma as propostas dele que não têm evento.
//     Sem backfill e sem migração: o dado antigo não é reescrito, ele é lido
//     pelo caminho que sempre existiu (lead → evento).
//
// ── O QUE NÃO É VINCULADO ───────────────────────────────────────────────────
// Proposta que já aponta para OUTRO evento vivo fica onde está: alguém a
// ligou lá de propósito, e "consertar" isso seria reescrever a decisão dela.
// Só o ponteiro MORTO (evento apagado) é religado.
//
// ── ESCALA ──────────────────────────────────────────────────────────────────
// Tudo por índice e com teto: propostas de UM lead, leads de UM evento. Nenhuma
// varredura da conta na consulta quente da tela do evento.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Teto de propostas por lead. Um lead real tem uma, duas, às vezes cinco
 * (revisões, aditivos). Cinquenta é folga de uma ordem de grandeza — e o teto
 * existe para que um dado patológico não transforme a tela do evento numa
 * varredura.
 */
export const LIMITE_DE_PROPOSTAS_POR_LEAD = 50;

/** Teto de leads de origem por evento. Normalmente é um. */
const LIMITE_DE_LEADS_DE_ORIGEM = 5;

/**
 * Liga ao evento as propostas do lead que ainda não têm evento.
 *
 * Idempotente: rodar duas vezes (conversão repetida, Enter duplo) não muda
 * nada na segunda. Só toca propostas da MESMA conta do lead — o índice
 * `by_lead` não sabe de dono, quem sabe é o `userId` de cada linha.
 *
 * Devolve quantas foram religadas, para o teste poder afirmar.
 */
export async function vincularPropostasDoLead(
  ctx: MutationCtx,
  lead: Doc<"leads">,
  eventId: Id<"events">,
): Promise<number> {
  const propostas = await ctx.db
    .query("proposals")
    .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
    .take(LIMITE_DE_PROPOSTAS_POR_LEAD);

  let religadas = 0;
  for (const p of propostas) {
    if (p.userId !== lead.userId) continue;
    if (p.eventId === eventId) continue;
    if (p.eventId) {
      // Aponta para outro evento. Só religa se aquele evento não existe mais.
      const outro = await ctx.db.get(p.eventId);
      if (outro) continue;
    }
    // Sem `comCarimbo` de propósito: o vínculo é do sistema, não uma edição da
    // decoradora, e "última alteração" mentiria sobre quando ela mexeu.
    await ctx.db.patch(p._id, { eventId });
    religadas += 1;
  }
  return religadas;
}

/**
 * Todas as propostas do evento: as ligadas a ele E as do lead que o originou
 * e ainda não têm evento (eventos convertidos antes da correção).
 *
 * `event` já deve ter passado pela checagem de posse; mesmo assim cada linha
 * é filtrada pelo dono, porque índice não é fronteira de conta.
 */
export async function propostasDoEvento(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<Doc<"proposals">[]> {
  const diretas = await ctx.db
    .query("proposals")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .collect();

  const leadsDeOrigem = await ctx.db
    .query("leads")
    .withIndex("by_converted_event", (q) => q.eq("convertedEventId", event._id))
    .take(LIMITE_DE_LEADS_DE_ORIGEM);

  const vistas = new Set<string>();
  const todas: Doc<"proposals">[] = [];
  for (const p of diretas) {
    if (p.userId !== event.userId) continue;
    vistas.add(p._id);
    todas.push(p);
  }

  for (const lead of leadsDeOrigem) {
    if (lead.userId !== event.userId) continue;
    const doLead = await ctx.db
      .query("proposals")
      .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
      .take(LIMITE_DE_PROPOSTAS_POR_LEAD);
    for (const p of doLead) {
      // Só as SEM evento: a que aponta para outro evento é de lá.
      if (p.userId !== event.userId || p.eventId || vistas.has(p._id)) continue;
      vistas.add(p._id);
      todas.push(p);
    }
  }
  return todas;
}
