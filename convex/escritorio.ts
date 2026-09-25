import { query } from "./_generated/server";
import { requirePlatformOwner, ehPlatformOwner } from "./lib/platformGuard";
import { panoramaDoNegocio } from "./lib/escritorio/panorama";

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
