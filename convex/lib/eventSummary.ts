// ─────────────────────────────────────────────────────────────────────────────
// RESUMO OPERACIONAL DO EVENTO
//
// Responde, em segundos: "está tudo bem com este evento?".
//
// ── REGRA DE HONESTIDADE ────────────────────────────────────────────────────
// Só CONTAGEM DE DADOS REAIS. Nenhum índice sintético, nenhuma nota de
// "83% saudável", nenhuma estimativa de valor ausente. Cada número aqui é
// literalmente "quantos registros existem" ou "quantos estão marcados".
//
// Isso é diferente de `health.getEventHealth`, que já existia e mede outra
// coisa: se o CADASTRO está completo (contrato anexado, assessoria definida...).
// Saber que o cadastro está 80% completo não diz quantas compras faltam fazer.
// As duas convivem, cada uma respondendo à sua pergunta.
//
// Módulo PURO: recebe o que a query já leu e devolve os números. Sem `ctx`,
// sem consulta, para poder ser testado exaustivamente.
// ─────────────────────────────────────────────────────────────────────────────

import { effectivePurchaseStatus, isPendingStatus } from "./purchaseStatus";
import { resultadoDoProjeto } from "./financeScope";

export type ContagemFeita = { total: number; feitos: number; pendentes: number };

type ChecklistLike = { isChecked: boolean };
type CompraLike = {
  isPurchased: boolean;
  status?: string;
  quantity?: number;
  unitPrice?: number;
  supplier?: string;
};
type FornecedorLike = {
  companyName: string;
  status?: string;
  nextAction?: string;
};
type EscalaLike = { scheduledTime?: string };
type CarregamentoLike = { checkOnAssembly: boolean; quantity?: number };
type TransacaoLike = { type: string; amount: number; isPaid: boolean };

function contar(itens: readonly { feito: boolean }[]): ContagemFeita {
  const total = itens.length;
  const feitos = itens.filter((i) => i.feito).length;
  return { total, feitos, pendentes: total - feitos };
}

/**
 * Fornecedores por situação.
 *
 * `aguardando` = cadastrado mas ainda NÃO confirmado nem finalizado. É a
 * pergunta que a decoradora faz de verdade ("quem ainda não me respondeu?").
 * Fornecedor sem status entra em `semStatus` e também conta como aguardando —
 * não saber a situação é, operacionalmente, o mesmo que estar pendente.
 */
export type ResumoFornecedores = {
  total: number;
  confirmados: number;
  aguardando: number;
  semStatus: number;
};

const STATUS_RESOLVIDOS = new Set(["confirmado", "finalizado"]);

export function resumirFornecedores(
  fornecedores: readonly FornecedorLike[],
): ResumoFornecedores {
  const total = fornecedores.length;
  const confirmados = fornecedores.filter(
    (f) => f.status !== undefined && STATUS_RESOLVIDOS.has(f.status),
  ).length;
  const semStatus = fornecedores.filter((f) => !f.status).length;
  return { total, confirmados, aguardando: total - confirmados, semStatus };
}

/**
 * Dinheiro, sem inventar nada.
 *
 * `previsto` é a soma do que foi LANÇADO; `realizado`, a soma do que está
 * marcado como pago. Não existe custo estimado aqui: um evento sem despesas
 * lançadas mostra zero, e o resumo diz que nada foi lançado — em vez de fingir
 * uma margem calculada sobre custo inexistente.
 */
export type ResumoFinanceiro = {
  receitaPrevista: number;
  receitaRecebida: number;
  despesaPrevista: number;
  despesaPaga: number;
  /** Quantos lançamentos existem. Zero = não há base para conclusão nenhuma. */
  lancamentos: number;
  /**
   * Receita menos custo planejado, em reais. `null` quando falta base —
   * sem receita ou sem custo lançado. Ver convex/lib/financeScope.ts.
   *
   * Estes números são da OPERAÇÃO DA DECORADORA neste projeto, não do
   * orçamento do casamento: buffet, espaço, bar e assessoria são fornecedores
   * do casal e não passam pelo caixa da empresa.
   */
  margemPrevista: number | null;
  margemPercentual: number | null;
};

export function resumirFinanceiro(txs: readonly TransacaoLike[]): ResumoFinanceiro {
  const soma = (tipo: string, apenasPagos: boolean) =>
    txs
      .filter((t) => t.type === tipo && (!apenasPagos || t.isPaid))
      .reduce((s, t) => s + t.amount, 0);
  const resultado = resultadoDoProjeto(txs);
  return {
    receitaPrevista: soma("income", false),
    receitaRecebida: soma("income", true),
    despesaPrevista: soma("expense", false),
    despesaPaga: soma("expense", true),
    lancamentos: txs.length,
    margemPrevista: resultado.margemPrevista,
    margemPercentual: resultado.margemPercentual,
  };
}

/**
 * Custo já comprometido em compras que têm preço informado.
 *
 * `semPreco` existe para a tela poder dizer "4 itens ainda sem preço" em vez
 * de apresentar um total que parece completo e não é.
 *
 * ── CANCELADO NÃO É PENDENTE ────────────────────────────────────────────────
 * Antes esta função contava pendência como `!isPurchased`. Um item CANCELADO
 * tem `isPurchased: false`, então aparecia como "falta comprar" no Resumo
 * Operacional e virava uma próxima ação falsa — enquanto o painel do Dashboard,
 * que já usava `isPendingStatus`, dizia o contrário. As duas telas se
 * contradiziam sobre o mesmo item.
 *
 * Agora as três situações são contadas separadamente, e por isso
 * `total !== feitos + pendentes` quando há cancelados. É a verdade: um item
 * cancelado não foi comprado nem está esperando compra.
 *
 * Cancelado também sai do `valorComPreco`: compra cancelada não é dinheiro
 * comprometido.
 */
export type ResumoCompras = ContagemFeita & {
  valorComPreco: number;
  semPreco: number;
  cancelados: number;
};

export function resumirCompras(compras: readonly CompraLike[]): ResumoCompras {
  let feitos = 0;
  let pendentes = 0;
  let cancelados = 0;
  let valorComPreco = 0;
  let semPreco = 0;

  for (const c of compras) {
    const status = effectivePurchaseStatus(c);
    if (status === "cancelado") {
      cancelados += 1;
      continue; // não conta como feito, nem pendente, nem custo.
    }
    if (isPendingStatus(status)) pendentes += 1;
    else feitos += 1;

    if (typeof c.unitPrice === "number" && Number.isFinite(c.unitPrice)) {
      valorComPreco += c.unitPrice * (c.quantity ?? 1);
    } else {
      semPreco += 1;
    }
  }

  return { total: compras.length, feitos, pendentes, cancelados, valorComPreco, semPreco };
}

/** Uma coisa que precisa acontecer, com a origem preservada. */
export type ProximaAcao = {
  origem: "fornecedor" | "checklist" | "compras" | "equipe";
  texto: string;
  /** Preenchido quando a ação vem de um fornecedor específico. */
  referencia?: string;
};

/**
 * "O que eu preciso fazer agora?" — montado a partir do que JÁ está no banco.
 *
 * NÃO é um sistema de tarefas novo: nada aqui é gravado. As ações de fornecedor
 * são o texto que a decoradora mesma escreveu em `nextAction`; as demais são
 * contagens de pendência que a tela já mostraria separada.
 *
 * Ordem: primeiro o que alguém escreveu à mão (mais específico), depois as
 * pendências agregadas.
 */
export function montarProximasAcoes(input: {
  fornecedores: readonly FornecedorLike[];
  checklistPre: ContagemFeita;
  checklistPos: ContagemFeita;
  compras: ContagemFeita;
  fornecedoresResumo: ResumoFornecedores;
}): ProximaAcao[] {
  const acoes: ProximaAcao[] = [];

  for (const f of input.fornecedores) {
    const texto = f.nextAction?.trim();
    if (texto) acoes.push({ origem: "fornecedor", texto, referencia: f.companyName });
  }

  if (input.fornecedoresResumo.aguardando > 0) {
    const n = input.fornecedoresResumo.aguardando;
    acoes.push({
      origem: "fornecedor",
      texto:
        n === 1
          ? "1 fornecedor ainda não confirmado"
          : `${n} fornecedores ainda não confirmados`,
    });
  }

  if (input.compras.pendentes > 0) {
    acoes.push({
      origem: "compras",
      texto:
        input.compras.pendentes === 1
          ? "1 item de compra ainda não adquirido"
          : `${input.compras.pendentes} itens de compra ainda não adquiridos`,
    });
  }

  if (input.checklistPre.pendentes > 0) {
    acoes.push({
      origem: "checklist",
      texto:
        input.checklistPre.pendentes === 1
          ? "1 item do carregamento ainda não conferido"
          : `${input.checklistPre.pendentes} itens do carregamento ainda não conferidos`,
    });
  }

  if (input.checklistPos.pendentes > 0) {
    acoes.push({
      origem: "checklist",
      texto:
        input.checklistPos.pendentes === 1
          ? "1 item ainda não conferido na volta"
          : `${input.checklistPos.pendentes} itens ainda não conferidos na volta`,
    });
  }

  return acoes;
}

export type ResumoOperacional = {
  checklistPre: ContagemFeita;
  checklistPos: ContagemFeita;
  compras: ResumoCompras;
  fornecedores: ResumoFornecedores;
  equipe: { escalados: number; comHorario: number };
  carregamento: { itens: number; aConferir: number };
  financeiro: ResumoFinanceiro;
  proximasAcoes: ProximaAcao[];
  /** Nenhum dado em nenhum módulo — a tela mostra o estado vazio. */
  vazio: boolean;
};

/** Junta tudo. Recebe listas já lidas; não consulta nada. */
export function montarResumoOperacional(input: {
  checklistPre: readonly ChecklistLike[];
  checklistPos: readonly ChecklistLike[];
  compras: readonly CompraLike[];
  fornecedores: readonly FornecedorLike[];
  equipe: readonly EscalaLike[];
  carregamento: readonly CarregamentoLike[];
  transacoes: readonly TransacaoLike[];
}): ResumoOperacional {
  const checklistPre = contar(input.checklistPre.map((i) => ({ feito: i.isChecked })));
  const checklistPos = contar(input.checklistPos.map((i) => ({ feito: i.isChecked })));
  const compras = resumirCompras(input.compras);
  const fornecedores = resumirFornecedores(input.fornecedores);
  const financeiro = resumirFinanceiro(input.transacoes);

  const equipe = {
    escalados: input.equipe.length,
    comHorario: input.equipe.filter((e) => (e.scheduledTime ?? "").trim() !== "").length,
  };
  const carregamento = {
    itens: input.carregamento.length,
    aConferir: input.carregamento.filter((i) => i.checkOnAssembly).length,
  };

  return {
    checklistPre,
    checklistPos,
    compras,
    fornecedores,
    equipe,
    carregamento,
    financeiro,
    proximasAcoes: montarProximasAcoes({
      fornecedores: input.fornecedores,
      checklistPre,
      checklistPos,
      compras,
      fornecedoresResumo: fornecedores,
    }),
    vazio:
      checklistPre.total === 0 &&
      checklistPos.total === 0 &&
      compras.total === 0 &&
      fornecedores.total === 0 &&
      equipe.escalados === 0 &&
      carregamento.itens === 0 &&
      financeiro.lancamentos === 0,
  };
}
