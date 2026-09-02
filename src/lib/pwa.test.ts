import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — PWA
//
// O ALTAR já é instalável. O que estas travas protegem é o que quebra sem
// ninguém perceber: dados de cliente indo parar no cache do aparelho, e
// atualização que troca o app debaixo dos pés de quem está usando.
// ─────────────────────────────────────────────────────────────────────────────

const MANIFEST = JSON.parse(readFileSync("public/site.webmanifest", "utf-8")) as {
  id?: string; name: string; short_name: string; description: string;
  start_url: string; scope?: string; display: string;
  background_color: string; theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};
const SW = readFileSync("public/sw.js", "utf-8");
const HOOK = readFileSync("src/hooks/use-service-worker.ts", "utf-8");
const INDEX = readFileSync("index.html", "utf-8");

describe("manifest", () => {
  it("tem identidade estável — sem `id`, mudar start_url cria um app novo", () => {
    expect(MANIFEST.id).toBe("/");
  });

  it("declara escopo explícito", () => {
    expect(MANIFEST.scope).toBe("/");
  });

  it("abre como aplicativo, não como aba", () => {
    expect(MANIFEST.display).toBe("standalone");
  });

  it("tem cor de fundo e de tema — sem elas a abertura pisca branco", () => {
    expect(MANIFEST.background_color).toMatch(/^#/);
    expect(MANIFEST.theme_color).toMatch(/^#/);
  });

  it("fala do produto certo: decoração de eventos, não cerimonial", () => {
    // O ALTAR é para empresas de DECORAÇÃO. A descrição antiga dizia
    // "cerimonialistas", que é outra profissão e outro produto.
    expect(MANIFEST.description.toLowerCase()).toContain("decora");
    expect(MANIFEST.description.toLowerCase()).not.toContain("cerimonialista");
  });

  it("declara os dois tamanhos que a instalação exige", () => {
    const tamanhos = MANIFEST.icons.map((i) => i.sizes);
    expect(tamanhos).toContain("192x192");
    expect(tamanhos).toContain("512x512");
  });

  it("o manifest está ligado no index.html, com tema e ícone de iOS", () => {
    expect(INDEX).toContain('rel="manifest"');
    expect(INDEX).toContain('name="theme-color"');
    expect(INDEX).toContain('rel="apple-touch-icon"');
  });
});

describe("o cache não guarda dado de cliente", () => {
  it("nada de outra origem é interceptado — os dados vêm do Convex", () => {
    // Evento, cliente, financeiro e acervo moram em *.convex.cloud. Cachear
    // isso deixaria dado de cliente no aparelho depois do logout.
    expect(SW).toContain("url.origin !== self.location.origin");
  });

  it("caminhos de autenticação nunca são interceptados", () => {
    expect(SW).toContain('url.pathname.startsWith("/auth")');
  });

  it("só GET é cacheado", () => {
    expect(SW).toContain('event.request.method !== "GET"');
  });

  it("rede primeiro: online sempre vê o conteúdo atual", () => {
    expect(SW).toMatch(/fetch\(event\.request\)/);
  });

  it("resposta com erro não entra no cache", () => {
    expect(SW).toMatch(/if \(!response\.ok\)/);
  });
});

describe("atualização não troca o app debaixo de quem está usando", () => {
  it("a instalação NÃO chama skipWaiting", () => {
    // Com skipWaiting o worker novo assume enquanto a aba roda o JS antigo. As
    // telas chegam sob demanda: a página velha pede um pedaço com nome antigo,
    // o worker novo busca na rede, e o arquivo já não existe. Tela que não abre
    // no meio de uma montagem.
    const instalacao = SW.slice(SW.indexOf('addEventListener("install"'), SW.indexOf('addEventListener("message"'));
    expect(instalacao).not.toContain("skipWaiting");
  });

  it("a troca só acontece por mensagem — ou seja, quando a pessoa aceita", () => {
    expect(SW).toContain("ATIVAR_NOVA_VERSAO");
    expect(SW).toMatch(/type === "ATIVAR_NOVA_VERSAO"[\s\S]{0,80}skipWaiting/);
  });

  it("o aviso manda ativar ANTES de recarregar", () => {
    // Recarregar sem ativar traria a versão antiga de volta, e o aviso
    // reapareceria: um botão que parece não funcionar.
    const i = HOOK.indexOf("postMessage");
    const j = HOOK.indexOf("window.location.reload");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it("e não fica preso se a troca não completar", () => {
    expect(HOOK).toContain("controllerchange");
    expect(HOOK).toMatch(/setTimeout\(recarregar/);
  });
});
