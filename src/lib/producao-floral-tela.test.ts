import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVAS DE CÓDIGO DA PRODUÇÃO FLORAL (tela)
//
// Cada uma protege um defeito achado na revisão de 11/10:
//  · a foto da flor era achada pelo NOME — "Rosa" em haste e "Rosa" em maço
//    abriam o material errado;
//  · o diálogo floral gravava pela `setReceita`, que recopia custo, margem e
//    unidade do catálogo;
//  · marcar "só orientação" gravava quantidade 0;
//  · o diálogo da Ficha Técnica remontava a linha sem a parte floral, e
//    salvar lá apagava cor, origem, distribuição e orientação.
// ─────────────────────────────────────────────────────────────────────────────

const pagina = readFileSync("src/pages/app/events/[id]/producao-floral/page.tsx", "utf-8");
const dialogo = readFileSync(
  "src/pages/app/events/[id]/producao-floral/_components/linhas-florais-dialog.tsx",
  "utf-8",
);
const receitaDaFicha = readFileSync(
  "src/pages/app/events/[id]/ficha-tecnica/_components/receita-dialog.tsx",
  "utf-8",
);

describe("foto da flor pelo ID do material", () => {
  it("a tela procura o material pelo _id, nunca pelo nome", () => {
    expect(pagina).toContain("materiais?.find((m) => m._id === flor.materialId)");
    expect(pagina).not.toMatch(/m\.nome\.trim\(\)\.toLowerCase\(\) === flor\.nome/);
    expect(pagina).toContain("key={flor.chave}");
  });
});

describe("o diálogo floral grava só a parte floral", () => {
  it("usa setLinhasFlorais, não setReceita", () => {
    expect(dialogo).toContain("api.producaoFloral.setLinhasFlorais");
    expect(dialogo).not.toContain("api.fichaTecnica.setReceita");
  });

  it("a quantidade só vai quando mudou, e 'só orientação' não manda zero", () => {
    expect(dialogo).toContain("if (lido !== linha.quantidadeOriginal) quantidade = lido;");
    expect(dialogo).toContain("if (!linha.apenasOrientacao) {");
    expect(dialogo).not.toMatch(/apenasOrientacao \? 0/);
  });

  it("tem o campo explícito de orientação para o florista", () => {
    expect(dialogo).toContain("Orientações para o florista");
    expect(dialogo).toContain("orientacaoFlorista: linha.orientacaoFlorista.trim() || undefined");
  });
});

describe("salvar na Ficha Técnica não apaga a parte floral", () => {
  it("a linha carrega o resto e devolve ao salvar", () => {
    expect(receitaDaFicha).toContain("resto: {");
    expect(receitaDaFicha).toMatch(/resolvidas\.push\(\{\s*\.\.\.l\.resto,/);
    for (const campo of ["cor", "origem", "distribuicao", "apenasOrientacao", "orientacaoFlorista", "notes"]) {
      expect(receitaDaFicha).toContain(`${campo}: c.${campo}`);
    }
  });
});
