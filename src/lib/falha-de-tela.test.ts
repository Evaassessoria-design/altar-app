import { describe, expect, it } from "vitest";
import { ehFalhaDeCarregamentoDeTela } from "./falha-de-tela.ts";

describe("falha de carregamento de tela", () => {
  it.each([
    ["Chrome", "Failed to fetch dynamically imported module: https://app/assets/page-abc.js"],
    ["Firefox", "error loading dynamically imported module"],
    ["Safari", "Importing a module script failed."],
    ["variação", "Failed to load module script: unexpected MIME type"],
  ])("%s é reconhecido", (_nav, mensagem) => {
    expect(ehFalhaDeCarregamentoDeTela(new Error(mensagem))).toBe(true);
  });

  it("ChunkLoadError pelo nome também conta", () => {
    const e = new Error("qualquer coisa");
    e.name = "ChunkLoadError";
    expect(ehFalhaDeCarregamentoDeTela(e)).toBe(true);
  });

  it("erro comum do código NÃO é confundido com chunk", () => {
    // Se fosse, o app mandaria recarregar em vez de mostrar o erro de verdade.
    expect(ehFalhaDeCarregamentoDeTela(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(ehFalhaDeCarregamentoDeTela(new Error("Evento não encontrado"))).toBe(false);
  });

  it.each([[null], [undefined], [""], [42], [{}]])("valor estranho (%s) não quebra", (v) => {
    expect(ehFalhaDeCarregamentoDeTela(v)).toBe(false);
  });

  it("a detecção não depende de maiúsculas", () => {
    expect(ehFalhaDeCarregamentoDeTela(new Error("FAILED TO FETCH DYNAMICALLY IMPORTED MODULE"))).toBe(true);
  });
});
