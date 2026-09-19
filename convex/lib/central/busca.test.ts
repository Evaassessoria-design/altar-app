import { describe, expect, it } from "vitest";
import { normalizarTexto, termoDeBusca, textoDeBusca } from "./busca";

// ─────────────────────────────────────────────────────────────────────────────
// A busca só encontra o que foi NORMALIZADO igual dos dois lados.
//
// Se o texto gravado e o termo digitado forem normalizados por regras
// diferentes, a busca falha exatamente nos casos reais: nome com acento,
// telefone formatado, letra maiúscula.
// ─────────────────────────────────────────────────────────────────────────────

describe("normalização", () => {
  it("tira acento e caixa", () => {
    expect(normalizarTexto("Orçamento Válido")).toBe("orcamento valido");
    expect(normalizarTexto("HELENA")).toBe("helena");
  });

  it("reduz pontuação a espaço, preservando dígitos", () => {
    expect(normalizarTexto("+55 (11) 99999-8888")).toBe("55 11 99999 8888");
  });

  it("vazio, nulo e indefinido dão a mesma coisa: nada", () => {
    expect(normalizarTexto("")).toBe("");
    expect(normalizarTexto(null)).toBe("");
    expect(normalizarTexto(undefined)).toBe("");
    expect(normalizarTexto("   ")).toBe("");
  });
});

describe("texto de busca da conversa", () => {
  it("junta assunto, nome e handle numa linha só", () => {
    const texto = textoDeBusca([
      "Orçamento para setembro",
      "Helena Prado",
      "+5511999998888",
    ]);

    expect(texto).toContain("orcamento");
    expect(texto).toContain("helena");
    expect(texto).toContain("5511999998888");
  });

  it("não repete palavra — repetir não torna nada mais encontrável", () => {
    const texto = textoDeBusca(["Helena", "Helena", "helena"]);
    expect(texto).toBe("helena");
  });

  it("ignora as partes ausentes sem deixar buraco", () => {
    expect(textoDeBusca(["Assunto", undefined, null, ""])).toBe("assunto");
  });

  it("tem teto de tamanho — o documento não cresce sem limite", () => {
    const enorme = Array.from({ length: 500 }, (_, i) => `palavra${i}`).join(" ");
    expect(textoDeBusca([enorme]).length).toBeLessThanOrEqual(600);
  });
});

describe("termo digitado", () => {
  it("uma letra não é busca", () => {
    expect(termoDeBusca("a")).toBeNull();
    expect(termoDeBusca(" ")).toBeNull();
    expect(termoDeBusca(undefined)).toBeNull();
  });

  it("duas letras já são", () => {
    expect(termoDeBusca("he")).toBe("he");
  });

  it("chega ao índice com a MESMA normalização do texto gravado", () => {
    const gravado = textoDeBusca(["Helena Prado", "+55 11 99999-8888"]);
    const digitado = termoDeBusca("HELENA");
    expect(digitado).not.toBeNull();
    expect(gravado).toContain(digitado!);

    const porNumero = termoDeBusca("(11) 99999-8888");
    expect(porNumero).toBe("11 99999 8888");
    expect(gravado).toContain("11");
  });
});
