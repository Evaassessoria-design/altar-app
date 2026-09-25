import { query } from "./_generated/server";
import { requireUser } from "./lib/identity";
import { prontidaoDaConta } from "./lib/prontidaoDaConta";

// ═════════════════════════════════════════════════════════════════════════════
// "MEU ALTAR ESTÁ PRONTO?"
//
// ── O CUSTO É CONSTANTE, E ISSO É O PONTO ───────────────────────────────────
// Esta consulta roda na primeira tela, toda vez que uma conta nova abre o
// sistema — e continua rodando meses depois, quando a conta tem quarenta
// eventos e mil fotos.
//
// Por isso NENHUMA leitura aqui é `collect()`. Todas têm teto, e o teto é o
// número que a REGRA precisa: o catálogo só precisa saber se passou de cinco,
// então lê seis. Contar mil para responder "passou de cinco?" é o tipo de
// consulta que só dói quando a cliente já está grande — que é exatamente
// quando ela não pode doer.
//
// ── O QUE É CONTADO COM TETO, É DECLARADO ───────────────────────────────────
// Quando a leitura bate no teto, o número vai para a tela como "5 ou mais", e
// nunca como "5". A regra da casa vale aqui como em todo lugar: a tela não
// afirma o que não contou.
// ═════════════════════════════════════════════════════════════════════════════

/** Quantos eventos são examinados para responder "tem projeto pronto?". */
const TETO_DE_EVENTOS = 50;

/**
 * Quantas fotos são lidas para decidir quais eventos abrem o Projeto Visual.
 *
 * Quatrocentas linhas pequenas. O suficiente para cobrir com folga uma conta
 * em onboarding — e esta pergunta só importa enquanto a conta está começando.
 */
const TETO_DE_FOTOS = 400;

/** Confortável é cinco; ler seis já responde "passou de cinco?". */
const TETO_DE_MATERIAIS = 6;
/** Confortável é três. */
const TETO_DE_FORNECEDORES = 4;

export const prontidao = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const [eventos, fotos, materiais, fornecedores, leads, propostas, lancamentos] =
      await Promise.all([
        ctx.db
          .query("events")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .take(TETO_DE_EVENTOS + 1),
        ctx.db
          .query("eventPhotos")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .take(TETO_DE_FOTOS),
        ctx.db
          .query("materials")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .take(TETO_DE_MATERIAIS),
        ctx.db
          .query("suppliers")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .take(TETO_DE_FORNECEDORES),
        // Destes três só importa "existe algum?". Ler um basta.
        ctx.db.query("leads").withIndex("by_user", (q) => q.eq("userId", user._id)).take(1),
        ctx.db.query("proposals").withIndex("by_user", (q) => q.eq("userId", user._id)).take(1),
        ctx.db
          .query("transactions")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .take(1),
      ]);

    // ── QUAIS EVENTOS ABREM O PROJETO VISUAL CHEIO ────────────────────────
    // O critério é DELIBERADAMENTE mais estreito do que o de
    // `prontidaoDoEvento.apresentavel`, que também cobra documento, fornecedor
    // e ficha técnica. Aqui a pergunta é sobre o ALTAR se pagar: o dado que
    // ela digitou virou um projeto bonito?
    //
    // Como é uma condição NECESSÁRIA daquele, as duas telas nunca se
    // contradizem: esta nunca diz "pronto" onde a do evento diz "faltando".
    const comFoto = new Map<string, { classificadas: number }>();
    for (const f of fotos) {
      const chave = f.eventId as string;
      const atual = comFoto.get(chave) ?? { classificadas: 0 };
      if (f.projectScope) atual.classificadas++;
      comFoto.set(chave, atual);
    }

    const examinados = eventos.slice(0, TETO_DE_EVENTOS);
    const comProjetoVisual = examinados.filter(
      (e) => !!e.coverPhotoId && (comFoto.get(e._id as string)?.classificadas ?? 0) > 0,
    ).length;

    const contar = (lista: readonly unknown[], teto: number) => ({
      valor: Math.min(lista.length, teto),
      aoMenos: lista.length >= teto,
    });

    return {
      ...prontidaoDaConta({
        studioName: user.studioName,
        temLogo: !!user.logoStorageId,
        eventos: Math.min(eventos.length, TETO_DE_EVENTOS),
        leads: leads.length,
        propostas: propostas.length,
        materiais: materiais.length,
        materiaisComFoto: materiais.filter((m) => !!m.fotoStorageId).length,
        fornecedoresNoCatalogo: fornecedores.length,
        lancamentos: lancamentos.length,
        eventosApresentaveis: comProjetoVisual,
        eventosExaminados: examinados.length,
      }),
      /**
       * Quais contagens bateram no teto.
       *
       * A tela usa isto para escrever "5 ou mais" em vez de "5". Sem o aviso,
       * uma conta com cinquenta flores leria "6 cadastrados" e concluiria que
       * o catálogo tinha sumido.
       */
      contagensLimitadas: {
        materiais: contar(materiais, TETO_DE_MATERIAIS).aoMenos,
        fornecedores: contar(fornecedores, TETO_DE_FORNECEDORES).aoMenos,
        eventos: eventos.length > TETO_DE_EVENTOS,
      },
    };
  },
});
