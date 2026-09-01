import { describe, expect, it } from "vitest";
import { SUPPLIER_CATEGORIES, filtrarFornecedores, labelDaCategoria } from "./supplier-categories";

const f = (over: Partial<Parameters<typeof filtrarFornecedores>[0][number]> & { companyName: string }) => ({
  ...over,
});

describe("labelDaCategoria", () => {
  it("traduz os slugs conhecidos", () => {
    expect(labelDaCategoria("som_ilum")).toBe("Som & Iluminação");
  });

  it("categoria digitada à mão volta como veio — nunca 'inválido'", () => {
    // `category` é texto livre no schema; a tela do evento permite digitar.
    expect(labelDaCategoria("floricultura da esquina")).toBe("floricultura da esquina");
  });

  it("sem categoria tem rótulo próprio", () => {
    expect(labelDaCategoria(undefined)).toBe("Sem categoria");
    expect(labelDaCategoria("")).toBe("Sem categoria");
  });

  it("todos os slugs da lista são únicos", () => {
    const slugs = SUPPLIER_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("filtrarFornecedores", () => {
  const lista = [
    f({ companyName: "Flores Bela", city: "São Paulo", category: "doces" }),
    f({ companyName: "Buffet Aurora", contactName: "Camila", phone: "(11) 90001-2233" }),
    f({ companyName: "Som & Cia", category: "som_ilum" }),
  ];

  it("termo vazio devolve tudo", () => {
    // Senão a lista some enquanto a pessoa ainda não digitou nada.
    expect(filtrarFornecedores(lista, "")).toHaveLength(3);
    expect(filtrarFornecedores(lista, "   ")).toHaveLength(3);
  });

  it("acha por nome, ignorando caixa", () => {
    expect(filtrarFornecedores(lista, "flores")[0].companyName).toBe("Flores Bela");
  });

  it("acha por cidade IGNORANDO acento", () => {
    expect(filtrarFornecedores(lista, "sao paulo")[0].companyName).toBe("Flores Bela");
  });

  it("acha pelo nome do contato", () => {
    expect(filtrarFornecedores(lista, "camila")[0].companyName).toBe("Buffet Aurora");
  });

  it("acha por telefone", () => {
    expect(filtrarFornecedores(lista, "90001")[0].companyName).toBe("Buffet Aurora");
  });

  it("acha pelo RÓTULO da categoria, não só pelo slug", () => {
    // Quem busca "iluminação" não sabe que o slug é "som_ilum".
    expect(filtrarFornecedores(lista, "iluminacao")[0].companyName).toBe("Som & Cia");
  });

  it("termo sem resultado devolve lista vazia, não a lista inteira", () => {
    expect(filtrarFornecedores(lista, "zzzz")).toEqual([]);
  });

  it("não altera o array recebido", () => {
    const copia = [...lista];
    filtrarFornecedores(lista, "flores");
    expect(lista).toEqual(copia);
  });
});
