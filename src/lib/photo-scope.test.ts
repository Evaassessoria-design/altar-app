import { describe, expect, it } from "vitest";
import { AVISO_REFERENCIA, PROJECT_SCOPES, scopeMeta } from "./photo-scope";

describe("classificação de imagem", () => {
  it("imagem SEM classificação não ganha selo", () => {
    // Não presumimos que uma foto solta é item contratado.
    expect(scopeMeta(undefined)).toBeUndefined();
    expect(scopeMeta("")).toBeUndefined();
  });

  it("valor desconhecido também não inventa selo", () => {
    expect(scopeMeta("qualquer_coisa")).toBeUndefined();
  });

  it("referência deixa explícito que NÃO foi contratada", () => {
    const meta = scopeMeta("referencia")!;
    expect(meta.label).toBe("Referência visual");
    expect(meta.detalhe).toContain("não contratada");
  });

  it("incluso deixa explícito que faz parte do contratado", () => {
    expect(scopeMeta("incluso")!.detalhe).toContain("contratado");
  });

  it("o aviso de moodboard não chama referência de projeto", () => {
    expect(AVISO_REFERENCIA).toContain("REFERÊNCIA VISUAL");
    expect(AVISO_REFERENCIA).toContain("conceitual");
    expect(AVISO_REFERENCIA.toLowerCase()).not.toContain("aprovado");
    expect(AVISO_REFERENCIA.toLowerCase()).not.toContain("contratado");
  });

  it("os três valores batem com o schema", () => {
    expect(PROJECT_SCOPES.map((s) => s.value)).toEqual([
      "incluso",
      "referencia",
      "nao_incluso",
    ]);
  });
});
