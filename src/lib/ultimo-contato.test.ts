import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEventDate } from "./event-date.ts";
import { descreverUltimoContato, diasDesdeContato } from "./ultimo-contato.ts";

// As datas de teste são montadas com componentes LOCAIS (`new Date(a, m, d, h)`)
// de propósito: assim o teste diz a mesma coisa rodando em Brasília, em UTC ou
// em qualquer runner de CI. Um literal ISO com `Z` mudaria de dia conforme a
// máquina — que é justamente o bug que este módulo existe para evitar.
const AGORA = new Date(2026, 8, 2, 15, 0); // 02/09/2026, 15:00 local
const local = (...a: [number, number, number, number?, number?]) => new Date(...(a as [number, number, number]));
const iso = (d: Date) => d.toISOString();

describe("descreverUltimoContato", () => {
  it("hoje mostra a hora", () => {
    expect(descreverUltimoContato(iso(local(2026, 8, 2, 14, 32)), AGORA)).toBe("Hoje às 14:32");
  });

  it("ontem mostra a hora", () => {
    expect(descreverUltimoContato(iso(local(2026, 8, 1, 18, 10)), AGORA)).toBe("Ontem às 18:10");
  });

  it("mais antigo mostra dia/mês", () => {
    expect(descreverUltimoContato(iso(local(2026, 7, 20, 9, 5)), AGORA)).toBe("20/08 às 09:05");
  });

  it("de outro ano mostra o ano", () => {
    expect(descreverUltimoContato(iso(local(2025, 2, 12, 9, 0)), AGORA)).toBe("12/03/2025 às 09:00");
  });

  it("sem contato registrado devolve null — nunca 'nunca'", () => {
    // "Nunca" seria falso para todo lead anterior a este campo existir.
    expect(descreverUltimoContato(undefined, AGORA)).toBeNull();
    expect(descreverUltimoContato(null, AGORA)).toBeNull();
    expect(descreverUltimoContato("", AGORA)).toBeNull();
  });

  it("valor corrompido não vira 'Invalid Date' na tela", () => {
    expect(descreverUltimoContato("ontem de tarde", AGORA)).toBeNull();
  });
});

describe("registro ANTIGO, só com data", () => {
  it("NÃO desliza para a véspera", () => {
    // `new Date("2026-08-20")` é meia-noite UTC = 19/08 21:00 no Brasil. O
    // módulo ancora ao meio-dia local, então o dia 20 continua sendo o dia 20.
    expect(descreverUltimoContato("2026-08-20", AGORA)).toBe("20/08");
  });

  it("NÃO inventa hora", () => {
    // "20/08 às 12:00" mostraria como horário registrado uma âncora técnica.
    expect(descreverUltimoContato("2026-08-20", AGORA)).not.toContain("às");
  });

  it("data pura de hoje diz 'Hoje', sem hora", () => {
    expect(descreverUltimoContato("2026-09-02", AGORA)).toBe("Hoje");
  });

  it("data pura de ontem diz 'Ontem', sem hora", () => {
    expect(descreverUltimoContato("2026-09-01", AGORA)).toBe("Ontem");
  });
});

describe("a âncora do meio-dia está de fato aplicada", () => {
  // ── POR QUE ESTE BLOCO EXISTE ────────────────────────────────────────────
  // O teste "NÃO desliza para a véspera", logo acima, é comportamental: ele
  // só falha em fuso NEGATIVO. O runner de CI roda em UTC, onde
  // `new Date("2026-08-20")` dá dia 20 mesmo com o bug presente — ou seja,
  // trocar `parseEventDate` por `new Date` cru passaria aqui e quebraria na
  // máquina da usuária, em Brasília. Já aconteceu neste projeto com
  // `path.join`, e a lição foi esta: a trava tem de ser determinística.
  it("data-sem-hora é ancorada ao meio-dia local, em QUALQUER fuso", () => {
    const d = parseEventDate("2026-08-20")!;
    expect(d.getHours()).toBe(12); // 0 aqui significaria `new Date` cru
    expect(d.getDate()).toBe(20);
  });

  it("o módulo não constrói `new Date` a partir do valor guardado", () => {
    const fonte = readFileSync("src/lib/ultimo-contato.ts", "utf-8");
    expect(fonte).toContain("parseEventDate");
    expect(fonte).not.toMatch(/new Date\(\s*valor/);
  });
});

describe("a virada do dia não engana", () => {
  it("23:50 de ontem é 'Ontem', não 'Hoje'", () => {
    const agora = new Date(2026, 8, 2, 0, 10); // 00:10 de hoje
    expect(descreverUltimoContato(iso(local(2026, 8, 1, 23, 50)), agora)).toBe("Ontem às 23:50");
  });

  it("00:05 de hoje é 'Hoje' mesmo faltando minutos para virar", () => {
    const agora = new Date(2026, 8, 2, 23, 55);
    expect(descreverUltimoContato(iso(local(2026, 8, 2, 0, 5)), agora)).toBe("Hoje às 00:05");
  });

  it("contato às 22h no Brasil não vira 'amanhã' para quem lê", () => {
    // O servidor grava o INSTANTE em UTC; 22h de Brasília é 01h UTC do dia
    // seguinte. Convertido de volta para o fuso de quem lê, continua sendo hoje.
    const contato = local(2026, 8, 2, 22, 0);
    expect(descreverUltimoContato(contato.toISOString(), new Date(2026, 8, 2, 22, 30))).toBe(
      "Hoje às 22:00",
    );
  });
});

describe("diasDesdeContato", () => {
  it("conta DIAS CIVIS, não períodos de 24 horas", () => {
    // Conversa ontem às 23h, agora 01h: o calendário virou uma vez.
    const agora = new Date(2026, 8, 2, 1, 0);
    expect(diasDesdeContato(iso(local(2026, 8, 1, 23, 0)), agora)).toBe(1);
  });

  it("mesmo dia é zero, a qualquer hora", () => {
    expect(diasDesdeContato(iso(local(2026, 8, 2, 8, 0)), AGORA)).toBe(0);
    expect(diasDesdeContato(iso(local(2026, 8, 2, 23, 59)), AGORA)).toBe(0);
  });

  it("relógio adiantado não produz número negativo", () => {
    expect(diasDesdeContato(iso(local(2026, 8, 5, 10, 0)), AGORA)).toBe(0);
  });

  it("sem contato devolve null", () => {
    expect(diasDesdeContato(undefined, AGORA)).toBeNull();
  });

  it("atravessa a virada do mês", () => {
    expect(diasDesdeContato("2026-08-31", new Date(2026, 8, 2, 10, 0))).toBe(2);
  });
});
