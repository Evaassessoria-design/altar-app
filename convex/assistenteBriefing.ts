import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/identity";
import { dataDoDia } from "./lib/dataDoDia";
import { carregarAtencao } from "./dashboard";
import { dinheiroVencido } from "./lib/dinheiroVencido";
import { resumirFollowUp } from "./lib/leadFollowUp";
import { resumirPanorama } from "./lib/panoramaDeCompras";
import {
  montarBriefing,
  type AreaDoBriefing,
  type FatosDoBriefing,
} from "./lib/assistente/briefing";

// ═════════════════════════════════════════════════════════════════════════════
// O BRIEFING DA MANHÃ
//
// ── O QUE MUDA AQUI ─────────────────────────────────────────────────────────
// O Assistente deixa de esperar a pergunta. Esta consulta lê as sete áreas,
// aplica as MESMAS regras que cada tela já aplica, e devolve o dia dela
// organizado por gravidade.
//
// ── NENHUMA REGRA NOVA ──────────────────────────────────────────────────────
// `dinheiroVencido`, `resumirFollowUp`, `resumirPanorama` e `carregarAtencao`
// são exatamente o que o Financeiro, o Funil, as Compras e o Dashboard usam.
// Reimplementar qualquer uma aqui criaria uma segunda versão da verdade, e
// duas versões divergem na primeira regra nova — com o briefing e a tela
// dizendo coisas diferentes sobre o mesmo dia.
//
// ── SEM CHAMADA DE IA ───────────────────────────────────────────────────────
// Consolidar dado que já está no banco não precisa de modelo. Precisa de
// leitura e de regra — as duas coisas que um modelo faz pior, mais devagar e
// cobrando por token. O Assistente continua usando IA onde ela ajuda: redigir
// e interpretar pedido em linguagem natural.
//
// Como é query e não action, ela também é REATIVA: paga o boleto às 9h e o
// "2 recebimentos vencidos" some da tela sem ninguém recarregar nada.
// ═════════════════════════════════════════════════════════════════════════════

/** Quantos eventos urgentes são NOMEADOS antes de virarem contagem. */
const EVENTOS_NOMEADOS = 3;

export const daManha = query({
  args: {
    /**
     * A hora local de quem abre, 0–23. Só decide a saudação.
     *
     * Vem do navegador porque o servidor não sabe o fuso dela — e chutar
     * Brasília faria o "Bom dia" aparecer às 22h para quem está em Portugal.
     * Ausente cai em 9, que produz "Bom dia": é a hora em que a tela é aberta
     * quando o dado não veio, e errar a saudação é o pior defeito possível
     * deste campo.
     */
    hora: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const hojeISO = dataDoDia();

    const [vencidos, leads, propostas, compras, atencao] = await Promise.all([
      // Filtro do BANCO: varrer o histórico financeiro inteiro — que cresce
      // para sempre — a cada abertura da tela é a consulta que só dói quando a
      // conta já está grande.
      ctx.db
        .query("transactions")
        .withIndex("by_user_pago_data", (q) =>
          q.eq("userId", user._id).eq("isPaid", false).lt("date", hojeISO),
        )
        .collect(),
      ctx.db.query("leads").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("proposals").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ctx.db
        .query("purchaseItems")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      carregarAtencao(ctx, user._id),
    ]);

    const dinheiro = dinheiroVencido(vencidos, hojeISO);
    const funil = resumirFollowUp(
      leads.map((l) => ({
        _id: l._id as string,
        clientName: l.clientName,
        stage: l.stage,
        nextAction: l.nextAction,
        lastInteraction: l.lastInteraction,
        _creationTime: l._creationTime,
      })),
      hojeISO,
    );
    const panorama = resumirPanorama(compras, hojeISO);

    const urgentes = atencao.filter((e) => e.nivel === "urgente");

    const fatos: FatosDoBriefing = {
      financeiro: {
        recebimentosVencidos: dinheiro.aReceber.quantidade,
        pagamentosVencidos: dinheiro.aPagar.quantidade,
        // `somaEmDinheiro` devolve número sempre; um valor ilegível gravado
        // antes das travas de `lib/dinheiro.ts` produziria `NaN`, e um total
        // `NaN` na tela é pior do que nenhum total.
        valorVencido: Number.isFinite(dinheiro.aReceber.total)
          ? dinheiro.aReceber.total
          : undefined,
      },
      comercial: {
        semProximaAcao: funil.semAcao.length,
        paradas: funil.parados.length,
        // Enviada e sem resposta. Rascunho não conta: ninguém está esperando
        // por uma proposta que nunca saiu.
        propostasAguardando: propostas.filter((p) => p.status === "enviada").length,
      },
      eventos: {
        urgentes: urgentes.slice(0, EVENTOS_NOMEADOS).map((e) => ({
          nome: e.nome,
          diasAte: e.diasAte,
          // O primeiro motivo, não todos: três motivos por evento viram um
          // parágrafo, e o briefing existe para caber numa olhada.
          motivo: e.motivos[0]?.texto ?? "pendências",
        })),
        // Os urgentes que não couberam entram aqui, para a contagem fechar com
        // o que existe em vez de com o que coube na tela.
        emAtencao:
          atencao.length - urgentes.length + Math.max(0, urgentes.length - EVENTOS_NOMEADOS),
      },
      compras: {
        atrasadas: panorama.atrasadas,
        aguardandoEntrega: panorama.aguardandoEntrega,
        foraDoCaixa: panorama.foraDoLivro,
      },
    };

    const briefing = montarBriefing(fatos, args.hora ?? 9);

    /**
     * Áreas que chegam ao briefing POR OUTRO CAMINHO.
     *
     * ── O DEFEITO QUE ISTO CORRIGE ──────────────────────────────────────
     * Fornecedores e acervo não têm resumo por dono como os outros: eles
     * entram pelos eventos que pedem atenção, que é onde importam. Como a
     * regra nunca recebe fatos deles, ela os declarava "não medidos" —
     * e a tela escrevia "Não consegui olhar: fornecedores, acervo" em TODA
     * conta, TODO dia.
     *
     * Uma linha de erro que aparece sempre não é aviso: é ruído, e ruído
     * ensina a ignorar a linha inteira — inclusive no dia em que ela
     * apontar uma área que de fato falhou.
     *
     * A separação é entre "não olhei" e "olhei por outro lugar". As duas
     * são verdade; só uma é problema.
     */
    const porOutroCaminho: AreaDoBriefing[] = ["fornecedores", "acervo"];

    return {
      ...briefing,
      areasNaoMedidas: briefing.areasNaoMedidas.filter(
        (a) => !porOutroCaminho.includes(a),
      ),
      areasPorOutroCaminho: porOutroCaminho,
      observacao: "Fornecedores e acervo aparecem dentro dos eventos que pedem atenção.",
    };
  },
});
