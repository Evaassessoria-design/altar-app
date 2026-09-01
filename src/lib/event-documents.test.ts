import { describe, expect, it } from "vitest";
import { DOCUMENT_KINDS, labelDoTipo, ordenarDocumentos } from "./event-documents";

describe("labelDoTipo", () => {
  it("traduz os tipos conhecidos", () => {
    expect(labelDoTipo("addendum")).toBe("Aditivo");
    expect(labelDoTipo("budget")).toBe("Orçamento");
  });

  it("documento ANTIGO sem tipo é contrato — mesma regra do backend", () => {
    // `effectiveKind` em convex/contracts.ts trata ausência como "contract".
    // Se a tela discordasse, o contrato legado apareceria como "Outro".
    expect(labelDoTipo(undefined)).toBe("Contrato");
  });

  it("tipo desconhecido não quebra a tela", () => {
    expect(labelDoTipo("valor_inesperado")).toBe("Outro documento");
  });
});

describe("ordenarDocumentos", () => {
  const doc = (kind: string | undefined, uploadedAt: string) => ({ kind, uploadedAt });

  it("contrato vem primeiro, depois aditivo, orçamento, referência", () => {
    const pasta = [
      doc("reference", "2026-01-01"),
      doc("budget", "2026-01-01"),
      doc("contract", "2026-01-01"),
      doc("addendum", "2026-01-01"),
    ];
    expect(ordenarDocumentos(pasta).map((d) => d.kind)).toEqual([
      "contract",
      "addendum",
      "budget",
      "reference",
    ]);
  });

  it("dentro do mesmo tipo, o mais recente primeiro", () => {
    const pasta = [doc("budget", "2026-01-01"), doc("budget", "2026-05-01")];
    expect(ordenarDocumentos(pasta).map((d) => d.uploadedAt)).toEqual([
      "2026-05-01",
      "2026-01-01",
    ]);
  });

  it("documento sem tipo é ordenado como contrato", () => {
    const pasta = [doc("budget", "2026-01-01"), doc(undefined, "2026-01-01")];
    expect(ordenarDocumentos(pasta)[0].kind).toBeUndefined();
  });

  it("não altera o array recebido", () => {
    const pasta = [doc("budget", "2026-01-01"), doc("contract", "2026-01-01")];
    const copia = [...pasta];
    ordenarDocumentos(pasta);
    expect(pasta).toEqual(copia);
  });

  it("pasta vazia não quebra", () => {
    expect(ordenarDocumentos([])).toEqual([]);
  });

  it("os tipos da tela são exatamente os do schema", () => {
    expect(DOCUMENT_KINDS.map((d) => d.kind)).toEqual([
      "contract",
      "addendum",
      "budget",
      "reference",
      "other",
    ]);
  });
});
