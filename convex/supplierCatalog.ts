import { internalMutation, mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/identity";
import { dedupKey, normalizeName, normalizePhone } from "./lib/supplierIdentity";
import { effectivePurchaseStatus, isPendingStatus } from "./lib/purchaseStatus";
import { somaEmDinheiro, emCentavos } from "./lib/dinheiro";

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO CENTRAL DE FORNECEDORES — "este fornecedor pertence a esta empresa".
//
// Distinto de convex/suppliers.ts, que trata do vínculo "este fornecedor NESTE
// evento". A relação é: suppliers → eventSuppliers → events.
//
// REGRA FUNDAMENTAL desta rodada: excluir um evento apaga o VÍNCULO, nunca o
// fornecedor do catálogo. Um fornecedor é usado em vários eventos; apagá-lo
// junto com um deles destruiria dado de todos os outros. Ver lib/cascade.ts e o
// teste dedicado em lib/cascade.test.ts.
//
// Nada aqui remove campo antigo. `eventSuppliers` continua com todos os dados
// de perfil que já tinha, servindo de fallback para registros não vinculados e
// de histórico do que valia naquele evento.
// ─────────────────────────────────────────────────────────────────────────────

/** Campos de perfil que se repetem entre eventos — o que vale a pena reutilizar. */
const profileFields = {
  contactName: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  instagram: v.optional(v.string()),
  website: v.optional(v.string()),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  differentials: v.optional(v.string()),
  commercialInfo: v.optional(v.string()),
  bankInfo: v.optional(v.string()),
  notes: v.optional(v.string()),
  logoStorageId: v.optional(v.id("_storage")),
} as const;

// ─── Leitura ────────────────────────────────────────────────────────────────

/**
 * Catálogo da empresa. Fornecedores arquivados ficam de fora por padrão —
 * eles continuam nomeando os eventos passados, mas não poluem a escolha.
 */
export const list = query({
  args: {
    category: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const rows = args.category
      ? await ctx.db
          .query("suppliers")
          .withIndex("by_user_category", (q) =>
            q.eq("userId", user._id).eq("category", args.category!),
          )
          .collect()
      : await ctx.db
          .query("suppliers")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

    const visiveis = args.includeArchived
      ? rows
      : rows.filter((s) => s.archivedAt === undefined);

    return visiveis.sort((a, b) => a.companyName.localeCompare(b.companyName, "pt-BR"));
  },
});

// `get` (o fornecedor cru, por id) foi REMOVIDO. Ele nasceu sem tela e
// continuou sem tela: quando `/fornecedores/:id` chegou, quem responde é
// `panorama`, que traz o fornecedor MAIS os eventos e as compras. Função
// pública sem chamador é superfície de ataque que ninguém revisa, e o mapa do
// produto a listava como dívida desde a primeira auditoria.

/** Em quais eventos este fornecedor já foi usado. Usa o índice `by_supplier`. */
export const listEventsForSupplier = query({
  args: { supplierId: v.id("suppliers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.userId !== user._id) return [];

    const vinculos = await ctx.db
      .query("eventSuppliers")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
      .collect();

    const resultado = await Promise.all(
      vinculos
        .filter((v) => v.userId === user._id)
        .map(async (v) => {
          const event = await ctx.db.get(v.eventId);
          return event ? { eventId: event._id, name: event.name, date: event.date, status: v.status } : null;
        }),
    );
    return resultado.filter((r) => r !== null);
  },
});

/**
 * Teto da varredura de compras de UM fornecedor.
 *
 * Não é paginação: a página SOMA, e somar exige ver tudo. É o limite a partir
 * do qual ela para de conseguir somar — e passa a dizer isso em vez de
 * afirmar o número que viu.
 */
const LIMITE_DE_COMPRAS = 300;

/**
 * O fornecedor por inteiro: quem é, onde já usei, o que já comprei.
 *
 * ── A PERGUNTA QUE ISTO RESPONDE ────────────────────────────────────────────
 * Ela vai ligar para a floricultura. Antes de ligar, quer saber: já trabalhei
 * com eles em quantos casamentos? quanto já comprei? ficou alguma coisa em
 * aberto? Hoje a resposta exigia abrir evento por evento.
 *
 * ── O QUE ESTE NÚMERO É, E O QUE ELE NÃO É ──────────────────────────────────
 * `totalComprado` é a soma de `unitPrice × quantity` das compras **não
 * canceladas** deste fornecedor. É o que ela combinou com ele — NÃO é o que
 * saiu do caixa: compra sem preço não entra, e o que foi de fato pago vive em
 * `transactions` (ver lib/custoDoEvento.ts, que é quem responde por custo).
 *
 * Por isso a resposta diz também quantas compras estão SEM PREÇO: um total que
 * ignora dez itens sem preço, exibido sozinho, engana.
 *
 * ── SEM N+1 ────────────────────────────────────────────────────────────────
 * Uma leitura por índice para os vínculos, uma para as compras, e os nomes dos
 * eventos de um `Map` montado numa passada — nunca uma consulta por linha.
 */
export const panorama = query({
  args: { supplierId: v.id("suppliers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.supplierId);
    // Id de outra conta responde como inexistente: confirmar que existe já
    // seria contar algo sobre o catálogo alheio.
    if (!supplier || supplier.userId !== user._id) return null;

    const [vinculos, comprasCruas] = await Promise.all([
      ctx.db
        .query("eventSuppliers")
        .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
        .collect(),
      ctx.db
        .query("purchaseItems")
        .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
        .take(LIMITE_DE_COMPRAS + 1),
    ]);

    // Os índices são por fornecedor. O dono é conferido aqui, e não por
    // confiança na integridade do vínculo.
    const meusVinculos = vinculos.filter((v) => v.userId === user._id);
    const minhasCompras = comprasCruas.filter((c) => c.userId === user._id);
    const temMaisCompras = minhasCompras.length > LIMITE_DE_COMPRAS;
    const compras = minhasCompras.slice(0, LIMITE_DE_COMPRAS);

    // Nomes dos eventos numa leitura só, indexada por dono.
    const eventos = new Map(
      (
        await ctx.db
          .query("events")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect()
      ).map((e) => [e._id as string, e]),
    );

    const valorDaCompra = (c: (typeof compras)[number]) =>
      typeof c.unitPrice === "number" && Number.isFinite(c.unitPrice)
        ? emCentavos(c.unitPrice * (typeof c.quantity === "number" && Number.isFinite(c.quantity) ? c.quantity : 1))
        : 0;

    const naoCanceladas = compras.filter((c) => effectivePurchaseStatus(c) !== "cancelado");
    const semPreco = naoCanceladas.filter((c) => typeof c.unitPrice !== "number").length;

    return {
      supplier,
      /** Eventos em que ele já foi usado, do mais recente para o mais antigo. */
      eventos: meusVinculos
        .map((v) => {
          const evento = eventos.get(v.eventId as string);
          return evento
            ? {
                eventId: evento._id,
                nome: evento.name,
                data: evento.date,
                status: v.status,
                /** O que ficou registrado como próximo passo com ele. */
                proximaAcao: v.nextAction?.trim() || undefined,
              }
            : null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => b.data.localeCompare(a.data)),
      compras: {
        total: naoCanceladas.length,
        /** Compras não canceladas que ainda exigem ação. */
        pendentes: naoCanceladas.filter((c) => isPendingStatus(effectivePurchaseStatus(c))).length,
        canceladas: compras.length - naoCanceladas.length,
        /** Quantas não têm preço — é o que impede o total de ser o total. */
        semPreco,
        /** `unitPrice × quantity` do que NÃO foi cancelado. Combinado, não pago. */
        valor: somaEmDinheiro(naoCanceladas.map(valorDaCompra)),
        /** As mais recentes, para reconhecer sem abrir evento nenhum. */
        recentes: naoCanceladas
          .slice()
          .sort((a, b) => b._creationTime - a._creationTime)
          .slice(0, 8)
          .map((c) => ({
            _id: c._id,
            nome: c.name,
            quantidade: c.quantity,
            unidade: c.unit,
            valor: valorDaCompra(c),
            situacao: effectivePurchaseStatus(c),
            evento: eventos.get(c.eventId as string)?.name,
            eventId: c.eventId,
          })),
        temMais: temMaisCompras,
      },
    };
  },
});

// ─── Escrita ────────────────────────────────────────────────────────────────

/** Deriva os campos calculados. Um lugar só, para busca e dedup não divergirem. */
function derived(companyName: string, phone: string | undefined) {
  return {
    searchName: normalizeName(companyName),
    phoneDigits: normalizePhone(phone) || undefined,
  };
}

export const create = mutation({
  args: {
    companyName: v.string(),
    category: v.string(),
    ...profileFields,
  },
  handler: async (ctx, args): Promise<Id<"suppliers">> => {
    const user = await requireUser(ctx);
    const agora = new Date().toISOString();
    return ctx.db.insert("suppliers", {
      userId: user._id,
      ...args,
      ...derived(args.companyName, args.phone),
      createdAt: agora,
      updatedAt: agora,
    });
  },
});

export const update = mutation({
  args: {
    supplierId: v.id("suppliers"),
    companyName: v.optional(v.string()),
    category: v.optional(v.string()),
    favorite: v.optional(v.boolean()),
    ...profileFields,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
    }

    const { supplierId, ...campos } = args;
    const companyName = campos.companyName ?? supplier.companyName;
    const phone = campos.phone !== undefined ? campos.phone : supplier.phone;

    await ctx.db.patch(supplierId, {
      ...campos,
      ...derived(companyName, phone),
      updatedAt: new Date().toISOString(),
    });
  },
});

/**
 * Arquiva (ou desarquiva) um fornecedor.
 *
 * Não existe exclusão de fornecedor com histórico: os eventos passados
 * precisam continuar nomeando quem entregou o quê. Arquivar tira das listas de
 * escolha e preserva tudo. É a mesma lógica de preservar histórico usada no
 * resto do sistema.
 */
export const setArchived = mutation({
  args: { supplierId: v.id("suppliers"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
    }
    await ctx.db.patch(args.supplierId, {
      archivedAt: args.archived ? Date.now() : undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});

// ─── Backfill ───────────────────────────────────────────────────────────────

/**
 * Cria o catálogo a partir dos fornecedores já cadastrados nos eventos.
 *
 * IDEMPOTENTE: rodar de novo não duplica nada. Vínculos que já apontam para o
 * catálogo são pulados; fornecedores que já existem são reaproveitados.
 *
 * DEDUPLICAÇÃO CONSERVADORA (lib/supplierIdentity.ts): só funde quando nome
 * normalizado E telefone normalizado batem, e ambos existem. Sem telefone, cada
 * registro vira um fornecedor próprio — duplicidade temporária é preferível a
 * fundir duas empresas diferentes, o que seria irreversível.
 *
 * NÃO APAGA NADA. Só preenche `supplierId` nos vínculos e insere no catálogo.
 *
 * Interna de propósito: roda pelo painel do Convex, por quem opera o
 * deployment. Não é alcançável pelo aplicativo.
 *
 * Uso:  internal.supplierCatalog.backfillFromEventSuppliers  { }
 *       (opcional: { "userId": "..." } para processar uma empresa só)
 */
export const backfillFromEventSuppliers = internalMutation({
  args: { userId: v.optional(v.id("users")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const vinculos = args.userId
      ? await ctx.db
          .query("eventSuppliers")
          .filter((q) => q.eq(q.field("userId"), args.userId))
          .take(args.limit ?? 2000)
      : await ctx.db.query("eventSuppliers").take(args.limit ?? 2000);

    let jaVinculados = 0;
    let criados = 0;
    let reaproveitados = 0;
    let semNome = 0;

    // Cache por empresa: chave de dedup → id no catálogo. Evita reconsultar e
    // garante que dois vínculos idênticos no mesmo lote virem um fornecedor só.
    const cache = new Map<string, Id<"suppliers">>();

    for (const vinculo of vinculos) {
      if (vinculo.supplierId) {
        jaVinculados++;
        continue;
      }
      if (!vinculo.companyName?.trim()) {
        semNome++;
        continue;
      }

      const chave = dedupKey(vinculo.companyName, vinculo.phone);
      const chaveCache = chave ? `${vinculo.userId}|${chave}` : null;

      let supplierId: Id<"suppliers"> | undefined =
        chaveCache ? cache.get(chaveCache) : undefined;

      // Já existe no catálogo? Só reaproveita com evidência forte.
      if (!supplierId && chave) {
        const candidatos = await ctx.db
          .query("suppliers")
          .withIndex("by_user_search", (q) =>
            q.eq("userId", vinculo.userId).eq("searchName", normalizeName(vinculo.companyName)),
          )
          .collect();
        const igual = candidatos.find(
          (c) => dedupKey(c.companyName, c.phone) === chave,
        );
        if (igual) {
          supplierId = igual._id;
          reaproveitados++;
        }
      }

      if (!supplierId) {
        const agora = new Date().toISOString();
        supplierId = await ctx.db.insert("suppliers", {
          userId: vinculo.userId,
          companyName: vinculo.companyName,
          category: vinculo.category,
          contactName: vinculo.contactName,
          phone: vinculo.phone,
          email: vinculo.email,
          instagram: vinculo.instagram,
          website: vinculo.website,
          address: vinculo.address,
          city: vinculo.city,
          state: vinculo.state,
          differentials: vinculo.differentials,
          commercialInfo: vinculo.commercialInfo,
          bankInfo: vinculo.bankInfo,
          logoStorageId: vinculo.logoStorageId,
          favorite: vinculo.favorite,
          ...derived(vinculo.companyName, vinculo.phone),
          createdAt: agora,
          updatedAt: agora,
        });
        criados++;
      }

      if (chaveCache) cache.set(chaveCache, supplierId);

      // Único efeito no registro existente: preencher o vínculo. Nenhum campo
      // antigo é alterado ou removido.
      await ctx.db.patch(vinculo._id, { supplierId });
    }

    return {
      analisados: vinculos.length,
      jaVinculados,
      criados,
      reaproveitados,
      semNome,
    };
  },
});

/** Diagnóstico: quanto do catálogo já foi preenchido. Somente leitura. */
export const backfillStatus = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const vinculos = await ctx.db.query("eventSuppliers").take(5000);
    const catalogo = await ctx.db.query("suppliers").take(5000);
    return {
      vinculosTotal: vinculos.length,
      vinculosComCatalogo: vinculos.filter((v) => v.supplierId !== undefined).length,
      fornecedoresNoCatalogo: catalogo.length,
    };
  },
});
