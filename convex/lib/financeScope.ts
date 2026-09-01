// ─────────────────────────────────────────────────────────────────────────────
// ESCOPO FINANCEIRO DO ALTAR
//
// O ALTAR é o sistema da EMPRESA DE DECORAÇÃO. O financeiro de um evento
// responde a UMA pergunta:
//
//   "Quanto a empresa vendeu este projeto, quanto planeja gastar para
//    executá-lo, e quanto efetivamente gastou?"
//
// NÃO é o orçamento do casamento. Buffet, locação do espaço, fotografia,
// vídeo, DJ, banda, bar, assessoria e celebrante são fornecedores do CASAL —
// a decoradora não os paga e não os recebe. Lançá-los aqui produziria uma
// margem inventada sobre dinheiro que nunca passou pela empresa.
//
// ── A EXCEÇÃO QUE IMPORTA ───────────────────────────────────────────────────
// Um desses fornecedores PODE aparecer quando a própria decoradora assume o
// custo dentro do escopo dela. Contratar a estrutura decorativa do balcão do
// bar é custo de decoração; o serviço de bar do casamento não é. A diferença
// não está no fornecedor, está em quem paga e pelo quê.
//
// Por isso este módulo NÃO bloqueia categorias na interface: bloquear
// impediria a exceção legítima. Ele serve para (a) documentar a regra num
// lugar só e (b) impedir que o SEED de demonstração volte a semear o
// orçamento do casamento inteiro, que foi o que aconteceu.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Categorias que descrevem fornecedores do CASAL, não custos da decoradora.
 *
 * Comparadas sem acento e sem caixa. Usadas pelo teste do seed — nunca para
 * barrar o que a decoradora digita.
 */
export const CATEGORIAS_FORA_DO_ESCOPO = [
  "buffet",
  "local",
  "locacao do espaco",
  "espaco",
  "bar",
  "fotografia",
  "foto",
  "video",
  "dj",
  "banda",
  "musica",
  "assessoria",
  "celebrante",
  "convites",
] as const;

function normalizar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** A categoria descreve um fornecedor do casal em vez de custo da decoradora? */
export function foraDoEscopoDaDecoradora(categoria: string | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_FORA_DO_ESCOPO as readonly string[]).includes(normalizar(categoria));
}

export type ResultadoDoProjeto = {
  /** Vendido pela empresa de decoração. */
  receita: number;
  /** Já recebido do que foi vendido. */
  recebido: number;
  /** Custo previsto para executar (o que foi lançado). */
  custoPlanejado: number;
  /** Custo efetivamente pago. */
  custoReal: number;
  /**
   * Receita menos custo planejado.
   *
   * `null` quando não há base confiável — sem receita lançada, ou sem nenhum
   * custo lançado. Margem calculada sobre custo inexistente daria 100%, que é
   * a mentira mais fácil de contar num painel financeiro.
   */
  margemPrevista: number | null;
  /** Percentual da margem prevista, quando ela existe. */
  margemPercentual: number | null;
};

/**
 * Resultado do projeto para a EMPRESA DE DECORAÇÃO.
 *
 * Não estima, não completa lacuna, não projeta. Se falta base, devolve `null`
 * e a tela diz que falta base.
 */
export function resultadoDoProjeto(
  lancamentos: readonly { type: string; amount: number; isPaid: boolean }[],
): ResultadoDoProjeto {
  const soma = (tipo: string, apenasPagos: boolean) =>
    lancamentos
      .filter((t) => t.type === tipo && (!apenasPagos || t.isPaid))
      .reduce((s, t) => s + t.amount, 0);

  const receita = soma("income", false);
  const custoPlanejado = soma("expense", false);
  const temBase = receita > 0 && custoPlanejado > 0;

  return {
    receita,
    recebido: soma("income", true),
    custoPlanejado,
    custoReal: soma("expense", true),
    margemPrevista: temBase ? receita - custoPlanejado : null,
    margemPercentual: temBase
      ? Math.round(((receita - custoPlanejado) / receita) * 100)
      : null,
  };
}
