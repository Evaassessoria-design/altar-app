import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib/identity";
import { comCarimbo } from "./lib/ultimaAtualizacao";
import { normalizeName } from "./lib/materiais";

// ─────────────────────────────────────────────────────────────────────────────
// BIBLIOTECA DE COMPOSIÇÕES — as receitas que se repetem.
//
// "Arranjo baixo clássico branco" é a mesma receita em quinze casamentos. A
// biblioteca existe para ela ser cadastrada UMA vez.
//
// ── A REGRA DO SNAPSHOT ─────────────────────────────────────────────────────
// Aplicar uma composição num evento COPIA a receita para o item de montagem
// (`assemblyItems.receita`). A partir daí os dois são independentes: editar a
// receita mestre amanhã não pode recalcular, em silêncio, um evento que já foi
// executado — a decoradora compraria por um número e montaria por outro.
//
// É a solução mais simples que protege histórico: sem tabela de versões, sem
// diff, sem migração. Cópia é o versionamento.
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

const componente = v.object({
  materialId: v.optional(v.id("materials")),
  nome: v.string(),
  unidade,
  quantidade: v.number(),
  tipo: v.optional(tipo),
  custoReferencia: v.optional(v.number()),
  notes: v.optional(v.string()),
});

type ComponenteEntrada = {
  materialId?: Id<"materials">;
  nome: string;
  unidade: string;
  quantidade: number;
  tipo?: string;
  custoReferencia?: number;
  notes?: string;
};

/**
 * Resolve as linhas de uma receita a partir do catálogo do usuário.
 *
 * Faz DUAS coisas que não podem ser esquecidas em nenhum caminho de gravação:
 *
 *  1. confere que todo `materialId` é da MESMA empresa — um id de outra conta
 *     traria o nome de um material alheio para dentro da receita;
 *  2. COPIA nome, unidade, tipo e custo do catálogo. É essa cópia que faz a
 *     receita sobreviver a renomear/arquivar o material.
 */
async function resolverReceita(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  linhas: readonly ComponenteEntrada[],
) {
  const resolvidas = [];
  for (const linha of linhas) {
    if (!Number.isFinite(linha.quantidade) || linha.quantidade < 0) {
      throw new ConvexError({ code: "INVALID", message: "Quantidade inválida na receita" });
    }

    let material: Doc<"materials"> | null = null;
    if (linha.materialId) {
      material = await ctx.db.get(linha.materialId);
      if (!material || material.userId !== userId) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Material não encontrado" });
      }
    }

    const nome = (material?.nome ?? linha.nome).trim();
    if (!nome) throw new ConvexError({ code: "INVALID", message: "Material sem nome na receita" });

    resolvidas.push({
      materialId: linha.materialId,
      nome,
      unidade: (material?.unidade ?? linha.unidade) as (typeof UNIDADES_VALIDAS)[number],
      quantidade: linha.quantidade,
      tipo: material?.tipo ?? (linha.tipo as never),
      custoReferencia: material?.custoReferencia ?? linha.custoReferencia,
      notes: linha.notes?.trim() || undefined,
    });
  }
  return resolvidas;
}

const UNIDADES_VALIDAS = [
  "un", "haste", "maco", "duzia", "caixa", "pacote", "rolo", "m", "m2", "kg", "l",
] as const;

export const list = query({
  args: { incluirArquivadas: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const todas = await ctx.db
      .query("compositions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const visiveis = args.incluirArquivadas ? todas : todas.filter((c) => !c.archived);
    return visiveis.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },
});

export const create = mutation({
  args: {
    nome: v.string(),
    categoria: v.optional(v.string()),
    notes: v.optional(v.string()),
    receita: v.optional(v.array(componente)),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const nome = args.nome.trim();
    if (!nome) throw new ConvexError({ code: "INVALID", message: "Informe o nome da composição" });

    // Composição sem componente nenhum é legítima: a decoradora cria a
    // composição e vai acrescentando os ingredientes. O consolidado
    // simplesmente não gera linha para ela.
    return ctx.db.insert("compositions", {
      userId: user._id,
      nome,
      searchName: normalizeName(nome),
      categoria: args.categoria?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      receita: await resolverReceita(ctx, user._id, args.receita ?? []),
      updatedAt: new Date().toISOString(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("compositions"),
    nome: v.optional(v.string()),
    categoria: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    /** Substitui a receita INTEIRA. Ausente = não mexe nela. */
    receita: v.optional(v.array(componente)),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const composicao = await ctx.db.get(args.id);
    if (!composicao || composicao.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Composição não encontrada" });

    const patch: Record<string, unknown> = {};
    if (args.nome?.trim()) {
      patch.nome = args.nome.trim();
      patch.searchName = normalizeName(args.nome);
    }
    if (args.categoria !== undefined) patch.categoria = args.categoria ?? undefined;
    if (args.notes !== undefined) patch.notes = args.notes ?? undefined;
    if (args.receita !== undefined) {
      patch.receita = await resolverReceita(ctx, user._id, args.receita);
    }

    // NENHUM evento é tocado aqui, de propósito: os itens de montagem têm o
    // SNAPSHOT da receita. Esta edição vale só para as próximas aplicações.
    await ctx.db.patch(args.id, comCarimbo(patch));
  },
});

/** Duplicar para variar: "Arranjo mesa convidados" → "... mesa família". */
export const duplicate = mutation({
  args: { id: v.id("compositions"), nome: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const original = await ctx.db.get(args.id);
    if (!original || original.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Composição não encontrada" });

    const nome = args.nome?.trim() || `${original.nome} (cópia)`;
    return ctx.db.insert("compositions", {
      userId: user._id,
      nome,
      searchName: normalizeName(nome),
      categoria: original.categoria,
      notes: original.notes,
      // Cópia profunda do array: as duas receitas seguem independentes.
      receita: original.receita.map((c) => ({ ...c })),
      updatedAt: new Date().toISOString(),
    });
  },
});

/**
 * Arquiva em vez de apagar — as fichas de eventos que a usaram continuam
 * legíveis, e `assemblyItems.compositionId` continua apontando para algo.
 */
export const setArchived = mutation({
  args: { id: v.id("compositions"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const composicao = await ctx.db.get(args.id);
    if (!composicao || composicao.userId !== user._id)
      throw new ConvexError({ code: "NOT_FOUND", message: "Composição não encontrada" });
    await ctx.db.patch(args.id, comCarimbo({ archived: args.archived || undefined }));
  },
});

export { resolverReceita, componente as validadorDeComponente };
