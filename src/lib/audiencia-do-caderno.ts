import type { Audience } from "./briefing-areas.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PARA QUEM É ESTE CADERNO? — DUAS RESPOSTAS
//
//   cliente → "Para os noivos" num casamento, "Para o cliente" no resto
//   equipe  → "Para a equipe"
//
// Até 13/10 havia um terceiro, "Uso interno", que imprimia TUDO — inclusive o
// que não é de ninguém além da empresa. Ele saiu do menu: um documento que
// existe para não sair da empresa não precisa de botão de gerar PDF, e era o
// único dos três em que um valor interno podia ir parar no papel.
//
// O valor `"interno"` CONTINUA existindo como VISIBILIDADE de item, campo e
// foto (`Audience` em briefing-areas.ts): é ele que mantém algo fora dos dois
// cadernos. Nenhum dado gravado muda — só o menu.
//
// ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
// Para a tela não inventar rótulo. `equipe` e `cliente` são valores de banco;
// ninguém que decora evento deve lê-los. O vocabulário humano mora aqui, ao
// lado do valor que o gerador espera.
// ─────────────────────────────────────────────────────────────────────────────

export type VersaoDoCaderno = Extract<Audience, "cliente" | "equipe">;

export type OpcaoDeAudiencia = {
  /** O valor que `montarCaderno` espera. Nunca aparece na tela. */
  valor: VersaoDoCaderno;
  /** O que a pessoa lê no menu (o do cliente depende do tipo do evento). */
  rotulo: string;
  /** Uma linha dizendo o que entra e o que não entra. */
  detalhe: string;
  /** Sufixo do nome do arquivo, para os dois PDFs não se sobrescreverem. */
  sufixo: string;
};

/**
 * As duas versões, na ordem do uso: a equipe é quem mais recebe caderno, e
 * era o documento que a tela gerava antes do seletor existir.
 */
export const AUDIENCIAS: readonly OpcaoDeAudiencia[] = [
  {
    valor: "equipe",
    rotulo: "Para a equipe",
    detalhe: "Carregar, montar e conferir o retorno. Nunca leva valores.",
    sufixo: "equipe",
  },
  {
    valor: "cliente",
    rotulo: "Para o cliente",
    detalhe: "O projeto: conceito, itens, referências, decisões e opcionais. Sem custos.",
    sufixo: "cliente",
  },
] as const;

/** O padrão seguro: o mesmo documento que a tela já gerava. */
export const AUDIENCIA_PADRAO: VersaoDoCaderno = "equipe";

/**
 * A opção de uma versão. Valor desconhecido — inclusive o antigo "interno" —
 * cai no padrão em vez de devolver `undefined`: um caderno da equipe impresso
 * por engano não leva valor nenhum, e um botão que não faz nada não ajuda.
 */
export function opcaoDaAudiencia(valor: string | undefined | null): OpcaoDeAudiencia {
  return (
    AUDIENCIAS.find((a) => a.valor === valor) ??
    AUDIENCIAS.find((a) => a.valor === AUDIENCIA_PADRAO)!
  );
}

/**
 * O rótulo que a tela mostra. Num casamento, quem recebe são os noivos — e o
 * documento diz isso no selo e no menu.
 */
export function rotuloDaVersao(valor: VersaoDoCaderno, tipoDoEvento?: string): string {
  if (valor === "cliente") return tipoDoEvento === "wedding" ? "Para os noivos" : "Para o cliente";
  return opcaoDaAudiencia(valor).rotulo;
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
