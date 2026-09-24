// Convex V8 runtime — mutations and queries for AI/contract features
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getOwnedEvent, requireEventOwner, requireIdentity } from "./lib/identity";
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

// ═════════════════════════════════════════════════════════════════════════════
// A SUBSTITUIÇÃO É POR TIPO **E POR FORNECEDOR**
//
// A regra antiga — "um novo contrato substitui o contrato anterior" — fazia
// sentido quando o evento tinha um contrato só, o da cliente. Mas a Pasta do
// Evento guarda também o que vem dos FORNECEDORES, e aí ela virou um teto:
// cinco tipos, cinco arquivos, um casamento inteiro.
//
// Um casamento tem empresa de móveis, floricultura e iluminação, e cada uma
// manda contrato e orçamento. Anexar o segundo orçamento apagava o primeiro. O
// resto ia para o Drive e para o WhatsApp.
//
// Agora o slot é (tipo, fornecedor). Documento sem fornecedor continua tendo o
// slot dele, exatamente como antes — nenhum arquivo já anexado muda de
// comportamento, e a mudança só ACRESCENTA lugares, nunca apaga mais.
// ═════════════════════════════════════════════════════════════════════════════

/** Dois documentos disputam o mesmo lugar? */
function mesmoLugar(
  a: { kind?: string; supplierId?: string },
  b: { kind?: string; supplierId?: string },
): boolean {
  // `?? null` para que "sem fornecedor" seja UM slot, e não cada documento com
  // um slot próprio: `undefined === undefined` é verdadeiro, mas escrever a
  // comparação assim deixa a intenção legível.
  return (
    effectiveKind(a.kind) === effectiveKind(b.kind) &&
    (a.supplierId ?? null) === (b.supplierId ?? null)
  );
}

export const saveContract = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    filename: v.string(),
    kind: v.optional(documentKind),
    /** Fornecedor DESTE evento de quem veio o documento. Ausente = do evento. */
    supplierId: v.optional(v.id("eventSuppliers")),
  },
  handler: async (ctx, args) => {
    // Apaga o documento anterior do mesmo lugar (inclusive do storage) — só
    // pode rodar depois de confirmar que o evento é do usuário.
    const { user } = await requireEventOwner(ctx, args.eventId);

    // O fornecedor tem que ser da mesma conta E DESTE evento. A segunda
    // pergunta não é zelo: sem ela, o contrato de Marina & Gabriel podia ficar
    // pendurado no fornecedor do casamento da Joana. Os dois eventos são da
    // mesma decoradora, nenhuma regra de posse é violada, e ainda assim é o
    // documento errado no lugar errado — a mesma lição de `requireEventPhoto`.
    if (args.supplierId) {
      const fornecedor = await ctx.db.get(args.supplierId);
      if (
        !fornecedor ||
        fornecedor.userId !== user._id ||
        fornecedor.eventId !== args.eventId
      ) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
      }
    }

    const existing = await ctx.db
      .query("contracts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const c of existing) {
      if (mesmoLugar(c, args)) {
        // O documento antigo sai mesmo que o arquivo dele já não exista: sem
        // isto, um storageId órfão trancava a SUBSTITUIÇÃO, e a decoradora não
        // conseguia subir o novo.
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
    // O contrato DO EVENTO — o da cliente. Documento pendurado num fornecedor
    // nunca vira "o contrato": é ele que a leitura por IA interpreta para
    // extrair parcelas e datas, e ler o contrato da empresa de móveis como se
    // fosse o do casamento criaria contas a receber que nunca existiram.
    const contract = docs.find((c) => effectiveKind(c.kind) === "contract" && !c.supplierId);
    if (!contract) return null;
    const url = await ctx.storage.getUrl(contract.storageId);
    return { ...contract, url };
  },
});

// Todos os documentos do evento — a "Pasta do Evento".
export const listDocuments = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    if (!(await getOwnedEvent(ctx, args.eventId))) return [];
    const docs = await ctx.db
      .query("contracts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    // O NOME do fornecedor, resolvido na leitura. Uma consulta por evento e um
    // Map — nunca um `get` por documento, que seria N+1 numa tela que abre
    // toda vez que ela entra no evento.
    //
    // Não é cópia gravada: o nome vive em `eventSuppliers` e muda lá. Guardá-lo
    // no documento criaria uma segunda verdade que envelhece na primeira
    // correção de razão social.
    const fornecedores = await ctx.db
      .query("eventSuppliers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const nomePorId = new Map(fornecedores.map((f) => [f._id, f.companyName]));

    return Promise.all(
      docs.map(async (d) => ({
        ...d,
        kind: effectiveKind(d.kind),
        /** `null` = documento do evento, sem fornecedor. Nunca "desconhecido". */
        supplierName: d.supplierId ? (nomePorId.get(d.supplierId) ?? null) : null,
        url: await ctx.storage.getUrl(d.storageId),
      })),
    );
  },
});
