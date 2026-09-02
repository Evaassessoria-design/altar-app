import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getOwnedEvent, requireEventOwner, requireTeamMember, requireUser } from "./lib/identity";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import { chaveDoMaterial, normalizeName } from "./lib/materiais";
import {
  deficitDaReserva,
  disponibilidadeNaJanela,
  divergenciaDaSaida,
  faltaVoltar,
  janelaSugerida,
  janelaValida,
  quantidadeFisicaValida,
  retornoPossivel,
  situacaoDaReserva,
} from "./lib/acervo";
import { consolidarMateriais } from "./lib/fichaTecnica";
import { aplicarAjuste, aplicarContagem } from "./lib/ajusteDeAcervo";
import { ehObrigacaoDeMontagem } from "./lib/escopoDoProjeto";

// ─────────────────────────────────────────────────────────────────────────────
// ACERVO — catálogo, reservas, saída e retorno.
//
// ── A REGRA DE CONCORRÊNCIA ─────────────────────────────────────────────────
// A disponibilidade é SEMPRE recalculada dentro da mutation, na hora de
// gravar. Nunca se confia no número que a tela leu: duas pessoas da mesma
// empresa abrindo a mesma tela leriam "25 disponíveis" e as duas reservariam
// 25. Convex roda mutations em transação serializável, então recalcular aqui
// dentro é o que garante que a segunda enxergue a primeira.
//
// ── O QUE NENHUMA MUTATION AQUI FAZ ─────────────────────────────────────────
//  · alterar `quantidadeTotal` por causa de saída ou retorno;
//  · cortar uma reserva para caber no disponível;
//  · mexer na reserva porque a ficha técnica mudou;
//  · criar compra, lançamento ou qualquer coisa financeira.
// ─────────────────────────────────────────────────────────────────────────────

const unidade = v.union(
  v.literal("un"), v.literal("haste"), v.literal("maco"), v.literal("duzia"),
  v.literal("caixa"), v.literal("pacote"), v.literal("rolo"),
  v.literal("m"), v.literal("m2"), v.literal("kg"), v.literal("l"),
);

function exigirQuantidade(valor: number, unidadeDoItem: string, campo: string) {
  if (!quantidadeFisicaValida(valor, unidadeDoItem)) {
    throw new ConvexError({
      code: "INVALID",
      message: `${campo} inválida para a unidade "${unidadeDoItem}".`,
    });
  }
}

// ═════════════════════════════════════════════════════════════ CATÁLOGO

export const listItems = query({
  args: { incluirArquivados: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const [itens, reservas] = await Promise.all([
      ctx.db.query("collectionItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("collectionReservations").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
    ]);

    const visiveis = args.incluirArquivados ? itens : itens.filter((i) => !i.archived);
    // Contagem por item numa passada — nada de uma consulta por item.
    const porItem = new Map<string, typeof reservas>();
    for (const r of reservas) {
      porItem.set(r.collectionItemId, [...(porItem.get(r.collectionItemId) ?? []), r]);
    }

    return visiveis
      .map((item) => {
        const minhas = porItem.get(item._id) ?? [];
        return {
          ...item,
          // NÃO mostramos "disponível agora": disponibilidade depende de uma
          // JANELA, e um número sem data seria enganoso. A tela geral mostra o
          // total e quantas reservas existem; o número real aparece quando a
          // decoradora escolhe o evento.
          reservasFuturas: minhas.length,
          eventosComReserva: new Set(minhas.map((r) => r.eventId)).size,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },
});

export const createItem = mutation({
  args: {
    nome: v.string(),
    unidade,
    quantidadeTotal: v.number(),
    categoria: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const nome = args.nome.trim();
    if (!nome) throw new ConvexError({ code: "INVALID", message: "Informe o nome do item" });
    exigirQuantidade(args.quantidadeTotal, args.unidade, "Quantidade total");

    if (args.materialId) {
      const material = await ctx.db.get(args.materialId);
      if (!material || material.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Material não encontrado" });
      }
    }

    const searchName = normalizeName(nome);
    const chave = chaveDoMaterial(nome, args.unidade);
    const existentes = await ctx.db
      .query("collectionItems")
      .withIndex("by_user_search", (q) => q.eq("userId", user._id).eq("searchName", searchName))
      .collect();
    const igual = existentes.find((i) => chaveDoMaterial(i.nome, i.unidade) === chave);
    if (igual) {
      // Mesma regra estreita do catálogo de materiais: só colide nome
      // normalizado E unidade. Cadastrar de novo reativa o arquivado, mas NÃO
      // soma quantidade — somar em silêncio dobraria o acervo sem ninguém pedir.
      if (igual.archived) await ctx.db.patch(igual._id, comCarimbo({ archived: undefined }));
      return { itemId: igual._id, criado: false };
    }

    const itemId = await ctx.db.insert("collectionItems", {
      userId: user._id,
      nome,
      searchName,
      unidade: args.unidade,
      quantidadeTotal: args.quantidadeTotal,
      categoria: args.categoria?.trim() || undefined,
      materialId: args.materialId,
      notes: args.notes?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });
    return { itemId, criado: true };
  },
});

export const updateItem = mutation({
  args: {
    id: v.id("collectionItems"),
    nome: v.optional(v.string()),
    // `quantidadeTotal` NAO entra aqui de proposito. Mudar estoque em silencio
    // por um formulario de edicao seria uma segunda porta sem historico — e o
    // historico e justamente o que torna a baixa auditavel. Estoque muda por
    // `ajustarEstoque` ou `registrarContagem`, sempre com motivo e rastro.
    categoria: v.optional(v.union(v.string(), v.null())),
    materialId: v.optional(v.union(v.id("materials"), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Item do acervo não encontrado" });

    if (args.materialId) {
      const material = await ctx.db.get(args.materialId);
      if (!material || material.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Material não encontrado" });
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.nome?.trim()) {
      patch.nome = args.nome.trim();
      patch.searchName = normalizeName(args.nome);
    }
    if (args.categoria !== undefined) patch.categoria = args.categoria ?? undefined;
    if (args.materialId !== undefined) patch.materialId = args.materialId ?? undefined;
    if (args.notes !== undefined) patch.notes = args.notes ?? undefined;

    await ctx.db.patch(args.id, comCarimbo(patch));
  },
});

/**
 * Arquiva em vez de apagar.
 *
 * Apagar destruiria o histórico das reservas que já citaram o item — e uma
 * reserva com saída e retorno registrados é rastreabilidade de peça física,
 * não lixo. Arquivado só some das reservas novas.
 */
export const setItemArchived = mutation({
  args: { id: v.id("collectionItems"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Item do acervo não encontrado" });

    if (args.archived) {
      // Arquivar algo já prometido para um evento futuro esconderia uma
      // promessa em aberto. A reserva precisa ser resolvida antes.
      const reservas = await ctx.db
        .query("collectionReservations")
        .withIndex("by_item", (q) => q.eq("collectionItemId", args.id))
        .collect();
      const hoje = new Date().toISOString().slice(0, 10);
      const futuras = reservas.filter((r) => r.fim >= hoje);
      if (futuras.length > 0) {
        throw new ConvexError({
          code: "CONFLICT",
          message: `Este item tem ${futuras.length} reserva(s) em eventos que ainda vão acontecer.`,
        });
      }
    }
    await ctx.db.patch(args.id, comCarimbo({ archived: args.archived || undefined }));
  },
});

// ═════════════════════════════════════════════════════════════ RESERVAS

/** Todas as reservas de um item, no formato que a regra pura consulta. */
async function reservasDoItem(ctx: QueryCtx | MutationCtx, itemId: Id<"collectionItems">) {
  const reservas = await ctx.db
    .query("collectionReservations")
    .withIndex("by_item", (q) => q.eq("collectionItemId", itemId))
    .collect();
  return reservas.map((r) => ({
    _id: r._id as string,
    eventId: r.eventId as string,
    quantidade: r.quantidade,
    inicio: r.inicio,
    fim: r.fim,
  }));
}

/**
 * Disponibilidade de um item para um evento, numa janela.
 *
 * Query de LEITURA — a tela usa para mostrar antes de reservar. Mas nunca é a
 * fonte da decisão: a mutation recalcula na hora de gravar.
 */
export const disponibilidade = query({
  args: {
    collectionItemId: v.id("collectionItems"),
    eventId: v.optional(v.id("events")),
    inicio: v.string(),
    fim: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.collectionItemId);
    if (!item || item.userId !== user._id) return null;
    if (!janelaValida({ inicio: args.inicio, fim: args.fim })) return null;

    return disponibilidadeNaJanela(
      item.quantidadeTotal,
      await reservasDoItem(ctx, args.collectionItemId),
      { inicio: args.inicio, fim: args.fim },
      (args.eventId as string | undefined) ?? null,
    );
  },
});

/**
 * Reserva (ou ajusta) peças do acervo para um evento.
 *
 * IDEMPOTENTE por (evento, item): clicar duas vezes AJUSTA a mesma reserva em
 * vez de criar outra. Duas reservas do mesmo item no mesmo evento contariam a
 * peça duas vezes contra os outros eventos.
 *
 * NÃO BLOQUEIA por déficit: a decoradora resolve alugando ou comprando, e
 * cortar a reserva para caber esconderia justamente o problema. Grava o que
 * ela pediu e devolve o déficit para a tela avisar.
 */
export const reservar = mutation({
  args: {
    collectionItemId: v.id("collectionItems"),
    eventId: v.id("events"),
    quantidade: v.number(),
    inicio: v.optional(v.string()),
    fim: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    necessidadeTecnica: v.optional(v.number()),
    origem: v.optional(v.union(v.literal("ficha"), v.literal("manual"))),
  },
  handler: async (ctx, args) => {
    const { user, event } = await requireEventOwner(ctx, args.eventId);
    const item = await ctx.db.get(args.collectionItemId);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Item do acervo não encontrado" });
    if (item.archived)
      throw new ConvexError({
        code: "INVALID",
        message: "Este item está arquivado. Reative-o para reservar.",
      });

    exigirQuantidade(args.quantidade, item.unidade, "Quantidade");

    // Janela: a do pedido, ou a sugerida a partir da data do evento (véspera →
    // dia seguinte). O fallback é declarado, nunca silencioso — ver lib/acervo.
    const janela =
      args.inicio && args.fim
        ? { inicio: args.inicio, fim: args.fim }
        : janelaSugerida(event.date);
    if (!janelaValida(janela))
      throw new ConvexError({ code: "INVALID", message: "A data final é anterior à inicial." });

    if (args.materialId) {
      const material = await ctx.db.get(args.materialId);
      if (!material || material.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Material não encontrado" });
      }
    }

    const existente = await ctx.db
      .query("collectionReservations")
      .withIndex("by_event_item", (q) =>
        q.eq("eventId", args.eventId).eq("collectionItemId", args.collectionItemId),
      )
      .unique();

    // ── A CONTA ACONTECE AQUI, NÃO NA TELA ─────────────────────────────────
    // Duas pessoas com a mesma tela aberta leriam "25 disponíveis" e as duas
    // reservariam 25. Recalcular dentro da mutation faz a segunda enxergar a
    // primeira.
    const estado = disponibilidadeNaJanela(
      item.quantidadeTotal,
      await reservasDoItem(ctx, args.collectionItemId),
      janela,
      args.eventId as string,
    );
    const deficit = deficitDaReserva(args.quantidade, estado.disponivel);

    const campos = {
      quantidade: args.quantidade,
      inicio: janela.inicio,
      fim: janela.fim,
      origem: args.origem ?? ("manual" as const),
      materialId: args.materialId,
      necessidadeTecnica: args.necessidadeTecnica,
      updatedAt: new Date().toISOString(),
    };

    if (existente) {
      await ctx.db.patch(existente._id, campos);
      return { reservaId: existente._id, criada: false, deficit, disponivel: estado.disponivel };
    }

    const reservaId = await ctx.db.insert("collectionReservations", {
      userId: user._id,
      collectionItemId: args.collectionItemId,
      eventId: args.eventId,
      ...campos,
    });
    return { reservaId, criada: true, deficit, disponivel: estado.disponivel };
  },
});

/**
 * Libera a reserva. NÃO apaga o item do acervo, não mexe na ficha, na compra
 * nem no financeiro.
 *
 * Recusa liberar o que já saiu do galpão: apagar a reserva apagaria junto o
 * registro de que 20 peças estão na rua.
 */
export const liberarReserva = mutation({
  args: { id: v.id("collectionReservations") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const reserva = await ctx.db.get(args.id);
    if (!reserva || reserva.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Reserva não encontrada" });
    if ((reserva.saiu ?? 0) > 0) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Estas peças já saíram do galpão. Registre o retorno antes de liberar.",
      });
    }
    await ctx.db.delete(args.id);
    return { liberada: true };
  },
});

// ═══════════════════════════════════════════════════════ SAÍDA E RETORNO

/**
 * Registra quanto SAIU fisicamente.
 *
 * Sair diferente do reservado acontece — a equipe pega peça extra no galpão —
 * e não é erro: a divergência fica visível e a RESERVA NÃO É AJUSTADA.
 */
export const registrarSaida = mutation({
  args: { id: v.id("collectionReservations"), saiu: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const reserva = await ctx.db.get(args.id);
    if (!reserva || reserva.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Reserva não encontrada" });

    const item = await ctx.db.get(reserva.collectionItemId);
    exigirQuantidade(args.saiu, item?.unidade ?? "un", "Quantidade que saiu");

    if ((reserva.voltou ?? 0) > args.saiu) {
      throw new ConvexError({
        code: "INVALID",
        message: "Já foi registrado um retorno maior do que esta saída.",
      });
    }

    await ctx.db.patch(args.id, { saiu: args.saiu, updatedAt: new Date().toISOString() });
    return { divergencia: divergenciaDaSaida({ ...reserva, saiu: args.saiu }) };
  },
});

/**
 * Registra quanto VOLTOU.
 *
 * ── O QUE ISTO NÃO FAZ, E É O PONTO MAIS IMPORTANTE ─────────────────────────
 * Não mexe em `quantidadeTotal`. Saíram 20 e voltaram 19? O acervo continua
 * com 40. A peça pode estar no caminhão, com o cliente, quebrada ou só não
 * conferida — e baixar o estoque sozinho seria o sistema decidindo um prejuízo
 * que ninguém apurou.
 *
 * Voltar MAIS do que saiu é recusado: é erro de conferência, e aceitar em
 * silêncio produziria acervo fantasma.
 */
export const registrarRetorno = mutation({
  args: { id: v.id("collectionReservations"), voltou: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const reserva = await ctx.db.get(args.id);
    if (!reserva || reserva.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Reserva não encontrada" });

    if (!retornoPossivel(reserva.saiu, args.voltou)) {
      throw new ConvexError({
        code: "INVALID",
        message:
          reserva.saiu === undefined || reserva.saiu === 0
            ? "Registre primeiro quanto saiu do galpão."
            : `Não é possível voltar mais do que saiu (${reserva.saiu}).`,
      });
    }

    await ctx.db.patch(args.id, { voltou: args.voltou, updatedAt: new Date().toISOString() });
    return {
      faltaVoltar: faltaVoltar({ ...reserva, voltou: args.voltou }),
      situacao: situacaoDaReserva({ ...reserva, voltou: args.voltou }),
    };
  },
});

// ══════════════════════════════════════════════ ACERVO DENTRO DO EVENTO

/**
 * O acervo deste evento: reservas, situação e conflitos com outros eventos.
 *
 * Uma leitura só. As reservas de todos os itens envolvidos vêm de uma consulta
 * por item (poucas), e os nomes dos eventos em conflito de um `Map` montado
 * uma vez — nada de consulta por linha.
 */
export const doEvento = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return null;

    const minhas = await ctx.db
      .query("collectionReservations")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (minhas.length === 0) return { reservas: [], resumo: { itens: 0, comConflito: 0, retornoPendente: 0 } };

    const itens = new Map<string, Doc<"collectionItems">>();
    const reservasPorItem = new Map<string, Awaited<ReturnType<typeof reservasDoItem>>>();
    for (const r of minhas) {
      if (!itens.has(r.collectionItemId)) {
        const item = await ctx.db.get(r.collectionItemId);
        if (item && item.userId === event.userId) itens.set(r.collectionItemId, item);
        reservasPorItem.set(r.collectionItemId, await reservasDoItem(ctx, r.collectionItemId));
      }
    }

    // Nomes dos eventos em conflito, numa leitura só do próprio usuário.
    const eventos = new Map(
      (
        await ctx.db.query("events").withIndex("by_user", (q) => q.eq("userId", event.userId)).collect()
      ).map((e) => [e._id as string, e]),
    );

    const reservas = minhas.map((r) => {
      const item = itens.get(r.collectionItemId);
      const estado = disponibilidadeNaJanela(
        item?.quantidadeTotal ?? 0,
        reservasPorItem.get(r.collectionItemId) ?? [],
        { inicio: r.inicio, fim: r.fim },
        args.eventId as string,
      );
      return {
        ...r,
        item: item ? { _id: item._id, nome: item.nome, unidade: item.unidade, quantidadeTotal: item.quantidadeTotal } : null,
        disponivel: estado.disponivel,
        deficit: deficitDaReserva(r.quantidade, estado.disponivel),
        situacao: situacaoDaReserva(r),
        faltaVoltar: faltaVoltar(r),
        divergenciaDaSaida: divergenciaDaSaida(r),
        conflitos: estado.conflitos.map((c) => ({
          ...c,
          evento: eventos.get(c.eventId)?.name ?? "Outro evento",
          data: eventos.get(c.eventId)?.date ?? null,
        })),
      };
    });

    return {
      reservas,
      resumo: {
        itens: reservas.length,
        comConflito: reservas.filter((r) => r.deficit > 0).length,
        retornoPendente: reservas.filter((r) => r.faltaVoltar > 0).length,
      },
    };
  },
});

/**
 * Reserva o acervo a partir da FICHA TÉCNICA — a resposta que o MASTER #7
 * deixou em aberto.
 *
 * Consolida primeiro: se o vaso aparece em três composições (10 + 20 + 5), a
 * reserva é UMA de 35, não três cegas. A origem continua rastreável na ficha.
 *
 * Só materiais com item de acervo VINCULADO entram — vínculo por nome seria a
 * heurística perigosa que o resto do sistema já recusa.
 */
export const reservarDaFicha = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { user, event } = await requireEventOwner(ctx, args.eventId);

    const itensDeMontagem = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const linhas = consolidarMateriais(
      itensDeMontagem.map((i) => ({
        _id: i._id, nome: i.name, area: i.area, ambiente: i.ambiente,
        quantidade: i.quantity, projectScope: i.projectScope, receita: i.receita,
      })),
      ehObrigacaoDeMontagem,
    );

    const acervo = await ctx.db
      .query("collectionItems")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const porMaterial = new Map(
      acervo.filter((i) => i.materialId && !i.archived).map((i) => [i.materialId as string, i]),
    );

    const janela = janelaSugerida(event.date);
    let criadas = 0;
    let atualizadas = 0;
    const semAcervo: string[] = [];
    const comDeficit: { nome: string; deficit: number }[] = [];

    for (const linha of linhas) {
      if (!linha.materialId) continue;
      const item = porMaterial.get(linha.materialId);
      if (!item) {
        // Reutilizável sem item de acervo vinculado continua respondendo
        // "disponibilidade não informada" — não inventamos vínculo por nome.
        if (linha.tipo === "reutilizavel") semAcervo.push(linha.nome);
        continue;
      }

      const existente = await ctx.db
        .query("collectionReservations")
        .withIndex("by_event_item", (q) =>
          q.eq("eventId", args.eventId).eq("collectionItemId", item._id),
        )
        .unique();

      const estado = disponibilidadeNaJanela(
        item.quantidadeTotal,
        await reservasDoItem(ctx, item._id),
        existente ? { inicio: existente.inicio, fim: existente.fim } : janela,
        args.eventId as string,
      );
      const deficit = deficitDaReserva(linha.necessario, estado.disponivel);
      if (deficit > 0) comDeficit.push({ nome: linha.nome, deficit });

      const campos = {
        quantidade: linha.necessario,
        origem: "ficha" as const,
        materialId: linha.materialId as Id<"materials">,
        necessidadeTecnica: linha.necessario,
        updatedAt: new Date().toISOString(),
      };

      if (existente) {
        // Idempotente: a mesma ação de novo AJUSTA, nunca duplica. A janela já
        // escolhida pela decoradora é preservada.
        await ctx.db.patch(existente._id, campos);
        atualizadas += 1;
        continue;
      }
      await ctx.db.insert("collectionReservations", {
        userId: user._id,
        collectionItemId: item._id,
        eventId: args.eventId,
        inicio: janela.inicio,
        fim: janela.fim,
        ...campos,
      });
      criadas += 1;
    }

    return { criadas, atualizadas, semAcervo, comDeficit };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// AJUSTE DE ESTOQUE — a única porta que muda `quantidadeTotal`
//
// Reserva, saída e retorno NÃO mexem no estoque físico, e continuam não
// mexendo. Saíram 20 e voltaram 19? O total fica igual até alguém decidir o
// que aconteceu com a peça — ela pode estar no carro, na casa da cliente, ou
// voltar na segunda. Transformar "não voltou" em "perdeu" automaticamente
// inventaria um prejuízo que ninguém constatou.
//
// Concorrência: a quantidade de partida é lida DENTRO da mutation, nunca vinda
// da tela. Duas pessoas baixando 2 peças de um acervo de 3 — a segunda enxerga
// o resultado da primeira e é recusada, em vez das duas lerem "3" e o estoque
// terminar em -1.
// ─────────────────────────────────────────────────────────────────────────────

/** Lê o item garantindo que é de quem está pedindo. */
async function itemDoUsuario(ctx: MutationCtx, id: Id<"collectionItems">, userId: Id<"users">) {
  const item = await ctx.db.get(id);
  if (!item || item.userId !== userId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Item do acervo não encontrado" });
  }
  return item;
}

/** Confere que o evento citado é da mesma empresa — senão o ajuste apontaria para fora. */
async function eventoDoUsuario(
  ctx: MutationCtx,
  eventId: Id<"events"> | undefined,
  userId: Id<"users">,
) {
  if (!eventId) return undefined;
  const evento = await ctx.db.get(eventId);
  if (!evento || evento.userId !== userId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Evento não encontrado" });
  }
  return eventId;
}

/**
 * Entrada, perda, quebra, avaria ou descarte.
 *
 * `quantidade` é sempre POSITIVA: o tipo decide o sinal. "Perda" que aumenta o
 * estoque não é ajuste, é erro de digitação.
 */
export const ajustarEstoque = mutation({
  args: {
    collectionItemId: v.id("collectionItems"),
    tipo: v.union(
      v.literal("entrada"),
      v.literal("perda"),
      v.literal("quebra"),
      v.literal("avaria"),
      v.literal("descarte"),
    ),
    quantidade: v.number(),
    motivo: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    responsibleId: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await itemDoUsuario(ctx, args.collectionItemId, user._id);
    const eventId = await eventoDoUsuario(ctx, args.eventId, user._id);

    // Mesma porta das outras mutations: id do navegador nao pode apontar para
    // a equipe de outra empresa.
    await requireTeamMember(ctx, user._id, args.responsibleId);

    const r = aplicarAjuste({
      quantidadeAtual: item.quantidadeTotal,
      tipo: args.tipo,
      quantidade: args.quantidade,
      unidade: item.unidade,
    });
    if (!r.ok) throw new ConvexError({ code: "AJUSTE_INVALIDO", message: r.motivo });

    await ctx.db.patch(item._id, comCarimbo({ quantidadeTotal: r.quantidadeDepois }));
    await ctx.db.insert("collectionAdjustments", {
      userId: user._id,
      collectionItemId: item._id,
      tipo: args.tipo,
      delta: r.delta,
      quantidadeAntes: item.quantidadeTotal,
      quantidadeDepois: r.quantidadeDepois,
      motivo: args.motivo?.trim() || undefined,
      eventId,
      responsibleId: args.responsibleId,
    });

    return { quantidadeAntes: item.quantidadeTotal, quantidadeDepois: r.quantidadeDepois };
  },
});

/**
 * Contagem física: informa-se o que foi CONTADO, não a diferença.
 *
 * É o que alguém faz de prancheta na mão — conta e escreve o que achou. Pedir
 * a diferença obrigaria a pessoa a fazer a subtração de cabeça, que é
 * justamente onde o erro entra.
 */
export const registrarContagem = mutation({
  args: {
    collectionItemId: v.id("collectionItems"),
    quantidadeContada: v.number(),
    motivo: v.optional(v.string()),
    responsibleId: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await itemDoUsuario(ctx, args.collectionItemId, user._id);
    await requireTeamMember(ctx, user._id, args.responsibleId);

    const r = aplicarContagem({
      quantidadeAtual: item.quantidadeTotal,
      quantidadeContada: args.quantidadeContada,
      unidade: item.unidade,
    });
    if (!r.ok) throw new ConvexError({ code: "AJUSTE_INVALIDO", message: r.motivo });

    await ctx.db.patch(item._id, comCarimbo({ quantidadeTotal: r.quantidadeDepois }));
    await ctx.db.insert("collectionAdjustments", {
      userId: user._id,
      collectionItemId: item._id,
      tipo: "acerto_inventario",
      delta: r.delta,
      quantidadeAntes: item.quantidadeTotal,
      quantidadeDepois: r.quantidadeDepois,
      motivo: args.motivo?.trim() || undefined,
      responsibleId: args.responsibleId,
    });

    return { quantidadeAntes: item.quantidadeTotal, quantidadeDepois: r.quantidadeDepois };
  },
});

/** Ajustes recentes de um item, do mais novo para o mais antigo. */
export const historicoDoItem = query({
  args: { collectionItemId: v.id("collectionItems"), limite: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.collectionItemId);
    if (!item || item.userId !== user._id) return [];

    const ajustes = await ctx.db
      .query("collectionAdjustments")
      .withIndex("by_item", (q) => q.eq("collectionItemId", args.collectionItemId))
      .order("desc")
      .take(args.limite ?? 20);

    // O nome do evento é resolvido aqui para a tela não fazer uma consulta por
    // linha (o N+1 que já custou caro noutra tela).
    const eventos = new Map<string, string>();
    for (const a of ajustes) {
      if (a.eventId && !eventos.has(a.eventId)) {
        const e = await ctx.db.get(a.eventId);
        if (e && e.userId === user._id) eventos.set(a.eventId, e.name);
      }
    }

    return ajustes.map((a) => ({ ...a, eventName: a.eventId ? eventos.get(a.eventId) : undefined }));
  },
});
