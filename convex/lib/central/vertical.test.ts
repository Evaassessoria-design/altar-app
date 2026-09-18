import { describe, expect, it } from "vitest";
import {
  ehVertical,
  resolverVertical,
  VERTICAIS,
  VERTICAL_PADRAO,
  verticalConfiguradaEhValida,
} from "./vertical";

describe("vertical do deployment", () => {
  it("Decor e Buffet são as verticais previstas", () => {
    expect([...VERTICAIS]).toEqual(["altar_decor", "altar_buffet"]);
  });

  it("este deployment é Decor por padrão", () => {
    expect(VERTICAL_PADRAO).toBe("altar_decor");
    expect(resolverVertical(undefined)).toBe("altar_decor");
  });

  it("env válida é respeitada", () => {
    expect(resolverVertical("altar_buffet")).toBe("altar_buffet");
    expect(resolverVertical("  altar_buffet  ")).toBe("altar_buffet");
  });

  it("env inválida NÃO derruba o recebimento de mensagem — cai no padrão", () => {
    expect(resolverVertical("altar_casamento")).toBe("altar_decor");
    expect(resolverVertical("")).toBe("altar_decor");
  });

  it("mas a queda é detectável, para não passar despercebida", () => {
    expect(verticalConfiguradaEhValida("altar_casamento")).toBe(false);
    expect(verticalConfiguradaEhValida("altar_buffet")).toBe(true);
    expect(verticalConfiguradaEhValida(undefined)).toBe(true);
  });

  it.each([123, null, {}, "outro"])("%j não é vertical", (valor) => {
    expect(ehVertical(valor)).toBe(false);
  });
});
