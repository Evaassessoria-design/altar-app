import { describe, expect, it } from "vitest";
import {
  VALOR_MAXIMO,
  emCentavos,
  motivoDoValorInvalido,
  somaEmDinheiro,
  valorMonetarioValido,
} from "./dinheiro";

// ═════════════════════════════════════════════════════════════════════════════
// UM LANÇAMENTO RUIM NÃO PODE ESTRAGAR O FINANCEIRO INTEIRO
//
// `addTransaction` gravava o número que viesse. A tela mandava
// `parseFloat(campo)`, e `parseFloat` devolve `NaN` para qualquer coisa que
// não comece com número. `NaN + qualquer coisa` é `NaN`: uma linha assim faz
// receita, despesa, lucro e previsão virarem "R$ NaN" — todas, para sempre, e
// sem dizer qual linha causou.
// ═════════════════════════════════════════════════════════════════════════════

describe("o que pode ser gravado", () => {
  it.each([0, 0.01, 1500, 1500.5, VALOR_MAXIMO])("%s é válido", (v) => {
    expect(valorMonetarioValido(v)).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity, -0.01, -1500, VALOR_MAXIMO + 1])(
    "%s é recusado",
    (v) => {
      expect(valorMonetarioValido(v)).toBe(false);
    },
  );

  it("zero passa — cortesia lançada é lançamento", () => {
    expect(valorMonetarioValido(0)).toBe(true);
    expect(motivoDoValorInvalido(0)).toBeNull();
  });
});

describe("o recado diz o que fazer, não 'valor inválido'", () => {
  it("negativo aponta para o tipo do lançamento", () => {
    // Ela quis dizer algo, e o produto sabe o quê: o sinal já vem do tipo.
    expect(motivoDoValorInvalido(-500)).toMatch(/Despesa/);
  });

  it("valor absurdo fala em zero a mais", () => {
    expect(motivoDoValorInvalido(VALOR_MAXIMO * 2)).toMatch(/zero a mais/i);
  });

  it("NaN pede o valor, sem vocabulário técnico", () => {
    const m = motivoDoValorInvalido(NaN)!;
    expect(m).toMatch(/valor/i);
    expect(m).not.toMatch(/NaN|number|float|undefined/i);
  });

  it("valor bom não produz recado", () => {
    expect(motivoDoValorInvalido(1500)).toBeNull();
  });
});

describe("o centavo é a unidade em que dinheiro existe", () => {
  it("arredonda a terceira casa", () => {
    // Um contrato dividido em três dá 1/3 do valor. Recusar travaria a
    // decoradora numa conta que o próprio sistema fez.
    expect(emCentavos(5000 / 3)).toBe(1666.67);
  });

  it("o caso clássico do ponto flutuante", () => {
    expect(emCentavos(1.005)).toBe(1.01);
    expect(emCentavos(0.1 + 0.2)).toBe(0.3);
  });

  it("não inventa valor para o que não é número", () => {
    expect(emCentavos(NaN)).toBe(0);
    expect(emCentavos(Infinity)).toBe(0);
  });

  it("valor já redondo não muda", () => {
    expect(emCentavos(1500)).toBe(1500);
    expect(emCentavos(0)).toBe(0);
  });
});

describe("a soma não acumula sobra", () => {
  it("cem lançamentos de dez centavos dão dez reais exatos", () => {
    const cem = Array.from({ length: 100 }, () => 0.1);
    expect(somaEmDinheiro(cem)).toBe(10);
    // O que o `reduce` cru fazia:
    expect(cem.reduce((s, v) => s + v, 0)).not.toBe(10);
  });

  it("0,1 + 0,2 é 0,30 e não 0,30000000000000004", () => {
    expect(somaEmDinheiro([0.1, 0.2])).toBe(0.3);
  });

  it("lista vazia soma zero", () => {
    expect(somaEmDinheiro([])).toBe(0);
  });

  it("UM valor podre não contamina a soma inteira", () => {
    // A proteção de trás: mesmo que um `NaN` já esteja gravado de antes, a
    // tela continua mostrando o total do resto em vez de "R$ NaN".
    expect(somaEmDinheiro([100, NaN, 50])).toBe(150);
    expect(somaEmDinheiro([100, Infinity])).toBe(100);
  });
});
