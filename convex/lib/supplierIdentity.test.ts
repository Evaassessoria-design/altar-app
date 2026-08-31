import { describe, expect, it } from "vitest";
import { dedupKey, isSameSupplier, normalizeName, normalizePhone } from "./supplierIdentity";

// ─────────────────────────────────────────────────────────────────────────────
// A decisão de produto foi explícita: EM CASO DE DÚVIDA, PREFERIR DUPLICIDADE.
// Fundir dois fornecedores diferentes é irreversível; duplicar é um incômodo.
//
// Metade destes testes existe para provar o que a regra NÃO faz.
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeName — tira ruído tipográfico, não interpreta", () => {
  it("ignora maiúsculas, acentos, pontuação e espaços extras", () => {
    expect(normalizeName("Buffet Silva")).toBe("buffet silva");
    expect(normalizeName("  BUFFET   SILVA  ")).toBe("buffet silva");
    expect(normalizeName("Decoração Açaí")).toBe("decoracao acai");
    expect(normalizeName("Flores & Cia.")).toBe("flores & cia");
  });

  it("NÃO interpreta sinônimos nem abreviações", () => {
    // "&" e "e" são coisas diferentes para nós — quem decide é a pessoa.
    expect(normalizeName("Flores & Cia")).not.toBe(normalizeName("Flores e Cia"));
    expect(normalizeName("Buffet Silva ME")).not.toBe(normalizeName("Buffet Silva"));
  });

  it("aceita vazio e ausência", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName(null)).toBe("");
  });
});

describe("normalizePhone — o mesmo número escrito de jeitos diferentes", () => {
  it("colapsa formatos brasileiros no mesmo valor", () => {
    const esperado = "14996247868";
    for (const forma of [
      "(14) 99624-7868",
      "14996247868",
      "14 99624 7868",
      "+55 14 99624-7868",
      "5514996247868",
    ]) {
      expect(normalizePhone(forma), forma).toBe(esperado);
    }
  });

  it("não mutila número que legitimamente começa com 55", () => {
    // 55 aqui é DDD (Campo Grande), não código do país.
    expect(normalizePhone("(55) 99999-8888")).toBe("55999998888");
  });

  it("aceita vazio e ausência", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });
});

describe("dedupKey — só existe chave com evidência forte", () => {
  it("gera chave com nome E telefone completos", () => {
    expect(dedupKey("Buffet Silva", "(14) 99624-7868")).toBe("buffet silva|14996247868");
  });

  it("NÃO gera chave sem telefone", () => {
    // Sem telefone, "Buffet Silva" pode ser duas empresas em cidades diferentes.
    expect(dedupKey("Buffet Silva", undefined)).toBeNull();
    expect(dedupKey("Buffet Silva", "")).toBeNull();
  });

  it("NÃO gera chave com telefone curto demais", () => {
    // Ramal ou número truncado não identifica ninguém.
    expect(dedupKey("Buffet Silva", "1234")).toBeNull();
    expect(dedupKey("Buffet Silva", "99624786")).toBeNull();
  });

  it("NÃO gera chave sem nome", () => {
    expect(dedupKey("", "14996247868")).toBeNull();
    expect(dedupKey(undefined, "14996247868")).toBeNull();
  });
});

describe("isSameSupplier — o que funde e, sobretudo, o que NÃO funde", () => {
  it("funde o mesmo fornecedor escrito de formas diferentes", () => {
    expect(
      isSameSupplier(
        { companyName: "Buffet Silva", phone: "(14) 99624-7868" },
        { companyName: "BUFFET SILVA", phone: "14996247868" },
      ),
    ).toBe(true);
  });

  it("NÃO funde nomes iguais com telefones diferentes", () => {
    expect(
      isSameSupplier(
        { companyName: "Buffet Silva", phone: "14996247868" },
        { companyName: "Buffet Silva", phone: "11988887777" },
      ),
    ).toBe(false);
  });

  it("NÃO funde quando falta telefone em qualquer um dos lados", () => {
    expect(
      isSameSupplier(
        { companyName: "Buffet Silva", phone: "14996247868" },
        { companyName: "Buffet Silva" },
      ),
    ).toBe(false);
    expect(
      isSameSupplier({ companyName: "Buffet Silva" }, { companyName: "Buffet Silva" }),
    ).toBe(false);
  });

  it("NÃO funde por nome parecido — nem com o mesmo telefone", () => {
    // Deduplicação agressiva por semelhança foi explicitamente descartada.
    expect(
      isSameSupplier(
        { companyName: "Buffet Silva", phone: "14996247868" },
        { companyName: "Buffet Silva Eventos", phone: "14996247868" },
      ),
    ).toBe(false);
  });

  it("NÃO funde empresas diferentes que compartilham telefone", () => {
    // Acontece: dois fornecedores do mesmo dono, mesmo telefone comercial.
    expect(
      isSameSupplier(
        { companyName: "Flores & Cia", phone: "14996247868" },
        { companyName: "Buffet Silva", phone: "14996247868" },
      ),
    ).toBe(false);
  });
});
