import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  consolidarMateriais,
  necessidadeDoComponente,
  type ComposicaoNoEvento,
} from "@/convex/lib/fichaTecnica.ts";
import { ehObrigacaoDeMontagem } from "@/convex/lib/escopoDoProjeto.ts";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — PDF DA FICHA TÉCNICA
//
// jsPDF desenha num canvas; não dá para assertar pixels em teste unitário.
// O que dá — e é o que importa — é travar as REGRAS que o documento tem de
// respeitar, e que são as mesmas do resto do sistema:
//
//   · sai do SNAPSHOT do evento, nunca da biblioteca central;
//   · só obrigações reais (referência visual não vai para o florista);
//   · NENHUM valor financeiro;
//   · não refaz nenhuma conta por conta própria.
// ─────────────────────────────────────────────────────────────────────────────

const FONTE = readFileSync("src/lib/generate-ficha-tecnica-pdf.ts", "utf-8");

/**
 * A fonte SEM as linhas de comentário.
 *
 * O cabeçalho do arquivo explica justamente o que o PDF não faz ("nada de
 * comprado, pago ou cobertura") — e um guarda que lê a prosa acusaria o
 * comentário como se fosse código. Já aconteceu neste projeto antes.
 */
const CODIGO = FONTE.split("\n")
  .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
  .join("\n");

const mesas: ComposicaoNoEvento = {
  _id: "c1", nome: "Arranjo baixo", area: "tables", ambiente: "Mesa dos convidados", quantidade: 20,
  receita: [
    { materialId: "m-rosa", nome: "Rosa branca", unidade: "haste", quantidade: 5, categoria: "Flores", margemPercentual: 10 },
    { materialId: "m-euc", nome: "Eucalipto", unidade: "haste", quantidade: 2, categoria: "Folhagens" },
  ],
};
const cerimonia: ComposicaoNoEvento = {
  _id: "c2", nome: "Arranjo lateral", area: "ceremony", quantidade: 10,
  receita: [{ materialId: "m-rosa", nome: "Rosa branca", unidade: "haste", quantidade: 5, categoria: "Flores", margemPercentual: 10 }],
};
const referencia: ComposicaoNoEvento = {
  _id: "c3", nome: "Inspiração", area: "lounge", quantidade: 500, projectScope: "referencia",
  receita: [{ materialId: "m-rosa", nome: "Rosa branca", unidade: "haste", quantidade: 99 }],
};
const naoIncluso: ComposicaoNoEvento = {
  _id: "c4", nome: "Fora do contrato", area: "bar", quantidade: 50, projectScope: "nao_incluso",
  receita: [{ materialId: "m-vela", nome: "Vela", unidade: "un", quantidade: 4 }],
};

const consolidar = (c: ComposicaoNoEvento[]) => consolidarMateriais(c, ehObrigacaoDeMontagem);

describe("o PDF respeita o PROJECT SCOPE", () => {
  it("usa a MESMA regra central, não uma comparação própria", () => {
    expect(FONTE).toContain("ehObrigacaoDeMontagem");
    expect(FONTE).not.toMatch(/projectScope\s*===/);
  });

  it("referência visual com receita enorme não entra no consolidado impresso", () => {
    const linhas = consolidar([mesas, cerimonia, referencia]);
    expect(linhas.find((l) => l.nome === "Rosa branca")!.necessario).toBe(150);
  });

  it("'não incluso' não vira material para o florista separar", () => {
    const linhas = consolidar([mesas, naoIncluso]);
    expect(linhas.some((l) => l.nome === "Vela")).toBe(false);
  });

  it("o filtro por ambiente também exclui referência", () => {
    // A seção "por ambiente" e o consolidado não podem discordar.
    const executaveis = [mesas, cerimonia, referencia, naoIncluso].filter(
      (c) => ehObrigacaoDeMontagem(c) && (c.receita?.length ?? 0) > 0,
    );
    expect(executaveis.map((c) => c._id)).toEqual(["c1", "c2"]);
  });
});

describe("o PDF sai do SNAPSHOT do evento", () => {
  it("recebe as composições do evento — nunca consulta a biblioteca", () => {
    expect(FONTE).toContain("composicoes: ComposicaoNoEvento[]");
    expect(FONTE).not.toContain("compositions");
    expect(FONTE).not.toContain("api.compositions");
  });

  it("um evento antigo imprime a receita que foi executada", () => {
    // A receita vive no objeto recebido; mudar a biblioteca não a alcança.
    const antigo = consolidar([{ ...mesas, receita: [{ nome: "Rosa branca", unidade: "haste", quantidade: 5 }] }]);
    const novo = consolidar([{ ...mesas, receita: [{ nome: "Rosa branca", unidade: "haste", quantidade: 7 }] }]);
    expect(antigo[0].necessario).toBe(100);
    expect(novo[0].necessario).toBe(140);
  });
});

describe("o PDF NÃO expõe valores financeiros", () => {
  it("não imprime custo, preço nem total em dinheiro", () => {
    // Ficha técnica com preço na mão de um fornecedor é vazamento comercial.
    for (const proibido of ["custoEstimado", "unitPrice", "currency", "BRL", "toLocaleString"]) {
      expect(CODIGO, `o PDF imprime ${proibido}`).not.toContain(proibido);
    }
  });

  it("não imprime cobertura, comprado nem pagamento", () => {
    // Isso é conversa de compras, não instrução de produção.
    for (const proibido of ["cobertura", "comprado", "isPaid", "faltam"]) {
      expect(CODIGO, `o PDF imprime ${proibido}`).not.toContain(proibido);
    }
  });
});

describe("o PDF não refaz nenhuma conta", () => {
  it("multiplicação e consolidação vêm do módulo central", () => {
    expect(FONTE).toContain("necessidadeDoComponente");
    expect(FONTE).toContain("consolidarMateriais");
    expect(FONTE).not.toMatch(/quantidade\s*\*|quantity\s*\*/);
    expect(FONTE).not.toMatch(/\.reduce\(/);
  });

  it("o total por linha do PDF bate com o consolidado", () => {
    // 20 arranjos × 5 rosas = 100 na seção do ambiente; 150 no consolidado
    // (com a cerimônia). Os dois vêm do mesmo helper.
    expect(necessidadeDoComponente(mesas, mesas.receita![0])).toBe(100);
    expect(consolidar([mesas, cerimonia]).find((l) => l.nome === "Rosa branca")!.necessario).toBe(150);
  });
});

describe("margem e classificação no PDF", () => {
  it("imprime necessário e sugerido como coisas diferentes", () => {
    const linha = consolidar([mesas, cerimonia]).find((l) => l.nome === "Rosa branca")!;
    expect(linha.necessario).toBe(150);
    expect(linha.sugerido).toBe(165);
    expect(linha.sugeridoOperacional).toBe(165);
    expect(FONTE).toContain("linha.necessario");
    expect(FONTE).toContain("linha.sugeridoOperacional");
  });

  it("material sem margem não ganha linha de margem", () => {
    const euc = consolidar([mesas]).find((l) => l.nome === "Eucalipto")!;
    expect(euc.margemPercentual).toBeNull();
    expect(FONTE).toContain("linha.margemPercentual !== null && linha.margemPercentual > 0");
  });

  it("classificação divergente aparece — a equipe não recebe instrução falsa", () => {
    expect(FONTE).toContain("linha.tipoAmbiguo");
    expect(FONTE).toContain("classificação a revisar");
  });

  it("agrupa o consolidado por categoria do snapshot", () => {
    const linhas = consolidar([mesas, cerimonia]);
    expect(linhas.find((l) => l.nome === "Rosa branca")!.categoria).toBe("Flores");
    expect(linhas.find((l) => l.nome === "Eucalipto")!.categoria).toBe("Folhagens");
  });
});

describe("layout e infraestrutura", () => {
  it("reutiliza a stack de PDF do projeto — não cria uma segunda", () => {
    expect(FONTE).toContain('from "jspdf"');
    expect(FONTE).toContain("resolveIdentidade");
    expect(FONTE).toContain("ASSINATURA_ALTAR");
  });

  it("evita quebrar uma composição no meio quando dá", () => {
    expect(FONTE).toContain("garantirEspaco(18 + linhas.length * 9)");
  });

  it("numera as páginas", () => {
    expect(FONTE).toContain("getNumberOfPages");
  });

  it("evento sem ficha nenhuma gera um PDF que diz isso, em vez de quebrar", () => {
    expect(FONTE).toContain("Nenhuma composição com ficha técnica cadastrada.");
    expect(consolidar([])).toEqual([]);
  });
});
