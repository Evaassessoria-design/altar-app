// ─────────────────────────────────────────────────────────────────────────────
// SITUAÇÃO DO FORNECEDOR NO EVENTO
//
// Cotação → negociação → contratado → confirmado → finalizado. É a leitura que
// a decoradora faz do vínculo, não do fornecedor: o mesmo florista pode estar
// "confirmado" num casamento e "em cotação" noutro.
//
// ── POR QUE FORA DA TELA ────────────────────────────────────────────────────
// A lista morava dentro de `events/[id]/fornecedores/page.tsx`. Quando a
// página do fornecedor passou a exibir a mesma situação, copiá-la teria criado
// a segunda cópia — e o comentário daquela tela já registra que uma cópia
// anterior existiu e foi eliminada justamente por divergir.
//
// Os VALORES são os do schema (`eventSuppliers.status`); aqui só moram o
// rótulo humano e a cor.
// ─────────────────────────────────────────────────────────────────────────────

export type SupplierStatus =
  | "cotacao"
  | "em_negociacao"
  | "contratado"
  | "confirmado"
  | "finalizado";

export const SUPPLIER_STATUSES: readonly {
  value: SupplierStatus;
  label: string;
  cls: string;
}[] = [
  { value: "cotacao", label: "Cotação", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "em_negociacao", label: "Em negociação", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "contratado", label: "Contratado", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "confirmado", label: "Confirmado", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "finalizado", label: "Finalizado", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
];

/**
 * O rótulo de uma situação, ou o próprio valor quando ele não é conhecido.
 *
 * Valor desconhecido aparece cru em vez de sumir: um status gravado por uma
 * versão futura tem de ser visível, não invisível.
 */
export function rotuloDaSituacao(status: string | undefined): string | undefined {
  if (!status) return undefined;
  return SUPPLIER_STATUSES.find((s) => s.value === status)?.label ?? status;
}
