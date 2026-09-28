import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/adminGuard";
import {
  CAMPANHAS,
  campanhaPorSlug,
  carimbosAGravar,
  definicaoDoEstagio,
  diasAte,
  estagioDe,
  procurouOAltar,
} from "./lib/campanha";
import { classificarResposta } from "./lib/respostaDoInteressado";
import { dataDoDia } from "./lib/dataDoDia";
import { possiveisDuplicados } from "./lib/duplicidade";
import { modeloPorId, type TipoDeMensagem } from "./lib/mensagensDaCampanha";
import {
  CATALOGO,
  capacidadePorId,
  ehCapacidade,
  podeAgir,
  resumoDaAutonomia,
  situacaoDasCapacidades,
  type Capacidade,
} from "./lib/escritorio/autonomia";
import {
  chaveDaIntencao,
  fraseDoCiclo,
  planejarCiclo,
  resumirCiclo,
  type PessoaNoCiclo,
} from "./lib/escritorio/ciclo";
import { envioExternoHabilitado } from "./lib/central/autonomia";
import { adaptadorDe } from "./lib/channels/registro";
import { redigirParaLead } from "./lib/escritorio/redacaoDaCampanha";
import { campanhasDaRodadaAutomatica } from "./lib/escritorio/rodadaAutomatica";

// ═════════════════════════════════════════════════════════════════════════════
// RODAR O ESCRITÓRIO
//
// ── O QUE ACONTECE AQUI, NESTA ORDEM ────────────────────────────────────────
//   1. lê a campanha inteira, UMA vez;
//   2. lê a política de autonomia;
//   3. monta o retrato de cada pessoa;
//   4. `planejarCiclo` (puro) decide o que fazer;
//   5. o laço executa, pulando o que já existe;
//   6. a rodada é registrada, tenha produzido algo ou não.
//
// ── NENHUMA AÇÃO EXTERNA, EM NENHUM CAMINHO ─────────────────────────────────
// Não há `fetch`, não há `scheduler`, não há outbox. O ciclo escreve rascunho
// e registra o que viu. Uma mensagem só sai quando uma pessoa copia e manda.
//
// ── NENHUMA CHAMADA DE MODELO ───────────────────────────────────────────────
// O ciclo inteiro é determinístico: a regra decide e o modelo de texto
// redige. Rodar mil vezes custa zero em IA, e é isso que torna "rodar de novo"
// uma operação sem consequência — que é exatamente o que a idempotência
// promete.
// ═════════════════════════════════════════════════════════════════════════════

/** Até onde a rodada varre antes de admitir que não viu tudo. */
export const VARREDURA_DO_CICLO = 2_000;

/**
 * Teto de mensagens escritas numa rodada.
 *
 * Uma mutation é uma transação: mil inserções não fecham. E fechar pela metade
 * seria pior — metade das pessoas com mensagem, sem ninguém saber qual metade.
 * O que sobra fica para a próxima rodada, e a resposta DIZ quanto sobrou.
 */
export const LIMITE_POR_RODADA = 50;

// ── A POLÍTICA ──────────────────────────────────────────────────────────────

async function lerPolitica(ctx: QueryCtx, campanha: string) {
  const gravadas = await ctx.db
    .query("escritorioAutonomia")
    .withIndex("by_campanha", (q) => q.eq("campanha", campanha))
    .collect();
  return gravadas.map((g) => ({ capacidade: g.capacidade, ligada: g.ligada }));
}

/**
 * Há canal externo para as capacidades amarelas?
 *
 * Duas condições, e as duas precisam ser verdade: existe adaptador com
 * credencial, E o portão de saída está aberto. Qualquer uma falsa mantém as
 * amarelas indisponíveis — e a tela diz "disponível depois de conectar o
 * canal" em vez de fingir que é escolha do dono.
 */
function temCanal(): boolean {
  const whatsapp = adaptadorDe("whatsapp");
  return (
    (whatsapp?.configurado() ?? false) &&
    envioExternoHabilitado(process.env.ALTAR_CENTRAL_ENVIO_HABILITADO)
  );
}

export const autonomia = query({
  args: { campanha: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const situacoes = situacaoDasCapacidades(
      await lerPolitica(ctx, args.campanha),
      temCanal(),
    );
    return {
      capacidades: situacoes,
      resumo: resumoDaAutonomia(situacoes),
      /**
       * A frase honesta sobre envio. Repetida aqui porque é a pergunta que
       * mais importa nesta tela, e deduzi-la de duas linhas do catálogo é
       * trabalho que a tela não deveria ter.
       */
      recado: temCanal()
        ? "Há canal conectado."
        : "Nenhum canal conectado. O ALTAR escreve; quem envia é você.",
    };
  },
});

/**
 * Liga ou desliga uma capacidade.
 *
 * VERMELHO é recusado aqui, e não só ignorado na leitura. Deixar gravar um
 * `true` que a leitura depois ignora criaria um registro no banco dizendo uma
 * coisa e um comportamento fazendo outra — e a próxima pessoa a ler a tabela
 * concluiria que a política estava ligada.
 */
export const definirAutonomia = mutation({
  args: { campanha: v.string(), capacidade: v.string(), ligada: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (!campanhaPorSlug(args.campanha)) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Campanha não encontrada" });
    }
    if (!ehCapacidade(args.capacidade)) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Capacidade não encontrada" });
    }
    const def = capacidadePorId(args.capacidade)!;
    if (def.cor === "vermelho" && args.ligada) {
      throw new ConvexError({
        code: "INVALID",
        message: `"${def.rotulo}" nunca é automática.`,
      });
    }

    const existente = await ctx.db
      .query("escritorioAutonomia")
      .withIndex("by_campanha_capacidade", (q) =>
        q.eq("campanha", args.campanha).eq("capacidade", args.capacidade),
      )
      .unique();

    const campos = {
      ligada: args.ligada,
      alteradoPorUserId: admin._id,
      alteradoEm: Date.now(),
    };
    if (existente) await ctx.db.patch(existente._id, campos);
    else await ctx.db.insert("escritorioAutonomia", { ...args, ...campos });
  },
});

// ── A RODADA ────────────────────────────────────────────────────────────────

/** O retrato de cada pessoa, para a regra pura decidir. */
function retratoDe(lead: Doc<"landingLeads">, diasAteACampanha: number | undefined, agora: number): PessoaNoCiclo {
  const convidadoEm = lead.marcosEm?.convidado;
  return {
    _id: lead._id as string,
    nome: lead.empresa?.trim() || lead.name,
    status: lead.status,
    marcosEm: lead.marcosEm,
    fatos: {
      status: lead.status,
      marcosEm: lead.marcosEm,
      temCanal: Boolean(lead.whatsapp?.trim() || lead.email?.trim()),
      procurouOAltar: procurouOAltar(lead),
      diasDesdeOConvite:
        convidadoEm === undefined ? undefined : Math.floor((agora - convidadoEm) / 86_400_000),
      diasAteACampanha,
    },
  };
}

/**
 * Roda o Escritório agora.
 *
 * Idempotente: rodar de novo reconhece o trabalho da rodada anterior e não
 * duplica nada. A resposta DIZ quantas intenções foram puladas por já
 * existirem, que é a idempotência visível em vez de prometida.
 */
export const rodarAgora = mutation({
  args: { campanha: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return executarCiclo(ctx, args, { por: "humano", userId: admin._id });
  },
});

/**
 * A rodada do sistema — o cron diário (`crons.ts`).
 *
 * `internalMutation`: ninguém de fora dispara. Roda cada campanha ainda em
 * rotina (`lib/escritorio/rodadaAutomatica.ts`) pelo MESMO `executarCiclo`
 * do botão — nada de segunda regra. Uma campanha que falha não impede a
 * próxima, e a falha fica no log pelo nome da campanha, sem dado de ninguém.
 */
export const rodarPeloSistema = internalMutation({
  args: {},
  handler: async (ctx) => {
    const feitas: string[] = [];
    for (const c of campanhasDaRodadaAutomatica(CAMPANHAS, dataDoDia())) {
      try {
        await executarCiclo(ctx, { campanha: c.slug }, { por: "sistema" });
        feitas.push(c.slug);
      } catch (e) {
        console.error(`[escritorio] rodada automática falhou: ${c.slug}`, (e as Error)?.name ?? "erro");
      }
    }
    return { campanhas: feitas };
  },
});

type Disparo = { por: "humano"; userId: Id<"users"> } | { por: "sistema" };

/**
 * O ciclo em si. Quem chama já decidiu que PODE chamar: o botão exige admin,
 * o cron é interno. Daqui para baixo, humano e sistema são tratados igual —
 * a única diferença gravada é quem disparou.
 */
async function executarCiclo(ctx: MutationCtx, args: { campanha: string }, disparo: Disparo) {
  const campanha = campanhaPorSlug(args.campanha);
  if (!campanha) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Campanha não encontrada" });
  }

  const agora = Date.now();
  const dias = diasAte(campanha, dataDoDia());

  const lidos = await ctx.db
    .query("landingLeads")
    .withIndex("by_campanha", (q) => q.eq("campanha", args.campanha))
    .take(VARREDURA_DO_CICLO + 1);
  const leads = lidos.slice(0, VARREDURA_DO_CICLO);

  // ── O QUE JÁ EXISTE ─────────────────────────────────────────────────
  // Rascunhos vivos (por revisar ou aprovados) são trabalho já feito. Uma
  // leitura por índice, não uma por pessoa: o índice `by_campanha_status`
  // responde as duas perguntas em duas consultas, independentemente de a
  // campanha ter dez pessoas ou dois mil.
  const [porRevisar, aprovados] = await Promise.all([
    ctx.db
      .query("campaignDrafts")
      .withIndex("by_campanha_status", (q) =>
        q.eq("campanha", args.campanha).eq("status", "rascunho"),
      )
      .take(VARREDURA_DO_CICLO),
    ctx.db
      .query("campaignDrafts")
      .withIndex("by_campanha_status", (q) =>
        q.eq("campanha", args.campanha).eq("status", "aprovado"),
      )
      .take(VARREDURA_DO_CICLO),
  ]);

  const jaFeito = new Set(
    [...porRevisar, ...aprovados].map((d) =>
      chaveDaIntencao(args.campanha, "preparar_mensagem", d.landingLeadId as string, d.tipo),
    ),
  );

  const politica = await lerPolitica(ctx, args.campanha);
  const canal = temCanal();
  const podeFazer = new Set<Capacidade>(
    CATALOGO.map((c) => c.id).filter((id) => podeAgir(id, politica, canal)),
  );

  const plano = planejarCiclo({
    campanha: args.campanha,
    pessoas: leads.map((l) => retratoDe(l, dias, agora)),
    duplicidades: possiveisDuplicados(
      leads.map((l) => ({
        _id: l._id as string,
        name: l.name,
        email: l.email,
        whatsappE164: l.whatsappE164,
        empresa: l.empresa,
      })),
    ),
    podeFazer,
    jaFeito,
  });

  // ── EXECUTAR ────────────────────────────────────────────────────────
  // Só `preparar_mensagem` grava. Decisões e duplicidades já são derivadas
  // ao vivo pelo briefing — persisti-las criaria uma segunda lista das
  // mesmas coisas, e as duas divergiriam na primeira que alguém resolvesse.
  const porId = new Map(leads.map((l) => [l._id as string, l]));
  let escritas = 0;
  let naoCouberam = 0;

  for (const i of plano.intencoes) {
    if (i.tipo !== "preparar_mensagem" || !i.leadId || !i.mensagem) continue;
    if (escritas >= LIMITE_POR_RODADA) {
      naoCouberam++;
      continue;
    }
    const lead = porId.get(i.leadId);
    const modelo = modeloPorId(i.mensagem);
    if (!lead || !modelo) continue;

    await ctx.db.insert("campaignDrafts", {
      landingLeadId: lead._id,
      campanha: args.campanha,
      ...redigirParaLead(lead, modelo as never, i.motivo),
      status: "rascunho",
      geradoPor: "modelo",
      criadoEm: agora,
      atualizadoEm: agora,
    });
    escritas++;
  }

  const resumo = resumirCiclo(plano);
  const frase = fraseDoCiclo(resumo);

  // A rodada é registrada MESMO quando não produziu nada. Sem isso, "o
  // Escritório rodou e estava tudo em dia" não deixaria prova nenhuma.
  await ctx.db.insert("escritorioExecucoes", {
    campanha: args.campanha,
    disparadoPor: disparo.por,
    disparadoPorUserId: disparo.por === "humano" ? disparo.userId : undefined,
    analisadas: resumo.analisadas,
    mensagensPreparadas: escritas,
    duplicidadesApontadas: resumo.duplicidadesApontadas,
    decisoesParaVoce: resumo.decisoesParaVoce,
    jaExistiam: resumo.jaExistiam,
    bloqueadasPorAutonomia: resumo.bloqueadasPorAutonomia,
    resumo: frase,
    // Zero, e o campo existe para que ligar IA no ciclo tenha onde aparecer
    // antes de virar fatura.
    chamadasDeIa: 0,
    criadoEm: agora,
  });

  return {
    ...resumo,
    mensagensPreparadas: escritas,
    naoCouberam,
    resumo: frase,
    varreduraIncompleta: lidos.length > VARREDURA_DO_CICLO,
  };
}

/** Quantas rodadas o histórico mostra. Além disso é arqueologia. */
export const LIMITE_DO_HISTORICO = 20;

export const execucoes = query({
  args: { campanha: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rodadas = await ctx.db
      .query("escritorioExecucoes")
      .withIndex("by_campanha_criadoEm", (q) => q.eq("campanha", args.campanha))
      .order("desc")
      .take(LIMITE_DO_HISTORICO);

    const hojeISO = dataDoDia();
    const deHoje = rodadas.filter(
      (r) => new Date(r.criadoEm).toISOString().slice(0, 10) === hojeISO,
    );

    // ── O QUE O ESCRITÓRIO FEZ HOJE ─────────────────────────────────────
    // Somado das rodadas do DIA, não do histórico inteiro: "hoje o Escritório
    // fez" precisa significar hoje, senão o número só cresce e para de dizer
    // alguma coisa.
    const soma = (k: "analisadas" | "mensagensPreparadas" | "duplicidadesApontadas" | "decisoesParaVoce") =>
      deHoje.reduce((s, r) => s + r[k], 0);

    return {
      rodadas,
      hoje: {
        rodadas: deHoje.length,
        analisadas: soma("analisadas"),
        mensagensPreparadas: soma("mensagensPreparadas"),
        duplicidadesApontadas: soma("duplicidadesApontadas"),
        decisoesParaVoce: soma("decisoesParaVoce"),
        /** Nunca rodou hoje. A tela diz isso em vez de mostrar zeros. */
        nuncaRodou: deHoje.length === 0,
      },
      ultima: rodadas[0] ?? null,
    };
  },
});

// ── REGISTRAR UMA RESPOSTA ──────────────────────────────────────────────────

/**
 * Uma pessoa colou aqui o que o interessado respondeu.
 *
 * ── O QUE ESTA FUNÇÃO NÃO FINGE ─────────────────────────────────────────────
 * O ALTAR não lê o WhatsApp de ninguém. Não há integração, e por isso não há
 * "mensagem recebida" — há uma pessoa registrando o que leu no aparelho dela.
 *
 * O texto é gravado com autor e data, e a tela mostra isso: "registrado por
 * você". No dia em que houver canal, a MESMA classificação roda sobre a
 * mensagem de verdade e este caminho continua existindo para quem responder
 * por telefone.
 *
 * ── A CLASSIFICAÇÃO SUGERE; QUEM MOVE É UMA PESSOA ──────────────────────────
 * `classificarResposta` devolve intenção e um estágio SUGERIDO. Aplicar
 * sozinho faria uma palavra mal interpretada mudar o funil sem ninguém ver —
 * e "incerto" nunca sugere destino nenhum, de propósito.
 *
 * Quando a capacidade "classificar respostas" está desligada, o texto ainda é
 * gravado: registrar o que a pessoa disse é memória, não automação.
 */
export const registrarResposta = mutation({
  args: {
    leadId: v.id("landingLeads"),
    texto: v.string(),
    /**
     * Mover para o estágio sugerido na mesma ação.
     *
     * Ausente = só registra e classifica. A tela pergunta antes, mostrando a
     * leitura — é o que separa "o ALTAR entendeu" de "o ALTAR decidiu".
     */
    aplicarSugestao: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Interessado não encontrado" });
    }
    const texto = args.texto.trim();
    if (!texto) {
      throw new ConvexError({ code: "INVALID", message: "Cole o que ela respondeu." });
    }
    if (texto.length > LIMITE_DA_RESPOSTA) {
      throw new ConvexError({
        code: "INVALID",
        message: `Resposta muito longa (máximo ${LIMITE_DA_RESPOSTA} caracteres).`,
      });
    }

    const leitura = classificarResposta(texto);
    const agora = Date.now();
    const hoje = dataDoDia();

    // O e-mail que veio junto é gravado quando o cadastro não tinha nenhum.
    // Sobrescrever um e-mail existente por um citado de passagem numa
    // conversa trocaria um dado confirmado por um mencionado.
    const ganhaEmail = leitura.email && !lead.email?.trim() ? leitura.email : undefined;

    const politica = await lerPolitica(ctx, lead.campanha ?? "");
    const podeClassificar = podeAgir("classificar_respostas", politica, temCanal());

    // ── MOVER, SE PEDIREM E SE FIZER SENTIDO ────────────────────────────
    let moveuPara: string | undefined;
    const destino = leitura.estagioSugerido;
    if (args.aplicarSugestao && destino && podeClassificar) {
      const atual = definicaoDoEstagio(estagioDe(lead));
      const novo = definicaoDoEstagio(destino);
      // Nunca rebobina, e nunca mexe em quem já saiu do ciclo: um "obrigada"
      // de quem já é cliente não a devolve para "respondeu".
      const terminal = estagioDe(lead) === "convertido" || estagioDe(lead) === "descartado";
      // `descartado` é a exceção que PODE andar para trás — dizer "não tenho
      // interesse" precisa poder tirar alguém de qualquer etapa.
      const recusa = destino === "descartado";
      if (!terminal && (recusa || novo.marcos.length > atual.marcos.length)) {
        const carimbos = carimbosAGravar(lead, destino, agora);
        await ctx.db.patch(args.leadId, {
          status: destino,
          ultimaInteracao: hoje,
          ...(carimbos ? { marcosEm: { ...lead.marcosEm, ...carimbos } } : {}),
          ...(ganhaEmail ? { email: ganhaEmail } : {}),
        });
        moveuPara = destino;
      }
    }

    if (!moveuPara) {
      await ctx.db.patch(args.leadId, {
        ultimaInteracao: hoje,
        ...(ganhaEmail ? { email: ganhaEmail } : {}),
      });
    }

    await ctx.db.insert("respostasRegistradas", {
      landingLeadId: args.leadId,
      campanha: lead.campanha ?? "",
      texto,
      intencao: leitura.intencao,
      confianca: leitura.confianca,
      sinais: leitura.sinais,
      emailEncontrado: leitura.email,
      precisaDeHumano: leitura.precisaDeHumano,
      estagioSugerido: destino,
      estagioAplicado: moveuPara,
      registradoPorUserId: admin._id,
      criadoEm: agora,
    });

    return {
      intencao: leitura.intencao,
      confianca: leitura.confianca,
      sinais: leitura.sinais,
      precisaDeHumano: leitura.precisaDeHumano,
      estagioSugerido: destino ?? null,
      moveuPara: moveuPara ?? null,
      emailGravado: ganhaEmail ?? null,
      // Quando a capacidade está desligada, o texto entra e a leitura aparece
      // — mas nada se move. A tela precisa poder explicar a diferença.
      classificacaoAtiva: podeClassificar,
    };
  },
});

/** Teto do texto colado. Acima disso é conversa inteira, não resposta. */
export const LIMITE_DA_RESPOSTA = 4_000;

/** O histórico de respostas de uma pessoa. */
export const respostasDe = query({
  args: { leadId: v.id("landingLeads") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db
      .query("respostasRegistradas")
      .withIndex("by_lead", (q) => q.eq("landingLeadId", args.leadId))
      .order("desc")
      .take(20);
  },
});

export type { MutationCtx, TipoDeMensagem };
