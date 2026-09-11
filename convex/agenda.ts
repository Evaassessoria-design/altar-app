import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/identity";

// ─────────────────────────────────────────────────────────────────────────────
// AGENDA OPERACIONAL — LEITURA, NUNCA FONTE
//
// Esta query NÃO guarda horário nenhum. Ela junta o que já existe e entrega
// cru; quem transforma em linha do tempo é `src/lib/agenda-central.ts`.
//
// ── POR QUE NÃO EXISTE TABELA `agendaItems` ─────────────────────────────────
// Um registro espelhando `briefing.setupTime` seria a segunda resposta para
// "que horas começa a montagem?" — e as duas divergiriam no dia em que alguém
// corrigisse o briefing e esquecesse a agenda. A agenda é DERIVADA: mudar o
// briefing muda a agenda no mesmo instante, porque não há o que sincronizar.
//
// ── O QUE ENTRA, E DE ONDE ──────────────────────────────────────────────────
//   events                  data, nome, local, tipo, status
//   briefings               setupTime, ceremonyTime, receptionTime, teardownTime
//   eventTeam + teamMembers quem está escalado e a que horas
//   collectionReservations  retirada (inicio) e devolução (fim) das peças
//
// ── O RECORTE É POR DIA CIVIL ───────────────────────────────────────────────
// `events.date` e as janelas de reserva são "AAAA-MM-DD", nunca instante. A
// comparação é textual, o que a mantém imune a fuso — o mesmo cuidado de
// lib/dataDoDia.ts. Um evento pertence ao dia dele, não a um intervalo UTC.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tudo o que acontece entre duas datas, para a empresa de quem está logado.
 *
 * @param de  primeiro dia do recorte, "AAAA-MM-DD" (inclusive)
 * @param ate último dia do recorte, "AAAA-MM-DD" (inclusive)
 */
export const listarOperacoes = query({
  args: { de: v.string(), ate: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Recorte inválido devolve vazio em vez de lançar: é uma query de
    // listagem, e derrubar a tela por causa de um filtro é pior que não
    // mostrar nada. Mesmo padrão de `acervo.disponibilidade`.
    if (!args.de || !args.ate || args.de > args.ate) {
      return { eventos: [], reservas: [] };
    }

    // ── events.date TEM DUAS FORMAS VÁLIDAS ──────────────────────────────────
    //   "2026-10-10"        conversão de lead e seed — a cliente marcou o DIA
    //   "2026-10-10T18:00"  formulário do evento (`datetime-local`)
    // As duas são legítimas e convivem no banco (ver lib/dataDeEvento).
    //
    // A comparação de intervalo é TEXTUAL, e a forma com hora é mais longa —
    // logo ordena DEPOIS do limite superior:
    //
    //   "2026-10-10T18:00" <= "2026-10-10"   →   false
    //
    // Sem cortar no dia, o evento de HOJE cadastrado pelo formulário sumia da
    // agenda. É o mesmo defeito que lib/dataDoDia.ts documenta ter apagado o
    // evento do dia no Dashboard — a agenda não pode repeti-lo.
    const diaCivil = (data: string) => data.slice(0, 10);

    // Cancelado não é operação: ninguém monta, ninguém carrega, ninguém vai.
    // Continua existindo no módulo Eventos — só não ocupa a agenda.
    const eventos = (
      await ctx.db
        .query("events")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    ).filter((e) => {
      const dia = diaCivil(e.date);
      return e.status !== "cancelled" && dia >= args.de && dia <= args.ate;
    });

    if (eventos.length === 0) {
      // Sem evento no recorte não há agenda: reserva sempre pertence a um
      // evento, e sem o evento não há como dizer de quem ela é.
      return { eventos: [], reservas: [] };
    }

    const idsNoRecorte = new Set(eventos.map((e) => e._id as string));

    // ── TRÊS LEITURAS, NÃO UMA POR EVENTO ────────────────────────────────────
    // Buscar briefing/equipe/reserva dentro de um laço seria N+1: uma agenda
    // de mês com 15 eventos viraria 45 consultas. Aqui são três, sempre.
    const [briefings, escalas, membros, reservasDoUsuario] = await Promise.all([
      ctx.db
        .query("briefings")
        .withIndex("by_event")
        .filter((q) => q.eq(q.field("userId"), user._id))
        .collect(),
      ctx.db
        .query("eventTeam")
        .withIndex("by_event")
        .filter((q) => q.eq(q.field("userId"), user._id))
        .collect(),
      ctx.db
        .query("teamMembers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("collectionReservations")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    const briefingPorEvento = new Map(briefings.map((b) => [b.eventId as string, b]));
    const nomeDoMembro = new Map(membros.map((m) => [m._id as string, m.name]));

    const equipePorEvento = new Map<string, { nome: string; horario?: string }[]>();
    for (const e of escalas) {
      const chave = e.eventId as string;
      if (!idsNoRecorte.has(chave)) continue;
      const nome = nomeDoMembro.get(e.teamMemberId as string);
      // Escala apontando para membro apagado: fica de fora em vez de virar
      // uma linha sem nome na agenda.
      if (!nome) continue;
      const lista = equipePorEvento.get(chave) ?? [];
      lista.push({ nome, horario: e.scheduledTime });
      equipePorEvento.set(chave, lista);
    }

    return {
      eventos: eventos.map((e) => {
        const b = briefingPorEvento.get(e._id as string);
        return {
          _id: e._id as string,
          nome: e.name,
          data: e.date,
          local: e.location,
          tipo: e.type,
          status: e.status,
          setupTime: b?.setupTime,
          ceremonyTime: b?.ceremonyTime,
          receptionTime: b?.receptionTime,
          teardownTime: b?.teardownTime,
          equipe: equipePorEvento.get(e._id as string) ?? [],
        };
      }),
      // Só as reservas de evento que está no recorte. A retirada/devolução
      // pode cair fora das datas pedidas (a janela cobre a véspera e o dia
      // seguinte) — quem decide o que exibir é a derivação, que conhece a
      // regra; a query não recorta o que não é dela.
      reservas: reservasDoUsuario
        .filter((r) => idsNoRecorte.has(r.eventId as string))
        .map((r) => ({
          eventoId: r.eventId as string,
          inicio: r.inicio,
          fim: r.fim,
          quantidade: r.quantidade,
          saiu: r.saiu,
          voltou: r.voltou,
        })),
    };
  },
});
