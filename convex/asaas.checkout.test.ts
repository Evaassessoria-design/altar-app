import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — A DUPLICAÇÃO DE ASSINATURA
//
// Uma cliente acabou com DUAS assinaturas de R$ 119,90/mês no Asaas. O guarda
// que deveria impedir isso só reconhecia uma assinatura existente se ela
// tivesse cobrança EM ABERTO:
//
//   const emAberto = pendentes.find(p => ["PENDING","OVERDUE",...].includes(p.status))
//   if (emAberto) return ...
//   // cobrança PAGA caía aqui e criava OUTRA assinatura
//
// Ou seja: falhava exatamente para quem já tinha PAGO. E como a ativação
// também estava quebrada, a cliente continuava vendo "Trial" e clicava de novo.
//
// `createCheckoutSession` é uma action que fala com a API do Asaas por `fetch`,
// então não roda sob convex-test. Estes guardas leem a fonte — como os demais
// guardas estruturais deste repositório.
// ─────────────────────────────────────────────────────────────────────────────

const fonte = readFileSync(join(__dirname, "asaas.ts"), "utf8");
const checkout = fonte.slice(
  fonte.indexOf("export const createCheckoutSession"),
  fonte.indexOf("// ── Reconciliação"),
);

describe("existindo assinatura ativa, o ALTAR NUNCA cria outra", () => {
  it("procura a assinatura viva antes de qualquer criação", () => {
    const procura = checkout.indexOf("assinaturaVivaDoCliente(");
    const cria = checkout.indexOf('asaasFetch("/subscriptions"');
    expect(procura).toBeGreaterThan(-1);
    expect(cria).toBeGreaterThan(-1);
    expect(procura, "a busca precisa vir ANTES do POST de assinatura").toBeLessThan(cria);
  });

  it("todo caminho com assinatura viva SAI antes de criar", () => {
    // O bloco `if (assinaturaViva)` precisa terminar em return/throw em todos
    // os ramos — é isso que garante que a criação fique inalcançável.
    const bloco = checkout.slice(
      checkout.indexOf("if (assinaturaViva) {"),
      checkout.indexOf('asaasFetch("/subscriptions"'),
    );
    // 2a cobrança em aberto, 2b já paga (throw), 2c fatura mais recente.
    expect((bloco.match(/return \{/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(bloco).toContain("SUBSCRIPTION_ALREADY_ACTIVE");
  });

  it("cobrança PAGA passou a contar — era o buraco exato do bug", () => {
    expect(fonte).toContain("const STATUS_PAGO");
    for (const status of ["CONFIRMED", "RECEIVED"]) {
      expect(fonte).toContain(status);
    }
    expect(checkout).toContain("STATUS_PAGO.includes");
  });

  it("os status em aberto continuam levando o cliente de volta à fatura", () => {
    expect(fonte).toContain("const STATUS_EM_ABERTO");
    for (const status of ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"]) {
      expect(fonte).toContain(status);
    }
    expect(checkout).toContain("STATUS_EM_ABERTO.includes");
  });

  it("consulta o Asaas, não só o id gravado — que pode estar errado", () => {
    // O id gravado apontava para a assinatura duplicada, não para a paga.
    const helper = fonte.slice(
      fonte.indexOf("async function assinaturaVivaDoCliente"),
      fonte.indexOf("async function cobrancasDaAssinatura"),
    );
    expect(helper).toContain("/subscriptions?customer=");
    expect(helper).toContain('a.status === "ACTIVE"');
  });

  it("corrige o vínculo quando a assinatura viva é outra", () => {
    expect(checkout).toContain("assinaturaViva.id !== user.asaasSubscriptionId");
    expect(checkout).toContain("internal.users.setAsaasSubscription");
  });

  it("quem já pagou é ATIVADO na hora, sem depender do webhook", () => {
    expect(checkout).toContain("internal.users.activateSubscriptionByAsaasRef");
  });
});

describe("o cliente do Asaas também não duplica", () => {
  it("procura por externalReference antes de criar um cliente", () => {
    const procura = checkout.indexOf("/customers?externalReference=");
    const cria = checkout.indexOf('asaasFetch("/customers"');
    expect(procura).toBeGreaterThan(-1);
    expect(procura, "a busca precisa vir ANTES do POST de cliente").toBeLessThan(cria);
  });

  it("continua gravando o vínculo do cliente no ALTAR", () => {
    expect(checkout).toContain("internal.users.setAsaasCustomer");
  });
});

describe("o que não pode ter mudado no checkout", () => {
  it("conta isenta segue barrada ANTES de qualquer chamada ao Asaas", () => {
    const guarda = checkout.indexOf("isBillingExempt");
    const primeiraChamada = checkout.indexOf("asaasFetch");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(primeiraChamada);
  });

  it("segue exigindo os dados obrigatórios antes de chamar o Asaas", () => {
    const validacao = checkout.indexOf("PROFILE_INCOMPLETE");
    expect(validacao).toBeGreaterThan(-1);
    expect(validacao).toBeLessThan(checkout.indexOf("asaasFetch"));
  });

  it("a assinatura criada continua carregando a referência do usuário", () => {
    // É a chave que salva a ativação quando o id do cliente não bate.
    const criacao = checkout.slice(checkout.indexOf('asaasFetch("/subscriptions"'));
    expect(criacao).toContain("externalReference: user._id");
  });
});

describe("a conferência com o Asaas só ativa — nunca rebaixa", () => {
  const reconciliacao = fonte.slice(
    fonte.indexOf("// ── Reconciliação"),
    fonte.indexOf("// ── Cancel subscription"),
  );

  it("chama a ativação e nenhuma mutation de cancelamento ou atraso", () => {
    expect(reconciliacao).toContain("activateSubscriptionByAsaasRef");
    expect(reconciliacao).not.toContain("cancelSubscription");
    expect(reconciliacao).not.toContain("markSubscriptionOverdue");
  });

  it("exige administrador antes de conferir uma conta específica", () => {
    const acao = reconciliacao.slice(reconciliacao.indexOf("export const reconcileSubscription"));
    const guarda = acao.indexOf("api.admin.isAdmin");
    const trabalho = acao.indexOf("conferirNoAsaas");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(trabalho);
  });

  it("só ativa quem tem cobrança comprovadamente paga", () => {
    expect(reconciliacao).toContain("STATUS_PAGO.includes");
    expect(reconciliacao).toContain('status: "sem_assinatura_paga"');
  });

  it("registra o que fez, para a conferência não ser invisível", () => {
    expect(reconciliacao).toContain("recordReconciliation");
  });

  it("uma conta com problema não interrompe a conferência das outras", () => {
    const cron = reconciliacao.slice(reconciliacao.indexOf("reconcileStaleSubscriptions"));
    expect(cron).toContain("try {");
    expect(cron).toContain("catch");
  });
});

describe("o receptor do webhook", () => {
  const webhook = readFileSync(join(__dirname, "asaasWebhook.ts"), "utf8");

  it("reserva a chave do aviso ANTES de agir — é a idempotência", () => {
    const reserva = webhook.indexOf("asaasWebhookLog.claim");
    const acao = webhook.indexOf("switch (intent.action)");
    expect(reserva).toBeGreaterThan(-1);
    expect(reserva).toBeLessThan(acao);
  });

  it("aviso repetido sai sem reprocessar", () => {
    const bloco = webhook.slice(webhook.indexOf('reserva.status === "duplicate"'));
    expect(bloco.indexOf("return new Response")).toBeLessThan(bloco.indexOf("switch"));
  });

  it("ativa pela cascata de chaves, não só pelo cliente", () => {
    expect(webhook).toContain("activateSubscriptionByAsaasRef");
    expect(webhook).toContain("externalReference: intent.externalReference");
  });

  it("um aviso sem dono fica REGISTRADO em vez de sumir em silêncio", () => {
    expect(webhook).toContain('outcome: "no_match"');
  });

  it("falha de processamento não vira erro de entrega", () => {
    // O Asaas PAUSA a fila após falhas seguidas: um erro nosso interromperia
    // as ativações de todos os clientes.
    expect(webhook).toContain('outcome: "error"');
    const fim = webhook.slice(webhook.indexOf("} catch (erro)"));
    expect(fim).toContain("status: 200");
  });

  it("continua exigindo o segredo antes de qualquer escrita", () => {
    const auth = webhook.indexOf("ASAAS_WEBHOOK_SECRET");
    const escrita = webhook.indexOf("ctx.runMutation");
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(escrita);
  });

  it("não volta a ler o cliente direto de body.payment.customer", () => {
    expect(webhook).not.toMatch(/body\.payment\?\.customer/);
  });
});

describe("o registro de avisos não guarda dado sensível", () => {
  const schema = readFileSync(join(__dirname, "schema.ts"), "utf8");
  const tabela = schema.slice(
    schema.indexOf("asaasWebhookEvents: defineTable({"),
    schema.indexOf(".index(\"by_dedup_key\""),
  );

  it("não existe campo de payload completo nem de cartão", () => {
    for (const proibido of ["payload", "raw", "body", "creditCard", "card", "cpfCnpj"]) {
      expect(tabela.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
  });

  it("guarda o suficiente para auditar", () => {
    for (const campo of ["dedupKey", "event", "receivedAt", "outcome", "matchedBy"]) {
      expect(tabela).toContain(campo);
    }
  });
});
