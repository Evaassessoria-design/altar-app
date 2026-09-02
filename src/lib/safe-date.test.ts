import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import { SEM_DATA, formatTimestamp, formatTimestampComHora, parseTimestamp } from "./safe-date.ts";
import { formatEventDayOnly } from "./event-date.ts";

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSÃO — "Invalid time value" derrubou o Painel Admin em produção
// ─────────────────────────────────────────────────────────────────────────────

describe("o crash de produção, reproduzido", () => {
  // `events.date` guarda DUAS formas (ver event-date.ts): "2026-10-10" do seed
  // e das importações, e "2026-10-10T18:00" do formulário `datetime-local`.
  //
  // O Painel Admin assumia que era sempre a primeira e concatenava a hora:
  //
  //     new Date(nextEventDate + "T12:00:00")
  //
  // Com a segunda forma isso monta "2026-10-10T18:00T12:00:00" — duas horas na
  // mesma string. Invalid Date. E `format()` do date-fns LANÇA, derrubando a
  // página inteira até o ErrorBoundary.
  const COMO_O_FORMULARIO_GRAVA = "2026-10-10T18:00";

  it("a concatenação antiga produzia Invalid Date", () => {
    const d = new Date(COMO_O_FORMULARIO_GRAVA + "T12:00:00");
    expect(Number.isNaN(d.getTime())).toBe(true);
  });

  it("e format() sobre ela LANÇA — era isto que apagava o Painel Admin", () => {
    expect(() => format(new Date(COMO_O_FORMULARIO_GRAVA + "T12:00:00"), "dd/MM/yyyy")).toThrow();
  });

  it("o caminho novo mostra a data certa, sem concatenar nada", () => {
    expect(formatEventDayOnly(COMO_O_FORMULARIO_GRAVA)).toBe("10/10/2026");
  });

  it("e a forma só-data continua exibida como sempre foi", () => {
    expect(formatEventDayOnly("2026-10-10")).toBe("10/10/2026");
  });
});

describe("parseTimestamp — o que é data e o que não é", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["string vazia", ""],
    ["só espaços", "   "],
    ["texto qualquer", "não é data"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["ISO truncado inválido", "2026-13-45"],
  ])("%s → null (não inventa data)", (_nome, valor) => {
    expect(parseTimestamp(valor as number | string | null | undefined)).toBeNull();
  });

  it("epoch ms válido vira Date", () => {
    const ms = Date.UTC(2026, 9, 10, 15, 30);
    expect(parseTimestamp(ms)?.getTime()).toBe(ms);
  });

  it("ISO completo vira Date", () => {
    expect(parseTimestamp("2026-10-10T18:00:00.000Z")?.getTime()).toBe(
      Date.parse("2026-10-10T18:00:00.000Z"),
    );
  });

  it("epoch 0 é um instante real, não ausência — não vira null", () => {
    // Esconder 1970 seria inventar regra. Ausência é undefined/null/"".
    expect(parseTimestamp(0)).not.toBeNull();
  });
});

describe("formatTimestamp — nunca lança, nunca mostra Invalid Date", () => {
  it.each([undefined, null, "", "lixo", Number.NaN])(
    "valor inválido (%s) devolve o traço, sem lançar",
    (valor) => {
      expect(() => formatTimestamp(valor as never)).not.toThrow();
      expect(formatTimestamp(valor as never)).toBe(SEM_DATA);
    },
  );

  it("data válida é formatada normalmente", () => {
    expect(formatTimestamp(Date.parse("2026-10-10T12:00:00"))).toBe("10/10/2026");
  });

  it("com hora, quando pedido", () => {
    expect(formatTimestampComHora(Date.parse("2026-10-10T18:30:00"))).toBe("10/10/2026 18:30");
  });

  it("aceita um fallback próprio quando o traço não serve", () => {
    expect(formatTimestamp(undefined, "dd/MM/yyyy", "Não informado")).toBe("Não informado");
  });

  it("nunca devolve a string 'Invalid Date'", () => {
    for (const v of [undefined, null, "", "xxx", Number.NaN, "2026-99-99"]) {
      expect(formatTimestamp(v as never)).not.toContain("Invalid");
    }
  });
});
