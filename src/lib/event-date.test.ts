import { describe, expect, it } from "vitest";
import {
  diasAte,
  formatEventDateLong,
  formatEventDayOnly,
  formatEventDateShort,
  hojeDateKey,
  parseEventDate,
  temHora,
  toDateKey,
} from "./event-date";

// ─────────────────────────────────────────────────────────────────────────────
// O BUG QUE ESTES TESTES TRAVAM
//
// `new Date("2026-10-10")` é meia-noite UTC. No Brasil (UTC-3) isso é
// 09/10 às 21:00 — e era exatamente o que a lista, o detalhe e o PDF exibiam,
// enquanto a Agenda mostrava 10/10 porque já ancorava ao meio-dia.
//
// A regra: 10/10/2026 é 10/10/2026 em qualquer fuso.
// ─────────────────────────────────────────────────────────────────────────────

const DIA = "2026-10-10";

describe("data sem hora não desliza de dia", () => {
  it("10/10 continua 10/10", () => {
    const d = parseEventDate(DIA)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9); // outubro
    expect(d.getDate()).toBe(10);
  });

  it("é ancorada ao MEIO-DIA — 12h de folga para qualquer fuso", () => {
    // Meia-noite deslizaria; meio-dia não alcança nem UTC-11 nem UTC+14.
    expect(parseEventDate(DIA)!.getHours()).toBe(12);
  });

  it("a chave de data sobrevive à ida e volta", () => {
    expect(toDateKey(DIA)).toBe(DIA);
  });

  it("contraprova: o parse ingênuo REALMENTE erra em fuso negativo", () => {
    // Se este teste parar de valer, o bug deixou de existir no runtime e a
    // convenção pode ser revista. Enquanto valer, ela é necessária.
    const ingenuo = new Date(DIA);
    const offsetMin = ingenuo.getTimezoneOffset();
    if (offsetMin > 0) {
      // Fuso a oeste de Greenwich (Brasil): o dia local volta para 09.
      expect(ingenuo.getDate()).toBe(9);
    }
    // E a nossa versão acerta em qualquer fuso.
    expect(parseEventDate(DIA)!.getDate()).toBe(10);
  });
});

describe("data COM hora é lida como hora local", () => {
  it("18:00 continua 18:00 no mesmo dia", () => {
    const d = parseEventDate("2026-10-10T18:00")!;
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(18);
  });

  it("aceita segundos", () => {
    expect(parseEventDate("2026-10-10T18:30:45")!.getMinutes()).toBe(30);
  });
});

describe("não inventamos hora", () => {
  it("só data => temHora false", () => {
    expect(temHora(DIA)).toBe(false);
  });

  it("data com hora => temHora true", () => {
    expect(temHora("2026-10-10T18:00")).toBe(true);
  });

  it("a versão longa NÃO exibe horário para data pura", () => {
    // Era aqui que aparecia "09 de outubro de 2026, 21:00": as 21:00 eram
    // artefato de fuso, não um horário cadastrado.
    const texto = formatEventDateLong(DIA);
    expect(texto).toBe("10 de outubro de 2026");
    expect(texto).not.toMatch(/\d{2}:\d{2}/);
  });

  it("a versão longa exibe horário quando ele existe", () => {
    expect(formatEventDateLong("2026-10-10T18:00")).toContain("18:00");
  });

  it("formatEventDayOnly nunca mostra hora, mesmo tendo", () => {
    expect(formatEventDayOnly("2026-10-10T18:00")).toBe("10/10/2026");
  });

  it("formatEventDateShort acompanha o dado", () => {
    expect(formatEventDateShort(DIA)).toBe("10/10/2026");
    expect(formatEventDateShort("2026-10-10T18:00")).toBe("10/10/2026 18:00");
  });
});

describe("valores ausentes ou inválidos", () => {
  it("vazio não vira Invalid Date na tela", () => {
    expect(parseEventDate(undefined)).toBeNull();
    expect(parseEventDate("")).toBeNull();
    expect(formatEventDateLong(undefined)).toBe("Data não informada");
    expect(formatEventDayOnly(null)).toBe("—");
  });

  it("texto sem sentido também degrada", () => {
    expect(parseEventDate("qualquer coisa")).toBeNull();
    expect(toDateKey("qualquer coisa")).toBeNull();
  });
});

describe("contagem de dias", () => {
  it("conta dias inteiros a partir de hoje", () => {
    expect(diasAte("2026-10-10", "2026-10-01")).toBe(9);
    expect(diasAte("2026-10-10", "2026-10-10")).toBe(0);
    expect(diasAte("2026-10-01", "2026-10-10")).toBe(-9);
  });

  it("funciona com data que traz hora", () => {
    expect(diasAte("2026-10-10T18:00", "2026-10-09")).toBe(1);
  });

  it("hojeDateKey devolve AAAA-MM-DD do fuso local", () => {
    expect(hojeDateKey(new Date(2026, 9, 10, 23, 30))).toBe("2026-10-10");
    // 23:30 local não pode virar dia 11 por causa de UTC.
    expect(hojeDateKey(new Date(2026, 0, 1, 0, 15))).toBe("2026-01-01");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA: nenhuma tela pode voltar a formatar a data do evento na mão.
//
// O bug não estava em uma tela — estava na ausência de convenção. Se alguém
// escrever `new Date(event.date)` de novo, aquela superfície volta a exibir o
// dia anterior enquanto as outras acertam, e a incoerência reaparece.
// ─────────────────────────────────────────────────────────────────────────────
describe("a convenção é usada em todas as superfícies", () => {
  const SUPERFICIES = [
    "src/pages/app/events/page.tsx",
    "src/pages/app/events/[id]/page.tsx",
    "src/pages/app/dashboard/page.tsx",
    "src/pages/app/funil/page.tsx",
    "src/pages/app/events/[id]/_components/agenda-section.tsx",
    "src/lib/generate-assembly-pdf.ts",
    "src/lib/generate-event-pdf.ts",
    "src/lib/generate-orcamento-pdf.ts",
  ];

  it.each(SUPERFICIES)("%s não usa new Date() cru sobre data de evento", async (arquivo) => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync(arquivo, "utf-8");
    // Procura `new Date(algo.date)` / `.eventDate` — o padrão que desliza o dia.
    const cru = fonte.match(/new Date\(\s*\w+\.(date|eventDate)\b/g);
    expect(
      cru,
      `${arquivo}: use parseEventDate/formatEvent* de src/lib/event-date.ts`,
    ).toBeNull();
  });

  it("o teste detecta o padrão que procura", () => {
    // Contraprova: um regex quebrado passaria em tudo silenciosamente.
    const exemploRuim = 'format(new Date(event.date), "dd/MM")';
    expect(exemploRuim.match(/new Date\(\s*\w+\.(date|eventDate)\b/g)).toHaveLength(1);
  });
});
