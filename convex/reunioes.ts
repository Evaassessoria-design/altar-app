import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getOwnedEvent, requireEventOwner, requireUser } from "./lib/identity";
import { dataDoDia } from "./lib/dataDoDia";
import {
  LIMITES,
  ehData,
  ehHorario,
  listaLimpa,
  normalizarLink,
  ordenarReunioes,
  textoOuNada,
} from "./lib/reunioes";

// ─────────────────────────────────────────────────────────────────────────────
// REUNIÕES DO EVENTO
//
// Registrar a reunião e o que foi decidido nela, dentro do evento. Regras em
// `lib/reunioes.ts`; o porquê da tabela no schema (`reunioes`).
//
// ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
// Não envia convite, não manda mensagem, não cria sala em serviço externo, não
// grava nem transcreve. O link é texto que a decoradora colou.
//
// ── POSSE ───────────────────────────────────────────────────────────────────
// Toda função confere o dono pelo EVENTO (ou pela reunião, que carrega o
// `userId`). Reunião de outra conta responde NOT_FOUND — confirmar que existe
// já seria contar que aquela empresa tem um evento.
// ─────────────────────────────────────────────────────────────────────────────

const situacao = v.union(v.literal("agendada"), v.literal("realizada"), v.literal("cancelada"));

const pendencia = v.object({
  texto: v.string(),
  responsavel: v.optional(v.string()),
  prazo: v.optional(v.string()),
  feita: v.boolean(),
});

/** Teto de reuniões lidas por evento. Um casamento tem cinco, dez. */
const LIMITE_POR_EVENTO = 200;

function invalido(message: string): never {
  throw new ConvexError({ code: "INVALID", message });
}

function exigirData(valor: string, rotulo: string) {
  if (!ehData(valor)) invalido(`${rotulo}: use uma data válida.`);
}

function exigirHorario(valor: string) {
  if (!ehHorario(valor)) invalido("Horário: use o formato 14:30.");
}

function pendenciasLimpas(
  lista: readonly { texto: string; responsavel?: string; prazo?: string; feita: boolean }[],
) {
  const saida: NonNullable<Doc<"reunioes">["pendencias"]> = [];
  for (const p of lista) {
    const texto = p.texto.trim().slice(0, LIMITES.itemDeLista);
    if (!texto) continue;
    if (p.prazo) exigirData(p.prazo, "Prazo da pendência");
    saida.push({
      texto,
      responsavel: textoOuNada(p.responsavel, 200),
      prazo: p.prazo || undefined,
      feita: p.feita,
    });
    if (saida.length >= LIMITES.itens) break;
  }
  return saida;
}

/** A reunião, garantindo que é de quem pede. */
async function minhaReuniao(ctx: QueryCtx | MutationCtx, id: Id<"reunioes">) {
  const user = await requireUser(ctx);
  const reuniao = await ctx.db.get(id);
  if (!reuniao || reuniao.userId !== user._id) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Reunião não encontrada" });
  }
  return { user, reuniao };
}

/** As reuniões do evento: próximas primeiro, depois as passadas. */
export const doEvento = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return null;
    const lidas = await ctx.db
      .query("reunioes")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .take(LIMITE_POR_EVENTO + 1);
    const minhas = lidas.slice(0, LIMITE_POR_EVENTO).filter((r) => r.userId === event.userId);
    return {
      evento: { _id: event._id, name: event.name },
      reunioes: ordenarReunioes(minhas, dataDoDia()),
      /** A tela escreve "200 carregadas (há mais)" em vez de afirmar o total. */
      temMais: lidas.length > LIMITE_POR_EVENTO,
    };
  },
});

/** Uma reunião, para abrir e editar. `null` se não é de quem pede. */
export const obter = query({
  args: { id: v.id("reunioes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const r = await ctx.db.get(args.id);
    if (!r || r.userId !== user._id) return null;
    return r;
  },
});

/**
 * Agenda uma reunião.
 *
 * ── DUPLO TOQUE ─────────────────────────────────────────────────────────────
 * A tela trava o botão enquanto envia, mas a mutation é chamável direto, e
 * rede lenta + toque repetido criava duas reuniões iguais. Mesmo título, dia
 * e horário no mesmo evento, criada há menos de um minuto: devolve a que já
 * existe em vez de criar outra.
 */
export const criar = mutation({
  args: {
    eventId: v.id("events"),
    titulo: v.string(),
    data: v.string(),
    horario: v.optional(v.string()),
    participantes: v.optional(v.string()),
    link: v.optional(v.string()),
    pauta: v.optional(v.string()),
    situacao: v.optional(situacao),
  },
  handler: async (ctx, args) => {
    const { user, event } = await requireEventOwner(ctx, args.eventId);
    const titulo = textoOuNada(args.titulo, LIMITES.titulo);
    if (!titulo) invalido("Dê um título à reunião (ex.: Reunião de briefing).");
    exigirData(args.data, "Data");
    const horario = textoOuNada(args.horario, 5);
    if (horario) exigirHorario(horario);
    let link: string | undefined;
    if (args.link?.trim()) {
      const r = normalizarLink(args.link);
      if (!r.ok) invalido(r.motivo);
      link = r.link;
    }

    const agora = new Date();
    const recentes = await ctx.db
      .query("reunioes")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .order("desc")
      .take(20);
    const repetida = recentes.find(
      (r) =>
        r.userId === user._id &&
        r.titulo === titulo &&
        r.data === args.data &&
        (r.horario ?? "") === (horario ?? "") &&
        agora.getTime() - Date.parse(r.criadaEm) < 60_000,
    );
    if (repetida) return repetida._id;

    return ctx.db.insert("reunioes", {
      userId: user._id,
      eventId: event._id,
      titulo,
      data: args.data,
      horario,
      participantes: textoOuNada(args.participantes, LIMITES.participantes),
      link,
      situacao: args.situacao ?? "agendada",
      pauta: textoOuNada(args.pauta, LIMITES.texto),
      criadaEm: agora.toISOString(),
    });
  },
});

/**
 * Edita a reunião. `null` LIMPA o campo; ausente deixa como está.
 *
 * Reabrir é editar: uma reunião realizada ou cancelada continua editável —
 * a ata se completa depois, e o clique trocado tem volta.
 */
export const atualizar = mutation({
  args: {
    id: v.id("reunioes"),
    titulo: v.optional(v.string()),
    data: v.optional(v.string()),
    horario: v.optional(v.union(v.string(), v.null())),
    participantes: v.optional(v.union(v.string(), v.null())),
    link: v.optional(v.union(v.string(), v.null())),
    situacao: v.optional(situacao),
    pauta: v.optional(v.union(v.string(), v.null())),
    anotacoes: v.optional(v.union(v.string(), v.null())),
    resumo: v.optional(v.union(v.string(), v.null())),
    decisoes: v.optional(v.array(v.string())),
    pendencias: v.optional(v.array(pendencia)),
    proximaData: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { reuniao } = await minhaReuniao(ctx, args.id);
    const patch: Partial<Doc<"reunioes">> = {};

    if (args.titulo !== undefined) {
      const t = textoOuNada(args.titulo, LIMITES.titulo);
      if (!t) invalido("O título não pode ficar vazio.");
      patch.titulo = t;
    }
    if (args.data !== undefined) {
      exigirData(args.data, "Data");
      patch.data = args.data;
    }
    if (args.horario !== undefined) {
      const h = textoOuNada(args.horario, 5);
      if (h) exigirHorario(h);
      patch.horario = h;
    }
    if (args.link !== undefined) {
      if (args.link === null || !args.link.trim()) patch.link = undefined;
      else {
        const r = normalizarLink(args.link);
        if (!r.ok) invalido(r.motivo);
        patch.link = r.link;
      }
    }
    if (args.participantes !== undefined) {
      patch.participantes = textoOuNada(args.participantes, LIMITES.participantes);
    }
    if (args.situacao !== undefined) patch.situacao = args.situacao;
    if (args.pauta !== undefined) patch.pauta = textoOuNada(args.pauta, LIMITES.texto);
    if (args.anotacoes !== undefined) patch.anotacoes = textoOuNada(args.anotacoes, LIMITES.texto);
    if (args.resumo !== undefined) patch.resumo = textoOuNada(args.resumo, LIMITES.texto);
    if (args.decisoes !== undefined) {
      const l = listaLimpa(args.decisoes);
      patch.decisoes = l.length ? l : undefined;
    }
    if (args.pendencias !== undefined) {
      const l = pendenciasLimpas(args.pendencias);
      patch.pendencias = l.length ? l : undefined;
    }
    if (args.proximaData !== undefined) {
      if (args.proximaData) exigirData(args.proximaData, "Próxima reunião");
      patch.proximaData = args.proximaData || undefined;
    }

    await ctx.db.patch(reuniao._id, { ...patch, atualizadaEm: new Date().toISOString() });
  },
});

/** Apaga a reunião. Não tem filhos: o que ela registra some junto, e a tela diz isso antes. */
export const remover = mutation({
  args: { id: v.id("reunioes") },
  handler: async (ctx, args) => {
    const { reuniao } = await minhaReuniao(ctx, args.id);
    await ctx.db.delete(reuniao._id);
  },
});
