import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TAMANHO_MAXIMO_MB,
  TIPOS_DE_DOCUMENTO_DO_LEAD,
  motivoParaRecusarArquivo,
  ordenarDocumentosDoLead,
  rotuloDoTipo,
  tamanhoLegivel,
} from "./tiposDeDocumento";

describe("rótulo do tipo", () => {
  it.each(TIPOS_DE_DOCUMENTO_DO_LEAD.map((t) => [t.valor, t.rotulo]))(
    "%s → %s",
    (valor, rotulo) => {
      expect(rotuloDoTipo(valor)).toBe(rotulo);
    },
  );

  it("documento SEM tipo não ganha rótulo inventado", () => {
    // Chamar de "Proposta" um arquivo antigo seria afirmar o que ninguém disse.
    expect(rotuloDoTipo(undefined)).toBeNull();
    expect(rotuloDoTipo(null)).toBeNull();
    expect(rotuloDoTipo("")).toBeNull();
  });

  it("tipo desconhecido (gravado por versão futura) não quebra a tela", () => {
    expect(rotuloDoTipo("planta_baixa")).toBeNull();
  });
});

describe("ordenação", () => {
  it("mais recente primeiro", () => {
    const docs = [
      { id: "a", uploadedAt: "2026-01-01T10:00:00.000Z" },
      { id: "b", uploadedAt: "2026-03-01T10:00:00.000Z" },
      { id: "c", uploadedAt: "2026-02-01T10:00:00.000Z" },
    ];
    expect(ordenarDocumentosDoLead(docs).map((d) => d.id)).toEqual(["b", "c", "a"]);
  });

  it("não altera o array recebido", () => {
    const docs = [
      { id: "a", uploadedAt: "2026-01-01T10:00:00.000Z" },
      { id: "b", uploadedAt: "2026-03-01T10:00:00.000Z" },
    ];
    ordenarDocumentosDoLead(docs);
    expect(docs.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(ordenarDocumentosDoLead([])).toEqual([]);
  });
});

describe("recusa de arquivo", () => {
  it("aceita um PDF comum", () => {
    expect(motivoParaRecusarArquivo({ name: "proposta.pdf", size: 200_000 })).toBeNull();
  });

  it("recusa arquivo ausente", () => {
    expect(motivoParaRecusarArquivo(null)).toBe("Nenhum arquivo selecionado.");
    expect(motivoParaRecusarArquivo(undefined)).toBe("Nenhum arquivo selecionado.");
  });

  it("recusa arquivo vazio — o upload passaria e a linha ficaria inútil", () => {
    expect(motivoParaRecusarArquivo({ name: "vazio.pdf", size: 0 })).toBe("O arquivo está vazio.");
  });

  it("recusa arquivo sem nome", () => {
    expect(motivoParaRecusarArquivo({ name: "   ", size: 10 })).toBe("Arquivo sem nome.");
  });

  it("recusa acima do limite, com o limite na mensagem", () => {
    const grande = { name: "video.mp4", size: (TAMANHO_MAXIMO_MB + 1) * 1024 * 1024 };
    expect(motivoParaRecusarArquivo(grande)).toBe(`Arquivo maior que ${TAMANHO_MAXIMO_MB} MB.`);
  });

  it("aceita exatamente no limite", () => {
    const limite = { name: "quase.pdf", size: TAMANHO_MAXIMO_MB * 1024 * 1024 };
    expect(motivoParaRecusarArquivo(limite)).toBeNull();
  });
});

describe("tamanho legível", () => {
  it.each([
    [512, "512 B"],
    [2048, "2,0 KB"],
    [1024 * 900, "900 KB"],
    [1024 * 1024 * 1.4, "1,4 MB"],
    [1024 * 1024 * 15, "15 MB"],
  ])("%i bytes → %s", (bytes, esperado) => {
    expect(tamanhoLegivel(bytes)).toBe(esperado);
  });

  it("tamanho não gravado devolve null — nada de '0 B' mentiroso", () => {
    expect(tamanhoLegivel(undefined)).toBeNull();
    expect(tamanhoLegivel(null)).toBeNull();
  });

  it("valor negativo (dado corrompido) devolve null em vez de texto absurdo", () => {
    expect(tamanhoLegivel(-5)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANTIDUPLICAÇÃO — a lista existe UMA vez.
// O Convex exige literais estáticos no validador, então o `v.union` repete os
// valores. Este bloco garante que a repetição não vire divergência: já
// aconteceu três vezes neste projeto (categoria de fornecedor, tipo de evento,
// papel da equipe).
// ─────────────────────────────────────────────────────────────────────────────
describe("o backend aceita exatamente estes tipos", () => {
  const literaisDe = (fonte: string, trecho: string) => {
    const i = fonte.indexOf(trecho);
    expect(i, `trecho "${trecho}" não existe mais`).toBeGreaterThan(-1);
    // Fecha no `);` da própria linha — parar no primeiro ")" pegaria só o
    // fim de `v.literal("proposta")` e o teste passaria vendo um item só.
    const abre = fonte.indexOf("v.union(", i);
    const fecha = fonte.indexOf("\n);", abre);
    const bloco = fonte.slice(abre, fecha === -1 ? undefined : fecha);
    return [...bloco.matchAll(/v\.literal\("([^"]+)"\)/g)].map((m) => m[1]);
  };

  const esperados = TIPOS_DE_DOCUMENTO_DO_LEAD.map((t) => t.valor);

  it("o validador de `leadDocuments.save` bate com a fonte única", () => {
    const fonte = readFileSync("convex/leadDocuments.ts", "utf-8");
    expect(literaisDe(fonte, "const documentType = v.union(")).toEqual(esperados);
  });

  it("o schema bate com a fonte única", () => {
    const fonte = readFileSync("convex/schema.ts", "utf-8");
    expect(literaisDe(fonte, "const leadDocumentType = v.union(")).toEqual(esperados);
  });
});
