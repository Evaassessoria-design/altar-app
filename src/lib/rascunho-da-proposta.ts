import { emCentavos } from "@/convex/lib/dinheiro.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O QUE ESTÁ NA TELA JÁ É O QUE ESTÁ SALVO?
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// A pré-visualização e o PDF da proposta saem de `comoOClienteVe`, que reflete
// o que está SALVO — é assim de propósito: a fronteira de audiência mora no
// servidor, e a tela nunca monta o documento por conta própria.
//
// A tela conferia se havia alteração pendente comparando só o INVESTIMENTO.
// Então bastava editar o texto para o aviso calar:
//
//   ela reescreve a apresentação inteira, clica em "Ver como a cliente vê",
//   lê o texto ANTIGO, acha que está bom, baixa o PDF — e manda o antigo.
//
// Os valores batiam, então nada avisava. O documento que ela aprovou não era o
// documento que ela escreveu.
//
// ── POR QUE MÓDULO PURO ─────────────────────────────────────────────────────
// "Mudou?" é regra, não renderização: dá para exercitar cada campo sem montar
// tela nenhuma — e é campo esquecido que produz este defeito, então o teste
// precisa poder cobrar campo a campo.
//
// ── A REGRA DO VAZIO ────────────────────────────────────────────────────────
// Campo ausente no banco e campo em branco na tela são a MESMA coisa: a
// decoradora não escreveu nada. Tratá-los como diferentes faria toda proposta
// recém-aberta parecer alterada, e um aviso que aparece sempre não avisa nada.
// ─────────────────────────────────────────────────────────────────────────────

/** Um item como o editor o mantém: o valor ainda é o texto digitado. */
export type ItemNaTela = { descricao: string; detalhe: string; valor: number | null };

export type PropostaNaTela = {
  titulo: string;
  apresentacao: string;
  condicoesPagamento: string;
  validadeAte: string;
  observacoes: string;
  itens: readonly ItemNaTela[];
};

/** O mesmo documento como o banco o guarda. */
export type PropostaSalva = {
  titulo: string;
  apresentacao?: string;
  condicoesPagamento?: string;
  validadeAte?: string;
  observacoes?: string;
  itens: readonly { descricao: string; detalhe?: string; valor: number }[];
};

const texto = (v: string | undefined) => (v ?? "").trim();

/**
 * Há edição pendente?
 *
 * Compara TODOS os campos que viajam para o documento da cliente. Um campo novo
 * na proposta precisa entrar aqui — senão ele volta a ser invisível para o
 * aviso, que é exatamente como este defeito nasceu.
 */
export function propostaMudou(salva: PropostaSalva, naTela: PropostaNaTela): boolean {
  if (texto(salva.titulo) !== texto(naTela.titulo)) return true;
  if (texto(salva.apresentacao) !== texto(naTela.apresentacao)) return true;
  if (texto(salva.condicoesPagamento) !== texto(naTela.condicoesPagamento)) return true;
  if (texto(salva.validadeAte) !== texto(naTela.validadeAte)) return true;
  if (texto(salva.observacoes) !== texto(naTela.observacoes)) return true;

  if (salva.itens.length !== naTela.itens.length) return true;
  return salva.itens.some((item, i) => {
    const naTelaItem = naTela.itens[i];
    if (texto(item.descricao) !== texto(naTelaItem.descricao)) return true;
    if (texto(item.detalhe) !== texto(naTelaItem.detalhe)) return true;
    // Valor ilegível conta como alteração: é diferente do que está salvo, e a
    // tela tem de recusar o documento em vez de gerá-lo com o número antigo.
    if (naTelaItem.valor === null) return true;
    return emCentavos(item.valor) !== emCentavos(naTelaItem.valor);
  });
}
