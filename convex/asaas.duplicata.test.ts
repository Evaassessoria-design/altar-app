import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { resolveAccess } from "./lib/access";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — UM AVISO DA ASSINATURA ERRADA NÃO PODE DERRUBAR
// UM CLIENTE QUE ESTÁ PAGANDO.
//
// ── O ESTADO REAL QUE TORNOU ISTO POSSÍVEL ──────────────────────────────────
// Uma cliente ficou com DUAS assinaturas no MESMO cliente do Asaas:
//
//   sub_d6v66o4btfs5it63  cartão, cobrança CONFIRMED  ← sustenta o acesso
//   sub_lmil9bi1p0jhaw9e  sem meio de pagamento, OVERDUE + PENDING  ← duplicata
//
// As duas carregam o MESMO `externalReference` (o id da conta no ALTAR), porque
// as duas foram criadas pelo ALTAR para a mesma pessoa. `encontrarUsuarioPorRef`
// acha a conta pela referência ANTES de olhar qual assinatura é.
//
// Consequência, antes desta guarda:
//   · cancelar a duplicata no painel do Asaas cancelava o acesso da cliente;
//   · o atraso da cobrança fantasma marcava como inadimplente quem está em dia.
//
// Isso não é hipótese: a duplicata existe, está ACTIVE e tem uma cobrança
// OVERDUE hoje. Assim que o webhook voltar a apontar para o deployment certo e
// PAYMENT_OVERDUE for assinado, o aviso chega.
// ─────────────────────────────────────────────────────────────────────────────

const PAGA = "sub_d6v66o4btfs5it63";
const DUPLICATA = "sub_lmil9bi1p0jhaw9e";
const CLIENTE = "cus_000197335497";

/** A conta como ficou depois da normalização: paga, vinculada à correta. */
async function seedClientePagante(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
): Promise<Id<"users">> {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Cliente Pagante",
      email: "pagante@exemplo.com",
      role: "user",
      subscriptionStatus: "active",
      asaasCustomerId: CLIENTE,
      asaasSubscriptionId: PAGA,
      ...overrides,
    }),
  );
}

describe("cancelamento da DUPLICATA não cancela o acesso", () => {
  it("SUBSCRIPTION_DELETED da duplicata deixa a conta ativa", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t);

    const r = await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: DUPLICATA,
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("active");
    expect(r.matchedBy).toBe("outra_assinatura");
    expect(r.userId).toBe(userId);
  });

  it("e a cliente continua fora do paywall", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t);

    await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: DUPLICATA,
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(resolveAccess(user!).blocked).toBe(false);
  });

  it("o vínculo gravado NÃO é alterado pelo aviso da duplicata", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t);

    await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: DUPLICATA,
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.asaasSubscriptionId).toBe(PAGA);
  });

  it("CONTRAPROVA: o cancelamento da assinatura CERTA continua cancelando", async () => {
    // A guarda não pode virar um bloqueio geral de cancelamento — quem cancela
    // de verdade precisa perder o acesso, senão vira acesso vitalício grátis.
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t);

    const r = await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: PAGA,
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("cancelled");
    expect(r.matchedBy).toBe("externalReference");
    expect(resolveAccess(user!).blocked).toBe(true);
  });

  it("aviso SEM assinatura (só cliente) continua cancelando, como antes", async () => {
    // Nada muda para o formato antigo de aviso: sem as duas pontas, não há
    // divergência a detectar, e o comportamento anterior é preservado.
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t);

    await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("cancelled");
  });

  it("conta SEM assinatura gravada continua cancelando pelo cliente", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t, { asaasSubscriptionId: undefined });

    await t.mutation(internal.users.cancelSubscriptionByAsaasRef, {
      asaasSubscriptionId: DUPLICATA,
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("cancelled");
  });
});

describe("atraso da DUPLICATA não torna inadimplente quem está em dia", () => {
  it("PAYMENT_OVERDUE da cobrança fantasma não rebaixa a conta", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t);

    const r = await t.mutation(internal.users.markSubscriptionOverdueByRef, {
      externalReference: userId,
      asaasSubscriptionId: DUPLICATA,
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("active");
    expect(user?.overdueSince).toBeUndefined();
    expect(r.matchedBy).toBe("outra_assinatura");
  });

  it("a tolerância nem começa a correr por causa da duplicata", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t);

    await t.mutation(internal.users.markSubscriptionOverdueByRef, {
      externalReference: userId,
      asaasSubscriptionId: DUPLICATA,
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(resolveAccess(user!).blocked).toBe(false);
    expect(user?.overdueSince).toBeUndefined();
  });

  it("CONTRAPROVA: atraso na assinatura CERTA continua rebaixando", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t);

    await t.mutation(internal.users.markSubscriptionOverdueByRef, {
      externalReference: userId,
      asaasSubscriptionId: PAGA,
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("overdue");
    expect(typeof user?.overdueSince).toBe("number");
  });
});

describe("ativação é a exceção: dinheiro recosura o vínculo", () => {
  it("pagamento CONFIRMADO em outra assinatura ativa E repõe o vínculo", async () => {
    // Aqui a divergência é informação boa: o dinheiro entrou naquela
    // assinatura, logo é ela a real. Rebaixar exige prova; ativar segue o
    // dinheiro. Se esta guarda fosse aplicada à ativação, o caso Regina teria
    // ficado sem conserto automático.
    const t = convexTest(schema, modules);
    const userId = await seedClientePagante(t, {
      subscriptionStatus: "trial",
      asaasSubscriptionId: DUPLICATA,
    });

    await t.mutation(internal.users.activateSubscriptionByAsaasRef, {
      externalReference: userId,
      asaasSubscriptionId: PAGA,
      asaasCustomerId: CLIENTE,
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.subscriptionStatus).toBe("active");
    expect(user?.asaasSubscriptionId).toBe(PAGA);
  });
});

describe("a escolha por pagamento está LIGADA, não só escrita", () => {
  // `assinaturaVivaDoCliente` é uma função de action que fala com o Asaas por
  // `fetch` — não roda sob convex-test. Lógica certa num módulo que ninguém
  // chama seria pior que nada: parece corrigido e não está. Guarda estrutural,
  // como os demais deste repositório.
  const fonte = readFileSync(join(__dirname, "asaas.ts"), "utf8");
  const helper = fonte.slice(
    fonte.indexOf("async function assinaturaVivaDoCliente"),
    fonte.indexOf("async function cobrancasDaAssinatura"),
  );

  it("asaas.ts importa e usa o módulo de escolha", () => {
    expect(fonte).toContain('from "./lib/escolhaDeAssinatura"');
    expect(helper).toContain("escolherAssinatura(");
  });

  it("NÃO devolve mais o id gravado só por ele estar ACTIVE", () => {
    // O padrão antigo era um return imediato assim que o id gravado estivesse
    // ACTIVE. Era ele que entregava a duplicata e cegava a conferência.
    expect(helper).not.toMatch(/if\s*\(atual\?\.status === "ACTIVE"\)\s*return atual;/);
  });

  it("lista TODAS as assinaturas do cliente antes de decidir", () => {
    expect(helper).toContain("/subscriptions?customer=");
    const lista = helper.indexOf("/subscriptions?customer=");
    const decide = helper.indexOf("escolherAssinatura(");
    expect(lista).toBeGreaterThan(-1);
    expect(decide).toBeGreaterThan(lista);
  });

  it("consulta as cobranças quando há mais de uma ativa — é o que prova o pagamento", () => {
    expect(helper).toContain("cobrancasDaAssinatura(");
  });
});

describe("beta vencido + assinatura paga = acesso pelo billing", () => {
  it("o beta expirado não bloqueia nem isenta uma conta ativa", async () => {
    // Estado exato da conta normalizada: accessType "beta" com a data já
    // vencida, e a cobrança em dia. Prova, com banco real, que remover o beta
    // depois é seguro — o acesso já não depende dele.
    const t = convexTest(schema, modules);
    const ontem = Date.now() - 86_400_000;
    const userId = await seedClientePagante(t, {
      accessType: "beta",
      accessExpiresAt: ontem,
      trialEndDate: new Date(ontem).toISOString(),
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    const comBeta = resolveAccess(user!);

    expect(comBeta.blocked).toBe(false);
    expect(comBeta.betaExpired).toBe(true);
    // Não é cortesia: entra no MRR como cliente pagante.
    expect(comBeta.billingExempt).toBe(false);

    // E sem o beta o resultado é o mesmo — é isso que torna a limpeza segura.
    const semBeta = resolveAccess({ ...user!, accessType: undefined, accessExpiresAt: undefined });
    expect(semBeta.blocked).toBe(false);
    expect(semBeta.billingExempt).toBe(false);
    expect(semBeta.type).toBe("client");
  });
});
