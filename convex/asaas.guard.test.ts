import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — cancelar assinatura só cancela a SUA.
//
// O bug: `cancelSubscription` recebia `asaasSubscriptionId` pelo navegador e só
// conferia se havia alguém logado — nunca se aquela assinatura era de quem
// chamou. Qualquer usuário autenticado que descobrisse o id de outra empresa
// cancelava a assinatura dela no Asaas.
//
// `convex/asaas.ts` é um módulo "use node" e chama a API do Asaas por HTTP, o
// que o deixa fora do alcance do convex-test (que roda em edge-runtime). Então
// a trava aqui é ESTRUTURAL, lida no próprio código-fonte — mesma abordagem já
// usada em admin.guard.test.ts. Ela responde a uma pergunta objetiva: o id que
// vai para a URL do Asaas nasce da sessão ou do cliente?
// ─────────────────────────────────────────────────────────────────────────────

const source = readFileSync(join(__dirname, "asaas.ts"), "utf8");

/** Corpo da action `cancelSubscription`, isolado do resto do arquivo. */
function cancelSubscriptionBlock(): string {
  const start = source.indexOf("export const cancelSubscription");
  expect(start, "cancelSubscription sumiu de convex/asaas.ts").toBeGreaterThan(-1);
  const next = source.indexOf("export const", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("cancelSubscription não aceita o id da assinatura do cliente", () => {
  const block = cancelSubscriptionBlock();

  it("resolve o usuário da sessão antes de cancelar", () => {
    expect(block).toContain("api.users.getCurrentUser");
  });

  it("usa a assinatura gravada no cadastro, não a que veio no argumento", () => {
    expect(block).toContain("user.asaasSubscriptionId");
  });

  it("nunca coloca o argumento recebido na URL do Asaas", () => {
    // O ponto exato da falha: `/subscriptions/${args.asaasSubscriptionId}`.
    expect(block).not.toMatch(/args\.asaasSubscriptionId/);
  });

  it("recusa a conta sem assinatura em vez de chamar o Asaas à toa", () => {
    expect(block).toContain("Nenhuma assinatura ativa");
  });

  it("continua exigindo sessão autenticada", () => {
    expect(block).toContain("requireIdentity");
  });
});

describe("a interface não envia mais o id da assinatura", () => {
  const page = readFileSync(
    join(__dirname, "..", "src", "pages", "app", "configuracoes", "page.tsx"),
    "utf8",
  );

  it("configuracoes chama cancelSubscription sem argumentos", () => {
    expect(page).toContain("cancelSub({})");
    expect(page).not.toMatch(/cancelSub\(\{\s*asaasSubscriptionId/);
  });
});

describe("a guarda de contas isentas continua antes de qualquer chamada externa", () => {
  it("createCheckoutSession barra internal/beta antes de falar com o Asaas", () => {
    const start = source.indexOf("export const createCheckoutSession");
    const block = source.slice(start, source.indexOf("export const", start + 1));
    const guard = block.indexOf("isBillingExempt");
    const firstFetch = block.indexOf("asaasFetch");
    expect(guard).toBeGreaterThan(-1);
    expect(guard, "a isenção precisa ser checada ANTES do primeiro asaasFetch").toBeLessThan(
      firstFetch,
    );
  });
});

describe("checkout não cria uma segunda assinatura para quem já tem uma", () => {
  // Com a inadimplência passando a bloquear, o cliente em atraso agora CHEGA ao
  // paywall — cujo botão chama esta action. Sem a checagem, cada clique criaria
  // outra assinatura mensal no Asaas e o cliente seria cobrado em dobro.
  const start = source.indexOf("export const createCheckoutSession");
  const block = source.slice(start, source.indexOf("export const", start + 1));

  it("procura uma cobrança em aberto antes de criar assinatura", () => {
    const procura = block.indexOf("user.asaasSubscriptionId");
    const cria = block.indexOf('asaasFetch("/subscriptions"');
    expect(procura).toBeGreaterThan(-1);
    expect(cria).toBeGreaterThan(-1);
    expect(procura, "a busca por cobrança em aberto precisa vir ANTES do POST").toBeLessThan(cria);
  });

  it("considera os status de cobrança realmente pagáveis", () => {
    // Os literais saíram do corpo do checkout para constantes do módulo, ao
    // lado de STATUS_PAGO — que é o que faltava e causou a duplicação.
    // asaas.checkout.test.ts cobre a regra nova em detalhe.
    for (const status of ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"]) {
      expect(source).toContain(status);
    }
    expect(block).toContain("STATUS_EM_ABERTO.includes");
  });
});

describe("o receptor do webhook usa a leitura testada e a mutation certa", () => {
  const webhook = readFileSync(join(__dirname, "asaasWebhook.ts"), "utf8");

  it("delega a interpretação do payload para lib/asaasEvents", () => {
    expect(webhook).toContain("interpretAsaasWebhook");
  });

  it("não volta a ler o cliente direto de body.payment", () => {
    // A raiz do bug: `body.payment?.customer` fixo, que ignorava os eventos de
    // assinatura. Hoje isso vive só no módulo puro, com teste próprio.
    //
    // A regra é sobre QUEM É O DONO do aviso — é esse campo que não pode voltar
    // a ser lido aqui. O receptor lê `body.payment?.id` e `?.value` para o
    // REGISTRO do aviso, o que é outro assunto e não decide nada.
    expect(webhook).not.toMatch(/body\.payment\?\.customer/);
    expect(webhook).not.toMatch(/body\.payment\?\.subscription/);
  });

  it("cancela pela mutation que casa assinatura E cliente", () => {
    expect(webhook).toContain("cancelSubscriptionByAsaasRef");
  });

  it("continua exigindo o segredo do webhook antes de qualquer escrita", () => {
    const auth = webhook.indexOf("ASAAS_WEBHOOK_SECRET");
    const primeiraEscrita = webhook.indexOf("ctx.runMutation");
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(primeiraEscrita);
  });
});
