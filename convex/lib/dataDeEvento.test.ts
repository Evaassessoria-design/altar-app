import { describe, expect, it } from "vitest";
import { validarDataDeEvento, normalizarDataDeEvento } from "./dataDeEvento";
import { parseEventDate, temHora } from "../../src/lib/event-date";

describe("formatos aceitos", () => {
  it("só o dia continua sendo só o dia — nenhum horário é inventado", () => {
    const r = validarDataDeEvento("2026-10-10");
    expect(r).toEqual({ ok: true, valor: "2026-10-10", temHora: false });
  });

  it("dia com horário é preservado como está", () => {
    const r = validarDataDeEvento("2026-10-10T18:00");
    expect(r).toEqual({ ok: true, valor: "2026-10-10T18:00", temHora: true });
  });

  it("segundos são descartados — evento não tem precisão de segundo", () => {
    const r = validarDataDeEvento("2026-10-10T18:00:45");
    expect(r.ok && r.valor).toBe("2026-10-10T18:00");
  });

  it("espaços em volta não invalidam", () => {
    expect(validarDataDeEvento("  2026-10-10  ").ok).toBe(true);
  });
});

describe("o que é recusado", () => {
  it.each([
    ["vazio", ""],
    ["só espaços", "   "],
    ["undefined", undefined],
    ["null", null],
    ["lixo", "amanhã"],
    ["formato brasileiro", "10/10/2026"],
    ["sem zero à esquerda", "2026-9-5"],
    ["ISO com Z", "2026-10-10T18:00:00.000Z"],
    ["ISO com offset", "2026-10-10T18:00-03:00"],
    ["a concatenação que quebrou o Painel Admin", "2026-10-10T18:00T12:00:00"],
    ["dia 31 de fevereiro", "2026-02-31"],
    ["30 de fevereiro", "2026-02-30"],
    ["mês 13", "2026-13-01"],
    ["dia 00", "2026-10-00"],
    ["hora 25", "2026-10-10T25:00"],
    ["minuto 60", "2026-10-10T18:60"],
  ])("%s é recusado", (_nome, valor) => {
    expect(validarDataDeEvento(valor as string | undefined | null).ok).toBe(false);
  });

  it("a recusa explica o que fazer, não só que deu errado", () => {
    const r = validarDataDeEvento("10/10/2026");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("AAAA-MM-DD");
      expect(r.motivo).toContain("AAAA-MM-DDTHH:mm");
    }
  });

  it("ISO com fuso é recusado DE PROPÓSITO, e o motivo diz por quê", () => {
    const r = validarDataDeEvento("2026-10-10T18:00:00.000Z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("fuso");
  });

  it("29 de fevereiro vale em ano bissexto e não vale fora dele", () => {
    expect(validarDataDeEvento("2028-02-29").ok).toBe(true);
    expect(validarDataDeEvento("2027-02-29").ok).toBe(false);
  });
});

describe("normalizarDataDeEvento — a porta da mutation", () => {
  it("devolve o valor a gravar quando é válido", () => {
    expect(normalizarDataDeEvento("2026-10-10T18:00")).toBe("2026-10-10T18:00");
  });

  it("lança com código que a tela reconhece", () => {
    try {
      normalizarDataDeEvento("10/10/2026");
      expect.unreachable("devia ter lançado");
    } catch (e) {
      expect((e as { data: { code: string } }).data.code).toBe("DATA_DE_EVENTO_INVALIDA");
    }
  });
});

describe("os dois formatos continuam legíveis pelos leitores endurecidos", () => {
  // A escrita ficou estrita; a LEITURA continua tolerante, porque o banco tem
  // registros antigos que este MASTER não reescreve.
  it.each(["2026-10-10", "2026-10-10T18:00"])("%s vira a mesma data do dia 10", (v) => {
    const d = parseEventDate(v);
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(10);
    expect(d!.getMonth()).toBe(9);
  });

  it("só o dia continua sendo lido como SEM hora", () => {
    expect(temHora("2026-10-10")).toBe(false);
    expect(temHora("2026-10-10T18:00")).toBe(true);
  });

  it("registro antigo fora do padrão continua sendo lido, não quebra", () => {
    // A escrita passa a recusar; o que já está no banco segue legível.
    expect(parseEventDate("2026-10-10T18:00:00.000Z")).not.toBeNull();
  });
});
