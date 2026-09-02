import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  montarFolhaDeCarregamento,
  quantidadeTexto,
  resumoDoRetorno,
  type ItemDeCarregamento,
} from "./loading-sheet";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — a Folha de Carregamento é LOGÍSTICA, não projeto.
//
// Quem segura esta folha está no galpão conferindo caixa. O Caderno de
// Montagem responde "como se monta"; esta responde "o que entra no caminhão e
// o que voltou". Misturar os dois produz um papel que não serve bem para
// nenhum dos dois momentos.
// ─────────────────────────────────────────────────────────────────────────────

const PDF = readFileSync("src/lib/generate-loading-pdf.ts", "utf-8");

function item(over: Partial<ItemDeCarregamento> = {}): ItemDeCarregamento {
  return { _id: "i1", area: "ceremony", name: "Arco de oliveiras", ...over };
}

describe("agrupamento por ambiente", () => {
  it("agrupa os itens pelas áreas do evento", () => {
    const folha = montarFolhaDeCarregamento([
      item({ _id: "a", area: "ceremony", name: "Arco" }),
      item({ _id: "b", area: "flowers", name: "Arranjos" }),
      item({ _id: "c", area: "ceremony", name: "Cadeiras" }),
    ]);
    expect(folha.ambientes).toHaveLength(2);
    const cerimonia = folha.ambientes.find((a) => a.key === "ceremony");
    expect(cerimonia?.itens.map((i) => i.name)).toEqual(["Arco", "Cadeiras"]);
  });

  it("usa a MESMA ordenação do Projeto de Decoração", () => {
    // Se cada tela ordenasse do seu jeito, o mesmo evento apareceria com os
    // ambientes fora de ordem entre uma e outra.
    const fonte = readFileSync("src/lib/loading-sheet.ts", "utf-8");
    expect(fonte).toContain("agruparPorAmbiente");
    expect(fonte).toContain('from "./decoration-project.ts"');
  });

  it("ambiente personalizado aparece com o nome digitado", () => {
    const folha = montarFolhaDeCarregamento([item({ area: "Ilha gastronômica" })]);
    expect(folha.ambientes[0].label).toBe("Ilha gastronômica");
  });

  it("item SEM ambiente detalhado não some da folha", () => {
    // A folha existe para carregar o caminhão, não para cobrar cadastro.
    const folha = montarFolhaDeCarregamento([item({ ambiente: undefined })]);
    expect(folha.total).toBe(1);
    expect(folha.ambientes[0].itens).toHaveLength(1);
  });
});

describe("situação e o que não voltou", () => {
  it("item sem status é pendente — registro antigo continua correto", () => {
    const folha = montarFolhaDeCarregamento([item({ operationalStatus: undefined })]);
    expect(folha.ambientes[0].itens[0].situacao).toBe("pendente");
    expect(folha.pendentes).toBe(1);
  });

  it.each([
    ["carregado", true],
    ["conferido", true],
    ["retornou", false],
    ["separado", false],
    ["pendente", false],
  ])("%s → saiu e não voltou? %s", (status, esperado) => {
    const folha = montarFolhaDeCarregamento([item({ operationalStatus: status })]);
    expect(folha.ambientes[0].itens[0].emAberto).toBe(esperado);
  });

  it("conta quantos ficaram em aberto", () => {
    const folha = montarFolhaDeCarregamento([
      item({ _id: "a", operationalStatus: "carregado" }),
      item({ _id: "b", operationalStatus: "conferido" }),
      item({ _id: "c", operationalStatus: "retornou" }),
    ]);
    expect(folha.naoVoltaram).toBe(2);
    expect(resumoDoRetorno(folha)).toBe("2 itens saíram e ainda não voltaram");
  });

  it("nada em aberto devolve null — silêncio é a boa notícia", () => {
    const folha = montarFolhaDeCarregamento([item({ operationalStatus: "retornou" })]);
    expect(resumoDoRetorno(folha)).toBeNull();
  });

  it("singular e plural corretos", () => {
    const uma = montarFolhaDeCarregamento([item({ operationalStatus: "carregado" })]);
    expect(resumoDoRetorno(uma)).toBe("1 item saiu e ainda não voltou");
  });
});

describe("quantidade legível", () => {
  it.each([
    [{ quantity: 120, unit: "un" }, "120 un"],
    [{ quantity: 1, unit: undefined }, "1"],
    [{ quantity: 8, unit: "  " }, "8"],
    [{ quantity: undefined }, "—"],
    [{ quantity: 0, unit: "un" }, "0 un"],
  ])("%o vira %s", (campos, esperado) => {
    expect(quantidadeTexto(item(campos))).toBe(esperado);
  });
});

describe("o PDF é de logística — regra dura", () => {
  it("NÃO imprime valor nenhum", () => {
    // Folha de carga com preço na mão de quem carrega é vazamento comercial.
    for (const proibido of ["unitPrice", "budget", "valor", "R$", "toLocaleString", "currency"]) {
      expect(PDF, `PDF cita ${proibido}`).not.toContain(proibido);
    }
  });

  it("não vira Caderno de Montagem", () => {
    // Sem foto, sem referência estética: outro documento, outro momento.
    for (const proibido of ["referencePhoto", "contractedPhoto", "addImage", "REFERÊNCIA"]) {
      expect(PDF, `PDF cita ${proibido}`).not.toContain(proibido);
    }
  });

  it("tem as duas colunas que justificam o papel", () => {
    expect(PDF).toContain('doc.text("SAIU"');
    expect(PDF).toContain('doc.text("VOLTOU"');
    // Caixas de marcar, para caneta.
    expect(PDF).toContain("doc.rect(X_SAIU");
    expect(PDF).toContain("doc.rect(X_VOLTOU");
  });

  it("reaproveita a identidade da empresa, não inventa outra", () => {
    expect(PDF).toContain("resolveIdentidade");
    expect(PDF).toContain("ASSINATURA_ALTAR");
    expect(PDF).toContain("identidade.textoSobreCor");
  });

  it("usa a convenção de data do projeto", () => {
    expect(PDF).toContain("formatEventDayOnly");
    expect(PDF).not.toMatch(/new Date\(\s*\w+\.date\b/);
  });

  it("avisa o que ficou em aberto antes de encerrar", () => {
    expect(PDF).toContain("resumoDoRetorno");
    expect(PDF).toContain("antes de encerrar o evento");
  });

  it("lista vazia não quebra o documento", () => {
    expect(PDF).toContain("Nenhum item cadastrado para carregar.");
  });
});
