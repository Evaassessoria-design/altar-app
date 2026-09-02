import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/identity";
import { limparCampos } from "./lib/limparCampos";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import { chaveDoMaterial, normalizeName } from "./lib/materiais";

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE MATERIAIS — por empresa.
//
// Mesma arquitetura já provada no catálogo de fornecedores: o que se REPETE
// entre eventos mora numa tabela da empresa; o que é da relação com um evento
// continua onde estava. A receita de um evento COPIA o que precisa (nome,
// unidade, tipo, custo de referência), então renomear ou arquivar um material
// nunca reescreve a ficha de um evento passado.
//
// NÃO é estoque. Não há saldo, movimentação nem patrimônio aqui.
// ─────────────────────────────────────────────────────────────────────────────

const unidade = v.union(
  v.literal("un"), v.literal("haste"), v.literal("maco"), v.literal("duzia"),
  v.literal("caixa"), v.literal("pacote"), v.literal("rolo"),
  v.literal("m"), v.literal("m2"), v.literal("kg"), v.literal("l"),
);

const tipo = v.union(
  v.literal("consumivel"), v.literal("reutilizavel"),
  v.literal("locacao"), v.literal("compra_especifica"),
);

export const list = query({
  args: { incluirArquivados: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const todos = await ctx.db
      .query("materials")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const visiveis = args.incluirArquivados ? todos : todos.filter((m) => !m.archived);
    return visiveis.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },
});

/**
 * Cria um material — ou devolve o que já existe.
 *
 * A deduplicação é DELIBERADAMENTE ESTREITA (lib/materiais.ts): só colidem
 * nome normalizado E unidade iguais. "Rosa Avalanche" e "Rosa branca" nunca se
 * fundem; "rosa branca" em haste e em maço são materiais diferentes, porque
 * têm preços diferentes e não podem ser somados no consolidado.
 *
 * Em caso de dúvida, duplicar é melhor que fundir: fundir é irreversível.
 */
export const create = mutation({
  args: {
    nome: v.string(),
    unidade,
    categoria: v.optional(v.string()),
    tipo: v.optional(tipo),
    custoReferencia: v.optional(v.number()),
    supplierId: v.optional(v.id("suppliers")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const nome = args.nome.trim();
    if (!nome) throw new ConvexError({ code: "INVALID", message: "Informe o nome do material" });

    if (args.supplierId) {
      const fornecedor = await ctx.db.get(args.supplierId);
      if (!fornecedor || fornecedor.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
      }
    }
    if (typeof args.custoReferencia === "number" && args.custoReferencia < 0) {
      throw new ConvexError({ code: "INVALID", message: "Custo de referência não pode ser negativo" });
    }

    const searchName = normalizeName(nome);
    const chave = chaveDoMaterial(nome, args.unidade);
    const existentes = await ctx.db
      .query("materials")
      .withIndex("by_user_search", (q) => q.eq("userId", user._id).eq("searchName", searchName))
      .collect();
    const igual = existentes.find((m) => chaveDoMaterial(m.nome, m.unidade) === chave);
    if (igual) {
      // Reaproveita em vez de duplicar. Se estava arquivado, volta ao catálogo:
      // cadastrar de novo é a forma natural de dizer "voltei a usar isto".
      if (igual.archived) await ctx.db.patch(igual._id, comCarimbo({ archived: undefined }));
      return { materialId: igual._id, criado: false };
    }

    const materialId = await ctx.db.insert("materials", {
      userId: user._id,
      nome,
      searchName,
      unidade: args.unidade,
      categoria: args.categoria?.trim() || undefined,
      tipo: args.tipo,
      custoReferencia: args.custoReferencia,
      supplierId: args.supplierId,
      notes: args.notes?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });
    return { materialId, criado: true };
  },
});

export const update = mutation({
  args: {
    id: v.id("materials"),
    nome: v.optional(v.string()),
    unidade: v.optional(unidade),
    categoria: v.optional(v.union(v.string(), v.null())),
    tipo: v.optional(v.union(tipo, v.null())),
    custoReferencia: v.optional(v.union(v.number(), v.null())),
    supplierId: v.optional(v.union(v.id("suppliers"), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const material = await ctx.db.get(args.id);
    if (!material || material.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Material não encontrado" });

    if (args.supplierId) {
      const fornecedor = await ctx.db.get(args.supplierId);
      if (!fornecedor || fornecedor.userId !== user._id) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
      }
    }
    if (typeof args.custoReferencia === "number" && args.custoReferencia < 0) {
      throw new ConvexError({ code: "INVALID", message: "Custo de referência não pode ser negativo" });
    }

    const { id, ...fields } = args;
    const limpos = limparCampos(fields);
    // Renomear reescreve a chave de busca junto — senão o material some da
    // busca e a próxima criação abriria um duplicado.
    const patch = args.nome?.trim()
      ? { ...limpos, nome: args.nome.trim(), searchName: normalizeName(args.nome) }
      : limpos;
    await ctx.db.patch(id, comCarimbo(patch));
  },
});

/**
 * Arquiva em vez de apagar.
 *
 * Apagar destruiria a leitura das receitas que já citam este material — e o
 * snapshot de um evento executado ficaria com uma linha sem procedência.
 * Arquivado só some do seletor; tudo que já existe continua legível.
 */
export const setArchived = mutation({
  args: { id: v.id("materials"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const material = await ctx.db.get(args.id);
    if (!material || material.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Material não encontrado" });
    await ctx.db.patch(args.id, comCarimbo({ archived: args.archived || undefined }));
  },
});
