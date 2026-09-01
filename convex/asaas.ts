"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import { requireIdentity } from "./lib/identity";
import { isBillingExempt } from "./lib/access";

// Base URL por ambiente. ASAAS_ENV="sandbox" usa o sandbox do Asaas (homologação,
// sem cobrança real); qualquer outro valor (ou ausente) usa PRODUÇÃO.
// A ASAAS_API_KEY DEVE corresponder ao ambiente selecionado — nunca misturar
// chave de sandbox com URL de produção (ou vice-versa).
const ASAAS_ENV = process.env.ASAAS_ENV === "sandbox" ? "sandbox" : "production";
const ASAAS_BASE =
  ASAAS_ENV === "sandbox"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3";

function asaasHeaders() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new ConvexError({ message: "ASAAS_API_KEY não configurada. Adicione nos Secrets do Altar.", code: "BAD_REQUEST" });
  return {
    "Content-Type": "application/json",
    "access_token": key,
    "User-Agent": "Altar-SaaS/1.0",
  };
}

async function asaasFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...options,
    headers: {
      ...asaasHeaders(),
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ConvexError({ message: `Asaas retornou resposta inválida: ${text.slice(0, 200)}`, code: "EXTERNAL_SERVICE_ERROR" });
  }

  if (!res.ok) {
    const msg =
      (data as { errors?: Array<{ description: string }> })?.errors?.[0]?.description ??
      (data as { message?: string })?.message ??
      `Erro Asaas HTTP ${res.status}`;
    throw new ConvexError({ message: msg, code: "EXTERNAL_SERVICE_ERROR" });
  }

  return data;
}

/**
 * Igual a `asaasFetch`, mas devolve `null` em vez de lançar quando o Asaas
 * responde erro.
 *
 * Necessário para CONSULTAR: uma assinatura apagada responde 404, e um 404 numa
 * consulta de diagnóstico não pode derrubar o checkout inteiro.
 */
async function asaasFetchOptional(path: string): Promise<unknown | null> {
  try {
    return await asaasFetch(path);
  } catch {
    return null;
  }
}

type AsaasSubscription = { id: string; status?: string; paymentLink?: string | null };
type AsaasPayment = {
  id: string;
  status?: string;
  invoiceUrl?: string | null;
  dateCreated?: string;
};

/** Cobranças que ainda podem ser pagas — levam o cliente de volta ao pagamento. */
const STATUS_EM_ABERTO = ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"];

/** Cobranças que JÁ FORAM PAGAS — provam que a assinatura está em dia. */
const STATUS_PAGO = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

/**
 * A assinatura VIVA deste cliente no Asaas, se houver.
 *
 * ── POR QUE NÃO BASTA OLHAR O ID GRAVADO ────────────────────────────────────
 * O id gravado no ALTAR pode apontar para a assinatura errada: foi o que
 * aconteceu quando o checkout criou uma segunda assinatura e sobrescreveu o
 * vínculo da primeira — a que estava efetivamente sendo paga. Por isso, quando
 * o id gravado não estiver ativo, perguntamos ao Asaas quais assinaturas ATIVAS
 * aquele cliente tem. Isso encontra inclusive uma assinatura criada à mão no
 * painel do Asaas, que o ALTAR nunca soube que existia.
 */
async function assinaturaVivaDoCliente(
  customerId: string,
  idGravado: string | undefined,
): Promise<AsaasSubscription | null> {
  if (idGravado) {
    const atual = (await asaasFetchOptional(
      `/subscriptions/${idGravado}`,
    )) as AsaasSubscription | null;
    if (atual?.status === "ACTIVE") return atual;
  }

  const lista = (await asaasFetchOptional(
    `/subscriptions?customer=${customerId}&limit=20`,
  )) as { data?: AsaasSubscription[] } | null;

  return (lista?.data ?? []).find((a) => a.status === "ACTIVE") ?? null;
}

/** Cobranças de uma assinatura, da mais recente para a mais antiga. */
async function cobrancasDaAssinatura(subscriptionId: string): Promise<AsaasPayment[]> {
  const res = (await asaasFetchOptional(
    `/payments?subscription=${subscriptionId}&limit=20`,
  )) as { data?: AsaasPayment[] } | null;
  return res?.data ?? [];
}

/** O endereço da fatura, com os fallbacks que o Asaas admite. */
function urlDaCobranca(p: AsaasPayment): string {
  return p.invoiceUrl ?? `https://www.asaas.com/i/${p.id}`;
}

// ── Create Asaas customer + subscription and return payment URL ─────────────

export const createCheckoutSession = action({
  args: {},
  handler: async (ctx): Promise<{ paymentUrl: string; customerId: string }> => {
    await requireIdentity(ctx);

    // Reutiliza os dados da empresa já cadastrados (perfil do usuário). O usuário
    // NÃO digita CPF/CNPJ aqui — os dados vêm de "Dados da Empresa" (Configurações).
    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user) {
      throw new ConvexError({ message: "Usuário não encontrado", code: "NOT_FOUND" });
    }

    // Contas isentas de cobrança (internal, ou beta vigente) não criam customer
    // nem assinatura no Asaas. A guarda fica ANTES de qualquer chamada externa,
    // então nada é registrado lá mesmo se a UI for contornada.
    if (isBillingExempt(user)) {
      throw new ConvexError({
        code: "BILLING_EXEMPT",
        message: "Esta conta tem acesso liberado e não gera cobrança.",
      });
    }

    // Validação amigável: exige os dados obrigatórios do Asaas ANTES de chamá-lo.
    const missing: string[] = [];
    if (!user.name?.trim()) missing.push("nome");
    if (!user.email?.trim()) missing.push("e-mail");
    if (!user.phone?.trim()) missing.push("telefone");
    if (!user.cpfCnpj?.trim()) missing.push("CPF/CNPJ");
    if (missing.length > 0) {
      throw new ConvexError({
        code: "PROFILE_INCOMPLETE",
        message: `Complete os dados da empresa (${missing.join(", ")}) em Dados da Empresa para continuar.`,
      });
    }

    // Payload do customer com os dados atuais da empresa (inclui cpfCnpj).
    const customerPayload = {
      name: user.name,
      email: user.email,
      phone: user.phone,
      mobilePhone: user.phone,
      cpfCnpj: user.cpfCnpj!.replace(/\D/g, ""),
      externalReference: user._id,
      notificationDisabled: false,
    };

    let customerId = user.asaasCustomerId ?? "";

    if (!customerId) {
      // 1a. Antes de criar, PROCURA um cliente já criado para este mesmo
      // usuário. `externalReference` é o `_id` do ALTAR — se existe cliente com
      // ele, é este usuário, e criar outro só produziria um cliente duplicado
      // no Asaas cujos pagamentos não casariam com o id gravado aqui.
      //
      // Isso cobre o caso em que o cliente foi criado mas a gravação de volta
      // no ALTAR não aconteceu (falha de rede, aba fechada, dois cliques).
      const existentes = (await asaasFetchOptional(
        `/customers?externalReference=${encodeURIComponent(user._id)}&limit=1`,
      )) as { data?: Array<{ id: string }> } | null;

      const reaproveitado = existentes?.data?.[0]?.id;

      if (reaproveitado) {
        customerId = reaproveitado;
        // Mantém os dados em dia, como no ramo 1b.
        await asaasFetch(`/customers/${customerId}`, {
          method: "POST",
          body: JSON.stringify(customerPayload),
        });
      } else {
        const customer = (await asaasFetch("/customers", {
          method: "POST",
          body: JSON.stringify(customerPayload),
        })) as { id: string };
        customerId = customer.id;
      }

      await ctx.runMutation(internal.users.setAsaasCustomer, {
        userId: user._id,
        asaasCustomerId: customerId,
      });
    } else {
      // 1b. Customer já existe — pode ter sido criado antes do cpfCnpj. Atualiza
      // com os dados atuais (Asaas: POST /customers/{id}) para garantir o
      // cpfCnpj ANTES de gerar a cobrança e evitar a rejeição do Asaas.
      await asaasFetch(`/customers/${customerId}`, {
        method: "POST",
        body: JSON.stringify(customerPayload),
      });
    }

    // ── 2. JÁ EXISTE ASSINATURA VIVA? Então é para PAGAR, não para assinar ────
    //
    // ── O BUG QUE ESTA SEÇÃO CORRIGE ─────────────────────────────────────────
    // A versão anterior só reconhecia uma assinatura existente se ela tivesse
    // uma cobrança EM ABERTO. Cobrança PAGA não estava na lista. Resultado: a
    // cliente que já tinha pago e clicava em "Assinar" de novo — porque a
    // ativação não havia funcionado e ela continuava vendo "Trial" — ganhava
    // uma SEGUNDA assinatura mensal. Foi assim que uma cliente pagante acabou
    // com duas assinaturas de R$ 119,90 no Asaas.
    //
    // A regra agora é simples e sem exceção: EXISTINDO assinatura ativa, o
    // ALTAR nunca cria outra. Só decide para onde mandar a cliente.
    const assinaturaViva = await assinaturaVivaDoCliente(
      customerId,
      user.asaasSubscriptionId,
    );

    if (assinaturaViva) {
      // O vínculo gravado pode apontar para a assinatura errada — foi o que
      // aconteceu quando a duplicata sobrescreveu a original. A assinatura viva
      // é a verdade.
      if (assinaturaViva.id !== user.asaasSubscriptionId) {
        await ctx.runMutation(internal.users.setAsaasSubscription, {
          userId: user._id,
          asaasSubscriptionId: assinaturaViva.id,
        });
      }

      const cobrancas = await cobrancasDaAssinatura(assinaturaViva.id);

      // 2a. Tem cobrança em aberto: é o caminho de volta ao pagamento.
      const emAberto = cobrancas.find((p) => STATUS_EM_ABERTO.includes(p.status ?? ""));
      if (emAberto) {
        return { paymentUrl: urlDaCobranca(emAberto), customerId };
      }

      // 2b. Nada em aberto e já existe cobrança PAGA: a assinatura está em dia
      // e quem está errado é o ALTAR. Corrige aqui mesmo, sem depender do
      // webhook — é exatamente a situação que deixou uma cliente pagante presa
      // no paywall.
      if (cobrancas.some((p) => STATUS_PAGO.includes(p.status ?? ""))) {
        await ctx.runMutation(internal.users.activateSubscriptionByAsaasRef, {
          externalReference: user._id,
          asaasSubscriptionId: assinaturaViva.id,
          asaasCustomerId: customerId,
        });
        throw new ConvexError({
          code: "SUBSCRIPTION_ALREADY_ACTIVE",
          message:
            "Sua assinatura já está ativa e em dia. Acabamos de atualizar seu acesso — atualize a página.",
        });
      }

      // 2c. Assinatura ativa, sem cobrança em aberto e sem nenhuma paga. Não
      // criamos outra: mandamos para a fatura mais recente, ou para a área do
      // cliente no Asaas. Criar uma segunda assinatura aqui é o erro antigo.
      const maisRecente = cobrancas[0];
      return {
        paymentUrl: maisRecente
          ? urlDaCobranca(maisRecente)
          : `https://www.asaas.com/c/${customerId}`,
        customerId,
      };
    }

    // 3. Create monthly subscription — UNDEFINED lets customer pick payment method
    const today = new Date();
    const nextDue = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    const subscription = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED",
        value: 119.9,
        nextDueDate: nextDue,
        cycle: "MONTHLY",
        description: "Altar Pro — Plano Mensal",
        externalReference: user._id,
        // No maxPayments = indefinite
      }),
    }) as { id: string; paymentLink: string | null };

    // Save subscriptionId immediately so webhook can match
    await ctx.runMutation(internal.users.setAsaasSubscription, {
      userId: user._id,
      asaasSubscriptionId: subscription.id,
    });

    // 4. Get payment URL from first generated charge
    const payments = await asaasFetch(
      `/payments?subscription=${subscription.id}&limit=1`,
    ) as {
      data: Array<{ invoiceUrl: string | null; id: string }>;
    };

    const firstPayment = payments.data?.[0];
    const paymentUrl =
      firstPayment?.invoiceUrl ??
      (firstPayment?.id ? `https://www.asaas.com/i/${firstPayment.id}` : null) ??
      subscription.paymentLink ??
      "https://www.asaas.com";

    return { paymentUrl, customerId };
  },
});

// ── Reconciliação: conferir o Asaas sem depender do webhook ─────────────────
//
// ── POR QUE EXISTE ──────────────────────────────────────────────────────────
// O webhook é a única fonte de ativação — e webhook é frágil por natureza: a
// fila do Asaas pode estar pausada, o evento pode não estar habilitado, o
// segredo pode ter mudado. Quando ele falha, o dinheiro entra e o cliente fica
// preso no paywall, sem que ninguém perceba. Foi o que aconteceu.
//
// A reconciliação PERGUNTA ao Asaas em vez de esperar ser avisada. É a rede de
// segurança que faltava.
//
// ── SÓ ATIVA, NUNCA REBAIXA ─────────────────────────────────────────────────
// Uma leitura de rotina jamais tira acesso de alguém. Cancelamento e
// inadimplência continuam vindo exclusivamente dos avisos do Asaas, que são o
// fato consumado. Se a conferência apenas não encontrar assinatura paga, ela
// registra o que viu e não mexe em nada.

type ResultadoReconciliacao = {
  userId: string;
  status: "ativada" | "ja_ativa" | "sem_assinatura_paga" | "sem_cliente";
  detalhe: string;
};

async function conferirNoAsaas(
  ctx: { runMutation: (ref: never, args: never) => Promise<unknown> },
  conta: {
    userId: string;
    asaasCustomerId?: string;
    asaasSubscriptionId?: string;
    subscriptionStatus?: string;
  },
): Promise<ResultadoReconciliacao> {
  if (!conta.asaasCustomerId) {
    return {
      userId: conta.userId,
      status: "sem_cliente",
      detalhe: "Conta sem cliente no Asaas — nunca iniciou uma assinatura.",
    };
  }

  const assinatura = await assinaturaVivaDoCliente(
    conta.asaasCustomerId,
    conta.asaasSubscriptionId,
  );

  if (!assinatura) {
    return {
      userId: conta.userId,
      status: "sem_assinatura_paga",
      detalhe: "Nenhuma assinatura ativa no Asaas para este cliente.",
    };
  }

  const cobrancas = await cobrancasDaAssinatura(assinatura.id);
  const paga = cobrancas.find((p) => STATUS_PAGO.includes(p.status ?? ""));

  if (!paga) {
    return {
      userId: conta.userId,
      status: "sem_assinatura_paga",
      detalhe: `Assinatura ${assinatura.id} está ativa, mas sem nenhuma cobrança paga.`,
    };
  }

  if (conta.subscriptionStatus === "active") {
    return {
      userId: conta.userId,
      status: "ja_ativa",
      detalhe: `Assinatura ${assinatura.id} paga e conta já ativa. Nada a fazer.`,
    };
  }

  await ctx.runMutation(internal.users.activateSubscriptionByAsaasRef as never, {
    externalReference: conta.userId,
    asaasSubscriptionId: assinatura.id,
    asaasCustomerId: conta.asaasCustomerId,
  } as never);

  await ctx.runMutation(internal.asaasWebhookLog.recordReconciliation as never, {
    userId: conta.userId,
    outcome: "applied",
    detail: `Ativada pela conferência: cobrança ${paga.id} paga na assinatura ${assinatura.id}.`,
    asaasCustomerId: conta.asaasCustomerId,
    asaasSubscriptionId: assinatura.id,
  } as never);

  return {
    userId: conta.userId,
    status: "ativada",
    detalhe: `Cobrança ${paga.id} está paga. Acesso liberado.`,
  };
}

/**
 * Confere UMA conta contra o Asaas. Disparada pelo Painel Administrativo.
 *
 * Leitura no Asaas; escrita apenas no ALTAR. Nenhum dado do Asaas é alterado.
 */
export const reconcileSubscription = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<ResultadoReconciliacao> => {
    await requireIdentity(ctx);
    const ehAdmin = await ctx.runQuery(api.admin.isAdmin);
    if (!ehAdmin) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Acesso restrito a administradores",
      });
    }

    const conta = await ctx.runQuery(internal.users.getBillingRef, { userId: args.userId });
    if (!conta) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    }

    return conferirNoAsaas(ctx as never, conta);
  },
});

/**
 * Conferência diária das contas que pagaram mas não constam como ativas.
 *
 * Roda sobre um conjunto pequeno: só contas que TÊM cliente no Asaas e ainda
 * não estão ativas nem canceladas. Uma conta em trial que nunca tentou assinar
 * não tem cliente no Asaas e nem é consultada.
 */
export const reconcileStaleSubscriptions = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ conferidas: number; ativadas: number }> => {
    const candidatas = await ctx.runQuery(
      internal.asaasWebhookLog.listCandidatesForReconciliation,
      { limit: args.limit ?? 50 },
    );

    let ativadas = 0;
    for (const conta of candidatas) {
      try {
        const r = await conferirNoAsaas(ctx as never, conta);
        if (r.status === "ativada") ativadas += 1;
      } catch {
        // Uma conta problemática não pode interromper a conferência das outras.
      }
    }

    return { conferidas: candidatas.length, ativadas };
  },
});

// ── Cancel subscription ─────────────────────────────────────────────────────

/**
 * Cancela a assinatura DO PRÓPRIO usuário logado.
 *
 * SEGURANÇA: a versão anterior recebia o id da assinatura pelo navegador e só
 * conferia se havia alguém logado — nunca se aquela assinatura era de quem
 * chamou. Qualquer usuário autenticado que soubesse (ou descobrisse) o id de
 * outra empresa conseguia cancelar a assinatura dela no Asaas.
 *
 * Agora o id vem SEMPRE do cadastro do usuário da sessão. O argumento continua
 * sendo aceito, mas é IGNORADO: isso evita que uma aba antiga, aberta durante o
 * deploy e ainda enviando o parâmetro, receba erro de validação. Pode ser
 * removido assim que não houver mais clientes antigos em uso.
 */
export const cancelSubscription = action({
  args: { asaasSubscriptionId: v.optional(v.string()) },
  handler: async (ctx): Promise<{ ok: boolean }> => {
    await requireIdentity(ctx);

    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user) {
      throw new ConvexError({ message: "Usuário não encontrado", code: "NOT_FOUND" });
    }

    const subscriptionId = user.asaasSubscriptionId;
    if (!subscriptionId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Nenhuma assinatura ativa encontrada nesta conta.",
      });
    }

    await asaasFetch(`/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    });

    await ctx.runMutation(internal.users.cancelSubscriptionBySubscriptionId, {
      asaasSubscriptionId: subscriptionId,
    });

    return { ok: true };
  },
});

// ── Get Asaas customer portal URL ────────────────────────────────────────────

export const getCustomerPortalUrl = action({
  args: { asaasCustomerId: v.string() },
  handler: async (_ctx, args): Promise<{ url: string }> => {
    return { url: `https://www.asaas.com/c/${args.asaasCustomerId}` };
  },
});
