import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireIdentity, requireUser, getOptionalUser } from "./lib/identity";
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
    if (!(await getOwnedEvent(ctx, args.eventId))) return [];

    const rows = await ctx.db
      .query("assemblyItems")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    // ── AS FOTOS DA GALERIA, RESOLVIDAS DE UMA VEZ ───────────────────────────
    // Um item pode APONTAR para uma foto da Galeria em vez de carregar um
    // arquivo próprio (ver `assemblyItems.referencePhotoId`). Resolver isso com
    // um `get` por item seria N+1 numa tela que abre toda visita ao evento.
    //
    // Uma consulta por evento, e só quando algum item de fato aponta: evento
    // sem ponteiro nenhum — o estado de tudo que já existe — não paga nada.
    const apontam = rows.some((i) => i.referencePhotoId || i.contractedPhotoId);
    const galeria = apontam
      ? new Map(
          (
            await ctx.db
              .query("eventPhotos")
              .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
              .collect()
          ).map((f) => [f._id, f]),
        )
      : new Map();

    /**
     * A URL de um slot. UMA regra, usada pelos dois — duas cópias divergiriam
     * e um slot passaria a preferir coisa diferente do outro.
     *
     * O ponteiro manda; sem ele, o arquivo próprio do item. Ponteiro que
     * sobreviveu a uma foto apagada vira "sem foto", nunca quadro quebrado.
     *
     * Da foto da Galeria sai a VERSÃO LEVE quando existe: a miniatura do
     * Caderno tem 22mm, e baixar o original de 15 MB para desenhá-la é o
     * desperdício que `imagem-reduzida.ts` existe para evitar.
     */
    const urlDoSlot = async (
      photoId: (typeof rows)[number]["referencePhotoId"],
      storageId: (typeof rows)[number]["referencePhotoStorageId"],
    ) => {
      if (photoId) {
        const foto = galeria.get(photoId);
        if (!foto) return null;
        return ctx.storage.getUrl(foto.previewStorageId ?? foto.storageId);
      }
      return storageId ? ctx.storage.getUrl(storageId) : null;
    };

    return Promise.all(
      rows
        .sort((a, b) => a.order - b.order)
        .map(async (item) => ({
          ...item,
          referencePhotoUrl: await urlDoSlot(
            item.referencePhotoId,
            item.referencePhotoStorageId,
          ),
          contractedPhotoUrl: await urlDoSlot(
            item.contractedPhotoId,
            item.contractedPhotoStorageId,
          ),
        })),
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
    const { id, ...fields } = args;
    await ctx.db.patch(id, {
      ...limparCampos(fields),
      updatedAt: new Date().toISOString(),
    });
  },
});

const slotValidator = v.union(v.literal("reference"), v.literal("contracted"));

/** Os dois campos de um slot. Um item tem OU arquivo próprio OU ponteiro. */
function camposDoSlot(slot: "reference" | "contracted") {
  return slot === "reference"
    ? { arquivo: "referencePhotoStorageId" as const, ponteiro: "referencePhotoId" as const }
    : { arquivo: "contractedPhotoStorageId" as const, ponteiro: "contractedPhotoId" as const };
}

/** Define (ou troca) uma das duas fotos do item, com um arquivo NOVO. */
export const setPhoto = mutation({
  args: {
    id: v.id("assemblyItems"),
    slot: slotValidator,
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }

    const { arquivo, ponteiro } = camposDoSlot(args.slot);

    // Troca de foto: remove o arquivo anterior para não deixar órfão no storage.
    //
    // `safeDeleteFile` porque o Convex lança ao apagar arquivo inexistente, e
    // aqui isso abortava a mutation inteira: a foto NOVA não era gravada, e a
    // decoradora via a antiga de volta depois de "trocar com sucesso". Mesma
    // regra que `lib/cascade.ts` já escreveu.
    const previous = item[arquivo];
    if (previous) await safeDeleteFile(ctx, previous);

    await ctx.db.patch(args.id, {
      [arquivo]: args.storageId,
      // Enviar arquivo novo DESFAZ o ponteiro: os dois juntos fariam a leitura
      // preferir a foto da Galeria e a decoradora veria a antiga depois de
      // enviar a nova.
      [ponteiro]: undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});

/**
 * Aponta o slot para uma foto que JÁ ESTÁ NA GALERIA.
 *
 * ── O TRABALHO QUE ISTO APAGA ───────────────────────────────────────────────
 * Ela sobe as fotos do projeto na Galeria, classifica cada uma por ambiente e
 * escopo — e, para pendurar uma delas num item de montagem, tinha de ENVIAR O
 * MESMO ARQUIVO DE NOVO. Dois uploads no 4G do sítio, dois arquivos cobrados,
 * e duas verdades: reclassificar na Galeria não mexia na cópia do item.
 *
 * ── TRÊS PERGUNTAS, NÃO DUAS ────────────────────────────────────────────────
 * A foto existe, é da conta, E É DESTE EVENTO. A terceira não é zelo: sem ela,
 * o item de Marina & Gabriel podia exibir uma foto do casamento da Joana. Os
 * dois eventos são da mesma decoradora, nenhuma regra de posse é violada, e
 * ainda assim é a foto errada no documento errado. É a mesma lição que
 * `requireEventPhoto` aprendeu com a capa.
 *
 * O arquivo próprio anterior é APAGADO: o slot passou a ser um ponteiro, e
 * deixar o arquivo seria storage cobrado que nenhuma linha mais referencia.
 */
export const setPhotoFromGallery = mutation({
  args: {
    id: v.id("assemblyItems"),
    slot: slotValidator,
    photoId: v.id("eventPhotos"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.userId !== user._id) {
      throw new ConvexError({ message: "Item não encontrado", code: "NOT_FOUND" });
    }

    const foto = await ctx.db.get(args.photoId);
    if (!foto || foto.userId !== user._id || foto.eventId !== item.eventId) {
      throw new ConvexError({ message: "Foto não encontrada", code: "NOT_FOUND" });
    }

    const { arquivo, ponteiro } = camposDoSlot(args.slot);
    // O arquivo exclusivo do item sai — ninguém mais vai referenciá-lo. A foto
    // da Galeria NÃO é tocada: ela é de lá, e apagá-la estragaria a galeria
    // inteira e a capa do evento.
    const previous = item[arquivo];
    if (previous) await safeDeleteFile(ctx, previous);

    await ctx.db.patch(args.id, {
      [arquivo]: undefined,
      [ponteiro]: args.photoId,
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
    // As fotos pertencem exclusivamente ao item — saem junto. O item sai de
    // qualquer jeito: arquivo que já não existe não pode impedir a exclusão.
    await safeDeleteFile(ctx, item.referencePhotoStorageId);
    await safeDeleteFile(ctx, item.contractedPhotoStorageId);
    await ctx.db.delete(args.id);
  },
});
