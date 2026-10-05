import { query } from "./_generated/server";
import { requirePlatformOwner, ehPlatformOwner } from "./lib/platformGuard";
import { panoramaDoNegocio } from "./lib/escritorio/panorama";
import { montarPainel } from "./communications";
import { verticalDoAmbiente } from "./lib/central/vertical";
import {
  diaCivil,
  trabalhoVenceHoje,
  trabalhoVencido,
} from "./lib/central/prazos";

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

    const porStatus = (status: string) =>
      interessados.filter((l) => (l.status ?? "novo") === status).length;

    return {
      geradoEm: now,
      negocio: panoramaDoNegocio(usuarios, eventos.length, now),
      // Interessados NO ALTAR — decoradoras que pediram demo ou beta. Não
      // confundir com `leads`, que são os clientes da decoradora e não têm
      // nada que fazer nesta tela.
      interessados: {
        total: interessados.length,
        novo: porStatus("novo"),
        contatado: porStatus("contatado"),
        convertido: porStatus("convertido"),
        descartado: porStatus("descartado"),
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

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO OPERACIONAL
//
// O Escritório não cria uma segunda Central. Ele resume a operação que já
// existe em `communications`, `adminWorkItems`, `adminApprovals` e
// `customerVoiceSignals`, e manda o trabalho detalhado para as telas próprias.
// Assim uma tarefa continua tendo UMA fonte, um histórico e um responsável.
//
// A consulta usa `requirePlatformOwner`, e não `requireAdmin`: enxergar o
// comando executivo do negócio é poder do dono. Executar a operação detalhada
// continua atrás dos guardas de cada módulo administrativo.
// ─────────────────────────────────────────────────────────────────────────────

const LIMITE_DE_TAREFAS_DO_COMANDO = 1_000;
const LIMITE_DE_SINAIS_DO_COMANDO = 500;

const pesoDaPrioridade = {
  urgente: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
} as const;

/**
 * Pressão operacional do SaaS, sem conteúdo de conversa nem dado pessoal.
 *
 * Serve à mesa web do dono. A ponte 3D continua lendo os contratos HTTP já
 * congelados; quando o HOME chegar, ele consumirá API, não estas tabelas.
 */
export const comando = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformOwner(ctx);

    const agora = Date.now();
    const hoje = diaCivil(agora);
    const vertical = verticalDoAmbiente();

    const [central, abertasLidas, emAndamentoLidas, sinaisLidos] =
      await Promise.all([
        montarPainel(ctx, agora),
        ctx.db
          .query("adminWorkItems")
          .withIndex("by_vertical_status", (q) =>
            q.eq("vertical", vertical).eq("status", "aberto"),
          )
          .take(LIMITE_DE_TAREFAS_DO_COMANDO + 1),
        ctx.db
          .query("adminWorkItems")
          .withIndex("by_vertical_status", (q) =>
            q.eq("vertical", vertical).eq("status", "em_andamento"),
          )
          .take(LIMITE_DE_TAREFAS_DO_COMANDO + 1),
        ctx.db
          .query("customerVoiceSignals")
          .withIndex("by_vertical_ocorrencias", (q) =>
            q.eq("vertical", vertical),
          )
          .order("desc")
          .take(LIMITE_DE_SINAIS_DO_COMANDO + 1),
      ]);

    const tarefas = [
      ...abertasLidas.slice(0, LIMITE_DE_TAREFAS_DO_COMANDO),
      ...emAndamentoLidas.slice(0, LIMITE_DE_TAREFAS_DO_COMANDO),
    ];
    const sinais = sinaisLidos
      .slice(0, LIMITE_DE_SINAIS_DO_COMANDO)
      .filter((s) => s.status !== "entregue" && s.status !== "descartado");

    const proximas = [...tarefas]
      .sort((a, b) => {
        const porVencimento = (a.venceEm ?? "9999-12-31").localeCompare(
          b.venceEm ?? "9999-12-31",
        );
        if (porVencimento !== 0) return porVencimento;
        return (
          pesoDaPrioridade[a.prioridade ?? "normal"] -
          pesoDaPrioridade[b.prioridade ?? "normal"]
        );
      })
      .slice(0, 6);

    const nomes = new Map<string, string>();
    for (const tarefa of proximas) {
      if (!tarefa.responsavelUserId || nomes.has(tarefa.responsavelUserId))
        continue;
      const responsavel = await ctx.db.get(tarefa.responsavelUserId);
      if (responsavel) nomes.set(tarefa.responsavelUserId, responsavel.name);
    }

    return {
      geradoEm: agora,
      central,
      tarefas: {
        abertas: tarefas.length,
        emAndamento: tarefas.filter((t) => t.status === "em_andamento").length,
        urgentes: tarefas.filter((t) => t.prioridade === "urgente").length,
        vencidas: tarefas.filter((t) => trabalhoVencido(t, hoje)).length,
        vencemHoje: tarefas.filter((t) => trabalhoVenceHoje(t, hoje)).length,
        semResponsavel: tarefas.filter((t) => !t.responsavelUserId).length,
        proximas: proximas.map((t) => ({
          _id: t._id,
          titulo: t.titulo,
          tipo: t.tipo,
          status: t.status,
          prioridade: t.prioridade ?? ("normal" as const),
          venceEm: t.venceEm,
          responsavel: t.responsavelUserId
            ? (nomes.get(t.responsavelUserId) ?? "Responsável não encontrado")
            : null,
        })),
      },
      vozDoCliente: {
        sinaisAbertos: sinais.length,
        ocorrenciasAbertas: sinais.reduce(
          (total, sinal) => total + sinal.ocorrencias,
          0,
        ),
        criticos: sinais.filter((s) => s.severidade === "critica").length,
      },
      amostraParcial:
        central.amostraParcial ||
        abertasLidas.length > LIMITE_DE_TAREFAS_DO_COMANDO ||
        emAndamentoLidas.length > LIMITE_DE_TAREFAS_DO_COMANDO ||
        sinaisLidos.length > LIMITE_DE_SINAIS_DO_COMANDO,
    };
  },
});
