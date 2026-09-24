import { describe, expect, it } from "vitest";
import {
  fotoDoItem,
  fotosPresasAItens,
  agruparPorAmbiente,
  type ItemDoProjeto,
} from "./decoration-project.ts";
import { montarProjetoVisual, type FotoDoProjeto } from "./projeto-visual.ts";
import type { FotoResolvida } from "@/convex/lib/fotoDoItem.ts";

// ═════════════════════════════════════════════════════════════════════════════
// UMA IMAGEM, UM LUGAR
//
// O item passou a APONTAR para a foto da Galeria em vez de guardar cópia
// própria. Isso resolve a duplicação no storage e cria uma nova, de TELA: a
// mesma imagem podia aparecer duas vezes no mesmo bloco do Projeto Visual —
// no cartão da "Cadeira Dior" e na prateleira de referências da Cerimônia,
// porque a foto também tem aquele ambiente.
//
// Duas vezes a mesma foto lado a lado lê como erro. Num documento para os
// noivos, lê como descuido.
// ═════════════════════════════════════════════════════════════════════════════

const daGaleria = (photoId: string, preview: string | null = "/leve.jpg"): FotoResolvida => ({
  url: "/original.jpg",
  previewUrl: preview,
  origem: "galeria",
  photoId,
});

const propria = (url = "/propria.jpg"): FotoResolvida => ({
  url,
  previewUrl: null,
  origem: "proprio",
});

const SEM: FotoResolvida = { url: null, previewUrl: null, origem: null };

const item = (over: Partial<ItemDoProjeto> = {}): ItemDoProjeto => ({
  _id: "i1",
  area: "furniture",
  name: "Cadeira Dior",
  visibility: "equipe",
  ...over,
});

const foto = (over: Partial<FotoDoProjeto> = {}): FotoDoProjeto => ({
  _id: "f1",
  url: "/original.jpg",
  previewUrl: "/leve.jpg",
  category: "antes",
  ...over,
});

describe("fotoDoItem — a tela recebe miniatura, o original fica para o PDF", () => {
  it("prefere a versão leve quando a foto veio da Galeria", () => {
    expect(fotoDoItem(item({ referenceFoto: daGaleria("f1") })).url).toBe("/leve.jpg");
  });

  it("cai no original quando a foto da Galeria não tem versão leve", () => {
    // É o estado de toda foto anterior a `previewStorageId`, e de todo HEIC
    // que o navegador do Android não decodificou.
    expect(fotoDoItem(item({ referenceFoto: daGaleria("f1", null) })).url).toBe("/original.jpg");
    // String vazia é o mesmo caso, e não pode virar `src=""`.
    expect(fotoDoItem(item({ referenceFoto: daGaleria("f1", "") })).url).toBe("/original.jpg");
  });

  it("o contratado manda sobre a referência", () => {
    const r = fotoDoItem(
      item({ referenceFoto: daGaleria("f1"), contractedFoto: propria("/contratada.jpg") }),
    );
    expect(r.url).toBe("/contratada.jpg");
    expect(r.ehReferencia).toBe(false);
  });

  it("item ANTIGO, sem fotos resolvidas, continua lendo as URLs de sempre", () => {
    const r = fotoDoItem(item({ referencePhotoUrl: "/antiga.jpg" }));
    expect(r.url).toBe("/antiga.jpg");
    expect(r.ehReferencia).toBe(true);
    // Nenhum id da Galeria: a foto antiga não está lá, e dizer que está faria
    // a prateleira esconder uma imagem que ninguém está mostrando.
    expect(r.photoId).toBeUndefined();
  });

  it("item sem foto nenhuma não inventa url", () => {
    expect(fotoDoItem(item({ referenceFoto: SEM, contractedFoto: SEM }).valueOf() as ItemDoProjeto).url).toBeNull();
  });
});

describe("fotosPresasAItens", () => {
  it("junta as DUAS fotos de cada item, não só a que está aparecendo", () => {
    const usadas = fotosPresasAItens([
      item({ _id: "i1", referenceFoto: daGaleria("f1"), contractedFoto: daGaleria("f2") }),
      item({ _id: "i2", contractedFoto: daGaleria("f3") }),
    ]);
    // `f1` está coberta pelo contratado no cartão, e mesmo assim é daquele
    // item: repeti-la na prateleira mostraria a mesma imagem duas vezes.
    expect([...usadas].sort()).toEqual(["f1", "f2", "f3"]);
  });

  it("item com arquivo PRÓPRIO não prende foto nenhuma da Galeria", () => {
    expect(fotosPresasAItens([item({ referenceFoto: propria() })]).size).toBe(0);
  });

  it("nenhum item, nenhuma foto presa", () => {
    expect(fotosPresasAItens([]).size).toBe(0);
  });
});

describe("o Projeto Visual não mostra a mesma imagem duas vezes", () => {
  const cerimonia = { ambiente: "Cerimônia" };

  it("a foto que ilustra o item sai da prateleira do mesmo ambiente", () => {
    const itens = [
      item({ _id: "i1", ...cerimonia, referenceFoto: daGaleria("f1") }),
    ];
    const fotos = [
      foto({ _id: "f1", ambiente: "Cerimônia", projectScope: "referencia" }),
      foto({ _id: "f2", ambiente: "Cerimônia", projectScope: "referencia" }),
    ];
    const projeto = montarProjetoVisual(
      agruparPorAmbiente(itens),
      fotos,
      fotosPresasAItens(itens),
    );
    const bloco = projeto.ambientes.find((a) => a.label === "Cerimônia")!;
    expect(bloco.referencias.map((f) => f._id)).toEqual(["f2"]);
  });

  it("sem o conjunto, nada é escondido — o comportamento de antes", () => {
    const itens = [item({ _id: "i1", ...cerimonia, referenceFoto: daGaleria("f1") })];
    const fotos = [foto({ _id: "f1", ambiente: "Cerimônia", projectScope: "referencia" })];
    const projeto = montarProjetoVisual(agruparPorAmbiente(itens), fotos);
    const bloco = projeto.ambientes.find((a) => a.label === "Cerimônia")!;
    expect(bloco.referencias).toHaveLength(1);
  });

  it("esconder a foto não apaga o bloco: o item continua lá", () => {
    const itens = [item({ _id: "i1", ...cerimonia, referenceFoto: daGaleria("f1") })];
    const fotos = [foto({ _id: "f1", ambiente: "Cerimônia", projectScope: "referencia" })];
    const projeto = montarProjetoVisual(
      agruparPorAmbiente(itens),
      fotos,
      fotosPresasAItens(itens),
    );
    const bloco = projeto.ambientes.find((a) => a.label === "Cerimônia")!;
    expect(bloco.itens).toHaveLength(1);
    expect(bloco.referencias).toHaveLength(0);
  });

  it("foto SEM ambiente presa a um item também não vira 'referência do evento'", () => {
    // Senão ela apareceria no rodapé da tela como se estivesse solta, ao lado
    // do cartão em que já está sendo mostrada.
    const itens = [item({ _id: "i1", ...cerimonia, referenceFoto: daGaleria("f1") })];
    const fotos = [foto({ _id: "f1" })];
    const projeto = montarProjetoVisual(
      agruparPorAmbiente(itens),
      fotos,
      fotosPresasAItens(itens),
    );
    expect(projeto.semAmbiente.semClassificacao).toHaveLength(0);
  });

  it("o AMBIENTE DA FOTO não muda o ambiente do ITEM", () => {
    // A mesma foto de cadeira serve à cerimônia e à recepção. Quem decide onde
    // o ITEM está é o item — `resolverAmbiente`, como sempre foi.
    const itens = [
      item({ _id: "i1", ambiente: "Recepção", referenceFoto: daGaleria("f1") }),
    ];
    const fotos = [foto({ _id: "f1", ambiente: "Cerimônia" })];
    const projeto = montarProjetoVisual(
      agruparPorAmbiente(itens),
      fotos,
      fotosPresasAItens(itens),
    );
    const blocos = projeto.ambientes.map((a) => a.label);
    expect(blocos).toContain("Recepção");
    // Não nasceu bloco "Cerimônia": a foto está presa ao item da Recepção.
    expect(blocos).not.toContain("Cerimônia");
  });
});
