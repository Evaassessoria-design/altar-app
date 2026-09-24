import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import { getOptionalUser } from "./lib/identity";
import { requireAdmin } from "./lib/adminGuard";
import { ALTAR_ADMIN_ROLE, effectiveSubscriptionStatus, resolveAccess } from "./lib/access";
import { deleteUserDataCascade } from "./lib/cascade";
import { ACTIVE_WINDOWS, isActiveWithin } from "./lib/presence";
import { panoramaDoNegocio } from "./lib/escritorio/panorama";
import { deleteBetterAuthAccount } from "./lib/authAccount";
import { exigirNumeroReal } from "./lib/numeroGravavel";

// ─── Auth helpers ──────────────────────────────────────────────────────────

// `requireAdmin` mudou de casa para lib/adminGuard.ts — sem mudar de regra.
// A Central de Comunicações precisa do MESMO guarda, e duas cópias
// divergiriam no dia em que uma delas fosse ajustada. Reexportado aqui para
// que nada que já importava de `admin` quebre.
export { requireAdmin };

// ─── Queries ──────────────────────────────────────────────────────────────

export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    return user?.role === "admin";
  },
});

/**
 * Avisos do Asaas recebidos — e, principalmente, os que NÃO acharam dono.
 *
 * Existe por causa de um caso real: um pagamento confirmado no cartão não
 * ativou a assinatura, e não havia como saber se o aviso tinha chegado. Um
 * `no_match` aqui significa que dinheiro entrou no Asaas sem casar com nenhuma
 * conta do ALTAR. Lista vazia significa que NENHUM aviso chegou — o que aponta
 * para a configuração do webhook no Asaas, não para o código.
 */
export const getAsaasWebhookLog = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const eventos = await ctx.db
      .query("asaasWebhookEvents")
      .withIndex("by_received_at")
      .order("desc")
      .take(args.limit ?? 25);

    const contar = async (outcome: string) =>
      (
        await ctx.db
          .query("asaasWebhookEvents")
          .withIndex("by_outcome", (q) => q.eq("outcome", outcome))
          .collect()
      ).length;

    return {
      eventos,
      semDono: await contar("no_match"),
      comErro: await contar("error"),
      /** Nada registrado: ou o Asaas nunca enviou, ou o webhook não está configurado. */
      vazio: eventos.length === 0,
    };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const now = Date.now();

    const total = users.length;

    // Contas isentas (internal / beta vigente) NÃO são receita. Ficam fora do
    // MRR e da taxa de conversão para não inflarem as métricas do negócio.
    const exempt = users.filter((u) => resolveAccess(u, now).billingExempt);
    const internal = users.filter((u) => (u.accessType ?? "client") === "internal").length;
    const beta = users.filter((u) => (u.accessType ?? "client") === "beta").length;
    const billable = users.filter((u) => !resolveAccess(u, now).billingExempt);

    // Status EFETIVO: um trial cujo prazo venceu conta como expirado, mesmo que
    // o banco ainda diga "trial" (a expiração nunca é gravada). Sem isso, o
    // painel mostrava trials mortos na coluna "em trial".
    const statusDe = (u: (typeof users)[number]) => effectiveSubscriptionStatus(u, now);

    const trial = billable.filter((u) => statusDe(u) === "trial").length;
    const active = billable.filter((u) => statusDe(u) === "active").length;
    const overdue = billable.filter((u) => statusDe(u) === "overdue").length;
    const expired = billable.filter((u) => statusDe(u) === "expired").length;
    const cancelled = billable.filter((u) => statusDe(u) === "cancelled").length;

    // Inadimplentes que JÁ passaram da tolerância e estão barrados agora. Separa
    // "atrasou" de "perdeu o acesso" — são ações comerciais diferentes.
    const overdueBlocked = billable.filter(
      (u) => statusDe(u) === "overdue" && resolveAccess(u, now).blocked,
    ).length;

    // MRR = assinantes ativos e cobráveis × R$119,90.
    // Contas internas e beta ficam de fora por construção (`billable`).
    const mrr = active * 119.9;

    // Conversão = ativos / (ativos + expirados), só entre contas cobráveis
    const conversionDenominator = active + expired;
    const conversionRate = conversionDenominator > 0
      ? Math.round((active / conversionDenominator) * 100)
      : 0;

    // ── Uso real ─────────────────────────────────────────────────────────────
    // Quem de fato abriu o app na janela. Responde "quantas contas estão vivas?",
    // que é diferente de "quantas existem". `lastSeenAt` ausente = nunca visto
    // desde que a medição passou a existir.
    const activeDay = users.filter((u) => isActiveWithin(u.lastSeenAt, ACTIVE_WINDOWS.day, now)).length;
    const activeWeek = users.filter((u) => isActiveWithin(u.lastSeenAt, ACTIVE_WINDOWS.week, now)).length;
    const activeMonth = users.filter((u) => isActiveWithin(u.lastSeenAt, ACTIVE_WINDOWS.month, now)).length;
    const neverSeen = users.filter((u) => u.lastSeenAt === undefined).length;

    // Events count
    const eventsTotal = await ctx.db.query("events").collect();

    return {
      total,
      trial,
      active,
      overdue,
      overdueBlocked,
      expired,
      cancelled,
      internal,
      beta,
      exemptTotal: exempt.length,
      mrr,
      conversionRate,
      eventsTotal: eventsTotal.length,
      activeDay,
      activeWeek,
      activeMonth,
      neverSeen,
    };
  },
});

/**
 * Quem pode ser RESPONSÁVEL por uma conversa ou tarefa da Central.
 *
 * São os administradores — quem opera o SaaS. Existe separada de `listUsers`
 * de propósito: aquela devolve o cadastro inteiro de todos os assinantes
 * (inclusive estado de cobrança) para alimentar o painel de contas, e a
 * Central precisa apenas de nome e id de um punhado de pessoas. Um seletor de
 * responsável não tem por que carregar a base de clientes.
 */
export const listarOperadores = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", ALTAR_ADMIN_ROLE))
      .collect();
    return users
      .map((u) => ({ _id: u._id, name: u.name, email: u.email }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").collect();
    const now = Date.now();

    // Anota, por usuário, tudo que o painel precisa mostrar sem recalcular nada
    // na tela:
    //  · `eventCount`     — quantos eventos criou;
    //  · `lastEventAt`    — quando criou o ÚLTIMO (sinal de atividade real);
    //  · `nextEventDate`  — próximo evento agendado, se houver;
    //  · `access`         — decisão JÁ RESOLVIDA por resolveAccess, a mesma
    //    fonte da guarda de checkout e das métricas de MRR. O painel não
    //    reimplementa a regra client/beta/internal.
    const result = await Promise.all(
      users.map(async (u) => {
        const events = await ctx.db
          .query("events")
          .withIndex("by_user", (q) => q.eq("userId", u._id))
          .collect();

        const lastEventAt = events.length
          ? Math.max(...events.map((e) => e._creationTime))
          : undefined;

        // Próximo evento ainda por acontecer (data é string AAAA-MM-DD, então a
        // comparação lexicográfica funciona e é a mesma usada em events.list).
        const hoje = new Date().toISOString().slice(0, 10);
        const futuros = events
          .filter((e) => e.date >= hoje && e.status !== "cancelled" && e.status !== "completed")
          .map((e) => e.date)
          .sort();

        return {
          ...u,
          eventCount: events.length,
          lastEventAt,
          nextEventDate: futuros[0],
          access: resolveAccess(u, now),
        };
      }),
    );
    return result;
  },
});

// ─── Mutations ─────────────────────────────────────────────────────────────

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.userId, { role: args.role });
  },
});

// NÃO adicionar aqui uma mutation que escreva `subscriptionStatus`.
//
// Existia `updateUserSubscription` (admin grava trial/active/expired/cancelled
// à mão). Removida: gravar "active" concede acesso pago sem assinatura no
// Asaas, conta no MRR (getStats: ativos cobráveis × R$119,90) e na conversão,
// e ainda atrapalha o webhook — `markSubscriptionOverdue` só rebaixa quem está
// "active", então um status forjado engole a transição real depois.
//
// Estado de cobrança é escrito SOMENTE pelo Asaas, via as internalMutations de
// convex/users.ts chamadas por convex/asaasWebhook.ts. Para liberar acesso sem
// cobrar, use `setUserAccess` (internal/beta) — que não toca em cobrança.

/**
 * Define o tipo de acesso de um usuário. É a única porta para marcar uma conta
 * como interna ou beta — protegida por requireAdmin, sem comparação de e-mail
 * em lugar nenhum. Nenhum usuário é alterado automaticamente.
 */
export const setUserAccess = mutation({
  args: {
    userId: v.id("users"),
    accessType: v.union(
      v.literal("client"),
      v.literal("beta"),
      v.literal("internal"),
    ),
    // Epoch ms. Só faz sentido com accessType "beta".
    accessExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    }
    // Epoch em `NaN` faz o acesso beta expirar em "Invalid Date": a conta não
    // é bloqueada nem liberada, e o painel não sabe dizer qual das duas.
    exigirNumeroReal(args.accessExpiresAt, "Data de expiração");
    if (args.accessType === "beta" && args.accessExpiresAt === undefined) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Defina a data de expiração do acesso beta.",
      });
    }
    await ctx.db.patch(args.userId, {
      accessType: args.accessType,
      // Fora do beta a data não tem efeito — limpamos para não deixar resíduo.
      accessExpiresAt: args.accessType === "beta" ? args.accessExpiresAt : undefined,
    });
  },
});

/**
 * Exclui um usuário DE VERDADE.
 *
 * Antes esta mutation apagava só a linha de `users`. Duas consequências, as
 * duas graves:
 *
 *  · Todos os eventos, fotos, contratos e finanças daquela empresa ficavam no
 *    banco sem dono — invisíveis e impossíveis de recuperar pela interface,
 *    ainda ocupando storage pago.
 *  · A CONTA DE LOGIN continuava existindo. A pessoa entrava de novo com a
 *    mesma senha, `syncAuthenticatedUser` não achava linha em `users` e criava
 *    uma nova — com 14 dias de trial. Excluir usuário era, na prática, um botão
 *    de "renovar teste grátis", repetível à vontade.
 *
 * Agora acontece, nesta ordem:
 *  1. cascata de todos os dados (lib/cascade.ts);
 *  2. registro do e-mail em `deletedAccounts` — é o que impede o novo trial;
 *  3. remoção da conta no Better Auth (sessões, credenciais e usuário);
 *  4. remoção da linha de `users`.
 *
 * A ordem importa: o e-mail é lido antes de a linha sumir, e o registro em
 * `deletedAccounts` é gravado antes da remoção do login — se algo falhar no
 * meio, o pior caso é uma conta registrada como excluída que ainda consegue
 * entrar, e não um trial renovado.
 */
// ─── Bootstrap / conta da fundadora ────────────────────────────────────────

/**
 * Garante que uma conta seja ADMIN e tenha acesso permanente sem cobrança.
 *
 * É uma `internalMutation` de propósito: NÃO é alcançável pelo aplicativo nem
 * por nenhum usuário logado. Só roda pelo painel do Convex (Functions → run) ou
 * pela CLI, por quem já tem acesso ao deployment. Isso resolve o problema do
 * ovo e da galinha — se nenhuma conta for admin hoje, ninguém consegue abrir o
 * /admin para promover a primeira.
 *
 * Não existe (e não deve existir) comparação de e-mail em nenhum caminho
 * automático: o e-mail é um ARGUMENTO passado à mão por quem opera o banco.
 *
 * O que faz, de forma idempotente:
 *   · role         → "admin"     (abre o Painel Admin)
 *   · accessType   → "internal"  (acesso permanente, nunca cobra, fora do MRR)
 *   · accessExpiresAt → limpo    (só faz sentido em conta beta)
 *
 * NÃO mexe em `subscriptionStatus`: contas `internal` são liberadas pelo tipo
 * de acesso, não pelo estado de cobrança — é o que `resolveAccess` já decide.
 * Assim o trial vencido continua registrado como fato histórico e o painel não
 * passa a contar essa conta como assinante paga.
 *
 * Uso no painel do Convex:
 *   internal.admin.grantInternalAccessByEmail
 *   { "email": "pessoa@exemplo.com" }
 */
export const grantInternalAccessByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const users = await ctx.db.query("users").collect();
    const target = users.find((u) => u.email.trim().toLowerCase() === email);

    if (!target) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `Nenhum usuário com o e-mail ${email}. Confira em Data → users.`,
      });
    }

    // `platformOwner` NÃO entra aqui, e a ausência é deliberada: ser admin e
    // ser interno são estados de SUPORTE e de COBRANÇA. Quem administra o
    // negócio ALTAR é concedido à parte, por `grantPlatformOwnerByEmail`.
    await ctx.db.patch(target._id, {
      role: "admin",
      accessType: "internal",
      accessExpiresAt: undefined,
    });

    const updated = await ctx.db.get(target._id);
    return {
      userId: target._id,
      email: target.email,
      name: target.name,
      role: updated?.role,
      accessType: updated?.accessType,
      subscriptionStatus: updated?.subscriptionStatus,
      blocked: updated ? resolveAccess(updated).blocked : null,
    };
  },
});

/**
 * Concede (ou remove) o DONO DA PLATAFORMA — quem administra o negócio ALTAR.
 *
 * ── POR QUE É UMA CONCESSÃO SEPARADA ────────────────────────────────────────
 * `grantInternalAccessByEmail` promove a admin e isenta de cobrança. Isso é
 * suporte. Administrar o negócio é outra coisa, e o dia em que houver uma
 * segunda pessoa no suporte, ela não deve herdar as métricas de receita nem a
 * ferramenta interna de IA só por ter sido promovida a admin.
 *
 * Por isso nada aqui é automático: nenhum caminho do produto chama esta
 * função, e nenhum estado de conta (`role: "admin"`, `accessType: "internal"`,
 * `"beta"`, ser dono do próprio tenant) leva a ela. É uma `internalMutation`
 * como a irmã acima — só roda pelo painel do Convex, por quem já tem acesso ao
 * deployment.
 *
 * ── E POR QUE NÃO PROMOVE A ADMIN JUNTO ─────────────────────────────────────
 * Seria conveniente e seria errado: misturaria de novo os dois conceitos que
 * esta função existe para separar. Conceder as duas coisas são duas chamadas,
 * e isso é a intenção.
 *
 * O e-mail é ARGUMENTO, digitado por quem opera o banco. Não existe nome nem
 * e-mail escrito em lugar nenhum do código — trocar quem é o dono não é mexer
 * em código.
 *
 * Uso no painel do Convex:
 *   internal.admin.grantPlatformOwnerByEmail
 *   { "email": "pessoa@exemplo.com" }            → concede
 *   { "email": "pessoa@exemplo.com", "revoke": true }  → remove
 */
export const grantPlatformOwnerByEmail = internalMutation({
  args: { email: v.string(), revoke: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const users = await ctx.db.query("users").collect();
    const target = users.find((u) => u.email.trim().toLowerCase() === email);

    if (!target) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `Nenhum usuário com o e-mail ${email}. Confira em Data → users.`,
      });
    }

    const conceder = args.revoke !== true;
    // Removido vira `undefined` e não `false`: o schema diz que ausente é
    // "não é dono", então guardar `false` seria escrever o padrão no banco.
    await ctx.db.patch(target._id, {
      platformOwner: conceder ? true : undefined,
    });

    // Quem mais tem — para quem operou ver na hora se a lista cresceu sem
    // querer. A varredura completa cabe: é uma função interna, rodada à mão.
    const donos = (await ctx.db.query("users").collect())
      .filter((u) => u.platformOwner === true)
      .map((u) => u.email);

    return {
      userId: target._id,
      email: target.email,
      name: target.name,
      platformOwner: conceder,
      // `role` vem junto de propósito: deixa visível que conceder a plataforma
      // não mexeu no papel de suporte, e nem deveria.
      role: target.role,
      accessType: target.accessType ?? "client",
      donosDaPlataforma: donos,
    };
  },
});

/**
 * Diagnóstico somente-leitura: como está uma conta hoje.
 * Também é interna — serve para conferir pelo painel do Convex, antes e depois
 * de `grantInternalAccessByEmail`, sem precisar entrar no app.
 */
export const inspectAccountByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const users = await ctx.db.query("users").collect();
    const target = users.find((u) => u.email.trim().toLowerCase() === email);
    if (!target) return null;

    const access = resolveAccess(target);
    return {
      userId: target._id,
      email: target.email,
      name: target.name,
      role: target.role,
      isAdmin: target.role === "admin",
      // Separado de `isAdmin` de propósito: são duas perguntas diferentes.
      platformOwner: target.platformOwner === true,
      accessType: target.accessType ?? "client",
      subscriptionStatus: target.subscriptionStatus,
      trialEndDate: target.trialEndDate,
      overdueSince: target.overdueSince,
      createdAt: new Date(target._creationTime).toISOString(),
      access,
    };
  },
});

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx);
    if (me._id === args.userId) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Não é possível excluir sua própria conta" });
    }

    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    }

    // 1. Dados do usuário (eventos + tudo que pende deles + tabelas do usuário).
    const summary = await deleteUserDataCascade(ctx, args.userId);

    // 2. Marca o e-mail como já tendo consumido o trial. Sem isso, cadastrar de
    //    novo com o mesmo e-mail devolveria outros 14 dias grátis.
    const email = target.email.trim().toLowerCase();
    if (email) {
      const existing = await ctx.db
        .query("deletedAccounts")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          deletedAt: new Date().toISOString(),
          deletedByUserId: me._id,
          hadTrial: true,
        });
      } else {
        await ctx.db.insert("deletedAccounts", {
          email,
          deletedAt: new Date().toISOString(),
          deletedByUserId: me._id,
          hadTrial: true,
        });
      }
    }

    // 3. Conta de login (Better Auth). Nunca derruba a exclusão: se o componente
    //    recusar, os dados já saíram e o e-mail já está travado contra novo
    //    trial — o resíduo é uma credencial órfã, não um usuário fantasma.
    const authRemoval = target.betterAuthId
      ? await deleteBetterAuthAccount(ctx, target.betterAuthId)
      : { removed: false, reason: "sem conta Better Auth vinculada" as const };

    // 4. Por fim, a linha do usuário.
    await ctx.db.delete(args.userId);

    return { ...summary, authRemoval };
  },
});

// ─── Interessados no ALTAR (landing page) ──────────────────────────────────

/**
 * Quem pediu demonstração ou entrou na lista beta pela landing page.
 *
 * Estes são potenciais CLIENTES DO SAAS ALTAR — não confundir com a tabela
 * `leads`, que é o funil comercial da decoradora (os clientes DELA). São
 * públicos diferentes, telas diferentes, e continuam separados de propósito.
 *
 * Existia só o caminho de ESCRITA (`landingLeads.submit`, chamada pela landing
 * para visitante não autenticado). Nenhuma query lia a tabela: as pessoas
 * pediam demonstração e caíam num banco que ninguém abria.
 *
 * `status` ausente significa "novo" — registros anteriores ao campo continuam
 * válidos, sem backfill.
 */
export const listLandingLeads = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const leads = await ctx.db.query("landingLeads").order("desc").collect();
    return leads.map((l) => ({
      _id: l._id,
      name: l.name,
      email: l.email,
      whatsapp: l.whatsapp,
      intent: l.intent,
      status: l.status ?? ("novo" as const),
      createdAt: new Date(l._creationTime).toISOString(),
    }));
  },
});

/**
 * Marca em que ponto está a conversa com o interessado.
 *
 * É acompanhamento comercial, não cobrança: não cria conta, não concede
 * acesso, não toca em assinatura. Converter alguém de verdade continua sendo
 * cadastro + Asaas, pelos caminhos normais.
 */
export const setLandingLeadStatus = mutation({
  args: {
    leadId: v.id("landingLeads"),
    status: v.union(
      v.literal("novo"),
      v.literal("contatado"),
      v.literal("convertido"),
      v.literal("descartado"),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Interessado não encontrado" });
    }
    await ctx.db.patch(args.leadId, { status: args.status });
  },
});

// ─── Ponte administrativa do Escritório Virtual ALTAR ─────────────────────

/**
 * Indicadores agregados para o escritório interno da ALTAR.
 *
 * Esta função é interna e somente leitura. Não retorna nomes, e-mails, IDs,
 * telefones ou qualquer dado individual de clientes. O acesso HTTP protegido
 * vive em officeBridgeHttp.ts.
 */
export const getOfficeSnapshot = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    // Os tetos são altos e existem para a varredura não ficar sem fim; quando
    // a carteira encostar neles, isto vira paginação de verdade.
    const users = await ctx.db.query("users").take(5_000);
    const eventsTotal = await ctx.db.query("events").take(20_000);

    return {
      vertical: "altar_decor" as const,
      generatedAt: new Date(args.now).toISOString(),
      metrics: panoramaDoNegocio(users, eventsTotal.length, args.now),
    };
  },
});
