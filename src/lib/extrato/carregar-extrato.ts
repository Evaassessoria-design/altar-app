import type { ConvexReactClient } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import type { LancamentoDoExtrato } from "@/convex/lib/extrato.ts";
import type { EventoDoExtrato } from "./documento-do-extrato.ts";

// ─────────────────────────────────────────────────────────────────────────────
// LER TUDO, PÁGINA POR PÁGINA
//
// O extrato não pode parar na página visível nem em "500 lançamentos": pede
// página após página até o servidor dizer `isDone`. A contagem lida volta
// junto, e o documento a imprime — quem confere vê que nada ficou de fora.
// ─────────────────────────────────────────────────────────────────────────────

export const TAMANHO_DA_PAGINA = 250;

export async function lerTodosOsLancamentos(
  convex: Pick<ConvexReactClient, "query">,
  aoLer?: (lidos: number) => void,
): Promise<LancamentoDoExtrato[]> {
  const todos: LancamentoDoExtrato[] = [];
  let cursor: string | null = null;
  // Um teto de voltas evita laço infinito se o servidor responder mal; com
  // 250 por página, 4.000 voltas é um milhão de lançamentos.
  for (let volta = 0; volta < 4000; volta++) {
    const r: { page: LancamentoDoExtrato[]; isDone: boolean; continueCursor: string } = await convex.query(
      api.financeiro.extratoPagina,
      { paginationOpts: { numItems: TAMANHO_DA_PAGINA, cursor } },
    );
    todos.push(...r.page);
    aoLer?.(todos.length);
    if (r.isDone) return todos;
    cursor = r.continueCursor;
  }
  throw new Error("O extrato não terminou de ler os lançamentos.");
}

export async function lerEventosDoExtrato(
  convex: Pick<ConvexReactClient, "query">,
  ids: readonly string[],
): Promise<Map<string, EventoDoExtrato>> {
  const unicos = [...new Set(ids)];
  const mapa = new Map<string, EventoDoExtrato>();
  for (let i = 0; i < unicos.length; i += 200) {
    const parte = unicos.slice(i, i + 200) as Id<"events">[];
    const eventos = await convex.query(api.financeiro.eventosDoExtrato, { ids: parte });
    for (const e of eventos) mapa.set(e._id, { name: e.name, clientName: e.clientName });
  }
  return mapa;
}
