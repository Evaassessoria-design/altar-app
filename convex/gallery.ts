import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
  return user;
}

// Generate upload URL for photo
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Não autenticado" });
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
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.userId !== user._id)
      throw new ConvexError({ code: "FORBIDDEN", message: "Sem permissão" });

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
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

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

    const photos = await photosQuery.order("asc").collect();

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
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const photo = await ctx.db.get(args.id);
    if (!photo || photo.userId !== user._id)
      throw new ConvexError({ code: "FORBIDDEN", message: "Sem permissão" });

    const patch: { caption?: string; category?: typeof args.category } = {};
    if (args.caption !== undefined) patch.caption = args.caption;
    if (args.category !== undefined) patch.category = args.category;
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
    await ctx.storage.delete(photo.storageId);
    await ctx.db.delete(args.id);
  },
});

// Count photos by category for an event
export const getPhotoCounts = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { total: 0, antes: 0, montagem: 0, evento: 0, desmontagem: 0 };
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
