// ─────────────────────────────────────────────────────────────────────────────
// VÍNCULO DO CONTATO — o que a tela pode afirmar sobre quem é a pessoa
//
// A Central fala com interessados no ALTAR (`landingLeads`) e com assinantes
// (`users`). Dizer que um contato "é" alguém é uma afirmação forte: a partir
// dela, a operação passa a tratar aquela conversa como sendo daquela pessoa.
//
// Por isso três estados, e não dois:
//
//   · vinculado automaticamente — casamento ÚNICO e exato de telefone;
//   · vinculado por uma pessoa  — alguém decidiu, com nome e data;
//   · sem vínculo               — e a tela NÃO chuta.
//
// "Sem vínculo" não é erro nem pendência de preenchimento: é o estado honesto
// de um número que chegou e ninguém reconheceu ainda.
// ─────────────────────────────────────────────────────────────────────────────

export type ContatoVinculavel = {
  landingLeadId?: string;
  userId?: string;
  vinculoOrigem?: "automatico" | "humano";
  vinculoEm?: number;
  vinculoRemovidoEm?: number;
  tipo?: "interessado" | "assinante" | "parceiro" | "desconhecido";
};

export type EstadoDoVinculo = {
  temVinculo: boolean;
  /** Frase curta para o painel do contato. */
  rotulo: string;
  /** Explicação de uma linha, quando há o que explicar. */
  detalhe: string | null;
  podeDesvincular: boolean;
  temInteressado: boolean;
  temAssinante: boolean;
};

export function estadoDoVinculo(contato: ContatoVinculavel | null | undefined): EstadoDoVinculo {
  const temInteressado = Boolean(contato?.landingLeadId);
  const temAssinante = Boolean(contato?.userId);
  const temVinculo = temInteressado || temAssinante;

  if (!contato) {
    return {
      temVinculo: false,
      rotulo: "Sem contato",
      detalhe: null,
      podeDesvincular: false,
      temInteressado: false,
      temAssinante: false,
    };
  }

  if (!temVinculo) {
    return {
      temVinculo: false,
      rotulo: "Não identificado",
      detalhe: contato.vinculoRemovidoEm
        ? "O vínculo anterior foi desfeito por alguém da operação."
        : "Este número ainda não foi reconhecido como interessado nem assinante.",
      podeDesvincular: false,
      temInteressado: false,
      temAssinante: false,
    };
  }

  const quem = temAssinante ? "Assinante" : "Interessado";
  const como =
    contato.vinculoOrigem === "humano"
      ? "vinculado por uma pessoa da operação"
      : contato.vinculoOrigem === "automatico"
        ? "reconhecido automaticamente pelo telefone"
        : null;

  return {
    temVinculo: true,
    rotulo: temInteressado && temAssinante ? "Assinante (veio da landing)" : quem,
    detalhe: como,
    podeDesvincular: true,
    temInteressado,
    temAssinante,
  };
}

/**
 * Valida a escolha antes de gravar o vínculo.
 *
 * Devolve a mensagem de erro, ou `null` quando pode seguir. Vincular "nada"
 * não é uma operação: seria gravar autoria e data de uma decisão que não
 * existiu.
 */
export function validarSelecaoDeVinculo(selecao: {
  interessadoId?: string | null;
  assinanteId?: string | null;
}): string | null {
  if (!selecao.interessadoId && !selecao.assinanteId) {
    return "Escolha um interessado ou um assinante para vincular.";
  }
  return null;
}

/**
 * Termo utilizável para buscar candidatos.
 *
 * Mesmo piso do backend (`lib/central/busca.ts`): com menos de dois
 * caracteres a busca devolveria quase tudo, o que passa a impressão de que o
 * campo não funciona.
 */
export function termoBuscavel(bruto: string): string | null {
  const limpo = bruto.trim();
  return limpo.length >= 2 ? limpo : null;
}
