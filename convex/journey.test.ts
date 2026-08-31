import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  effectiveSubscriptionStatus,
  OVERDUE_TOLERANCE_DAYS,
  resolveAccess,
} from "./lib/access";

// ─────────────────────────────────────────────────────────────────────────────
// A JORNADA COMPLETA DO CLIENTE, ponto a ponto.
//
//   cadastro → trial → cria evento → usa as ferramentas → fim do trial →
//   assina → paga → atrasa → bloqueia → regulariza → cancela
//
// Duas perguntas em cada etapa, que são as que o negócio faz:
//   1. a pessoa consegue usar recurso pago SEM autorização?
//   2. a pessoa fica bloqueada INDEVIDAMENTE?
//
// A conta é sempre a mesma, evoluindo de estado — é isso que faz o teste ser
// uma jornada e não uma coleção de casos soltos.
// ─────────────────────────────────────────────────────────────────────────────

const DIA = 86_400_000;
const AGORA = Date.parse("2026-08-21T12:00:00Z");

/** Conta cliente comum, no estado indicado. */
function conta(over: Record<string, unknown> = {}) {
  return {
    subscriptionStatus: "trial",
    trialEndDate: new Date(AGORA + 14 * DIA).toISOString(),
    ...over,
  } as Parameters<typeof resolveAccess>[0];
}

describe("jornada — do cadastro ao cancelamento", () => {
  it("1. cadastro: trial de 14 dias, acesso liberado", () => {
    const d = resolveAccess(conta(), AGORA);
    expect(d.blocked).toBe(false);
    expect(d.type).toBe("client");
    expect(d.billingExempt).toBe(false); // é cliente pagante em potencial
  });

  it("2. durante o trial: segue liberada até o último dia", () => {
    for (const dia of [1, 7, 13]) {
      expect(resolveAccess(conta(), AGORA + dia * DIA).blocked, `dia ${dia}`).toBe(false);
    }
  });

  it("3. fim do trial: bloqueia, mesmo sem nada ser gravado no banco", () => {
    // A expiração do trial NÃO é persistida — a conta continua "trial" no banco.
    // Quem não calcular o status efetivo deixa a pessoa usar de graça para sempre.
    const vencida = conta();
    expect(effectiveSubscriptionStatus(vencida, AGORA + 15 * DIA)).toBe("expired");
    expect(resolveAccess(vencida, AGORA + 15 * DIA)).toMatchObject({
      blocked: true,
      reason: "trial_expired",
    });
  });

  it("4. assinou e pagou: volta a ficar liberada", () => {
    const paga = conta({ subscriptionStatus: "active" });
    expect(resolveAccess(paga, AGORA + 30 * DIA).blocked).toBe(false);
  });

  it("5. atrasou o pagamento: NÃO bloqueia de imediato (tolerância)", () => {
    // Quem paga o boleto com 2 dias de atraso não pode perder o acesso.
    const atrasada = conta({ subscriptionStatus: "overdue", overdueSince: AGORA });
    const d = resolveAccess(atrasada, AGORA + 2 * DIA);
    expect(d.blocked).toBe(false);
    expect(d.overdueDaysLeft).toBe(OVERDUE_TOLERANCE_DAYS - 2);
  });

  it("6. tolerância esgotada: bloqueia com o motivo certo", () => {
    const atrasada = conta({ subscriptionStatus: "overdue", overdueSince: AGORA });
    expect(resolveAccess(atrasada, AGORA + OVERDUE_TOLERANCE_DAYS * DIA)).toMatchObject({
      blocked: true,
      reason: "payment_overdue",
    });
  });

  it("7. regularizou: volta na hora, e o relógio do atraso zera", () => {
    // `activateSubscriptionByCustomer` limpa `overdueSince` — provado em
    // users.billing.test.ts. Aqui confirmamos o efeito no acesso.
    const regularizada = conta({ subscriptionStatus: "active", overdueSince: undefined });
    expect(resolveAccess(regularizada, AGORA + 60 * DIA).blocked).toBe(false);
  });

  it("8. cancelou: bloqueia", () => {
    const cancelada = conta({ subscriptionStatus: "cancelled" });
    expect(resolveAccess(cancelada, AGORA + 60 * DIA)).toMatchObject({
      blocked: true,
      reason: "subscription_cancelled",
    });
  });
});

describe("jornada — contas que nunca podem ser bloqueadas", () => {
  it("interna atravessa a jornada inteira liberada", () => {
    for (const status of ["trial", "active", "overdue", "expired", "cancelled"]) {
      const d = resolveAccess(
        conta({
          subscriptionStatus: status,
          accessType: "internal",
          overdueSince: AGORA - 999 * DIA,
          trialEndDate: new Date(AGORA - 999 * DIA).toISOString(),
        }),
        AGORA,
      );
      expect(d.blocked, `internal em ${status}`).toBe(false);
      expect(d.billingExempt).toBe(true);
    }
  });

  it("beta vigente idem — e volta a valer a regra normal quando vence", () => {
    const base = { subscriptionStatus: "expired", accessType: "beta" as const };
    expect(resolveAccess(conta({ ...base, accessExpiresAt: AGORA + DIA }), AGORA).blocked).toBe(false);
    expect(resolveAccess(conta({ ...base, accessExpiresAt: AGORA - DIA }), AGORA).blocked).toBe(true);
  });
});

describe("recurso pago exige autorização NO SERVIDOR", () => {
  // O buraco encontrado na revisão: o paywall era só o redirecionamento da tela.
  // As funções do Convex são chamáveis direto do navegador, então sem guarda no
  // backend uma conta bloqueada continuava criando eventos e disparando IA —
  // que custa dinheiro por chamada.

  it("criar evento sem sessão é recusado", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.events.create, {
        name: "Casamento", type: "wedding", date: "2026-12-12",
        location: "Salão", clientName: "Cliente", status: "planning",
      }),
    ).rejects.toThrow();
  });

  it("events.create passa pela guarda de acesso", () => {
    const source = readFileSync(join(__dirname, "events.ts"), "utf8");
    const start = source.indexOf("export const create = mutation");
    const block = source.slice(start, source.indexOf("export const", start + 1));
    expect(block).toContain("requireActiveAccess");
    expect(block, "requireUser sozinho não barra conta bloqueada").not.toMatch(
      /await requireUser\(ctx\)/,
    );
  });

  it("converter um lead também passa pela guarda", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.funil.convertToEvent, {
        leadId: "x" as Id<"leads">,
        eventName: "Casamento", eventDate: "2026-12-12",
        location: "Salão", clientName: "Cliente", type: "wedding",
      }),
    ).rejects.toThrow();
  });

  // TRAVA GENÉRICA — vale para qualquer caminho novo.
  //
  // O bug original: fechamos `events.create` e esquecemos que `convertToEvent`
  // também insere em `events`. Em vez de listar as duas funções à mão, este
  // teste VARRE o backend atrás de qualquer inserção em `events` e exige que a
  // função que a contém verifique o acesso. Um terceiro caminho criado no futuro
  // quebra este teste sozinho, sem ninguém precisar lembrar de atualizá-lo.
  it("TODA função que cria evento verifica o acesso", () => {
    const arquivos = readdirSync(__dirname).filter(
      (f) => f.endsWith(".ts") && !f.includes(".test."),
    );

    const infratores: string[] = [];

    for (const arquivo of arquivos) {
      const source = readFileSync(join(__dirname, arquivo), "utf8");
      if (!source.includes('insert("events"')) continue;

      // Cada bloco `export const <nome> = ...` até o próximo export.
      const exports = [...source.matchAll(/export const (\w+)\s*=/g)];
      for (let i = 0; i < exports.length; i++) {
        const inicio = exports[i].index!;
        const fim = i + 1 < exports.length ? exports[i + 1].index! : source.length;
        const bloco = source.slice(inicio, fim);
        if (!bloco.includes('insert("events"')) continue;

        // Funções INTERNAS não entram: `internalMutation`/`internalAction` são
        // inalcançáveis pelo cliente por construção — não há como um usuário
        // bloqueado chamá-las do navegador. É o caso do seed de demonstração,
        // que ainda por cima exige ALTAR_DEMO=1 (convex/lib/demoGuard.ts).
        //
        // A trava continua valendo integralmente para tudo que é PÚBLICO, que é
        // onde o paywall pode ser furado. Isto é uma correção de precisão, não
        // uma folga: uma `mutation` ou `action` pública que insira eventos sem
        // verificar acesso continua quebrando este teste.
        const ehInterna = /=\s*internal(Mutation|Action)\(/.test(bloco);
        if (ehInterna) continue;

        if (!bloco.includes("requireActiveAccess")) {
          infratores.push(`${arquivo} → ${exports[i][1]}`);
        }
      }
    }

    expect(
      infratores,
      `Estas funções criam eventos sem verificar assinatura: ${infratores.join(", ")}`,
    ).toEqual([]);
  });

  it.each(["ai.ts", "aiVisual.ts"])("as ações de IA em %s exigem acesso ativo", (arquivo) => {
    const source = readFileSync(join(__dirname, arquivo), "utf8");
    const start = source.indexOf("async function requireEventOwnerAction");
    const block = source.slice(start, source.indexOf("\n}", start));
    expect(block).toContain("requireActiveAccessAction");
  });
});

describe("o seed de demonstração não é um furo no paywall", () => {
  // Ele cria eventos, então precisa ser inalcançável de duas formas
  // independentes: ser interno E exigir o ambiente demo.
  const demoSource = readFileSync(join(__dirname, "demo.ts"), "utf8");

  it("seed é internalMutation, não alcançável pelo aplicativo", () => {
    const start = demoSource.indexOf("export const seed");
    const bloco = demoSource.slice(start, start + 200);
    expect(bloco).toContain("internalMutation");
  });

  it("seed valida o ambiente ANTES de qualquer escrita", () => {
    const start = demoSource.indexOf("export const seed");
    const bloco = demoSource.slice(start);
    const guarda = bloco.indexOf("assertDemoEnvironment");
    const primeiraEscrita = bloco.indexOf("ctx.db.insert");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(primeiraEscrita);
  });

  it("seed nunca apaga nem sobrescreve dado alheio", () => {
    const start = demoSource.indexOf("export const seed");
    const bloco = demoSource.slice(start);
    expect(bloco).not.toContain("ctx.db.delete");
    expect(bloco).not.toContain("ctx.db.replace");
  });
});

describe("o caminho de VOLTA nunca pode ser bloqueado", () => {
  // Se estas funções exigissem acesso ativo, a cliente bloqueada não conseguiria
  // preencher o CPF/CNPJ nem gerar a cobrança — ficaria presa fora do app, sem
  // conseguir pagar para voltar. É o pior erro possível nesta área.
  const usersSource = readFileSync(join(__dirname, "users.ts"), "utf8");
  const asaasSource = readFileSync(join(__dirname, "asaas.ts"), "utf8");

  it.each(["updateProfile", "generateLogoUploadUrl", "completeOnboarding"])(
    "users.%s continua livre para quem está no paywall",
    (fn) => {
      const start = usersSource.indexOf(`export const ${fn}`);
      const block = usersSource.slice(start, usersSource.indexOf("export const", start + 1));
      expect(block).not.toContain("requireActiveAccess");
    },
  );

  it("createCheckoutSession continua livre — é como se paga para desbloquear", () => {
    const start = asaasSource.indexOf("export const createCheckoutSession");
    const block = asaasSource.slice(start, asaasSource.indexOf("export const", start + 1));
    expect(block).not.toContain("requireActiveAccess");
  });

  it("a navegação libera configurações e paywall mesmo bloqueada", () => {
    const app = readFileSync(join(__dirname, "..", "src", "App.tsx"), "utf8");
    expect(app).toContain('const exempt = ["/configuracoes", "/paywall"]');
  });

  it("ler e editar o que já existe continua livre", () => {
    // Trancar a pessoa fora dos próprios dados seria hostil e criaria problema
    // de LGPD. O bloqueio impede CRIAR e GASTAR, não consultar.
    const source = readFileSync(join(__dirname, "events.ts"), "utf8");
    for (const fn of ["export const list", "export const get", "export const update"]) {
      const start = source.indexOf(fn);
      const block = source.slice(start, source.indexOf("export const", start + 1));
      expect(block, `${fn} não deve exigir assinatura`).not.toContain("requireActiveAccess");
    }
  });
});
