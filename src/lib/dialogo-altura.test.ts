import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// No celular, `vh` é a altura da tela COM a barra do navegador recolhida. Um
// diálogo com `max-h-[90vh]` passa da área visível e o botão Salvar fica atrás
// da barra. O componente base usa `dvh`; quem sobrescreve tem de usar também.
describe("altura dos diálogos no celular", () => {
  // `String.raw`: numa string comum, `\[` vira `[` e o git grep recebia outra
  // expressão — o teste passava sem procurar o que dizia procurar.
  const buscar = (alvo: string) =>
    execSync(
      String.raw`git grep -nE "<DialogContent[^>]*max-h-\[[0-9]+vh\]" ${alvo} -- "src/*.tsx" || true`,
      { encoding: "utf-8" },
    ).trim();

  it("nenhum DialogContent limita a altura em vh", () => {
    expect(buscar("")).toBe("");
  });

  it("a busca pega o defeito de verdade (antes da correção eram 9)", () => {
    expect(buscar("b8a5cbe~1").split("\n")).toHaveLength(9);
  });
});
