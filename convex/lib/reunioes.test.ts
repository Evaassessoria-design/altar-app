import { describe, expect, it } from "vitest";
import {
  ehData,
  ehHorario,
  filtrarSugestao,
  lerJsonDoModelo,
  listaLimpa,
  normalizarLink,
  ordenarReunioes,
  precisaDeDesfecho,
  servicoDoLink,
} from "./reunioes";

// As regras das reuniões, sem banco. O que importa aqui é o que pode dar
// errado: link que vira código, data impossível, e a IA inventando decisão.

describe("link da sala", () => {
  it("aceita Meet e Zoom colados sem https", () => {
    expect(normalizarLink("meet.google.com/abc-defg-hij")).toEqual({
      ok: true,
      link: "https://meet.google.com/abc-defg-hij",
    });
    expect(normalizarLink(" https://us02web.zoom.us/j/123?pwd=x ")).toMatchObject({ ok: true });
  });

  it("recusa javascript:, data: e texto que não é endereço", () => {
    for (const ruim of ["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://x.com/a", "reunião amanhã", "localhost"]) {
      expect(normalizarLink(ruim).ok, ruim).toBe(false);
    }
  });

  it("nomeia o serviço pelo domínio, sem se deixar enganar por subdomínio", () => {
    expect(servicoDoLink("https://meet.google.com/x")).toBe("Google Meet");
    expect(servicoDoLink("https://us02web.zoom.us/j/1")).toBe("Zoom");
    expect(servicoDoLink("https://zoom.us.golpe.com/j/1")).toBe("Link externo");
  });
});

describe("data e horário", () => {
  it("só data de calendário real", () => {
    expect(ehData("2027-02-28")).toBe(true);
    expect(ehData("2028-02-29")).toBe(true);
    expect(ehData("2027-02-29")).toBe(false);
    expect(ehData("2027-13-01")).toBe(false);
    expect(ehData("2027-1-01")).toBe(false);
    expect(ehData("2027-01-01T10:00")).toBe(false);
  });
  it("horário 00:00 a 23:59", () => {
    expect(ehHorario("09:30")).toBe(true);
    expect(ehHorario("23:59")).toBe(true);
    expect(ehHorario("24:00")).toBe(false);
    expect(ehHorario("9:30")).toBe(false);
  });
});

describe("ordem e desfecho", () => {
  const hoje = "2026-10-15";
  const r = (data: string, horario?: string) => ({ data, horario, criadaEm: "2026-10-01T00:00:00Z" });

  it("próximas primeiro (mais perto antes), depois passadas (mais recente antes)", () => {
    const ordem = ordenarReunioes(
      [r("2026-10-01"), r("2026-11-20"), r("2026-10-15", "18:00"), r("2026-10-15", "09:00"), r("2026-09-10")],
      hoje,
    ).map((x) => `${x.data} ${x.horario ?? ""}`.trim());
    expect(ordem).toEqual([
      "2026-10-15 09:00",
      "2026-10-15 18:00",
      "2026-11-20",
      "2026-10-01",
      "2026-09-10",
    ]);
  });

  it("agendada no passado pede desfecho; realizada e cancelada não", () => {
    expect(precisaDeDesfecho({ situacao: "agendada", data: "2026-10-14" }, hoje)).toBe(true);
    expect(precisaDeDesfecho({ situacao: "agendada", data: hoje }, hoje)).toBe(false);
    expect(precisaDeDesfecho({ situacao: "realizada", data: "2026-10-01" }, hoje)).toBe(false);
    expect(precisaDeDesfecho({ situacao: "cancelada", data: "2026-10-01" }, hoje)).toBe(false);
  });
});

describe("listaLimpa", () => {
  it("tira vazio e repetição, sem perder ordem", () => {
    expect(listaLimpa(["  Paleta terracota ", "", "paleta TERRACOTA", "Bolo de 3 andares"])).toEqual([
      "Paleta terracota",
      "Bolo de 3 andares",
    ]);
  });
});

describe("a IA não inventa decisão", () => {
  const NOTAS = `Helena quer paleta terracota com toques de verde-oliva.
Ficou decidido: bolo de 3 andares, sem flores naturais no bolo.
Tiago vai mandar a lista final de convidados até sexta.
Ainda pensando se terá cantinho das crianças.`;

  it("mantém o que tem trecho nas notas e descarta o resto", () => {
    const s = filtrarSugestao(
      {
        resumo: "Reunião de alinhamento.",
        decisoes: [
          { texto: "Bolo de 3 andares, sem flores naturais", trecho: "bolo de 3 andares, sem flores naturais no bolo" },
          // Inventada: ninguém escreveu isto.
          { texto: "Cantinho das crianças confirmado", trecho: "cantinho das crianças confirmado" },
          // Sem trecho.
          { texto: "Paleta terracota" },
        ],
        pendencias: [
          { texto: "Enviar lista de convidados", responsavel: "Tiago", trecho: "Tiago vai mandar a lista final de convidados" },
        ],
      },
      NOTAS,
    );
    expect(s.decisoes.map((d) => d.texto)).toEqual(["Bolo de 3 andares, sem flores naturais"]);
    expect(s.pendencias).toEqual([
      expect.objectContaining({ texto: "Enviar lista de convidados", responsavel: "Tiago" }),
    ]);
    expect(s.descartados).toBe(2);
    expect(s.resumo).toBe("Reunião de alinhamento.");
  });

  it("trecho tolera caixa, acento e espaços — não palavras trocadas", () => {
    const ok = filtrarSugestao({ decisoes: [{ texto: "x", trecho: "FICOU   DECIDIDO: BOLO" }] }, NOTAS);
    expect(ok.decisoes).toHaveLength(1);
    const troca = filtrarSugestao({ decisoes: [{ texto: "x", trecho: "ficou decidido: torta" }] }, NOTAS);
    expect(troca.decisoes).toHaveLength(0);
  });

  it("responsável que não aparece nas notas não é atribuído", () => {
    const s = filtrarSugestao(
      { pendencias: [{ texto: "Enviar lista", responsavel: "Mariana", trecho: "lista final de convidados" }] },
      NOTAS,
    );
    expect(s.pendencias[0].responsavel).toBeUndefined();
  });

  it("trecho curtinho ('a') não sustenta nada", () => {
    expect(filtrarSugestao({ decisoes: [{ texto: "Qualquer coisa", trecho: "a" }] }, NOTAS).decisoes).toEqual([]);
  });

  it("resposta torta do modelo vira sugestão vazia, nunca exceção", () => {
    expect(lerJsonDoModelo("desculpe, não consegui")).toEqual({});
    expect(lerJsonDoModelo("[1,2]")).toEqual({});
    expect(lerJsonDoModelo('```json\n{"resumo":"ok"}\n```')).toEqual({ resumo: "ok" });
    const s = filtrarSugestao({ decisoes: "não é lista", pendencias: [null, 3] }, NOTAS);
    expect(s).toMatchObject({ decisoes: [], pendencias: [], resumo: "" });
  });
});
