// ─────────────────────────────────────────────────────────────────────────────
// SITUAÇÃO OPERACIONAL DE UMA COMPRA
//
// O fluxo real de uma empresa de decoração não é "comprado / não comprado":
//
//   Necessidade → Cotação → Aprovado → Comprado → Recebido
//                                                  (ou Cancelado)
//
// ── DUAS COISAS QUE NÃO PODEM SE MISTURAR ───────────────────────────────────
// `status` responde "em que ponto está a AQUISIÇÃO deste item".
// `transactions.isPaid` responde "esta despesa foi PAGA".
// São perguntas diferentes: dá para receber sem ter pago (boleto a prazo) e
// para pagar sem ter recebido (sinal antecipado). Este módulo não encosta em
// pagamento.
//
// ── COMPATIBILIDADE COM O DADO ANTIGO ───────────────────────────────────────
// `purchaseItems.isPurchased` (booleano) já existia e é lido pelo Resumo
// Operacional, pelo Dashboard e pelas notificações. Ele CONTINUA sendo a
// verdade sobre "já foi comprado?" — o `status` é uma leitura mais fina por
// cima dele.
//
// Item sem `status` (todos os anteriores a esta mudança) tem a situação
// DERIVADA de `isPurchased`. Nenhum backfill, nenhum registro invalidado.
//
// E o contrário também vale: mudar o `status` mantém `isPurchased` coerente,
// para que nenhuma tela contradiga outra.
// ─────────────────────────────────────────────────────────────────────────────

export const PURCHASE_STATUSES = [
  "necessidade",
  "cotacao",
  "aprovado",
  "comprado",
  "recebido",
  "cancelado",
] as const;

export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Situações em que o item já saiu do fornecedor para a decoradora. */
const JA_COMPRADO = new Set<PurchaseStatus>(["comprado", "recebido"]);

/** Situações que ainda exigem alguma ação de compra. */
const PENDENTE = new Set<PurchaseStatus>(["necessidade", "cotacao", "aprovado"]);

type PurchaseLike = { status?: string; isPurchased: boolean };

/**
 * Situação REAL de um item agora.
 *
 * Sem `status` gravado, deriva de `isPurchased` — é o que mantém todo item
 * cadastrado antes desta mudança exibindo algo verdadeiro.
 */
export function effectivePurchaseStatus(item: PurchaseLike): PurchaseStatus {
  if (item.status && (PURCHASE_STATUSES as readonly string[]).includes(item.status)) {
    return item.status as PurchaseStatus;
  }
  return item.isPurchased ? "comprado" : "necessidade";
}

/**
 * `isPurchased` correspondente a uma situação.
 *
 * Usado na gravação para as duas informações nunca divergirem: um item marcado
 * "recebido" com `isPurchased: false` faria o Resumo Operacional dizer que
 * falta comprar algo que já chegou no galpão.
 *
 * `cancelado` NÃO conta como comprado — o item saiu da lista de compras, não
 * foi adquirido.
 */
export function isPurchasedForStatus(status: PurchaseStatus): boolean {
  return JA_COMPRADO.has(status);
}

/** Ainda exige ação da decoradora. `cancelado` e `recebido` não exigem. */
export function isPendingStatus(status: PurchaseStatus): boolean {
  return PENDENTE.has(status);
}

/** Rótulos na linguagem de quem compra. */
export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  necessidade: "Necessidade",
  cotacao: "Em cotação",
  aprovado: "Aprovado",
  comprado: "Comprado",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

/**
 * Está atrasado?
 *
 * SÓ afirma atraso quando existe data limite REAL gravada e a situação ainda
 * exige ação. Sem data, nunca há atraso — preferimos não dizer nada a inventar
 * uma urgência que a decoradora não definiu.
 */
export function isOverdue(
  item: PurchaseLike & { dueDate?: string },
  hojeISO: string,
): boolean {
  if (!item.dueDate) return false;
  if (!isPendingStatus(effectivePurchaseStatus(item))) return false;
  return item.dueDate < hojeISO;
}
