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
