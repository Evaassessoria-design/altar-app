import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { resolveAccess } from "./lib/access";
import { interpretAsaasWebhook, eventDedupKey } from "./lib/asaasEvents";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — O CASO REAL DE PRODUÇÃO
//
// Uma cliente com Altar Pro pago no cartão, com recorrência funcionando no
// Asaas, continuou aparecendo como "Trial" no ALTAR: 0 assinantes ativos,
// MRR R$ 0,00. Ela ficou bloqueada no paywall depois que o trial venceu e
// precisou de acesso beta manual para conseguir trabalhar.
//
// A causa: a ativação procurava o usuário SÓ pelo `asaasCustomerId` e, ao não
// encontrar, saía em silêncio (`if (!user) return`). Sem log, sem erro, sem
// retentativa. O cancelamento já tinha cascata de chaves; a ativação, não.
//
// E o problema se realimentava: como ela continuava vendo "Trial", clicava em
// "Assinar" de novo — e o checkout criava uma SEGUNDA assinatura, porque só
// reconhecia assinatura existente com cobrança EM ABERTO, nunca PAGA.
//
// Estes testes prendem as duas pontas.
// ─────────────────────────────────────────────────────────────────────────────

async function seedUser(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
): Promise<Id<"users">> {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Cliente Pagante",
      email: "cliente@exemplo.com",
      role: "user",
      subscriptionStatus: "trial",
      trialEndDate: new Date(Date.now() - 86_400_000).toISOString(),
      ...overrides,
    }),
  );
}

const ler = (t: ReturnType<typeof convexTest>, id: Id<"users">) =>
  t.run(async (ctx) => ctx.db.get(id));

describe("o caso da produção: pagamento confirmado com cliente do Asaas divergente", () => {
  it("ativa pela referência que o ALTAR gravou, mesmo com o cliente errado", async () => {
    const t = convexTest(schema, modules);
    // O vínculo gravado aponta para OUTRO cliente do Asaas — é a situação que
    // fazia a ativação sair em silêncio.
    const userId = await seedUser(t, { asaasCustomerId: "cus_ANTIGO" });

    const r = await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasCustomerId: "cus_QUE_PAGOU",
      asaasSubscriptionId: "sub_CARTAO",
    });

    expect(r.matchedBy).toBe("externalReference");
    const user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("active");
  });

  it("RECOSTURA o vínculo — senão o próximo aviso falharia igual", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { asaasCustomerId: "cus_ANTIGO" });

    await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasCustomerId: "cus_QUE_PAGOU",
      asaasSubscriptionId: "sub_CARTAO",
    });

    const user = await ler(t, userId);
    expect(user!.asaasCustomerId).toBe("cus_QUE_PAGOU");
    // A assinatura que foi PAGA passa a ser a de referência: quando houve
    // duplicata, é ela a verdadeira — não a que ficou gravada.
    expect(user!.asaasSubscriptionId).toBe("sub_CARTAO");
  });

  it("com o vínculo corrigido, a conta sai do paywall", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { asaasCustomerId: "cus_ANTIGO" });

    const antes = await ler(t, userId);
    // Trial vencido: era exatamente o estado que exigiu o beta de contingência.
    expect(resolveAccess(antes!).blocked).toBe(true);

    await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasCustomerId: "cus_QUE_PAGOU",
    });

    const depois = await ler(t, userId);
    expect(resolveAccess(depois!).blocked).toBe(false);
  });

  it("contraprova: SÓ com o cliente divergente, ninguém é encontrado", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { asaasCustomerId: "cus_ANTIGO" });

    const r = await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      asaasCustomerId: "cus_QUE_PAGOU",
    });

    expect(r.matchedBy).toBe("not_found");
    expect((await ler(t, userId))!.subscriptionStatus).toBe("trial");
  });
});

describe("a cascata de chaves, na ordem", () => {
  it("acha pela assinatura quando não há referência", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { asaasSubscriptionId: "sub_X" });

    const r = await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      asaasSubscriptionId: "sub_X",
    });
    expect(r.matchedBy).toBe("subscription");
    expect(r.userId).toBe(userId);
  });

  it("acha pelo cliente — o caminho antigo continua funcionando", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { asaasCustomerId: "cus_Y" });

    const r = await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      asaasCustomerId: "cus_Y",
    });
    expect(r.matchedBy).toBe("customer");
    expect(r.userId).toBe(userId);
  });

  it("referência inválida não derruba a busca — cai para a próxima chave", async () => {
    const t = convexTest(schema, modules);
    // O Asaas pode devolver qualquer texto aqui. `ctx.db.get` lançaria exceção
    // com um id que não é de usuário; a busca precisa seguir em frente.
    const userId = await seedUser(t, { asaasCustomerId: "cus_Z" });

    const r = await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      externalReference: "isto-nao-e-um-id",
      asaasCustomerId: "cus_Z",
    });
    expect(r.matchedBy).toBe("customer");
    expect(r.userId).toBe(userId);
  });

  it("dois cadastros com o mesmo cliente NÃO derrubam o webhook", async () => {
    const t = convexTest(schema, modules);
    // `.unique()` lançava exceção aqui. O webhook devolveria 500, e o Asaas
    // PAUSA a fila depois de algumas falhas — travando as ativações de todos.
    await seedUser(t, { asaasCustomerId: "cus_DUPLO", email: "a@exemplo.com" });
    await seedUser(t, { asaasCustomerId: "cus_DUPLO", email: "b@exemplo.com" });

    const r = await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      asaasCustomerId: "cus_DUPLO",
    });
    expect(r.matchedBy).toBe("customer");
    expect(r.conflito).toBe(true);
  });
});

describe("renovação mantém o acesso", () => {
  it("segundo pagamento sobre conta ativa reafirma o estado", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {
      subscriptionStatus: "active",
      asaasCustomerId: "cus_R",
    });

    for (const _ of [1, 2, 3]) {
      await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
        asaasCustomerId: "cus_R",
        asaasSubscriptionId: "sub_R",
      });
    }

    const user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("active");
    expect(resolveAccess(user!).blocked).toBe(false);
  });

  it("pagamento após atraso zera a contagem de tolerância", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {
      subscriptionStatus: "overdue",
      overdueSince: Date.now() - 3 * 86_400_000,
      asaasCustomerId: "cus_A",
    });

    await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      asaasCustomerId: "cus_A",
    });

    const user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("active");
    expect(user!.overdueSince).toBeUndefined();
  });
});

describe("o que NÃO pode mudar", () => {
  it("atraso continua sem cancelar, e a tolerância segue valendo", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {
      subscriptionStatus: "active",
      asaasCustomerId: "cus_O",
    });

    await t.mutation(internal.users.markSubscriptionOverdueByRef, {
      asaasCustomerId: "cus_O",
    });

    const user = await ler(t, userId);
    expect(user!.subscriptionStatus).toBe("overdue");
    expect(user!.overdueSince).toBeTypeOf("number");
    // Dentro da tolerância o acesso continua.
    expect(resolveAccess(user!).blocked).toBe(false);
  });

  it("avisos repetidos de atraso não reiniciam a contagem", async () => {
    const t = convexTest(schema, modules);
    const inicio = Date.now() - 5 * 86_400_000;
    const userId = await seedUser(t, {
      subscriptionStatus: "overdue",
      overdueSince: inicio,
      asaasCustomerId: "cus_O2",
    });

    await t.mutation(internal.users.markSubscriptionOverdueByRef, {
      asaasCustomerId: "cus_O2",
    });

    expect((await ler(t, userId))!.overdueSince).toBe(inicio);
  });

  it("cancelamento continua funcionando pelas duas chaves", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {
      subscriptionStatus: "active",
      asaasCustomerId: "cus_C",
      asaasSubscriptionId: "sub_C",
    });

    const r = await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      asaasSubscriptionId: "sub_C",
    });
    expect(r.matchedBy).toBe("subscription");
    expect((await ler(t, userId))!.subscriptionStatus).toBe("cancelled");
  });

  it("conta beta e interna seguem liberadas, independentes da cobrança", async () => {
    const t = convexTest(schema, modules);
    const interna = await seedUser(t, {
      accessType: "internal",
      subscriptionStatus: "expired",
      email: "interna@exemplo.com",
    });
    const beta = await seedUser(t, {
      accessType: "beta",
      accessExpiresAt: Date.now() + 7 * 86_400_000,
      subscriptionStatus: "cancelled",
      email: "beta@exemplo.com",
    });

    for (const id of [interna, beta]) {
      const decisao = resolveAccess((await ler(t, id))!);
      expect(decisao.blocked).toBe(false);
      // Isento continua FORA do MRR — é o que mantém a métrica honesta.
      expect(decisao.billingExempt).toBe(true);
    }
  });
});

describe("o Painel Administrativo passa a refletir o pagamento", () => {
  it("uma conta ativada entra em assinantes ativos e no MRR", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { asaasCustomerId: "cus_M" });

    await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasCustomerId: "cus_M",
    });

    // Mesma conta que `admin.getStats` faz: cobráveis com status efetivo ativo.
    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    const cobraveis = users.filter((u) => !resolveAccess(u).billingExempt);
    const ativos = cobraveis.filter((u) => u.subscriptionStatus === "active").length;

    expect(ativos).toBe(1);
    expect(ativos * 119.9).toBeCloseTo(119.9);
  });
});

describe("idempotência dos avisos", () => {
  it("o mesmo aviso reserva a chave uma vez só", async () => {
    const t = convexTest(schema, modules);
    const aviso = { dedupKey: "evt_ABC", event: "PAYMENT_CONFIRMED" };

    const primeira = await t.mutation(internal.asaasWebhookLog.claim, aviso);
    const segunda = await t.mutation(internal.asaasWebhookLog.claim, aviso);

    expect(primeira.status).toBe("claimed");
    expect(segunda.status).toBe("duplicate");
  });

  it("a chave é estável para o mesmo fato e diferente entre fatos", () => {
    const base = {
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_1", customer: "cus_1", status: "CONFIRMED" },
    };
    expect(eventDedupKey(base)).toBe(eventDedupKey({ ...base }));
    expect(eventDedupKey(base)).not.toBe(
      eventDedupKey({ ...base, payment: { ...base.payment, id: "pay_2" } }),
    );
    // O id do evento, quando vem, manda.
    expect(eventDedupKey({ ...base, id: "evt_9" })).toBe("evt_9");
  });

  it("reprocessar a ativação não duplica nem altera nada", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { asaasCustomerId: "cus_I" });

    await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      asaasCustomerId: "cus_I",
      asaasSubscriptionId: "sub_I",
    });
    const primeiro = await ler(t, userId);

    await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      asaasCustomerId: "cus_I",
      asaasSubscriptionId: "sub_I",
    });
    const segundo = await ler(t, userId);

    expect(segundo!.subscriptionStatus).toBe(primeiro!.subscriptionStatus);
    expect(segundo!.asaasSubscriptionId).toBe(primeiro!.asaasSubscriptionId);
    const total = await t.run(async (ctx) => (await ctx.db.query("users").collect()).length);
    expect(total).toBe(1);
  });
});

describe("a leitura do aviso aproveita a referência do ALTAR", () => {
  it("PAYMENT_CONFIRMED carrega a referência para a ativação", () => {
    const intent = interpretAsaasWebhook({
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_1",
        customer: "cus_1",
        subscription: "sub_1",
        externalReference: "k57abc",
      },
    });
    expect(intent).toMatchObject({
      action: "activate",
      externalReference: "k57abc",
      customerId: "cus_1",
      subscriptionId: "sub_1",
    });
  });

  it("ativa mesmo quando o aviso NÃO traz cliente", () => {
    // Era o `&& customerId` que transformava este aviso em nada.
    const intent = interpretAsaasWebhook({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1", externalReference: "k57abc" },
    });
    expect(intent.action).toBe("activate");
  });

  it("aviso sem nenhuma das três chaves continua sendo ignorado", () => {
    expect(interpretAsaasWebhook({ event: "PAYMENT_CONFIRMED" }).action).toBe("ignore");
  });
});
