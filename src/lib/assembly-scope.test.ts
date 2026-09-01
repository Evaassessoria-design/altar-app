import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ehObrigacaoDeMontagem } from "./decoration-project";

// ─────────────────────────────────────────────────────────────────────────────
// REQUISITO CRÍTICO: referência visual não é obrigação de montagem.
//
// `ehObrigacaoDeMontagem` existia, estava testada, e NENHUM código de produção
// a usava. O Caderno de Montagem não filtrava por escopo: um item marcado
// "Não incluso" continuava indo para o galpão como se devesse ser montado.
// ─────────────────────────────────────────────────────────────────────────────

const PDF = readFileSync("src/lib/generate-assembly-pdf.ts", "utf-8");

describe("A) somente referência", () => {
  it("item classificado como referência NÃO é obrigação", () => {
    expect(ehObrigacaoDeMontagem({ projectScope: "referencia" })).toBe(false);
  });

  it("foto que é só referência vai rotulada REFERÊNCIA VISUAL", () => {
    expect(PDF).toContain("const thumbEhReferencia = !contratada && !!referencia;");
    expect(PDF).toContain('"REFERÊNCIA VISUAL"');
  });
});

describe("B) somente contratado", () => {
  it("item incluso é obrigação de montagem", () => {
    expect(ehObrigacaoDeMontagem({ projectScope: "incluso" })).toBe(true);
  });

  it("a foto contratada é rotulada CONTRATADO", () => {
    expect(PDF).toContain('"CONTRATADO"');
  });
});

describe("C) referência + contratado", () => {
  it("o CONTRATADO tem precedência operacional", () => {
    expect(PDF).toContain("const thumbUrl = contratada ?? referencia;");
    expect(PDF).not.toContain("item.referencePhotoUrl ?? item.contractedPhotoUrl");
  });
});

describe("D) não incluso NUNCA vira obrigação de montagem", () => {
  it("a regra diz que não é obrigação", () => {
    expect(ehObrigacaoDeMontagem({ projectScope: "nao_incluso" })).toBe(false);
  });

  it("e o Caderno APLICA a regra — não só a declara", () => {
    // O bug era exatamente este: a regra existia e o documento a ignorava.
    expect(PDF).toContain("import { ehObrigacaoDeMontagem }");
    expect(PDF).toContain("const reportItems = visiveis.filter(ehObrigacaoDeMontagem);");
  });

  it("o filtro roda DEPOIS da visibilidade, sobre a mesma lista", () => {
    const i = PDF.indexOf("const visiveis = items.filter(");
    const j = PDF.indexOf("const reportItems = visiveis.filter(ehObrigacaoDeMontagem);");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it("o caderno AVISA quando algo ficou de fora, em vez de sumir em silêncio", () => {
    expect(PDF).toContain("if (foraDoEscopo > 0)");
    expect(PDF).toContain("não entra na montagem por ser referência visual");
  });
});

describe("E) item antigo sem classificação", () => {
  it("continua entrando na montagem — nenhum status é inventado", () => {
    // Se a ausência excluísse, todo item já cadastrado sumiria da ficha.
    expect(ehObrigacaoDeMontagem({})).toBe(true);
    expect(ehObrigacaoDeMontagem({ projectScope: undefined })).toBe(true);
  });

  it("valor desconhecido também não exclui o item", () => {
    expect(ehObrigacaoDeMontagem({ projectScope: "sei_la" })).toBe(true);
  });
});

describe("o helper tem consumidor de verdade", () => {
  it("é usado em código de produção, não só em teste", () => {
    // Antipadrão que esta auditoria encontrou: regra escrita e nunca aplicada.
    const usos = [
      "src/lib/generate-assembly-pdf.ts",
      "src/lib/decoration-project.ts",
    ].filter((f) => readFileSync(f, "utf-8").includes("ehObrigacaoDeMontagem"));
    expect(usos).toContain("src/lib/generate-assembly-pdf.ts");
  });
});
