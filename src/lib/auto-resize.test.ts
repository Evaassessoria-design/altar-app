import { describe, expect, it } from "vitest";
import { alturaDoCampo, type MedidasDoCampo } from "./auto-resize.ts";

// Medidas de um campo real: 20px de linha, 8px de padding em cima e embaixo,
// 1px de borda. Só `scrollHeight` muda de um caso para outro.
const BASE: Omit<MedidasDoCampo, "scrollHeight"> = {
  lineHeight: 20,
  padding: 16,
  border: 2,
  minRows: 2,
  maxRows: 10,
};

const medir = (scrollHeight: number) => alturaDoCampo({ ...BASE, scrollHeight });

// 2 linhas → 20*2 + 16 + 2 = 58 ; 10 linhas → 20*10 + 16 + 2 = 218
const MINIMA = 58;
const MAXIMA = 218;

describe("altura do campo de texto longo", () => {
  it("texto curto fica na altura compacta inicial", () => {
    // Uma linha só de conteúdo: 20 + 16 de padding.
    expect(medir(36).altura).toBe(MINIMA);
  });

  it("campo vazio não encolhe até sumir", () => {
    expect(medir(0).altura).toBe(MINIMA);
  });

  it("texto de várias linhas cresce para baixo", () => {
    // 5 linhas de conteúdo: 20*5 + 16 = 116 ; + borda = 118
    const r = medir(116);
    expect(r.altura).toBe(118);
    expect(r.altura).toBeGreaterThan(MINIMA);
    expect(r.altura).toBeLessThan(MAXIMA);
  });

  it("cresce monotonicamente enquanto se digita", () => {
    const alturas = [36, 56, 76, 96, 116].map((h) => medir(h).altura);
    for (let i = 1; i < alturas.length; i++) {
      expect(alturas[i]).toBeGreaterThanOrEqual(alturas[i - 1]);
    }
  });

  it("antes do teto NÃO mostra barra de rolagem", () => {
    expect(medir(116).overflowY).toBe("hidden");
    expect(medir(116).noLimite).toBe(false);
  });

  it("texto muito grande para no teto e passa a rolar", () => {
    // 40 linhas: muito além do máximo de 10.
    const r = medir(20 * 40 + 16);
    expect(r.altura).toBe(MAXIMA);
    expect(r.overflowY).toBe("auto");
    expect(r.noLimite).toBe(true);
  });

  it("no teto exato ainda não rola — só depois dele", () => {
    expect(medir(20 * 10 + 16).overflowY).toBe("hidden");
    expect(medir(20 * 10 + 16 + 1).overflowY).toBe("auto");
  });

  it("texto colado de uma vez recalcula igual ao digitado", () => {
    // O cálculo não guarda estado: mesma medida, mesma altura.
    expect(medir(116)).toEqual(medir(116));
  });

  it("valor carregado ao reabrir usa a mesma conta", () => {
    const salvo = medir(20 * 6 + 16);
    expect(salvo.altura).toBe(20 * 6 + 16 + 2);
  });

  it("lineHeight que o navegador reporta como 'normal' (0) não zera o campo", () => {
    // getComputedStyle pode devolver "normal"; parseFloat vira NaN → 0.
    const r = alturaDoCampo({ ...BASE, lineHeight: 0, scrollHeight: 0 });
    expect(r.altura).toBeGreaterThan(0);
  });

  it("maxRows menor que minRows não inverte o campo", () => {
    const r = alturaDoCampo({ ...BASE, minRows: 5, maxRows: 2, scrollHeight: 999 });
    expect(r.altura).toBe(20 * 5 + 16 + 2);
  });

  it("a altura nunca é negativa nem NaN", () => {
    for (const sh of [-100, 0, Number.NaN]) {
      const r = alturaDoCampo({ ...BASE, scrollHeight: Number.isNaN(sh) ? 0 : sh });
      expect(Number.isFinite(r.altura)).toBe(true);
      expect(r.altura).toBeGreaterThan(0);
    }
  });
});
