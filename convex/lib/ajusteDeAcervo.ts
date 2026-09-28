import { quantidadeLimpa } from "./fichaTecnica";
import { quantidadeFisicaValida } from "./acervo";

// ─────────────────────────────────────────────────────────────────────────────
// AJUSTE DE ESTOQUE DO ACERVO
//
// ── QUEM É A FONTE DE VERDADE ───────────────────────────────────────────────
// Continua sendo `collectionItems.quantidadeTotal`. O histórico de ajustes NÃO
// é uma segunda fonte: ele EXPLICA como o número chegou onde chegou, e nunca é
// somado para descobrir o estoque. Somar o histórico criaria dois números que
// discordam no primeiro registro perdido — exatamente o que `disponivel`
// guardado teria feito, e que por isso nunca existiu aqui.
//
// ── AJUSTE NÃO É RESERVA, SAÍDA NEM RETORNO ─────────────────────────────────
// Saíram 20 e voltaram 19? O total continua o mesmo. O sistema NÃO decide que
// a peça se perdeu: ela pode estar no carro, na casa da cliente, ou voltar na
// segunda. Só uma pessoa pode dizer "essa peça acabou" — e é isso que um
// ajuste é: uma decisão humana, registrada com nome e motivo.
//
// ── O TIPO DECIDE O SINAL ───────────────────────────────────────────────────
// "Perda" que AUMENTA o estoque não é um ajuste, é um erro de digitação. Por
// isso a pessoa informa sempre uma quantidade POSITIVA e o tipo decide para
// que lado ela vai. Contagem de inventário é o único caso de duas direções, e
// por isso mora numa função separada, onde se informa o que se CONTOU — que é
// o que alguém faz de prancheta na mão.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_DE_AJUSTE = [
  "entrada",
  "perda",
  "quebra",
  "avaria",
  "descarte",
  "acerto_inventario",
] as const;

export type TipoDeAjuste = (typeof TIPOS_DE_AJUSTE)[number];

/** Rótulos da tela — um lugar só, para PDF e histórico não divergirem. */
export const ROTULO_DO_AJUSTE: Record<TipoDeAjuste, string> = {
  entrada: "Entrada",
  perda: "Perda",
  quebra: "Quebra",
  avaria: "Avaria",
  descarte: "Descarte",
  acerto_inventario: "Acerto de inventário",
};

/** Tipos que a pessoa escolhe ao lançar um ajuste comum (contagem é à parte). */
export const TIPOS_COM_QUANTIDADE = TIPOS_DE_AJUSTE.filter(
  (t) => t !== "acerto_inventario",
) as readonly Exclude<TipoDeAjuste, "acerto_inventario">[];

/** Para que lado o tipo move o estoque. */
export function sinalDoTipo(tipo: TipoDeAjuste): 1 | -1 {
  return tipo === "entrada" ? 1 : -1;
}

export type AjusteOk = {
  ok: true;
  /** Assinado: o que efetivamente moveu o estoque. */
  delta: number;
  quantidadeDepois: number;
};
export type AjusteErro = { ok: false; motivo: string };
export type ResultadoDoAjuste = AjusteOk | AjusteErro;

/**
 * Ajuste comum: entrada, perda, quebra, avaria ou descarte.
 *
 * `quantidade` é sempre a MAGNITUDE (positiva). O tipo decide o sinal.
 */
export function aplicarAjuste(entrada: {
  quantidadeAtual: number;
  tipo: Exclude<TipoDeAjuste, "acerto_inventario">;
  quantidade: number;
  unidade: string;
}): ResultadoDoAjuste {
  const { quantidadeAtual, tipo, unidade } = entrada;
  // ANTES de limpar. `quantidadeLimpa(NaN)` devolve 0, e daí em diante um
  // valor impossível é indistinguível de um zero digitado — o ajuste era
  // recusado, mas com o recado errado ("um ajuste de zero não muda nada"),
  // que manda a decoradora procurar o problema no lugar errado.
  if (!Number.isFinite(entrada.quantidade)) {
    return { ok: false, motivo: "Informe a quantidade do ajuste." };
  }
  const quantidade = quantidadeLimpa(entrada.quantidade);

  if (!quantidadeFisicaValida(quantidade, unidade)) {
    return {
      ok: false,
      motivo: `Quantidade inválida para a unidade "${unidade}".`,
    };
  }
  if (quantidade === 0) {
    return { ok: false, motivo: "Um ajuste de zero não muda nada — informe a quantidade." };
  }

  const delta = quantidadeLimpa(sinalDoTipo(tipo) * quantidade);
  const depois = quantidadeLimpa(quantidadeAtual + delta);

  if (depois < 0) {
    return {
      ok: false,
      motivo:
        `Não dá para baixar ${quantidade} de um acervo que tem ${quantidadeAtual}. ` +
        "O estoque físico não pode ficar negativo.",
    };
  }

  return { ok: true, delta, quantidadeDepois: depois };
}

/**
 * Contagem física: informa-se o que foi CONTADO, e o delta sai da diferença.
 *
 * Contar o mesmo que já estava registrado não é um ajuste — é uma confirmação,
 * e gravar um registro de delta zero só sujaria o histórico.
 */
export function aplicarContagem(entrada: {
  quantidadeAtual: number;
  quantidadeContada: number;
  unidade: string;
}): ResultadoDoAjuste {
  const { quantidadeAtual, unidade } = entrada;
  // ── O DEFEITO QUE ESTA LINHA FECHA ────────────────────────────────────────
  // `quantidadeLimpa(NaN)` devolve 0, e `quantidadeFisicaValida(0)` é
  // verdadeiro. Uma contagem com valor impossível passava por válida e era
  // gravada como "contei ZERO" — zerando o estoque da peça e deixando o
  // ajuste registrado no histórico como se alguém tivesse contado mesmo.
  //
  // É diferente do ajuste, que ao menos recusava. Aqui o estrago era gravado.
  if (!Number.isFinite(entrada.quantidadeContada)) {
    return { ok: false, motivo: "Informe a quantidade contada." };
  }
  const contada = quantidadeLimpa(entrada.quantidadeContada);

  if (!quantidadeFisicaValida(contada, unidade)) {
    return { ok: false, motivo: `Quantidade contada inválida para a unidade "${unidade}".` };
  }

  const delta = quantidadeLimpa(contada - quantidadeAtual);
  if (delta === 0) {
    return {
      ok: false,
      motivo: "A contagem bateu com o registrado — não há ajuste a fazer.",
    };
  }

  return { ok: true, delta, quantidadeDepois: contada };
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUTENÇÃO — a peça que é da empresa, mas não está disponível
//
// ── O BURACO QUE ISTO FECHA ─────────────────────────────────────────────────
// Até 28/09 o acervo só conhecia dois estados: a peça está no total, ou não
// está. Um castiçal que voltou torto do casamento de sábado tinha dois
// destinos, os dois errados: continuar "disponível" (e ser prometido para o
// próximo evento) ou sair do acervo para sempre como avaria. O que acontece de
// verdade — vai para o conserto e volta em duas semanas — não tinha lugar.
//
// ── O NÚMERO E QUEM O MOVE ──────────────────────────────────────────────────
// `collectionItems.emManutencao` (ausente = 0), que só muda por aqui, como o
// total só muda por ajuste. A peça em manutenção CONTINUA no total — é da
// empresa — e sai da disponibilidade (`disponibilidadeNaJanela`).
//
// Três operações, porque a manutenção termina de dois jeitos:
//   · envio: total igual, manutenção sobe;
//   · retorno: consertou — total igual, manutenção desce;
//   · sem conserto: não tem volta — total E manutenção descem juntos.
//
// Cada uma grava uma linha no MESMO histórico de ajustes, com a manutenção
// antes e depois. O histórico continua explicando os números, nunca somado.
// ─────────────────────────────────────────────────────────────────────────────

export const OPERACOES_DE_MANUTENCAO = [
  "manutencao_envio",
  "manutencao_retorno",
  "manutencao_descarte",
] as const;

export type OperacaoDeManutencao = (typeof OPERACOES_DE_MANUTENCAO)[number];

export const ROTULO_DA_MANUTENCAO: Record<OperacaoDeManutencao, string> = {
  manutencao_envio: "Enviada para manutenção",
  manutencao_retorno: "Voltou da manutenção",
  manutencao_descarte: "Sem conserto",
};

/** Rótulo de qualquer linha do histórico — ajuste comum ou manutenção. */
export function rotuloDaLinhaDoHistorico(tipo: TipoDeAjuste | OperacaoDeManutencao): string {
  return (ROTULO_DO_AJUSTE as Record<string, string>)[tipo] ??
    ROTULO_DA_MANUTENCAO[tipo as OperacaoDeManutencao];
}

export type ManutencaoOk = {
  ok: true;
  /** O que moveu o TOTAL (zero, exceto sem conserto). */
  delta: number;
  quantidadeDepois: number;
  manutencaoDepois: number;
};
export type ResultadoDaManutencao = ManutencaoOk | AjusteErro;

export function aplicarManutencao(entrada: {
  quantidadeAtual: number;
  /** Ausente no banco = 0. */
  emManutencao: number | undefined;
  operacao: OperacaoDeManutencao;
  quantidade: number;
  unidade: string;
}): ResultadoDaManutencao {
  if (!Number.isFinite(entrada.quantidade)) {
    return { ok: false, motivo: "Informe quantas peças." };
  }
  const quantidade = quantidadeLimpa(entrada.quantidade);
  if (!quantidadeFisicaValida(quantidade, entrada.unidade)) {
    return { ok: false, motivo: `Quantidade inválida para a unidade "${entrada.unidade}".` };
  }
  if (quantidade === 0) {
    return { ok: false, motivo: "Informe quantas peças." };
  }

  const total = quantidadeLimpa(entrada.quantidadeAtual);
  const emManutencao = quantidadeLimpa(Math.max(0, entrada.emManutencao ?? 0));

  if (entrada.operacao === "manutencao_envio") {
    const livres = quantidadeLimpa(total - emManutencao);
    if (quantidade > livres) {
      return {
        ok: false,
        motivo:
          `O acervo tem ${total}, e ${emManutencao} já estão em manutenção — ` +
          `dá para enviar no máximo ${livres}.`,
      };
    }
    return {
      ok: true,
      delta: 0,
      quantidadeDepois: total,
      manutencaoDepois: quantidadeLimpa(emManutencao + quantidade),
    };
  }

  if (quantidade > emManutencao) {
    return {
      ok: false,
      motivo:
        emManutencao === 0
          ? "Nenhuma peça deste item está em manutenção."
          : `Só ${emManutencao} estão em manutenção.`,
    };
  }

  const manutencaoDepois = quantidadeLimpa(emManutencao - quantidade);
  if (entrada.operacao === "manutencao_retorno") {
    return { ok: true, delta: 0, quantidadeDepois: total, manutencaoDepois };
  }
  // Sem conserto: a peça deixa de existir para a empresa.
  return {
    ok: true,
    delta: quantidadeLimpa(-quantidade),
    quantidadeDepois: quantidadeLimpa(total - quantidade),
    manutencaoDepois,
  };
}

/**
 * Uma baixa comum pode levar o total para baixo do que está no conserto?
 *
 * Não: "perdi 5" num item de 10 com 7 em manutenção deixaria 5 peças no total
 * e 7 em manutenção — mais peça no conserto do que a empresa tem. A pessoa
 * resolve a manutenção primeiro ("sem conserto", se for o caso).
 */
export function baixaRespeitaManutencao(
  quantidadeDepois: number,
  emManutencao: number | undefined,
): string | null {
  const m = quantidadeLimpa(Math.max(0, emManutencao ?? 0));
  if (quantidadeDepois >= m) return null;
  return (
    `${m} peça(s) deste item estão em manutenção, e o total ficaria em ` +
    `${quantidadeDepois}. Registre primeiro o que aconteceu com elas ` +
    `("voltou da manutenção" ou "sem conserto").`
  );
}
