import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { ReservaParaCalculo } from "./acervo";

// ─────────────────────────────────────────────────────────────────────────────
// A RESERVA COMO A CONTA DE DISPONIBILIDADE PRECISA LER
//
// A regra (`lib/acervo.ts`) é pura e não lê banco; ela precisa saber, de cada
// reserva, se o EVENTO dela foi cancelado — dado que mora em `events`, não na
// reserva. Antes de 30/09 cada tela montava a reserva do seu jeito, e nenhuma
// mandava o cancelamento: o evento desmarcado continuava segurando peça.
//
// Um lugar só monta a reserva para cálculo, para a próxima tela que ler
// disponibilidade não esquecer de novo.
// ─────────────────────────────────────────────────────────────────────────────

/** Reserva do banco + o cancelamento do evento, no formato da regra. */
export function paraCalculo(
  r: Doc<"collectionReservations">,
  cancelados: ReadonlySet<string>,
): ReservaParaCalculo & { collectionItemId: string } {
  return {
    _id: r._id as string,
    eventId: r.eventId as string,
    collectionItemId: r.collectionItemId as string,
    quantidade: r.quantidade,
    inicio: r.inicio,
    fim: r.fim,
    // O movimento real vai junto: sem ele, a peça que não voltou de um evento
    // encerrado some da conta de disponibilidade.
    saiu: r.saiu,
    voltou: r.voltou,
    eventoCancelado: cancelados.has(r.eventId as string),
  };
}

/**
 * Os eventos cancelados entre os ids pedidos. Uma leitura por evento DISTINTO
 * — as reservas de um item tocam poucos eventos.
 */
export async function eventosCancelados(
  ctx: QueryCtx | MutationCtx,
  ids: readonly Id<"events">[],
): Promise<Set<string>> {
  const cancelados = new Set<string>();
  for (const id of new Set(ids)) {
    const evento = await ctx.db.get(id);
    if (evento?.status === "cancelled") cancelados.add(id as string);
  }
  return cancelados;
}

/**
 * Os eventos cancelados da conta inteira — para as telas que leem TODAS as
 * reservas de uma vez (galpão, pós-evento, painel). Uma consulta, pelo índice.
 */
export async function canceladosDoUsuario(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Set<string>> {
  const eventos = await ctx.db
    .query("events")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Set(eventos.filter((e) => e.status === "cancelled").map((e) => e._id as string));
}

/** Todas as reservas de um item, prontas para a regra. */
export async function reservasDoItem(ctx: QueryCtx | MutationCtx, itemId: Id<"collectionItems">) {
  const reservas = await ctx.db
    .query("collectionReservations")
    .withIndex("by_item", (q) => q.eq("collectionItemId", itemId))
    .collect();
  const cancelados = await eventosCancelados(ctx, reservas.map((r) => r.eventId));
  return reservas.map((r) => paraCalculo(r, cancelados));
}
