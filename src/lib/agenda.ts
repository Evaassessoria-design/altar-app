// ─────────────────────────────────────────────────────────────────────────────
// AGENDA DO EVENTO — consolidação dos horários que o ALTAR JÁ TEM.
//
// Módulo PURO: recebe o que as telas já carregam e devolve a agenda pronta.
// Nenhuma chamada de rede, nenhuma consulta nova, NENHUM dado inventado.
//
// A origem de cada item é preservada em `origin` justamente para a tela poder
// dizer de onde a informação veio ("do briefing", "da escala"). Isso ensina a
// decoradora a manter a fonte atualizada — e deixa evidente que a agenda não
// inventa compromisso nenhum.
//
// NÃO EXISTE integração com Google Agenda aqui nem em lugar nenhum do projeto:
// sem OAuth, sem API, sem credencial, sem sincronização. A palavra "Google"
// aparece apenas como texto na interface.
// ─────────────────────────────────────────────────────────────────────────────

/** Uma pessoa escalada num horário. */
export type AgendaPerson = {
  name: string;
  role?: string;
};

/** Item do dia do evento. Um horário pode reunir várias pessoas. */
export type AgendaEntry = {
  /** "HH:MM" — usado para ordenar e exibir. */
  time: string;
  title: string;
  /** De onde o dado veio, para a tela explicar ao usuário. */
  origin: "briefing" | "equipe";
  /** Preenchido só quando `origin` é "equipe". */
  people?: AgendaPerson[];
};

/** Compromisso anterior ao evento (alinhamento com fornecedor). */
export type AgendaAlignment = {
  /** ISO ou "AAAA-MM-DD" — como veio do alinhamento. */
  date: string;
  supplierName: string;
  note: string;
  by?: string;
  nextAction?: string;
};

export type Agenda = {
  before: AgendaAlignment[];
  onTheDay: AgendaEntry[];
  isEmpty: boolean;
};

// ── Entradas, no formato em que as telas já as possuem ──────────────────────

type BriefingTimes = {
  setupTime?: string;
  ceremonyTime?: string;
  receptionTime?: string;
  teardownTime?: string;
} | null | undefined;

type TeamAssignment = {
  scheduledTime?: string;
  member?: { name: string; role?: string } | null;
};

type SupplierWithAlignments = {
  companyName: string;
  alignments?: Array<{
    date: string;
    note: string;
    by?: string;
    nextAction?: string;
  }>;
};

/**
 * Normaliza um horário para "HH:MM".
 *
 * Os campos de horário do briefing são texto livre — a decoradora pode ter
 * escrito "9h", "09:00", "9:30" ou "às 16h". Aceitamos o que dá para entender
 * com segurança e DESCARTAMOS o resto: um horário mal interpretado, colocado na
 * ordem errada, é pior do que horário nenhum. O texto original continua visível
 * no briefing de qualquer forma.
 *
 * Devolve `null` quando não dá para ter certeza.
 */
export function parseTime(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const texto = raw.trim();
  if (!texto) return null;

  // "09:30", "9:30", "09h30", "9h30", "9 h 30"
  const comMinutos = texto.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (comMinutos) {
    const h = Number(comMinutos[1]);
    const m = Number(comMinutos[2]);
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    return null;
  }

  // "9h", "16h", "9 h"
  const soHora = texto.match(/(\d{1,2})\s*[hH](?!\d)/);
  if (soHora) {
    const h = Number(soHora[1]);
    if (h <= 23) return `${String(h).padStart(2, "0")}:00`;
    return null;
  }

  // Um número solto só é aceito quando o texto é SÓ ele — "16" vira 16:00.
  // "12 mesas" não vira horário nenhum.
  const soNumero = texto.match(/^(\d{1,2})$/);
  if (soNumero) {
    const h = Number(soNumero[1]);
    if (h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }

  return null;
}

/** Ordem de desempate quando dois itens caem no mesmo horário. */
const ORDEM_DO_DIA = ["Montagem", "Chegada da equipe", "Cerimônia", "Recepção", "Desmontagem"];

/**
 * Monta a agenda do evento a partir dos dados já existentes.
 *
 * As pessoas da equipe escaladas no MESMO horário são agrupadas num único item
 * — evita repetir "09:30" cinco vezes seguidas, que era o pedido explícito.
 */
export function buildAgenda(input: {
  briefing: BriefingTimes;
  team: TeamAssignment[] | undefined;
  suppliers: SupplierWithAlignments[] | undefined;
}): Agenda {
  const { briefing, team, suppliers } = input;

  // ── No dia do evento ──────────────────────────────────────────────────────
  const doDia: AgendaEntry[] = [];

  const doBriefing: Array<[string | undefined, string]> = [
    [briefing?.setupTime, "Montagem"],
    [briefing?.ceremonyTime, "Cerimônia"],
    [briefing?.receptionTime, "Recepção"],
    [briefing?.teardownTime, "Desmontagem"],
  ];

  for (const [bruto, titulo] of doBriefing) {
    const time = parseTime(bruto);
    if (time) doDia.push({ time, title: titulo, origin: "briefing" });
  }

  // Equipe: agrupa por horário. Quem não tem horário definido fica de fora da
  // linha do tempo — a escala continua visível na seção Equipe do Evento.
  const porHorario = new Map<string, AgendaPerson[]>();
  for (const atribuicao of team ?? []) {
    const time = parseTime(atribuicao.scheduledTime);
    if (!time || !atribuicao.member) continue;
    const pessoas = porHorario.get(time) ?? [];
    pessoas.push({ name: atribuicao.member.name, role: atribuicao.member.role });
    porHorario.set(time, pessoas);
  }

  for (const [time, pessoas] of porHorario) {
    doDia.push({
      time,
      title: "Chegada da equipe",
      origin: "equipe",
      people: pessoas.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    });
  }

  doDia.sort((a, b) => {
    if (a.time !== b.time) return a.time.localeCompare(b.time);
    return ORDEM_DO_DIA.indexOf(a.title) - ORDEM_DO_DIA.indexOf(b.title);
  });

  // ── Antes do evento ───────────────────────────────────────────────────────
  // Alinhamentos com fornecedores, achatados e ordenados por data.
  const antes: AgendaAlignment[] = [];
  for (const fornecedor of suppliers ?? []) {
    for (const alinhamento of fornecedor.alignments ?? []) {
      if (!alinhamento.date) continue;
      antes.push({
        date: alinhamento.date,
        supplierName: fornecedor.companyName,
        note: alinhamento.note,
        by: alinhamento.by,
        nextAction: alinhamento.nextAction,
      });
    }
  }
  antes.sort((a, b) => a.date.localeCompare(b.date));

  return {
    before: antes,
    onTheDay: doDia,
    isEmpty: antes.length === 0 && doDia.length === 0,
  };
}
