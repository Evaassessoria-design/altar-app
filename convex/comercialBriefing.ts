import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/adminGuard";
import { dataDoDia } from "./lib/dataDoDia";
import {
  campanhaPorSlug,
  diasAte,
  funilDaCampanha,
  situacaoDaCampanha,
} from "./lib/campanha";
import { proximaAcao } from "./lib/proximaAcao";
import { possiveisDuplicados } from "./lib/duplicidade";
import { montarBriefingComercial } from "./lib/escritorio/briefingComercial";

// ═════════════════════════════════════════════════════════════════════════════
// COMERCIAL — HOJE
//
// ── O QUE ESTA CONSULTA FAZ E O QUE ELA NÃO FAZ ─────────────────────────────
// Lê a campanha inteira uma vez, aplica as regras puras que já existem
// (`funilDaCampanha`, `proximaAcao`, `possiveisDuplicados`) e devolve o dia
// organizado.
//
// Não prepara rascunho, não move ninguém de etapa, não funde registro e não
// manda nada. É leitura — e é por isso que pode ser uma query reativa, que
// acerta sozinha quando alguém muda um estágio na outra aba.
//
// ── O TETO É DECLARADO ──────────────────────────────────────────────────────
// A varredura tem limite e a resposta DIZ quando bateu nele. Uma campanha que
// estoure o teto precisa avisar, não devolver números menores com cara de
// total — e a campanha existe justamente para crescer.
// ═════════════════════════════════════════════════════════════════════════════

/** Até onde a varredura vai antes de admitir que não viu tudo. */
export const VARREDURA_DO_BRIEFING = 2_000;

/** Quantas pessoas entram na fila humana antes de virar contagem. */
export const LIMITE_DA_FILA_HUMANA = 20;

export const hoje = query({
  args: { campanha: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const lidos = await ctx.db
      .query("landingLeads")
      .withIndex("by_campanha", (q) => q.eq("campanha", args.campanha))
      .take(VARREDURA_DO_BRIEFING + 1);

    const completa = lidos.length <= VARREDURA_DO_BRIEFING;
    const leads = lidos.slice(0, VARREDURA_DO_BRIEFING);

    const campanha = campanhaPorSlug(args.campanha);
    const hojeISO = dataDoDia();
    const agora = Date.now();
    const dias = campanha ? diasAte(campanha, hojeISO) : undefined;

    // ── OS RASCUNHOS, POR TIPO ──────────────────────────────────────────
    // Duas leituras por índice, não uma varredura filtrada em memória: o
    // índice `by_campanha_status` responde exatamente estas duas perguntas.
    const [rascunhos, aprovados] = await Promise.all([
      ctx.db
        .query("campaignDrafts")
        .withIndex("by_campanha_status", (q) =>
          q.eq("campanha", args.campanha).eq("status", "rascunho"),
        )
        .take(VARREDURA_DO_BRIEFING),
      ctx.db
        .query("campaignDrafts")
        .withIndex("by_campanha_status", (q) =>
          q.eq("campanha", args.campanha).eq("status", "aprovado"),
        )
        .take(VARREDURA_DO_BRIEFING),
    ]);

    const rascunhosPorTipo: Record<string, number> = {};
    for (const r of rascunhos) {
      rascunhosPorTipo[r.tipo] = (rascunhosPorTipo[r.tipo] ?? 0) + 1;
    }

    // ── A FILA HUMANA ───────────────────────────────────────────────────
    // `proximaAcao` é pura e recebe só o que foi lido em lote. Os fatos da
    // conta de teste (eventos criados, prazo) ficam de fora AQUI de propósito:
    // buscá-los exigiria uma leitura por pessoa vinculada, e a regra sabe
    // calar sobre o que não recebeu em vez de concluir "conta vazia".
    const pedidos = leads
      .map((lead) => {
        const convidadoEm = lead.marcosEm?.convidado;
        return {
          leadId: lead._id as string,
          pessoa: lead.empresa?.trim() || lead.name,
          acao: proximaAcao({
            status: lead.status,
            marcosEm: lead.marcosEm,
            temCanal: Boolean(lead.whatsapp?.trim() || lead.email?.trim()),
            diasDesdeOConvite:
              convidadoEm === undefined
                ? undefined
                : Math.floor((agora - convidadoEm) / 86_400_000),
            diasAteACampanha: dias,
          }),
        };
      })
      .filter((p) => p.acao.precisaDeHumano)
      .slice(0, LIMITE_DA_FILA_HUMANA);

    const duplicidades = possiveisDuplicados(
      leads.map((l) => ({
        _id: l._id as string,
        name: l.name,
        email: l.email,
        whatsappE164: l.whatsappE164,
        empresa: l.empresa,
      })),
    );

    return {
      ...montarBriefingComercial({
        campanha,
        situacao: campanha ? situacaoDaCampanha(campanha, hojeISO) : undefined,
        diasAte: dias,
        funil: funilDaCampanha(leads),
        rascunhosPorTipo,
        aprovadosAguardando: aprovados.length,
        pedidos,
        duplicidades,
      }),
      /** A varredura viu a campanha inteira? A tela precisa poder dizer. */
      completa,
      pessoasLidas: leads.length,
    };
  },
});
