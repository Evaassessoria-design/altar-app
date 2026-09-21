import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getOwnedEvent, getOwnedLead, requireUser } from "./lib/identity";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import { dataDoDia } from "./lib/dataDoDia";
import { emCentavos, motivoDoValorInvalido } from "./lib/dinheiro";
import {
  estaVencida,
  faltaParaEnviar,
  investimentoTotal,
  paraOCliente,
} from "./lib/propostaComercial";

// ─────────────────────────────────────────────────────────────────────────────
// PROPOSTAS COMERCIAIS
//
// O documento que a decoradora MANDA para a cliente — distinto do Orçamento,
// que é interno. A regra de audiência vive em `lib/propostaComercial.ts`, e é
// ela, não esta camada, que decide o que a cliente pode ver.
//
// ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
// Não envia nada (não há e-mail nem WhatsApp aqui), não cobra, não assina, não
// gera contrato e não muda status sozinho. "Enviada" e "aceita" são registros
// de uma decisão humana que aconteceu fora do sistema.
// ─────────────────────────────────────────────────────────────────────────────

const itemComercial = v.object({
  descricao: v.string(),
  detalhe: v.optional(v.string()),
  valor: v.number(),
});

/** Recusa o valor que não pode ser gravado, com o recado que a tela mostra. */
function exigirValor(valor: number, onde: string) {
  const motivo = motivoDoValorInvalido(valor);
  if (motivo) throw new ConvexError({ code: "VALOR_INVALIDO", message: `${onde}: ${motivo}` });
}

/** Itens conferidos e arredondados ao centavo. */
function itensLimpos(itens: readonly { descricao: string; detalhe?: string; valor: number }[]) {
  return itens.map((i, idx) => {
    exigirValor(i.valor, `Item ${idx + 1}`);
    return {
      descricao: i.descricao.trim(),
      detalhe: i.detalhe?.trim() || undefined,
      valor: emCentavos(i.valor),
    };
  });
}

/** A proposta, garantindo que é de quem está pedindo. */
async function minhaProposta(
  ctx: Parameters<typeof requireUser>[0],
  id: Doc<"proposals">["_id"],
) {
  const user = await requireUser(ctx);
  const proposta = await ctx.db.get(id);
  // Id de outra conta responde como inexistente: confirmar que existe já seria
  // contar que aquela empresa tem uma proposta.
  if (!proposta || proposta.userId !== user._id) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Proposta não encontrada" });
  }
  return { user, proposta };
}

/** O que a lista mostra. Derivados nunca vêm do banco. */
function resumir(p: Doc<"proposals">, hoje: string) {
  return {
    _id: p._id,
    titulo: p.titulo,
    clienteNome: p.clienteNome,
    status: p.status,
    vencida: estaVencida(p.validadeAte, p.status, hoje),
    validadeAte: p.validadeAte,
    investimento: investimentoTotal(p.itens),
    leadId: p.leadId,
    eventId: p.eventId,
    enviadaEm: p.versaoEnviada?.enviadaEm,
    /**
     * A versão atual difere da que a cliente recebeu?
     *
     * Só tem sentido depois do envio. É o aviso que impede a decoradora de
     * discutir um número que a cliente não tem.
     */
    divergeDoEnviado:
      p.versaoEnviada !== undefined &&
      investimentoTotal(p.itens) !== p.versaoEnviada.investimento,
    createdAt: p.createdAt,
  };
}

/**
 * O teto da lista.
 *
 * Uma decoradora com cinco anos de ALTAR acumula centenas de propostas, e
 * `collect()` sobre elas para em silêncio quando a conta cresce — o mesmo
 * defeito que já tinha sido corrigido em `users` na Central.
 *
 * A resposta diz `temMais` para a tela poder escrever "200 carregadas (há
 * mais)" em vez de afirmar um total que ela não conferiu.
 */
const LIMITE_DA_LISTA = 200;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const hoje = dataDoDia();
    const encontradas = await ctx.db
      .query("proposals")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(LIMITE_DA_LISTA + 1);
    const temMais = encontradas.length > LIMITE_DA_LISTA;
    return {
      propostas: encontradas
        .slice(0, LIMITE_DA_LISTA)
        .map((p) => resumir(p, hoje))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      /** Há mais do que as carregadas. A tela precisa dizer isso. */
      temMais,
    };
  },
});

/**
 * Uma linha de proposta para CADA card do funil, numa consulta só.
 *
 * ── POR QUE NÃO `doLead` EM CADA CARD ───────────────────────────────────────
 * Porque o quadro tem tantas consultas quantos leads. Com quarenta
 * oportunidades abertas isso é quarenta assinaturas reativas para exibir uma
 * linha de texto em cada uma — o tipo de custo que não aparece em um teste e
 * aparece na conta.
 *
 * PAGINA: uma varredura global sem teto para em silêncio quando a conta
 * cresce. Acima do limite a resposta DIZ que há mais, e a tela não afirma um
 * total que não conferiu.
 */
const LIMITE_DO_QUADRO = 500;

export const resumoPorLead = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const hoje = dataDoDia();
    const encontradas = await ctx.db
      .query("proposals")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(LIMITE_DO_QUADRO + 1);

    const porLead: Record<
      string,
      { quantidade: number; ultima: ReturnType<typeof resumir> }
    > = {};
    for (const p of encontradas.slice(0, LIMITE_DO_QUADRO)) {
      if (!p.leadId) continue;
      const atual = porLead[p.leadId];
      const resumo = resumir(p, hoje);
      // "Última" é a mais recente por criação: é a que vale na conversa de
      // hoje, e é sobre ela que a decoradora vai perguntar.
      if (!atual) {
        porLead[p.leadId] = { quantidade: 1, ultima: resumo };
        continue;
      }
      atual.quantidade += 1;
      if (resumo.createdAt > atual.ultima.createdAt) atual.ultima = resumo;
    }

    return { porLead, temMais: encontradas.length > LIMITE_DO_QUADRO };
  },
});

/** As propostas de um lead — para o Funil dar contexto sem virar outra tela. */
export const doLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const lead = await getOwnedLead(ctx, args.leadId);
    if (!lead) return [];
    const hoje = dataDoDia();
    const propostas = await ctx.db
      .query("proposals")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();
    return propostas
      .filter((p) => p.userId === lead.userId)
      .map((p) => resumir(p, hoje))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

/** As propostas de um evento. */
export const doEvento = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return [];
    const hoje = dataDoDia();
    const propostas = await ctx.db
      .query("proposals")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return propostas
      .filter((p) => p.userId === event.userId)
      .map((p) => resumir(p, hoje))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

/**
 * A proposta para editar — com o registro inteiro, porque quem edita é a dona.
 *
 * Diferente de `comoOClienteVe`, que passa pela fronteira de audiência.
 */
export const get = query({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const proposta = await ctx.db.get(args.id);
    if (!proposta || proposta.userId !== user._id) return null;

    /**
     * De onde esta proposta pende — e o que já aconteceu lá.
     *
     * A cadeia real é LEAD → PROPOSTA → EVENTO, e a tela da proposta era o
     * único ponto dela sem nenhum caminho de volta: aceita a proposta, a
     * decoradora tinha de lembrar sozinha de ir ao Funil criar o evento.
     *
     * É CONTEXTO, não automação. Aceitar uma proposta NÃO cria evento: o
     * evento nasce da conversão do lead, que pede data, local e tipo, e
     * inventá-los a partir de uma proposta produziria um evento errado em
     * silêncio.
     */
    const lead = proposta.leadId ? await ctx.db.get(proposta.leadId) : null;
    const evento = proposta.eventId ? await ctx.db.get(proposta.eventId) : null;
    const vinculo =
      evento && evento.userId === user._id
        ? { tipo: "evento" as const, id: evento._id, nome: evento.name }
        : lead && lead.userId === user._id
          ? {
              tipo: "lead" as const,
              id: lead._id,
              nome: lead.clientName,
              /** Ausente = a oportunidade ainda não virou evento. */
              eventoCriado: lead.convertedEventId,
            }
          : null;

    return {
      ...proposta,
      investimento: investimentoTotal(proposta.itens),
      vencida: estaVencida(proposta.validadeAte, proposta.status, dataDoDia()),
      falta: faltaParaEnviar(proposta),
      vinculo,
    };
  },
});

/**
 * EXATAMENTE o que a cliente vê — nem um campo a mais.
 *
 * Passa por `paraOCliente`, que constrói o objeto campo a campo. É esta query
 * que a pré-visualização e o PDF consomem: se um dia alguém acrescentar um
 * campo interno ao schema, ele não aparece aqui por acidente, porque nada
 * aparece por acidente.
 */
export const comoOClienteVe = query({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const proposta = await ctx.db.get(args.id);
    if (!proposta || proposta.userId !== user._id) return null;
    return paraOCliente(proposta, {
      nome: user.studioName?.trim() || user.name?.trim() || "Minha empresa",
      contato: [user.phone?.trim(), user.email?.trim()].filter(Boolean).join("  ·  "),
    });
  },
});

/**
 * Cria a proposta a partir de um lead OU de um evento.
 *
 * Os dados do cliente são COPIADOS na criação, não lidos por referência: a
 * proposta é um documento datado, e renomear o lead seis meses depois não pode
 * reescrever o que foi apresentado.
 */
export const create = mutation({
  args: {
    leadId: v.optional(v.id("leads")),
    eventId: v.optional(v.id("events")),
    titulo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!args.leadId && !args.eventId) {
      throw new ConvexError({
        code: "INVALID",
        message: "A proposta precisa nascer de uma oportunidade ou de um evento.",
      });
    }

    const lead = args.leadId ? await getOwnedLead(ctx, args.leadId) : null;
    if (args.leadId && !lead) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Oportunidade não encontrada" });
    }
    const event = args.eventId ? await getOwnedEvent(ctx, args.eventId) : null;
    if (args.eventId && !event) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Evento não encontrado" });
    }

    const clienteNome = event?.clientName ?? lead?.clientName ?? "";
    const titulo = args.titulo?.trim() || `Proposta — ${clienteNome || "novo evento"}`;

    return ctx.db.insert("proposals", {
      userId: user._id,
      leadId: args.leadId,
      eventId: args.eventId,
      titulo,
      clienteNome,
      eventoTipo: event?.type ?? lead?.eventType,
      eventoData: event?.date ?? lead?.eventDate,
      eventoLocal: event?.location ?? lead?.venue,
      eventoConvidados: lead?.guestCount,
      itens: [],
      status: "rascunho",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("proposals"),
    titulo: v.optional(v.string()),
    apresentacao: v.optional(v.union(v.string(), v.null())),
    clienteNome: v.optional(v.string()),
    eventoTipo: v.optional(v.union(v.string(), v.null())),
    eventoData: v.optional(v.union(v.string(), v.null())),
    eventoLocal: v.optional(v.union(v.string(), v.null())),
    eventoConvidados: v.optional(v.union(v.number(), v.null())),
    itens: v.optional(v.array(itemComercial)),
    condicoesPagamento: v.optional(v.union(v.string(), v.null())),
    validadeAte: v.optional(v.union(v.string(), v.null())),
    observacoes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { proposta } = await minhaProposta(ctx, args.id);

    const patch: Record<string, unknown> = {};
    if (args.titulo?.trim()) patch.titulo = args.titulo.trim();
    if (args.clienteNome?.trim()) patch.clienteNome = args.clienteNome.trim();
    if (args.apresentacao !== undefined) patch.apresentacao = args.apresentacao?.trim() || undefined;
    if (args.eventoTipo !== undefined) patch.eventoTipo = args.eventoTipo?.trim() || undefined;
    if (args.eventoData !== undefined) patch.eventoData = args.eventoData?.trim() || undefined;
    if (args.eventoLocal !== undefined) patch.eventoLocal = args.eventoLocal?.trim() || undefined;
    if (args.eventoConvidados !== undefined) {
      if (args.eventoConvidados !== null) exigirValor(args.eventoConvidados, "Convidados");
      patch.eventoConvidados = args.eventoConvidados ?? undefined;
    }
    if (args.condicoesPagamento !== undefined) {
      patch.condicoesPagamento = args.condicoesPagamento?.trim() || undefined;
    }
    if (args.validadeAte !== undefined) patch.validadeAte = args.validadeAte?.trim() || undefined;
    if (args.observacoes !== undefined) patch.observacoes = args.observacoes?.trim() || undefined;
    if (args.itens !== undefined) patch.itens = itensLimpos(args.itens);

    // `versaoEnviada` NÃO entra no patch, em nenhum caminho: é o registro do
    // que a cliente recebeu, e editar a proposta não reescreve o passado.
    await ctx.db.patch(proposta._id, comCarimbo(patch));
  },
});

/**
 * "Eu mandei para a cliente."
 *
 * Registra a decisão e CONGELA o que foi enviado. Não envia nada: o ALTAR não
 * tem e-mail nem WhatsApp ligados, e essa fronteira é deliberada.
 *
 * Reenviar depois de editar grava uma versão nova — a última enviada é a que
 * vale, e é ela que a tela compara com a atual.
 */
export const registrarEnvio = mutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposta } = await minhaProposta(ctx, args.id);

    const falta = faltaParaEnviar(proposta);
    if (falta.length > 0) {
      throw new ConvexError({ code: "INCOMPLETA", message: falta.join(" ") });
    }

    const versaoEnviada = {
      enviadaEm: new Date().toISOString(),
      titulo: proposta.titulo,
      investimento: investimentoTotal(proposta.itens),
      itens: proposta.itens.map((i) => ({ ...i })),
      condicoesPagamento: proposta.condicoesPagamento,
      validadeAte: proposta.validadeAte,
    };

    await ctx.db.patch(proposta._id, comCarimbo({ status: "enviada", versaoEnviada }));
    return { enviadaEm: versaoEnviada.enviadaEm };
  },
});

/**
 * "A cliente aceitou" / "a cliente recusou".
 *
 * É um REGISTRO, não uma assinatura: não há valor jurídico aqui, e o ALTAR não
 * afirma que a cliente assinou coisa nenhuma. Guarda quem marcou e quando,
 * para que um erro humano possa ser encontrado e corrigido.
 *
 * Voltar atrás é possível de propósito — clique trocado acontece, e uma
 * decisão que não se desfaz vira dado errado permanente.
 */
export const registrarDecisao = mutation({
  args: {
    id: v.id("proposals"),
    decisao: v.union(v.literal("aceita"), v.literal("recusada"), v.literal("rascunho")),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, proposta } = await minhaProposta(ctx, args.id);

    if (args.decisao === "rascunho") {
      // Desfazer: a proposta volta a ser trabalho em andamento. A versão
      // enviada NÃO é apagada — a cliente continua tendo aquele documento.
      await ctx.db.patch(
        proposta._id,
        comCarimbo({
          status: "rascunho",
          decididaEm: undefined,
          decididaPor: undefined,
          motivoDaRecusa: undefined,
        }),
      );
      return { status: "rascunho" as const };
    }

    await ctx.db.patch(
      proposta._id,
      comCarimbo({
        status: args.decisao,
        decididaEm: new Date().toISOString(),
        decididaPor: user.name || user.email || "",
        motivoDaRecusa:
          args.decisao === "recusada" ? args.motivo?.trim() || undefined : undefined,
      }),
    );
    return { status: args.decisao };
  },
});

/**
 * Traz para a proposta as RECEITAS do orçamento interno do evento.
 *
 * ── POR QUE SÓ AS RECEITAS ──────────────────────────────────────────────────
 * As linhas de `type: "income"` são o que a decoradora COBRA — honorários,
 * projeto, itens vendidos. É exatamente o que a cliente já veria. As de
 * `expense` são o custo dela, e trazê-las seria o vazamento que esta separação
 * existe para impedir.
 *
 * Não apaga o que já está escrito: acrescenta. Ela ajusta os textos depois,
 * porque a descrição interna ("Honorários 15%") raramente é a que vai no
 * documento.
 */
export const trazerDoOrcamento = mutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposta } = await minhaProposta(ctx, args.id);
    if (!proposta.eventId) {
      throw new ConvexError({
        code: "INVALID",
        message: "Esta proposta não está ligada a um evento — não há orçamento de onde trazer.",
      });
    }
    const event = await getOwnedEvent(ctx, proposta.eventId);
    if (!event) throw new ConvexError({ code: "NOT_FOUND", message: "Evento não encontrado" });

    const linhas = await ctx.db
      .query("budgetItems")
      .withIndex("by_event", (q) => q.eq("eventId", proposta.eventId!))
      .collect();

    const receitas = linhas
      .filter((l) => l.userId === event.userId && l.type === "income")
      .map((l) => ({
        descricao: l.description.trim(),
        detalhe: undefined,
        valor: emCentavos(l.quantity * l.unitPrice),
      }));

    if (receitas.length === 0) return { acrescentados: 0 };

    await ctx.db.patch(
      proposta._id,
      comCarimbo({ itens: [...proposta.itens, ...receitas] }),
    );
    return { acrescentados: receitas.length };
  },
});

/**
 * Apaga a proposta.
 *
 * Sem lixeira e sem cascata: uma proposta não tem filhos. A tela pergunta
 * antes, e a versão enviada some junto — é por isso que a pergunta diz o que
 * se perde.
 */
export const remove = mutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposta } = await minhaProposta(ctx, args.id);
    await ctx.db.delete(proposta._id);
  },
});
