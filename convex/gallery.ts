import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getOwnedEvent, requireEventOwner, requireIdentity, requireUser } from "./lib/identity";
import { requireActiveAccess } from "./lib/accessGuard";
import { chaveDoAmbiente } from "./lib/ambiente";

// Generate upload URL for photo
/**
 * Autorização de upload de foto da galeria.
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
    return await ctx.storage.generateUploadUrl();
  },
});

// Save photo after upload
export const savePhoto = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    filename: v.string(),
    category: v.union(
      v.literal("antes"),
      v.literal("montagem"),
      v.literal("evento"),
      v.literal("desmontagem"),
    ),
    caption: v.optional(v.string()),
    // ── O QUE A IMAGEM SIGNIFICA, JÁ NO ENVIO ────────────────────────────────
    // `projectScope` e `ambiente` existem no schema desde que a distinção
    // entre INSPIRAÇÃO e CONTRATADO foi desenhada — e nenhum dos dois era
    // gravado por caminho nenhum. Ver `updatePhoto` logo abaixo.
    projectScope: v.optional(
      v.union(v.literal("incluso"), v.literal("referencia"), v.literal("nao_incluso")),
    ),
    ambiente: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireEventOwner(ctx, args.eventId);

    // Get current max order for this event
    const lastPhoto = await ctx.db
      .query("eventPhotos")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .first();
    const order = (lastPhoto?.order ?? 0) + 1;

    return await ctx.db.insert("eventPhotos", {
      eventId: args.eventId,
      userId: user._id,
      storageId: args.storageId,
      filename: args.filename,
      category: args.category,
      caption: args.caption,
      projectScope: args.projectScope,
      ambiente: args.ambiente?.trim() || undefined,
      order,
      uploadedAt: new Date().toISOString(),
    });
  },
});

// List photos for event — resolved with URLs
export const listPhotos = query({
  args: {
    eventId: v.id("events"),
    category: v.optional(v.union(
      v.literal("antes"),
      v.literal("montagem"),
      v.literal("evento"),
      v.literal("desmontagem"),
    )),
    /**
     * "Quais são as referências da mesa do bolo?"
     *
     * É a pergunta que a decoradora faz no galpão, com o celular na mão, e que
     * não tinha resposta: a galeria filtrava só por FASE, e setenta fotos de
     * um casamento moram todas em "antes".
     *
     * Filtro na CONSULTA, não na página já carregada — filtrar depois faria a
     * contagem mentir assim que a lista tivesse teto.
     */
    ambiente: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await getOwnedEvent(ctx, args.eventId))) return [];

    let photosQuery;
    if (args.category) {
      photosQuery = ctx.db
        .query("eventPhotos")
        .withIndex("by_event_category", (q) =>
          q.eq("eventId", args.eventId).eq("category", args.category!),
        );
    } else {
      photosQuery = ctx.db
        .query("eventPhotos")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId));
    }

    const encontradas = await photosQuery.order("asc").collect();
    // MESMA chave que o Projeto Visual usa para agrupar (`lib/ambiente.ts`).
    // Antes daqui a comparação era `trim().toLowerCase()`, que não junta
    // acento: o bloco do projeto mostrava "Salão de vidro" e "salao de vidro"
    // juntos, e o link "+12 na Galeria" abria com nove.
    const alvo = args.ambiente ? chaveDoAmbiente(args.ambiente) : "";
    const photos = alvo
      ? encontradas.filter((p) => chaveDoAmbiente(p.ambiente) === alvo)
      : encontradas;

    return await Promise.all(
      photos.map(async (p) => ({
        ...p,
        url: await ctx.storage.getUrl(p.storageId),
      })),
    );
  },
});

// Update photo caption / category
export const updatePhoto = mutation({
  args: {
    id: v.id("eventPhotos"),
    caption: v.optional(v.string()),
    category: v.optional(v.union(
      v.literal("antes"),
      v.literal("montagem"),
      v.literal("evento"),
      v.literal("desmontagem"),
    )),
    // O que a imagem significa no projeto — eixo separado da fase.
    projectScope: v.optional(
      v.union(v.literal("incluso"), v.literal("referencia"), v.literal("nao_incluso")),
    ),
    ambiente: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const photo = await ctx.db.get(args.id);
    if (!photo || photo.userId !== user._id)
      throw new ConvexError({ code: "FORBIDDEN", message: "Sem permissão" });

    // ── O DEFEITO QUE ESTAS QUATRO LINHAS FECHAM ─────────────────────────────
    // `projectScope` e `ambiente` eram ACEITOS nos argumentos e descartados na
    // gravação: o patch só carregava `caption` e `category`. A tela mandava a
    // classificação, recebia "Legenda salva!" em verde, e nada era gravado.
    //
    // O efeito é pior do que perder um campo. A distinção entre REFERÊNCIA
    // ("é assim que queremos") e INCLUSO ("está contratado") é a que impede
    // uma foto de inspiração de ser cobrada como item do projeto — o schema
    // documenta isso em oito linhas, `scopeMeta` desenha o selo, e nada disso
    // chegava ao banco. Em `assemblyItems` a mesma regra sempre funcionou; só
    // nas FOTOS ela era jogada fora.
    const patch: {
      caption?: string;
      category?: typeof args.category;
      projectScope?: typeof args.projectScope;
      ambiente?: string;
    } = {};
    if (args.caption !== undefined) patch.caption = args.caption;
    if (args.category !== undefined) patch.category = args.category;
    if (args.projectScope !== undefined) patch.projectScope = args.projectScope;
    // `""` LIMPA o ambiente; ausente não mexe. A distinção é a convenção da
    // casa (lib/limparCampos.ts) e aqui ela importa: uma foto pode deixar de
    // pertencer a um ambiente.
    if (args.ambiente !== undefined) patch.ambiente = args.ambiente.trim() || undefined;
    await ctx.db.patch(args.id, patch);
  },
});

// Delete photo
export const deletePhoto = mutation({
  args: { id: v.id("eventPhotos") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const photo = await ctx.db.get(args.id);
    if (!photo || photo.userId !== user._id)
      throw new ConvexError({ code: "FORBIDDEN", message: "Sem permissão" });

    // ── A CAPA SAI ANTES DA FOTO ──────────────────────────────────────────
    // Apagar a foto que é capa deixaria `events.coverPhotoId` apontando para
    // uma linha que não existe. A tela degrada para a capa tipográfica mesmo
    // assim, mas ponteiro quebrado no banco é dívida que cresce em silêncio:
    // quem ler o campo amanhã não tem como saber se a capa foi removida ou se
    // o dado se perdeu.
    //
    // Só o evento DESTA foto é tocado, e só quando a capa é esta.
    const evento = await ctx.db.get(photo.eventId);
    if (evento && evento.coverPhotoId === args.id) {
      await ctx.db.patch(photo.eventId, { coverPhotoId: undefined });
    }

    await ctx.storage.delete(photo.storageId);
    await ctx.db.delete(args.id);
  },
});

// Count photos by category for an event
export const getPhotoCounts = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    if (!(await getOwnedEvent(ctx, args.eventId)))
      return { total: 0, antes: 0, montagem: 0, evento: 0, desmontagem: 0 };
    const photos = await ctx.db
      .query("eventPhotos")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return {
      total: photos.length,
      antes: photos.filter((p) => p.category === "antes").length,
      montagem: photos.filter((p) => p.category === "montagem").length,
      evento: photos.filter((p) => p.category === "evento").length,
      desmontagem: photos.filter((p) => p.category === "desmontagem").length,
    };
  },
});
