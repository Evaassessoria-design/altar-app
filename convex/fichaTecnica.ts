import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getOwnedEvent, requireEventOwner, requireUser } from "./lib/identity";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import { resolverReceita, validadorDeComponente } from "./compositions";
import {
  coberturaDaLinha,
  consolidarMateriais,
  motivoDaAtencao,
  precisaDeAtencao,
  resumirConsolidado,
  type ComposicaoNoEvento,
} from "./lib/fichaTecnica";
import { ehObrigacaoDeMontagem } from "./lib/escopoDoProjeto";
import { effectivePurchaseStatus } from "./lib/purchaseStatus";
import { normalizeName } from "./lib/materiais";

// ─────────────────────────────────────────────────────────────────────────────
// FICHA TÉCNICA DO EVENTO
//
// A pergunta que este arquivo responde: "depois que a decoradora terminou de
// projetar, do que este evento é feito e quanto ela precisa providenciar?"
//
// ── ONDE A FICHA MORA ───────────────────────────────────────────────────────
// Em `assemblyItems`, no campo `receita`. NÃO há tabela de composição do
// evento: `assemblyItems` já é "20 arranjos baixos na mesa dos convidados" —
// tem ambiente, nome, quantidade e escopo. Duplicar isso obrigaria a
// decoradora a cadastrar a mesma coisa duas vezes, e os dois cadastros
// divergiriam na primeira semana.
//
// ── O CONSOLIDADO É SEMPRE DERIVADO ─────────────────────────────────────────
// Nenhum total é gravado. As regras vivem em lib/fichaTecnica.ts, puras e
// testadas; aqui só se lê o banco.
// ─────────────────────────────────────────────────────────────────────────────

/** Itens de montagem do evento, no formato que a regra de cálculo espera. */
function paraCalculo(itens: readonly {
  _id: string; name: string; area: string; ambiente?: string;
  quantity?: number; projectScope?: string;
  receita?: readonly { materialId?: string; nome: string; unidade: string; quantidade: number; tipo?: string; custoReferencia?: number }[];
}[]): ComposicaoNoEvento[] {
  return itens.map((i) => ({
    _id: i._id,
    nome: i.name,
    area: i.area,
    ambiente: i.ambiente,
    quantidade: i.quantity,
    projectScope: i.projectScope,
    receita: i.receita,
  }));
}

/**
 * A ficha do evento: itens COM receita, agrupados pelo consumidor da tela.
 *
 * Devolve os itens crus mais o consolidado. Uma leitura só — nada de a tela
 * pedir os itens e depois pedir o total, que abriria espaço para os dois
 * responderem coisas diferentes.
 */
export const getFicha = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return null;

    const itens = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const composicoes = paraCalculo(itens as never);
    const linhas = consolidarMateriais(composicoes, ehObrigacaoDeMontagem);

    // Compras do evento, para a cobertura. Uma leitura só, sem N+1: as compras
    // são indexadas por evento e casadas em memória por material.
    const compras = await ctx.db
      .query("purchaseItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Compras SEM vínculo técnico, indexadas por nome normalizado + unidade.
    // Um Map montado uma vez: casar dentro do laço seria O(n×m) à toa.
    const soltasPorChave = new Map<string, (typeof compras)[number]>();
    for (const c of compras) {
      if (c.materialId) continue;
      if (effectivePurchaseStatus(c) === "cancelado") continue;
      soltasPorChave.set(`${normalizeName(c.name)}|${c.unit ?? ""}`, c);
    }

    const consolidado = linhas.map((linha) => {
      const vinculadas = compras.filter(
        (c) => linha.materialId && c.materialId === linha.materialId && (c.unit ?? "") === linha.unidade,
      );
      const semelhante = vinculadas.length
        ? undefined
        : soltasPorChave.get(`${normalizeName(linha.nome)}|${linha.unidade}`);

      const cobertura = coberturaDaLinha(
        linha,
        vinculadas.map((c) => ({
          materialId: c.materialId,
          unit: c.unit,
          quantity: c.quantity,
          cancelada: effectivePurchaseStatus(c) === "cancelado",
          necessidadeTecnica: c.necessidadeTecnica,
        })),
        { temSemelhanteSemVinculo: Boolean(semelhante) },
      );

      return {
        ...linha,
        cobertura,
        // Quem a tela precisa para oferecer "Vincular" e "Reconhecer" — ids,
        // não objetos inteiros: a compra vive em Compras, não aqui.
        compraSemelhante: semelhante
          ? { _id: semelhante._id, name: semelhante.name, quantity: semelhante.quantity }
          : null,
        comprasVinculadas: vinculadas.map((c) => c._id),
        precisaDeAtencao: precisaDeAtencao(cobertura, linha.tipoAmbiguo),
        motivoDaAtencao: motivoDaAtencao(cobertura, linha.tipoAmbiguo),
      };
    });

    return {
      itens: itens.filter((i) => (i.receita?.length ?? 0) > 0),
      totalDeItens: itens.length,
      consolidado,
      resumo: {
        ...resumirConsolidado(linhas),
        composicoes: itens.filter((i) => (i.receita?.length ?? 0) > 0).length,
        // "Atenção" só conta o que é verdade verificável — nunca métrica
        // decorativa. Acervo não informado NÃO entra: é limitação nossa.
        pendencias: consolidado.filter((l) => l.precisaDeAtencao).length,
      },
    };
  },
});

/** Grava a receita de UM item de montagem. Substitui o array inteiro. */
export const setReceita = mutation({
  args: {
    id: v.id("assemblyItems"),
    receita: v.array(validadorDeComponente),
    /** Procedência, quando veio da biblioteca. Só rastro — nunca é lido de volta. */
    compositionId: v.optional(v.union(v.id("compositions"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Item não encontrado" });

    if (args.compositionId) {
      const composicao = await ctx.db.get(args.compositionId);
      if (!composicao || composicao.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Composição não encontrada" });
      }
    }

    const receita = await resolverReceita(ctx, user._id, args.receita);
    await ctx.db.patch(
      args.id,
      comCarimbo({
        receita,
        ...(args.compositionId === undefined
          ? {}
          : { compositionId: args.compositionId ?? undefined }),
      }),
    );
    return { linhas: receita.length };
  },
});

/**
 * Aplica uma composição da biblioteca a um item de montagem — COPIANDO.
 *
 * A cópia é o ponto: a partir daqui os dois são independentes. Editar a
 * receita mestre amanhã não recalcula um evento que já foi executado.
 *
 * Não sobrescreve em silêncio: se o item já tem receita, é preciso pedir
 * explicitamente para substituir.
 */
export const aplicarComposicao = mutation({
  args: {
    id: v.id("assemblyItems"),
    compositionId: v.id("compositions"),
    substituir: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Item não encontrado" });

    const composicao = await ctx.db.get(args.compositionId);
    if (!composicao || composicao.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Composição não encontrada" });

    if ((item.receita?.length ?? 0) > 0 && !args.substituir) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Este item já tem uma ficha técnica. Confirme para substituir.",
      });
    }

    await ctx.db.patch(
      args.id,
      comCarimbo({
        receita: composicao.receita.map((c) => ({ ...c })),
        compositionId: composicao._id,
      }),
    );
    return { linhas: composicao.receita.length };
  },
});

/** Remove a ficha de um item, sem apagar o item. */
export const limparReceita = mutation({
  args: { id: v.id("assemblyItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Item não encontrado" });
    await ctx.db.patch(args.id, comCarimbo({ receita: undefined, compositionId: undefined }));
  },
});

/**
 * Salva a receita de um item de montagem NA BIBLIOTECA, para reuso.
 *
 * Povoar a biblioteca a partir de trabalho já feito, em vez de exigir um
 * formulário em branco — foi assim que o catálogo de fornecedores encheu.
 */
export const salvarNaBiblioteca = mutation({
  args: { id: v.id("assemblyItems"), nome: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Item não encontrado" });
    if (!item.receita?.length)
      throw new ConvexError({ code: "INVALID", message: "Este item ainda não tem ficha técnica" });

    const nome = args.nome?.trim() || item.name;
    const { normalizeName } = await import("./lib/materiais");
    const compositionId = await ctx.db.insert("compositions", {
      userId: user._id,
      nome,
      searchName: normalizeName(nome),
      receita: item.receita.map((c) => ({ ...c })),
      updatedAt: new Date().toISOString(),
    });
    // Registra a procedência nos dois sentidos, sem criar dependência de leitura.
    await ctx.db.patch(args.id, comCarimbo({ compositionId }));
    return { compositionId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FICHA → COMPRA
//
// NECESSIDADE ≠ COMPRA. A ficha diz "preciso de 185 rosas"; a compra diz "vou
// comprar 200 da Flora Bela". Os dois números podem divergir legitimamente.
//
// Por isso a geração é uma AÇÃO EXPLÍCITA (nunca automática ao editar a
// receita) e IDEMPOTENTE: rodar de novo encontra a compra que já existe em vez
// de criar outra igual, e NÃO reescreve o que a decoradora já negociou.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vincula uma compra CADASTRADA À MÃO à necessidade técnica.
 *
 * A decoradora digitou "Rosa branca 200" em Compras antes de existir ficha.
 * O sistema detecta a semelhança (mesmo nome normalizado e mesma unidade) mas
 * NUNCA soma por conta própria — nome não é identidade. Esta ação é a decisão
 * humana que faltava.
 *
 * ── O QUE ELA NÃO TOCA ──────────────────────────────────────────────────────
 * Quantidade comprada, preço, fornecedor, situação, pagamento, lançamento.
 * Nada. Só o vínculo técnico e o carimbo da necessidade de agora — que é o que
 * permite, daqui a um mês, dizer "a necessidade mudou desde que você comprou".
 */
export const vincularCompra = mutation({
  args: { purchaseId: v.id("purchaseItems"), materialId: v.id("materials") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const compra = await ctx.db.get(args.purchaseId);
    if (!compra || compra.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Compra não encontrada" });

    const material = await ctx.db.get(args.materialId);
    if (!material || material.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Material não encontrado" });

    if (compra.materialId && compra.materialId !== args.materialId) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Esta compra já está vinculada a outro material.",
      });
    }

    // A unidade tem de bater: haste e maço são compras diferentes, e vincular
    // por cima disso faria a cobertura somar coisas incomparáveis.
    if ((compra.unit ?? "") !== material.unidade) {
      throw new ConvexError({
        code: "INVALID",
        message: `A compra está em "${compra.unit || "sem unidade"}" e o material em "${material.unidade}".`,
      });
    }

    // Necessidade de AGORA, como carimbo. Só o que o material representa neste
    // evento — a mesma conta do consolidado, nunca uma segunda.
    const itens = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", compra.eventId))
      .collect();
    const linha = consolidarMateriais(paraCalculo(itens as never), ehObrigacaoDeMontagem).find(
      (l) => l.materialId === args.materialId && l.unidade === material.unidade,
    );

    await ctx.db.patch(args.purchaseId, {
      materialId: args.materialId,
      necessidadeTecnica: linha?.necessario,
      updatedAt: new Date().toISOString(),
    });
    return { necessidadeTecnica: linha?.necessario ?? null };
  },
});

/**
 * Desfaz o vínculo técnico. A COMPRA CONTINUA EXISTINDO, intocada.
 *
 * `undefined` remove o campo no Convex (a compra volta a ser uma linha solta
 * de Compras, que é o estado de toda compra anterior à Ficha Técnica).
 */
export const desvincularCompra = mutation({
  args: { purchaseId: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const compra = await ctx.db.get(args.purchaseId);
    if (!compra || compra.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Compra não encontrada" });
    if (!compra.materialId) return { desvinculado: false };

    await ctx.db.patch(args.purchaseId, {
      materialId: undefined,
      necessidadeTecnica: undefined,
      updatedAt: new Date().toISOString(),
    });
    return { desvinculado: true };
  },
});

/**
 * "Eu vi que a necessidade mudou" — sem mexer no que foi comprado.
 *
 * A dívida que a auditoria do MASTER #6 registrou: o aviso "185 → 210" ficava
 * para sempre, porque não havia como reconhecê-lo. Reescrever `quantity`
 * apagaria a negociação que ela fez com o fornecedor; ignorar deixaria o aviso
 * gritando eternamente.
 *
 * A saída é atualizar SÓ o carimbo. Depois disso:
 *
 *     compra              = 200  (intocada)
 *     necessidadeTecnica  = 210  (reconhecida)
 *     cobertura           = faltam 10
 *
 * Que é exatamente a verdade operacional.
 */
export const reconhecerNecessidade = mutation({
  args: { purchaseId: v.id("purchaseItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const compra = await ctx.db.get(args.purchaseId);
    if (!compra || compra.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Compra não encontrada" });
    if (!compra.materialId)
      throw new ConvexError({
        code: "INVALID",
        message: "Esta compra não está vinculada a nenhum material da ficha.",
      });

    const itens = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", compra.eventId))
      .collect();
    const linha = consolidarMateriais(paraCalculo(itens as never), ehObrigacaoDeMontagem).find(
      (l) => l.materialId === compra.materialId && l.unidade === (compra.unit ?? ""),
    );
    if (!linha)
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Este material não aparece mais na ficha técnica deste evento.",
      });

    const anterior = compra.necessidadeTecnica ?? null;
    // SÓ o carimbo. `quantity`, preço, fornecedor e situação ficam como estão.
    await ctx.db.patch(args.purchaseId, {
      necessidadeTecnica: linha.necessario,
      updatedAt: new Date().toISOString(),
    });
    return { anterior, atual: linha.necessario };
  },
});

export const gerarCompras = mutation({
  args: {
    eventId: v.id("events"),
    /** Materiais a gerar. Vazio = todos os que normalmente viram compra. */
    materialIds: v.optional(v.array(v.id("materials"))),
  },
  handler: async (ctx, args) => {
    const { user, event } = await requireEventOwner(ctx, args.eventId);

    const itens = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const linhas = consolidarMateriais(paraCalculo(itens as never), ehObrigacaoDeMontagem);

    const compras = await ctx.db
      .query("purchaseItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const pedidos = args.materialIds?.length ? new Set(args.materialIds as string[]) : null;
    const ultimaOrdem = compras.reduce((max, c) => Math.max(max, c.order), -1);
    let ordem = ultimaOrdem + 1;

    // ── O MATERIAL É CARREGADO DE UMA VEZ ────────────────────────────────────
    // Buscar um a um dentro do laço era N+1: 50 materiais, 50 consultas. Aqui
    // uma leitura resolve o catálogo inteiro da empresa.
    const catalogo = new Map(
      (
        await ctx.db
          .query("materials")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect()
      ).map((m) => [m._id as string, m]),
    );

    let criadas = 0;
    let jaExistiam = 0;
    let divergentes = 0;
    const ignoradas: string[] = [];
    const possiveisDuplicatas: string[] = [];

    for (const linha of linhas) {
      // Sem vínculo com o catálogo não há como ser idempotente: a próxima
      // execução criaria outra compra igual. Melhor não gerar e dizer por quê.
      if (!linha.materialId) {
        ignoradas.push(linha.nome);
        continue;
      }
      if (pedidos && !pedidos.has(linha.materialId)) continue;
      // Vaso do acervo não vira compra por padrão — ele já é da empresa. A
      // decoradora ainda pode pedir explicitamente pelo `materialIds`.
      if (!pedidos && !linha.normalmenteCompra) continue;

      const existente = compras.find(
        (c) => c.materialId === linha.materialId && (c.unit ?? "") === linha.unidade,
      );
      if (existente) {
        jaExistiam += 1;
        // NÃO reescreve: a compra pode ter preço negociado, fornecedor e
        // quantidade que a decoradora escolheu. Só sinaliza a divergência.
        if (
          typeof existente.necessidadeTecnica === "number" &&
          Math.abs(existente.necessidadeTecnica - linha.necessario) > 0.001
        ) {
          divergentes += 1;
        }
        continue;
      }

      // ── COMPRA CADASTRADA À MÃO PARA O MESMO MATERIAL ─────────────────────
      // A decoradora digitou "Rosa branca 200 haste" em Compras antes de vir
      // aqui. Essa linha não tem `materialId`, então a checagem acima não a
      // encontra — e a geração criaria uma SEGUNDA compra de rosas.
      //
      // Não fundimos por semelhança: nome não é identidade, e casar por nome
      // poderia grudar duas coisas diferentes. Mas criar em silêncio é pior —
      // é dinheiro comprado duas vezes. Então NÃO GERA e diz exatamente o que
      // encontrou; a decoradora resolve (usa a compra que já existe, ou apaga
      // e gera de novo).
      const semelhante = compras.find(
        (c) =>
          !c.materialId &&
          (c.unit ?? "") === linha.unidade &&
          normalizeName(c.name) === normalizeName(linha.nome),
      );
      if (semelhante) {
        possiveisDuplicatas.push(linha.nome);
        continue;
      }

      const material = catalogo.get(linha.materialId);
      await ctx.db.insert("purchaseItems", {
        userId: user._id,
        eventId: event._id,
        name: linha.nome,
        quantity: linha.necessario,
        unit: linha.unidade,
        isPurchased: false,
        status: "necessidade" as const,
        order: ordem++,
        materialId: linha.materialId as Id<"materials">,
        necessidadeTecnica: linha.necessario,
        // Fornecedor PREFERENCIAL do material, como ponto de partida. A
        // decoradora troca na hora de comprar — nunca é vínculo obrigatório.
        supplierId: material?.supplierId,
        updatedAt: new Date().toISOString(),
      });
      // A lista local acompanha o que acabou de ser criado — sem reler do
      // banco. Só os campos que o casamento acima consulta; sem isto, dois
      // materiais na mesma chave gerariam duas linhas na MESMA execução.
      compras.push({
        materialId: linha.materialId,
        unit: linha.unidade,
        name: linha.nome,
        order: ordem,
      } as (typeof compras)[number]);
      criadas += 1;
    }

    return { criadas, jaExistiam, divergentes, ignoradas, possiveisDuplicatas };
  },
});
