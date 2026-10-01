import { ConvexError } from "convex/values";
import { VALOR_MAXIMO } from "./dinheiro";
import { cabeNoTeto, recadoDeTamanho, TAMANHO_MAXIMO_DOCUMENTO } from "./arquivos";

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
  // Uma condição por recado: `valorMonetarioValido` responde sim ou não, e um
  // "valor inválido" genérico não diz a ninguém o que corrigir.
  if (!Number.isFinite(valor)) recusar(campo, "informe um valor em reais.");
  if (valor < 0) recusar(campo, "não pode ser negativo.");
  if (valor > VALOR_MAXIMO) {
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
 * TAMANHO DE ARQUIVO, EM BYTES.
 *
 * ── POR QUE NÃO SERVE `exigirQuantidadeGravavel` ────────────────────────────
 * Porque byte não é quantidade física. `leadDocuments.save` usava a de
 * quantidade, cujo teto é um milhão — escrito para "um milhão de vasos é
 * sempre erro de digitação". Em bytes, isso virou um teto de upload de
 * 0,95 MiB: uma decoradora foi recusada ao anexar um DOCX de 3,9 MB, e leu
 * "Confira os zeros" sem ter digitado zero nenhum.
 *
 * Duas coisas, então, e não uma: o teto certo, e um recado de gente.
 *
 * ── O TETO VEM DA MESMA CONSTANTE QUE A TELA USA ────────────────────────────
 * `cabeNoTeto` é o predicado de `lib/arquivos.ts`, o mesmo que o front chama.
 * O backend segue sendo a autoridade — o que ele deixou de ser é CONTRADITÓRIO:
 * o que a tela aceita, ele aceita, porque é a mesma conta.
 *
 * `undefined` e `null` PASSAM: o tamanho é informado pelo navegador para ser
 * exibido, e documento antigo gravado antes do campo não tem nenhum. Exigir
 * número aqui quebraria a listagem de quem já tem papelada guardada.
 */
export function exigirTamanhoDeArquivoGravavel(
  bytes: number | null | undefined,
  campo: string,
  teto: number = TAMANHO_MAXIMO_DOCUMENTO,
): void {
  if (bytes === null || bytes === undefined) return;
  // Um recado por motivo: "arquivo inválido" não diz a ninguém o que fazer.
  if (!Number.isFinite(bytes)) recusar(campo, "não é um tamanho válido.");
  if (bytes < 0) recusar(campo, "não pode ser negativo.");
  if (bytes === 0) {
    throw new ConvexError({ code: "VALOR_INVALIDO", message: "O arquivo está vazio." });
  }
  if (!cabeNoTeto(bytes, teto)) {
    // A mensagem é a MESMA que a tela mostra. Quem cair aqui pelo caminho
    // raro (chamada direta à mutation) lê a frase de gente, não o número cru.
    throw new ConvexError({ code: "VALOR_INVALIDO", message: recadoDeTamanho(teto) });
  }
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
