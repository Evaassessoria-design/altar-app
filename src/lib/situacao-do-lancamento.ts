import { estadoDaParcela, type ParcelaLike } from "../../convex/lib/pagamentosDoEvento.ts";

// A SITUAÇÃO de um lançamento na lista do Financeiro: recebido/pago, pendente
// ou parcial. Derivada da mesma regra da aba Pagamentos da cliente
// (`estadoDaParcela`) — nunca gravada, para as duas telas não discordarem.

export type Situacao = "recebido" | "parcial" | "pendente";

type Lancamento = ParcelaLike & { type: "income" | "expense"; eventId?: unknown };

/** Receita de evento: só se baixa por recebimento (ver `exigirBaixaPorRecebimento`). */
export const receitaDeEvento = (tx: { type: string; eventId?: unknown }) =>
  tx.type === "income" && !!tx.eventId;

export function situacaoDoLancamento(tx: Lancamento): Situacao {
  // Despesa não tem recebimentos: o "pago" é o que vale.
  if (tx.type === "expense") return tx.isPaid ? "recebido" : "pendente";
  const estado = estadoDaParcela(tx);
  return estado === "recebida" ? "recebido" : estado;
}

/** "Pago" para despesa, "Recebido" para receita. */
export function rotuloDaSituacao(tipo: "income" | "expense", s: Situacao): string {
  if (s === "recebido") return tipo === "expense" ? "Pago" : "Recebido";
  return s === "parcial" ? "Parcial" : "Pendente";
}

export const COR_DA_SITUACAO: Record<Situacao, string> = {
  recebido: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  parcial: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300",
  pendente: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
};
