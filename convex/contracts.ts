// Convex V8 runtime — mutations and queries for AI/contract features
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireIdentity } from "./lib/identity";

const documentKind = v.union(
  v.literal("contract"),
  v.literal("addendum"),
  v.literal("budget"),
  v.literal("reference"),
  v.literal("other"),
);

// Documentos sem `kind` são contratos legados (dado anterior à multi-documento).
const effectiveKind = (kind?: string) => kind ?? "contract";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

// Salva um documento do evento. Substitui apenas documentos do MESMO tipo
// (ex.: um novo contrato substitui o contrato anterior, mas não apaga adendos
// ou orçamentos já anexados). Sem `kind`, mantém o comportamento legado
// (contrato único por evento).
export const saveContract = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    filename: v.string(),
    kind: v.optional(documentKind),
  },
  handler: async (ctx, args) => {
    // Apaga o documento anterior do mesmo tipo (inclusive do storage) — só pode
    // rodar depois de confirmar que o evento é do usuário.
    const { user } = await requireEventOwner(ctx, args.eventId);
    const kind = args.kind ?? "contract";
    const existing = await ctx.db
      .query("contracts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const c of existing) {
      if (effectiveKind(c.kind) === kind) {
        await ctx.storage.delete(c.storageId);
        await ctx.db.delete(c._id);
      }
    }
    return ctx.db.insert("contracts", {
      eventId: args.eventId,
      userId: user._id,
      storageId: args.storageId,
      filename: args.filename,
      uploadedAt: new Date().toISOString(),
      kind: args.kind,
    });
  },
});

// Contrato principal do evento (compatível com dados legados sem `kind`).
export const getContract = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // Devolve a URL assinada do arquivo — nunca sem confirmar o dono do evento.
    if (!(await getOwnedEvent(ctx, args.eventId))) return null;
    const docs = await ctx.db
      .query("contracts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const contract = docs.find((c) => effectiveKind(c.kind) === "contract");
    if (!contract) return null;
    const url = await ctx.storage.getUrl(contract.storageId);
    return { ...contract, url };
  },
});

// Todos os documentos do evento (preparação para a "Pasta do Evento").
export const listDocuments = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    if (!(await getOwnedEvent(ctx, args.eventId))) return [];
    const docs = await ctx.db
      .query("contracts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return Promise.all(
      docs.map(async (d) => ({
        ...d,
        kind: effectiveKind(d.kind),
        url: await ctx.storage.getUrl(d.storageId),
      })),
    );
  },
});
