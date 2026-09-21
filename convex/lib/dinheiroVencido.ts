// ─────────────────────────────────────────────────────────────────────────────
// O DINHEIRO QUE JÁ DEVIA TER ENTRADO — E O QUE JÁ DEVIA TER SAÍDO
//
// O painel da manhã responde por evento (compras, acervo, fornecedores, equipe)
// e por oportunidade (funil). Havia um buraco no meio: **dinheiro**.
//
// O Dashboard mostrava "Receita do mês" e "Despesas do mês" — dois totais que
// não pedem nada de ninguém. A pergunta que uma decoradora faz de manhã é
// outra, e é a mais cara de errar:
//
//     "O sinal da Marina caiu? A parcela de outubro venceu?"
//
// `transactions` já guarda a resposta desde sempre: uma receita com
// `isPaid: false` e `date` no passado é dinheiro que ela devia ter recebido.
// Nenhuma tela perguntava isso.
//
// ── POR QUE NÃO É "INADIMPLÊNCIA" ───────────────────────────────────────────
// O ALTAR não cobra ninguém e não sabe se houve acordo, adiamento ou
// pagamento por fora. A frase da tela é descritiva — "venceu e não está
// marcado como recebido" — e a ação é abrir o Financeiro, não cobrar.
//
// A mesma conta vale para o que ela DEVE: uma despesa vencida e não paga é
// fornecedor esperando, e isso estraga relação.
//
// ── REGRA DE HONESTIDADE ────────────────────────────────────────────────────
// Lançamento sem data não entra. "Vencido" é uma afirmação sobre uma data, e
// sem data não há afirmação a fazer — contar como vencido seria inventar.
//
// Módulo PURO: recebe o que a consulta já leu. Some por `somaEmDinheiro`, que
// resiste ao `NaN` gravado antes das travas do Financeiro — um único
// lançamento podre não pode transformar o aviso em "R$ NaN".
// ─────────────────────────────────────────────────────────────────────────────

import { somaEmDinheiro } from "./dinheiro";

export type LancamentoParaVencimento = {
  type: string;
  amount: number;
  isPaid: boolean;
  /** Dia civil "AAAA-MM-DD". Ausente ou vazio = não entra na conta. */
  date?: string;
};

export type DinheiroVencido = {
  /** Receitas vencidas e ainda não recebidas. */
  aReceber: { quantidade: number; total: number };
  /** Despesas vencidas e ainda não pagas. */
  aPagar: { quantidade: number; total: number };
  /** Alguma das duas tem algo. Evita a tela recalcular. */
  temAlgo: boolean;
};

/** Data de dia civil utilizável numa comparação. */
function diaValido(date: string | undefined): date is string {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date);
}

/**
 * O que venceu até ONTEM — nunca o que vence hoje.
 *
 * Um lançamento datado de hoje ainda tem o dia inteiro para acontecer.
 * Chamá-lo de vencido às 9 da manhã é o tipo de alarme que ensina a ignorar
 * o painel.
 */
export function dinheiroVencido(
  lancamentos: readonly LancamentoParaVencimento[],
  hojeISO: string,
): DinheiroVencido {
  const hoje = hojeISO.slice(0, 10);

  const vencidos = (tipo: string) =>
    lancamentos.filter(
      (t) =>
        t.type === tipo &&
        !t.isPaid &&
        diaValido(t.date) &&
        t.date.slice(0, 10) < hoje,
    );

  const resumir = (tipo: string) => {
    const lista = vencidos(tipo);
    return { quantidade: lista.length, total: somaEmDinheiro(lista.map((t) => t.amount)) };
  };

  const aReceber = resumir("income");
  const aPagar = resumir("expense");

  return {
    aReceber,
    aPagar,
    temAlgo: aReceber.quantidade > 0 || aPagar.quantidade > 0,
  };
}
