import { describe, expect, it } from "vitest";
import { consolidarMateriais, type ComposicaoNoEvento } from "./fichaTecnica";
import { detalheDaVariacao } from "./producaoFloral";

// ═════════════════════════════════════════════════════════════════════════════
// A MESMA FLOR, EM CORES DIFERENTES — o que a lista de compras precisa dizer
//
// A decoradora pede rosa branca natural no altar e rosa rosê permanente nas
// mesas. A ficha do florista (`resumoDeMateriais`) sempre soube separar: ela
// agrupa por variedade, cor e origem. Quem COMPRA lê a lista consolidada da
// Ficha Técnica, e nela as duas viravam "100 hastes de rosa" — número certo
// para a compra, insuficiente para a banca.
//
// A correção é DERIVADA: a chave de consolidação não mudou (mudá-la
// reclassificaria a cobertura e as compras de todo evento já cadastrado), e a
// linha passou a carregar as fatias.
//
// O que estes testes protegem:
//
//  · a soma das fatias é o `necessario` da linha — nunca o sugerido, porque
//    margem é da linha inteira e não se reparte por cor;
//  · receita que não informou cor nem origem não ganha fatia inventada;
//  · a mesma cor escrita de dois jeitos é UMA cor;
//  · natural e permanente da mesma cor são fatias diferentes;
//  · unidade diferente continua sendo linha diferente, e as fatias não cruzam.
// ═════════════════════════════════════════════════════════════════════════════

const ehObrigacao = (i: { projectScope?: string }) =>
  i.projectScope !== "referencia" && i.projectScope !== "nao_incluso";

const comp = (
  id: string,
  nome: string,
  quantidade: number,
  receita: ComposicaoNoEvento["receita"],
): ComposicaoNoEvento => ({ _id: id, nome, area: "tables", quantidade, receita });

const linha = (linhas: ReturnType<typeof consolidarMateriais>, nome: string) =>
  linhas.find((l) => l.nome === nome)!;

describe("fatias de cor × origem na linha consolidada", () => {
  it("separa as cores e a soma das fatias é o necessário da linha", () => {
    const linhas = consolidarMateriais(
      [
        comp("c1", "Altar", 1, [
          { materialId: "m-rosa", nome: "Rosa", unidade: "haste", quantidade: 40, cor: "Branca", origem: "natural" },
        ]),
        comp("c2", "Mesas", 20, [
          { materialId: "m-rosa", nome: "Rosa", unidade: "haste", quantidade: 3, cor: "Rosê", origem: "permanente" },
        ]),
      ],
      ehObrigacao,
    );

    const rosa = linha(linhas, "Rosa");
    expect(rosa.necessario).toBe(100);
    expect(rosa.variacoes).toHaveLength(2);
    expect(rosa.variacoes.map((v) => [v.cor, v.origem, v.necessario])).toEqual([
      ["Branca", "natural", 40],
      ["Rosê", "permanente", 60],
    ]);
    expect(rosa.variacoes.reduce((s, v) => s + v.necessario, 0)).toBe(rosa.necessario);
  });

  it("a margem NÃO é repartida entre as cores", () => {
    const linhas = consolidarMateriais(
      [
        comp("c1", "Altar", 1, [
          {
            materialId: "m-rosa", nome: "Rosa", unidade: "haste", quantidade: 40,
            cor: "Branca", margemPercentual: 10,
          },
        ]),
        comp("c2", "Mesas", 1, [
          {
            materialId: "m-rosa", nome: "Rosa", unidade: "haste", quantidade: 60,
            cor: "Rosê", margemPercentual: 10,
          },
        ]),
      ],
      ehObrigacao,
    );

    const rosa = linha(linhas, "Rosa");
    // 110 hastes a providenciar, e as fatias continuam somando 100: repartir a
    // margem daria 44 + 66 e um arredondamento inventado em cada banca.
    expect(rosa.sugerido).toBe(110);
    expect(rosa.variacoes.reduce((s, v) => s + v.necessario, 0)).toBe(100);
  });

  it("receita sem cor e sem origem não ganha fatia", () => {
    const linhas = consolidarMateriais(
      [
        comp("c1", "Altar", 1, [
          { materialId: "m-fita", nome: "Fita de cetim", unidade: "m", quantidade: 12 },
        ]),
        comp("c2", "Mesas", 2, [
          { materialId: "m-fita", nome: "Fita de cetim", unidade: "m", quantidade: 4 },
        ]),
      ],
      ehObrigacao,
    );

    expect(linha(linhas, "Fita de cetim").necessario).toBe(20);
    expect(linha(linhas, "Fita de cetim").variacoes).toEqual([]);
  });

  it("uma cor só informada vira fatia — a tela precisa poder dizer QUAL", () => {
    const linhas = consolidarMateriais(
      [
        comp("c1", "Altar", 1, [
          { materialId: "m-rosa", nome: "Rosa", unidade: "haste", quantidade: 30, cor: "Rosê" },
        ]),
      ],
      ehObrigacao,
    );
    expect(linha(linhas, "Rosa").variacoes).toEqual([
      { cor: "Rosê", origem: null, necessario: 30 },
    ]);
  });

  it("a mesma cor escrita de dois jeitos é uma cor só", () => {
    const linhas = consolidarMateriais(
      [
        comp("c1", "Altar", 1, [
          { materialId: "m-rosa", nome: "Rosa", unidade: "haste", quantidade: 10, cor: "Branca" },
        ]),
        comp("c2", "Mesas", 1, [
          { materialId: "m-rosa", nome: "Rosa", unidade: "haste", quantidade: 5, cor: " branca " },
        ]),
      ],
      ehObrigacao,
    );
    const rosa = linha(linhas, "Rosa");
    expect(rosa.variacoes).toHaveLength(1);
    expect(rosa.variacoes[0].necessario).toBe(15);
    // O rótulo é o que ela escreveu PRIMEIRO; a normalização serve só para
    // descobrir que são a mesma coisa.
    expect(rosa.variacoes[0].cor).toBe("Branca");
  });

  it("natural e permanente da mesma cor são fatias diferentes", () => {
    const linhas = consolidarMateriais(
      [
        comp("c1", "Altar", 1, [
          { materialId: "m-rosa", nome: "Rosa", unidade: "haste", quantidade: 10, cor: "Branca", origem: "natural" },
        ]),
        comp("c2", "Mesas", 1, [
          { materialId: "m-rosa", nome: "Rosa", unidade: "haste", quantidade: 6, cor: "Branca", origem: "permanente" },
        ]),
      ],
      ehObrigacao,
    );
    const rosa = linha(linhas, "Rosa");
    expect(rosa.variacoes.map((v) => v.origem)).toEqual(["natural", "permanente"]);
    expect(rosa.variacoes.map((v) => v.necessario)).toEqual([10, 6]);
  });

  it("unidade diferente é linha diferente, e as fatias não cruzam", () => {
    const linhas = consolidarMateriais(
      [
        comp("c1", "Altar", 1, [
          { nome: "Eucalipto", unidade: "haste", quantidade: 20, cor: "Verde" },
        ]),
        comp("c2", "Mesas", 1, [
          { nome: "Eucalipto", unidade: "maço", quantidade: 2, cor: "Verde" },
        ]),
      ],
      ehObrigacao,
    );
    expect(linhas.filter((l) => l.nome === "Eucalipto")).toHaveLength(2);
    for (const l of linhas) {
      expect(l.variacoes).toHaveLength(1);
      expect(l.variacoes[0].necessario).toBe(l.necessario);
    }
  });

  it("orientação pura não entra em fatia nenhuma", () => {
    const linhas = consolidarMateriais(
      [
        comp("c1", "Altar", 1, [
          {
            nome: "Folhagem a gosto", unidade: "haste", quantidade: 0,
            cor: "Verde", apenasOrientacao: true,
          },
          { nome: "Rosa", unidade: "haste", quantidade: 10, cor: "Branca" },
        ]),
      ],
      ehObrigacao,
    );
    expect(linhas.some((l) => l.nome === "Folhagem a gosto")).toBe(false);
    expect(linha(linhas, "Rosa").variacoes).toHaveLength(1);
  });
});

describe("detalheDaVariacao — o texto que vai para a tela e para o papel", () => {
  it("junta cor e origem, e devolve null quando não há nada a dizer", () => {
    expect(detalheDaVariacao({ cor: "Branca", origem: "natural" })).toBe("Branca · Natural");
    expect(detalheDaVariacao({ cor: "Rosê", origem: null })).toBe("Rosê");
    expect(detalheDaVariacao({ cor: null, origem: "permanente" })).toBe("Permanente");
    expect(detalheDaVariacao({ cor: null, origem: null })).toBeNull();
    // Cor em branco é ausência, não cor.
    expect(detalheDaVariacao({ cor: "   ", origem: null })).toBeNull();
  });
});
