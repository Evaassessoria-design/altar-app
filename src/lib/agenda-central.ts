import { parseTime } from "./agenda.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A AGENDA DA EMPRESA — DERIVADA, NUNCA GUARDADA
//
// A pergunta que esta tela existe para responder, e que hoje só era
// respondível abrindo evento por evento:
//
//   "O que a minha empresa tem hoje? E esta semana?"
//
// ── NADA AQUI É FONTE DE VERDADE ────────────────────────────────────────────
// Cada linha nasce de um dado que já existe em outro módulo. Mudar o horário
// de montagem no Briefing muda a agenda no mesmo instante — não há registro
// espelhado para sincronizar, e por isso não há como divergir.
//
// ── SÓ ATIVIDADE SUSTENTADA POR DADO ────────────────────────────────────────
// Montagem, cerimônia, recepção e desmontagem existem quando o briefing tem o
// horário. Retirada e devolução existem quando há reserva de acervo. Nada é
// inventado para preencher a tela: evento sem briefing aparece com uma linha
// só — a do próprio evento — e isso é a verdade sobre ele.
//
// ── O DIA É CIVIL ───────────────────────────────────────────────────────────
// Datas são "AAAA-MM-DD" e comparadas como texto, imunes a fuso. Horário é
// "HH:MM" normalizado por `parseTime`, o MESMO usado pela agenda do evento —
// duas leituras diferentes do mesmo campo produziriam duas verdades.
// ─────────────────────────────────────────────────────────────────────────────

/** O que uma linha da agenda representa. Só tipos sustentados por dado. */
export type TipoDeOperacao =
  | "montagem"
  | "cerimonia"
  | "recepcao"
  | "desmontagem"
  | "evento"
  | "retirada"
  | "devolucao";

export const ROTULO_DA_OPERACAO: Record<TipoDeOperacao, string> = {
  montagem: "Montagem",
  cerimonia: "Cerimônia",
  recepcao: "Recepção",
  desmontagem: "Desmontagem",
  evento: "Evento",
  retirada: "Retirada do acervo",
  devolucao: "Devolução do acervo",
};

export type EventoDaAgenda = {
  _id: string;
  nome: string;
  data: string;
  local: string;
  tipo: string;
  status: string;
  setupTime?: string;
  ceremonyTime?: string;
  receptionTime?: string;
  teardownTime?: string;
  equipe: { nome: string; horario?: string }[];
};

export type ReservaDaAgenda = {
  eventoId: string;
  inicio: string;
  fim: string;
  quantidade: number;
  saiu?: number;
  voltou?: number;
};

export type Operacao = {
  /** Chave estável para o React. */
  chave: string;
  data: string;
  /** "HH:MM" ou `null` — sem horário é atividade do dia, não das 00:00. */
  horario: string | null;
  tipo: TipoDeOperacao;
  eventoId: string;
  evento: string;
  local: string;
  equipe: { nome: string; horario?: string }[];
  /** Peças envolvidas, só em retirada/devolução. */
  pecas?: number;
  /** Aviso derivado com segurança. `null` quando não há o que dizer. */
  alerta: string | null;
};

export type DiaDaAgenda = {
  data: string;
  operacoes: Operacao[];
  /** Pessoas escaladas em mais de um evento neste dia. */
  equipeEmConflito: string[];
};

/**
 * O DIA CIVIL de uma data do ALTAR — o ÚNICO ponto de normalização da agenda.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 * `events.date` tem duas formas válidas, e as duas convivem no banco:
 *
 *   "2026-10-10"        conversão de lead e seed — a cliente marcou o DIA
 *   "2026-10-10T18:00"  formulário do evento (`datetime-local`)
 *
 * Comparação de intervalo é TEXTUAL. A forma com hora é mais longa e ordena
 * DEPOIS do limite superior:
 *
 *   "2026-10-10T18:00" <= "2026-10-10"   →   false
 *
 * O evento de HOJE cadastrado pelo formulário sumia da agenda — o mesmo
 * defeito que `convex/lib/dataDoDia.ts` documenta ter apagado o evento do dia
 * no Dashboard.
 *
 * ── UM PONTO SÓ ─────────────────────────────────────────────────────────────
 * Toda operação nasce com `data` já normalizada. Assim recorte, agrupamento e
 * o selo "hoje" da tela usam a mesma chave, sem cada consumidor lembrar de
 * cortar — que é como o defeito voltaria.
 *
 * Não converte fuso e não interpreta a hora: corta os 10 primeiros caracteres,
 * exatamente como o Financeiro já fazia. A hora do evento continua sendo dita
 * pelo briefing, que é onde ela é operacional.
 */
export function diaCivil(data: string): string {
  return data.slice(0, 10);
}

/**
 * Ordena: primeiro por data, depois por horário. Sem horário vai para o FIM do
 * dia — não para as 00:00, que fingiria uma precisão que ninguém informou.
 */
function ordenar(a: Operacao, b: Operacao): number {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  if (a.horario === b.horario) return 0;
  if (a.horario === null) return 1;
  if (b.horario === null) return -1;
  return a.horario < b.horario ? -1 : 1;
}

/** As quatro atividades que o briefing sustenta, na ordem do dia de trabalho. */
const DO_BRIEFING: readonly [keyof EventoDaAgenda, TipoDeOperacao][] = [
  ["setupTime", "montagem"],
  ["ceremonyTime", "cerimonia"],
  ["receptionTime", "recepcao"],
  ["teardownTime", "desmontagem"],
];

function operacoesDoEvento(e: EventoDaAgenda): Operacao[] {
  const base = {
    // Normalizado UMA VEZ, aqui. Tudo depois disto compara dia com dia.
    data: diaCivil(e.data),
    eventoId: e._id,
    evento: e.nome,
    local: e.local,
    equipe: e.equipe,
    alerta: null as string | null,
  };

  const doBriefing: Operacao[] = [];
  for (const [campo, tipo] of DO_BRIEFING) {
    const horario = parseTime(e[campo] as string | undefined);
    if (horario) doBriefing.push({ ...base, chave: `${e._id}:${tipo}`, horario, tipo });
  }

  // Sem NENHUM horário do briefing, o evento ainda ocupa o dia. Uma agenda que
  // escondesse o evento por falta de briefing esconderia justamente o que a
  // decoradora abriu a tela para ver.
  if (doBriefing.length === 0) {
    return [{ ...base, chave: `${e._id}:evento`, horario: null, tipo: "evento" }];
  }
  return doBriefing;
}

/**
 * Retirada e devolução, a partir das reservas de acervo.
 *
 * Uma linha por DIA, não por reserva: vinte peças retiradas no mesmo dia são
 * uma ida ao galpão, não vinte compromissos.
 */
function operacoesDoAcervo(
  e: EventoDaAgenda,
  reservas: readonly ReservaDaAgenda[],
): Operacao[] {
  const doEvento = reservas.filter((r) => r.eventoId === e._id);
  if (doEvento.length === 0) return [];

  const base = { eventoId: e._id, evento: e.nome, local: e.local, equipe: e.equipe };

  const porDia = (
    data: string,
    tipo: TipoDeOperacao,
    itens: readonly ReservaDaAgenda[],
    alerta: string | null,
  ): Operacao => ({
    ...base,
    chave: `${e._id}:${tipo}:${diaCivil(data)}`,
    // A janela de reserva já nasce como dia civil (`janelaSugerida`), mas
    // normalizar aqui também mantém a regra num lugar só.
    data: diaCivil(data),
    horario: null,
    tipo,
    pecas: itens.reduce((s, r) => s + r.quantidade, 0),
    alerta,
  });

  const saidas = new Map<string, ReservaDaAgenda[]>();
  const retornos = new Map<string, ReservaDaAgenda[]>();
  for (const r of doEvento) {
    saidas.set(r.inicio, [...(saidas.get(r.inicio) ?? []), r]);
    retornos.set(r.fim, [...(retornos.get(r.fim) ?? []), r]);
  }

  const linhas: Operacao[] = [];
  for (const [data, itens] of saidas) linhas.push(porDia(data, "retirada", itens, null));

  for (const [data, itens] of retornos) {
    // "Falta voltar" só é afirmável quando algo SAIU: sem saída registrada o
    // sistema não sabe se a peça foi ao evento. Mesma honestidade de
    // `acervo_nao_informado` na Ficha Técnica.
    const pendentes = itens.reduce((s, r) => {
      const saiu = r.saiu ?? 0;
      const voltou = r.voltou ?? 0;
      return s + Math.max(0, saiu - voltou);
    }, 0);
    linhas.push(
      porDia(
        data,
        "devolucao",
        itens,
        pendentes > 0 ? `${pendentes} peça(s) ainda não voltaram` : null,
      ),
    );
  }
  return linhas;
}

/**
 * Pessoas escaladas em MAIS DE UM evento no mesmo dia civil.
 *
 * É o único conflito que os dados de hoje sustentam com segurança: a escala
 * (`eventTeam.scheduledTime`) tem horário opcional, então comparar intervalos
 * inventaria uma precisão que ninguém informou. Estar em dois eventos no mesmo
 * dia já é a pergunta que a decoradora quer ver respondida — e essa é
 * verificável sem supor nada.
 *
 * Conflito de ACERVO não é recalculado aqui: a regra já existe em
 * `convex/lib/acervo.ts` e reimplementá-la criaria uma segunda verdade.
 */
function equipeEmConflito(eventosDoDia: readonly EventoDaAgenda[]): string[] {
  if (eventosDoDia.length < 2) return [];

  const eventosPorPessoa = new Map<string, Set<string>>();
  for (const e of eventosDoDia) {
    for (const p of e.equipe) {
      const atual = eventosPorPessoa.get(p.nome) ?? new Set<string>();
      atual.add(e._id);
      eventosPorPessoa.set(p.nome, atual);
    }
  }

  return [...eventosPorPessoa.entries()]
    .filter(([, eventos]) => eventos.size > 1)
    .map(([nome]) => nome)
    .sort();
}

/**
 * A agenda, agrupada por dia e em ordem cronológica.
 *
 * @param eventos  já recortados e já pertencentes à empresa (a query garante).
 * @param reservas reservas de acervo desses eventos.
 * @param de/ate   recorte, "AAAA-MM-DD". Retirada e devolução podem cair fora
 *                 do dia do evento (a janela cobre a véspera e o dia seguinte);
 *                 o recorte mantém a tela fiel ao filtro escolhido.
 */
export function montarAgenda(
  eventos: readonly EventoDaAgenda[],
  reservas: readonly ReservaDaAgenda[],
  de: string,
  ate: string,
): DiaDaAgenda[] {
  const todas: Operacao[] = [];
  for (const e of eventos) {
    todas.push(...operacoesDoEvento(e));
    todas.push(...operacoesDoAcervo(e, reservas));
  }

  const noRecorte = todas.filter((o) => o.data >= de && o.data <= ate).sort(ordenar);

  const porDia = new Map<string, Operacao[]>();
  for (const o of noRecorte) porDia.set(o.data, [...(porDia.get(o.data) ?? []), o]);

  return [...porDia.entries()].map(([data, operacoes]) => ({
    data,
    operacoes,
    // `data` já é dia civil; `e.data` pode trazer hora. Comparar sem normalizar
    // as duas pontas faria o conflito de equipe nunca ser detectado num evento
    // cadastrado pelo formulário.
    equipeEmConflito: equipeEmConflito(eventos.filter((e) => diaCivil(e.data) === data)),
  }));
}
