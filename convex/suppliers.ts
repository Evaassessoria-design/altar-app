import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  identidadeDoFornecedor,
  separarPatch,
} from "./lib/fornecedorDoEvento";
import { ConvexError } from "convex/values";
import { requireEventOwner, requireIdentity, requireUser } from "./lib/identity";
import { safeDeleteFile } from "./lib/cascade";
import { requireActiveAccess } from "./lib/accessGuard";
import { dedupKey, normalizeName, normalizePhone } from "./lib/supplierIdentity";
import type { MutationCtx } from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// Fornecedores do evento (Dossiê operacional + perfil). Isolamento por usuário:
// toda operação valida que o evento/fornecedor pertence ao usuário atual.
//
// Arquitetura: hoje o fornecedor vive DENTRO do evento (eventSuppliers). Os
// campos de "perfil" foram adicionados aqui de forma incremental; no futuro o
// perfil pode ser extraído para uma tabela global reutilizável sem quebrar isto.
// ─────────────────────────────────────────────────────────────────────────────

const operationalValidator = v.array(
  v.object({
    label: v.string(),
    value: v.string(),
    group: v.optional(v.string()),
  }),
);

const statusValidator = v.union(
  v.literal("cotacao"),
  v.literal("em_negociacao"),
  v.literal("contratado"),
  v.literal("confirmado"),
  v.literal("finalizado"),
);

const alignmentsValidator = v.array(
  v.object({
    date: v.string(),
    note: v.string(),
    by: v.optional(v.string()),
    nextAction: v.optional(v.string()),
  }),
);

// Campos de perfil/operação compartilhados entre create e update (opcionais).
const profileArgs = {
  contactName: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  notes: v.optional(v.string()),
  logoStorageId: v.optional(v.id("_storage")),
  instagram: v.optional(v.string()),
  website: v.optional(v.string()),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  differentials: v.optional(v.string()),
  commercialInfo: v.optional(v.string()),
  bankInfo: v.optional(v.string()),
  status: v.optional(statusValidator),
  alignments: v.optional(alignmentsValidator),
  nextAction: v.optional(v.string()),
  favorite: v.optional(v.boolean()),
  operational: v.optional(operationalValidator),
} as const;

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    const rows = await ctx.db
      .query("eventSuppliers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    // ── O CATÁLOGO ENTRA AQUI — E SÓ AGORA ───────────────────────────────────
    // O schema afirma desde que `supplierId` existe que "as telas leem daqui e
    // só consultam o catálogo quando há vínculo". A segunda metade nunca
    // aconteceu: esta consulta lia `eventSuppliers` e ponto. Corrigir o
    // telefone da floricultura no catálogo não chegava a evento NENHUM, nem
    // aos que ainda vão acontecer — e ela ligava para o número errado.
    //
    // Uma leitura por fornecedor DISTINTO, não por linha: o mesmo fornecedor
    // costuma aparecer em várias categorias do mesmo evento.
    const vinculados = new Set(
      rows.map((s) => s.supplierId).filter((id): id is Id<"suppliers"> => !!id),
    );
    const catalogo = new Map<string, Doc<"suppliers">>();
    for (const id of vinculados) {
      const doCatalogo = await ctx.db.get(id);
      // Vínculo que não resolve é ignorado, não é erro: a leitura cai na cópia
      // do evento, que é exatamente o comportamento de antes desta rodada.
      if (doCatalogo && doCatalogo.userId === user._id) catalogo.set(id, doCatalogo);
    }

    return Promise.all(
      rows.map(async (s) => {
        // `identidadeDoFornecedor` decide CAMPO A CAMPO — um catálogo com o
        // telefone preenchido e o Instagram vazio não apaga o Instagram que
        // estava no evento. Ver convex/lib/fornecedorDoEvento.ts.
        const identidade = identidadeDoFornecedor(
          s,
          s.supplierId ? catalogo.get(s.supplierId) : null,
        );
        const resolvido = { ...s, ...identidade };
        return {
          ...resolvido,
          logoUrl: resolvido.logoStorageId
            ? await ctx.storage.getUrl(resolvido.logoStorageId)
            : null,
          /** A identidade veio do catálogo? A tela usa para dizer onde editar. */
          doCatalogo: s.supplierId ? catalogo.has(s.supplierId) : false,
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    category: v.string(),
    companyName: v.string(),
    ...profileArgs,
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);

    const existing = await ctx.db
      .query("eventSuppliers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const maxOrder = existing.reduce((m, s) => Math.max(m, s.order ?? -1), -1);

    // ── Todo fornecedor novo entra também no CATÁLOGO da empresa ────────────
    // É isto que faz a redigitação sumir da próxima vez: quem cadastra um
    // buffet hoje encontra esse buffet pronto no evento seguinte.
    //
    // Se já existir no catálogo com evidência forte (mesmo nome E mesmo
    // telefone — lib/supplierIdentity.ts), reaproveita em vez de duplicar. Sem
    // essa evidência, cria outro: duplicidade temporária é preferível a fundir
    // fornecedores diferentes, que seria irreversível.
    const supplierId = await ensureInCatalog(ctx, user._id, args);

    return ctx.db.insert("eventSuppliers", {
      userId: user._id,
      ...args,
      supplierId,
      order: maxOrder + 1,
    });
  },
});

/**
 * Encontra (ou cria) o fornecedor correspondente no catálogo da empresa.
 * Devolve sempre um id — o vínculo nunca fica sem catálogo daqui para frente.
 */
async function ensureInCatalog(
  ctx: MutationCtx,
  userId: Id<"users">,
  dados: {
    companyName: string;
    category: string;
    contactName?: string;
    phone?: string;
    email?: string;
    instagram?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    differentials?: string;
    commercialInfo?: string;
    bankInfo?: string;
    logoStorageId?: Id<"_storage">;
  },
): Promise<Id<"suppliers">> {
  const chave = dedupKey(dados.companyName, dados.phone);

  if (chave) {
    const candidatos = await ctx.db
      .query("suppliers")
      .withIndex("by_user_search", (q) =>
        q.eq("userId", userId).eq("searchName", normalizeName(dados.companyName)),
      )
      .collect();
    const igual = candidatos.find((c) => dedupKey(c.companyName, c.phone) === chave);
    if (igual) return igual._id;
  }

  const agora = new Date().toISOString();
  return ctx.db.insert("suppliers", {
    userId,
    companyName: dados.companyName,
    category: dados.category,
    contactName: dados.contactName,
    phone: dados.phone,
    email: dados.email,
    instagram: dados.instagram,
    website: dados.website,
    address: dados.address,
    city: dados.city,
    state: dados.state,
    differentials: dados.differentials,
    commercialInfo: dados.commercialInfo,
    bankInfo: dados.bankInfo,
    logoStorageId: dados.logoStorageId,
    searchName: normalizeName(dados.companyName),
    phoneDigits: normalizePhone(dados.phone) || undefined,
    createdAt: agora,
    updatedAt: agora,
  });
}

/**
 * Adiciona ao evento um fornecedor QUE JÁ EXISTE no catálogo da empresa.
 *
 * É o fim da redigitação: nome, categoria, contato e demais dados de perfil são
 * copiados do catálogo. O que é específico daquele casamento (status, valor,
 * observações operacionais, alinhamentos) continua nascendo vazio aqui, porque
 * pertence à relação fornecedor × evento — não ao fornecedor.
 *
 * A cópia dos dados de perfil é deliberada, não redundância acidental: ela
 * preserva o que valia NAQUELE evento e mantém o registro legível mesmo se o
 * fornecedor for arquivado depois. É o mesmo padrão de `assemblyItems.supplierName`.
 */
export const createFromCatalog = mutation({
  args: {
    eventId: v.id("events"),
    supplierId: v.id("suppliers"),
    /** Permite ajustar a categoria só neste evento, sem mexer no catálogo. */
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);

    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado no catálogo" });
    }

    // Já está neste evento? Não duplica — devolve o vínculo existente.
    const jaNoEvento = await ctx.db
      .query("eventSuppliers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const existente = jaNoEvento.find((v) => v.supplierId === args.supplierId);
    if (existente) return existente._id;

    const maxOrder = jaNoEvento.reduce((m, s) => Math.max(m, s.order ?? -1), -1);

    return ctx.db.insert("eventSuppliers", {
      userId: user._id,
      eventId: args.eventId,
      supplierId: args.supplierId,
      category: args.category ?? supplier.category,
      companyName: supplier.companyName,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      instagram: supplier.instagram,
      website: supplier.website,
      address: supplier.address,
      city: supplier.city,
      state: supplier.state,
      differentials: supplier.differentials,
      commercialInfo: supplier.commercialInfo,
      bankInfo: supplier.bankInfo,
      logoStorageId: supplier.logoStorageId,
      order: maxOrder + 1,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("eventSuppliers"),
    category: v.optional(v.string()),
    companyName: v.optional(v.string()),
    ...profileArgs,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.id);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ message: "Fornecedor não encontrado", code: "NOT_FOUND" });
    }
    const { id, ...fields } = args;

    // ── CORRIGIR O TELEFONE UMA VEZ, NÃO UMA VEZ POR EVENTO ─────────────────
    // Sem isto, a correção feita na tela do evento ficava só naquele evento — e
    // o catálogo, que é de onde os OUTROS eventos passaram a ler, continuava
    // errado. A decoradora teria de corrigir duas vezes, e ninguém corrige
    // duas vezes.
    //
    // Só campos de IDENTIDADE sobem (como falar com ele, como ele se
    // apresenta). O COMBINADO daquele evento — condição, observação, dados de
    // pagamento, situação — fica onde sempre esteve: mudar isso no catálogo
    // reescreveria o que foi negociado num casamento que já aconteceu.
    if (supplier.supplierId) {
      const doCatalogo = await ctx.db.get(supplier.supplierId);
      if (doCatalogo && doCatalogo.userId === user._id) {
        const { paraOCatalogo, paraOEvento } = separarPatch(fields);
        if (Object.keys(paraOCatalogo).length > 0) {
          await ctx.db.patch(doCatalogo._id, {
            ...paraOCatalogo,
            updatedAt: new Date().toISOString(),
          });
        }
        // A cópia no evento é atualizada TAMBÉM, e de propósito: ela continua
        // sendo o fallback de leitura, e deixá-la velha faria a tela voltar ao
        // número errado no dia em que o vínculo se perdesse.
        await ctx.db.patch(id, fields);
        return;
      }
    }

    await ctx.db.patch(id, fields);
  },
});

/**
 * Tira o fornecedor DESTE evento. O catálogo da empresa não é tocado.
 *
 * ── O ARQUIVO TINHA DE SAIR JUNTO ───────────────────────────────────────────
 * Apagar o vínculo deixava a logo no storage quando ela era exclusiva dele —
 * registro anterior ao catálogo, sem `supplierId`. `lib/cascade.ts` já fazia a
 * distinção certa ao apagar o evento inteiro, com a regra escrita: quando o
 * vínculo aponta para o catálogo o arquivo é COMPARTILHADO e não pode sair;
 * quando não aponta, ele é só dele.
 *
 * Os dois caminhos apagam a mesma coisa e precisavam da mesma regra. Storage
 * é cobrado, e arquivo órfão não tem quem o encontre depois.
 */
export const remove = mutation({
  args: { id: v.id("eventSuppliers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const supplier = await ctx.db.get(args.id);
    if (!supplier || supplier.userId !== user._id) {
      throw new ConvexError({ message: "Fornecedor não encontrado", code: "NOT_FOUND" });
    }
    // Só o arquivo EXCLUSIVO deste vínculo. Se ele aponta para o catálogo, a
    // logo é de lá e apagá-la estragaria todos os outros eventos.
    if (supplier.supplierId === undefined) {
      await safeDeleteFile(ctx, supplier.logoStorageId);
    }

    // ── O CONTRATO ASSINADO NÃO MORRE COM O CARTÃO DO FORNECEDOR ────────────
    // Os documentos que vieram desta contratação continuam sendo papelada do
    // EVENTO: o orçamento aprovado e o contrato assinado provam o que foi
    // combinado, e tirar a empresa da lista não desfaz nem uma coisa nem
    // outra. O VÍNCULO é limpo, o arquivo fica — a mesma regra 3 da cascata
    // ("referências para o que morreu são LIMPAS, não apagadas") e a mesma
    // decisão que `deleteLeadCascade` já tomou para a proposta do funil.
    //
    // A busca é por evento, que é o índice que existe, e os documentos de um
    // evento são poucos.
    const documentos = await ctx.db
      .query("contracts")
      .withIndex("by_event", (q) => q.eq("eventId", supplier.eventId))
      .collect();
    for (const doc of documentos) {
      if (doc.supplierId === args.id) {
        await ctx.db.patch(doc._id, { supplierId: undefined });
      }
    }

    await ctx.db.delete(args.id);
  },
});

// Upload de logo — reutiliza a infraestrutura de storage existente do ALTAR.
/**
 * Autorização de upload de logo do fornecedor.
 *
 * Exige ACESSO ATIVO, e não apenas sessão. `lib/accessGuard.ts` sempre disse
 * que a guarda vale para "criar evento novo, enviar arquivos e todas as ações
 * de IA" — mas só o evento e a IA estavam cobertos. Como as funções do Convex
 * são chamáveis direto do navegador, uma conta com trial vencido, cancelada ou
 * bloqueada por inadimplência continuava conseguindo subir arquivo, e storage
 * é cobrado.
 *
 * Isto NÃO tranca o acesso aos próprios dados: ler, editar e exportar o que já
 * existe segue liberado para quem está bloqueado — inclusive a logo da empresa
 * (`users.generateLogoUploadUrl`), que é o caminho de volta para pagar.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireActiveAccess(ctx);
    return ctx.storage.generateUploadUrl();
  },
});
