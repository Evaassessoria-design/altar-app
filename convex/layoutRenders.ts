import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireIdentity } from "./lib/identity";
import { isImageProviderConfigured } from "./lib/imageProviderConfig";

// ─────────────────────────────────────────────────────────────────────────────
// Histórico da IA Visual (Planta Premium). Runtime V8 — as actions que falam
// com os modelos vivem em convex/aiVisual.ts ("use node").
//
// Segurança: toda entrada por `eventId` passa pelos helpers do Bloco 0
// (requireEventOwner / getOwnedEvent). Nenhum usuário alcança o croqui ou o
// render de outro conhecendo o eventId ou o renderId.
// ─────────────────────────────────────────────────────────────────────────────

const layoutInterpretation = v.object({
  ambientes: v.array(v.string()),
  elementos: v.array(
    v.object({
      tipo: v.string(),
      quantidade: v.number(),
      observacao: v.optional(v.string()),
    }),
  ),
  circulacao: v.optional(v.string()),
  acessos: v.optional(v.string()),
  observacoes: v.optional(v.string()),
});

// ── Upload do croqui ─────────────────────────────────────────────────────────
// Reutiliza a infraestrutura de storage já usada por contratos, fotos e logos.

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

// ── Configuração do ambiente ─────────────────────────────────────────────────
// A UI usa isto para desabilitar "Gerar Planta Premium" com mensagem clara.
// Devolve apenas um booleano — nunca chave, endpoint ou modelo.

export const providerStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return { configured: isImageProviderConfigured() };
  },
});

// ── Leitura do histórico ─────────────────────────────────────────────────────

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // Query de listagem: degrada para vazio (não lança), padrão do Bloco 0.
    if (!(await getOwnedEvent(ctx, args.eventId))) return [];

    const rows = await ctx.db
      .query("layoutRenders")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const ordered = rows.sort((a, b) => b.generationVersion - a.generationVersion);

    return Promise.all(
      ordered.map(async (r) => ({
        ...r,
        sketchUrl: await ctx.storage.getUrl(r.originalSketchStorageId),
        outputUrl: r.outputStorageId
          ? await ctx.storage.getUrl(r.outputStorageId)
          : null,
      })),
    );
  },
});

// ── Mutations internas (chamadas pelas actions de aiVisual.ts) ───────────────

export const createRender = internalMutation({
  args: {
    eventId: v.id("events"),
    originalSketchStorageId: v.id("_storage"),
    originalSketchFilename: v.string(),
    interpretation: layoutInterpretation,
    corrections: v.optional(v.string()),
    provider: v.string(),
    model: v.string(),
    promptVersion: v.string(),
    promptSnapshot: v.string(),
  },
  handler: async (ctx, args) => {
    // Revalida a posse mesmo vindo de uma action já autorizada — a linha grava
    // userId, então a verificação precisa acontecer aqui também.
    const { user } = await requireEventOwner(ctx, args.eventId);

    const previous = await ctx.db
      .query("layoutRenders")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const generationVersion =
      previous.reduce((max, r) => Math.max(max, r.generationVersion), 0) + 1;

    const now = new Date().toISOString();
    return ctx.db.insert("layoutRenders", {
      userId: user._id,
      ...args,
      generationVersion,
      status: "generating",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markRenderDone = internalMutation({
  args: {
    id: v.id("layoutRenders"),
    outputStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      outputStorageId: args.outputStorageId,
      status: "done",
      updatedAt: new Date().toISOString(),
    });
  },
});

export const markRenderFailed = internalMutation({
  args: {
    id: v.id("layoutRenders"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      errorMessage: args.errorMessage.slice(0, 500),
      updatedAt: new Date().toISOString(),
    });
  },
});
