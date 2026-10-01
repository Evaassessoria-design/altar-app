import { describe, expect, it } from "vitest";
import { logisticaDoItem } from "./logisticaDoAcervo";
import type { ReservaParaCalculo } from "./acervo";

// ─────────────────────────────────────────────────────────────────────────────
// CONDIÇÃO × LUGAR — o castiçal pronto que está na rua não é "pronto no galpão"
// ─────────────────────────────────────────────────────────────────────────────

const HOJE = "2026-10-14";
let n = 0;
const reserva = (over: Partial<ReservaParaCalculo>): ReservaParaCalculo => ({
  _id: `r${++n}`,
  eventId: `e${n}`,
  quantidade: 0,
  inicio: "2026-10-09",
  fim: "2026-10-11",
  ...over,
});

describe("onde as peças estão", () => {
  it("40 castiçais, 8 em reparo, 4 ainda no evento de sábado: 28 prontos no galpão, não 32", () => {
    const l = logisticaDoItem(
      { quantidadeTotal: 40, emManutencao: 8 },
      [reserva({ quantidade: 24, saiu: 24, voltou: 20 })],
      HOJE,
    );
    expect(l).toMatchObject({ noGalpao: 36, fora: 4, prontasNoGalpao: 28 });
  });

  it("a peça em conferência é condição, não lugar: está no galpão, mas não pronta", () => {
    const l = logisticaDoItem({ quantidadeTotal: 40, emConferencia: 20 }, [], HOJE);
    expect(l).toMatchObject({ noGalpao: 40, fora: 0, prontasNoGalpao: 20 });
  });

  it("reservado à frente: só o que ainda não saiu e cuja janela não acabou", () => {
    const l = logisticaDoItem(
      { quantidadeTotal: 40 },
      [
        reserva({ quantidade: 20, inicio: "2026-10-23", fim: "2026-10-25" }),
        reserva({ quantidade: 10, inicio: "2026-11-06", fim: "2026-11-08" }),
        reserva({ quantidade: 30, inicio: "2026-09-01", fim: "2026-09-03" }), // passou
        reserva({ quantidade: 5, inicio: "2026-10-13", fim: "2026-10-15", saiu: 5 }), // já saiu
      ],
      HOJE,
    );
    expect(l).toMatchObject({ reservadoAFrente: 30, eventosAFrente: 2, fora: 5 });
  });

  it("evento cancelado não é 'reservado à frente' — mas o que saiu para ele continua fora", () => {
    const l = logisticaDoItem(
      { quantidadeTotal: 40 },
      [
        reserva({ quantidade: 20, inicio: "2026-10-23", fim: "2026-10-25", eventoCancelado: true }),
        reserva({ quantidade: 6, saiu: 6, voltou: 0, eventoCancelado: true }),
      ],
      HOJE,
    );
    expect(l).toMatchObject({ reservadoAFrente: 0, eventosAFrente: 0, fora: 6, noGalpao: 34 });
  });

  it("dado incoerente (mais fora do que existe) nunca dá número negativo", () => {
    const l = logisticaDoItem(
      { quantidadeTotal: 3, emLimpeza: 2 },
      [reserva({ quantidade: 10, saiu: 10 })],
      HOJE,
    );
    expect(l.noGalpao).toBe(0);
    expect(l.prontasNoGalpao).toBe(0);
  });
});
