import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requirePlatformOwner, ehPlatformOwner } from "./lib/platformGuard";
import { panoramaDoNegocio } from "./lib/escritorio/panorama";
import { CAMPANHAS, estagioDe } from "./lib/campanha";
import {
  janelaDoRelatorio,
  montarFeed,
  montarRelatorio,
  type FatosDoRelatorio,
} from "./lib/escritorio/relatorio";

// ─────────────────────────────────────────────────────────────────────────────
// ESCRITÓRIO ALTAR — a mesa de quem administra o NEGÓCIO.
//
// ── O ERRO QUE ESTE ARQUIVO CORRIGE ─────────────────────────────────────────
// O que se chamava "Escritório" era, no código, uma ferramenta da decoradora:
// guardas de tenant, nove fontes de dado dela, tarefas com `userId`. Estava
// certo — e com o nome errado. Virou `assistente.ts`. O nome voltou para cá,
// para a coisa que ele sempre descreveu: a administração do SaaS.
//
// ── A FRONTEIRA, EM UMA LINHA CADA ──────────────────────────────────────────
//   escritorio.ts  → dados do NEGÓCIO ALTAR.  Guarda: requirePlatformOwner.
//   assistente.ts  → dados da DECORADORA.     Guarda: requireActiveAccess.
//
// São duas fronteiras INDEPENDENTES, e é por isso que nenhuma delas se apoia
// na outra: uma decoradora bloqueada por inadimplência continua sem acesso a
// este arquivo pelo mesmo motivo que uma adimplente — não é dona da
// plataforma. E o dono da plataforma não enxerga o evento de ninguém aqui,
// porque não há evento de ninguém aqui.
//
// ── POR QUE NÃO BASTA ESCONDER O ITEM DE MENU ───────────────────────────────
// Menu é desenho. Quem digita `/escritorio` na barra de endereços não passa
// pelo menu, e quem chama a função pelo cliente Convex não passa nem pela
// tela. A trava é esta guarda, em toda função pública daqui, e o teste
// adversarial em `escritorio.fronteiras.test.ts` falha se alguma escapar.
//
// ── O QUE AINDA NÃO ESTÁ AQUI ───────────────────────────────────────────────
// O Escritório de IA interno (comercial, marketing, CS e assinaturas do
// ALTAR) é trabalho futuro. Quando vier, nasce NESTE arquivo e atrás DESTA
// guarda, e terá tabela própria — `assistantTasks` é da decoradora, carrega
// `userId`, e reaproveitá-la misturaria de novo as duas camadas.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Esta conta administra o negócio ALTAR?
 *
 * Serve para a tela decidir se desenha a entrada do Escritório. NÃO é a trava:
 * responde `false` em vez de recusar, de propósito, porque toda conta comum
 * chama esta função em toda navegação e uma recusa viraria erro de tela para
 * quem não fez nada de errado. Quem trava é `requirePlatformOwner`, abaixo.
 */
export const souDono = query({
  args: {},
  handler: async (ctx) => ehPlatformOwner(ctx),
});

/**
 * O estado do negócio: carteira, cobrança, uso e interessados.
 *
 * Mesmíssima aritmética que a ponte HTTP do escritório externo já usava
 * (`admin.getOfficeSnapshot`), agora por uma função só — ver
 * `lib/escritorio/panorama.ts`.
 */
export const panorama = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);
    const now = Date.now();

    // Tetos altos, e a tela conta quantos vieram: varredura global pagina, e
    // enquanto não pagina ela ao menos não mente sobre o que leu.
    const TETO_DE_USUARIOS = 5_000;
    const TETO_DE_EVENTOS = 20_000;
    const usuarios = await ctx.db.query("users").take(TETO_DE_USUARIOS);
    const eventos = await ctx.db.query("events").take(TETO_DE_EVENTOS);
    const interessados = await ctx.db.query("landingLeads").take(2_000);

    // ── O DEFEITO QUE ISTO CORRIGE ──────────────────────────────────────
    // Os cards contavam quatro status literais ("novo", "contatado",
    // "convertido", "descartado"), mas a campanha tem doze estágios. Quem
    // estava em "respondeu", "confirmou" ou "testando" não entrava em card
    // nenhum, e a soma dos cards ficava menor que o total sem aviso. Agora o
    // estágio vem de `estagioDe` (a mesma leitura do funil) e tudo que não é
    // começo nem fim conta como "em andamento".
    const porEstagio = (id: string) =>
      interessados.filter((l) => estagioDe(l) === id).length;

    return {
      geradoEm: now,
      negocio: panoramaDoNegocio(usuarios, eventos.length, now),
      // Interessados NO ALTAR — decoradoras que pediram demo ou beta. Não
      // confundir com `leads`, que são os clientes da decoradora e não têm
      // nada que fazer nesta tela.
      interessados: {
        total: interessados.length,
        novo: porEstagio("novo"),
        emAndamento:
          interessados.length -
          porEstagio("novo") -
          porEstagio("convertido") -
          porEstagio("descartado"),
        convertido: porEstagio("convertido"),
        descartado: porEstagio("descartado"),
      },
      leitura: {
        usuariosLidos: usuarios.length,
        haMaisUsuarios: usuarios.length === TETO_DE_USUARIOS,
        eventosLidos: eventos.length,
        haMaisEventos: eventos.length === TETO_DE_EVENTOS,
      },
    };
  },
});

// ── O CENTRO DE COMANDO ─────────────────────────────────────────────────────

/** Teto de cada leitura do relatório. Passar dele é dito, não escondido. */
const TETO_DO_RELATORIO = 500;

type StatusDoRascunho = "rascunho" | "aprovado" | "descartado" | "enviado_manualmente";

/**
 * "O que aconteceu desde a última vez que entrei?" — relatório por relevância
 * e feed de atividade. A regra é `lib/escritorio/relatorio.ts`; aqui só se
 * lê. Tudo DERIVADO das tabelas que já existem: não há tabela de feed, porque
 * uma segunda lista das mesmas coisas divergiria na primeira correção.
 *
 * `ultimaVisita` vem do navegador e só escolhe o PERÍODO — nunca decide
 * permissão nem conteúdo. `requirePlatformOwner`, como todo o Escritório.
 */
export const centroDeComando = query({
  args: { ultimaVisita: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePlatformOwner(ctx);
    const agora = Date.now();
    const janela = janelaDoRelatorio(args.ultimaVisita, agora);
    const { desde } = janela;

    let incompleto = false;
    const ler = <T,>(lista: T[], teto = TETO_DO_RELATORIO): T[] => {
      if (lista.length >= teto) incompleto = true;
      return lista;
    };

    const TETO_DE_USUARIOS = 5_000;
    const usuarios = ler(await ctx.db.query("users").take(TETO_DE_USUARIOS), TETO_DE_USUARIOS);
    const negocio = panoramaDoNegocio(usuarios, 0, agora);

    // ── O Escritório e a campanha ─────────────────────────────────────
    const rodadas: FatosDoRelatorio["rodadas"][number][] = [];
    let ultimaRodada: FatosDoRelatorio["ultimaRodada"] = null;
    let porRevisar = 0;
    let aprovadosSemEnvio = 0;
    const decididos: {
      em: number;
      status: Exclude<StatusDoRascunho, "rascunho">;
      leadId: Id<"landingLeads">;
    }[] = [];
    const respostas: {
      em: number;
      leadId: Id<"landingLeads">;
      intencao: string;
      precisaDeHumano: boolean;
    }[] = [];

    for (const c of CAMPANHAS) {
      rodadas.push(
        ...ler(
          await ctx.db
            .query("escritorioExecucoes")
            .withIndex("by_campanha_criadoEm", (q) =>
              q.eq("campanha", c.slug).gte("criadoEm", desde),
            )
            .order("desc")
            .take(TETO_DO_RELATORIO),
        ),
      );
      const ultima = await ctx.db
        .query("escritorioExecucoes")
        .withIndex("by_campanha_criadoEm", (q) => q.eq("campanha", c.slug))
        .order("desc")
        .first();
      if (ultima && (!ultimaRodada || ultima.criadoEm > ultimaRodada.criadoEm)) {
        ultimaRodada = ultima;
      }

      const porStatus = async (status: StatusDoRascunho) =>
        ler(
          await ctx.db
            .query("campaignDrafts")
            .withIndex("by_campanha_status", (q) => q.eq("campanha", c.slug).eq("status", status))
            .take(TETO_DO_RELATORIO),
        );
      porRevisar += (await porStatus("rascunho")).length;
      const aprovados = await porStatus("aprovado");
      aprovadosSemEnvio += aprovados.length;
      for (const status of ["aprovado", "descartado", "enviado_manualmente"] as const) {
        const lista = status === "aprovado" ? aprovados : await porStatus(status);
        for (const d of lista) {
          const em =
            status === "enviado_manualmente" ? (d.enviadoEm ?? d.decididoEm) : d.decididoEm;
          if (em !== undefined && em >= desde) {
            decididos.push({ em, status, leadId: d.landingLeadId });
          }
        }
      }

      for (const r of ler(
        await ctx.db
          .query("respostasRegistradas")
          .withIndex("by_campanha_criadoEm", (q) =>
            q.eq("campanha", c.slug).gte("criadoEm", desde),
          )
          .take(TETO_DO_RELATORIO),
      )) {
        respostas.push({
          em: r.criadoEm,
          leadId: r.landingLeadId,
          intencao: r.intencao,
          precisaDeHumano: r.precisaDeHumano,
        });
      }
    }
    rodadas.sort((a, b) => b.criadoEm - a.criadoEm);

    // Nomes: uma leitura por pessoa citada, não por registro.
    const nomes = new Map<string, string>();
    for (const id of new Set([...decididos, ...respostas].map((x) => x.leadId))) {
      nomes.set(id, (await ctx.db.get(id))?.name ?? "interessado removido");
    }

    const novos = ler(
      await ctx.db
        .query("landingLeads")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", desde))
        .take(TETO_DO_RELATORIO),
    );

    // ── A Central ─────────────────────────────────────────────────────
    const aprovacoesCom = async (
      status: "pendente" | "aprovada" | "aprovada_editada" | "recusada" | "executada" | "expirada",
    ) =>
      ler(
        await ctx.db
          .query("adminApprovals")
          .withIndex("by_status_criadoEm", (q) => q.eq("status", status))
          .order("desc")
          .take(TETO_DO_RELATORIO),
      );
    const pendentes = await aprovacoesCom("pendente");
    const decididas: { em: number; status: string }[] = [];
    for (const status of ["aprovada", "aprovada_editada", "recusada", "executada"] as const) {
      for (const a of await aprovacoesCom(status)) {
        if (a.decididoEm !== undefined && a.decididoEm >= desde) {
          decididas.push({ em: a.decididoEm, status });
        }
      }
    }
    const expiradas = (await aprovacoesCom("expirada"))
      .filter((a) => a.expiraEm !== undefined && a.expiraEm >= desde && a.expiraEm <= agora)
      .map((a) => ({ em: a.expiraEm as number }));

    const fatos: FatosDoRelatorio = {
      desde,
      agora,
      negocio: {
        inadimplentes: negocio.overdue,
        bloqueadas: negocio.overdueBlocked,
        testeVencido: negocio.expired,
      },
      rodadas,
      ultimaRodada,
      rascunhos: {
        porRevisar,
        aprovadosSemEnvio,
        decididos: decididos.map((d) => ({
          em: d.em,
          status: d.status,
          leadNome: nomes.get(d.leadId) ?? "",
        })),
      },
      respostas: respostas.map((r) => ({ ...r, leadNome: nomes.get(r.leadId) ?? "" })),
      interessadosNovos: novos.map((l) => ({ em: l._creationTime, nome: l.name })),
      central: { pendentes: pendentes.length, decididas, expiradas },
    };

    return {
      janela,
      relatorio: montarRelatorio(fatos),
      feed: montarFeed(fatos),
      // A tela nunca afirma o que não sabe: se alguma leitura bateu no teto,
      // o relatório diz que pode haver mais.
      leituraIncompleta: incompleto,
    };
  },
});
