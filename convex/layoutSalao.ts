import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getOptionalUser, requireEventOwner, requireEventPhoto, requireUser } from "./lib/identity";
import {
  dadosDoLayout,
  fotosDoLayout,
  LIMITES,
  lugaresDoLayout,
  origemDoLayout,
  problemasDoLayout,
  semFotos,
  type DadosDoLayout,
} from "./lib/layoutSalao";

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT DO SALÃO — funções. A regra mora em lib/layoutSalao.ts; aqui só
// orquestração e as perguntas de posse.
//
// ── AS TRÊS PERGUNTAS DE SEMPRE ─────────────────────────────────────────────
//   · o layout é meu?            (userId do layout, NÃO_ENCONTRADO se não)
//   · o evento é meu?            (requireEventOwner)
//   · a foto é minha E deste evento? (requireEventPhoto, para cada fotoId)
// A terceira é a que pega o caso real: duas festas da MESMA decoradora, e a
// referência do bar de uma aparecendo no layout da outra.
//
// ── PAYWALL ─────────────────────────────────────────────────────────────────
// Desenhar e editar o layout NÃO passa pela trava de acesso: é dado dela, do
// evento dela, como o briefing. O que custa dinheiro — a leitura do croqui
// por IA e o envio do arquivo — vive em `layoutSalaoIa.ts` e
// `layoutRenders.generateUploadUrl`, que já são guardados.
// ─────────────────────────────────────────────────────────────────────────────

const naoEncontrado = () =>
  new ConvexError({ code: "NOT_FOUND", message: "Layout não encontrado" });

async function requireLayoutOwner(ctx: QueryCtx | MutationCtx, layoutId: Id<"eventLayouts">) {
  const user = await requireUser(ctx);
  const layout = await ctx.db.get(layoutId);
  if (!layout || layout.userId !== user._id) throw naoEncontrado();
  return { user, layout };
}

function nomeValido(nome: string): string {
  const n = nome.trim().slice(0, LIMITES.nome);
  return n || "Layout";
}

/** Recusa com TODOS os problemas, para a tela mostrar o que corrigir. */
function exigirLayoutValido(dados: DadosDoLayout) {
  const problemas = problemasDoLayout(dados);
  if (problemas.length > 0) {
    throw new ConvexError({
      code: "INVALID",
      message: problemas.slice(0, 5).join(" "),
      problemas,
    });
  }
}

async function exigirFotosDoEvento(
  ctx: MutationCtx,
  userId: Id<"users">,
  eventId: Id<"events">,
  dados: DadosDoLayout,
) {
  for (const fotoId of fotosDoLayout(dados)) {
    await requireEventPhoto(ctx, userId, eventId, fotoId);
  }
}

async function contarDoEvento(ctx: MutationCtx, eventId: Id<"events">) {
  // `take` com folga de um: basta saber se passou do teto.
  const linhas = await ctx.db
    .query("eventLayouts")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(LIMITES.layoutsPorEvento + 1);
  return linhas.length;
}

function exigirVagaNoEvento(quantos: number) {
  if (quantos >= LIMITES.layoutsPorEvento) {
    throw new ConvexError({
      code: "LIMIT",
      message: `Este evento já tem ${LIMITES.layoutsPorEvento} layouts. Apague uma opção antiga para criar outra.`,
    });
  }
}

function resumo(l: Doc<"eventLayouts">) {
  return {
    _id: l._id,
    eventId: l.eventId,
    nome: l.nome,
    origem: l.origem,
    updatedAt: l.updatedAt,
    // Derivados, nunca gravados.
    mesas: l.dados.mesas.posicoes.length,
    lugares: lugaresDoLayout(l.dados),
    largura: l.dados.salao.largura,
    comprimento: l.dados.salao.comprimento,
  };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export const listarDoEvento = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getOptionalUser(ctx);
    if (!user) return [];
    const event = await ctx.db.get(args.eventId);
    // Lista degrada para vazio — mesmo padrão de layoutRenders.listByEvent.
    if (!event || event.userId !== user._id) return [];
    const linhas = await ctx.db
      .query("eventLayouts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .take(LIMITES.layoutsPorEvento + 5);
    return linhas.map(resumo);
  },
});

export const obter = query({
  args: { layoutId: v.id("eventLayouts") },
  handler: async (ctx, args) => {
    const user = await getOptionalUser(ctx);
    if (!user) return null;
    const layout = await ctx.db.get(args.layoutId);
    if (!layout || layout.userId !== user._id) return null;

    // As fotos de referência voltam com URL, mas SÓ as que continuam sendo
    // deste evento e desta conta. Foto apagada da Galeria depois de ligada ao
    // elemento simplesmente some — o elemento fica, sem referência.
    const fotos: Record<string, { url: string | null; previewUrl: string | null; legenda?: string }> = {};
    for (const fotoId of fotosDoLayout(layout.dados)) {
      const foto = await ctx.db.get(fotoId);
      if (!foto || foto.userId !== user._id || foto.eventId !== layout.eventId) continue;
      fotos[fotoId] = {
        url: await ctx.storage.getUrl(foto.storageId),
        previewUrl: foto.previewStorageId ? await ctx.storage.getUrl(foto.previewStorageId) : null,
        legenda: foto.caption,
      };
    }
    return { ...layout, fotos };
  },
});

/**
 * Layouts de TODOS os eventos dela, para reaproveitar como modelo
 * ("o mesmo salão do casamento de março").
 *
 * Com teto e dizendo que tem mais: a tela mostra "40 mais recentes" em vez de
 * fingir que a lista acabou.
 */
export const listarParaReaproveitar = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    if (!user) return { itens: [], haMais: false };
    const TETO = 40;
    const linhas = await ctx.db
      .query("eventLayouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(TETO + 1);
    const nomes = new Map<Id<"events">, string>();
    const itens = [];
    for (const l of linhas.slice(0, TETO)) {
      if (!nomes.has(l.eventId)) {
        const ev = await ctx.db.get(l.eventId);
        nomes.set(l.eventId, ev?.name ?? "Evento removido");
      }
      itens.push({ ...resumo(l), eventoNome: nomes.get(l.eventId)! });
    }
    return { itens, haMais: linhas.length > TETO };
  },
});

// ── Escrita ──────────────────────────────────────────────────────────────────

export const criar = mutation({
  args: {
    eventId: v.id("events"),
    nome: v.string(),
    dados: dadosDoLayout,
    origem: origemDoLayout,
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    exigirVagaNoEvento(await contarDoEvento(ctx, args.eventId));
    exigirLayoutValido(args.dados);
    await exigirFotosDoEvento(ctx, user._id, args.eventId, args.dados);

    const agora = new Date().toISOString();
    return ctx.db.insert("eventLayouts", {
      userId: user._id,
      eventId: args.eventId,
      nome: nomeValido(args.nome),
      dados: args.dados,
      origem: args.origem,
      createdAt: agora,
      updatedAt: agora,
    });
  },
});

export const salvar = mutation({
  args: {
    layoutId: v.id("eventLayouts"),
    nome: v.string(),
    dados: dadosDoLayout,
  },
  handler: async (ctx, args) => {
    const { user, layout } = await requireLayoutOwner(ctx, args.layoutId);
    // O evento pode ter mudado de dono ou sumido desde que o layout nasceu;
    // gravar num layout órfão de evento alheio seria escrever no dado de outra conta.
    await requireEventOwner(ctx, layout.eventId);
    exigirLayoutValido(args.dados);
    await exigirFotosDoEvento(ctx, user._id, layout.eventId, args.dados);

    await ctx.db.patch(args.layoutId, {
      nome: nomeValido(args.nome),
      dados: args.dados,
      updatedAt: new Date().toISOString(),
    });
    return args.layoutId;
  },
});

/**
 * Cópia para o MESMO evento (nova opção) ou para OUTRO evento dela (modelo).
 * Para outro evento, as fotos ficam para trás — ver `semFotos`.
 */
export const duplicar = mutation({
  args: {
    layoutId: v.id("eventLayouts"),
    eventIdDestino: v.id("events"),
    nome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, layout } = await requireLayoutOwner(ctx, args.layoutId);
    await requireEventOwner(ctx, args.eventIdDestino);
    exigirVagaNoEvento(await contarDoEvento(ctx, args.eventIdDestino));

    const mesmoEvento = layout.eventId === args.eventIdDestino;
    const dados = mesmoEvento ? layout.dados : semFotos(layout.dados);
    if (mesmoEvento) await exigirFotosDoEvento(ctx, user._id, layout.eventId, dados);

    const agora = new Date().toISOString();
    return ctx.db.insert("eventLayouts", {
      userId: user._id,
      eventId: args.eventIdDestino,
      nome: nomeValido(args.nome ?? `${layout.nome} (cópia)`),
      dados,
      origem: "copia",
      createdAt: agora,
      updatedAt: agora,
    });
  },
});

export const remover = mutation({
  args: { layoutId: v.id("eventLayouts") },
  handler: async (ctx, args) => {
    await requireLayoutOwner(ctx, args.layoutId);
    // Só a linha do layout. As fotos de referência são da Galeria e continuam
    // lá — apagar a planta não pode apagar a foto do bar.
    await ctx.db.delete(args.layoutId);
  },
});
