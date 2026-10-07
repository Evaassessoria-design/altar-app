import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// No celular, `vh` é a altura da tela COM a barra do navegador recolhida. Um
// diálogo com `max-h-[90vh]` passa da área visível e o botão Salvar fica atrás
// da barra. O componente base usa `dvh`; quem sobrescreve tem de usar também.
describe("altura dos diálogos no celular", () => {
  it("nenhum DialogContent limita a altura em vh", () => {
    const achados = execSync(
      'git grep -nE "<DialogContent[^>]*max-h-\[[0-9]+vh\]" -- "src/*.tsx" || true',
      { encoding: "utf-8" },
    ).trim();
    expect(achados).toBe("");
  });
});
