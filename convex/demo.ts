import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertDemoEnvironment, inspectDemoEnvironment } from "./lib/demoGuard";
import { DEMO_WEDDING, DEMO_MARKER } from "./lib/demoData";
import { normalizeName, normalizePhone } from "./lib/supplierIdentity";

/** O demo tem uma conta. O teto existe só para nunca varrer um banco grande. */
const MAX_CONTAS_LISTADAS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// SEED DE DEMONSTRAÇÃO — conteúdo fictício para prints e vídeos.
//
// Este arquivo é o MOTOR: valida o ambiente, garante idempotência e insere.
// O ROTEIRO (o casamento fictício em si) vive em lib/demoData.ts, separado de
// propósito: dá para trocar os dados sem tocar nas travas de segurança.
//
// GARANTIAS, todas verificadas por teste:
//   · só roda com ALTAR_DEMO=1 e num banco sem sinais de produção (lib/demoGuard);
//   · idempotente — rodar de novo não cria nada;
//   · SOMENTE INSERE. Não existe `delete` nem `patch` sobre dado alheio aqui;
//   · nenhuma chamada de IA e nenhuma chamada ao Asaas — é uma mutation, que
//     no Convex nem pode fazer requisição externa. A restrição é estrutural,
//     não uma promessa;
//   · nenhum arquivo/imagem: os campos de foto ficam vazios, prontos para você
//     subir as imagens pela própria interface depois.
//
// Interna de propósito: só executável pelo painel do Convex, por quem opera o
// deployment. Inalcançável pelo aplicativo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O ambiente aceitaria o seed? Não escreve nada.
 * Rode ANTES de semear, para confirmar que está no lugar certo.
 *
 *   internal.demo.checkEnvironment  { }
 */
export const checkEnvironment = internalQuery({
  args: {},
  handler: async (ctx) => {
    const check = await inspectDemoEnvironment(ctx);
    const jaSemeado = await encontrarEventoDemo(ctx);
    return {
      ...check,
      jaSemeado: jaSemeado !== null,
      proximoPasso: !check.ok
        ? `Bloqueado: ${check.motivo}`
        : jaSemeado
          ? "Já semeado — rodar de novo não fará nada."
          : "Pronto para semear.",
    };
  },
});

/** Marcador de idempotência: o evento demo já existe neste banco? */
async function encontrarEventoDemo(
  ctx: { db: MutationCtx["db"] | Parameters<typeof inspectDemoEnvironment>[0]["db"] },
): Promise<Doc<"events"> | null> {
  const eventos = await ctx.db.query("events").take(200);
  return eventos.find((e) => e.notes?.includes(DEMO_MARKER)) ?? null;
}

/**
 * Cria o casamento de demonstração.
 *
 *   internal.demo.seed  { }
 *   internal.demo.seed  { "email": "demo@appaltar.com.br" }
 *
 * O conteúdo é ligado a UM usuário — normalmente o único cadastrado no projeto
 * demo. Com mais de um, informe o e-mail para não haver ambiguidade.
 */
/**
 * Quem é a conta deste ambiente de demonstração.
 *
 * Somente leitura. Existe para CONFERIR o e-mail antes de redefinir a senha —
 * redefinir a senha da conta errada seria pior do que não redefinir nenhuma.
 * Devolve o e-mail de todas as contas (o demo tem uma só, por definição).
 */
export const contaDoDemo = internalQuery({
  args: {},
  handler: async (ctx) => {
    await assertDemoEnvironment(ctx);
    const usuarios = await ctx.db.query("users").take(MAX_CONTAS_LISTADAS);
    return {
      total: usuarios.length,
      contas: usuarios.map((u) => ({
        email: u.email,
        nome: u.name,
        criadaEm: new Date(u._creationTime).toISOString(),
        temLoginBetterAuth: u.betterAuthId !== undefined,
      })),
    };
  },
});

export const seed = internalMutation({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // ── Camadas 1 e 2: ambiente ──────────────────────────────────────────────
    await assertDemoEnvironment(ctx);

    // ── Camada 3: idempotência ───────────────────────────────────────────────
    const existente = await encontrarEventoDemo(ctx);
    if (existente) {
      return {
        criado: false,
        motivo: "O casamento de demonstração já existe neste banco. Nada foi alterado.",
        eventId: existente._id,
      };
    }

    // ── Dono do conteúdo ─────────────────────────────────────────────────────
    const usuarios = await ctx.db.query("users").take(5);
    if (usuarios.length === 0) {
      throw new ConvexError({
        code: "NO_USER",
        message:
          "Nenhum usuário neste banco. Cadastre-se no app demo primeiro — o seed " +
          "liga o conteúdo a uma conta existente, não cria login.",
      });
    }

    const dono = args.email
      ? usuarios.find((u) => u.email.trim().toLowerCase() === args.email!.trim().toLowerCase())
      : usuarios.length === 1
        ? usuarios[0]
        : undefined;

    if (!dono) {
      throw new ConvexError({
        code: "AMBIGUOUS_USER",
        message: args.email
          ? `Nenhum usuário com o e-mail ${args.email}.`
          : `Há ${usuarios.length} usuários neste banco. Informe { "email": "..." } para escolher.`,
      });
    }

    const userId = dono._id;
    const d = DEMO_WEDDING;
    const agora = new Date().toISOString();

    // ── Evento ───────────────────────────────────────────────────────────────
    const eventId = await ctx.db.insert("events", { userId, ...d.event });

    // ── Briefing ─────────────────────────────────────────────────────────────
    await ctx.db.insert("briefings", { eventId, userId, ...d.briefing });

    // ── Catálogo + fornecedores do evento ────────────────────────────────────
    // O seed exercita o catálogo central: cada fornecedor entra no catálogo da
    // empresa E ganha o vínculo com o evento, como aconteceria no uso real.
    const supplierIds = new Map<string, Id<"suppliers">>();
    for (const [i, f] of d.suppliers.entries()) {
      const supplierId = await ctx.db.insert("suppliers", {
        userId,
        companyName: f.companyName,
        category: f.category,
        contactName: f.contactName,
        phone: f.phone,
        email: f.email,
        instagram: f.instagram,
        city: f.city,
        state: f.state,
        differentials: f.differentials,
        commercialInfo: f.commercialInfo,
        searchName: normalizeName(f.companyName),
        phoneDigits: normalizePhone(f.phone) || undefined,
        createdAt: agora,
        updatedAt: agora,
      });
      supplierIds.set(f.companyName, supplierId);

      await ctx.db.insert("eventSuppliers", {
        userId,
        eventId,
        supplierId,
        category: f.category,
        companyName: f.companyName,
        contactName: f.contactName,
        phone: f.phone,
        email: f.email,
        instagram: f.instagram,
        city: f.city,
        state: f.state,
        differentials: f.differentials,
        commercialInfo: f.commercialInfo,
        status: f.status,
        nextAction: f.nextAction,
        alignments: f.alignments,
        notes: f.notes,
        order: i,
      });
    }

    // ── Equipe e escala ──────────────────────────────────────────────────────
    for (const p of d.team) {
      const teamMemberId = await ctx.db.insert("teamMembers", {
        userId,
        name: p.name,
        role: p.role,
        phone: p.phone,
      });
      await ctx.db.insert("eventTeam", {
        userId,
        eventId,
        teamMemberId,
        scheduledTime: p.scheduledTime,
        notes: p.notes,
      });
    }

    // ── Checklist (pré e pós, parcialmente concluído) ────────────────────────
    for (const [i, item] of d.checklist.entries()) {
      await ctx.db.insert("checklistItems", {
        eventId,
        userId,
        phase: item.phase,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        order: i,
        isChecked: item.isChecked,
      });
    }

    // ── Compras (parcialmente concluídas) ────────────────────────────────────
    for (const [i, c] of d.purchases.entries()) {
      await ctx.db.insert("purchaseItems", {
        userId,
        eventId,
        name: c.name,
        category: c.category,
        quantity: c.quantity,
        unit: c.unit,
        supplier: c.supplier,
        unitPrice: c.unitPrice,
        isPurchased: c.isPurchased,
        order: i,
      });
    }

    // ── Orçamento ────────────────────────────────────────────────────────────
    for (const [i, b] of d.budget.entries()) {
      await ctx.db.insert("budgetItems", {
        userId,
        eventId,
        description: b.description,
        category: b.category,
        quantity: b.quantity,
        unitPrice: b.unitPrice,
        type: b.type,
        order: i,
      });
    }

    // ── Financeiro ───────────────────────────────────────────────────────────
    for (const t of d.transactions) {
      await ctx.db.insert("transactions", {
        userId,
        eventId,
        type: t.type,
        category: t.category,
        description: t.description,
        amount: t.amount,
        date: t.date,
        isPaid: t.isPaid,
      });
    }

    // ── Carregamento / Caderno de Montagem ───────────────────────────────────
    // Campos de foto ficam VAZIOS de propósito: você sobe as imagens depois,
    // pela própria interface.
    for (const [i, a] of d.assembly.entries()) {
      await ctx.db.insert("assemblyItems", {
        userId,
        eventId,
        area: a.area,
        order: i,
        name: a.name,
        model: a.model,
        quantity: a.quantity,
        unit: a.unit,
        supplierName: a.supplierName,
        ambiente: a.ambiente,
        notes: a.notes,
        includeInAssemblyReport: true,
        checkOnAssembly: a.checkOnAssembly,
        visibility: a.visibility,
        createdAt: agora,
        updatedAt: agora,
      });
    }

    // ── Funil ────────────────────────────────────────────────────────────────
    // O lead do casal já está em "contratado" e aponta para o evento — mostra o
    // fluxo completo. Os demais dão volume às outras colunas do kanban.
    for (const [i, l] of d.leads.entries()) {
      await ctx.db.insert("leads", {
        userId,
        clientName: l.clientName,
        clientPhone: l.clientPhone,
        eventType: l.eventType,
        eventDate: l.eventDate,
        budget: l.budget,
        stage: l.stage,
        notes: l.notes,
        order: i,
        convertedEventId: l.isMainEvent ? eventId : undefined,
      });
    }

    return {
      criado: true,
      eventId,
      resumo: {
        fornecedores: d.suppliers.length,
        equipe: d.team.length,
        checklist: d.checklist.length,
        compras: d.purchases.length,
        orcamento: d.budget.length,
        lancamentos: d.transactions.length,
        montagem: d.assembly.length,
        leads: d.leads.length,
      },
    };
  },
});
