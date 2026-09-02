import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — ALVO DE TOQUE NAS TELAS DE CAMPO
//
// Ícone de 20px é alvo de mouse, não de dedo. As diretrizes de iOS e Android
// pedem ~44px, e essas telas são usadas em pé, com uma mão, segurando caixa.
//
// A correção é `-m-2.5 p-2.5`: o padding cresce a área de toque, a margem
// negativa devolve o espaço ao layout. Nada se move na tela; só o dedo passa a
// acertar.
// ─────────────────────────────────────────────────────────────────────────────

const codigoDe = (f: string) =>
  readFileSync(f, "utf-8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

describe("checklist — a tela do carregamento", () => {
  const CHECKLIST = codigoDe("src/pages/app/events/[id]/checklist/page.tsx");

  it("o botão de marcar item tem área de toque ampliada", () => {
    const i = CHECKLIST.indexOf("handleToggle(item)");
    expect(i).toBeGreaterThan(-1);
    // Janela generosa: o comentario que explica a correcao fica entre o
    // onClick e a className, e um recorte curto cortaria justamente o que
    // interessa ler.
    const botao = CHECKLIST.slice(i, i + 900);
    expect(botao).toMatch(/-m-2\.5 p-2\.5|p-2\.5 -m-2\.5|min-h-11/);
  });

  it("e continua com rótulo para leitor de tela", () => {
    expect(CHECKLIST).toContain("aria-label");
  });
});

describe("acervo — botões de foto e ajuste", () => {
  it("a lista do acervo usa alvos de 40px, não ícones soltos", () => {
    const ACERVO = codigoDe("src/pages/app/acervo/page.tsx");
    const i = ACERVO.indexOf("setAjustando(item._id)");
    expect(i).toBeGreaterThan(-1);
    expect(ACERVO.slice(i, i + 300)).toContain("p-2.5");
  });

  it("os botões da galeria têm altura mínima de toque", () => {
    const FOTOS = codigoDe("src/pages/app/events/[id]/fotos/page.tsx");
    expect(FOTOS).toContain("min-h-11");
  });
});
