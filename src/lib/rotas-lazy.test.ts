import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROTAS_SEM_MENU } from "./navigation.ts";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — TELAS SOB DEMANDA
//
// O pacote inicial trazia TODAS as telas antes de mostrar a primeira: 2,4 MB
// num 4G de galpão é a diferença entre abrir e desistir.
//
// O que não pode regredir:
//  · toda rota do app continua existindo (deep link não some);
//  · quem espera tem fallback, e o fallback fica DENTRO da casca;
//  · a página pública e o login continuam imediatos.
// ─────────────────────────────────────────────────────────────────────────────

const APP = readFileSync("src/App.tsx", "utf-8");
const LAYOUT = readFileSync("src/pages/app/layout.tsx", "utf-8");

const semComentarios = (fonte: string) =>
  fonte
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

const CODIGO_APP = semComentarios(APP);
const CODIGO_LAYOUT = semComentarios(LAYOUT);

/** Rotas declaradas em App.tsx. */
const rotas = [...CODIGO_APP.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);

describe("as rotas continuam todas lá", () => {
  it("nenhuma rota sumiu ao dividir o pacote", () => {
    // A lista de telas sem menu é a fonte já existente das rotas internas.
    for (const rota of Object.keys(ROTAS_SEM_MENU)) {
      expect(rotas, `a rota ${rota} desapareceu de App.tsx`).toContain(rota);
    }
  });

  it("as rotas de menu também continuam", () => {
    for (const rota of ["/dashboard", "/eventos", "/compras", "/financeiro", "/acervo", "/funil", "/equipe", "/fornecedores", "/configuracoes"]) {
      expect(rotas).toContain(rota);
    }
  });

  it("deep link de tela interna continua declarado com parâmetro", () => {
    expect(rotas).toContain("/eventos/:id/ficha-tecnica");
    expect(rotas).toContain("/eventos/:id/checklist/:phase");
  });
});

describe("o que carrega sob demanda e o que não", () => {
  it("as telas do app são lazy", () => {
    for (const tela of ["Dashboard", "ComprasPage", "FinanceiroPage", "AdminPage", "AcervoPage", "FichaTecnicaPage", "FunilPage"]) {
      expect(CODIGO_APP).toMatch(new RegExp(`const ${tela} = lazy\\(`));
    }
  });

  it("a página pública e o login NÃO são lazy — são a primeira coisa que se vê", () => {
    expect(CODIGO_APP).toContain('import Index from "./pages/Index.tsx"');
    expect(CODIGO_APP).toContain('import LoginPage from "./pages/auth/Login.tsx"');
    expect(CODIGO_APP).not.toMatch(/const (Index|LoginPage) = lazy\(/);
  });

  it("a casca do app também é imediata — senão o menu piscaria", () => {
    expect(CODIGO_APP).toContain('import AppLayout from "./pages/app/layout.tsx"');
    expect(CODIGO_APP).not.toMatch(/const AppLayout = lazy\(/);
  });
});

describe("ninguém fica olhando para o nada", () => {
  it("o fallback do conteúdo fica DENTRO da casca, envolvendo o Outlet", () => {
    // Fallback de tela cheia apagaria o menu a cada navegação.
    expect(CODIGO_LAYOUT).toMatch(/<Suspense[\s\S]{0,120}<Outlet/);
  });

  it("o ErrorBoundary fica POR FORA do Suspense — senão a falha de carregamento escapa", () => {
    const i = CODIGO_LAYOUT.indexOf("<ErrorBoundary");
    const j = CODIGO_LAYOUT.indexOf("<Suspense");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it("as rotas fora da casca têm o próprio fallback", () => {
    for (const tela of ["PaywallPage", "ResetPasswordPage"]) {
      const i = CODIGO_APP.indexOf(`<${tela} />`);
      expect(i, `${tela} não está mais nas rotas`).toBeGreaterThan(-1);
      expect(CODIGO_APP.slice(Math.max(0, i - 200), i)).toContain("<Suspense");
    }
  });
});

describe("tela que não chega tem saída", () => {
  const BOUNDARY = semComentarios(readFileSync("src/components/error-boundary.tsx", "utf-8"));

  it("o boundary distingue falha de carregamento de erro de código", () => {
    expect(BOUNDARY).toContain("ehFalhaDeCarregamentoDeTela");
  });

  it("e oferece RECARREGAR, não um reset que renderizaria o mesmo erro", () => {
    // React.lazy guarda a promessa rejeitada: reset suave não resolve nunca.
    expect(BOUNDARY).toContain("window.location.reload()");
  });

  it("a mensagem técnica não vai para a tela nesse caso", () => {
    expect(BOUNDARY).toMatch(/!naoChegou &&[\s\S]{0,200}error\.message/);
  });
});

describe("os geradores de PDF só chegam no clique", () => {
  it.each([
    ["src/pages/app/events/[id]/page.tsx", "generate-event-pdf"],
    ["src/pages/app/events/[id]/briefing/page.tsx", "generate-loading-pdf"],
    ["src/pages/app/events/[id]/briefing/page.tsx", "generate-assembly-pdf"],
    ["src/pages/app/events/[id]/ficha-tecnica/page.tsx", "generate-ficha-tecnica-pdf"],
    ["src/pages/app/events/[id]/orcamento/page.tsx", "generate-orcamento-pdf"],
  ])("%s carrega %s dinamicamente", (arquivo, modulo) => {
    const codigo = semComentarios(readFileSync(arquivo, "utf-8"));
    // 385 kB de jsPDF não podem vir junto com a tela do evento, que é a mais
    // aberta do sistema — vêm quando alguém pede o PDF.
    expect(codigo).not.toMatch(new RegExp(`^import .*${modulo}`, "m"));
    expect(codigo).toContain(`await import("@/lib/${modulo}.ts")`);
  });
});
