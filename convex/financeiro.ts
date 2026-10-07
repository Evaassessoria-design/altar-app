import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireUser } from "./lib/identity";
import { emCentavos, motivoDoValorInvalido, somaEmDinheiro } from "./lib/dinheiro";
import { dinheiroVencido } from "./lib/dinheiroVencido";
import { dataDoDiaNoFuso, faixaDoMes, fusoDoNegocio, ultimoDiaDoMes } from "./lib/dataDoDia";
import { requireActiveAccess } from "./lib/accessGuard";
import { safeDeleteFile } from "./lib/cascade";
import { limparCampos } from "./lib/limparCampos";
import { exigirArquivoGuardadoNoTeto } from "./lib/arquivoGuardado";
import {
  baixaDerivada,
  dataValida,
  deCentavos,
  paraCentavos,
  recebidoEmCentavos,
  saldoEmCentavos,
} from "./lib/pagamentosDoEvento";

const txType = v.union(v.literal("income"), v.literal("expense"));

/**
 * Teto de comprovantes por lançamento.
 *
 * Não é preocupação com o limite de 1 MiB da linha do Convex — dez anexos são
 * ~1,5 KB de metadado. É que um lançamento com trinta comprovantes é sinal de
 * que alguém está usando o campo para outra coisa, e a tela ficaria ilegível.
 */
export const LIMITE_DE_COMPROVANTES = 10;

/** Recusa o valor que não pode ser gravado, com o recado que a tela mostra. */
function exigirValor(valor: number) {
  const motivo = motivoDoValorInvalido(valor);
  if (motivo) throw new ConvexError({ code: "VALOR_INVALIDO", message: motivo });
}

/**
 * O teto do livro-caixa.
 *
 * ── O QUE ACONTECIA SEM ELE ─────────────────────────────────────────────────
 * `listTransactions` e `getSummary` faziam `.collect()` sobre TODO o histórico
 * da conta, a cada abertura da tela. `transactions` é a tabela que mais cresce
 * num produto assim — cada parcela de cada contrato, cada compra lançada, para
 * sempre. Passado o limite de documentos por consulta do Convex, a tela não
 * mostra um número errado: ela para de abrir.
 *
 * `propostas.ts` já tinha reconhecido exatamente este risco e escolhido este
 * desenho ("uma decoradora com cinco anos de ALTAR acumula centenas"). O
 * Financeiro era o único que não o tinha.
 *
 * ── E POR QUE A RESPOSTA DIZ QUE PAROU ──────────────────────────────────────
 * Porque um total financeiro cortado em silêncio é pior que nenhum total. A
 * resposta carrega `temMais`, e a tela escreve "500 lançamentos carregados (há
 * mais)" em vez de afirmar um saldo que ela não conferiu. Mesma regra de
 * `supplierCatalog.panorama`, que já diz quando não consegue somar.
 */
export const LIMITE_DO_LIVRO = 500;

export const listTransactions = query({
  args: {
    /**
     * "AAAA-MM": só os lançamentos com data (vencimento) neste mês — o atalho
     * da "Receita do Mês" do Dashboard. Na CONSULTA, e não na tela: filtrar os
     * 500 já carregados esconderia o mês que caiu fora do corte.
     */
    mes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const mes = args.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(args.mes) ? args.mes : undefined;
    const inicio = mes ? `${mes}-01` : undefined;
    const fim = inicio ? ultimoDiaDoMes(new Date(`${inicio}T12:00:00Z`)) : undefined;
    // Pelo índice de DATA e em ordem decrescente: os mais recentes são os que
    // a tela mostra primeiro, e assim o corte cai no passado distante em vez
    // de cair onde ela está olhando. Ordenar depois de `collect()` exigia ler
    // tudo para jogar fora quase tudo.
    const itens = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) =>
        inicio && fim
          ? q.eq("userId", user._id).gte("date", inicio).lte("date", fim)
          : q.eq("userId", user._id),
      )
      .order("desc")
      .take(LIMITE_DO_LIVRO + 1);

    const temMais = itens.length > LIMITE_DO_LIVRO;
    return {
      itens: temMais ? itens.slice(0, LIMITE_DO_LIVRO) : itens,
      temMais,
      // O Financeiro registra recebimento com a data de "hoje" — a do NEGÓCIO,
      // a mesma da aba Pagamentos da cliente (ver lib/dataDoDia.ts).
      fuso: fusoDoNegocio(user.timezone),
      mes: mes ?? null,
    };
  },
});

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    // MESMO teto e MESMA ordem da lista, de propósito: se o resumo somasse um
    // conjunto e a lista mostrasse outro, os dois números da mesma tela
    // discordariam e ninguém saberia qual acreditar.
    const lidos = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(LIMITE_DO_LIVRO + 1);
    const incompleto = lidos.length > LIMITE_DO_LIVRO;
    const txs = incompleto ? lidos.slice(0, LIMITE_DO_LIVRO) : lidos;

    // `somaEmDinheiro` em vez de `reduce` cru por dois motivos: a sobra de
    // ponto flutuante (0.1 + 0.2), e o lançamento antigo que já esteja com
    // `NaN` gravado — ele estragaria TODAS as somas desta tela, e não só a
    // própria linha. Ver lib/dinheiro.ts.
    const soma = (filtro: (t: (typeof txs)[number]) => boolean) =>
      somaEmDinheiro(txs.filter(filtro).map((t) => t.amount));

    // Receita pelo que ENTROU e pelo que FALTA de cada parcela. Com
    // recebimento parcial, "isPaid ? valor : 0" contava R$ 2.000 recebidos de
    // uma parcela de R$ 5.000 como nada recebido e R$ 5.000 a receber. Para a
    // parcela sem recebimentos, o resultado é exatamente o de antes.
    const receitas = txs.filter((t) => t.type === "income");
    const totalIncome = deCentavos(receitas.reduce((s, t) => s + recebidoEmCentavos(t), 0));
    const totalExpense = soma((t) => t.type === "expense" && t.isPaid);
    const pendingIncome = deCentavos(receitas.reduce((s, t) => s + saldoEmCentavos(t), 0));

    // Últimos 6 meses (só o que foi pago).
    //
    // O "mês atual" sai do dia no fuso do NEGÓCIO, como o vencido do
    // Dashboard e a aba Pagamentos da cliente. Pelo relógio do servidor
    // (UTC), no último dia do mês, a partir das 21h de Brasília, o gráfico já
    // mostrava o mês seguinte como o atual. O meio-dia do dia de negócio é a
    // âncora: longe das duas viradas, o mês dele é o mês certo.
    const hojeNoNegocio = dataDoDiaNoFuso(new Date(), user.timezone);
    const ancora = new Date(`${hojeNoNegocio}T12:00:00Z`);
    const months: { label: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const { inicio: start, fim: end, rotulo: label } = faixaDoMes(-i, ancora);
      const inMonth = txs.filter((t) => t.isPaid && t.date >= start && t.date <= end);
      months.push({
        label,
        income: somaEmDinheiro(
          inMonth.filter((t) => t.type === "income").map((t) => t.amount),
        ),
        expense: somaEmDinheiro(
          inMonth.filter((t) => t.type === "expense").map((t) => t.amount),
        ),
      });
    }

    return {
      totalIncome,
      totalExpense,
      profit: emCentavos(totalIncome - totalExpense),
      pendingIncome,
      months,
      /**
       * Os totais consideram só os lançamentos lidos?
       *
       * A tela PRECISA dizer isso. Um saldo apresentado como total da empresa,
       * calculado sobre parte do livro, é a mentira mais cara que esta tela
       * pode contar. Os seis meses continuam corretos em qualquer caso: eles
       * são recentes, e o corte é no passado distante.
       */
      incompleto,
      limite: LIMITE_DO_LIVRO,
    };
  },
});

/**
 * O que venceu e não foi liquidado — para o painel da manhã.
 *
 * Separada de `getSummary` de propósito: aquele resumo alimenta a TELA do
 * Financeiro e carrega seis meses de histórico; esta responde a uma pergunta
 * só, e é lida no Dashboard toda vez que ele abre.
 *
 * As regras vivem em lib/dinheiroVencido.ts, puras e testadas.
 */
export const getVencidos = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    // "Hoje" no fuso do NEGÓCIO (Configurações; padrão America/Sao_Paulo).
    // Em UTC, a parcela que vence hoje aparecia vencida a partir das 21h de
    // Brasília — e a aba Pagamentos da cliente dizia outra coisa.
    const hoje = dataDoDiaNoFuso(new Date(), user.timezone);
    // O filtro é do BANCO, não da memória: varrer todo o histórico financeiro
    // — que cresce para sempre — a cada abertura do Dashboard, para achar um
    // punhado de linhas em aberto, é o tipo de consulta que só dói quando a
    // cliente já está grande. O índice lê o que está em aberto e vencido.
    //
    // A regra continua sendo de `lib/dinheiroVencido.ts`: ela refiltra o que
    // recebe, então a consulta pode estreitar sem virar a fonte da verdade.
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user_pago_data", (q) =>
        q.eq("userId", user._id).eq("isPaid", false).lt("date", hoje),
      )
      .collect();
    return dinheiroVencido(txs, hoje);
  },
});

export const addTransaction = mutation({
  args: {
    type: txType,
    category: v.string(),
    description: v.string(),
    amount: v.number(),
    date: v.string(),
    isPaid: v.boolean(),
    notes: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    /** Quando o dinheiro entrou/saiu — só faz sentido com `isPaid`. */
    paidAt: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    /**
     * Arquivo já enviado ao storage. Com `isPaid` é o comprovante; sem, é um
     * documento do lançamento — e em nenhum caso dá baixa.
     */
    anexo: v.optional(
      v.object({
        storageId: v.id("_storage"),
        filename: v.string(),
        contentType: v.optional(v.string()),
      }),
    ),
    /** Chave do formulário: o mesmo envio repetido não cria dois lançamentos. */
    chave: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // `eventId` é opcional (lançamento avulso). Quando vier, tem que ser de um
    // evento do próprio usuário.
    const user = args.eventId
      ? (await requireEventOwner(ctx, args.eventId)).user
      : await requireUser(ctx);
    // A tela manda `parseFloat(campo)`, e `parseFloat` devolve `NaN` para
    // qualquer coisa que não comece com número. Um `NaN` gravado aqui não
    // estraga a própria linha: estraga toda soma do Financeiro, para sempre.
    exigirValor(args.amount);

    // ── O MESMO ENVIO DE NOVO ─────────────────────────────────────────────
    // Resposta perdida, toque duplo: o formulário reenvia com a MESMA chave e
    // recebe o lançamento que já foi criado. Os recentes bastam — a repetição
    // acontece em segundos, não meses depois.
    const chave = args.chave?.trim() || undefined;
    if (chave) {
      const recentes = await ctx.db
        .query("transactions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(50);
      const ja = recentes.find((t) => t.chaveDoPlanejamento === chave);
      if (ja) return ja._id;
    }

    if (args.paidAt !== undefined && !dataValida(args.paidAt)) {
      recusar("DATA_INVALIDA", "Informe a data em que o pagamento aconteceu.");
    }
    const comprovantes = args.anexo
      ? [await comprovanteValidado(ctx, args.anexo)]
      : undefined;
    const { anexo: _anexo, chave: _chave, paidAt, paymentMethod, ...campos } = args;
    const forma = paymentMethod?.trim() || undefined;

    // ── RECEITA DE EVENTO "JÁ RECEBIDA" VIRA UM RECEBIMENTO ───────────────
    // Receita de evento só se baixa por recebimento (ver `exigirBaixaPorRecebimento`).
    // Marcar "já recebido" no cadastro não pode ser a porta lateral: o valor
    // entra como um recebimento de verdade, com data, forma e o comprovante
    // ligado a ele — e o histórico da aba Pagamentos da cliente o mostra.
    if (args.type === "income" && args.eventId && args.isPaid) {
      const valor = emCentavos(args.amount);
      if (valor <= 0) recusar("VALOR_INVALIDO", "O valor recebido precisa ser maior que zero.");
      const recebimento = {
        id: crypto.randomUUID(),
        valor,
        data: (paidAt ?? args.date).slice(0, 10),
        forma,
        comprovanteStorageId: args.anexo?.storageId,
        registradoEm: new Date().toISOString(),
        chave: chave ?? crypto.randomUUID(),
      };
      if (!dataValida(recebimento.data)) recusar("DATA_INVALIDA", "Informe a data em que o dinheiro entrou.");
      const baixa = baixaDerivada({ amount: valor, isPaid: false, recebimentos: [recebimento] });
      return ctx.db.insert("transactions", {
        userId: user._id,
        ...campos,
        amount: valor,
        isPaid: baixa.isPaid,
        paidAt: baixa.paidAt,
        paymentMethod: forma,
        recebimentos: [recebimento],
        comprovantes,
        chaveDoPlanejamento: chave,
      });
    }

    return ctx.db.insert("transactions", {
      userId: user._id,
      ...campos,
      amount: emCentavos(args.amount),
      // Data e forma só valem para o que JÁ foi pago: num pendente seriam a
      // tela afirmando um pagamento que não aconteceu.
      paidAt: args.isPaid ? paidAt?.slice(0, 10) : undefined,
      paymentMethod: args.isPaid ? forma : undefined,
      comprovantes,
      chaveDoPlanejamento: chave,
    });
  },
});

export const updateTransaction = mutation({
  args: {
    id: v.id("transactions"),
    type: v.optional(txType),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    date: v.optional(v.string()),
    isPaid: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    const { id, ...fields } = args;
    if (fields.amount !== undefined) {
      exigirValor(fields.amount);
      fields.amount = emCentavos(fields.amount);
    }
    // Com recebimentos, `isPaid` é derivado deles — não se marca à mão. E o
    // valor não desce abaixo do que já entrou: a parcela ficaria "recebida a
    // mais", um número que o histórico não explica.
    const comRecebimentos = (tx.recebimentos?.length ?? 0) > 0;
    if (fields.isPaid === true && !tx.isPaid) exigirBaixaPorRecebimento(tx);
    if (comRecebimentos) {
      if (fields.isPaid !== undefined && fields.isPaid !== tx.isPaid) {
        exigirSemRecebimentos(tx, "marcar como pago");
      }
      if (fields.amount !== undefined && paraCentavos(fields.amount) < recebidoEmCentavos(tx)) {
        recusar("ABAIXO_DO_RECEBIDO", "O valor não pode ficar menor do que já foi recebido nesta parcela.");
      }
    }
    // Mudou o valor de uma parcela com recebimentos: a baixa acompanha (subiu
    // e deixou de estar quitada, ou desceu até o que já entrou).
    const baixa =
      comRecebimentos && fields.amount !== undefined
        ? baixaDerivada({ ...tx, amount: fields.amount })
        : null;
    await ctx.db.patch(id, baixa ? { ...fields, isPaid: baixa.isPaid, paidAt: baixa.paidAt } : fields);
  },
});

export const togglePaid = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    exigirSemRecebimentos(tx, "marcar ou desmarcar como pago");
    if (!tx.isPaid) exigirBaixaPorRecebimento(tx);
    await ctx.db.patch(args.id, { isPaid: !tx.isPaid });
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// FECHAMENTO DO RECEBIMENTO E COMPROVANTES
//
// ── O PEDIDO ────────────────────────────────────────────────────────────────
// "Precisamos de um espaço para colocar os comprovantes no financeiro dos
// noivos." Quem pediu recebe em parcelas e precisa provar, meses depois, que
// a terceira entrou — para a cliente, para o contador, para si mesma.
//
// ── O QUE ISTO NÃO É ────────────────────────────────────────────────────────
// Não existe tabela de parcelas no ALTAR, e esta rodada não cria uma. Cada
// parcela JÁ É uma linha de `transactions` com `category: "Contrato"` —
// `createReceivablesFromContract` as cria assim desde a leitura do contrato
// por IA. Comprovante é um campo a mais na linha que já existe.
//
// ── A SEPARAÇÃO QUE NÃO PODE BORRAR ─────────────────────────────────────────
// ANEXAR COMPROVANTE NÃO MARCA COMO PAGO. São mutations diferentes porque são
// decisões diferentes: o comprovante é EVIDÊNCIA, o `isPaid` é a decisão dela.
// Acoplar as duas faria um anexo errado virar uma baixa errada — e baixa
// errada é dinheiro que o sistema afirma ter entrado.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O lançamento é meu?
 *
 * `NOT_FOUND`, nunca `FORBIDDEN`: lançamento de outra conta não existe, e a
 * resposta não pode revelar que existe. É o padrão do repositório inteiro.
 *
 * Recebe o `user` já resolvido em vez de chamar `requireUser` aqui dentro: a
 * trava de `tenant.isolation.test.ts` lê o CORPO de cada função pública
 * procurando o nome do guarda, e guarda escondido dentro de helper não é
 * auditável de fora. O teste estava certo — esta forma é a que ele pede.
 */
async function meuLancamento(
  ctx: MutationCtx,
  user: { _id: Id<"users"> },
  id: Id<"transactions">,
) {
  const tx = await ctx.db.get(id);
  if (!tx || tx.userId !== user._id) {
    throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
  }
  return tx;
}

/**
 * Autorização de upload de comprovante.
 *
 * Exige ACESSO ATIVO, como todo upload do ALTAR (`lib/accessGuard.ts`):
 * storage é cobrado, e conta bloqueada não sobe arquivo novo. Ler e baixar o
 * que já existe continua liberado — é o caminho de volta.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireActiveAccess(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * O fechamento do recebimento: quando entrou, como entrou, e a observação.
 *
 * Separada de `updateTransaction` porque responde outra pergunta — aquela
 * edita o lançamento (valor, vencimento, categoria), esta registra o que
 * aconteceu com o dinheiro. `null` limpa, pela convenção de `limparCampos`.
 *
 * `isPaid` é opcional aqui: dá para anotar a forma de pagamento sem dar baixa,
 * e dá para dar baixa sem informar mais nada.
 */
export const registrarPagamento = mutation({
  args: {
    id: v.id("transactions"),
    isPaid: v.optional(v.boolean()),
    paidAt: v.optional(v.union(v.string(), v.null())),
    paymentMethod: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await meuLancamento(ctx, user, args.id);
    if (args.isPaid !== undefined || args.paidAt !== undefined) {
      exigirSemRecebimentos(tx, "mudar a baixa");
    }
    if (args.isPaid === true && !tx.isPaid) exigirBaixaPorRecebimento(tx);
    const { id, ...campos } = args;
    const limpo = limparCampos({
      ...campos,
      paidAt: typeof campos.paidAt === "string" ? campos.paidAt.trim() || null : campos.paidAt,
      paymentMethod:
        typeof campos.paymentMethod === "string"
          ? campos.paymentMethod.trim() || null
          : campos.paymentMethod,
      notes: typeof campos.notes === "string" ? campos.notes.trim() || null : campos.notes,
    });
    await ctx.db.patch(id, limpo);
  },
});

/**
 * Anexa um comprovante. NÃO toca em `isPaid` — ver o cabeçalho acima.
 *
 * O arquivo já está no storage quando chega aqui; o que esta mutation faz é
 * DIZER que ele pertence a este lançamento. Um `storageId` vindo do navegador
 * não prova posse de nada (o Convex não escopa storage por conta), e é por
 * isso que a única proteção real é esta: só o dono do lançamento grava nele, e
 * o comprovante não tem id próprio que alguém pudesse endereçar de fora.
 */
export const anexarComprovante = mutation({
  args: {
    id: v.id("transactions"),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await meuLancamento(ctx, user, args.id);

    const atuais = tx.comprovantes ?? [];
    // Mesmo arquivo anexado duas vezes (toque repetido, reenvio) não vira duas
    // linhas na lista.
    if (atuais.some((c) => c.storageId === args.storageId)) {
      return { total: atuais.length };
    }
    if (atuais.length >= LIMITE_DE_COMPROVANTES) {
      throw new ConvexError({
        code: "LIMITE",
        message: `Um lançamento aceita até ${LIMITE_DE_COMPROVANTES} comprovantes.`,
      });
    }
    // A tela usa o teto de documento; sem esta linha, o servidor aceitava
    // qualquer tamanho e o teto existia só para quem passasse pela tela.
    await exigirArquivoGuardadoNoTeto(ctx, args.storageId);

    await ctx.db.patch(args.id, {
      comprovantes: [
        ...atuais,
        {
          storageId: args.storageId,
          filename: args.filename.trim() || "comprovante",
          contentType: args.contentType?.trim() || undefined,
          uploadedAt: new Date().toISOString(),
        },
      ],
    });
    return { total: atuais.length + 1 };
  },
});

/**
 * Remove UM comprovante, pelo arquivo.
 *
 * O arquivo sai com `safeDeleteFile`: o Convex LANÇA ao apagar arquivo
 * inexistente, e uma mutation que lança aborta inteira — o comprovante
 * continuaria listado, apontando para nada, e sem jeito de tirar da lista.
 * É o mesmo defeito que a auditoria do pipeline de arquivos fechou.
 */
export const removerComprovante = mutation({
  args: { id: v.id("transactions"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await meuLancamento(ctx, user, args.id);
    const atuais = tx.comprovantes ?? [];
    // Só apaga o arquivo se ele for DESTE lançamento. Sem esta conferência,
    // um storageId qualquer vindo do navegador viraria uma exclusão de arquivo
    // — inclusive de arquivo que não é dela.
    if (!atuais.some((c) => c.storageId === args.storageId)) {
      throw new ConvexError({ message: "Comprovante não encontrado", code: "NOT_FOUND" });
    }

    await safeDeleteFile(ctx, args.storageId);
    await ctx.db.patch(args.id, {
      comprovantes: atuais.filter((c) => c.storageId !== args.storageId),
    });
  },
});

/**
 * Os comprovantes de UM lançamento, com URL para abrir e baixar.
 *
 * Query separada, e não campo da listagem: resolver URL de todo comprovante de
 * toda linha do Financeiro seria uma chamada de storage por anexo em cada
 * abertura da tela. A LISTA só precisa saber QUANTOS existem, e isso já está
 * na própria linha.
 */
export const comprovantesDoLancamento = query({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    // Degrada para vazio: listagem não lança, é o padrão do Bloco 0.
    if (!tx || tx.userId !== user._id) return [];

    return Promise.all(
      (tx.comprovantes ?? []).map(async (c) => ({
        ...c,
        url: await ctx.storage.getUrl(c.storageId),
      })),
    );
  },
});

export const deleteTransaction = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id)
      throw new ConvexError({ message: "Lançamento não encontrado", code: "NOT_FOUND" });
    // Parcela com recebimentos é histórico financeiro: excluí-la apagaria em
    // silêncio o registro do dinheiro que entrou — inclusive o anulado, que é
    // a trilha da correção.
    if ((tx.recebimentos?.length ?? 0) > 0) {
      recusar(
        "TEM_RECEBIMENTOS",
        "Esta parcela tem recebimentos registrados e não pode ser excluída. Anule o recebimento errado e ajuste o valor.",
      );
    }

    // ── O VÍNCULO NÃO PODE APONTAR PARA O VAZIO ─────────────────────────────
    // Uma compra pode ter gerado este lançamento (`purchaseItems.transactionId`).
    // Apagando só a linha daqui, a compra continuava "lançada" para todos os
    // efeitos — e como `custoDoEvento` só olhava a EXISTÊNCIA do vínculo, o
    // custo sumia do livro e a margem saía afirmada, com confiança, sobre um
    // custo menor do que o real.
    //
    // A compra NÃO é apagada: a decisão de apagar a despesa é do Financeiro,
    // a compra continua sendo trabalho a fazer. Ela só volta a contar como
    // "fora do financeiro", que é a verdade.
    const vinculadas = await ctx.db
      .query("purchaseItems")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.id))
      .collect();
    for (const compra of vinculadas) {
      if (compra.userId !== user._id) continue;
      await ctx.db.patch(compra._id, { transactionId: undefined });
    }

    // Os comprovantes são arquivos DESTE lançamento e não sobrevivem a ele:
    // deixá-los seria storage órfão cobrado para sempre. `safeDeleteFile`
    // porque arquivo que já sumiu não pode impedir a exclusão da linha.
    for (const c of tx.comprovantes ?? []) await safeDeleteFile(ctx, c.storageId);

    await ctx.db.delete(args.id);
    return { vinculosLimpos: vinculadas.length };
  },
});

// ── Contrato → contas a receber ──────────────────────────────────────────────
// Estrutura para abastecer o financeiro a partir do contrato: recebe as parcelas
// JÁ CONFIRMADAS pela decoradora e cria lançamentos de receita (isPaid=false).
// Reutiliza a tabela `transactions` existente — sem estrutura financeira nova.
// NÃO é chamado por IA automaticamente: só após confirmação explícita na UI.
export const createReceivablesFromContract = mutation({
  args: {
    eventId: v.id("events"),
    entries: v.array(
      v.object({
        description: v.string(),
        amount: v.number(),
        date: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    // Dedup: se já existem contas a receber do Contrato neste evento, não recria.
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const alreadyHasContract = existing.some(
      (t) => t.type === "income" && t.category === "Contrato",
    );
    if (alreadyHasContract) {
      return { created: 0, alreadyExists: true };
    }
    // Confere TODAS as parcelas antes de gravar a primeira: metade das contas
    // a receber criadas e a outra metade recusada deixaria o evento num estado
    // que ninguém pediu, e a dedup acima impediria a segunda tentativa.
    for (const e of args.entries) exigirValor(e.amount);

    let created = 0;
    for (const e of args.entries) {
      await ctx.db.insert("transactions", {
        userId: user._id,
        eventId: args.eventId,
        type: "income",
        category: "Contrato",
        description: e.description,
        amount: emCentavos(e.amount),
        date: e.date,
        isPaid: false,
      });
      created++;
    }
    return { created, alreadyExists: false };
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// PAGAMENTOS DO CLIENTE, NA PÁGINA DO EVENTO
//
// Tudo aqui opera nas MESMAS parcelas de sempre (receitas do evento em
// `transactions`). A regra — centavos, estados, atraso, baixa derivada — mora
// em `lib/pagamentosDoEvento.ts`, que a tela também usa.
//
// ── O QUE NUNCA ACONTECE AQUI ───────────────────────────────────────────────
// · Nenhum dinheiro se move: registrar recebimento é anotar o que entrou.
// · Nada se apaga do histórico: corrigir é ANULAR com motivo.
// · Planejar não recria nem altera parcela existente — só acrescenta.
// · Comprovante sozinho não dá baixa (mesma regra de `anexarComprovante`).
// ═════════════════════════════════════════════════════════════════════════════

/** Motivo de anulação: obrigatório e curto o bastante para caber na linha. */
const MOTIVO_MAXIMO = 500;

/** A recusa com o recado da tela. */
function recusar(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/**
 * A parcela tem recebimentos registrados? Então `isPaid` é derivado, e as
 * mutations de antes (baixa manual, edição de valor) não podem mexer nele
 * por fora — o número da tela deixaria de bater com o histórico.
 */
function exigirSemRecebimentos(tx: { recebimentos?: readonly unknown[] }, acao: string) {
  if ((tx.recebimentos?.length ?? 0) > 0) {
    recusar(
      "TEM_RECEBIMENTOS",
      `Esta parcela tem recebimentos registrados, então não dá para ${acao} por aqui. ` +
        `Use "Registrar recebimento" ou anule o recebimento errado na página do evento.`,
    );
  }
}

/**
 * Receita de EVENTO só se dá baixa por recebimento.
 *
 * Sem isto, "Já recebido", a baixa rápida e a edição marcavam a parcela como
 * paga sem nenhum recebimento: o dinheiro aparecia como entrado, a aba
 * Pagamentos da cliente não tinha histórico para mostrar, e não havia o que
 * anular se estivesse errado. Desmarcar uma baixa ANTIGA (sem recebimentos)
 * continua livre — é a correção de um dado legado, não um atalho.
 *
 * Despesa e receita avulsa (sem evento) seguem como sempre.
 */
function exigirBaixaPorRecebimento(tx: { type: string; eventId?: unknown }) {
  if (tx.type === "income" && tx.eventId) {
    recusar(
      "USE_RECEBIMENTO",
      'Receita de evento é baixada por "Registrar recebimento", que guarda data, forma e ' +
        "comprovante no histórico. Use essa opção no Financeiro ou na aba Pagamentos da cliente.",
    );
  }
}

/** Confere o arquivo no storage (existe, cabe no teto) e monta o comprovante. */
async function comprovanteValidado(
  ctx: MutationCtx,
  c: { storageId: Id<"_storage">; filename: string; contentType?: string },
) {
  await exigirArquivoGuardadoNoTeto(ctx, c.storageId);
  return {
    storageId: c.storageId,
    filename: c.filename.trim() || "comprovante",
    contentType: c.contentType?.trim() || undefined,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Comprovante para um recebimento JÁ registrado — sem registrar o dinheiro
 * de novo.
 *
 * Valor, data, saldo e baixa não mudam: só o arquivo entra na lista da
 * parcela e, se o recebimento ainda não tinha comprovante, passa a apontar
 * para este. Recebimento anulado não recebe comprovante — ele não conta mais.
 */
export const anexarComprovanteAoRecebimento = mutation({
  args: {
    id: v.id("transactions"),
    recebimentoId: v.string(),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await meuLancamento(ctx, user, args.id);
    const recebimentos = tx.recebimentos ?? [];
    const alvo = recebimentos.find((r) => r.id === args.recebimentoId);
    if (!alvo) recusar("NOT_FOUND", "Recebimento não encontrado");
    if (alvo.anulacao) recusar("ANULADO", "Este recebimento foi anulado e não recebe comprovante.");

    const atuais = tx.comprovantes ?? [];
    const jaNaLista = atuais.some((c) => c.storageId === args.storageId);
    if (!jaNaLista && atuais.length >= LIMITE_DE_COMPROVANTES) {
      recusar("LIMITE", `Um lançamento aceita até ${LIMITE_DE_COMPROVANTES} comprovantes.`);
    }
    const comprovantes = jaNaLista
      ? atuais
      : [...atuais, await comprovanteValidado(ctx, args)];
    await ctx.db.patch(args.id, {
      comprovantes,
      recebimentos: recebimentos.map((r) =>
        r.id === alvo.id && !r.comprovanteStorageId ? { ...r, comprovanteStorageId: args.storageId } : r,
      ),
    });
    return { total: comprovantes.length };
  },
});

/**
 * Os pagamentos do cliente de UM evento: o valor contratado e as parcelas.
 *
 * Degrada para `null` — evento de outra conta não existe (padrão de
 * `getOwnedEvent`). Os números (recebido, saldo, atraso) a tela calcula com
 * `lib/pagamentosDoEvento.ts` e o "hoje" do aparelho dela.
 */
export const pagamentosDoEvento = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return null;
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const parcelas = txs
      // O dono é conferido de novo na linha: o índice é por evento, e o
      // evento já é dela — mas é a linha que vai para a tela.
      .filter((t) => t.type === "income" && t.userId === event.userId)
      .sort((a, b) => a.date.localeCompare(b.date) || a._creationTime - b._creationTime)
      .map((t) => ({
        _id: t._id,
        description: t.description,
        category: t.category,
        amount: t.amount,
        date: t.date,
        isPaid: t.isPaid,
        paidAt: t.paidAt,
        paymentMethod: t.paymentMethod,
        recebimentos: t.recebimentos ?? [],
        comprovantes: (t.comprovantes ?? []).length,
      }));
    // O fuso vai para a tela, e não o "hoje" pronto: uma query do Convex não
    // é reavaliada quando o relógio vira a meia-noite, só quando o dado muda.
    // A tela calcula o dia com este fuso a cada desenho.
    const dona = await ctx.db.get(event.userId);
    return {
      valorContratado: event.contractedValue ?? null,
      orcamentoEstimado: event.budget ?? null,
      fuso: fusoDoNegocio(dona?.timezone),
      parcelas,
    };
  },
});

/** Define ou limpa (`null`) o valor contratado do evento. */
export const definirValorContratado = mutation({
  args: { eventId: v.id("events"), valor: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    await requireEventOwner(ctx, args.eventId);
    if (args.valor === null) {
      await ctx.db.patch(args.eventId, { contractedValue: undefined });
      return;
    }
    exigirValor(args.valor);
    if (args.valor <= 0) recusar("VALOR_INVALIDO", "O valor contratado precisa ser maior que zero.");
    await ctx.db.patch(args.eventId, { contractedValue: emCentavos(args.valor) });
  },
});

/**
 * Acrescenta as parcelas da prévia. NÃO toca nas que já existem.
 *
 * `chave` é gerada pela tela ao abrir o planejamento: o mesmo envio repetido
 * (clique duplo, rede que reenvia) encontra as parcelas que já criou e não
 * cria de novo.
 */
export const adicionarParcelas = mutation({
  args: {
    eventId: v.id("events"),
    chave: v.string(),
    parcelas: v.array(v.object({ descricao: v.string(), valor: v.number(), vencimento: v.string() })),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    const chave = args.chave.trim();
    if (!chave) recusar("INVALIDO", "Planejamento sem identificação. Recarregue a página.");
    if (args.parcelas.length === 0) recusar("INVALIDO", "Nenhuma parcela para criar.");
    if (args.parcelas.length > 60) recusar("INVALIDO", "No máximo 60 parcelas de uma vez.");

    const existentes = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (existentes.some((t) => t.chaveDoPlanejamento === chave)) return { criadas: 0, repetido: true };
    // O MESMO planejamento salvo de novo por outro formulário (abriu de novo
    // e confirmou a mesma prévia): a parcela pedida que já existe neste
    // evento — mesma descrição, valor e vencimento — não é criada outra vez.
    // Se TODAS já existem, nada é criado e a resposta diz que foi repetição.
    const assinatura = (d: string, valor: number, venc: string) =>
      `${d.trim() || "Parcela"}|${paraCentavos(emCentavos(valor))}|${venc.slice(0, 10)}`;
    const jaExistem = new Set(
      existentes
        .filter((t) => t.type === "income")
        .map((t) => assinatura(t.description, t.amount, t.date)),
    );
    const novas = args.parcelas.filter((p) => !jaExistem.has(assinatura(p.descricao, p.valor, p.vencimento)));
    if (novas.length === 0) return { criadas: 0, repetido: true };

    // Confere TODAS antes de gravar a primeira: metade criada e metade
    // recusada deixaria um parcelamento que ninguém pediu.
    for (const p of args.parcelas) {
      exigirValor(p.valor);
      if (p.valor <= 0) recusar("VALOR_INVALIDO", "Toda parcela precisa ter valor maior que zero.");
      if (!dataValida(p.vencimento)) recusar("DATA_INVALIDA", `Vencimento inválido: "${p.vencimento}".`);
    }
    for (const p of novas) {
      await ctx.db.insert("transactions", {
        userId: user._id,
        eventId: args.eventId,
        type: "income",
        category: "Contrato",
        description: p.descricao.trim() || "Parcela",
        amount: emCentavos(p.valor),
        date: p.vencimento.slice(0, 10),
        isPaid: false,
        chaveDoPlanejamento: chave,
      });
    }
    return { criadas: novas.length, repetido: false, ignoradas: args.parcelas.length - novas.length };
  },
});

/**
 * Registra dinheiro que ENTROU numa parcela — parcial ou total.
 *
 * Recusa valor inválido, data inválida, parcela de despesa e valor acima do
 * saldo. Acima do saldo não vira "crédito" nem "troco" — e também não é
 * motivo para aumentar a parcela: ela só muda quando o acordo muda.
 *
 * O comprovante é opcional e entra na MESMA lista de `anexarComprovante`.
 */
export const registrarRecebimento = mutation({
  args: {
    id: v.id("transactions"),
    chave: v.string(),
    valor: v.number(),
    data: v.string(),
    forma: v.optional(v.string()),
    comprovante: v.optional(
      v.object({
        storageId: v.id("_storage"),
        filename: v.string(),
        contentType: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await meuLancamento(ctx, user, args.id);
    if (tx.type !== "income") recusar("INVALIDO", "Recebimento só se registra em receita.");

    const chave = args.chave.trim();
    if (!chave) recusar("INVALIDO", "Envio sem identificação. Recarregue a página.");
    const recebimentos = tx.recebimentos ?? [];
    // O MESMO envio de novo: devolve o que já foi gravado, sem duplicar.
    const repetido = recebimentos.find((r) => r.chave === chave);
    if (repetido) return { id: repetido.id, repetido: true };

    exigirValor(args.valor);
    if (args.valor <= 0) recusar("VALOR_INVALIDO", "O valor recebido precisa ser maior que zero.");
    if (!dataValida(args.data)) recusar("DATA_INVALIDA", "Informe a data em que o dinheiro entrou.");

    const valorCentavos = paraCentavos(emCentavos(args.valor));
    const saldo = saldoEmCentavos(tx);
    if (saldo === 0) recusar("SEM_SALDO", "Esta parcela já está toda recebida.");
    // Acima do saldo é recusado — e a mensagem NÃO manda mexer na parcela:
    // aumentar a parcela só para caber um pagamento maior faria o sistema
    // afirmar um acordo que não existiu. Parcela e contratado mudam quando o
    // acordo muda.
    if (valorCentavos > saldo) {
      const saldoEmReais = deCentavos(saldo).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      recusar("ACIMA_DO_SALDO", `O valor passa do saldo desta parcela (${saldoEmReais}). Registre no máximo o saldo. Pagamento acima do combinado não é registrado aqui; o valor da parcela e o contratado só mudam quando o acordo com a cliente mudar de fato.`);
    }

    let comprovantes = tx.comprovantes ?? [];
    if (args.comprovante) {
      const c = args.comprovante;
      if (!comprovantes.some((x) => x.storageId === c.storageId)) {
        if (comprovantes.length >= LIMITE_DE_COMPROVANTES) {
          recusar("LIMITE", `Um lançamento aceita até ${LIMITE_DE_COMPROVANTES} comprovantes.`);
        }
        await exigirArquivoGuardadoNoTeto(ctx, c.storageId);
        comprovantes = [
          ...comprovantes,
          {
            storageId: c.storageId,
            filename: c.filename.trim() || "comprovante",
            contentType: c.contentType?.trim() || undefined,
            uploadedAt: new Date().toISOString(),
          },
        ];
      }
    }

    const novo = {
      id: crypto.randomUUID(),
      valor: emCentavos(args.valor),
      data: args.data.slice(0, 10),
      forma: args.forma?.trim() || undefined,
      comprovanteStorageId: args.comprovante?.storageId,
      registradoEm: new Date().toISOString(),
      chave,
    };
    const lista = [...recebimentos, novo];
    const baixa = baixaDerivada({ ...tx, recebimentos: lista });
    await ctx.db.patch(args.id, {
      recebimentos: lista,
      comprovantes,
      isPaid: baixa.isPaid,
      paidAt: baixa.paidAt,
      // A forma da parcela acompanha o recebimento quando não havia nenhuma —
      // é o campo que o Financeiro já mostra.
      paymentMethod: tx.paymentMethod ?? novo.forma,
    });
    return { id: novo.id, repetido: false };
  },
});

/**
 * Corrige um recebimento: ANULA, com motivo. Não apaga e não estorna nada.
 *
 * Idempotente: anular de novo o que já está anulado não é erro e não troca o
 * motivo original.
 */
export const anularRecebimento = mutation({
  args: { id: v.id("transactions"), recebimentoId: v.string(), motivo: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tx = await meuLancamento(ctx, user, args.id);
    const recebimentos = tx.recebimentos ?? [];
    const alvo = recebimentos.find((r) => r.id === args.recebimentoId);
    if (!alvo) recusar("NOT_FOUND", "Recebimento não encontrado");
    if (alvo.anulacao) return { anulado: false };

    const motivo = args.motivo.trim();
    if (!motivo) recusar("INVALIDO", "Diga por que este recebimento está sendo anulado.");
    if (motivo.length > MOTIVO_MAXIMO) recusar("INVALIDO", `Motivo com até ${MOTIVO_MAXIMO} caracteres.`);

    const lista = recebimentos.map((r) =>
      r.id === alvo.id ? { ...r, anulacao: { em: new Date().toISOString(), motivo } } : r,
    );
    const baixa = baixaDerivada({ ...tx, recebimentos: lista });
    await ctx.db.patch(args.id, { recebimentos: lista, isPaid: baixa.isPaid, paidAt: baixa.paidAt });
    return { anulado: true };
  },
});
