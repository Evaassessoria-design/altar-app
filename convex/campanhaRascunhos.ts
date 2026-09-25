import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/adminGuard";
import { campanhaPorSlug, diasAte, estagioDe, type Campanha } from "./lib/campanha";
import { modeloPorId, type TipoDeMensagem } from "./lib/mensagensDaCampanha";
import { proximaAcao, type FatosDoInteressado } from "./lib/proximaAcao";
import { dataDoDia } from "./lib/dataDoDia";
import { effectiveSubscriptionStatus } from "./lib/access";

// ═════════════════════════════════════════════════════════════════════════════
// OS RASCUNHOS DA CAMPANHA — PREPARAR, REVISAR, E PARAR
//
// ── O QUE ESTE ARQUIVO NÃO TEM ──────────────────────────────────────────────
// Não tem `fetch`. Não tem `scheduler`. Não importa `communicationsOutbox`,
// nem nada da Central. Não existe função aqui que faça uma mensagem sair.
//
// `enviado_manualmente` é ANOTAÇÃO: uma pessoa marcando que mandou com o dedo
// dela, pelo WhatsApp dela. O nome é longo de propósito — o dia em que alguém
// encurtar para "enviado" é o dia em que o estado passa a parecer algo que o
// sistema faz. Há trava de leitura de fonte cobrando isso.
//
// ── APROVAR NÃO É ENVIAR ────────────────────────────────────────────────────
// Enquanto não houver provedor homologado, aprovar é decisão EDITORIAL: "este
// texto está bom, pode ir". Quem leva é gente. A separação existe para que o
// dia em que houver provedor não encontre uma fila de trezentas mensagens
// aprovadas com semântica de "pode disparar".
// ═════════════════════════════════════════════════════════════════════════════

/** Teto de um preparo em lote. Acima disso é campanha, não tarefa. */
export const LIMITE_DO_LOTE = 50;

/** Teto da listagem. A tela diz quantos carregou e se há mais. */
export const LIMITE_DE_RASCUNHOS = 200;

/** Os estados em que um rascunho ainda ocupa lugar — não se prepara outro igual. */
const VIVOS = new Set(["rascunho", "aprovado"]);

// ── Os fatos que a regra precisa ────────────────────────────────────────────

/**
 * Traduz um interessado nos fatos de `lib/proximaAcao.ts`.
 *
 * ── O QUE FICA `undefined` DE PROPÓSITO ─────────────────────────────────────
 * Os fatos da conta de teste (eventos criados, prazo restante) só existem
 * quando alguém ligou o interessado a uma conta. Sem vínculo eles ficam
 * ausentes — e "ausente" faz a regra calar sobre aquele ponto, em vez de
 * concluir que a conta está vazia. Concluir vazio sem ter olhado mandaria a
 * pessoa receber ajuda de onboarding que ela não pediu.
 */
async function fatosDe(
  ctx: QueryCtx,
  lead: Doc<"landingLeads">,
  campanha: Campanha | undefined,
  agora: number,
): Promise<FatosDoInteressado> {
  const convidadoEm = lead.marcosEm?.convidado;
  const fatos: FatosDoInteressado = {
    status: lead.status,
    marcosEm: lead.marcosEm,
    temCanal: Boolean(lead.whatsapp?.trim() || lead.email?.trim()),
    diasDesdeOConvite:
      convidadoEm === undefined
        ? undefined
        : Math.floor((agora - convidadoEm) / 86_400_000),
    diasAteACampanha: campanha ? diasAte(campanha, dataDoDia()) : undefined,
  };

  if (!lead.contaUserId) return fatos;
  const conta = await ctx.db.get(lead.contaUserId);
  if (!conta) return fatos;

  // Uma leitura por interessado VINCULADO — e só os vinculados têm conta, que
  // são poucos por definição (quem já testa, não quem foi convidado). Fazer
  // isto para a campanha inteira seria N+1 sobre trezentas pessoas.
  const eventos = await ctx.db
    .query("events")
    .withIndex("by_user", (q) => q.eq("userId", conta._id))
    // Um é o que a regra precisa saber: "criou algum evento?". Contar todos
    // custaria a conta inteira para responder uma pergunta de sim ou não.
    .take(1);

  const fim = conta.trialEndDate;
  return {
    ...fatos,
    eventosNaConta: eventos.length,
    diasAteOFimDoTeste:
      fim && effectiveSubscriptionStatus(conta, agora) === "trial"
        ? Math.ceil((Date.parse(`${fim}T12:00:00Z`) - agora) / 86_400_000)
        : undefined,
  };
}

// ── Preparar ───────────────────────────────────────────────────────────────

/** Por onde falar com ela. WhatsApp na frente: é onde decoradora responde. */
function canalDe(lead: Doc<"landingLeads">): {
  canal: "whatsapp" | "email";
  destinatario?: string;
} {
  const zap = lead.whatsapp?.trim();
  if (zap) return { canal: "whatsapp", destinatario: zap };
  const email = lead.email?.trim();
  if (email) return { canal: "email", destinatario: email };
  // Sem contato nenhum: o rascunho ainda nasce, com a pendência declarada. O
  // contrário faria a lista prometer que todo mundo é alcançável.
  return { canal: "whatsapp" };
}

async function redigirPara(
  ctx: QueryCtx,
  lead: Doc<"landingLeads">,
  tipoPedido: TipoDeMensagem | undefined,
  agora: number,
) {
  const campanha = campanhaPorSlug(lead.campanha);
  const sugestao = proximaAcao(await fatosDe(ctx, lead, campanha, agora));

  // A escolha de quem clicou vale. Sem escolha, vale a sugestão da regra — e
  // quando a regra diz "não mande nada", não se prepara nada.
  const tipo = tipoPedido ?? sugestao.mensagem;
  if (!tipo) return null;

  const modelo = modeloPorId(tipo);
  if (!modelo) return null;

  const { canal, destinatario } = canalDe(lead);
  const redigido = modelo.redigir({
    nome: lead.name,
    empresa: lead.empresa,
    origem: lead.origem,
    campanha,
  });

  const pendencias = [...redigido.pendencias];
  if (!destinatario) {
    pendencias.push("Não há telefone nem e-mail gravado para esta pessoa.");
  }
  // O modelo tem um canal preferido, mas o cadastro manda: preparar um e-mail
  // para quem só tem WhatsApp é um rascunho que não tem para onde ir.
  if (modelo.canal === "email" && canal === "whatsapp" && destinatario) {
    pendencias.push("Este modelo é de e-mail, e só há WhatsApp gravado.");
  }

  return {
    tipo,
    canalSugerido: destinatario ? canal : modelo.canal,
    destinatario,
    texto: redigido.texto,
    pendencias,
    contexto: sugestao.motivo,
    motivo: tipoPedido ? "Escolhido por uma pessoa." : sugestao.acao,
    proximaAcao: modelo.proximaAcao,
  };
}

const tipoValidator = v.string();

/**
 * Prepara UM rascunho.
 *
 * Idempotente por (pessoa, tipo): preparar de novo devolve o que já existe em
 * vez de criar um segundo. Sem isso, clicar duas vezes deixaria dois convites
 * iguais na fila e alguém mandaria os dois.
 */
export const preparar = mutation({
  args: {
    leadId: v.id("landingLeads"),
    /** Ausente = o que `lib/proximaAcao.ts` sugerir para esta pessoa. */
    tipo: v.optional(tipoValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Interessado não encontrado" });
    }
    if (args.tipo !== undefined && !modeloPorId(args.tipo)) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Modelo de mensagem não encontrado" });
    }

    const agora = Date.now();
    const redigido = await redigirPara(ctx, lead, args.tipo as TipoDeMensagem | undefined, agora);
    if (!redigido) {
      // A recusa DIZ o motivo. "Não há mensagem a preparar" sozinho manda a
      // pessoa procurar defeito num comportamento correto — quem já é cliente,
      // quem disse não, e quem não tem canal são três recusas diferentes.
      const sugestao = proximaAcao(await fatosDe(ctx, lead, campanhaPorSlug(lead.campanha), agora));
      throw new ConvexError({
        code: "INVALID",
        message: `Não há mensagem a preparar para esta pessoa agora: ${sugestao.motivo}`,
      });
    }

    const jaExiste = await ctx.db
      .query("campaignDrafts")
      .withIndex("by_lead_tipo", (q) =>
        q.eq("landingLeadId", args.leadId).eq("tipo", redigido.tipo),
      )
      .collect();
    const vivo = jaExiste.find((d) => VIVOS.has(d.status));
    if (vivo) return vivo._id;

    return ctx.db.insert("campaignDrafts", {
      landingLeadId: args.leadId,
      campanha: lead.campanha ?? "",
      ...redigido,
      status: "rascunho",
      geradoPor: "modelo",
      criadoEm: agora,
      atualizadoEm: agora,
    });
  },
});

/**
 * Prepara o que estiver faltando na campanha inteira.
 *
 * ── POR QUE O LOTE TEM TETO, E O TETO É DECLARADO ───────────────────────────
 * Preparar trezentos rascunhos numa mutation é uma transação que não fecha. E,
 * pior do que não fechar, fecharia pela metade: cento e cinquenta pessoas com
 * rascunho e cento e cinquenta sem, sem ninguém saber quais.
 *
 * O lote pega os primeiros `LIMITE_DO_LOTE` que precisam de algo e DIZ quantos
 * ficaram. Rodar de novo continua de onde parou, porque o preparo é idempotente
 * por pessoa e tipo.
 */
export const prepararPendentes = mutation({
  args: {
    campanha: v.string(),
    /** Só este tipo. Ausente = o que a regra sugerir para cada pessoa. */
    tipo: v.optional(tipoValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.tipo !== undefined && !modeloPorId(args.tipo)) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Modelo de mensagem não encontrado" });
    }

    const leads = await ctx.db
      .query("landingLeads")
      .withIndex("by_campanha", (q) => q.eq("campanha", args.campanha))
      // Um a mais do que o teto do lote não basta: muita gente da campanha não
      // precisa de nada, e parar na primeira centena devolveria zero preparos
      // numa campanha cheia de gente já atendida. Varre mais e prepara menos.
      .take(VARREDURA_DO_LOTE + 1);

    const agora = Date.now();
    const criados: Id<"campaignDrafts">[] = [];
    let pulados = 0;

    for (const lead of leads.slice(0, VARREDURA_DO_LOTE)) {
      if (criados.length >= LIMITE_DO_LOTE) {
        pulados++;
        continue;
      }
      const redigido = await redigirPara(
        ctx,
        lead,
        args.tipo as TipoDeMensagem | undefined,
        agora,
      );
      if (!redigido) continue;

      const jaExiste = await ctx.db
        .query("campaignDrafts")
        .withIndex("by_lead_tipo", (q) =>
          q.eq("landingLeadId", lead._id).eq("tipo", redigido.tipo),
        )
        .collect();
      if (jaExiste.some((d) => VIVOS.has(d.status))) continue;

      criados.push(
        await ctx.db.insert("campaignDrafts", {
          landingLeadId: lead._id,
          campanha: lead.campanha ?? "",
          ...redigido,
          status: "rascunho",
          geradoPor: "modelo",
          criadoEm: agora,
          atualizadoEm: agora,
        }),
      );
    }

    return {
      preparados: criados.length,
      /** Precisavam e não couberam no lote. Rodar de novo continua daqui. */
      restantes: pulados,
      /** A varredura bateu no teto: pode haver gente além do que foi olhado. */
      varreduraIncompleta: leads.length > VARREDURA_DO_LOTE,
    };
  },
});

/** Até onde o lote OLHA. Distinto de quantos ele prepara. */
export const VARREDURA_DO_LOTE = 500;

// ── Ler ────────────────────────────────────────────────────────────────────

export const listar = query({
  args: {
    campanha: v.string(),
    status: v.optional(
      v.union(
        v.literal("rascunho"),
        v.literal("aprovado"),
        v.literal("descartado"),
        v.literal("enviado_manualmente"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // O filtro entra na CONSULTA quando há índice para ele. Filtrar a página
    // carregada devolveria "os aprovados entre os 200 primeiros" e a tela leria
    // isso como "os aprovados".
    const lidos = args.status
      ? await ctx.db
          .query("campaignDrafts")
          .withIndex("by_campanha_status", (q) =>
            q.eq("campanha", args.campanha).eq("status", args.status!),
          )
          .order("desc")
          .take(LIMITE_DE_RASCUNHOS + 1)
      : await ctx.db
          .query("campaignDrafts")
          .withIndex("by_campanha_status", (q) => q.eq("campanha", args.campanha))
          .order("desc")
          .take(LIMITE_DE_RASCUNHOS + 1);

    const temMais = lidos.length > LIMITE_DE_RASCUNHOS;
    const pagina = lidos.slice(0, LIMITE_DE_RASCUNHOS);

    // Uma leitura por rascunho para saber o nome de quem vai receber. É o teto
    // da página (200), não o da campanha — e sem ela a tela mostraria uma lista
    // de textos sem dono.
    const comPessoa = await Promise.all(
      pagina.map(async (d) => {
        const lead = await ctx.db.get(d.landingLeadId);
        return {
          ...d,
          pessoa: lead
            ? { nome: lead.name, empresa: lead.empresa, estagio: estagioDe(lead) }
            : null,
        };
      }),
    );

    return { temMais, rascunhos: comPessoa };
  },
});

// ── Decidir ────────────────────────────────────────────────────────────────

/**
 * Aprovar, descartar, ou anotar que uma pessoa enviou.
 *
 * ── APROVAR EXIGE QUE NÃO FALTE NADA ────────────────────────────────────────
 * Um texto com "[LINK DA SALA — ainda não definido]" no meio não pode ser
 * aprovado. Aprovar um texto com buraco é o mesmo que não ter revisado, e o
 * buraco só apareceria para quem recebesse.
 *
 * ── E EXIGE AUTOR ───────────────────────────────────────────────────────────
 * `decididoPorUserId` nunca fica vazio numa decisão. Aprovação sem autor não é
 * aprovação — é a segunda trava do portão, a mesma de `adminApprovals`.
 */
export const decidir = mutation({
  args: {
    draftId: v.id("campaignDrafts"),
    decisao: v.union(
      v.literal("aprovar"),
      v.literal("descartar"),
      v.literal("marcar_enviado"),
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const rascunho = await ctx.db.get(args.draftId);
    if (!rascunho) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Rascunho não encontrado" });
    }

    const agora = Date.now();

    if (args.decisao === "aprovar") {
      if (rascunho.pendencias.length > 0) {
        throw new ConvexError({
          code: "INVALID",
          message: `Falta resolver: ${rascunho.pendencias[0]}`,
        });
      }
      await ctx.db.patch(args.draftId, {
        status: "aprovado",
        decididoPorUserId: admin._id,
        decididoEm: agora,
        atualizadoEm: agora,
      });
      return;
    }

    if (args.decisao === "descartar") {
      await ctx.db.patch(args.draftId, {
        status: "descartado",
        decididoPorUserId: admin._id,
        decididoEm: agora,
        atualizadoEm: agora,
      });
      return;
    }

    // ── "Marcar enviado" é ANOTAÇÃO ────────────────────────────────────────
    // Nada saiu daqui. Uma pessoa abriu o WhatsApp dela, colou o texto e
    // mandou — e está registrando isso para que a mesma mensagem não seja
    // preparada de novo amanhã.
    //
    // O ALTAR não tem como confirmar entrega, e por isso não afirma entrega:
    // grava quando ALGUÉM DISSE que enviou, com o nome de quem disse.
    await ctx.db.patch(args.draftId, {
      status: "enviado_manualmente",
      decididoPorUserId: admin._id,
      decididoEm: rascunho.decididoEm ?? agora,
      enviadoEm: agora,
      atualizadoEm: agora,
    });
  },
});

/**
 * Editar o texto antes de aprovar.
 *
 * Editar devolve o rascunho para "rascunho" quando ele já estava aprovado: a
 * aprovação era daquele texto, não desta pessoa. Sem essa regra, editar depois
 * de aprovado produziria um texto aprovado que ninguém leu.
 */
export const editarTexto = mutation({
  args: { draftId: v.id("campaignDrafts"), texto: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rascunho = await ctx.db.get(args.draftId);
    if (!rascunho) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Rascunho não encontrado" });
    }
    const texto = args.texto.trim();
    if (!texto) {
      throw new ConvexError({ code: "INVALID", message: "O texto não pode ficar vazio." });
    }
    if (rascunho.status === "enviado_manualmente") {
      // Editar o que já foi enviado reescreveria o registro do que a pessoa
      // mandou — e o histórico deixaria de bater com o WhatsApp dela.
      throw new ConvexError({
        code: "INVALID",
        message: "Esta mensagem já foi enviada. O texto enviado não muda.",
      });
    }

    await ctx.db.patch(args.draftId, {
      texto,
      geradoPor: "humano",
      status: rascunho.status === "aprovado" ? "rascunho" : rascunho.status,
      // A aprovação anterior era de outro texto: sai junto com ele.
      decididoPorUserId: undefined,
      decididoEm: undefined,
      // Uma pessoa reescreveu; o marcador de link em falta pode ter saído no
      // meio. Só a pendência de canal sobrevive, porque ela é do CADASTRO e
      // nenhuma edição de texto a resolve.
      pendencias: rascunho.pendencias.filter((p) => p.includes("gravado")),
      atualizadoEm: Date.now(),
    });
  },
});
