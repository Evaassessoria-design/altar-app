import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — ALTURA DA CASCA DO APP NO CELULAR
//
// A casca do app é `flex h-… ` com um `<main>` `flex-1 overflow-y-auto` dentro:
// é ELA quem define o tamanho da região que rola.
//
// `h-screen` é `100vh`, e no celular `100vh` é o viewport GRANDE — a altura da
// tela com a barra de endereço recolhida. Com a barra à mostra (o estado normal
// ao abrir), a casca fica mais alta que o espaço visível e o fim da área de
// rolagem cai atrás da barra: o último item da lista não aparece por mais que a
// pessoa arraste.
//
// `h-svh` é o viewport PEQUENO — a altura que sempre existe, com barra à mostra.
// É o que o App.tsx já usa no spinner; aqui a casca passa a falar a mesma
// língua.
//
// Isto vale para a casca, não para tela de login ou de erro: lá `min-h-screen`
// só centraliza conteúdo, não governa rolagem nenhuma.
// ─────────────────────────────────────────────────────────────────────────────

const LAYOUT = readFileSync("src/pages/app/layout.tsx", "utf-8");

/** O layout SEM as linhas de comentário — o comentário acima cita "h-screen". */
const CODIGO = LAYOUT.split("\n")
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

describe("casca do app no celular", () => {
  it("a casca que contém o <main> rolável usa h-svh, não h-screen", () => {
    // A linha da casca é a que combina display flex com altura de viewport.
    const casca = CODIGO.split("\n").find(
      (l) => l.includes("flex h-") && l.includes("bg-background"),
    );
    expect(casca, "não achei a casca do app em layout.tsx").toBeDefined();
    expect(casca).toContain("h-svh");
    expect(casca).not.toContain("h-screen");
  });

  it("o <main> continua sendo a região que rola, com folga para a barra inferior", () => {
    // Se o <main> deixar de rolar sozinho, a altura da casca vira irrelevante e
    // a trava acima passa a proteger nada.
    expect(CODIGO).toMatch(/<main[^>]*flex-1[^>]*overflow-y-auto/);
    // pb-20 no celular: a barra inferior é `fixed`, então não ocupa espaço no
    // fluxo — sem essa folga ela cobriria o último item.
    expect(CODIGO).toMatch(/<main[^>]*pb-20/);
  });
});
