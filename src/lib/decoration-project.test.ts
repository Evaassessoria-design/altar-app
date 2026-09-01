import { describe, expect, it } from "vitest";
import {
  ehObrigacaoDeMontagem,
  escopoDoItem,
  fotoDoItem,
  labelDoAmbiente,
  montarProjeto,
  type ItemDoProjeto,
} from "./decoration-project";

const item = (over: Partial<ItemDoProjeto> & { area: string; name: string }): ItemDoProjeto => ({
  _id: Math.random().toString(36).slice(2),
  visibility: "equipe",
  ...over,
});

describe("ambientes", () => {
  it("traduz as áreas conhecidas", () => {
    expect(labelDoAmbiente("ceremony").label).toBe("Cerimônia");
    expect(labelDoAmbiente("flowers").label).toBe("Flores");
  });

  it("ambiente PERSONALIZADO volta como foi digitado", () => {
    // A decoradora cria "Bem-casados", "Ilha gastronômica", "Buquê". O sistema
    // não pode chamar isso de inválido nem esconder.
    expect(labelDoAmbiente("Ilha gastronômica").label).toBe("Ilha gastronômica");
    expect(labelDoAmbiente("Buquê").label).toBe("Buquê");
  });
});

describe("escopo do item", () => {
  it("item sem classificação NÃO recebe selo", () => {
    // Cadastro incompleto não pode virar promessa ao cliente.
    expect(escopoDoItem({})).toBeNull();
    expect(escopoDoItem({ projectScope: "" })).toBeNull();
  });

  it("valor desconhecido também não inventa selo", () => {
    expect(escopoDoItem({ projectScope: "talvez" })).toBeNull();
  });

  it("reconhece os três valores", () => {
    expect(escopoDoItem({ projectScope: "incluso" })).toBe("incluso");
    expect(escopoDoItem({ projectScope: "referencia" })).toBe("referencia");
    expect(escopoDoItem({ projectScope: "nao_incluso" })).toBe("nao_incluso");
  });
});

describe("referência estética NÃO vira obrigação de montagem", () => {
  it("item marcado como referência sai da operação", () => {
    expect(ehObrigacaoDeMontagem({ projectScope: "referencia" })).toBe(false);
  });

  it("item não incluso também sai", () => {
    expect(ehObrigacaoDeMontagem({ projectScope: "nao_incluso" })).toBe(false);
  });

  it("item incluso é obrigação", () => {
    expect(ehObrigacaoDeMontagem({ projectScope: "incluso" })).toBe(true);
  });

  it("item ANTIGO sem classificação continua na operação", () => {
    // Compatibilidade: sair da montagem exige escolha explícita. Se a ausência
    // removesse o item, todo item já cadastrado sumiria do caderno.
    expect(ehObrigacaoDeMontagem({})).toBe(true);
  });
});

describe("montagem do projeto por ambiente", () => {
  const itens = [
    item({ area: "flowers", name: "Arranjo alto", projectScope: "incluso" }),
    item({ area: "ceremony", name: "Arco de oliveiras", projectScope: "incluso" }),
    item({ area: "ceremony", name: "Corredor com pétalas", projectScope: "referencia" }),
    item({ area: "Ilha gastronômica", name: "Toalha de linho" }),
  ];

  it("agrupa por ambiente e respeita a ordem das áreas conhecidas", () => {
    const projeto = montarProjeto(itens);
    expect(projeto.map((a) => a.key)).toEqual([
      "ceremony",
      "flowers",
      "Ilha gastronômica",
    ]);
  });

  it("ambiente personalizado vai para o FIM, sem sumir", () => {
    const projeto = montarProjeto(itens);
    expect(projeto[projeto.length - 1].label).toBe("Ilha gastronômica");
  });

  it("conta inclusos e referências por ambiente", () => {
    const cerimonia = montarProjeto(itens).find((a) => a.key === "ceremony")!;
    expect(cerimonia.itens).toHaveLength(2);
    expect(cerimonia.inclusos).toBe(1);
    expect(cerimonia.referencias).toBe(1);
  });

  it("ambiente sem item não aparece", () => {
    const projeto = montarProjeto([item({ area: "flowers", name: "Só flores" })]);
    expect(projeto).toHaveLength(1);
    expect(projeto[0].key).toBe("flowers");
  });

  it("lista vazia devolve projeto vazio", () => {
    expect(montarProjeto([])).toEqual([]);
  });
});

describe("foto do item", () => {
  it("a foto CONTRATADA tem precedência — mesma regra do Caderno", () => {
    const f = fotoDoItem(
      item({
        area: "flowers",
        name: "Arco",
        contractedPhotoUrl: "https://contratado",
        referencePhotoUrl: "https://referencia",
      }),
    );
    expect(f.url).toBe("https://contratado");
    expect(f.ehReferencia).toBe(false);
  });

  it("só há referência => é marcada como referência", () => {
    const f = fotoDoItem(
      item({ area: "flowers", name: "Arco", referencePhotoUrl: "https://referencia" }),
    );
    expect(f.url).toBe("https://referencia");
    expect(f.ehReferencia).toBe(true);
  });

  it("sem foto nenhuma não quebra", () => {
    const f = fotoDoItem(item({ area: "flowers", name: "Arco" }));
    expect(f.url).toBeNull();
    expect(f.ehReferencia).toBe(false);
  });
});
