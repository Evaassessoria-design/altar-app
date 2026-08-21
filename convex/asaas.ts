"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
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
      // 1a. Cria o customer.
      const customer = (await asaasFetch("/customers", {
        method: "POST",
        body: JSON.stringify(customerPayload),
      })) as { id: string };

      customerId = customer.id;
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

    // ── 2. JÁ EXISTE ASSINATURA? Então é para PAGAR, não para assinar de novo ──
    //
    // Quem está inadimplente agora chega aqui: com a tolerância implementada, a
    // conta em atraso passa a ser bloqueada e cai no paywall, cujo botão aponta
    // para esta action. Sem esta checagem, cada clique criaria uma SEGUNDA
    // assinatura mensal no Asaas — o cliente passaria a ser cobrado em dobro,
    // que é pior do que o problema corrigido.
    //
    // A cobrança em aberto da assinatura existente é o caminho certo de volta.
    // Se não houver nenhuma (assinatura encerrada, ciclo já quitado), seguimos
    // para a criação normal logo abaixo — comportamento idêntico ao anterior.
    if (user.asaasSubscriptionId) {
      const pendentes = (await asaasFetch(
        `/payments?subscription=${user.asaasSubscriptionId}&limit=10`,
      )) as {
        data?: Array<{ id: string; status?: string; invoiceUrl?: string | null }>;
      };

      const emAberto = (pendentes.data ?? []).find((p) =>
        ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"].includes(p.status ?? ""),
      );

      if (emAberto) {
        return {
          paymentUrl:
            emAberto.invoiceUrl ?? `https://www.asaas.com/i/${emAberto.id}`,
          customerId,
        };
      }
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
