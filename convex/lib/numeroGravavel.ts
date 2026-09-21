import { ConvexError } from "convex/values";
import { VALOR_MAXIMO, valorMonetarioValido } from "./dinheiro";

// ─────────────────────────────────────────────────────────────────────────────
// O NÚMERO QUE PODE SER GRAVADO
//
// ── POR QUE ISTO EXISTE, SE A TELA JÁ CONFERE ───────────────────────────────
// Porque a tela não é a porta. Toda `mutation` do Convex é uma função pública:
// qualquer sessão autenticada chama direto, e todo formulário FUTURO que
// esquecer a conferência entra por aqui. `v.number()` aceita `NaN` e
// `Infinity` — eles são números de ponto flutuante válidos, e o validador do
// Convex os grava sem reclamar.
//
// ── O ESTRAGO É SEMPRE O MESMO, E É SILENCIOSO ──────────────────────────────
// `NaN + qualquer coisa` é `NaN`. Um lead com orçamento `NaN` não erra só a
// própria linha: a coluna inteira do funil passa a somar "R$ NaN". Um evento
// com orçamento `NaN` leva a margem junto. E nenhum deles diz qual linha
// causou — a decoradora vê o painel quebrado e não tem por onde começar.
//
// É exatamente o defeito que `lib/dinheiro.ts` documenta para o Financeiro.
// Este módulo leva a mesma trava para os outros lugares onde dinheiro e
// quantidade entram, em vez de cada arquivo reinventar a sua.
//
// ── OS TETOS NÃO PROTEGEM O BANCO ───────────────────────────────────────────
// Protegem a confiança. Um orçamento de um bilhão ou um acervo de um milhão de
// vasos é sempre erro de digitação, e exibi-lo faz desconfiar do produto
// inteiro. `VALOR_MAXIMO` já era a regra do Financeiro; a quantidade ganha a
// dela aqui.
// ─────────────────────────────────────────────────────────────────────────────

/** Teto de uma quantidade física. Um milhão de qualquer coisa é digitação. */
export const QUANTIDADE_MAXIMA = 1_000_000;

function recusar(campo: string, motivo: string): never {
  throw new ConvexError({ code: "VALOR_INVALIDO", message: `${campo}: ${motivo}` });
}

/**
 * Dinheiro que entra no banco fora do Financeiro.
 *
 * `undefined` e `null` PASSAM: são "campo não informado", que é diferente de
 * "valor inválido" — o orçamento de um lead é opcional de propósito, e exigir
 * um número ali quebraria o cadastro rápido de quem só tem o telefone.
 */
export function exigirDinheiroGravavel(
  valor: number | null | undefined,
  campo: string,
): void {
  if (valor === null || valor === undefined) return;
  if (!Number.isFinite(valor)) recusar(campo, "informe um valor em reais.");
  if (valor < 0) recusar(campo, "não pode ser negativo.");
  if (!valorMonetarioValido(valor)) {
    recusar(campo, `acima do limite de ${VALOR_MAXIMO.toLocaleString("pt-BR")}. Confira os zeros.`);
  }
}

/**
 * Quantidade física ou contagem.
 *
 * `inteiro` para o que não existe pela metade — convidado, peça, item de
 * lista. Sem ele, aceita decimal, porque metro de tecido e quilo de gelo
 * existem em fração.
 */
export function exigirQuantidadeGravavel(
  valor: number | null | undefined,
  campo: string,
  opcoes: { inteiro?: boolean } = {},
): void {
  if (valor === null || valor === undefined) return;
  if (!Number.isFinite(valor)) recusar(campo, "informe um número.");
  if (valor < 0) recusar(campo, "não pode ser negativo.");
  if (valor > QUANTIDADE_MAXIMA) {
    recusar(campo, `acima do limite de ${QUANTIDADE_MAXIMA.toLocaleString("pt-BR")}. Confira os zeros.`);
  }
  if (opcoes.inteiro && !Number.isInteger(valor)) recusar(campo, "precisa ser um número inteiro.");
}

/**
 * Um número que só serve para ordenar ou carimbar (posição, epoch).
 *
 * Não tem faixa: uma data em epoch passa de qualquer teto de dinheiro. O que
 * não pode é `NaN` — uma posição `NaN` faz a ordenação da lista variar entre
 * dois carregamentos, e um carimbo `NaN` faz a data virar "Invalid Date".
 */
export function exigirNumeroReal(valor: number | null | undefined, campo: string): void {
  if (valor === null || valor === undefined) return;
  if (!Number.isFinite(valor)) recusar(campo, "não é um número válido.");
}
