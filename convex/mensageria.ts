import { query } from "./_generated/server";
import { requireAdmin } from "./lib/adminGuard";
import { CANAIS } from "./lib/channels/tipos";
import { adaptadorDe } from "./lib/channels/registro";
import { recadoSobreEnvio, situacaoDoCanal } from "./lib/channels/situacao";
import { envioExternoHabilitado } from "./lib/central/autonomia";

// ═════════════════════════════════════════════════════════════════════════════
// EM QUE PÉ ESTÁ A MENSAGERIA
//
// ── POR QUE ESTA CONSULTA EXISTE ────────────────────────────────────────────
// Porque a resposta honesta para "o ALTAR manda WhatsApp?" hoje é "não", e
// essa resposta precisa vir do CÓDIGO, não da memória de quem responde.
//
// Um produto que sugere integração que não tem é um produto que vende uma
// coisa e entrega outra — e na live isso não é um detalhe técnico, é a
// diferença entre uma decoradora assinar informada e assinar enganada.
//
// ── ESTA CONSULTA NÃO ENVIA, NÃO TESTA E NÃO CHAMA NINGUÉM ──────────────────
// Ela lê ambiente e histórico. Nenhum `fetch`, nenhuma chamada ao provedor —
// inclusive porque "testar a conexão" a partir de uma query seria uma chamada
// externa disparada por qualquer abertura de tela.
// ═════════════════════════════════════════════════════════════════════════════

/** Até onde o histórico é lido para medir entregas. */
const AMOSTRA_DE_ENVIOS = 200;

export const situacaoDosCanais = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // O histórico de saída mora em `adminApprovals`: `executadaEm` marca o que
    // saiu, `execucaoErro` o que falhou. Uma amostra recente basta — a
    // pergunta é "funciona?", não "quantas ao todo desde sempre".
    const recentes = await ctx.db
      .query("adminApprovals")
      .withIndex("by_status_criadoEm", (q) => q.eq("status", "executada"))
      .order("desc")
      .take(AMOSTRA_DE_ENVIOS);

    const entregues = recentes.filter((a) => a.executadaEm !== undefined);
    const falhas = recentes
      .filter((a) => a.execucaoErro)
      .sort((a, b) => (b.decididoEm ?? b.criadoEm) - (a.decididoEm ?? a.criadoEm));

    const envioHabilitado = envioExternoHabilitado(
      process.env.ALTAR_CENTRAL_ENVIO_HABILITADO,
    );

    const leituras = CANAIS.map((canal) => {
      const adaptador = adaptadorDe(canal);
      return situacaoDoCanal({
        canal,
        temAdaptador: adaptador !== null,
        credenciais: adaptador?.configurado() ?? false,
        envioHabilitado,
        // A amostra não separa por canal porque `adminApprovals` guarda o
        // canal na conversa, não na aprovação. Contar aqui por canal exigiria
        // uma leitura por aprovação — e o número serve para responder
        // "funciona?", que a amostra já responde.
        entregasComSucesso: entregues.length,
        ultimaEntrega: entregues[0]?.executadaEm,
        ultimaFalha: falhas[0]?.execucaoErro
          ? {
              quando: falhas[0].decididoEm ?? falhas[0].criadoEm,
              motivo: falhas[0].execucaoErro,
            }
          : undefined,
      });
    });

    return {
      canais: leituras,
      recado: recadoSobreEnvio(leituras),
      /**
       * O portão, lido do ambiente. Repetido fora dos canais porque é UMA
       * chave para todos eles — e quem opera precisa ver a chave, não deduzi-la
       * de quatro linhas iguais.
       */
      envioExternoHabilitado: envioHabilitado,
      amostra: recentes.length,
    };
  },
});
