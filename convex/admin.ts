import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc } from "./_generated/dataModel";
import { getOptionalUser } from "./lib/identity";
import { requireAdmin } from "./lib/adminGuard";
import { ALTAR_ADMIN_ROLE, effectiveSubscriptionStatus, resolveAccess } from "./lib/access";
import { deleteUserDataCascade } from "./lib/cascade";
import {
  campanhaPorSlug,
  carimbosAGravar,
  diasAte,
  estagioDe,
  funilDaCampanha as calcularFunil,
  origemDe,
  situacaoDaCampanha,
  taxasDaCampanha,
} from "./lib/campanha";
import { limparCampos } from "./lib/limparCampos";
import { prepararContatos } from "./lib/contatoDaCampanha";
import { analisar, lerArquivo, resumir } from "./lib/importacaoDeLeads";
import { normalizarE164 } from "./lib/central/telefone";
import { dataDoDia } from "./lib/dataDoDia";

/** As origens aceitas — espelha a união do schema. */
const origemValidator = v.union(
  v.literal("landing"),
  v.literal("instagram"),
  v.literal("indicacao"),
  v.literal("whatsapp"),
  v.literal("site"),
  v.literal("evento"),
  v.literal("live"),
  v.literal("prospeccao"),
  v.literal("outro"),
);

/**
 * As etapas aceitas — espelha a união do schema e de `lib/campanha.ts`.
 *
 * As três listas precisam concordar, e concordam por TESTE
 * (`campanha.live.test.ts`), não por confiança: um literal esquecido aqui
 * viraria uma etapa que a tela oferece e a mutation recusa.
 */
const estagioValidator = v.union(
  v.literal("novo"),
  v.literal("contato_preparado"),
  v.literal("contatado"),
  v.literal("respondeu"),
  v.literal("interessado"),
  v.literal("confirmou"),
  v.literal("participou"),
  v.literal("nao_participou"),
  v.literal("demonstracao"),
  v.literal("testando"),
  v.literal("convertido"),
  v.literal("descartado"),
);
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
/**
 * Teto da listagem de interessados.
 *
 * `collect()` sem limite responde bem com trinta e para em silêncio com três
 * mil — e uma campanha existe justamente para produzir três mil. A tela diz
 * quantos carregou e se há mais; nunca afirma um total que não contou.
 */
export const LIMITE_DE_INTERESSADOS = 200;

export const listLandingLeads = query({
  args: {
    /** Só os desta campanha. Ausente = todos. Filtro do BANCO, por índice. */
    campanha: v.optional(v.string()),
    /**
     * Só os nesta etapa. Ausente = todas.
     *
     * ── POR QUE O FILTRO É DO BANCO ─────────────────────────────────────────
     * Filtrar a página já carregada devolveria "os não abordados ENTRE os 200
     * primeiros" e a tela leria isso como "os não abordados". Com uma campanha
     * de trezentas pessoas, a resposta estaria errada exatamente quando
     * começasse a importar.
     *
     * O índice `by_campanha_status` responde os dois juntos. Sem campanha, a
     * etapa sozinha não tem índice próprio — e não vale criar um: escolher
     * etapa sem escolher campanha é pergunta de caixa de entrada inteira, que
     * o teto de 200 já atende.
     */
    status: v.optional(estagioValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    // Mais um do que o teto: é assim que se sabe que há próxima página sem
    // contar a tabela inteira.
    const buscar = () => {
      // ── "NOVO" É O AUSENTE, E O ÍNDICE NÃO SABE DISSO ───────────────────
      // `status` ausente SIGNIFICA "novo" (ver o schema), e é o estado de todo
      // interessado que chegou pela landing. Um índice casa o valor gravado,
      // não o significado do vazio: buscar `status === "novo"` devolveria só
      // quem foi marcado à mão e deixaria de fora exatamente as pessoas que
      // mais precisam ser abordadas.
      //
      // Por isso "novo" lê a campanha inteira e resolve o ausente com
      // `estagioDe`. As outras oito etapas são valores gravados de verdade e
      // usam o índice composto.
      if (args.campanha && args.status && args.status !== "novo") {
        return ctx.db
          .query("landingLeads")
          .withIndex("by_campanha_status", (q) =>
            q.eq("campanha", args.campanha).eq("status", args.status),
          )
          .order("desc")
          .take(LIMITE_DE_INTERESSADOS + 1);
      }
      if (args.campanha) {
        return ctx.db
          .query("landingLeads")
          .withIndex("by_campanha", (q) => q.eq("campanha", args.campanha))
          .order("desc")
          .take(LIMITE_DE_INTERESSADOS + 1);
      }
      return ctx.db.query("landingLeads").order("desc").take(LIMITE_DE_INTERESSADOS + 1);
    };

    const encontrados = await buscar();
    const temMais = encontrados.length > LIMITE_DE_INTERESSADOS;
    // Sem campanha, a etapa é aplicada depois — e a tela avisa quando o teto
    // foi atingido, porque aí a contagem é parcial e ela precisa saber.
    // Filtra depois quando o índice não resolveu sozinho: sem campanha, ou
    // com a etapa "novo", que é o ausente.
    const indiceResolveu = !!args.campanha && !!args.status && args.status !== "novo";
    const naEtapa =
      args.status && !indiceResolveu
        ? encontrados.filter((l) => estagioDe(l) === args.status)
        : encontrados;
    const leads = naEtapa.slice(0, LIMITE_DE_INTERESSADOS);

    return {
      temMais,
      leads: leads.map((l) => ({
        _id: l._id,
        name: l.name,
        email: l.email,
        whatsapp: l.whatsapp,
        intent: l.intent,
        status: estagioDe(l),
        origem: origemDe(l),
        campanha: l.campanha,
        empresa: l.empresa,
        instagram: l.instagram,
        site: l.site,
        cidade: l.cidade,
        estado: l.estado,
        segmento: l.segmento,
        eventosPorAno: l.eventosPorAno,
        observacoes: l.observacoes,
        proximoContato: l.proximoContato,
        ultimaInteracao: l.ultimaInteracao,
        // Ausente = não há registro de convite enviado. A tela escreve "sem
        // registro" em vez de calcular "há 57 anos" a partir de um zero.
        convidadoEm: l.marcosEm?.convidado,
        createdAt: new Date(l._creationTime).toISOString(),
      })),
    };
  },
});

/**
 * Procurar uma pessoa pelo que quem procura realmente lembra.
 *
 * ── QUATRO CAMINHOS, PORQUE SÃO QUATRO PERGUNTAS DIFERENTES ─────────────────
 * Quem abre esta tela lembra de UMA coisa: o nome dela, o nome do ateliê, o
 * telefone que respondeu no direct, ou o e-mail que ela mandou. Uma busca que
 * cobrisse só o nome mandaria a pessoa rolar duzentas linhas.
 *
 * Telefone e e-mail são buscas EXATAS por índice, porque são identificadores:
 * "11999998888" ou casa com um aparelho ou não casa com nenhum. Nome e empresa
 * são busca textual, porque são memória de gente.
 *
 * ── POR QUE O TELEFONE É NORMALIZADO ANTES ──────────────────────────────────
 * "(11) 99999-8888" e "5511999998888" são o mesmo aparelho e nenhum casa com o
 * outro por comparação de string. Sem normalizar, procurar pelo número copiado
 * do WhatsApp não acharia o registro digitado à mão — e a pessoa seria
 * cadastrada de novo, que é exatamente a duplicidade que este painel combate.
 */
export const buscarInteressados = query({
  args: {
    termo: v.string(),
    /** Restringe à campanha. Ausente = procura em todas. */
    campanha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const termo = args.termo.trim();
    // Uma letra casaria com metade da base e devolveria ruído com cara de
    // resultado. Abaixo de dois caracteres a busca não acontece.
    if (termo.length < 2) return { termo, resultados: [], curtoDemais: true };

    const encontrados = new Map<string, Doc<"landingLeads">>();
    const guardar = (leads: Doc<"landingLeads">[]) => {
      for (const l of leads) {
        // A campanha filtra aqui só nos caminhos EXATOS (e-mail e telefone),
        // que não têm por onde receber o filtro no índice. Os textuais já
        // vieram filtrados pelo próprio índice de busca.
        if (args.campanha && l.campanha !== args.campanha) continue;
        encontrados.set(l._id, l);
      }
    };

    // ── E-mail: exato, normalizado como a landing grava ──────────────────
    if (termo.includes("@")) {
      guardar(
        await ctx.db
          .query("landingLeads")
          .withIndex("by_email", (q) => q.eq("email", termo.toLowerCase()))
          .take(LIMITE_DA_BUSCA),
      );
    }

    // ── Telefone: exato, em E.164 ────────────────────────────────────────
    const e164 = normalizarE164(termo);
    if (e164) {
      guardar(
        await ctx.db
          .query("landingLeads")
          .withIndex("by_whatsapp_e164", (q) => q.eq("whatsappE164", e164))
          .take(LIMITE_DA_BUSCA),
      );
    }

    // ── Nome e empresa: textual, já filtrado por campanha no índice ──────
    for (const indice of ["search_nome", "search_empresa"] as const) {
      const campo = indice === "search_nome" ? ("name" as const) : ("empresa" as const);
      guardar(
        await ctx.db
          .query("landingLeads")
          .withSearchIndex(indice, (q) => {
            const busca = q.search(campo, termo);
            return args.campanha ? busca.eq("campanha", args.campanha) : busca;
          })
          // ── POR QUE SE LÊ MAIS DO QUE SE MOSTRA ─────────────────────────
          // Busca textual casa por TOKEN. "Beatriz Pacheco" bate com todas as
          // Beatrizes da campanha, e num grupo de 250 pessoas a exata pode
          // ficar fora das 25 primeiras conforme o ranking do backend.
          //
          // Depender do ranking para achar alguém cujo nome inteiro foi
          // digitado é apostar numa heurística que este código não controla —
          // e o resultado do erro é a tela dizer "ninguém encontrado" sobre
          // uma pessoa que está lá.
          //
          // Lê-se um lote maior e ordena-se aqui, com uma regra explícita: o
          // que a pessoa digitou por inteiro vem primeiro.
          .take(LOTE_DA_BUSCA),
      );
    }

    return {
      termo,
      curtoDemais: false,
      resultados: ordenarPorAderencia([...encontrados.values()], termo)
        .slice(0, LIMITE_DA_BUSCA)
        .map((l) => ({
        _id: l._id,
        name: l.name,
        email: l.email,
        whatsapp: l.whatsapp,
        empresa: l.empresa,
        cidade: l.cidade,
        estado: l.estado,
        status: estagioDe(l),
        origem: origemDe(l),
        campanha: l.campanha,
        convidadoEm: l.marcosEm?.convidado,
        ultimaInteracao: l.ultimaInteracao,
      })),
    };
  },
});

/** Teto do que é MOSTRADO. Quem procura uma pessoa não rola cem linhas. */
export const LIMITE_DA_BUSCA = 25;

/**
 * Teto do que é LIDO por caminho de busca, antes de ordenar.
 *
 * Maior do que o que aparece de propósito — ver o comentário em
 * `buscarInteressados`. Quatro vezes o mostrado cobre com folga uma campanha
 * de centenas de pessoas com nomes repetidos, e continua sendo uma leitura de
 * custo fixo.
 */
export const LOTE_DA_BUSCA = 100;

/**
 * O que a pessoa digitou por inteiro vem primeiro.
 *
 * Três degraus, e nenhum deles é "score": igual, começa com, e o resto. Uma
 * pontuação por similaridade seria mais sofisticada e impossível de explicar
 * quando alguém perguntasse por que a Marina certa ficou em sexto.
 */
function ordenarPorAderencia(
  leads: readonly Doc<"landingLeads">[],
  termo: string,
): Doc<"landingLeads">[] {
  const alvo = termo.trim().toLowerCase();
  const grau = (l: Doc<"landingLeads">): number => {
    const campos = [l.name, l.empresa].filter(Boolean).map((c) => c!.toLowerCase());
    if (campos.some((c) => c === alvo)) return 0;
    if (campos.some((c) => c.startsWith(alvo))) return 1;
    if (campos.some((c) => c.includes(alvo))) return 2;
    return 3;
  };
  return leads
    .map((l, i) => ({ l, i, g: grau(l) }))
    // O índice de origem desempata: dentro do mesmo grau a ordem que veio do
    // backend é preservada, e ela já é a ordem de relevância dele.
    .sort((a, b) => (a.g !== b.g ? a.g - b.g : a.i - b.i))
    .map((x) => x.l);
}

/**
 * O funil de uma campanha, em contagens — as sete perguntas de uma vez.
 *
 * "Quantos leads temos para a live? Quantos foram contatados? Quantos
 * demonstraram interesse? Quantos confirmaram? Quantos participaram? Quantos
 * iniciaram teste? Quantos viraram clientes?"
 *
 * Lê por ÍNDICE de campanha e conta com `lib/campanha.ts`, que é puro. A
 * contagem varre até um teto declarado e DIZ quando parou: uma campanha que
 * estoure o teto precisa avisar, não devolver um número menor com cara de
 * total.
 */
export const funilDaCampanha = query({
  args: { campanha: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const leads = await ctx.db
      .query("landingLeads")
      .withIndex("by_campanha", (q) => q.eq("campanha", args.campanha))
      .take(VARREDURA_DA_CAMPANHA + 1);

    const completa = leads.length <= VARREDURA_DA_CAMPANHA;
    const funil = calcularFunil(leads.slice(0, VARREDURA_DA_CAMPANHA));
    const campanha = campanhaPorSlug(args.campanha) ?? null;
    const hoje = dataDoDia();

    return {
      campanha,
      completa,
      ...funil,
      // As taxas saem da MESMA varredura. Uma segunda consulta leria a tabela
      // de novo e, entre as duas, um lead poderia mudar de etapa — e a tela
      // mostraria um funil que não fecha com as próprias porcentagens.
      taxas: taxasDaCampanha(funil),
      // Derivados da data, nunca gravados: um `status` editável ficaria em
      // "agendada" no dia em que ninguém lembrasse de virar a chave.
      situacao: campanha ? situacaoDaCampanha(campanha, hoje) : null,
      diasAte: campanha ? diasAte(campanha, hoje) : null,
    };
  },
});

/** Até onde a contagem varre antes de admitir que não viu tudo. */
export const VARREDURA_DA_CAMPANHA = 5_000;

/**
 * O que a IMPORTAÇÃO vai fazer com cada linha — antes de gravar qualquer coisa.
 *
 * ── POR QUE O SERVIDOR LÊ O ARQUIVO DE NOVO NA HORA DE IMPORTAR ─────────────
 * Preview e importação chamam a MESMA leitura sobre o MESMO conteúdo. Se o
 * navegador mandasse as linhas já analisadas, o que ele mostrou e o que o
 * banco gravaria seriam duas coisas diferentes na primeira divergência de
 * versão — e a divergência apareceria como registros que ninguém aprovou.
 *
 * ── A DUPLICIDADE É PROCURADA POR ÍNDICE, LINHA A LINHA ─────────────────────
 * Não se varre a tabela: para cada e-mail e cada telefone do arquivo, uma
 * busca indexada. O custo cresce com o ARQUIVO (teto de mil linhas), nunca com
 * a base — que é o que uma campanha existe para fazer crescer.
 */
async function analisarArquivo(ctx: QueryCtx, conteudo: string) {
  const leitura = lerArquivo(conteudo);
  if (leitura.erro || leitura.linhas.length === 0) {
    return { leitura, situacoes: [] as ReturnType<typeof analisar> };
  }

  const emails = new Set<string>();
  const telefones = new Set<string>();
  for (const linha of leitura.linhas) {
    const email = linha.email?.trim().toLowerCase();
    if (email) {
      const achado = await ctx.db
        .query("landingLeads")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (achado) emails.add(email);
    }
    const e164 = linha.whatsapp ? normalizarE164(linha.whatsapp) : null;
    if (e164) {
      const achado = await ctx.db
        .query("landingLeads")
        .withIndex("by_whatsapp_e164", (q) => q.eq("whatsappE164", e164))
        .first();
      if (achado) telefones.add(e164);
    }
  }

  return { leitura, situacoes: analisar(leitura.linhas, { emails, telefones }) };
}

export const previewDeImportacao = query({
  args: { conteudo: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { leitura, situacoes } = await analisarArquivo(ctx, args.conteudo);
    return {
      erro: leitura.erro,
      colunas: leitura.colunas,
      ignoradas: leitura.ignoradas,
      /** O arquivo passou do teto e foi cortado — a tela precisa dizer. */
      truncado: leitura.truncado,
      resumo: resumir(situacoes),
      // Só as primeiras: o preview é para conferir o FORMATO, não para ler
      // mil linhas numa tela.
      amostra: situacoes.slice(0, 25),
    };
  },
});

/**
 * Grava as linhas NOVAS. Nunca sobrescreve quem já está no banco.
 *
 * Duplicada é PULADA, e o relatório diz quantas. Quem já está cadastrado pode
 * ter sido trabalhado — etapa movida, observação escrita, porte preenchido —
 * e um arquivo velho apagaria tudo isso em silêncio.
 *
 * Esta mutation NÃO envia nada e não prepara envio: o que ela produz são
 * registros na fila de contato, que continua exigindo uma pessoa.
 */
export const importarInteressados = mutation({
  args: {
    conteudo: v.string(),
    campanha: v.optional(v.string()),
    origem: v.optional(origemValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { leitura, situacoes } = await analisarArquivo(ctx, args.conteudo);
    if (leitura.erro) {
      throw new ConvexError({ code: "INVALID", message: leitura.erro });
    }

    const hoje = dataDoDia();
    let criados = 0;
    for (const s of situacoes) {
      if (s.tipo !== "nova") continue;
      const d = s.dados;
      await ctx.db.insert("landingLeads", {
        name: d.name.trim(),
        // O e-mail é obrigatório no schema; a análise já garantiu que existe
        // e-mail OU telefone, então aqui o vazio é aceitável e explícito.
        email: d.email?.trim().toLowerCase() ?? "",
        whatsapp: d.whatsapp?.trim(),
        whatsappE164: d.whatsapp ? (normalizarE164(d.whatsapp) ?? undefined) : undefined,
        // Importação não é pedido de demonstração: quem entrou numa lista não
        // pediu nada. `beta` é o mais honesto dos dois valores existentes.
        intent: "beta" as const,
        status: "novo" as const,
        origem: args.origem ?? "prospeccao",
        campanha: args.campanha,
        empresa: d.empresa,
        instagram: d.instagram,
        site: d.site,
        cidade: d.cidade,
        estado: d.estado,
        segmento: d.segmento,
        // De quando é a lista. Telefone público de dois anos atrás não é
        // contato, é ruído.
        coletadoEm: hoje,
      });
      criados++;
    }

    return { criados, truncado: leitura.truncado, ...resumir(situacoes) };
  },
});

/**
 * A FILA DE CONTATO de uma campanha — quem falta abordar, com a mensagem pronta.
 *
 * ── O QUE ESTA CONSULTA FAZ, E ONDE ELA PARA ────────────────────────────────
 * Devolve texto. Não envia nada, não agenda envio, não muda etapa de ninguém e
 * não conhece número de telefone de saída. O último passo — apertar enviar —
 * é de uma pessoa, e continua sendo depois desta rodada.
 *
 * É a mesma trava que a Central sustenta desde que nasceu: uma campanha que
 * dispara sozinha erra em escala, e erro em escala com o nome da empresa em
 * cima não volta atrás.
 *
 * O rascunho é MODELO DE TEXTO, não chamada de IA — ver o cabeçalho de
 * `lib/contatoDaCampanha.ts`. Resumindo os três motivos: a live não pode
 * depender de uma chamada externa que falha ao vivo; quem revisa trinta
 * mensagens precisa que elas sejam previsíveis; e um modelo não tem como
 * afirmar um fato que ninguém preencheu.
 */
export const contatosAPreparar = query({
  args: { campanha: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const leads = await ctx.db
      .query("landingLeads")
      .withIndex("by_campanha", (q) => q.eq("campanha", args.campanha))
      .take(VARREDURA_DA_CAMPANHA + 1);

    const campanha = campanhaPorSlug(args.campanha);
    return {
      campanha: campanha ?? null,
      completa: leads.length <= VARREDURA_DA_CAMPANHA,
      // Campanha desconhecida não inventa data: sem ela não há convite a
      // escrever, e a fila volta vazia em vez de mandar "no dia undefined".
      contatos: campanha
        ? prepararContatos(leads.slice(0, VARREDURA_DA_CAMPANHA), campanha)
        : [],
    };
  },
});


export const setLandingLeadStatus = mutation({
  args: {
    leadId: v.id("landingLeads"),
    status: estagioValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Interessado não encontrado" });
    }
    // Mover de etapa É uma interação: sem carimbar a data aqui, "há quanto
    // tempo ninguém fala com essa pessoa" mediria só quem foi editado pelo
    // formulário completo.
    //
    // ── O PASSADO NÃO É REESCRITO ──────────────────────────────────────────
    // Mover de etapa carimba os marcos que aquela etapa comprova e que ainda
    // não tinham carimbo. Nunca apaga e nunca reescreve: voltar para "Convite
    // enviado" corrige o presente e mantém a data do convite original.
    //
    // Sem essa regra, toda correção de etapa clicada por engano zeraria o
    // relógio do follow-up — e a pessoa esquecida há uma semana voltaria para
    // o fim da fila, que é o oposto do que a fila existe para fazer.
    //
    // `ultimaInteracao` continua sendo reescrita: ela mede a ÚLTIMA conversa,
    // que é outra pergunta.
    const novos = carimbosAGravar(lead, args.status, Date.now());
    await ctx.db.patch(args.leadId, {
      status: args.status,
      ultimaInteracao: dataDoDia(),
      ...(novos ? { marcosEm: { ...lead.marcosEm, ...novos } } : {}),
    });
  },
});

/**
 * Preenche o que se descobre CONVERSANDO com o interessado.
 *
 * A landing pede três campos porque pedir mais afugenta quem está com pressa.
 * Empresa, cidade, porte e segmento aparecem depois — e sem lugar para
 * guardá-los, iam para uma planilha paralela, que é exatamente o que este
 * produto existe para acabar.
 *
 * `null` LIMPA, ausente não mexe: a convenção de `lib/limparCampos.ts`. Sem
 * ela, corrigir um campo preenchido por engano seria impossível.
 *
 * NÃO mexe em `status`: mudar de etapa é a outra mutation, porque é a outra
 * decisão. Um formulário que salva e move a pessoa de etapa junto faria toda
 * correção de telefone parecer avanço no funil.
 */
export const atualizarInteressado = mutation({
  args: {
    leadId: v.id("landingLeads"),
    empresa: v.optional(v.union(v.string(), v.null())),
    instagram: v.optional(v.union(v.string(), v.null())),
    site: v.optional(v.union(v.string(), v.null())),
    cidade: v.optional(v.union(v.string(), v.null())),
    estado: v.optional(v.union(v.string(), v.null())),
    segmento: v.optional(v.union(v.string(), v.null())),
    eventosPorAno: v.optional(v.union(v.number(), v.null())),
    observacoes: v.optional(v.union(v.string(), v.null())),
    proximoContato: v.optional(v.union(v.string(), v.null())),
    campanha: v.optional(v.union(v.string(), v.null())),
    origem: v.optional(origemValidator),
    /** Registra que alguém falou com a pessoa hoje. */
    registrarInteracao: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Interessado não encontrado" });
    }
    const { leadId, registrarInteracao, ...campos } = args;
    // Um número ilegível gravado aqui não estraga só a linha: estraga toda
    // ordenação por porte. Mesma trava de `lib/dinheiro.ts`, no menor formato.
    if (typeof campos.eventosPorAno === "number" && !Number.isFinite(campos.eventosPorAno)) {
      throw new ConvexError({ code: "INVALID", message: "Informe um número de eventos." });
    }
    await ctx.db.patch(leadId, {
      ...limparCampos(campos),
      ...(registrarInteracao ? { ultimaInteracao: dataDoDia() } : {}),
    });
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
