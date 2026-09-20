import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { avisoDeBloqueio, podeAbrirRota } from "./acesso-bloqueado.ts";

// ═════════════════════════════════════════════════════════════════════════════
// A CONTA VENCIDA E OS PRÓPRIOS DADOS
//
// O defeito: `SubscriptionGuard` mandava TODAS as rotas do aplicativo para o
// paywall, isentando só `/configuracoes`. Uma decoradora com trial vencido
// perdia o acesso aos eventos que já tinha cadastrado e ao PDF de um evento
// que já havia pago.
//
// O backend declarava o contrário desde que foi escrito (`accessGuard.ts`):
// ler e editar o que já existe deve continuar; o que se bloqueia é o que CUSTA
// — criar evento, enviar arquivo, chamar IA.
//
// Estes testes prendem os dois lados: que a navegação abre, e que o servidor
// continua sendo quem barra o que custa.
// ═════════════════════════════════════════════════════════════════════════════

/** As rotas do aplicativo, como `App.tsx` as declara. */
const ROTAS = [
  "/dashboard",
  "/agenda",
  "/eventos",
  "/eventos/abc123",
  "/eventos/abc123/briefing",
  "/eventos/abc123/orcamento",
  "/eventos/abc123/ficha-tecnica",
  "/eventos/abc123/acervo",
  "/compras",
  "/financeiro",
  "/acervo",
  "/fornecedores",
  "/equipe",
  "/funil",
  "/configuracoes",
];

describe("conta bloqueada continua alcançando os próprios dados", () => {
  it.each(ROTAS)("%s abre mesmo bloqueada", (rota) => {
    expect(podeAbrirRota(rota, true)).toBe(true);
  });

  it("o aplicativo não redireciona mais por assinatura", () => {
    // Trava por leitura de código: se alguém reintroduzir o redirecionamento,
    // este teste quebra antes de uma cliente perder o acesso de novo.
    const app = readFileSync("src/App.tsx", "utf-8");
    expect(app).not.toMatch(/Navigate\s+to="\/paywall"/);
    expect(app).not.toContain("SubscriptionGuard");
  });

  it("o paywall continua existindo como destino", () => {
    const app = readFileSync("src/App.tsx", "utf-8");
    expect(app).toContain('path="/paywall"');
  });
});

describe("o servidor continua sendo quem barra o que custa", () => {
  // A parte que NÃO pode ser afrouxada. Se uma destas guardas sumir, a conta
  // vencida passa a criar evento e a gastar chamada de IA de graça.
  const GUARDADOS = [
    ["convex/events.ts", "criar evento"],
    ["convex/funil.ts", "converter lead em evento"],
    ["convex/contracts.ts", "enviar contrato"],
    ["convex/gallery.ts", "enviar foto"],
    ["convex/assemblyItems.ts", "enviar foto do item"],
    ["convex/layoutRenders.ts", "enviar croqui"],
    ["convex/leadDocuments.ts", "enviar documento do lead"],
    ["convex/suppliers.ts", "enviar arquivo do fornecedor"],
    ["convex/ai.ts", "ações de IA"],
    ["convex/aiVisual.ts", "IA visual"],
  ];

  it.each(GUARDADOS)("%s ainda exige acesso ativo (%s)", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    expect(fonte).toMatch(/requireActiveAccess(Action)?\(/);
  });

  it("o caminho de VOLTA nunca é bloqueado", () => {
    // Bloquear o perfil ou o checkout prenderia a cliente do lado de fora:
    // ela precisa completar o CPF/CNPJ para conseguir pagar.
    const guard = readFileSync("convex/lib/accessGuard.ts", "utf-8");
    for (const volta of [
      "users.updateProfile",
      "users.generateLogoUploadUrl",
      "asaas.createCheckoutSession",
    ]) {
      expect(guard).toContain(volta);
    }
    const users = readFileSync("convex/users.ts", "utf-8");
    const perfil = users.slice(users.indexOf("export const updateProfile"));
    expect(perfil.slice(0, 400)).not.toContain("requireActiveAccess");
  });
});

describe("o aviso que a conta bloqueada lê", () => {
  it("trial vencido: diz o que perdeu E o que continua podendo", () => {
    const a = avisoDeBloqueio({ blocked: true, reason: "trial_expired" });
    expect(a.bloqueada).toBe(true);
    expect(a.titulo).toMatch(/teste terminou/i);
    // A metade que faltava: a promessa de que os dados continuam lá.
    expect(a.descricao).toMatch(/continuam/i);
    expect(a.descricao).toMatch(/baixar|download|consultar/i);
    expect(a.acao.length).toBeGreaterThan(0);
  });

  it("cancelada: afirma que nada foi apagado", () => {
    const a = avisoDeBloqueio({ blocked: true, reason: "subscription_cancelled" });
    expect(a.descricao).toMatch(/nada foi apagado/i);
    expect(a.acao).toMatch(/reativar/i);
  });

  it("inadimplente bloqueada: fala em regularizar, não em comprar de novo", () => {
    const a = avisoDeBloqueio({ blocked: true, reason: "payment_overdue" });
    expect(a.acao).toMatch(/regularizar/i);
  });

  it("motivo desconhecido não deixa a tela muda", () => {
    // Um motivo novo no backend não pode produzir um aviso em branco.
    const a = avisoDeBloqueio({ blocked: true });
    expect(a.bloqueada).toBe(true);
    expect(a.titulo.length).toBeGreaterThan(0);
    expect(a.descricao.length).toBeGreaterThan(0);
  });

  it("nenhum aviso menciona vocabulário técnico", () => {
    for (const reason of [
      "trial_expired",
      "subscription_cancelled",
      "payment_overdue",
      undefined,
    ] as const) {
      const a = avisoDeBloqueio({ blocked: true, reason });
      const texto = `${a.titulo} ${a.descricao} ${a.acao}`;
      expect(texto).not.toMatch(/subscription|status|accessType|blocked|_expired|paywall/i);
    }
  });
});

describe("conta liberada não vê aviso nenhum", () => {
  it.each([
    ["trial vigente", { blocked: false }],
    ["ativa", { blocked: false }],
    ["admin isento", { blocked: false }],
    ["interna", { blocked: false }],
    ["sem sessão", null],
    ["ainda carregando", undefined],
  ])("%s", (_rotulo, acesso) => {
    expect(avisoDeBloqueio(acesso).bloqueada).toBe(false);
  });

  it("carregando não pisca aviso — `undefined` é silêncio, não bloqueio", () => {
    // O defeito clássico: tratar "ainda não sei" como "bloqueada" faz o aviso
    // aparecer por um instante em toda navegação de conta paga.
    expect(avisoDeBloqueio(undefined).bloqueada).toBe(false);
  });
});

describe("um aviso de cobrança por vez", () => {
  it("TrialBanner cede a vez quando a conta está bloqueada", () => {
    // Sem isto, a conta com trial vencido lê dois avisos empilhados: "Seu
    // período de teste expirou" (TrialBanner) em cima de "Seu período de teste
    // terminou — seus dados continuam aqui". Dizem a mesma coisa e o segundo,
    // que é o que traz informação nova, fica parecendo repetição.
    const layout = readFileSync("src/pages/app/layout.tsx", "utf-8");
    expect(layout).toContain("if (status?.access?.blocked) return null;");
  });

  it("o aviso de bloqueio não repete a contagem de tolerância", () => {
    // A tolerância é assunto do TrialBanner, que tem o botão que abre a
    // cobrança. Este módulo não a conhece.
    const modulo = readFileSync("src/lib/acesso-bloqueado.ts", "utf-8");
    expect(modulo).not.toContain("overdueDaysLeft");
  });
});
