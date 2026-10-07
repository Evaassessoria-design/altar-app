import { faltaVoltar } from "./acervo";

// ─────────────────────────────────────────────────────────────────────────────
// QUANDO UM EVENTO NÃO PODE SER EXCLUÍDO
//
// Excluir um evento apaga em cascata tudo o que é dele (lib/cascade.ts). Dois
// tipos de registro não podem sumir assim:
//
//  · RECEBIMENTOS — parcela com recebimento registrado, inclusive anulado, é
//    histórico de dinheiro. O Financeiro já recusa excluir a parcela sozinha
//    (`deleteTransaction`); a exclusão do evento era a porta lateral que a
//    apagava junto, com o histórico e a anulação.
//
//  · PEÇAS DO ACERVO NÃO RECONCILIADAS — peça que saiu e não voltou, ou que
//    voltou e ainda não foi conferida. Apagar a reserva tirava as peças de
//    "fora sem voltar" e elas voltavam a parecer disponíveis; e o retorno não
//    conferido deixava o contador "em conferência" da peça preso para sempre,
//    sem reserva por onde conferir. `liberarReserva` já recusava o primeiro
//    caso; a exclusão do evento não.
//
// O caminho para quem não vai mais fazer o evento é CANCELAR: o cancelamento
// guarda tudo e libera o que deve ser liberado (lib/reservasDoAcervo.ts).
// A exclusão da CONTA inteira não passa por aqui — lá tudo sai junto.
// ─────────────────────────────────────────────────────────────────────────────

type ParcelaParaExclusao = { description: string; recebimentos?: readonly unknown[] };
type ReservaParaExclusao = {
  quantidade: number;
  saiu?: number;
  voltou?: number;
  retornoAConferir?: number;
  conferidoEm?: number;
  nomeDaPeca: string;
};

export type ImpedimentosDaExclusao = {
  /** Parcelas com recebimentos (ativos ou anulados). */
  parcelasComRecebimentos: string[];
  /** Peças que saíram e não voltaram: nome e quantas faltam. */
  pecasForaDoGalpao: { nome: string; quantidade: number }[];
  /** Peças que voltaram e esperam a conferência do retorno. */
  pecasSemConferencia: { nome: string; quantidade: number }[];
};

export function impedimentosDaExclusao(
  parcelas: readonly ParcelaParaExclusao[],
  reservas: readonly ReservaParaExclusao[],
): ImpedimentosDaExclusao {
  return {
    parcelasComRecebimentos: parcelas
      .filter((p) => (p.recebimentos?.length ?? 0) > 0)
      .map((p) => p.description),
    pecasForaDoGalpao: reservas
      .filter((r) => faltaVoltar(r) > 0)
      .map((r) => ({ nome: r.nomeDaPeca, quantidade: faltaVoltar(r) })),
    pecasSemConferencia: reservas
      .filter((r) => (r.retornoAConferir ?? 0) > 0 && r.conferidoEm === undefined)
      .map((r) => ({ nome: r.nomeDaPeca, quantidade: r.retornoAConferir ?? 0 })),
  };
}

export function temImpedimento(i: ImpedimentosDaExclusao): boolean {
  return (
    i.parcelasComRecebimentos.length > 0 ||
    i.pecasForaDoGalpao.length > 0 ||
    i.pecasSemConferencia.length > 0
  );
}

const lista = (nomes: string[]) =>
  nomes.length <= 3 ? nomes.join(", ") : `${nomes.slice(0, 3).join(", ")} e mais ${nomes.length - 3}`;

/** A explicação, com o caminho para resolver. Uma frase por impedimento. */
export function explicarImpedimentos(i: ImpedimentosDaExclusao): string[] {
  const frases: string[] = [];
  if (i.parcelasComRecebimentos.length > 0) {
    frases.push(
      `Há recebimentos registrados (${lista(i.parcelasComRecebimentos)}). ` +
        "O histórico de dinheiro não é apagado — nem o dos anulados.",
    );
  }
  if (i.pecasForaDoGalpao.length > 0) {
    frases.push(
      `Peças do acervo ainda não voltaram (${lista(i.pecasForaDoGalpao.map((p) => `${p.quantidade}× ${p.nome}`))}). ` +
        "Registre o retorno no Acervo do evento antes de excluir.",
    );
  }
  if (i.pecasSemConferencia.length > 0) {
    frases.push(
      `Peças voltaram e esperam a conferência (${lista(i.pecasSemConferencia.map((p) => `${p.quantidade}× ${p.nome}`))}). ` +
        "Faça a conferência do retorno no Acervo do evento antes de excluir.",
    );
  }
  return frases;
}

/** O caminho para quem não vai mais fazer o evento — dito uma vez, no fim. */
export const ALTERNATIVA_A_EXCLUSAO =
  "Se o evento não vai mais acontecer, mude o status para Cancelado: o histórico fica guardado e as reservas sem peça na rua são liberadas.";
