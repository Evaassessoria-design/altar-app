import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";
import {
  getOwnedEvent,
  requireEventOwner,
  requireEventPhoto,
  requireEventSupplier,
  requireIdentity,
  requireUser,
  getOptionalUser,
} from "./lib/identity";
import {
  resolverFotoDoItem,
  SEM_FOTO,
  type FotoDaGaleria,
  type FotoResolvida,
} from "./lib/fotoDoItem";
import { requireActiveAccess } from "./lib/accessGuard";
import { limparCampos } from "./lib/limparCampos";
import { exigirQuantidadeGravavel } from "./lib/numeroGravavel";
import { safeDeleteFile } from "./lib/cascade";

// ─────────────────────────────────────────────────────────────────────────────
// Itens operacionais de montagem. Camada de dados do Caderno de Montagem.
//
// Segurança: mesmo padrão do Bloco 0 — `requireEventOwner` nas escritas por
// eventId, `getOwnedEvent` nas listagens (degrada para vazio) e checagem de
// `row.userId` nas operações por id do item.
// ─────────────────────────────────────────────────────────────────────────────

const visibility = v.union(
  v.literal("interno"),
  v.literal("cliente"),
  v.literal("equipe"),
);

// Campos editáveis compartilhados entre create e update.
const itemFields = {
  name: v.string(),
  model: v.optional(v.string()),
  quantity: v.optional(v.number()),
  unit: v.optional(v.string()),
  supplierId: v.optional(v.id("eventSuppliers")),
  supplierName: v.optional(v.string()),
  ambiente: v.optional(v.string()),
  notes: v.optional(v.string()),
  includeInAssemblyReport: v.boolean(),
  checkOnAssembly: v.boolean(),
  visibility,
} as const;

/**
 * Autorização de upload de foto de item de montagem.
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

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const evento = await getOwnedEvent(ctx, args.eventId);
    if (!evento) return [];

    const rows = (
      await ctx.db
        .query("assemblyItems")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect()
    ).sort((a, b) => a.order - b.order);

    // ── AS FOTOS DA GALERIA SÃO LIDAS DE UMA VEZ ─────────────────────────────
    // Resolver o ponteiro dentro do laço seria N+1 — e pior, a MESMA foto
    // usada por três itens (o que acontece o tempo todo: uma referência de
    // cadeira serve à cerimônia e à recepção) pediria três leituras e três
    // `getUrl` para o mesmo arquivo.
    //
    // `Set` primeiro, uma leitura por foto distinta, e o resto sai de um Map.
    const apontadas = new Set<string>();
    for (const item of rows) {
      if (item.referencePhotoId) apontadas.add(item.referencePhotoId);
      if (item.contractedPhotoId) apontadas.add(item.contractedPhotoId);
    }

    const daGaleria = new Map<string, FotoDaGaleria>();
    for (const id of apontadas) {
      const foto = await ctx.db.get(id as Id<"eventPhotos">);
      // Ponteiro que não resolve é IGNORADO, não é erro: a foto pode ter sido
      // apagada por um caminho que não limpou o ponteiro, e o item degrada
      // para o arquivo próprio em `resolverFotoDoItem`. Confirmar o evento
      // aqui também impede que um ponteiro gravado antes desta guarda exista
      // e traga para a tela a foto de OUTRO evento da mesma conta.
      if (!foto || foto.userId !== evento.userId || foto.eventId !== args.eventId) continue;
      daGaleria.set(id, {
        _id: foto._id,
        url: await ctx.storage.getUrl(foto.storageId),
        previewUrl: foto.previewStorageId
          ? await ctx.storage.getUrl(foto.previewStorageId)
          : null,
      });
    }

    return Promise.all(
      rows.map(async (item) => {
        const referenceFoto = resolverFotoDoItem(
          item.referencePhotoId ? daGaleria.get(item.referencePhotoId) : null,
          item.referencePhotoStorageId
            ? await ctx.storage.getUrl(item.referencePhotoStorageId)
            : null,
        );
        const contractedFoto = resolverFotoDoItem(
          item.contractedPhotoId ? daGaleria.get(item.contractedPhotoId) : null,
          item.contractedPhotoStorageId
            ? await ctx.storage.getUrl(item.contractedPhotoStorageId)
            : null,
        );
        return {
          ...item,
          referenceFoto,
          contractedFoto,
          // Os dois nomes antigos continuam existindo e continuam significando
          // a MESMA coisa — a URL do original. O Caderno, o Projeto Visual e a
          // Folha de Carregamento já os liam, e nenhum precisou mudar para a
          // foto passar a vir da Galeria.
          referencePhotoUrl: referenceFoto.url,
          contractedPhotoUrl: contractedFoto.url,
        };
      }),
    );
  },
});

/** Um item de montagem. Degrada para `null` — a tela decide o que mostrar. */
export const get = query({
  args: { id: v.id("assemblyItems") },
  handler: async (ctx, args) => {
    const user = await getOptionalUser(ctx);
    if (!user) return null;
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) return null;
    return item;
  },
});

export const create = mutation({
  args: { eventId: v.id("events"), area: v.string(), ...itemFields },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    // `supplierId` era aceito e nunca conferido. Ver `requireEventSupplier`.
    await requireEventSupplier(ctx, user._id, args.eventId, args.supplierId);
    const existing = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const now = new Date().toISOString();

    return ctx.db.insert("assemblyItems", {
      userId: user._id,
      ...args,
      order: existing.reduce((m, i) => Math.max(m, i.order), -1) + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Criação em lote — usada pelo fluxo "Criar itens a partir do briefing", que
 * só chega aqui DEPOIS da decoradora revisar e confirmar a sugestão na UI.
 * Nada é criado automaticamente.
 */
export const createMany = mutation({
  args: {
    eventId: v.id("events"),
    items: v.array(v.object({ area: v.string(), ...itemFields })),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);
    // TODOS os fornecedores são conferidos ANTES de gravar o primeiro item: um
    // lote meio criado e meio recusado deixaria o evento num estado que
    // ninguém pediu. Mesmo cuidado de `financeiro.createReceivablesFromContract`.
    for (const item of args.items) {
      await requireEventSupplier(ctx, user._id, args.eventId, item.supplierId);
    }
    const existing = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    let order = existing.reduce((m, i) => Math.max(m, i.order), -1) + 1;
    const now = new Date().toISOString();

    for (const item of args.items) {
      await ctx.db.insert("assemblyItems", {
        userId: user._id,
        eventId: args.eventId,
        ...item,
        order: order++,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { created: args.items.length };
  },
});

export const update = mutation({
  args: {
    id: v.id("assemblyItems"),
    area: v.optional(v.string()),
    name: v.optional(v.string()),
    model: v.optional(v.string()),
    // `null` = limpar. Ver convex/lib/limparCampos.ts.
    quantity: v.optional(v.union(v.number(), v.null())),
    unit: v.optional(v.string()),
    supplierId: v.optional(v.id("eventSuppliers")),
    supplierName: v.optional(v.string()),
    ambiente: v.optional(v.string()),
    notes: v.optional(v.string()),
    includeInAssemblyReport: v.optional(v.boolean()),
    checkOnAssembly: v.optional(v.boolean()),
    projectScope: v.optional(
      v.union(
        v.literal("incluso"),
        v.literal("referencia"),
        v.literal("nao_incluso"),
        // `null` = "Sem classificação". Sem isso, tirar a classificação de um
        // item era impossível: o pedido não chegava ao servidor.
        v.null(),
      ),
    ),
    operationalStatus: v.optional(
      v.union(
        v.literal("pendente"),
        v.literal("separado"),
        v.literal("carregado"),
        v.literal("conferido"),
        v.literal("retornou"),
      ),
    ),
    visibility: v.optional(visibility),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    // A quantidade do item de montagem multiplica a receita inteira: um `NaN`
    // aqui atravessa o consolidado, a geração de compras e a folha de
    // carregamento. `null` continua LIMPANDO o campo (lib/limparCampos.ts).
    exigirQuantidadeGravavel(args.quantity, "Quantidade");
    // O fornecedor precisa ser DESTE evento, e o evento é o do item — não o
    // que o navegador disser. Sem isto, `update` era a porta lateral que
    // escapava da guarda de `create`.
    await requireEventSupplier(ctx, user._id, item.eventId, args.supplierId);
    const { id, ...fields } = args;
    await ctx.db.patch(id, {
      ...limparCampos(fields),
      updatedAt: new Date().toISOString(),
    });
  },
});

/** Define (ou troca) uma das duas fotos do item. */
export const setPhoto = mutation({
  args: {
    id: v.id("assemblyItems"),
    slot: v.union(v.literal("reference"), v.literal("contracted")),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }

    const field =
      args.slot === "reference"
        ? "referencePhotoStorageId"
        : "contractedPhotoStorageId";
    const ponteiro =
      args.slot === "reference" ? "referencePhotoId" : "contractedPhotoId";

    // Troca de foto: remove o arquivo anterior para não deixar órfão no storage.
    //
    // `safeDeleteFile` porque o Convex lança ao apagar arquivo inexistente, e
    // aqui isso abortava a mutation inteira: a foto NOVA não era gravada, e a
    // decoradora via a antiga de volta depois de "trocar com sucesso". Mesma
    // regra que `lib/cascade.ts` já escreveu.
    const previous = item[field];
    if (previous) await safeDeleteFile(ctx, previous);

    await ctx.db.patch(args.id, {
      [field]: args.storageId,
      // As duas formas de ter foto são EXCLUSIVAS por papel: deixar o ponteiro
      // de pé aqui faria a precedência de `lib/fotoDoItem.ts` devolver a foto
      // da Galeria, e a decoradora veria a imagem ANTIGA depois de trocar com
      // sucesso — exatamente o defeito que `safeDeleteFile` acima já corrigiu
      // uma vez neste mesmo lugar.
      [ponteiro]: undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});

/**
 * Usa uma foto QUE JÁ ESTÁ NA GALERIA como referência ou como contratado.
 *
 * ── O QUE ESTA MUTATION NÃO FAZ ─────────────────────────────────────────────
 * NÃO COPIA ARQUIVO. Não chama `generateUploadUrl`, não toca em `_storage` e
 * não cria uma segunda linha em `eventPhotos`. Ela grava um PONTEIRO — a
 * Galeria continua sendo a dona do arquivo, como `events.coverPhotoId` já
 * fazia para a capa.
 *
 * É o ponto inteiro da rodada: a mesma imagem deixa de entrar duas vezes no
 * ALTAR, e o item herda de graça a versão leve, o ambiente, a legenda e a
 * classificação que a foto já carrega.
 *
 * ── O ARQUIVO PRÓPRIO ANTIGO SAI ────────────────────────────────────────────
 * Se o item tinha um arquivo só dele naquele papel, ele era EXCLUSIVO do item
 * (ninguém mais aponta para ele) e vira lixo no instante em que o ponteiro
 * assume. `safeDeleteFile` porque apagar arquivo NUNCA pode derrubar a
 * gravação — `lib/cascade.ts`.
 */
export const setPhotoDaGaleria = mutation({
  args: {
    id: v.id("assemblyItems"),
    slot: v.union(v.literal("reference"), v.literal("contracted")),
    photoId: v.id("eventPhotos"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    // Três perguntas sobre a foto: existe, é minha, é DESTE evento. O evento é
    // o do ITEM, não o que o navegador mandar — é o que impede a foto do
    // casamento da Joana de ilustrar o item de Marina.
    await requireEventPhoto(ctx, user._id, item.eventId, args.photoId);

    const field =
      args.slot === "reference"
        ? "referencePhotoStorageId"
        : "contractedPhotoStorageId";
    const ponteiro =
      args.slot === "reference" ? "referencePhotoId" : "contractedPhotoId";

    const proprio = item[field];
    if (proprio) await safeDeleteFile(ctx, proprio);

    await ctx.db.patch(args.id, {
      [ponteiro]: args.photoId,
      [field]: undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});

/**
 * Tira a foto do item, sem apagar nada que não seja dele.
 *
 * Arquivo próprio: sai do storage, porque o item era o único dono.
 * Ponteiro para a Galeria: some só o ponteiro. A FOTO CONTINUA NA GALERIA —
 * remover a cadeira do lounge não pode apagar a imagem do acervo do evento.
 */
export const clearPhoto = mutation({
  args: {
    id: v.id("assemblyItems"),
    slot: v.union(v.literal("reference"), v.literal("contracted")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    const field =
      args.slot === "reference"
        ? "referencePhotoStorageId"
        : "contractedPhotoStorageId";
    const ponteiro =
      args.slot === "reference" ? "referencePhotoId" : "contractedPhotoId";

    if (item[field]) await safeDeleteFile(ctx, item[field]);

    await ctx.db.patch(args.id, {
      [field]: undefined,
      [ponteiro]: undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("assemblyItems") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }
    // ── SÓ O QUE É DO ITEM SAI ───────────────────────────────────────────
    // Os `...StorageId` são arquivos que o item enviou e dos quais ele é o
    // único dono — saem junto. O item sai de qualquer jeito: arquivo que já
    // não existe não pode impedir a exclusão.
    //
    // Os `...PhotoId` NÃO são tocados de propósito. Aquela foto é da Galeria
    // do evento, pode estar sendo usada por outro item, pode ser a capa do
    // Projeto Visual, e a decoradora nunca pediu para apagá-la. Excluir a
    // cadeira do lounge não pode apagar a foto da cadeira.
    await safeDeleteFile(ctx, item.referencePhotoStorageId);
    await safeDeleteFile(ctx, item.contractedPhotoStorageId);
    await ctx.db.delete(args.id);
  },
});
