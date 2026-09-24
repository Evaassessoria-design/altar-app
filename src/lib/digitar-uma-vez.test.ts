import { describe, expect, it } from "vitest";
import {
  suggestAssemblyItems,
  type ItemJaExistente,
} from "./assembly-suggestions.ts";

// ═════════════════════════════════════════════════════════════════════════════
// DIGITAR UMA VEZ — O TEXTO DO BRIEFING VIRA ITEM, E SÓ UMA VEZ
//
// O briefing tem campos de texto para as mesmas coisas que `assemblyItems`
// representa de verdade. Só o item estruturado alimenta o Caderno, a Folha de
// Carregamento, a Ficha Técnica, o Projeto Visual e as Compras — o texto
// alimenta só o relatório interno.
//
// A ponte existia e cobria móveis. Não cobria FLORES, que é metade do trabalho
// de uma decoradora. E não era idempotente: abrir duas vezes criava a segunda
// "Cadeira Dior", e a Folha de Carregamento passava a pedir 240 cadeiras.
// ═════════════════════════════════════════════════════════════════════════════

const nomes = (b: Parameters<typeof suggestAssemblyItems>[0], ja?: ItemJaExistente[]) =>
  suggestAssemblyItems(b, ja).map((s) => s.name);

describe("flores viram itens, uma por flor", () => {
  it("quebra a lista de tipos em uma linha por flor", () => {
    const r = suggestAssemblyItems({
      flowerTypes: "Rosa branca, eucalipto, oliveira, astromélia",
      flowerSupplier: "Floricultura Florescer",
    });
    expect(r.map((s) => s.name)).toEqual([
      "Rosa branca", "Eucalipto", "Oliveira", "Astromélia",
    ]);
    // O fornecedor vem junto: era o que ela já tinha anotado.
    expect(r.every((s) => s.supplierName === "Floricultura Florescer")).toBe(true);
    expect(r.every((s) => s.area === "flowers")).toBe(true);
  });

  it("aceita ponto-e-vírgula, barra e quebra de linha", () => {
    expect(nomes({ flowerTypes: "Rosa; lisianthus / boca-de-leão\neucalipto" })).toEqual([
      "Rosa", "Lisianthus", "Boca-de-leão", "Eucalipto",
    ]);
  });

  it("NÃO quebra em ' e ' — 'erva de são joão' não são duas flores", () => {
    expect(nomes({ flowerTypes: "erva de são joão e lisianthus" })).toEqual([
      "Erva de são joão e lisianthus",
    ]);
  });

  it("flor NÃO ganha quantidade inventada", () => {
    // O briefing não diz quantas hastes. Um número chutado aqui viraria uma
    // compra errada com aparência de certa.
    const r = suggestAssemblyItems({ flowerTypes: "Rosa branca" });
    expect(r[0].quantity).toBeUndefined();
    expect(r[0].unit).toBeUndefined();
  });

  it("frase inteira no campo não vira item", () => {
    const frase = "o que a cliente quiser desde que seja em tons de branco e verde";
    expect(nomes({ flowerTypes: frase })).toEqual([]);
  });

  it("buquê, lapela e corsage viram peças nomeadas", () => {
    const r = suggestAssemblyItems({
      bouquetStyle: "Cascata com rosas e folhagem",
      boutonniere: "Mini rosa branca",
      corsage: "Pulseira de lisianthus",
    });
    expect(r.map((s) => s.name)).toEqual(["Buquê", "Lapela", "Corsage"]);
    // "Buquê", não "Buquê da noiva": nem todo evento tem noiva — um 15 anos
    // tem a debutante.
    expect(r.map((s) => s.name).join(" ")).not.toMatch(/noiv/i);
    expect(r[0].model).toBe("Cascata com rosas e folhagem");
  });

  it("campo vazio não vira nada", () => {
    expect(nomes({ flowerTypes: "   ", bouquetStyle: "" })).toEqual([]);
  });
});

describe("móveis continuam funcionando como antes", () => {
  it("tipo + quantidade viram um item com número", () => {
    const r = suggestAssemblyItems({
      guestChairType: "Cadeira Dior",
      guestChairCount: "120",
      furnitureSupplier: "Móveis Bella",
    });
    expect(r[0]).toMatchObject({
      area: "furniture", name: "Cadeira Dior", quantity: 120,
      unit: "un", supplierName: "Móveis Bella",
    });
  });
});

describe("abrir duas vezes não duplica nada", () => {
  const briefing = {
    guestChairType: "Cadeira Dior",
    guestChairCount: "120",
    flowerTypes: "Rosa branca, eucalipto",
  };

  it("o que já existe não é reoferecido", () => {
    const ja: ItemJaExistente[] = [
      { area: "furniture", name: "Cadeira Dior" },
      { area: "flowers", name: "Rosa branca" },
    ];
    expect(nomes(briefing, ja)).toEqual(["Eucalipto"]);
  });

  it("a comparação ignora acento, caixa e espaço sobrando", () => {
    // Ela digitou "eucalipto" no briefing e criou "Eucalípto  " na lista. É a
    // mesma planta, e oferecer de novo faria o Caderno pedir duas.
    expect(nomes({ flowerTypes: "eucalipto" }, [{ area: "flowers", name: "  Eucalípto " }]))
      .toEqual([]);
  });

  it("mesmo nome em ÁREA diferente continua sendo outro item", () => {
    // "Vela" na mesa do bolo e "Vela" na cerimônia são dois itens de verdade.
    expect(nomes({ flowerTypes: "Vela" }, [{ area: "ceremony", name: "Vela" }]))
      .toEqual(["Vela"]);
  });

  it("duas sugestões idênticas na MESMA rodada viram uma", () => {
    // "Tipo das Mesas: Lounge" e `loungeIncluded: Sim` produziriam duas linhas
    // "Lounge" na mesma revisão.
    const r = nomes({ guestTableType: "Lounge", loungeIncluded: "Sim" });
    expect(r.filter((n) => n === "Lounge")).toHaveLength(1);
  });

  it("evento com tudo já criado não recebe sugestão nenhuma", () => {
    const todas = suggestAssemblyItems(briefing);
    expect(nomes(briefing, todas)).toEqual([]);
  });

  it("sem a lista do evento, o comportamento é o de antes", () => {
    expect(nomes(briefing).length).toBeGreaterThan(0);
  });
});

describe("compatibilidade", () => {
  it("briefing ausente não quebra", () => {
    expect(suggestAssemblyItems(null)).toEqual([]);
    expect(suggestAssemblyItems(undefined, [])).toEqual([]);
  });

  it("briefing só com campos antigos de texto ainda produz a ponte", () => {
    // É o estado de todo evento anterior a esta rodada: nada foi migrado, e o
    // convite continua disponível quando ela quiser.
    expect(nomes({ guestTableType: "Redonda 1,80m", guestTableCount: "18" }))
      .toEqual(["Redonda 1,80m"]);
  });
});
