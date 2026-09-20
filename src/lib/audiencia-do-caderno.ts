import type { Audience } from "./briefing-areas.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PARA QUEM É ESTE CADERNO?
//
// O mesmo evento gera três documentos diferentes, e a diferença não é estética:
// é o que cada um pode conter.
//
//   interno  → tudo, inclusive seguro, custo e o que ficou de fora
//   equipe   → o que precisa ser montado, sem o que é só da empresa
//   cliente  → só o que foi contratado e aprovado por ela
//
// A regra já existia inteira: `itemVisibleTo` filtra os itens de montagem e
// `resolveAreasForAudience` filtra os campos do briefing (`briefing-areas.ts`).
// O PDF já a respeitava. O que faltava era o SELETOR: a tela chamava o gerador
// com `audience: "equipe"` fixo, então a versão da cliente nunca chegava a
// existir — e a decoradora que classificava um item como "cliente" esperando
// um documento para a cliente nunca o recebia.
//
// ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
// Para a tela não inventar rótulo. `interno`, `equipe` e `cliente` são valores
// de banco; ninguém que decora evento deve ler nenhum dos três. O vocabulário
// humano mora aqui, ao lado do valor que o gerador espera, e é conferido por
// teste contra o tipo `Audience` — acrescentar uma audiência sem rótulo quebra.
// ─────────────────────────────────────────────────────────────────────────────

export type OpcaoDeAudiencia = {
  /** O valor que `generateAssemblyPDF` espera. Nunca aparece na tela. */
  valor: Audience;
  /** O que a pessoa lê no menu. */
  rotulo: string;
  /** Uma linha dizendo o que entra e o que não entra. */
  detalhe: string;
  /** Sufixo do nome do arquivo, para três PDFs não se sobrescreverem. */
  sufixo: string;
};

/**
 * A ordem é a do uso: a equipe é quem mais recebe caderno, e é o padrão.
 *
 * `equipe` primeiro NÃO é só estética — é o valor que a tela usava antes deste
 * seletor existir. Mantê-lo como padrão garante que quem já imprimia o caderno
 * continue recebendo exatamente o mesmo documento sem mudar nada.
 */
export const AUDIENCIAS: readonly OpcaoDeAudiencia[] = [
  {
    valor: "equipe",
    rotulo: "Para a equipe de montagem",
    detalhe: "O que montar, onde e em que quantidade. Sem valores.",
    sufixo: "equipe",
  },
  {
    valor: "cliente",
    rotulo: "Para a cliente",
    detalhe: "Só o que foi contratado. Sem nota interna, sem o que ficou de fora.",
    sufixo: "cliente",
  },
  {
    valor: "interno",
    rotulo: "Uso interno",
    detalhe: "Tudo, inclusive o que não vai para a equipe nem para a cliente.",
    sufixo: "interno",
  },
] as const;

/** O padrão seguro: o mesmo documento que a tela já gerava. */
export const AUDIENCIA_PADRAO: Audience = "equipe";

/**
 * A opção de uma audiência. Valor desconhecido cai no padrão em vez de
 * devolver `undefined` — um caderno impresso a menos é pior do que um caderno
 * da equipe impresso por engano.
 */
export function opcaoDaAudiencia(valor: string | undefined | null): OpcaoDeAudiencia {
  return (
    AUDIENCIAS.find((a) => a.valor === valor) ??
    AUDIENCIAS.find((a) => a.valor === AUDIENCIA_PADRAO)!
  );
}
