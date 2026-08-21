import { describe, expect, it } from "vitest";
import {
  ACTIVE_WINDOWS,
  isActiveWithin,
  LAST_SEEN_THROTTLE_MS,
  shouldRecordLastSeen,
} from "./presence";

// ─────────────────────────────────────────────────────────────────────────────
// A regra central do "último acesso": medir presença SEM encher o banco.
//
// O requisito era explícito — nada de uma gravação por clique. A trava vive no
// servidor, então é aqui que ela precisa estar provada.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = Date.parse("2026-08-21T12:00:00Z");
const MIN = 60_000;

describe("shouldRecordLastSeen — quando vale a pena gravar", () => {
  it("grava na primeira vez (nunca visto)", () => {
    expect(shouldRecordLastSeen(undefined, NOW)).toBe(true);
  });

  it("NÃO grava logo depois de ter gravado", () => {
    expect(shouldRecordLastSeen(NOW, NOW)).toBe(false);
    expect(shouldRecordLastSeen(NOW - 1 * MIN, NOW)).toBe(false);
    expect(shouldRecordLastSeen(NOW - 29 * MIN, NOW)).toBe(false);
  });

  it("grava assim que a janela de 30 minutos fecha", () => {
    expect(shouldRecordLastSeen(NOW - LAST_SEEN_THROTTLE_MS, NOW)).toBe(true);
    expect(shouldRecordLastSeen(NOW - 31 * MIN, NOW)).toBe(true);
    expect(shouldRecordLastSeen(NOW - 5 * 60 * MIN, NOW)).toBe(true);
  });

  it("navegar o dia inteiro gera no máximo 48 gravações", () => {
    // Simula um clique por minuto durante 24 h e conta as gravações reais.
    let gravado: number | undefined;
    let gravacoes = 0;
    for (let minuto = 0; minuto < 24 * 60; minuto++) {
      const agora = NOW + minuto * MIN;
      if (shouldRecordLastSeen(gravado, agora)) {
        gravado = agora;
        gravacoes += 1;
      }
    }
    // 1440 cliques → 48 gravações. Sem a trava seriam 1440.
    expect(gravacoes).toBe(48);
    expect(gravacoes).toBeLessThanOrEqual(24 * 60 / (LAST_SEEN_THROTTLE_MS / MIN) + 1);
  });

  it("corrige carimbo do futuro em vez de travar para sempre", () => {
    // Relógio dessincronizado ou dado inconsistente: se ignorássemos, o campo
    // nunca mais seria atualizado.
    expect(shouldRecordLastSeen(NOW + 60 * MIN, NOW)).toBe(true);
  });
});

describe("isActiveWithin — quem está usando de fato", () => {
  it("conta quem acessou dentro da janela", () => {
    expect(isActiveWithin(NOW - 2 * 60 * MIN, ACTIVE_WINDOWS.day, NOW)).toBe(true);
    expect(isActiveWithin(NOW - 3 * 24 * 60 * MIN, ACTIVE_WINDOWS.week, NOW)).toBe(true);
    expect(isActiveWithin(NOW - 20 * 24 * 60 * MIN, ACTIVE_WINDOWS.month, NOW)).toBe(true);
  });

  it("não conta quem passou da janela", () => {
    expect(isActiveWithin(NOW - 25 * 60 * MIN, ACTIVE_WINDOWS.day, NOW)).toBe(false);
    expect(isActiveWithin(NOW - 8 * 24 * 60 * MIN, ACTIVE_WINDOWS.week, NOW)).toBe(false);
    expect(isActiveWithin(NOW - 40 * 24 * 60 * MIN, ACTIVE_WINDOWS.month, NOW)).toBe(false);
  });

  it("quem nunca foi visto não conta como ativo", () => {
    // Importante para não inflar a métrica com cadastros antigos, anteriores à
    // medição — eles aparecem como "sem registro", não como ativos.
    for (const janela of Object.values(ACTIVE_WINDOWS)) {
      expect(isActiveWithin(undefined, janela, NOW)).toBe(false);
    }
  });

  it("as janelas estão encaixadas: dia ⊂ semana ⊂ mês", () => {
    expect(ACTIVE_WINDOWS.day).toBeLessThan(ACTIVE_WINDOWS.week);
    expect(ACTIVE_WINDOWS.week).toBeLessThan(ACTIVE_WINDOWS.month);
  });
});
