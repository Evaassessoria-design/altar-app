import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Expression, FilterBuilder, NamedTableInfo } from "convex/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./lib/adminGuard";
import { verticalDoAmbiente } from "./lib/central/vertical";
import {
  normalizarE164,
  variantesDeBusca,
  casarContato,
  formatarBr,
} from "./lib/central/telefone";
import { fimDaJanela, estaSemResposta } from "./lib/central/prazos";
import { termoDeBusca, textoDeBusca } from "./lib/central/busca";
import {
  categoriaValidator,
  channelValidator,
  departamentoValidator,
  mensagemNormalizadaValidator,
  prioridadeValidator,
  statusDeConversaValidator,
  verticalValidator,
} from "./lib/central/validadores";

// ═════════════════════════════════════════════════════════════════════════════
// CENTRAL DE COMUNICAÇÕES — RECEBIMENTO E LEITURA
//
// Operação do SaaS ALTAR. Fala com INTERESSADOS (`landingLeads`) e ASSINANTES
// (`users`). Nunca com `leads`, que são os clientes das decoradoras e vivem
// isolados por `userId` — essa fronteira está desenhada no schema e é
// verificada por `central.fronteiras.test.ts`.
//
// Toda função pública deste arquivo passa por `requireAdmin`.
// ═════════════════════════════════════════════════════════════════════════════

/** Quantos usuários são varridos ao procurar telefone sem índice. */
const LIMITE_VARREDURA_USERS = 2_000;

/** Mensagens carregadas por vez no histórico de uma conversa. */
const PAGINA_DE_MENSAGENS = 100;

/** Teto de candidatos devolvidos por busca ao vincular um contato. */
const LIMITE_DE_CANDIDATOS = 20;

/** Conversas reparadas por chamada de `repararIndiceDeBusca`. */
const LOTE_DE_REPARO = 200;

/** Teto da nota interna. Anotação, não dossiê. */
const LIMITE_DE_NOTAS = 4_000;

// ─── Texto de busca da conversa (derivado) ───────────────────────────────────

/**
 * Recalcula `buscaTexto` a partir das fontes que valem.
 *
 * Exportada porque a triagem também muda o assunto da conversa
 * (`communicationsTriage.aplicarTriagem`), e um texto de busca que só é
 * escrito na criação envelhece na primeira reclassificação: a pessoa
 * procuraria pelo assunto que está vendo na tela e não acharia nada.
 *
 * Nunca lança e nunca é obrigatória para a operação — é índice, não verdade.
 */
export async function atualizarBuscaDaConversa(
  ctx: MutationCtx,
  conversationId: Id<"communicationConversations">,
): Promise<void> {
  const conversa = await ctx.db.get(conversationId);
  if (!conversa) return;

  const contato = await ctx.db.get(conversa.contactId);
  const identidades = await ctx.db
    .query("communicationIdentities")
    .withIndex("by_contact", (q) => q.eq("contactId", conversa.contactId))
    .take(10);

  const novo = textoDeBusca([
    conversa.assunto,
    contato?.displayName,
    ...identidades.map((i) => i.externalId),
    ...identidades.map((i) => i.displayName),
  ]);

  if (novo !== (conversa.buscaTexto ?? "")) {
    await ctx.db.patch(conversationId, { buscaTexto: novo });
  }
}

// ─── Ingestão ────────────────────────────────────────────────────────────────

/**
 * Quem é este número?
 *
 * Ordem de busca, da mais barata e confiável para a mais cara:
 *   1. `communicationIdentities` — já conhecemos o handle
 *   2. `landingLeads.whatsappE164` — por ÍNDICE
 *   3. `users.phone` — VARREDURA, porque não há índice de telefone em `users`
 *
 * O passo 3 só acontece quando os dois primeiros falharam. É caro de
 * propósito: é o caso raro (assinante que escreve de um número que nunca
 * passou pela landing), e criar índice em `users` exigiria mexer numa tabela
 * do caminho de cobrança.
 */
async function procurarDono(
  ctx: MutationCtx,
  canal: "whatsapp" | "instagram" | "email" | "chat",
  externalId: string,
): Promise<
  | { tipo: "contato"; contactId: Id<"adminContacts"> }
  | { tipo: "landingLead"; landingLeadId: Id<"landingLeads">; nome: string }
  | { tipo: "user"; userId: Id<"users">; nome: string }
  | { tipo: "nenhum" }
  | { tipo: "ambiguo" }
> {
  const variantes = canal === "whatsapp" ? variantesDeBusca(externalId) : [externalId];

  // 1. Identidade já registrada.
  for (const variante of variantes) {
    const identidade = await ctx.db
      .query("communicationIdentities")
      .withIndex("by_channel_external", (q) =>
        q.eq("channel", canal).eq("externalId", variante),
      )
      .first();
    if (identidade) return { tipo: "contato", contactId: identidade.contactId };
  }

  if (canal !== "whatsapp") return { tipo: "nenhum" };

  // 2. Interessado da landing, por índice.
  const leads: Doc<"landingLeads">[] = [];
  for (const variante of variantes) {
    const achados = await ctx.db
      .query("landingLeads")
      .withIndex("by_whatsapp_e164", (q) => q.eq("whatsappE164", variante))
      .collect();
    for (const lead of achados) {
      if (!leads.some((l) => l._id === lead._id)) leads.push(lead);
    }
  }
  const casamentoDeLead = casarContato(leads);
  if (casamentoDeLead.tipo === "unico") {
    return {
      tipo: "landingLead",
      landingLeadId: casamentoDeLead.escolhido._id,
      nome: casamentoDeLead.escolhido.name,
    };
  }
  // Ambiguidade NUNCA vira vínculo automático — mostrar a conversa de um
  // cliente na ficha de outro é pior do que não vincular nada.
  if (casamentoDeLead.tipo === "ambiguo") return { tipo: "ambiguo" };

  // 3. Assinante, por varredura limitada.
  const usuarios = await ctx.db.query("users").take(LIMITE_VARREDURA_USERS);
  const candidatos = usuarios.filter((u) => {
    const doUsuario = normalizarE164(u.phone);
    return doUsuario !== null && variantes.includes(doUsuario);
  });
  const casamentoDeUser = casarContato(candidatos);
  if (casamentoDeUser.tipo === "unico") {
    return {
      tipo: "user",
      userId: casamentoDeUser.escolhido._id,
      nome: casamentoDeUser.escolhido.name,
    };
  }
  if (casamentoDeUser.tipo === "ambiguo") return { tipo: "ambiguo" };

  return { tipo: "nenhum" };
}

/**
 * Recebe um lote já normalizado e o transforma em conversa.
 *
 * Interna e idempotente: a mesma `dedupKey` uma segunda vez não reprocessa —
 * mesmo contrato de `asaasWebhookEvents`. Devolve o resumo do que aconteceu
 * com cada mensagem, que é o corpo da resposta ao gateway.
 */
export const registrarEntrada = internalMutation({
  args: {
    vertical: verticalValidator,
    provider: v.string(),
    mensagens: v.array(mensagemNormalizadaValidator),
    recebidoEm: v.number(),
  },
  handler: async (ctx, args) => {
    const resultados: {
      dedupKey: string;
      outcome: "applied" | "duplicate" | "ignored" | "error";
      conversationId?: Id<"communicationConversations">;
    }[] = [];

    for (const mensagem of args.mensagens) {
      const dedupKey = `${mensagem.canal}:${mensagem.externalMessageId}`;

      const jaVisto = await ctx.db
        .query("integrationEvents")
        .withIndex("by_dedup_key", (q) => q.eq("dedupKey", dedupKey))
        .first();

      if (jaVisto) {
        // A plataforma reenvia o mesmo webhook quando não recebe 200 a tempo.
        // Registrar a repetição é o que torna possível auditar depois.
        await ctx.db.insert("integrationEvents", {
          vertical: args.vertical,
          provider: args.provider,
          channel: mensagem.canal,
          event: "mensagem_recebida",
          dedupKey: `${dedupKey}#${args.recebidoEm}`,
          receivedAt: args.recebidoEm,
          outcome: "duplicate",
          externalMessageId: mensagem.externalMessageId,
          conversationId: jaVisto.conversationId,
        });
        resultados.push({ dedupKey, outcome: "duplicate", conversationId: jaVisto.conversationId });
        continue;
      }

      const dono = await procurarDono(ctx, mensagem.canal, mensagem.externalContactId);

      // ── Contato ───────────────────────────────────────────────────────────
      let contactId: Id<"adminContacts">;
      if (dono.tipo === "contato") {
        contactId = dono.contactId;
        // O nome do perfil do canal só PREENCHE o que estava vazio. Nunca
        // sobrescreve: o que um humano escreveu vale mais que o apelido que a
        // pessoa deixou no WhatsApp.
        const atual = await ctx.db.get(contactId);
        if (mensagem.displayName && atual && !atual.displayName.trim()) {
          await ctx.db.patch(contactId, {
            displayName: mensagem.displayName,
            atualizadoEm: args.recebidoEm,
          });
        }
      } else {
        const nome =
          dono.tipo === "landingLead" || dono.tipo === "user"
            ? dono.nome
            : (mensagem.displayName ?? mensagem.externalContactId);

        contactId = await ctx.db.insert("adminContacts", {
          vertical: args.vertical,
          displayName: nome,
          tipo:
            dono.tipo === "user"
              ? "assinante"
              : dono.tipo === "landingLead"
                ? "interessado"
                : "desconhecido",
          landingLeadId: dono.tipo === "landingLead" ? dono.landingLeadId : undefined,
          userId: dono.tipo === "user" ? dono.userId : undefined,
          // Casamento ÚNICO e exato é automático; ambíguo fica sem vínculo e
          // espera decisão humana em `vincularContato`.
          vinculoOrigem:
            dono.tipo === "landingLead" || dono.tipo === "user" ? "automatico" : undefined,
          vinculoEm:
            dono.tipo === "landingLead" || dono.tipo === "user" ? args.recebidoEm : undefined,
          criadoEm: args.recebidoEm,
          atualizadoEm: args.recebidoEm,
        });

        await ctx.db.insert("communicationIdentities", {
          contactId,
          channel: mensagem.canal,
          externalId: mensagem.externalContactId,
          displayName: mensagem.displayName,
          verificadoPor: "automatico",
          criadoEm: args.recebidoEm,
        });
      }

      // ── Conversa ──────────────────────────────────────────────────────────
      // Reaproveita a conversa ABERTA mais recente do mesmo contato no mesmo
      // canal. Conversa resolvida ou arquivada não ressuscita: o assunto novo
      // merece registro próprio.
      const abertas = await ctx.db
        .query("communicationConversations")
        .withIndex("by_contact", (q) => q.eq("contactId", contactId))
        .collect();
      const viva = abertas
        .filter(
          (c) =>
            c.channel === mensagem.canal &&
            c.status !== "resolvida" &&
            c.status !== "arquivada",
        )
        .sort((a, b) => b.ultimaMensagemEm - a.ultimaMensagemEm)[0];

      const assuntoInicial = (mensagem.texto ?? "").trim().slice(0, 80) || "Sem assunto";

      let conversationId: Id<"communicationConversations">;
      if (viva) {
        conversationId = viva._id;
        await ctx.db.patch(conversationId, {
          ultimaMensagemEm: mensagem.enviadaEm,
          ultimaMensagemDirecao: "entrada",
          naoLidas: viva.naoLidas + 1,
          janelaRespostaAte: fimDaJanela(mensagem.enviadaEm),
          atualizadaEm: args.recebidoEm,
        });
      } else {
        conversationId = await ctx.db.insert("communicationConversations", {
          vertical: args.vertical,
          channel: mensagem.canal,
          contactId,
          externalThreadId: mensagem.externalThreadId,
          assunto: assuntoInicial,
          // `departamento` e `categoria` ficam AUSENTES: a conversa ainda não
          // foi triada, e ausente significa "triagem" — nada é presumido.
          status: "aberta",
          ultimaMensagemEm: mensagem.enviadaEm,
          ultimaMensagemDirecao: "entrada",
          naoLidas: 1,
          janelaRespostaAte: fimDaJanela(mensagem.enviadaEm),
          criadaEm: args.recebidoEm,
          atualizadaEm: args.recebidoEm,
        });
      }

      // ── Mensagem ──────────────────────────────────────────────────────────
      const messageId = await ctx.db.insert("communicationMessages", {
        conversationId,
        vertical: args.vertical,
        channel: mensagem.canal,
        externalMessageId: mensagem.externalMessageId,
        direcao: "entrada",
        tipo: mensagem.tipo,
        texto: mensagem.texto,
        mediaMime: mensagem.mediaMime,
        autor: "cliente",
        enviadaEm: mensagem.enviadaEm,
      });

      // O texto de busca é derivado do que ACABOU de ser gravado (assunto,
      // nome do contato e handles). Calculado aqui, dentro da mesma
      // transação, a conversa já nasce encontrável.
      await atualizarBuscaDaConversa(ctx, conversationId);

      await ctx.db.insert("integrationEvents", {
        vertical: args.vertical,
        provider: args.provider,
        channel: mensagem.canal,
        event: "mensagem_recebida",
        dedupKey,
        receivedAt: args.recebidoEm,
        outcome: "applied",
        externalMessageId: mensagem.externalMessageId,
        conversationId,
      });

      // A triagem roda FORA desta transação: uma chamada de modelo não pode
      // segurar a gravação da mensagem, nem derrubá-la se a IA estiver fora.
      await ctx.scheduler.runAfter(0, internal.communicationsIa.triarConversa, {
        conversationId,
        messageId,
      });

      resultados.push({ dedupKey, outcome: "applied", conversationId });
    }

    return { resultados };
  },
});

/** Registra um lote que não pôde virar mensagem — payload estranho, etc. */
export const registrarEventoBruto = internalMutation({
  args: {
    vertical: verticalValidator,
    provider: v.string(),
    channel: v.optional(channelValidator),
    event: v.string(),
    dedupKey: v.string(),
    outcome: v.union(
      v.literal("ignored"),
      v.literal("error"),
      v.literal("no_match"),
    ),
    erro: v.optional(v.string()),
    recebidoEm: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("integrationEvents", {
      vertical: args.vertical,
      provider: args.provider,
      channel: args.channel,
      event: args.event,
      dedupKey: args.dedupKey,
      receivedAt: args.recebidoEm,
      outcome: args.outcome,
      erro: args.erro,
    });
  },
});

// ─── Leitura para a triagem (interna) ────────────────────────────────────────

export const conversaParaTriagem = internalQuery({
  args: { conversationId: v.id("communicationConversations") },
  handler: async (ctx, args) => {
    const conversa = await ctx.db.get(args.conversationId);
    if (!conversa) return null;

    const contato = await ctx.db.get(conversa.contactId);
    const mensagens = await ctx.db
      .query("communicationMessages")
      .withIndex("by_conversation_enviadaEm", (q) => q.eq("conversationId", conversa._id))
      .order("desc")
      .take(20);

    return {
      conversa: {
        _id: conversa._id,
        vertical: conversa.vertical,
        channel: conversa.channel,
        assunto: conversa.assunto,
        departamento: conversa.departamento,
        categoria: conversa.categoria,
        prioridade: conversa.prioridade,
        status: conversa.status,
        escaladaParaCeo: conversa.escaladaParaCeo ?? false,
      },
      contato: contato
        ? {
            _id: contato._id,
            displayName: contato.displayName,
            tipo: contato.tipo ?? "desconhecido",
            optOut: contato.optOut ?? false,
          }
        : null,
      // Ordem cronológica é o que o modelo precisa para entender a conversa.
      mensagens: mensagens.reverse().map((m) => ({
        direcao: m.direcao,
        tipo: m.tipo,
        texto: m.texto,
        enviadaEm: m.enviadaEm,
      })),
    };
  },
});

// ─── Leitura administrativa ──────────────────────────────────────────────────

type ConversaComContato = {
  conversa: Doc<"communicationConversations">;
  contato: Doc<"adminContacts"> | null;
};

async function anexarContatos(
  ctx: QueryCtx,
  conversas: Doc<"communicationConversations">[],
): Promise<ConversaComContato[]> {
  return Promise.all(
    conversas.map(async (conversa) => ({
      conversa,
      contato: await ctx.db.get(conversa.contactId),
    })),
  );
}

/** Forma consumida pelo Painel Admin — operação completa, com identificação. */
function resumirConversa({ conversa, contato }: ConversaComContato) {
  return {
    _id: conversa._id,
    channel: conversa.channel,
    assunto: conversa.assunto,
    departamento: conversa.departamento ?? ("triagem" as const),
    categoria: conversa.categoria,
    prioridade: conversa.prioridade ?? ("normal" as const),
    status: conversa.status,
    escaladaParaCeo: conversa.escaladaParaCeo ?? false,
    escaladaMotivo: conversa.escaladaMotivo,
    naoLidas: conversa.naoLidas,
    ultimaMensagemEm: conversa.ultimaMensagemEm,
    ultimaMensagemDirecao: conversa.ultimaMensagemDirecao,
    responsavelUserId: conversa.responsavelUserId,
    contato: contato
      ? {
          _id: contato._id,
          nome: contato.displayName,
          tipo: contato.tipo ?? ("desconhecido" as const),
          temVinculo: Boolean(contato.landingLeadId || contato.userId),
        }
      : null,
  };
}

type Conversa = Doc<"communicationConversations">;
type FiltroDaConversa = FilterBuilder<NamedTableInfo<DataModel, "communicationConversations">>;

type FiltrosDaCaixa = {
  departamento?: Conversa["departamento"];
  status?: Conversa["status"];
  prioridade?: Conversa["prioridade"];
  canal?: Conversa["channel"];
  responsavelUserId?: Id<"users">;
  apenasEscaladas?: boolean;
};

/**
 * Traduz os filtros da tela em UMA condição de consulta.
 *
 * Escrita uma vez e usada nos dois caminhos (busca e listagem) de propósito:
 * duas cópias divergiriam, e o dia em que divergissem o mesmo filtro passaria
 * a dizer coisas diferentes conforme houvesse ou não texto na caixa de busca.
 */
function refinarConversas(
  q: FiltroDaConversa,
  filtros: FiltrosDaCaixa,
  vertical: Conversa["vertical"],
): Expression<boolean> {
  const condicoes: Expression<boolean>[] = [];

  if (filtros.status) condicoes.push(q.eq(q.field("status"), filtros.status));
  if (filtros.canal) condicoes.push(q.eq(q.field("channel"), filtros.canal));

  // Campo ausente É o valor padrão — ver o comentário da query.
  if (filtros.departamento) {
    condicoes.push(
      filtros.departamento === "triagem"
        ? q.or(
            q.eq(q.field("departamento"), filtros.departamento),
            q.eq(q.field("departamento"), undefined),
          )
        : q.eq(q.field("departamento"), filtros.departamento),
    );
  }
  if (filtros.prioridade) {
    condicoes.push(
      filtros.prioridade === "normal"
        ? q.or(
            q.eq(q.field("prioridade"), filtros.prioridade),
            q.eq(q.field("prioridade"), undefined),
          )
        : q.eq(q.field("prioridade"), filtros.prioridade),
    );
  }
  if (filtros.responsavelUserId) {
    condicoes.push(q.eq(q.field("responsavelUserId"), filtros.responsavelUserId));
  }
  if (filtros.apenasEscaladas) {
    condicoes.push(q.eq(q.field("escaladaParaCeo"), true));
  }

  // Sem filtro nenhum, a condição precisa ser verdadeira para todas as linhas
  // do índice — que já está preso a esta vertical.
  return condicoes.length === 0 ? q.eq(q.field("vertical"), vertical) : q.and(...condicoes);
}

/**
 * CAIXA DE ENTRADA — paginada, filtrada e buscável.
 *
 * ── POR QUE OS FILTROS SÃO APLICADOS NA CONSULTA, E NÃO NA PÁGINA ───────────
 * Filtrar em memória o resultado de um `take(50)` devolve "as conversas
 * urgentes ENTRE as 50 mais recentes" — que não é o que a tela promete. Quem
 * opera lê aquilo como "há 3 urgentes" e vai embora tranquilo enquanto a
 * quarta, mais antiga, está fora da janela.
 *
 * Aqui o filtro entra na própria consulta e a paginação percorre TODO o
 * conjunto: uma página pode vir menor, e `isDone` continua dizendo a verdade.
 *
 * ── DEFAULT AUSENTE ─────────────────────────────────────────────────────────
 * `departamento` ausente significa "triagem" e `prioridade` ausente significa
 * "normal" (schema). Filtrar por esses dois valores precisa, portanto,
 * alcançar também os documentos em que o campo não existe — senão a conversa
 * recém-chegada, que é justamente a que está em triagem, seria a única a não
 * aparecer no filtro "Triagem".
 */
export const listarConversas = query({
  args: {
    paginationOpts: paginationOptsValidator,
    departamento: v.optional(departamentoValidator),
    status: v.optional(statusDeConversaValidator),
    prioridade: v.optional(prioridadeValidator),
    canal: v.optional(channelValidator),
    responsavelUserId: v.optional(v.id("users")),
    apenasEscaladas: v.optional(v.boolean()),
    busca: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const vertical = verticalDoAmbiente();
    const termo = termoDeBusca(args.busca);

    const paginado = termo
      ? await ctx.db
          .query("communicationConversations")
          .withSearchIndex("search_busca", (q) => {
            const base = q.search("buscaTexto", termo).eq("vertical", vertical);
            const comStatus = args.status ? base.eq("status", args.status) : base;
            return args.canal ? comStatus.eq("channel", args.canal) : comStatus;
          })
          // `status` e `canal` já entraram pelo índice de busca acima.
          .filter((q) =>
            refinarConversas(
              q,
              {
                departamento: args.departamento,
                prioridade: args.prioridade,
                responsavelUserId: args.responsavelUserId,
                apenasEscaladas: args.apenasEscaladas,
              },
              vertical,
            ),
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("communicationConversations")
          .withIndex("by_vertical_ultimaMensagem", (q) => q.eq("vertical", vertical))
          .order("desc")
          .filter((q) =>
            refinarConversas(
              q,
              {
                status: args.status,
                canal: args.canal,
                departamento: args.departamento,
                prioridade: args.prioridade,
                responsavelUserId: args.responsavelUserId,
                apenasEscaladas: args.apenasEscaladas,
              },
              vertical,
            ),
          )
          .paginate(args.paginationOpts);

    const comContato = await anexarContatos(ctx, paginado.page);

    return {
      ...paginado,
      page: comContato.map(resumirConversa),
      // A busca ordena por RELEVÂNCIA; a lista normal, por recência. Dizer
      // isso à tela evita a pergunta "por que a ordem mudou?".
      ordenadoPor: termo ? ("relevancia" as const) : ("recencia" as const),
    };
  },
});

/**
 * HISTÓRICO COMPLETO da conversa, do mais recente para o mais antigo.
 *
 * Separado de `abrirConversa` porque o cabeçalho da conversa (contato,
 * classificação, tarefas) é UM documento e as mensagens são MUITAS: carregar
 * as duas coisas juntas obrigaria a escolher entre truncar o histórico ou
 * recarregar o cabeçalho a cada "ver mais antigas".
 */
export const listarMensagens = query({
  args: {
    conversationId: v.id("communicationConversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const conversa = await ctx.db.get(args.conversationId);
    if (!conversa) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
    }

    const paginado = await ctx.db
      .query("communicationMessages")
      .withIndex("by_conversation_enviadaEm", (q) => q.eq("conversationId", conversa._id))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...paginado,
      page: paginado.page.map((m) => ({
        _id: m._id,
        direcao: m.direcao,
        tipo: m.tipo,
        texto: m.texto,
        autor: m.autor,
        enviadaEm: m.enviadaEm,
        statusEntrega: m.statusEntrega,
        enviadaPorUserId: m.enviadaPorUserId,
      })),
    };
  },
});

export const abrirConversa = query({
  args: {
    conversationId: v.id("communicationConversations"),
    limiteDeMensagens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const conversa = await ctx.db.get(args.conversationId);
    if (!conversa) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
    }

    const contato = await ctx.db.get(conversa.contactId);

    const mensagens = await ctx.db
      .query("communicationMessages")
      .withIndex("by_conversation_enviadaEm", (q) => q.eq("conversationId", conversa._id))
      .order("desc")
      .take(Math.min(args.limiteDeMensagens ?? PAGINA_DE_MENSAGENS, 300));

    const identidades = contato
      ? await ctx.db
          .query("communicationIdentities")
          .withIndex("by_contact", (q) => q.eq("contactId", contato._id))
          .collect()
      : [];

    const triagens = await ctx.db
      .query("communicationTriage")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversa._id))
      .order("desc")
      .take(5);

    const aprovacoes = await ctx.db
      .query("adminApprovals")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversa._id))
      .order("desc")
      .take(20);

    const trabalhos = await ctx.db
      .query("adminWorkItems")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversa._id))
      .order("desc")
      .take(20);

    return {
      ...resumirConversa({ conversa, contato }),
      janelaRespostaAte: conversa.janelaRespostaAte,
      contatoDetalhe: contato
        ? {
            _id: contato._id,
            displayName: contato.displayName,
            tipo: contato.tipo ?? ("desconhecido" as const),
            landingLeadId: contato.landingLeadId,
            userId: contato.userId,
            vinculoOrigem: contato.vinculoOrigem,
            vinculoEm: contato.vinculoEm,
            vinculoRemovidoEm: contato.vinculoRemovidoEm,
            optOut: contato.optOut ?? false,
            notas: contato.notas,
            notasAtualizadasEm: contato.notasAtualizadasEm,
            notasAtualizadasPorUserId: contato.notasAtualizadasPorUserId,
            identidades: identidades.map((i) => ({
              channel: i.channel,
              externalId: i.externalId,
            })),
          }
        : null,
      mensagens: mensagens.reverse().map((m) => ({
        _id: m._id,
        direcao: m.direcao,
        tipo: m.tipo,
        texto: m.texto,
        autor: m.autor,
        enviadaEm: m.enviadaEm,
        statusEntrega: m.statusEntrega,
      })),
      triagens: triagens.map((t) => ({
        _id: t._id,
        departamentoSugerido: t.departamentoSugerido,
        categoriaSugerida: t.categoriaSugerida,
        prioridadeSugerida: t.prioridadeSugerida,
        confianca: t.confianca,
        resumo: t.resumo,
        sinais: t.sinais,
        modelo: t.modelo,
        divergiu: t.divergiu ?? false,
        criadaEm: t.criadaEm,
      })),
      aprovacoes: aprovacoes.map((a) => ({
        _id: a._id,
        proposta: a.proposta,
        textoAprovado: a.textoAprovado,
        status: a.status,
        geradoPor: a.geradoPor,
        decididoEm: a.decididoEm,
        recusaMotivo: a.recusaMotivo,
        execucaoErro: a.execucaoErro,
        criadoEm: a.criadoEm,
      })),
      trabalhos: trabalhos.map((t) => ({
        _id: t._id,
        tipo: t.tipo,
        titulo: t.titulo,
        status: t.status,
        venceEm: t.venceEm,
      })),
    };
  },
});

/**
 * Indicadores da Central.
 *
 * Mesma função alimenta o Painel Admin e — via ponte somente leitura — a sala
 * do Escritório 3D. Uma fonte, dois consumidores: se divergissem, o 3D
 * mostraria um número que o painel não confirma.
 */
export async function montarPainel(ctx: QueryCtx, agora: number) {
  const vertical = verticalDoAmbiente();

  const conversas = await ctx.db
    .query("communicationConversations")
    .withIndex("by_vertical_ultimaMensagem", (q) => q.eq("vertical", vertical))
    .order("desc")
    .take(1_000);

  const vivas = conversas.filter((c) => c.status !== "resolvida" && c.status !== "arquivada");

  const aprovacoesPendentes = await ctx.db
    .query("adminApprovals")
    .withIndex("by_vertical_status", (q) => q.eq("vertical", vertical).eq("status", "pendente"))
    .collect();

  const trabalhosAbertos = await ctx.db
    .query("adminWorkItems")
    .withIndex("by_vertical_status", (q) => q.eq("vertical", vertical).eq("status", "aberto"))
    .collect();

  const hoje = new Date(agora).toISOString().slice(0, 10);

  const departamentos = ["triagem", "comercial", "suporte", "financeiro", "ouvidoria"] as const;
  const porDepartamento = Object.fromEntries(
    departamentos.map((departamento) => {
      const doDepartamento = vivas.filter(
        (c) => (c.departamento ?? "triagem") === departamento,
      );
      return [
        departamento,
        {
          abertas: doDepartamento.length,
          urgentes: doDepartamento.filter((c) => c.prioridade === "urgente").length,
          aguardandoAprovacao: aprovacoesPendentes.filter((a) =>
            doDepartamento.some((c) => c._id === a.conversationId),
          ).length,
        },
      ];
    }),
  );

  const umDia = 86_400_000;
  const contatosRecentes = await ctx.db
    .query("adminContacts")
    .withIndex("by_vertical", (q) => q.eq("vertical", vertical))
    .order("desc")
    .take(200);

  return {
    vertical,
    geradoEm: new Date(agora).toISOString(),
    mensagensNaoLidas: vivas.reduce((soma, c) => soma + c.naoLidas, 0),
    conversasAbertas: vivas.length,
    aguardandoAprovacao: aprovacoesPendentes.length,
    escaladasCeo: vivas.filter((c) => c.escaladaParaCeo === true).length,
    leadsNovos24h: contatosRecentes.filter(
      (c) => c.criadoEm >= agora - umDia && (c.tipo ?? "desconhecido") !== "assinante",
    ).length,
    porDepartamento,
    pendencias: {
      semRespostaMais24h: vivas.filter((c) => estaSemResposta(c, agora)).length,
      followUpVencido: trabalhosAbertos.filter((t) => t.venceEm !== undefined && t.venceEm < hoje)
        .length,
    },
    envioExterno:
      process.env.ALTAR_CENTRAL_ENVIO_HABILITADO?.trim() === "true" ? "ligado" : "desligado",
  };
}

export const painel = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return montarPainel(ctx, Date.now());
  },
});

/** Versão interna, usada pela ponte do Escritório 3D (sem sessão de usuário). */
export const painelInterno = internalQuery({
  args: { agora: v.number() },
  handler: async (ctx, args) => montarPainel(ctx, args.agora),
});

/**
 * O que o gateway acabou de criar para estes telefones?
 *
 * Existe para o script de homologação (`scripts/homologacao/`) descobrir a
 * conversa e a última mensagem de cada cenário sem inventar id nenhum.
 *
 * ── POR QUE UMA CONSULTA, E NÃO UM EXPORT ───────────────────────────────────
 * A versão anterior do script baixava um `convex export` e o descompactava com
 * `unzip`. Funcionava no Linux e falhava no Windows, onde `unzip` não existe —
 * e a homologação é feita no computador de quem vende, que é Windows.
 *
 * Somente LEITURA e `internalQuery`: inalcançável pelo aplicativo, incapaz de
 * escrever. Devolve apenas identificadores e o mínimo para decidir o que ainda
 * falta triar — nenhum texto de mensagem, nenhum dado de contato.
 */
export const conversasPorIdentidade = internalQuery({
  args: { externalIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const encontrados = [];

    for (const externalId of args.externalIds) {
      const identidade = await ctx.db
        .query("communicationIdentities")
        .withIndex("by_channel_external", (q) =>
          q.eq("channel", "whatsapp").eq("externalId", externalId),
        )
        .first();

      if (!identidade) {
        encontrados.push({ externalId, encontrada: false as const });
        continue;
      }

      // A mais recente do contato: um cenário reenviado cria mensagem na mesma
      // conversa, não outra, mas o contato pode ter histórico anterior.
      const conversas = await ctx.db
        .query("communicationConversations")
        .withIndex("by_contact", (q) => q.eq("contactId", identidade.contactId))
        .collect();
      const conversa = conversas.sort((a, b) => b.ultimaMensagemEm - a.ultimaMensagemEm)[0];

      if (!conversa) {
        encontrados.push({ externalId, encontrada: false as const });
        continue;
      }

      const ultimaMensagem = await ctx.db
        .query("communicationMessages")
        .withIndex("by_conversation_enviadaEm", (q) => q.eq("conversationId", conversa._id))
        .order("desc")
        .first();

      // Já triada = não triar de novo. Sem isto, cada execução empilharia uma
      // proposta de resposta na fila de aprovação do Matheus.
      const triagem = await ctx.db
        .query("communicationTriage")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversa._id))
        .first();

      encontrados.push({
        externalId,
        encontrada: true as const,
        conversationId: conversa._id,
        vertical: conversa.vertical,
        messageId: ultimaMensagem?._id,
        jaTriada: triagem !== null,
      });
    }

    return encontrados;
  },
});

// ─── Edição administrativa ───────────────────────────────────────────────────

async function conversaExistente(ctx: MutationCtx, id: Id<"communicationConversations">) {
  const conversa = await ctx.db.get(id);
  if (!conversa) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
  }
  return conversa;
}

/**
 * Registra que um humano mexeu na classificação.
 *
 * Marca `divergiu` na última triagem quando o novo estado difere do que a IA
 * havia proposto. É este acúmulo que mede a IA — sem ele, a Fase 2 seria
 * decidida por impressão.
 */
async function marcarDivergencia(
  ctx: MutationCtx,
  conversationId: Id<"communicationConversations">,
  estado: { categoria?: string; departamento?: string; prioridade?: string },
) {
  const ultima = await ctx.db
    .query("communicationTriage")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .first();
  if (!ultima) return;

  const proposto = {
    categoria: ultima.categoriaSugerida as string,
    departamento: ultima.departamentoSugerido as string,
    prioridade: ultima.prioridadeSugerida as string,
  };
  const divergiu =
    (estado.categoria !== undefined && estado.categoria !== proposto.categoria) ||
    (estado.departamento !== undefined && estado.departamento !== proposto.departamento) ||
    (estado.prioridade !== undefined && estado.prioridade !== proposto.prioridade);

  if (divergiu && ultima.divergiu !== true) {
    await ctx.db.patch(ultima._id, { divergiu: true, aplicadaPor: "humano" });
  }
}

export const definirClassificacao = mutation({
  args: {
    conversationId: v.id("communicationConversations"),
    departamento: v.optional(departamentoValidator),
    categoria: v.optional(categoriaValidator),
    prioridade: v.optional(prioridadeValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await conversaExistente(ctx, args.conversationId);

    await marcarDivergencia(ctx, args.conversationId, {
      departamento: args.departamento,
      categoria: args.categoria,
      prioridade: args.prioridade,
    });

    const patch: Partial<Doc<"communicationConversations">> = { atualizadaEm: Date.now() };
    if (args.departamento !== undefined) patch.departamento = args.departamento;
    if (args.categoria !== undefined) patch.categoria = args.categoria;
    if (args.prioridade !== undefined) patch.prioridade = args.prioridade;

    await ctx.db.patch(args.conversationId, patch);
  },
});

export const definirResponsavel = mutation({
  args: {
    conversationId: v.id("communicationConversations"),
    responsavelUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await conversaExistente(ctx, args.conversationId);
    await ctx.db.patch(args.conversationId, {
      responsavelUserId: args.responsavelUserId,
      atualizadaEm: Date.now(),
    });
  },
});

export const definirStatus = mutation({
  args: {
    conversationId: v.id("communicationConversations"),
    status: statusDeConversaValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await conversaExistente(ctx, args.conversationId);
    await ctx.db.patch(args.conversationId, {
      status: args.status,
      atualizadaEm: Date.now(),
    });
  },
});

export const escalarParaCeo = mutation({
  args: {
    conversationId: v.id("communicationConversations"),
    motivo: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await conversaExistente(ctx, args.conversationId);
    const agora = Date.now();
    await ctx.db.patch(args.conversationId, {
      escaladaParaCeo: true,
      escaladaMotivo: args.motivo.trim() || "Escalada manualmente",
      escaladaEm: agora,
      status: "escalada_ceo",
      atualizadaEm: agora,
    });
  },
});

export const marcarComoLida = mutation({
  args: { conversationId: v.id("communicationConversations") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await conversaExistente(ctx, args.conversationId);
    await ctx.db.patch(args.conversationId, { naoLidas: 0, atualizadaEm: Date.now() });
  },
});

/**
 * Vincula o contato a um interessado da landing ou a um assinante.
 *
 * É o caminho para os casos que a máquina se recusou a decidir: telefone
 * ambíguo, número novo de um cliente conhecido, pessoa que trocou de
 * aparelho. Vínculo feito aqui é sempre `humano`.
 */
export const vincularContato = mutation({
  args: {
    contactId: v.id("adminContacts"),
    landingLeadId: v.optional(v.id("landingLeads")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const contato = await ctx.db.get(args.contactId);
    if (!contato) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Contato não encontrado" });
    }

    if (args.landingLeadId && !(await ctx.db.get(args.landingLeadId))) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Interessado não encontrado" });
    }
    if (args.userId && !(await ctx.db.get(args.userId))) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Assinante não encontrado" });
    }

    await ctx.db.patch(args.contactId, {
      landingLeadId: args.landingLeadId ?? contato.landingLeadId,
      userId: args.userId ?? contato.userId,
      tipo: args.userId ? "assinante" : args.landingLeadId ? "interessado" : contato.tipo,
      vinculoOrigem: "humano",
      vinculoPorUserId: admin._id,
      vinculoEm: Date.now(),
      atualizadoEm: Date.now(),
    });
  },
});

/**
 * Candidatos de vínculo para um contato ainda solto.
 *
 * Mostra o que a máquina encontrou e se recusou a decidir sozinha. O humano
 * escolhe com a lista inteira à vista.
 */
export const sugerirVinculos = query({
  args: { contactId: v.id("adminContacts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const contato = await ctx.db.get(args.contactId);
    if (!contato) return { interessados: [], assinantes: [] };

    const identidades = await ctx.db
      .query("communicationIdentities")
      .withIndex("by_contact", (q) => q.eq("contactId", contato._id))
      .collect();

    const variantes = identidades
      .filter((i) => i.channel === "whatsapp")
      .flatMap((i) => variantesDeBusca(i.externalId));

    const interessados: Doc<"landingLeads">[] = [];
    for (const variante of variantes) {
      const achados = await ctx.db
        .query("landingLeads")
        .withIndex("by_whatsapp_e164", (q) => q.eq("whatsappE164", variante))
        .collect();
      for (const lead of achados) {
        if (!interessados.some((l) => l._id === lead._id)) interessados.push(lead);
      }
    }

    const usuarios = await ctx.db.query("users").take(LIMITE_VARREDURA_USERS);
    const assinantes = usuarios.filter((u) => {
      const doUsuario = normalizarE164(u.phone);
      return doUsuario !== null && variantes.includes(doUsuario);
    });

    return {
      interessados: interessados.map((l) => ({
        _id: l._id,
        name: l.name,
        email: l.email,
        intent: l.intent,
        status: l.status ?? ("novo" as const),
      })),
      assinantes: assinantes.map((u) => ({ _id: u._id, name: u.name, email: u.email })),
    };
  },
});

// ─── Notas internas do contato ───────────────────────────────────────────────

/**
 * NOTAS INTERNAS — o que a operação sabe sobre a pessoa.
 *
 * "Já pediu demonstração duas vezes e sumiu", "é sócia da outra empresa",
 * "prefere áudio". Informação que não cabe em campo nenhum e que hoje mora na
 * cabeça de quem atendeu — e some quando essa pessoa não está.
 *
 * Só admin escreve e só admin lê: a nota NUNCA entra em proposta de resposta,
 * nunca é enviada a ninguém e não aparece no Escritório 3D, que é somente
 * leitura de agregados. Gravamos AUTOR e DATA porque uma anotação sem origem,
 * meses depois, não se sabe se ainda vale.
 *
 * Texto vazio APAGA a nota (e o registro de autoria junto): quem limpou
 * decidiu que aquilo não valia mais, e manter o rastro de uma nota inexistente
 * só confundiria.
 */
export const definirNotas = mutation({
  args: {
    contactId: v.id("adminContacts"),
    notas: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const contato = await ctx.db.get(args.contactId);
    if (!contato) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Contato não encontrado" });
    }

    const texto = args.notas.trim().slice(0, LIMITE_DE_NOTAS);
    const agora = Date.now();

    await ctx.db.patch(args.contactId, {
      notas: texto.length > 0 ? texto : undefined,
      notasAtualizadasEm: texto.length > 0 ? agora : undefined,
      notasAtualizadasPorUserId: texto.length > 0 ? admin._id : undefined,
      atualizadoEm: agora,
    });

    return { salvo: texto.length > 0 };
  },
});

// ─── Vínculo manual: desfazer ────────────────────────────────────────────────

/**
 * Desfaz o vínculo de um contato com interessado e/ou assinante.
 *
 * É o par que faltava de `vincularContato`. Sem ele, um vínculo errado —
 * telefone reaproveitado, homônimo, engano de clique — ficava para sempre, e
 * a conversa de uma pessoa aparecia na ficha de outra.
 *
 * O contato NÃO é apagado e as conversas NÃO se movem: só o vínculo cai. O
 * tipo volta a "desconhecido" quando não sobra nenhum lado, porque afirmar
 * "assinante" sem vínculo seria afirmar o que já não se sabe.
 */
export const desvincularContato = mutation({
  args: {
    contactId: v.id("adminContacts"),
    removerInteressado: v.optional(v.boolean()),
    removerAssinante: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const contato = await ctx.db.get(args.contactId);
    if (!contato) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Contato não encontrado" });
    }

    // Sem alvo explícito, desfaz os dois — é o que "desvincular" significa
    // quando a tela não ofereceu escolha.
    const removerInteressado = args.removerInteressado ?? args.removerAssinante === undefined;
    const removerAssinante = args.removerAssinante ?? args.removerInteressado === undefined;

    const landingLeadId = removerInteressado ? undefined : contato.landingLeadId;
    const userId = removerAssinante ? undefined : contato.userId;

    if (landingLeadId === contato.landingLeadId && userId === contato.userId) {
      return { removido: false };
    }

    const agora = Date.now();
    await ctx.db.patch(args.contactId, {
      landingLeadId,
      userId,
      tipo: userId ? "assinante" : landingLeadId ? "interessado" : "desconhecido",
      // A origem do vínculo que SOBROU continua valendo; quando não sobra
      // nenhum, ela também cai — não há vínculo de que falar.
      vinculoOrigem: userId || landingLeadId ? contato.vinculoOrigem : undefined,
      vinculoPorUserId: userId || landingLeadId ? contato.vinculoPorUserId : undefined,
      vinculoEm: userId || landingLeadId ? contato.vinculoEm : undefined,
      vinculoRemovidoEm: agora,
      vinculoRemovidoPorUserId: admin._id,
      atualizadoEm: agora,
    });

    return { removido: true };
  },
});

// ─── Vínculo manual: encontrar quem vincular ─────────────────────────────────

/**
 * Candidatos a vínculo por TEXTO — nome, e-mail ou telefone.
 *
 * `sugerirVinculos` responde "o que a máquina achou e não quis decidir"; esta
 * responde "quem eu, humano, estou procurando". São perguntas diferentes: a
 * pessoa que escreveu de um número novo não aparece em nenhuma sugestão
 * automática, e é justamente ela que precisa ser encontrada pelo nome.
 *
 * Busca por índice em três frentes, sem varrer tabela: telefone normalizado
 * (índice exato), e-mail (índice exato) e nome (índice de busca).
 */
export const buscarCandidatosDeVinculo = query({
  args: { termo: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const bruto = args.termo.trim();
    const termo = termoDeBusca(bruto);
    if (!termo) return { interessados: [], assinantes: [] };

    const emailProcurado = bruto.includes("@") ? bruto.toLowerCase() : null;
    const telefone = normalizarE164(bruto);
    const variantes = telefone ? variantesDeBusca(telefone) : [];

    // ── Interessados (landing) ────────────────────────────────────────────
    const interessados: Doc<"landingLeads">[] = [];
    const guardarInteressado = (lead: Doc<"landingLeads">) => {
      if (!interessados.some((l) => l._id === lead._id)) interessados.push(lead);
    };

    for (const variante of variantes) {
      const achados = await ctx.db
        .query("landingLeads")
        .withIndex("by_whatsapp_e164", (q) => q.eq("whatsappE164", variante))
        .take(LIMITE_DE_CANDIDATOS);
      achados.forEach(guardarInteressado);
    }

    if (emailProcurado) {
      const achados = await ctx.db
        .query("landingLeads")
        .withIndex("by_email", (q) => q.eq("email", emailProcurado))
        .take(LIMITE_DE_CANDIDATOS);
      achados.forEach(guardarInteressado);
    }

    const porNomeLead = await ctx.db
      .query("landingLeads")
      .withSearchIndex("search_nome", (q) => q.search("name", termo))
      .take(LIMITE_DE_CANDIDATOS);
    porNomeLead.forEach(guardarInteressado);

    // ── Assinantes ────────────────────────────────────────────────────────
    const assinantes: Doc<"users">[] = [];
    const guardarAssinante = (usuario: Doc<"users">) => {
      if (!assinantes.some((u) => u._id === usuario._id)) assinantes.push(usuario);
    };

    if (emailProcurado) {
      const achado = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", emailProcurado))
        .first();
      if (achado) guardarAssinante(achado);
    }

    const porNomeUser = await ctx.db
      .query("users")
      .withSearchIndex("search_name", (q) => q.search("name", termo))
      .take(LIMITE_DE_CANDIDATOS);
    porNomeUser.forEach(guardarAssinante);

    if (variantes.length > 0) {
      // Telefone de assinante não tem índice — a varredura limitada é o mesmo
      // caminho que `sugerirVinculos` já usa, e só acontece quando o termo
      // digitado É um telefone.
      const usuarios = await ctx.db.query("users").take(LIMITE_VARREDURA_USERS);
      usuarios
        .filter((u) => {
          const doUsuario = normalizarE164(u.phone);
          return doUsuario !== null && variantes.includes(doUsuario);
        })
        .forEach(guardarAssinante);
    }

    return {
      interessados: interessados.slice(0, LIMITE_DE_CANDIDATOS).map((l) => ({
        _id: l._id,
        name: l.name,
        email: l.email,
        intent: l.intent,
        status: l.status ?? ("novo" as const),
        telefone: formatarBr(l.whatsappE164),
      })),
      // Só o que identifica a pessoa. Nada de estado de cobrança: a Central
      // classifica assunto de cobrança, nunca lê a assinatura de ninguém.
      assinantes: assinantes.slice(0, LIMITE_DE_CANDIDATOS).map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        telefone: formatarBr(u.phone),
      })),
    };
  },
});

// ─── Manutenção do índice de busca ───────────────────────────────────────────

/**
 * Preenche `buscaTexto` das conversas anteriores ao campo.
 *
 * Interna, idempotente e em lote: roda quantas vezes for preciso, e devolve
 * quantas ainda faltam. Não é migração de dado — nenhuma informação nova é
 * inventada, só o texto DERIVADO do que já está gravado. Uma conversa sem este
 * campo continua aparecendo na lista e nas métricas; o que ela não faz é
 * aparecer na BUSCA.
 */
export const repararIndiceDeBusca = internalMutation({
  args: { limite: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const vertical = verticalDoAmbiente();
    const limite = Math.min(args.limite ?? LOTE_DE_REPARO, LOTE_DE_REPARO);

    const conversas = await ctx.db
      .query("communicationConversations")
      .withIndex("by_vertical_ultimaMensagem", (q) => q.eq("vertical", vertical))
      .order("desc")
      .filter((q) => q.eq(q.field("buscaTexto"), undefined))
      .take(limite);

    for (const conversa of conversas) {
      await atualizarBuscaDaConversa(ctx, conversa._id);
    }

    return { reparadas: conversas.length };
  },
});
