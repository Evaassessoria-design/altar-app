import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { desvincularMembro } from "./responsavel";

// ─────────────────────────────────────────────────────────────────────────────
// EXCLUSÃO EM CASCATA
//
// Antes desta correção, `events.remove` apagava SÓ a linha do evento e
// `admin.deleteUser` apagava SÓ a linha do usuário. Todo o resto — briefing,
// checklist, orçamento, compras, fotos, contratos, financeiro, fornecedores,
// itens de montagem, plantas geradas — continuava no banco, invisível e sem
// dono, junto com os ARQUIVOS no storage (que são cobrados).
//
// Pior: a confirmação na tela dizia à decoradora que "todos os dados deste
// evento serão excluídos permanentemente". Não eram. Além do custo, isso é um
// problema de LGPD: o app afirmava ter apagado o que não apagou.
//
// Este módulo é a fonte única da exclusão. Regras que valem para tudo aqui:
//
//  1. Arquivo no storage é apagado junto com a linha que o referencia.
//  2. Apagar arquivo NUNCA derruba a exclusão: um storageId já removido (ou
//     nunca gravado) faz `ctx.storage.delete` lançar, e uma falha dessas não
//     pode deixar o banco pela metade. Por isso todo delete de arquivo passa
//     por `safeDeleteFile`.
//  3. Referências para o que morreu são LIMPAS, não apagadas: um lead que virou
//     evento continua existindo no funil, apenas sem o vínculo.
//
// As consultas são escritas UMA A UMA de propósito. É a lista explícita de tudo
// que pende de um evento — se uma tabela nova com `eventId` for criada e não
// entrar aqui, `cascade.test.ts` acusa.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apaga um arquivo do storage sem nunca lançar.
 *
 * Exportada porque a regra vale fora da cascata também: qualquer exclusão de
 * linha-com-arquivo (ex.: `leadDocuments.remove`) precisa continuar apagando o
 * registro mesmo quando o arquivo já não existe.
 *
 * O storageId pode já não existir (arquivo removido antes, exclusão repetida
 * após uma falha parcial). Nesse caso o certo é seguir apagando o resto — o
 * registro no banco é o que importa; um arquivo órfão é desperdício, um banco
 * pela metade é corrupção.
 */
export async function safeDeleteFile(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined | null,
): Promise<boolean> {
  if (!storageId) return false;
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // Arquivo inexistente ou já removido — segue o fluxo.
  }
  return true;
}

/** Resumo do que foi removido. Usado nos testes e no retorno das mutations. */
export type CascadeSummary = {
  events: number;
  documents: number;
  files: number;
};

/**
 * Apaga TUDO que pertence a um evento, e por fim o próprio evento.
 * Devolve a contagem do que saiu.
 */
export async function deleteEventCascade(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<CascadeSummary> {
  let documents = 0;
  let files = 0;

  // ── 1. Linhas sem arquivo ────────────────────────────────────────────────
  const briefings = await ctx.db
    .query("briefings")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const checklistItems = await ctx.db
    .query("checklistItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const purchaseItems = await ctx.db
    .query("purchaseItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const budgetItems = await ctx.db
    .query("budgetItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const eventTeam = await ctx.db
    .query("eventTeam")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();

  for (const row of [
    ...briefings,
    ...checklistItems,
    ...purchaseItems,
    ...budgetItems,
    ...eventTeam,
    ...transactions,
  ]) {
    await ctx.db.delete(row._id);
    documents += 1;
  }

  // ── 2. Linhas com UM arquivo ─────────────────────────────────────────────
  const eventPhotos = await ctx.db
    .query("eventPhotos")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  for (const photo of eventPhotos) {
    if (await safeDeleteFile(ctx, photo.storageId)) files += 1;
    await ctx.db.delete(photo._id);
    documents += 1;
  }

  const contracts = await ctx.db
    .query("contracts")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  for (const contract of contracts) {
    if (await safeDeleteFile(ctx, contract.storageId)) files += 1;
    await ctx.db.delete(contract._id);
    documents += 1;
  }

  // ── 3. Linhas com arquivo OPCIONAL ───────────────────────────────────────
  // ── FORNECEDORES: apaga o VÍNCULO, JAMAIS o catálogo ─────────────────────
  //
  // `eventSuppliers` é "este fornecedor NESTE evento" — morre com o evento.
  // `suppliers` é o catálogo da empresa, usado por vários eventos: apagá-lo
  // aqui destruiria dado de todos os outros eventos. Esta é a regra mais
  // importante do catálogo central, e existe um teste dedicado a ela em
  // cascade.test.ts. NÃO acrescente `suppliers` a esta função.
  const supplierLinks = await ctx.db
    .query("eventSuppliers")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  for (const link of supplierLinks) {
    // A logo copiada no vínculo pode ser a MESMA do catálogo. Só apagamos o
    // arquivo quando o vínculo não aponta para o catálogo — ou seja, quando o
    // registro é anterior à migração e o arquivo é exclusivo dele.
    if (link.supplierId === undefined) {
      if (await safeDeleteFile(ctx, link.logoStorageId)) files += 1;
    }
    await ctx.db.delete(link._id);
    documents += 1;
  }

  // Item de montagem guarda duas fotos com papéis distintos (referência
  // aprovada × o que foi de fato contratado). As duas saem.
  const assemblyItems = await ctx.db
    .query("assemblyItems")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  for (const item of assemblyItems) {
    if (await safeDeleteFile(ctx, item.referencePhotoStorageId)) files += 1;
    if (await safeDeleteFile(ctx, item.contractedPhotoStorageId)) files += 1;
    await ctx.db.delete(item._id);
    documents += 1;
  }

  // Planta da IA Visual: o croqui original SEMPRE existe; a imagem gerada só
  // existe quando a geração terminou bem.
  const renders = await ctx.db
    .query("layoutRenders")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  for (const render of renders) {
    if (await safeDeleteFile(ctx, render.originalSketchStorageId)) files += 1;
    if (await safeDeleteFile(ctx, render.outputStorageId)) files += 1;
    await ctx.db.delete(render._id);
    documents += 1;
  }

  // ── 4. Referências ao evento em tabelas do usuário ───────────────────────
  const event = await ctx.db.get(eventId);
  if (event) {
    // Notificações não têm índice por evento; a lista é por usuário e pequena.
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", event.userId))
      .collect();
    for (const n of notifications) {
      if (n.relatedEventId === eventId) {
        await ctx.db.delete(n._id);
        documents += 1;
      }
    }

    // Lead do funil que virou este evento: LIMPA o vínculo, mantém o lead.
    // O histórico comercial sobrevive ao evento — só o ponteiro morre.
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_user", (q) => q.eq("userId", event.userId))
      .collect();
    for (const lead of leads) {
      if (lead.convertedEventId === eventId) {
        await ctx.db.patch(lead._id, { convertedEventId: undefined });
      }
    }
  }

  await ctx.db.delete(eventId);
  return { events: 1, documents, files };
}

/**
 * Exclui um membro da equipe SEM deixar ponteiros mortos nem apagar história.
 *
 * Antes, `team.deleteMember` apagava só a linha de `teamMembers`. O que ficava:
 *
 *  · linhas de `eventTeam` apontando para alguém que não existe mais. A tela
 *    as escondia (`listEventTeam` filtra membro nulo), mas a SAÚDE do evento
 *    contava essas linhas como "equipe escalada" — o evento parecia coberto
 *    com ninguém escalado de verdade;
 *  · `responsibleId` de eventos, leads e compras apontando para o vazio, o que
 *    fazia o responsável simplesmente sumir dos registros.
 *
 * Agora o vínculo morre e o NOME é preservado como anotação livre (a mesma
 * forma que todo registro antigo já usa) — a compra continua tendo sido
 * tocada pela Camila. Anotação que já existia nunca é sobrescrita.
 */
export async function deleteTeamMemberCascade(
  ctx: MutationCtx,
  memberId: Id<"teamMembers">,
): Promise<{ escalas: number; vinculos: number }> {
  const membro = await ctx.db.get(memberId);
  if (!membro) return { escalas: 0, vinculos: 0 };
  const nome = membro.name;

  let escalas = 0;
  const escalado = await ctx.db
    .query("eventTeam")
    .withIndex("by_member", (q) => q.eq("teamMemberId", memberId))
    .collect();
  for (const linha of escalado) {
    await ctx.db.delete(linha._id);
    escalas += 1;
  }

  let vinculos = 0;
  const [eventos, leads, compras] = await Promise.all([
    ctx.db.query("events").withIndex("by_user", (q) => q.eq("userId", membro.userId)).collect(),
    ctx.db.query("leads").withIndex("by_user", (q) => q.eq("userId", membro.userId)).collect(),
    ctx.db
      .query("purchaseItems")
      .withIndex("by_user", (q) => q.eq("userId", membro.userId))
      .collect(),
  ]);

  for (const registro of [...eventos, ...leads, ...compras]) {
    if (registro.responsibleId !== memberId) continue;
    const patch = desvincularMembro(registro, nome);
    if (!patch) continue;
    await ctx.db.patch(registro._id, patch);
    vinculos += 1;
  }

  await ctx.db.delete(memberId);
  return { escalas, vinculos };
}

/**
 * Apaga um lead do funil e os DOCUMENTOS dele (linhas e arquivos).
 *
 * Existe porque `leadDocuments` foi a primeira tabela pendurada em `leads` com
 * arquivo no storage: antes, `funil.deleteLead` apagava só a linha do lead e a
 * proposta assinada ficava no storage para sempre, cobrada e inalcançável.
 *
 * NÃO apaga o evento que o lead gerou. Converter cria um evento com vida
 * própria — o histórico comercial pode ser descartado sem levar junto o
 * trabalho já contratado.
 */
export async function deleteLeadCascade(
  ctx: MutationCtx,
  leadId: Id<"leads">,
): Promise<CascadeSummary> {
  let documents = 0;
  let files = 0;

  const docs = await ctx.db
    .query("leadDocuments")
    .withIndex("by_lead", (q) => q.eq("leadId", leadId))
    .collect();
  for (const doc of docs) {
    if (await safeDeleteFile(ctx, doc.storageId)) files += 1;
    await ctx.db.delete(doc._id);
    documents += 1;
  }

  await ctx.db.delete(leadId);
  documents += 1;
  return { events: 0, documents, files };
}

/**
 * Apaga TUDO que pertence a um usuário: cada evento (com a cascata acima) e,
 * em seguida, os dados que vivem fora de evento — equipe, funil, notificações,
 * lançamentos financeiros avulsos e a logo da empresa.
 *
 * NÃO apaga a linha de `users` nem a conta de login: quem chama decide isso
 * (ver `admin.deleteUser`), porque a ordem importa — o e-mail precisa ser lido
 * e registrado em `deletedAccounts` antes de a linha sumir.
 */
export async function deleteUserDataCascade(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<CascadeSummary> {
  let events = 0;
  let documents = 0;
  let files = 0;

  const userEvents = await ctx.db
    .query("events")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  for (const event of userEvents) {
    const partial = await deleteEventCascade(ctx, event._id);
    events += partial.events;
    documents += partial.documents;
    files += partial.files;
  }

  // Tabelas do usuário que não dependem de evento. `transactions` e
  // `notifications` já perderam as linhas ligadas a eventos na cascata acima;
  // o que sobra aqui são as avulsas.
  // Catálogo de fornecedores: pertence à EMPRESA, então sai com ela — ao
  // contrário da exclusão de evento, onde ele nunca é tocado.
  const catalogo = await ctx.db
    .query("suppliers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const supplier of catalogo) {
    if (await safeDeleteFile(ctx, supplier.logoStorageId)) files += 1;
    await ctx.db.delete(supplier._id);
    documents += 1;
  }

  const teamMembers = await ctx.db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const leads = await ctx.db
    .query("leads")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  for (const row of [...teamMembers, ...notifications, ...transactions]) {
    await ctx.db.delete(row._id);
    documents += 1;
  }

  // Leads saem pela cascata própria: cada um leva os documentos comerciais
  // (linhas e ARQUIVOS) junto. Apagá-los aqui direto deixaria proposta e
  // contrato assinado no storage, cobrados e sem dono.
  for (const lead of leads) {
    const partial = await deleteLeadCascade(ctx, lead._id);
    documents += partial.documents;
    files += partial.files;
  }

  // Logo da empresa.
  const user = await ctx.db.get(userId);
  if (await safeDeleteFile(ctx, user?.logoStorageId)) files += 1;

  return { events, documents, files };
}
