// ─────────────────────────────────────────────────────────────────────────────
// COMPROVANTE: EVIDÊNCIA, NÃO DECISÃO
//
// O pedido veio de decoradoras avaliando o produto: "precisamos de um espaço
// para colocar os comprovantes no financeiro dos noivos". Quem recebe em dez
// parcelas precisa provar, meses depois, que a terceira entrou.
//
// ── A REGRA QUE ESTE MÓDULO EXISTE PARA SUSTENTAR ───────────────────────────
// Anexar comprovante NÃO marca a parcela como paga, e marcar como paga NÃO
// exige comprovante. São eixos separados:
//
//   isPaid        → a DECISÃO dela: o dinheiro entrou
//   comprovantes  → a EVIDÊNCIA: o documento que prova
//
// Acoplar os dois faria um anexo errado virar uma baixa errada — e baixa
// errada é dinheiro que o sistema afirma ter entrado. É a mesma distinção que
// `projectScope` faz entre inspiração e contratado, aplicada ao dinheiro.
// ─────────────────────────────────────────────────────────────────────────────

/** O que a tela precisa saber de um lançamento para responder as perguntas. */
export type LancamentoComComprovante = {
  type: string;
  isPaid: boolean;
  comprovantes?: readonly { storageId: string }[];
};

/**
 * "Quais pagamentos eu já dei baixa mas ainda não têm comprovante anexado?"
 *
 * ── DESPESA ENTRA, E ANTES NÃO ENTRAVA ──────────────────────────────────────
 * A versão anterior exigia `type === "income"`, e a justificativa escrita aqui
 * era que o produto não anexava em despesa. Isso deixou de ser verdade sem que
 * esta linha soubesse: o clipe é desenhado em TODA linha do Financeiro, o
 * diálogo troca o vocabulário por tipo ("Pago" × "Recebido"), a mutation nunca
 * olhou o tipo e a cascata já apaga os arquivos dos dois.
 *
 * O filtro era o único lugar que ainda achava que despesa não tinha anexo — e
 * o efeito era o pior possível num contador: a tela AFIRMAVA um número menor
 * do que o trabalho que faltava. Nota de fornecedor pago é exatamente o
 * documento que a contabilidade cobra, e ele não aparecia na lista.
 *
 * O que continua de fora é só o que deve: lançamento ainda NÃO PAGO. Não há
 * comprovante de pagamento que não aconteceu, e cobrar isso viraria ruído
 * sobre toda parcela futura do livro.
 */
export function pagoSemComprovante(tx: LancamentoComComprovante): boolean {
  return tx.isPaid && (tx.comprovantes?.length ?? 0) === 0;
}

/** Tem evidência anexada? */
export function temComprovante(tx: LancamentoComComprovante): boolean {
  return (tx.comprovantes?.length ?? 0) > 0;
}

/**
 * Formas de pagamento SUGERIDAS — não é lista fechada.
 *
 * A leitura de contrato por IA já extrai `paymentMethod` como texto livre, e
 * fechar um enum aqui contradiria o formato que o produto já produz. Também
 * deixaria de fora "permuta", que em decoração acontece, e "cheque", que ainda
 * existe. Estas são as comuns; o campo aceita qualquer coisa.
 */
export const FORMAS_DE_PAGAMENTO = [
  "PIX",
  "Transferência",
  "Cartão",
  "Dinheiro",
  "Boleto",
] as const;

/** "1 comprovante" / "3 comprovantes" / `null` quando não há nenhum. */
export function contagemDeComprovantes(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 comprovante" : `${n} comprovantes`;
}

/**
 * O que a tela oferece no seletor de arquivo.
 *
 * Comprovante chega em PDF (extrato do banco) ou em imagem (print do PIX, foto
 * do recibo). `image/*` no `accept` faz o iPhone oferecer a câmera junto com a
 * galeria, sem fluxo separado — é o mesmo que a Galeria já faz.
 */
export const TIPOS_DE_COMPROVANTE = "application/pdf,image/*";

/** Prefixos aceitos pela validação de envio (`lib/upload.ts`). */
export const MIMES_DE_COMPROVANTE = ["application/pdf", "image/"] as const;
