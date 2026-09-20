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

// ─────────────────────────────────────────────────────────────────────────────
// O QUE CADA CADERNO PODE CONTER, CAMPO A CAMPO
//
// `itemVisibleTo` decide se o ITEM aparece. Isso não basta: um item contratado
// aparece para a cliente — e aparecia levando junto dois campos que não são
// dela.
//
// ── O QUE VAZAVA ────────────────────────────────────────────────────────────
//  · FORNECEDOR. Quem entrega a peça é informação comercial da decoradora. Num
//    PDF que vai por WhatsApp para a cliente, é o contato de quem ela pode
//    procurar direto no próximo casamento.
//  · OBSERVAÇÃO. `assemblyItems.notes` é a nota operacional que a decoradora
//    escreve para si e para a equipe — "pedir 10 a mais, sempre chega peça
//    quebrada", "confirmar com o buffet antes". Não existe campo separado para
//    uma observação destinada à cliente, e tratar a interna como se fosse é o
//    tipo de erro que se descobre depois de enviado.
//
// Enquanto o caderno só era gerado para a equipe, nada disso chegava à
// cliente. O seletor de audiência abriu a porta — e é onde ela se fecha.
//
// A equipe continua vendo os dois: fornecedor é quem ela cobra na entrega, e a
// observação é a instrução de montagem.
// ─────────────────────────────────────────────────────────────────────────────

/** Campos do item de montagem que o caderno imprime condicionalmente. */
export type CampoDoItem = "supplierName" | "notes";

const NUNCA_PARA_A_CLIENTE: readonly CampoDoItem[] = ["supplierName", "notes"];

/**
 * Este campo do item pode ser impresso para esta audiência?
 *
 * Só `cliente` restringe. `equipe` e `interno` recebem tudo o que o item tem —
 * esconder da equipe a observação de montagem seria esconder o trabalho.
 */
export function campoDoItemVisivelPara(campo: CampoDoItem, audiencia: Audience): boolean {
  if (audiencia !== "cliente") return true;
  return !NUNCA_PARA_A_CLIENTE.includes(campo);
}
