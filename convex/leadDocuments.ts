import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { getOwnedEvent, getOwnedLead, requireIdentity, requireLeadOwner, requireUser } from "./lib/identity";
import { safeDeleteFile } from "./lib/cascade";

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTOS DO LEAD
//
// A papelada comercial nasce ANTES do evento: proposta enviada, contrato
// assinado, comprovante do sinal, foto de referência que a cliente mandou.
// Até aqui o app só sabia guardar arquivo preso a um `eventId` (`contracts`,
// `eventPhotos`), então tudo isso ficava fora do sistema — no celular — e o
// funil não tinha memória documental.
//
// TRÊS REGRAS que valem para cada função deste arquivo:
//
//  1. DONO. Nenhuma leitura, gravação ou exclusão acontece sem confirmar que o
//     lead é do usuário logado (`requireLeadOwner`/`getOwnedLead`). O arquivo é
//     alcançado SEMPRE pelo lead, nunca por um storageId solto vindo do
//     navegador — quem manda um storageId de outra conta não recebe nada.
//  2. O ARQUIVO NÃO É A VERDADE. O storage pode ter perdido o arquivo (upload
//     interrompido, exclusão anterior pela metade). Isso NUNCA derruba a tela:
//     `list` devolve `url: null` e a linha continua visível para ser removida.
//  3. CONVERTER NÃO MOVE NADA. O lead sobrevive à conversão em evento, e os
//     documentos continuam dele. O evento os ENXERGA (`listForEvent`) sem
//     copiar bytes nem duplicar linha — cópia criaria dois donos para o mesmo
//     arquivo e a exclusão de um deixaria o outro apontando para o vazio.
// ─────────────────────────────────────────────────────────────────────────────

// Os valores vêm de `lib/tiposDeDocumento.ts`, a fonte única. O Convex exige
// literais estáticos aqui (não aceita um array espalhado), então a lista
// aparece escrita — e `leadDocuments.test.ts` falha se ela divergir da fonte.
const documentType = v.union(
  v.literal("proposta"),
  v.literal("contrato"),
  v.literal("comprovante"),
  v.literal("referencia"),
  v.literal("outro"),
);

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Registra um arquivo já enviado ao storage como documento do lead.
 *
 * A ordem importa: o dono do lead é conferido ANTES de qualquer escrita. Se a
 * conferência falhar, nada foi gravado — e o arquivo órfão no storage é
 * problema menor do que uma linha vinculada ao lead de outra decoradora.
 */
export const save = mutation({
  args: {
    leadId: v.id("leads"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    documentType: v.optional(documentType),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireLeadOwner(ctx, args.leadId);

    const fileName = args.fileName.trim();
    if (!fileName) {
      throw new ConvexError({ code: "INVALID", message: "Documento sem nome" });
    }

    return ctx.db.insert("leadDocuments", {
      userId: user._id,
      leadId: args.leadId,
      storageId: args.storageId,
      fileName,
      documentType: args.documentType,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      uploadedAt: new Date().toISOString(),
    });
  },
});

/** Formato devolvido pelas leituras. `url: null` = arquivo sumiu do storage. */
export type DocumentoResolvido = Doc<"leadDocuments"> & {
  url: string | null;
  arquivoDisponivel: boolean;
};

/**
 * Resolve a URL assinada de cada documento, do mais novo para o mais antigo.
 *
 * `getUrl` devolve `null` para arquivo inexistente em vez de lançar, mas o try
 * existe assim mesmo: um storageId gravado por uma versão antiga pode ser
 * inválido, e a lista inteira não pode morrer por causa de uma linha.
 */
async function resolverDocumentos(
  ctx: QueryCtx,
  docs: Doc<"leadDocuments">[],
): Promise<DocumentoResolvido[]> {
  const ordenados = [...docs].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return Promise.all(
    ordenados.map(async (d) => {
      let url: string | null = null;
      try {
        url = await ctx.storage.getUrl(d.storageId);
      } catch {
        url = null;
      }
      return { ...d, url, arquivoDisponivel: url !== null };
    }),
  );
}

/**
 * Documentos do lead, do mais novo para o mais antigo.
 *
 * Query que DEGRADA para vazio (não lança) quando o lead não é do usuário ou
 * não existe mais: a tela do funil pode consultar durante uma troca de rota,
 * logo após excluir o lead, e isso não pode virar erro na cara da decoradora.
 */
export const list = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args): Promise<DocumentoResolvido[]> => {
    if (!(await getOwnedLead(ctx, args.leadId))) return [];
    const docs = await ctx.db
      .query("leadDocuments")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();
    return resolverDocumentos(ctx, docs);
  },
});

/**
 * Documentos que vieram da negociação que gerou ESTE evento.
 *
 * Leitura pura: encontra o lead que aponta para o evento e devolve os
 * documentos dele. Nada é copiado — a proposta continua morando no lead. Se o
 * evento não nasceu de um lead (cadastro direto), devolve vazio, que é a
 * verdade, e não uma lista falsamente vazia de "sem documentos".
 */
export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<DocumentoResolvido[]> => {
    const event = await getOwnedEvent(ctx, args.eventId);
    if (!event) return [];
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_user", (q) => q.eq("userId", event.userId))
      .collect();
    const origem = leads.find((l) => l.convertedEventId === args.eventId);
    if (!origem) return [];
    const docs = await ctx.db
      .query("leadDocuments")
      .withIndex("by_lead", (q) => q.eq("leadId", origem._id))
      .collect();
    return resolverDocumentos(ctx, docs);
  },
});

/**
 * Remove um documento — a linha E o arquivo.
 *
 * IDEMPOTENTE por decisão: chamar duas vezes (clique duplo, retry de rede) não
 * é erro; a segunda devolve `{ removido: false }`. E o arquivo já ausente no
 * storage não impede a remoção da linha (`safeDeleteFile`) — deixar a linha
 * viva apontando para o vazio seria pior do que um arquivo órfão.
 */
export const remove = mutation({
  args: { id: v.id("leadDocuments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc) return { removido: false };
    if (doc.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Documento não encontrado" });
    }
    await safeDeleteFile(ctx, doc.storageId);
    await ctx.db.delete(args.id);
    return { removido: true };
  },
});
