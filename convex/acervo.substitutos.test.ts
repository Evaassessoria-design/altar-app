import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agruparAcervoPorMaterial, substitutosCompativeis } from "./lib/acervo";

// ─────────────────────────────────────────────────────────────────────────────
// SUBSTITUIÇÃO EXPLÍCITA — vários itens de acervo para um material técnico
//
// "Preciso de 30 castiçais dourados, e posso atender com Roma, Viena ou Alto."
//
// O modelo para isso JÁ EXISTIA: `collectionItems.materialId` sempre permitiu
// que vários itens apontassem para o mesmo material, e o vínculo sempre foi
// explícito — ninguém nunca juntou peça por nome parecido.
//
// O que não existia era o CÓDIGO respeitar isso: o agrupamento era um
// `new Map(itens.map(i => [i.materialId, i]))`, e num Map o último par com a
// mesma chave sobrescreve os anteriores. Dois castiçais vinculados ao mesmo
// material e um deles sumia — sem erro, sem aviso, sem log.
// ─────────────────────────────────────────────────────────────────────────────

const item = (nome: string, materialId: string, unidade: string, total: number) =>
  ({ _id: nome, nome, materialId, unidade, quantidadeTotal: total, archived: false });

describe("o bug do Map — dois itens, um sobrevivia", () => {
  it("a forma antiga perdia um item em silêncio", () => {
    const itens = [item("Roma", "m-castical", "un", 20), item("Viena", "m-castical", "un", 15)];
    // Exatamente o que o código fazia antes.
    const antigo = new Map(itens.map((i) => [i.materialId, i]));
    expect(antigo.size).toBe(1);
    expect(antigo.get("m-castical")!.nome).toBe("Viena"); // Roma evaporou
  });

  it("agora os dois sobrevivem", () => {
    const itens = [item("Roma", "m-castical", "un", 20), item("Viena", "m-castical", "un", 15)];
    const grupos = agruparAcervoPorMaterial(itens);
    expect(grupos.get("m-castical")!.map((i) => i.nome)).toEqual(["Roma", "Viena"]);
  });

  it("item arquivado fica de fora", () => {
    const grupos = agruparAcervoPorMaterial([
      item("Roma", "m-castical", "un", 20),
      { ...item("Viena", "m-castical", "un", 15), archived: true },
    ]);
    expect(grupos.get("m-castical")).toHaveLength(1);
  });

  it("item sem material vinculado não entra — vínculo é sempre explícito", () => {
    const grupos = agruparAcervoPorMaterial([
      { ...item("Solto", "", "un", 9), materialId: undefined },
    ]);
    expect(grupos.size).toBe(0);
  });

  it("a ordem é estável — mesma entrada, mesmo resultado", () => {
    const itens = [item("Roma", "m", "un", 20), item("Viena", "m", "un", 15), item("Alto", "m", "un", 5)];
    expect(agruparAcervoPorMaterial(itens).get("m")!.map((i) => i.nome)).toEqual(
      agruparAcervoPorMaterial(itens).get("m")!.map((i) => i.nome),
    );
  });
});

describe("unidade nunca é convertida", () => {
  it("só soma o que tem a MESMA unidade", () => {
    const r = substitutosCompativeis(
      [item("Roma", "m", "un", 20), item("Fita", "m", "m", 15)],
      "un",
    );
    expect(r.compativeis.map((i) => i.nome)).toEqual(["Roma"]);
    expect(r.incompativeis.map((i) => i.nome)).toEqual(["Fita"]);
  });

  it("nada de converter metro em unidade — 15 m não vira 15 peças", () => {
    const r = substitutosCompativeis([item("Fita", "m", "m", 15)], "un");
    expect(r.compativeis).toEqual([]);
    // O incompatível não some: a tela precisa poder dizer POR QUE ficou fora.
    expect(r.incompativeis).toHaveLength(1);
  });

  it("três castiçais da mesma unidade somam o estoque físico", () => {
    const r = substitutosCompativeis(
      [item("Roma", "m", "un", 20), item("Viena", "m", "un", 15), item("Alto", "m", "un", 5)],
      "un",
    );
    expect(r.compativeis).toHaveLength(3);
    expect(r.totalFisico).toBe(40);
  });

  it("sem substituto compatível, o total é zero — não é 'não sei'", () => {
    expect(substitutosCompativeis([], "un").totalFisico).toBe(0);
  });
});

describe("a fonte usa o agrupamento novo", () => {
  const FONTE = readFileSync("convex/acervo.ts", "utf-8");
  const CODIGO = FONTE.split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  it("não existe mais Map que sobrescreve item por material", () => {
    expect(CODIGO).not.toMatch(/new Map\(\s*\n?\s*acervo/);
    expect(CODIGO).toContain("agruparAcervoPorMaterial");
  });
});
