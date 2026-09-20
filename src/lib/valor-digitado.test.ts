import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { paraOCampo, valorDigitado } from "./valor-digitado.ts";

// ═════════════════════════════════════════════════════════════════════════════
// MIL E QUINHENTOS REAIS NÃO PODEM VIRAR UM REAL E CINQUENTA
//
// O Financeiro fazia `parseFloat(campo)`. `parseFloat("1.500,00")` é 1.5 — e o
// lançamento era gravado assim, com um "Lançamento adicionado!" por cima.
// ═════════════════════════════════════════════════════════════════════════════

describe("o jeito brasileiro de escrever dinheiro", () => {
  it.each([
    ["1.500,00", 1500],
    ["1.500,50", 1500.5],
    ["1500,50", 1500.5],
    ["0,50", 0.5],
    ["12.345.678,90", 12345678.9],
    ["R$ 2.000,00", 2000],
    ["  1.200,00  ", 1200],
  ])("%s → %s", (texto, esperado) => {
    expect(valorDigitado(texto)).toBe(esperado);
  });
});

describe("o jeito que o navegador devolve", () => {
  it.each([
    ["1500.5", 1500.5],
    ["0.50", 0.5],
    ["1500", 1500],
    ["1,500.00", 1500],
  ])("%s → %s", (texto, esperado) => {
    expect(valorDigitado(texto)).toBe(esperado);
  });
});

describe("o ponto sozinho, que é o caso ambíguo", () => {
  it("três casas depois do ponto é milhar — é como se escreve aqui", () => {
    // E é a leitura segura: errar para menos transforma um contrato em troco,
    // calado. Errar para mais produz um número absurdo, que salta aos olhos.
    expect(valorDigitado("1.500")).toBe(1500);
    expect(valorDigitado("12.000")).toBe(12000);
  });

  it("duas casas é decimal — é o que o campo numérico devolve", () => {
    expect(valorDigitado("1.50")).toBe(1.5);
    expect(valorDigitado("0.99")).toBe(0.99);
  });

  it("uma casa é decimal", () => {
    expect(valorDigitado("1.5")).toBe(1.5);
  });

  it("dois pontos é sempre milhar", () => {
    expect(valorDigitado("1.500.000")).toBe(1500000);
  });
});

describe("o que NÃO vira número", () => {
  it.each(["", "   ", "abc", "12abc", "R$", "-", ",", "."])("%s → null", (texto) => {
    expect(valorDigitado(texto)).toBeNull();
  });

  it("nulo e indefinido não viram zero", () => {
    // Gravar zero por não ter entendido é o erro que faz a decoradora achar
    // que lançou.
    expect(valorDigitado(null)).toBeNull();
    expect(valorDigitado(undefined)).toBeNull();
  });

  it("NaN não passa", () => {
    expect(valorDigitado(NaN)).toBeNull();
    expect(valorDigitado(Infinity)).toBeNull();
  });

  it("número já pronto passa direto", () => {
    expect(valorDigitado(1500.5)).toBe(1500.5);
  });
});

describe("o valor volta para o campo e é lido de novo igual", () => {
  it.each([1500, 1500.5, 0.5, 12345678.9, 0])("%s sobrevive à ida e volta", (valor) => {
    expect(valorDigitado(paraOCampo(valor))).toBe(valor);
  });

  it("campo vazio para valor ausente", () => {
    expect(paraOCampo(null)).toBe("");
    expect(paraOCampo(undefined)).toBe("");
    expect(paraOCampo(NaN)).toBe("");
  });
});

describe("a tela do Financeiro usa isto", () => {
  const fonte = readFileSync("src/pages/app/financeiro/page.tsx", "utf-8");
  // Só o código: o comentário que explica o defeito cita `parseFloat` de
  // propósito, e é justamente o que não pode sumir junto com a correção.
  const codigo = fonte
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  it("não sobrou `parseFloat` no caminho do valor", () => {
    expect(codigo).not.toContain("parseFloat");
  });

  it("o campo aceita vírgula — `type=\"number\"` não aceitava", () => {
    // Com `type="number"`, o que `value` devolve para "1.500,00" depende do
    // navegador e do idioma do sistema. A conta sai do navegador.
    expect(fonte).toContain('inputMode="decimal"');
  });

  it("valor que não dá para entender não vira lançamento", () => {
    expect(fonte).toContain("valorDigitado(");
    expect(fonte).toMatch(/=== null|== null/);
  });
});
