// Convex V8 runtime — mutations and queries for AI/contract features
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getOwnedEvent,
  requireEventOwner,
  requireEventSupplier,
  requireIdentity,
} from "./lib/identity";
import { safeDeleteFile } from "./lib/cascade";
import { requireActiveAccess } from "./lib/accessGuard";

const documentKind = v.union(
  v.literal("contract"),
  v.literal("addendum"),
  v.literal("budget"),
  v.literal("reference"),
  v.literal("other"),
);

// Documentos sem `kind` são contratos legados (dado anterior à multi-documento).
const effectiveKind = (kind?: string) => kind ?? "contract";

/**
 * Autorização de upload de documento do evento.
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
    /** De qual fornecedor é. Ausente = documento do evento. */
    supplierId: v.optional(v.id("eventSuppliers")),
  },
  handler: async (ctx, args) => {
    // Apaga o documento anterior do mesmo tipo (inclusive do storage) — só pode
    // rodar depois de confirmar que o evento é do usuário.
    const { user } = await requireEventOwner(ctx, args.eventId);
    // O fornecedor precisa ser DESTE evento. Mesma guarda de `assemblyItems`:
    // sem ela, um id do navegador etiquetaria o documento com o fornecedor de
    // outro casamento — ou de outra conta.
    await requireEventSupplier(ctx, user._id, args.eventId, args.supplierId);

    const kind = args.kind ?? "contract";
    const existing = await ctx.db
      .query("contracts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const c of existing) {
      // ── A SUBSTITUIÇÃO É POR TIPO **E** POR DONO ───────────────────────
      // Antes, subir um segundo "Orçamento" apagava o primeiro — o que estava
      // certo quando só havia um orçamento por evento. Com a etiqueta de
      // fornecedor deixa de estar: o orçamento da Móveis Bella e o da
      // Floricultura Florescer são os dois orçamentos DIFERENTES, e o segundo
      // envio destruiria o primeiro em silêncio.
      //
      // Documento sem fornecedor continua substituindo documento sem
      // fornecedor, exatamente como antes.
      if (effectiveKind(c.kind) === kind && c.supplierId === args.supplierId) {
        // O documento antigo sai mesmo que o arquivo dele já não exista: sem
        // isto, um storageId órfão trancava a SUBSTITUIÇÃO, e a decoradora não
        // conseguia subir o contrato novo.
        await safeDeleteFile(ctx, c.storageId);
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
      supplierId: args.supplierId,
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
    // Os nomes dos fornecedores numa leitura só — a ficha e a Pasta mostram
    // "Orçamento.pdf · Móveis Bella", e buscar um a um seria N+1.
    const fornecedores = new Map(
      (
        await ctx.db
          .query("eventSuppliers")
          .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
          .collect()
      ).map((f) => [f._id as string, f.companyName]),
    );

    return Promise.all(
      docs.map(async (d) => ({
        ...d,
        kind: effectiveKind(d.kind),
        url: await ctx.storage.getUrl(d.storageId),
        /** Nome do fornecedor dono do documento. Ausente = do evento. */
        supplierName: d.supplierId ? fornecedores.get(d.supplierId) : undefined,
      })),
    );
  },
});
