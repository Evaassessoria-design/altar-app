import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import jsPDF from "jspdf";
import { cabeNaLargura, nomeDeArquivo } from "./pdf-marca.ts";

// ─────────────────────────────────────────────────────────────────────────────
// RODAPÉ COM NOME LONGO E NOME DE ARQUIVO COM ACENTO
//
// Os dois defeitos tinham sido corrigidos em UM documento cada (caderno e
// ficha floral) e continuavam vivos nos vizinhos: a folha de carregamento
// encavalava o nome do evento com "Página X de Y", e a ficha técnica e o
// carregamento salvavam "anivers-rio.pdf" e "Joo.pdf".
// ─────────────────────────────────────────────────────────────────────────────

const LONGO =
  "Estúdio Aurora Decorações · Casamento de Maria Eduarda Albuquerque & João Pedro Vasconcellos — Fazenda Santa Bárbara";

describe("cabeNaLargura", () => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  it("texto curto passa intacto", () => {
    expect(cabeNaLargura(doc, "Aurora · Helena & Tiago", 80)).toBe("Aurora · Helena & Tiago");
  });

  it("texto longo é cortado para caber, com reticências", () => {
    for (const largura of [20, 50, 81, 166]) {
      const r = cabeNaLargura(doc, LONGO, largura);
      expect(doc.getTextWidth(r)).toBeLessThanOrEqual(largura);
      // Reticências só quando cortou: o que cabe inteiro não ganha "…".
      expect(r.endsWith("…")).toBe(doc.getTextWidth(LONGO) > largura);
    }
  });

  it("corta na palavra inteira quando dá", () => {
    const r = cabeNaLargura(doc, LONGO, 60);
    expect(LONGO.startsWith(r.slice(0, -1))).toBe(true);
    expect(r).not.toMatch(/\s…$/);
  });

  it("largura minúscula não trava nem devolve vazio", () => {
    expect(cabeNaLargura(doc, LONGO, 1).length).toBeGreaterThan(0);
  });
});

describe("nomeDeArquivo", () => {
  it("tira o acento sem comer a letra", () => {
    expect(nomeDeArquivo("ficha-tecnica", "Aniversário da Conceição")).toBe(
      "ficha-tecnica-aniversario-da-conceicao.pdf",
    );
    expect(nomeDeArquivo("carregamento", "João & Mônica")).toBe("carregamento-joao-monica.pdf");
  });

  it("nome só de símbolos ainda gera um arquivo", () => {
    expect(nomeDeArquivo("carregamento", "★ ★")).toBe("carregamento-evento.pdf");
  });
});

describe("os documentos usam as peças", () => {
  it("carregamento corta o rodapé e nomeia sem perder acento", () => {
    const f = readFileSync("src/lib/generate-loading-pdf.ts", "utf-8");
    expect(f).toContain("cabeNaLargura(doc, `${identidade.nome} · ${data.event.name}`");
    expect(f).toContain('nomeDeArquivo("carregamento"');
    expect(f).not.toMatch(/replace\(\/\[\^\\w\\s-\]\/g/);
  });

  it("ficha técnica nomeia sem 'anivers-rio'", () => {
    const f = readFileSync("src/lib/generate-ficha-tecnica-pdf.ts", "utf-8");
    expect(f).toContain('nomeDeArquivo("ficha-tecnica"');
  });

  it("rodapé dos documentos internos corta antes do número da página", () => {
    const f = readFileSync("src/lib/pdf-marca.ts", "utf-8");
    expect(f).toContain("cabeNaLargura(doc, esquerda,");
  });
});
