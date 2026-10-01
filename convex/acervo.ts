import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getOwnedEvent, requireEventOwner, requireTeamMember, requireUser } from "./lib/identity";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import { canceladosDoUsuario, paraCalculo, reservasDoItem } from "./lib/reservasDoAcervo";
import { logisticaDoItem } from "./lib/logisticaDoAcervo";
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
  picoDeReservas,
  reservaEmAberto,
  pendenciasDoAcervo,
} from "./lib/acervo";
import { dataDoDia } from "./lib/dataDoDia";
import {
  condicoesDoItem,
  moverCondicao as calcularMovimento,
  pecasForaDeUso,
  voltouComProblema,
  type Condicao,
} from "./lib/condicaoDoAcervo";
import { consolidarMateriais } from "./lib/fichaTecnica";
import { agruparAcervoPorMaterial, substitutosCompativeis } from "./lib/acervo";
import {
  aplicarAjuste,
  aplicarContagem,
  aplicarManutencao,
  baixaRespeitaManutencao,
} from "./lib/ajusteDeAcervo";
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
    const [itens, brutas, cancelados] = await Promise.all([
      ctx.db.query("collectionItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("collectionReservations").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      canceladosDoUsuario(ctx, user._id),
    ]);
    const reservas = brutas.map((r) => paraCalculo(r, cancelados));

    const visiveis = args.incluirArquivados ? itens : itens.filter((i) => !i.archived);
    const hoje = new Date().toISOString().slice(0, 10);
    // Contagem por item numa passada — nada de uma consulta por item.
    const porItem = new Map<string, typeof reservas>();
    for (const r of reservas) {
      porItem.set(r.collectionItemId, [...(porItem.get(r.collectionItemId) ?? []), r]);
    }

    return visiveis
      .map((item) => {
        const minhas = porItem.get(item._id) ?? [];
        // "Reservado em N eventos" é uma frase no PRESENTE. Contar o histórico
        // inteiro fazia o número só crescer: depois de uma temporada a peça
        // aparecia reservada em eventos que já tinham acontecido e sido
        // desmontados. `reservaEmAberto` mantém o que ainda vale — e mantém
        // também a peça que saiu e não voltou, que a data sozinha perderia.
        // Evento cancelado não conta como "reservado em" — a não ser que as
        // peças dele estejam na rua, e aí `reservaEmAberto` já as mantém.
        const emAberto = minhas.filter(
          (r) => reservaEmAberto(r, hoje) && (!r.eventoCancelado || faltaVoltar(r) > 0),
        );
        return {
          ...item,
          // NÃO mostramos "disponível agora": disponibilidade depende de uma
          // JANELA, e um número sem data seria enganoso. A tela geral mostra o
          // total e quantas reservas existem; o número real aparece quando a
          // decoradora escolhe o evento.
          reservasFuturas: emAberto.length,
          eventosComReserva: new Set(emAberto.map((r) => r.eventId)).size,
          // O pior dia deste item, calculado pelo MESMO módulo de domínio que
          // a tela do evento usa. Não é "disponível agora" — é a resposta à
          // pergunta que não precisa de janela: existe algum dia em que o
          // prometido passa do que eu tenho?
          // `hoje` para o pico ignorar reserva que já terminou: déficit no
          // passado não tem mais conserto, e vira ruído permanente na lista.
          pico: picoDeReservas(item.quantidadeTotal, minhas, hoje, pecasForaDeUso(item)),
          // Quantas prontas, para limpar, em reparo… — "pronto" derivado.
          condicoes: condicoesDoItem(item),
          // ONDE estão — o outro eixo: no galpão, fora, aguardando conferência
          // (lib/logisticaDoAcervo.ts). Nunca somado com a condição.
          logistica: logisticaDoItem(item, minhas, hoje),
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

// `reservasDoItem` mora em lib/reservasDoAcervo.ts desde 30/09: ali a reserva
// ganha o cancelamento do evento, que nenhuma tela mandava para a regra.

/**
 * Disponibilidade de um item para um evento, numa janela.
 *
 * Query de LEITURA — a tela usa para mostrar antes de reservar. Mas nunca é a
 * fonte da decisão: a mutation recalcula na hora de gravar.
 */
/** Quantas linhas de cada bloco a tela recebe. O resto é contado, não escondido. */
const LINHAS_POR_BLOCO = 30;

/**
 * A segunda-feira do acervo: o que não voltou, o que está no conserto, e o
 * que isso faz com os próximos eventos. A regra é `pendenciasDoAcervo`
 * (lib/acervo.ts), com as mesmas funções da tela do evento.
 *
 * Duas leituras por dono, as mesmas de `listItems` — nada de consulta por
 * item. Os nomes dos eventos vêm só dos eventos DESTA conta.
 */
export const pendenciasPosEvento = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [itens, brutas, cancelados] = await Promise.all([
      ctx.db.query("collectionItems").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("collectionReservations").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      canceladosDoUsuario(ctx, user._id),
    ]);

    const p = pendenciasDoAcervo(
      itens.map((i) => ({ ...i, _id: i._id as string })),
      brutas.map((r) => paraCalculo(r, cancelados)),
      dataDoDia(),
    );

    // ── O QUE VOLTOU COM PROBLEMA, E DE QUAL EVENTO ────────────────────────
    // Das linhas de histórico que as conferências de retorno e as ocorrências
    // gravaram (tipo "condicao", saindo de "pronto", com evento). É o que
    // responde "o que voltou com problema do casamento da Marina?" com dado
    // real. As mais recentes, com teto — e a tela diz quando cortou.
    const TETO_DO_HISTORICO = 300;
    const recentes = await ctx.db
      .query("collectionAdjustments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(TETO_DO_HISTORICO);
    const nomeDoItem = new Map(itens.map((i) => [i._id as string, { nome: i.nome, unidade: i.unidade }]));
    const agrupado = new Map<string, { eventId: string; itemId: string; nome: string; unidade: string; condicao: string; quantidade: number }>();
    for (const a of recentes) {
      if (!voltouComProblema(a) || !a.eventId || !a.condicaoPara) continue;
      const item = nomeDoItem.get(a.collectionItemId);
      if (!item) continue;
      const chave = `${a.eventId}|${a.collectionItemId}|${a.condicaoPara}`;
      const atual = agrupado.get(chave);
      if (atual) atual.quantidade += a.quantidadeMovida ?? 0;
      else agrupado.set(chave, {
        eventId: a.eventId, itemId: a.collectionItemId, ...item,
        condicao: a.condicaoPara, quantidade: a.quantidadeMovida ?? 0,
      });
    }
    const voltaramComProblema = [...agrupado.values()];

    const idsDeEvento = [
      ...new Set([...p.fora, ...p.impacto, ...voltaramComProblema].map((l) => l.eventId)),
    ];
    const nomes = new Map<string, { nome: string; data: string }>();
    for (const id of idsDeEvento) {
      const evento = await ctx.db.get(id as Id<"events">);
      // Reserva desta conta apontando para evento de outra seria dado
      // corrompido; mesmo assim, o nome de outra empresa nunca sai daqui.
      if (evento && evento.userId === user._id) {
        nomes.set(id, { nome: evento.name, data: evento.date });
      }
    }
    const comEvento = <T extends { eventId: string }>(l: T) => ({
      ...l,
      eventoNome: nomes.get(l.eventId)?.nome ?? null,
      eventoData: nomes.get(l.eventId)?.data ?? null,
    });

    return {
      fora: p.fora.slice(0, LINHAS_POR_BLOCO).map(comEvento),
      totalFora: p.fora.length,
      emManutencao: p.emManutencao.slice(0, LINHAS_POR_BLOCO),
      totalEmManutencao: p.emManutencao.length,
      impacto: p.impacto.slice(0, LINHAS_POR_BLOCO).map(comEvento),
      totalImpacto: p.impacto.length,
      voltaramComProblema: voltaramComProblema.slice(0, LINHAS_POR_BLOCO).map(comEvento),
      totalVoltaramComProblema: voltaramComProblema.length,
      /** O histórico lido bateu no teto: pode haver problema mais antigo. */
      historicoIncompleto: recentes.length === TETO_DO_HISTORICO,
    };
  },
});

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
      pecasForaDeUso(item),
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
      pecasForaDeUso(item),
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

    // ── DEPOIS DA CONFERÊNCIA, O RETORNO SÓ SOBE ───────────────────────────
    // A conferência já classificou as peças que voltaram (pronto, limpar,
    // reparo…). Baixar o "voltou" agora faria as mesmas peças contarem duas
    // vezes fora de uso: no contador da condição E como "não voltou". Era
    // possível até 30/09. Corrigir uma condição é ocorrência, com histórico.
    const voltouAntes = reserva.voltou ?? 0;
    const conferida = reserva.conferidoEm !== undefined;
    if (conferida && args.voltou < voltouAntes) {
      throw new ConvexError({
        code: "INVALID",
        message:
          "Este retorno já foi conferido, e as peças já estão classificadas. Para corrigir, registre uma ocorrência no item.",
      });
    }

    // ── O QUE VOLTA ENTRA EM "EM CONFERÊNCIA" ──────────────────────────────
    // Até 30/09, registrado o retorno, as peças voltavam a contar como prontas
    // para o evento seguinte antes de alguém olhar se vieram sujas ou
    // quebradas. Agora entram no contador `emConferencia` do item — fora da
    // disponibilidade — e a conferência de retorno (ou uma ocorrência no
    // galpão) é que as libera. Peça que chega DEPOIS da conferência também
    // entra aqui: antes, entrava como pronta sem ninguém ver.
    //
    // A correção para baixo, antes da conferência, devolve ao "fora" só o
    // que esta reserva pôs em conferência (`retornoAConferir`).
    const diferenca = args.voltou - voltouAntes;
    const aConferirAntes = reserva.retornoAConferir ?? 0;
    let aConferir = aConferirAntes;
    if (diferenca > 0) {
      await moverComHistorico(ctx, user._id, reserva.collectionItemId, {
        de: "pronto",
        para: "conferencia",
        quantidade: diferenca,
        motivo: conferida ? "Chegou depois da conferência de retorno" : "Retorno do evento — aguardando conferência",
        eventId: reserva.eventId,
      });
      if (!conferida) aConferir += diferenca;
    } else if (diferenca < 0 && aConferirAntes > 0) {
      const devolver = await moverComHistorico(ctx, user._id, reserva.collectionItemId, {
        de: "conferencia",
        para: "pronto",
        quantidade: Math.min(-diferenca, aConferirAntes),
        motivo: "Correção do retorno — as peças não tinham voltado",
        eventId: reserva.eventId,
        ateOQueExiste: true,
      });
      aConferir -= devolver;
    }

    await ctx.db.patch(args.id, {
      voltou: args.voltou,
      retornoAConferir: aConferir > 0 ? aConferir : undefined,
      updatedAt: new Date().toISOString(),
    });
    return {
      faltaVoltar: faltaVoltar({ ...reserva, voltou: args.voltou }),
      situacao: situacaoDaReserva({ ...reserva, voltou: args.voltou }),
      emConferencia: diferenca > 0 ? diferenca : 0,
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
        item ? pecasForaDeUso(item) : 0,
      );
      return {
        ...r,
        item: item
          ? {
              _id: item._id,
              nome: item.nome,
              unidade: item.unidade,
              quantidadeTotal: item.quantidadeTotal,
              // O diálogo de ajuste aberto daqui precisa dele para a prévia
              // recusar o que o servidor recusaria.
              emManutencao: item.emManutencao,
              emLimpeza: item.emLimpeza,
              indisponivel: item.indisponivel,
              emConferencia: item.emConferencia,
            }
          : null,
        disponivel: estado.disponivel,
        // O PORQUÊ do disponível, para a tela não dizer só "faltam 2": dizer
        // "2 em manutenção" manda a decoradora ao conserto, e não ao aluguel.
        emManutencao: estado.emManutencao,
        foraSemVoltar: estado.foraSemVoltar,
        pendentesDeRetorno: estado.pendentesDeRetorno.map((p) => ({
          ...p,
          evento: eventos.get(p.eventId)?.name ?? "Outro evento",
        })),
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
    // Agrupa preservando TODOS os itens de cada material. A forma anterior era
    // um Map de pares, onde o ultimo item sobrescrevia os anteriores: dois
    // castiçais vinculados ao mesmo material e um deles sumia em silencio.
    const porMaterial = agruparAcervoPorMaterial(acervo);

    const janela = janelaSugerida(event.date);
    let criadas = 0;
    let atualizadas = 0;
    const semAcervo: string[] = [];
    /** Material com mais de um item de acervo equivalente — precisa de escolha. */
    const precisamEscolha: { nome: string; opcoes: string[] }[] = [];
    const comDeficit: { nome: string; deficit: number }[] = [];

    for (const linha of linhas) {
      if (!linha.materialId) continue;
      const candidatos = porMaterial.get(linha.materialId) ?? [];
      const { compativeis } = substitutosCompativeis(candidatos, linha.unidade ?? "");

      if (compativeis.length === 0) {
        // Reutilizável sem item de acervo vinculado continua respondendo
        // "disponibilidade não informada" — não inventamos vínculo por nome.
        // Vale também quando existe item vinculado mas de OUTRA unidade: 15
        // metros de fita não são 15 peças, e converter seria inventar.
        if (linha.tipo === "reutilizavel") semAcervo.push(linha.nome);
        continue;
      }

      if (compativeis.length > 1) {
        // Substituição explícita: a decoradora vinculou vários itens ao mesmo
        // material. QUAIS peças saem do galpão é decisão dela — dividir 30
        // castiçais em 20 Roma + 10 Viena por conta própria mudaria o que a
        // equipe vai carregar. O sistema mostra as opções e espera a escolha,
        // em vez de escolher calado (que era o efeito do bug do Map).
        precisamEscolha.push({
          nome: linha.nome,
          opcoes: compativeis.map((i) => i.nome),
        });
        continue;
      }

      const item = compativeis[0];

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
        pecasForaDeUso(item),
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

    return { criadas, atualizadas, semAcervo, comDeficit, precisamEscolha };
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
 * Move N peças de uma condição para outra e grava a linha no histórico — o
 * passo que retorno e conferência repetem. Devolve quantas moveu.
 *
 * Nunca mexe no TOTAL: só condição (`para` nunca é "baixa" aqui). A baixa
 * mora em `moverCondicao`, que é a decisão de alguém.
 *
 * `ateOQueExiste`: move até o que houver na origem, em vez de recusar — para
 * desfazer algo que outra pessoa pode já ter mexido no galpão (uma ocorrência
 * que tirou peça de "em conferência" antes da correção do retorno).
 */
async function moverComHistorico(
  ctx: MutationCtx,
  userId: Id<"users">,
  itemId: Id<"collectionItems">,
  m: {
    de: Condicao;
    para: Condicao;
    quantidade: number;
    motivo: string;
    eventId?: Id<"events">;
    responsibleId?: Id<"teamMembers">;
    ateOQueExiste?: boolean;
  },
): Promise<number> {
  const item = await itemDoUsuario(ctx, itemId, userId);
  const quantidade = m.ateOQueExiste
    ? Math.min(m.quantidade, condicoesDoItem(item)[m.de])
    : m.quantidade;
  if (quantidade <= 0) return 0;
  const r = calcularMovimento({ item, de: m.de, para: m.para, quantidade, unidade: item.unidade });
  if (!r.ok) throw new ConvexError({ code: "AJUSTE_INVALIDO", message: `${item.nome}: ${r.motivo}` });
  await ctx.db.patch(item._id, comCarimbo(r.patch));
  const total = r.quantidadeDepois;
  await ctx.db.insert("collectionAdjustments", {
    userId,
    collectionItemId: item._id,
    tipo: "condicao",
    delta: 0,
    quantidadeAntes: total,
    quantidadeDepois: total,
    condicaoDe: m.de,
    condicaoPara: m.para,
    quantidadeMovida: r.quantidade,
    motivo: m.motivo,
    eventId: m.eventId,
    responsibleId: m.responsibleId,
  });
  return r.quantidade;
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
    const conserto = baixaRespeitaManutencao(r.quantidadeDepois, pecasForaDeUso(item));
    if (conserto) throw new ConvexError({ code: "AJUSTE_INVALIDO", message: conserto });

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
    const conserto = baixaRespeitaManutencao(r.quantidadeDepois, pecasForaDeUso(item));
    if (conserto) throw new ConvexError({ code: "AJUSTE_INVALIDO", message: conserto });

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

/**
 * Manutenção: enviar peça ao conserto, receber de volta, ou dar como perdida.
 *
 * A peça em manutenção continua no total e sai da disponibilidade — a regra
 * mora em `lib/ajusteDeAcervo.ts` (`aplicarManutencao`). Toda operação
 * grava a linha no histórico com a manutenção antes e depois.
 *
 * `eventId` é procedência ("voltou quebrado do casamento da Marina"): não mexe
 * em reserva, saída nem retorno daquele evento.
 */
export const registrarManutencao = mutation({
  args: {
    collectionItemId: v.id("collectionItems"),
    operacao: v.union(
      v.literal("manutencao_envio"),
      v.literal("manutencao_retorno"),
      v.literal("manutencao_descarte"),
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
    await requireTeamMember(ctx, user._id, args.responsibleId);

    const r = aplicarManutencao({
      quantidadeAtual: item.quantidadeTotal,
      emManutencao: item.emManutencao,
      operacao: args.operacao,
      quantidade: args.quantidade,
      unidade: item.unidade,
    });
    if (!r.ok) throw new ConvexError({ code: "AJUSTE_INVALIDO", message: r.motivo });
    // Desde que há outras condições (limpeza, conferência…), o conserto só
    // recebe peça que está PRONTA: a que está para limpar já está fora de uso,
    // e contá-la duas vezes faria o "pronto" ficar negativo.
    if (args.operacao === "manutencao_envio") {
      const prontas = condicoesDoItem(item).pronto;
      if (args.quantidade > prontas) {
        throw new ConvexError({
          code: "AJUSTE_INVALIDO",
          message: `Só ${prontas} estão prontas para uso — as outras já estão em outra condição.`,
        });
      }
    }

    const manutencaoAntes = item.emManutencao ?? 0;
    await ctx.db.patch(
      item._id,
      comCarimbo({
        quantidadeTotal: r.quantidadeDepois,
        // Zero volta a ser AUSENTE: o schema diz que ausente é "nenhuma", e
        // gravar 0 seria escrever o padrão no banco.
        emManutencao: r.manutencaoDepois > 0 ? r.manutencaoDepois : undefined,
      }),
    );
    await ctx.db.insert("collectionAdjustments", {
      userId: user._id,
      collectionItemId: item._id,
      tipo: args.operacao,
      delta: r.delta,
      quantidadeAntes: item.quantidadeTotal,
      quantidadeDepois: r.quantidadeDepois,
      manutencaoAntes,
      manutencaoDepois: r.manutencaoDepois,
      motivo: args.motivo?.trim() || undefined,
      eventId,
      responsibleId: args.responsibleId,
    });

    return { emManutencao: r.manutencaoDepois, quantidadeTotal: r.quantidadeDepois };
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

    // Quem registrou (membro da equipe) e a foto da ocorrência, resolvidos
    // aqui pelo mesmo motivo do nome do evento.
    const membros = new Map<string, string>();
    for (const a of ajustes) {
      if (a.responsibleId && !membros.has(a.responsibleId)) {
        const m = await ctx.db.get(a.responsibleId);
        if (m && m.userId === user._id) membros.set(a.responsibleId, m.name);
      }
    }
    return Promise.all(
      ajustes.map(async (a) => ({
        ...a,
        eventName: a.eventId ? eventos.get(a.eventId) : undefined,
        responsavelNome: a.responsibleId ? membros.get(a.responsibleId) : undefined,
        fotoUrl: a.fotoStorageId ? await ctx.storage.getUrl(a.fotoStorageId) : null,
      })),
    );
  },
});

// ═════════════════════════════════════════════ CONDIÇÃO DO ACERVO (28/09)
//
// "Temos 40 cadeiras" não diz quantas podem sair. A regra está em
// `lib/condicaoDoAcervo.ts` (contadores por item, "pronto" derivado); aqui
// só se grava — sempre com a linha no histórico, nunca sobrescrevendo em
// silêncio. Decisões: docs/jornada-evento/acervo-ciclo-de-vida.md.

const condicao = v.union(
  v.literal("pronto"),
  v.literal("limpeza"),
  v.literal("reparo"),
  v.literal("indisponivel"),
  v.literal("conferencia"),
);

/** URL para subir a foto de uma ocorrência. Só quem está logado. */
export const gerarUrlDeFotoDeOcorrencia = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Registra uma ocorrência: N peças mudam de condição.
 *
 *   "Poltrona Siena — 1 pronta → reparo — pé traseiro com folga — foto"
 *
 * `para: "baixa"` tira a peça do acervo (quebrou sem conserto). Toda chamada
 * grava uma linha no histórico com a condição anterior e a nova, o membro da
 * equipe (quando informado), o evento de procedência e a foto.
 */
export const moverCondicao = mutation({
  args: {
    collectionItemId: v.id("collectionItems"),
    de: condicao,
    para: v.union(condicao, v.literal("baixa")),
    quantidade: v.number(),
    motivo: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    responsibleId: v.optional(v.id("teamMembers")),
    fotoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await itemDoUsuario(ctx, args.collectionItemId, user._id);
    const eventId = await eventoDoUsuario(ctx, args.eventId, user._id);
    await requireTeamMember(ctx, user._id, args.responsibleId);
    if (args.fotoStorageId && !(await ctx.db.system.get(args.fotoStorageId))) {
      throw new ConvexError({ code: "NOT_FOUND", message: "A foto não chegou. Tente enviar de novo." });
    }

    const r = calcularMovimento({
      item,
      de: args.de,
      para: args.para,
      quantidade: args.quantidade,
      unidade: item.unidade,
    });
    if (!r.ok) throw new ConvexError({ code: "AJUSTE_INVALIDO", message: r.motivo });

    await ctx.db.patch(item._id, comCarimbo(r.patch));
    await ctx.db.insert("collectionAdjustments", {
      userId: user._id,
      collectionItemId: item._id,
      tipo: "condicao",
      delta: r.delta,
      quantidadeAntes: item.quantidadeTotal,
      quantidadeDepois: r.quantidadeDepois,
      condicaoDe: args.de,
      condicaoPara: args.para,
      quantidadeMovida: r.quantidade,
      motivo: args.motivo?.trim() || undefined,
      eventId,
      responsibleId: args.responsibleId,
      fotoStorageId: args.fotoStorageId,
    });
    return { antes: r.antes, depois: r.depois };
  },
});

/**
 * A conferência de retorno de um evento, em lote e numa transação só.
 *
 *   Mesa Toscana — 8 saíram, 8 voltaram: 6 prontas, 1 limpar, 1 reparo
 *
 * Para cada reserva: quantas voltaram e quantas vão para limpeza, reparo ou
 * indisponível; "pronto" é o resto, nunca informado. O que não está pronto
 * sai da disponibilidade na hora. Uma linha errada recusa a conferência
 * inteira — conferência pela metade deixaria metade das peças sem condição.
 *
 * Repetir não conta duas vezes: reserva já conferida recusa. Corrigir uma
 * condição depois é uma ocorrência (`moverCondicao`), que fica no histórico.
 */
export const conferirRetorno = mutation({
  args: {
    eventId: v.id("events"),
    linhas: v.array(
      v.object({
        reservaId: v.id("collectionReservations"),
        voltou: v.number(),
        limpeza: v.optional(v.number()),
        reparo: v.optional(v.number()),
        indisponivel: v.optional(v.number()),
      }),
    ),
    responsibleId: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const eventId = (await eventoDoUsuario(ctx, args.eventId, user._id))!;
    await requireTeamMember(ctx, user._id, args.responsibleId);
    if (args.linhas.length === 0) {
      throw new ConvexError({ code: "INVALID", message: "Nada para conferir." });
    }

    const agora = Date.now();
    const vistas = new Set<string>();
    let pecasForaDeUsoNaConferencia = 0;

    for (const linha of args.linhas) {
      if (vistas.has(linha.reservaId)) {
        throw new ConvexError({ code: "INVALID", message: "A mesma peça apareceu duas vezes na conferência." });
      }
      vistas.add(linha.reservaId);

      const reserva = await ctx.db.get(linha.reservaId);
      // Reserva de outra conta ou de outro evento: NOT_FOUND, como todo id
      // vindo do navegador que não é prova de posse.
      if (!reserva || reserva.userId !== user._id || reserva.eventId !== eventId) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Reserva não encontrada" });
      }
      if (reserva.conferidoEm !== undefined) {
        throw new ConvexError({
          code: "INVALID",
          message: "Este retorno já foi conferido. Para corrigir, registre uma ocorrência no item.",
        });
      }
      if (!retornoPossivel(reserva.saiu, linha.voltou)) {
        throw new ConvexError({
          code: "INVALID",
          message:
            reserva.saiu === undefined || reserva.saiu === 0
              ? "Registre primeiro quanto saiu do galpão."
              : `Não é possível voltar mais do que saiu (${reserva.saiu}).`,
        });
      }
      const item = await ctx.db.get(reserva.collectionItemId);
      if (!item || item.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Item do acervo não encontrado" });
      }
      exigirQuantidade(linha.voltou, item.unidade, "Quantidade que voltou");

      const destinos = (["limpeza", "reparo", "indisponivel"] as const)
        .map((para) => ({ para, quantidade: linha[para] ?? 0 }))
        .filter((d) => d.quantidade !== 0);
      const naoProntas = destinos.reduce((s, d) => s + d.quantidade, 0);
      if (destinos.some((d) => d.quantidade < 0) || naoProntas > linha.voltou) {
        throw new ConvexError({
          code: "INVALID",
          message: `${item.nome}: voltaram ${linha.voltou}, e as condições somam ${naoProntas}.`,
        });
      }

      // ── DE ONDE AS PEÇAS SAEM ─────────────────────────────────────────────
      // O retorno registrado desde 30/09 está em "em conferência" — e esta
      // reserva sabe quantas são dela (`retornoAConferir`). O retorno antigo,
      // ou o que voltou direto nesta conferência, ainda conta como "pronto"
      // (saiu pronto e ninguém o tirou de lá). Cada condição sai primeiro de
      // "em conferência", depois de "pronto": a mesma peça nunca é contada
      // nas duas. Cada movimento é uma linha no histórico, com o evento.
      const mover = (de: Condicao, para: Condicao, quantidade: number, motivo: string) =>
        moverComHistorico(ctx, user._id, item._id, {
          de, para, quantidade, motivo, eventId, responsibleId: args.responsibleId,
        });
      let emConferencia = Math.min(reserva.retornoAConferir ?? 0, condicoesDoItem(item).conferencia);
      // Voltaram MENOS do que o retorno registrado: o excedente não está no
      // galpão, e volta a contar como fora (sai de "em conferência").
      const naoVoltaram = Math.max(0, emConferencia - linha.voltou);
      if (naoVoltaram > 0) {
        await mover("conferencia", "pronto", naoVoltaram, "Conferência de retorno — não tinham voltado");
        emConferencia -= naoVoltaram;
      }
      for (const d of destinos) {
        const daConferencia = Math.min(d.quantidade, emConferencia);
        if (daConferencia > 0) {
          await mover("conferencia", d.para, daConferencia, "Conferência de retorno");
          emConferencia -= daConferencia;
        }
        if (d.quantidade - daConferencia > 0) {
          await mover("pronto", d.para, d.quantidade - daConferencia, "Conferência de retorno");
        }
      }
      // O que sobrou em conferência voltou inteiro: fica pronto.
      if (emConferencia > 0) {
        await mover("conferencia", "pronto", emConferencia, "Conferência de retorno — pronta");
      }
      pecasForaDeUsoNaConferencia += naoProntas;

      await ctx.db.patch(reserva._id, {
        voltou: linha.voltou,
        conferidoEm: agora,
        retornoAConferir: undefined,
        updatedAt: new Date(agora).toISOString(),
      });
    }

    return { conferidas: args.linhas.length, pecasForaDeUso: pecasForaDeUsoNaConferencia };
  },
});
