import { describe, expect, it } from "vitest";
import { aplicarAjuste, aplicarContagem, sinalDoTipo, TIPOS_DE_AJUSTE, ROTULO_DO_AJUSTE } from "./ajusteDeAcervo";

const un = "un"; // indivisível — os valores válidos são os do schema
const m = "m"; // aceita decimal

describe("direção do ajuste — o tipo decide o sinal", () => {
  it("só entrada aumenta", () => {
    expect(sinalDoTipo("entrada")).toBe(1);
    for (const t of ["perda", "quebra", "avaria", "descarte"] as const) {
      expect(sinalDoTipo(t)).toBe(-1);
    }
  });

  it("todo tipo tem rótulo — a tela nunca mostra o identificador cru", () => {
    for (const t of TIPOS_DE_AJUSTE) expect(ROTULO_DO_AJUSTE[t]).toBeTruthy();
  });
});

describe("aplicarAjuste", () => {
  it("entrada aumenta o estoque", () => {
    const r = aplicarAjuste({ quantidadeAtual: 40, tipo: "entrada", quantidade: 20, unidade: un });
    expect(r).toEqual({ ok: true, delta: 20, quantidadeDepois: 60 });
  });

  it("perda reduz", () => {
    const r = aplicarAjuste({ quantidadeAtual: 40, tipo: "perda", quantidade: 1, unidade: un });
    expect(r).toEqual({ ok: true, delta: -1, quantidadeDepois: 39 });
  });

  it("quebra reduz", () => {
    const r = aplicarAjuste({ quantidadeAtual: 40, tipo: "quebra", quantidade: 2, unidade: un });
    expect(r).toEqual({ ok: true, delta: -2, quantidadeDepois: 38 });
  });

  it.each(["avaria", "descarte"] as const)("%s reduz", (tipo) => {
    const r = aplicarAjuste({ quantidadeAtual: 10, tipo, quantidade: 3, unidade: un });
    expect(r.ok && r.quantidadeDepois).toBe(7);
  });

  it("NUNCA deixa o estoque negativo", () => {
    const r = aplicarAjuste({ quantidadeAtual: 3, tipo: "perda", quantidade: 5, unidade: un });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("negativo");
  });

  it("baixar exatamente tudo é válido — acervo zerado existe", () => {
    const r = aplicarAjuste({ quantidadeAtual: 3, tipo: "quebra", quantidade: 3, unidade: un });
    expect(r.ok && r.quantidadeDepois).toBe(0);
  });

  it("ajuste de zero é recusado — não muda nada", () => {
    expect(aplicarAjuste({ quantidadeAtual: 5, tipo: "perda", quantidade: 0, unidade: un }).ok).toBe(false);
  });

  it("quantidade negativa é recusada — o sinal é do tipo, não do número", () => {
    // Aceitar -2 em "entrada" seria uma segunda forma de dar baixa, escondida.
    expect(aplicarAjuste({ quantidadeAtual: 5, tipo: "entrada", quantidade: -2, unidade: un }).ok).toBe(false);
  });

  it("fração em unidade indivisível é recusada", () => {
    expect(aplicarAjuste({ quantidadeAtual: 10, tipo: "perda", quantidade: 2.5, unidade: un }).ok).toBe(false);
  });

  it("fração em metro é aceita", () => {
    const r = aplicarAjuste({ quantidadeAtual: 10, tipo: "perda", quantidade: 2.5, unidade: m });
    expect(r.ok && r.quantidadeDepois).toBe(7.5);
  });

  it("unidade DESCONHECIDA não é tratada como indivisível", () => {
    // "não sei" é diferente de "não divide". Arredondar o que não se conhece
    // inventaria uma regra de negócio que ninguém validou. Mesma decisão que
    // já vale na Ficha Técnica (lib/materiais.ts).
    const r = aplicarAjuste({ quantidadeAtual: 10, tipo: "perda", quantidade: 2.5, unidade: "??" });
    expect(r.ok && r.quantidadeDepois).toBe(7.5);
  });

  it("soma de decimais não deixa lixo de ponto flutuante", () => {
    const r = aplicarAjuste({ quantidadeAtual: 0.1, tipo: "entrada", quantidade: 0.2, unidade: m });
    expect(r.ok && r.quantidadeDepois).toBe(0.3);
  });
});

describe("aplicarContagem — informa-se o que foi CONTADO", () => {
  it("contagem menor vira baixa", () => {
    const r = aplicarContagem({ quantidadeAtual: 40, quantidadeContada: 37, unidade: un });
    expect(r).toEqual({ ok: true, delta: -3, quantidadeDepois: 37 });
  });

  it("contagem maior vira entrada", () => {
    const r = aplicarContagem({ quantidadeAtual: 40, quantidadeContada: 42, unidade: un });
    expect(r).toEqual({ ok: true, delta: 2, quantidadeDepois: 42 });
  });

  it("contagem que bate não vira registro — confirmar não é ajustar", () => {
    const r = aplicarContagem({ quantidadeAtual: 40, quantidadeContada: 40, unidade: un });
    expect(r.ok).toBe(false);
  });

  it("contar zero é válido — o acervo pode ter acabado", () => {
    const r = aplicarContagem({ quantidadeAtual: 5, quantidadeContada: 0, unidade: un });
    expect(r.ok && r.quantidadeDepois).toBe(0);
  });

  it("contagem negativa é recusada", () => {
    expect(aplicarContagem({ quantidadeAtual: 5, quantidadeContada: -1, unidade: un }).ok).toBe(false);
  });

  it("a contagem NUNCA pode gerar estoque negativo", () => {
    // Por construção: o resultado É o contado, e contado negativo já foi barrado.
    for (const contada of [0, 1, 999]) {
      const r = aplicarContagem({ quantidadeAtual: 10, quantidadeContada: contada, unidade: un });
      if (r.ok) expect(r.quantidadeDepois).toBeGreaterThanOrEqual(0);
    }
  });
});
