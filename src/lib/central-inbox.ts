// ─────────────────────────────────────────────────────────────────────────────
// CAIXA DE ENTRADA DA CENTRAL — rótulos, filtros e agrupamentos
//
// Fora do componente pelo mesmo motivo de `central-fila.ts`: o que a tela
// AFIRMA é decisão de produto, não detalhe de renderização.
//
// Duas afirmações aqui são especialmente perigosas se estiverem erradas:
//
//   · "a janela de resposta fecha em X" — leva alguém a adiar uma resposta
//     que já não pode sair;
//   · "estas são as tarefas vencidas" — leva alguém a dormir tranquilo.
//
// Por isso as duas são funções puras, testadas, e nenhuma delas inventa
// número: sem prazo não há atraso, sem janela não há contagem.
// ─────────────────────────────────────────────────────────────────────────────

export type StatusDeConversa =
  | "aberta"
  | "aguardando_cliente"
  | "aguardando_aprovacao"
  | "escalada_ceo"
  | "resolvida"
  | "arquivada";

export type Canal = "whatsapp" | "instagram" | "email" | "chat";

export type StatusDeTrabalho = "aberto" | "em_andamento" | "concluido" | "cancelado";

export type TipoDeTrabalho =
  | "follow_up"
  | "demonstracao"
  | "onboarding"
  | "suporte"
  | "contato_cobranca"
  | "retorno"
  | "outro";

export type TipoDeSinal = "reclamacao" | "sugestao" | "bug" | "funcionalidade" | "elogio";

export type StatusDeSinal =
  | "novo"
  | "triado"
  | "em_produto"
  | "planejado"
  | "entregue"
  | "descartado";

export type Severidade = "baixa" | "media" | "alta" | "critica";

// ─── Rótulos ─────────────────────────────────────────────────────────────────

export const ROTULO_DO_STATUS: Record<StatusDeConversa, string> = {
  aberta: "Aberta",
  aguardando_cliente: "Aguardando cliente",
  aguardando_aprovacao: "Aguardando aprovação",
  escalada_ceo: "Escalada",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
};

/**
 * O canal aparece como ATRIBUTO da conversa, nunca como seção da tela.
 * É a mesma regra do backend: WhatsApp é canal, não domínio.
 */
export const ROTULO_DO_CANAL: Record<Canal, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "E-mail",
  chat: "Chat",
};

export const ROTULO_DO_TIPO_DE_TRABALHO: Record<TipoDeTrabalho, string> = {
  follow_up: "Follow-up",
  demonstracao: "Demonstração",
  onboarding: "Onboarding",
  suporte: "Suporte",
  contato_cobranca: "Contato de cobrança",
  retorno: "Retorno",
  outro: "Outro",
};

export const ROTULO_DO_STATUS_DE_TRABALHO: Record<StatusDeTrabalho, string> = {
  aberto: "Aberta",
  em_andamento: "Em andamento",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

export const ROTULO_DO_TIPO_DE_SINAL: Record<TipoDeSinal, string> = {
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
  bug: "Bug",
  funcionalidade: "Funcionalidade",
  elogio: "Elogio",
};

export const ROTULO_DO_STATUS_DE_SINAL: Record<StatusDeSinal, string> = {
  novo: "Novo",
  triado: "Triado",
  em_produto: "Em produto",
  planejado: "Planejado",
  entregue: "Entregue",
  descartado: "Descartado",
};

export const ROTULO_DA_SEVERIDADE: Record<Severidade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const CLASSE_DA_SEVERIDADE: Record<Severidade, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-muted text-muted-foreground",
  alta: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  critica: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

// ─── Opções dos filtros ──────────────────────────────────────────────────────

export type Opcao<T extends string> = { valor: T; rotulo: string };

function opcoesDe<T extends string>(rotulos: Record<T, string>): Opcao<T>[] {
  return (Object.keys(rotulos) as T[]).map((valor) => ({ valor, rotulo: rotulos[valor] }));
}

export const OPCOES_DE_STATUS = opcoesDe(ROTULO_DO_STATUS);
export const OPCOES_DE_CANAL = opcoesDe(ROTULO_DO_CANAL);
export const OPCOES_DE_TIPO_DE_TRABALHO = opcoesDe(ROTULO_DO_TIPO_DE_TRABALHO);
export const OPCOES_DE_STATUS_DE_TRABALHO = opcoesDe(ROTULO_DO_STATUS_DE_TRABALHO);
export const OPCOES_DE_TIPO_DE_SINAL = opcoesDe(ROTULO_DO_TIPO_DE_SINAL);
export const OPCOES_DE_STATUS_DE_SINAL = opcoesDe(ROTULO_DO_STATUS_DE_SINAL);
export const OPCOES_DE_SEVERIDADE = opcoesDe(ROTULO_DA_SEVERIDADE);

/** Valor do `<select>` quando nenhum filtro está aplicado. */
export const TODOS = "";

/** Piso do termo de busca — o MESMO do backend (convex/lib/central/busca.ts). */
const MINIMO_DA_BUSCA = 2;

/**
 * A busca está valendo?
 *
 * A tela precisa saber disto para dizer a verdade sobre a ORDEM da lista: com
 * busca, o banco devolve por relevância; sem busca, por recência. Anunciar
 * "mais recentes primeiro" durante uma busca faria a operação concluir que a
 * conversa de ontem sumiu.
 */
export function buscaAtiva(busca: string | undefined | null): boolean {
  return (busca ?? "").trim().length >= MINIMO_DA_BUSCA;
}

export type FiltrosDaCaixa = {
  departamento?: string;
  status?: string;
  prioridade?: string;
  canal?: string;
  responsavelUserId?: string;
  apenasEscaladas?: boolean;
  busca?: string;
};

/** Quantos filtros estão ativos — o número no botão "Filtros" do celular. */
export function contarFiltrosAtivos(filtros: FiltrosDaCaixa): number {
  let total = 0;
  for (const chave of [
    "departamento",
    "status",
    "prioridade",
    "canal",
    "responsavelUserId",
  ] as const) {
    if (filtros[chave]) total += 1;
  }
  if (filtros.apenasEscaladas) total += 1;
  if (buscaAtiva(filtros.busca)) total += 1;
  return total;
}

/**
 * O que a tela pode AFIRMAR sobre a lista carregada.
 *
 * Nunca diz "X conversas" como se fosse o total: enquanto houver próxima
 * página, o que existe é "X carregadas". Confundir os dois é como a caixa de
 * entrada passa a mentir — e ninguém desconfia de um número.
 */
export function descreverResultado(estado: {
  carregados: number;
  temMais: boolean;
  ordenadoPor: "relevancia" | "recencia";
  carregando: boolean;
}): string {
  if (estado.carregando && estado.carregados === 0) return "Carregando…";
  if (estado.carregados === 0) return "Nenhuma conversa com estes filtros.";

  const contagem = estado.temMais
    ? `${estado.carregados} carregadas (há mais)`
    : `${estado.carregados} conversa${estado.carregados === 1 ? "" : "s"}`;

  return estado.ordenadoPor === "relevancia"
    ? `${contagem} · por relevância da busca`
    : `${contagem} · mais recentes primeiro`;
}

// ─── Janela de resposta do canal ─────────────────────────────────────────────

const HORA_MS = 60 * 60 * 1000;

/**
 * Quanto tempo resta da janela em que o canal aceita resposta livre.
 *
 * `null` quando o canal não tem janela — e "não tem janela" NÃO é "janela
 * aberta para sempre": é ausência de informação, e a tela não afirma nada.
 */
export function rotuloDaJanela(
  janelaRespostaAte: number | undefined | null,
  agora: number,
): { texto: string; encerrada: boolean } | null {
  if (!janelaRespostaAte) return null;

  const restante = janelaRespostaAte - agora;
  if (restante <= 0) {
    return { texto: "Janela de resposta encerrada", encerrada: true };
  }

  const horas = Math.floor(restante / HORA_MS);
  if (horas >= 1) {
    return { texto: `Janela fecha em ${horas}h`, encerrada: false };
  }
  const minutos = Math.max(1, Math.round(restante / 60_000));
  return { texto: `Janela fecha em ${minutos} min`, encerrada: false };
}

// ─── Datas de prazo ──────────────────────────────────────────────────────────

/**
 * "AAAA-MM-DD" como se lê em português: "10/09/2026".
 *
 * O prazo é gravado em DIA CIVIL, texto, justamente para não passar por fuso
 * nenhum (lib/central/prazos.ts). Então a conversão aqui é TEXTUAL também —
 * criar um `Date` para formatar reintroduziria o fuso que o campo existe para
 * evitar, e a tarefa que vence dia 10 apareceria como dia 9 para quem está a
 * oeste de Greenwich.
 *
 * Valor fora do formato volta como veio: inventar uma data seria pior do que
 * mostrar o texto cru.
 */
export function formatarDiaCivil(dia: string | undefined | null): string {
  if (!dia) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia.trim());
  if (!m) return dia;
  const [, ano, mes, diaDoMes] = m;
  return `${diaDoMes}/${mes}/${ano}`;
}

// ─── Tarefas ─────────────────────────────────────────────────────────────────

export type TarefaAgrupavel = {
  status: StatusDeTrabalho;
  venceEm?: string;
  vencido: boolean;
  venceHoje: boolean;
};

export type GruposDeTarefas<T extends TarefaAgrupavel> = {
  vencidas: T[];
  hoje: T[];
  proximas: T[];
  semPrazo: T[];
  concluidas: T[];
  canceladas: T[];
};

/**
 * Separa a lista em "o que já era", "o que é hoje" e "o resto".
 *
 * Ordem das perguntas de quem abre a tela de manhã. Uma tarefa concluída
 * NUNCA aparece em vencidas, mesmo que a data tenha passado: ela foi feita, e
 * marcá-la de vermelho ensinaria a ignorar o vermelho.
 */
export function agruparTarefas<T extends TarefaAgrupavel>(tarefas: readonly T[]): GruposDeTarefas<T> {
  const grupos: GruposDeTarefas<T> = {
    vencidas: [],
    hoje: [],
    proximas: [],
    semPrazo: [],
    concluidas: [],
    canceladas: [],
  };

  for (const tarefa of tarefas) {
    if (tarefa.status === "concluido") grupos.concluidas.push(tarefa);
    else if (tarefa.status === "cancelado") grupos.canceladas.push(tarefa);
    else if (tarefa.vencido) grupos.vencidas.push(tarefa);
    else if (tarefa.venceHoje) grupos.hoje.push(tarefa);
    else if (tarefa.venceEm) grupos.proximas.push(tarefa);
    else grupos.semPrazo.push(tarefa);
  }

  return grupos;
}

// ─── Mensagens ───────────────────────────────────────────────────────────────

/**
 * O histórico vem do banco do mais NOVO para o mais ANTIGO (é assim que se
 * pagina "carregar mais antigas"), e a tela lê de cima para baixo em ordem
 * cronológica. A inversão é aqui, uma vez, e não espalhada pelos componentes.
 */
export function emOrdemCronologica<T extends { enviadaEm: number }>(
  mensagens: readonly T[],
): T[] {
  return [...mensagens].sort((a, b) => a.enviadaEm - b.enviadaEm);
}
