import { describe, expect, it } from "vitest";
import {
  casarContato,
  formatarBr,
  mascarar,
  mesmoNumero,
  normalizarE164,
  variantesDeBusca,
} from "./telefone";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA: casar telefone errado mostra a conversa de um cliente na ficha de
// outro. É o pior defeito possível da Central — pior que não casar nada.
// ─────────────────────────────────────────────────────────────────────────────

describe("normalização para E.164", () => {
  it.each([
    ["(11) 99999-8888", "+5511999998888"],
    ["11999998888", "+5511999998888"],
    ["+55 11 99999-8888", "+5511999998888"],
    ["5511999998888", "+5511999998888"],
    ["0055 11 99999 8888", "+5511999998888"],
    ["011999998888", "+5511999998888"],
    ["  11 9 9999 8888  ", "+5511999998888"],
  ])("%j vira %j", (bruto, esperado) => {
    expect(normalizarE164(bruto)).toBe(esperado);
  });

  it("aceita fixo de oito dígitos", () => {
    expect(normalizarE164("(11) 3333-4444")).toBe("+551133334444");
  });

  it("aceita DDI já presente em número de oito dígitos", () => {
    expect(normalizarE164("551133334444")).toBe("+551133334444");
  });

  it.each([
    [undefined as string | null | undefined, "ausente"],
    [null, "nulo"],
    ["", "vazio"],
    ["abc", "sem dígito"],
    ["99998888", "sem DDD"],
    ["12345", "curto demais"],
    ["+1 415 555 2671", "estrangeiro"],
    ["999999999999999", "longo demais"],
  ])("%j devolve null (%s)", (bruto, _motivo) => {
    expect(normalizarE164(bruto)).toBeNull();
  });

  it("DDD fora da faixa brasileira não normaliza", () => {
    expect(normalizarE164("0199999888")).toBeNull();
    expect(normalizarE164("1099999888")).toBeNull();
  });

  // Regressão: onze dígitos de um número dos EUA são indistinguíveis de um
  // celular brasileiro sem DDI. Quem escreveu o país tem de ser respeitado —
  // senão "+1 415 555 2671" virava um número de Bauru pertencente a outra
  // pessoa, e a conversa de um desconhecido aparecia na ficha dela.
  it.each(["+1 415 555 2671", "001 415 555 2671", "+351 912 345 678"])(
    "DDI explícito diferente de 55 (%j) devolve null",
    (estrangeiro) => {
      expect(normalizarE164(estrangeiro)).toBeNull();
    },
  );

  it("DDI explícito 55 continua sendo aceito", () => {
    expect(normalizarE164("+5511999998888")).toBe("+5511999998888");
    expect(normalizarE164("0055 11 99999 8888")).toBe("+5511999998888");
  });
});

describe("nono dígito", () => {
  it("celular de nove dígitos também é buscado com oito", () => {
    expect(variantesDeBusca("+5511999998888").sort()).toEqual(
      ["+5511999998888", "+551199998888"].sort(),
    );
  });

  it("celular antigo de oito dígitos também é buscado com nove", () => {
    expect(variantesDeBusca("+551199998888").sort()).toEqual(
      ["+5511999998888", "+551199998888"].sort(),
    );
  });

  it("fixo NÃO ganha nono dígito", () => {
    // Prefixo 3 é fixo: acrescentar 9 criaria um número que não existe.
    expect(variantesDeBusca("+551133334444")).toEqual(["+551133334444"]);
  });

  it("entrada vazia devolve lista vazia", () => {
    expect(variantesDeBusca(undefined)).toEqual([]);
    expect(variantesDeBusca(null)).toEqual([]);
  });
});

describe("mesmo número", () => {
  it("formatos diferentes do mesmo aparelho casam", () => {
    expect(mesmoNumero("(11) 99999-8888", "+55 11 99999 8888")).toBe(true);
  });

  it("oito e nove dígitos do mesmo aparelho casam", () => {
    expect(mesmoNumero("11999998888", "1199998888")).toBe(true);
  });

  it("aparelhos diferentes não casam", () => {
    expect(mesmoNumero("11999998888", "11999998889")).toBe(false);
  });

  it("DDD diferente não casa", () => {
    expect(mesmoNumero("11999998888", "21999998888")).toBe(false);
  });

  it.each([
    ["abc", "11999998888"],
    ["11999998888", ""],
    [undefined, undefined],
  ])("entrada não normalizável (%j, %j) NUNCA vira igualdade", (a, b) => {
    expect(mesmoNumero(a as string | undefined, b as string | undefined)).toBe(false);
  });
});

describe("casamento de contato", () => {
  it("um candidato vira vínculo", () => {
    expect(casarContato(["a"])).toEqual({ tipo: "unico", escolhido: "a" });
  });

  it("nenhum candidato não vira vínculo", () => {
    expect(casarContato([])).toEqual({ tipo: "nenhum" });
  });

  it("DOIS candidatos NUNCA viram vínculo automático", () => {
    const r = casarContato(["a", "b"]);
    expect(r.tipo).toBe("ambiguo");
    expect(r).not.toHaveProperty("escolhido");
  });
});

describe("exibição", () => {
  it("o painel executivo só vê os quatro últimos dígitos", () => {
    const mascarado = mascarar("+5511999998888");
    expect(mascarado).toContain("8888");
    expect(mascarado).not.toContain("99999");
    expect(mascarado.startsWith("+55 11")).toBe(true);
  });

  it("número irreconhecível vira traço, não vaza o texto cru", () => {
    expect(mascarar("sei lá")).toBe("—");
    expect(mascarar(undefined)).toBe("—");
  });

  it("o Painel Admin vê o número formatado", () => {
    expect(formatarBr("+5511999998888")).toBe("(11) 99999-8888");
    expect(formatarBr("+551133334444")).toBe("(11) 3333-4444");
  });

  it("texto não normalizável é devolvido como veio, sem inventar formato", () => {
    expect(formatarBr("ramal 204")).toBe("ramal 204");
  });
});
