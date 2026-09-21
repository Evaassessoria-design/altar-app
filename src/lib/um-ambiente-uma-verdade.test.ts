import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  agruparPorAmbiente,
  chaveDoAmbiente,
  resolverAmbiente,
  SEM_AMBIENTE,
} from "./decoration-project.ts";
import { montarProjetoVisual, type FotoDoProjeto } from "./projeto-visual.ts";
import { montarFolhaDeCarregamento } from "./loading-sheet.ts";

// ═════════════════════════════════════════════════════════════════════════════
// UM AMBIENTE, UMA VERDADE
//
// O defeito que estes testes existem para impedir de voltar:
//
//   item  → area: "ceremony", ambiente: "Jardim das oliveiras"
//   foto  → ambiente: "Jardim das oliveiras"
//
// davam DOIS blocos no Projeto Visual — o item em "Cerimônia", a foto em
// "Jardim das oliveiras" — porque cada superfície tinha a própria regra:
//
//   Ficha Técnica          → `ambiente || area`   (à mão, em dois arquivos)
//   Projeto / Carregamento → só `area`
//   Caderno de Montagem    → só `area`
//
// Agora existe UMA função (`resolverAmbiente`) e todo mundo passa por ela.
// ═════════════════════════════════════════════════════════════════════════════

type Item = { _id: string; area?: string; ambiente?: string; name: string };
const item = (o: Partial<Item> & { name: string }): Item => ({
  _id: o.name,
  ...o,
});

const foto = (p: Partial<FotoDoProjeto> & { _id: string }): FotoDoProjeto => ({
  url: `https://x/${p._id}`,
  category: "antes",
  ...p,
});

describe("a regra canônica", () => {
  it("o nome que ELA deu ao espaço manda sobre a categoria", () => {
    const r = resolverAmbiente({ area: "ceremony", ambiente: "Jardim das oliveiras" });
    expect(r.label).toBe("Jardim das oliveiras");
    expect(r.doAmbiente).toBe(true);
    // A categoria não some — ela só deixa de ser o rótulo.
    expect(r.area).toBe("ceremony");
  });

  it("sem ambiente, a categoria traduzida é o rótulo", () => {
    const r = resolverAmbiente({ area: "cake" });
    expect(r.label).toBe("Bolo e Doces");
    expect(r.doAmbiente).toBe(false);
  });

  it("ambiente vazio ou só espaço NÃO derruba o fallback", () => {
    expect(resolverAmbiente({ area: "cake", ambiente: "" }).label).toBe("Bolo e Doces");
    expect(resolverAmbiente({ area: "cake", ambiente: "   " }).label).toBe("Bolo e Doces");
  });

  it("área ausente com ambiente preenchido continua sendo um lugar", () => {
    const r = resolverAmbiente({ ambiente: "Jardim" });
    expect(r.label).toBe("Jardim");
    expect(r.area).toBe("");
  });

  it("ambos ausentes não somem: viram 'Sem ambiente'", () => {
    const r = resolverAmbiente({});
    expect(r.chave).toBe(SEM_AMBIENTE);
    expect(r.label).toBe("Sem ambiente");
  });

  it("o texto DIGITADO nunca é sobrescrito pela tradução da área", () => {
    // O defeito simétrico: a área "ceremony" traduzida por cima do nome dela.
    const r = resolverAmbiente({ area: "ceremony", ambiente: "JARDIM das Oliveiras" });
    expect(r.label).toBe("JARDIM das Oliveiras");
    expect(r.label).not.toBe("Cerimônia");
  });

  it("normaliza para COMPARAR sem tocar no que aparece", () => {
    const a = resolverAmbiente({ ambiente: "Jardim das Oliveiras" });
    const b = resolverAmbiente({ ambiente: " jardim das oliveiras " });
    expect(a.chave).toBe(b.chave);
    expect(a.label).toBe("Jardim das Oliveiras");
    expect(b.label).toBe("jardim das oliveiras");
  });

  it("ambiente igual ao nome da área não cria bloco gêmeo", () => {
    const digitado = resolverAmbiente({ area: "ceremony", ambiente: "Cerimônia" });
    const herdado = resolverAmbiente({ area: "ceremony" });
    expect(digitado.chave).toBe(herdado.chave);
  });
});

describe("o agrupamento segue a regra, em qualquer superfície", () => {
  const itens = [
    item({ name: "Arco", area: "ceremony", ambiente: "Jardim das oliveiras" }),
    item({ name: "Spots", area: "lighting", ambiente: "Jardim das oliveiras" }),
    item({ name: "Mesa redonda", area: "party", ambiente: "Salão de vidro" }),
    item({ name: "Mesa do bolo", area: "cake", ambiente: "Salão de vidro" }),
    item({ name: "Arranjo", area: "flowers" }),
  ];

  it("MESMO lugar físico, UM bloco — mesmo vindo de categorias diferentes", () => {
    const grupos = agruparPorAmbiente(itens);
    const jardim = grupos.find((g) => g.label === "Jardim das oliveiras")!;
    expect(jardim.itens.map((i) => i.name)).toEqual(["Arco", "Spots"]);
    expect(grupos.filter((g) => g.label === "Jardim das oliveiras")).toHaveLength(1);
  });

  it("o bloco ocupa a posição da PRIMEIRA categoria que o habita", () => {
    // Sem isto, dar nome ao espaço jogaria o bloco para o fim da folha e a
    // equipe carregaria o caminhão fora de ordem.
    expect(agruparPorAmbiente(itens).map((g) => g.label)).toEqual([
      "Jardim das oliveiras", // ceremony vem antes de lighting
      "Salão de vidro", // party vem antes de cake
      "Flores",
    ]);
  });

  it("bloco de uma categoria só ANUNCIA a categoria", () => {
    const grupos = agruparPorAmbiente([
      item({ name: "Aparador", area: "furniture", ambiente: "Entrada" }),
    ]);
    expect(grupos[0].categoria).toBe("Mobiliário");
  });

  it("bloco que reúne categorias diferentes NÃO escolhe uma", () => {
    // "Salão de vidro" tem item de Festa e de Bolo. Dizer "Festa" seria
    // mentira, e dizer as duas seria ruído.
    const salao = agruparPorAmbiente(itens).find((g) => g.label === "Salão de vidro")!;
    expect(salao.categoria).toBeUndefined();
  });

  it("rótulo que já É a categoria não vira eco", () => {
    const grupos = agruparPorAmbiente([item({ name: "Arranjo", area: "flowers" })]);
    expect(grupos[0].label).toBe("Flores");
    expect(grupos[0].categoria).toBeUndefined();
  });

  it("nenhum item desaparece, em nenhuma combinação", () => {
    const hostis = [
      item({ name: "com os dois", area: "ceremony", ambiente: "Jardim" }),
      item({ name: "só área", area: "ceremony" }),
      item({ name: "só ambiente", ambiente: "Varanda" }),
      item({ name: "nenhum dos dois" }),
      item({ name: "área desconhecida", area: "Ilha gastronômica" }),
      item({ name: "espaços", area: "ceremony", ambiente: "  Jardim  " }),
    ];
    const grupos = agruparPorAmbiente(hostis);
    const nomes = grupos.flatMap((g) => g.itens.map((i) => i.name));
    expect(nomes.sort()).toEqual(hostis.map((i) => i.name).sort());
  });

  it("lista vazia não inventa bloco", () => {
    expect(agruparPorAmbiente([])).toEqual([]);
  });
});

describe("a foto e o item do mesmo lugar caem no MESMO bloco", () => {
  it("o caso que motivou a rodada inteira", () => {
    const projeto = montarProjetoVisual(
      agruparPorAmbiente([
        item({ name: "Arco", area: "ceremony", ambiente: "Jardim das oliveiras" }),
      ]),
      [foto({ _id: "f1", ambiente: "Jardim das oliveiras", projectScope: "referencia" })],
    );
    expect(projeto.ambientes).toHaveLength(1);
    expect(projeto.ambientes[0].label).toBe("Jardim das oliveiras");
    expect(projeto.ambientes[0].itens).toHaveLength(1);
    expect(projeto.ambientes[0].referencias).toHaveLength(1);
  });

  it.each([
    [" Jardim das oliveiras "],
    ["JARDIM DAS OLIVEIRAS"],
    ["jardim das oliveiras"],
    ["Jardim  das   oliveiras"],
  ])("grafia %s cai no mesmo bloco", (grafia) => {
    const projeto = montarProjetoVisual(
      agruparPorAmbiente([
        item({ name: "Arco", area: "ceremony", ambiente: "Jardim das oliveiras" }),
      ]),
      [foto({ _id: "f1", ambiente: grafia, projectScope: "referencia" })],
    );
    expect(projeto.ambientes).toHaveLength(1);
    expect(projeto.ambientes[0].referencias).toHaveLength(1);
  });

  it("a foto encontra o item mesmo quando ele só tem ÁREA", () => {
    // Ela digitou "Cerimônia" na foto; o item nunca recebeu ambiente.
    const projeto = montarProjetoVisual(
      agruparPorAmbiente([item({ name: "Arco", area: "ceremony" })]),
      [foto({ _id: "f1", ambiente: "cerimonia", projectScope: "incluso" })],
    );
    expect(projeto.ambientes).toHaveLength(1);
    expect(projeto.ambientes[0].contratadas).toHaveLength(1);
  });

  it("foto de um ambiente SEM item ainda aparece, no fim", () => {
    const projeto = montarProjetoVisual(
      agruparPorAmbiente([item({ name: "Arco", area: "ceremony" })]),
      [foto({ _id: "f1", ambiente: "Capela", projectScope: "referencia" })],
    );
    expect(projeto.ambientes.map((a) => a.label)).toEqual(["Cerimônia", "Capela"]);
  });

  it("o bloco de fotos sem ambiente não colide com itens sem ambiente", () => {
    // Chaves distintas de propósito: "Sem ambiente" é um item sem cadastro;
    // "Referências do evento" são fotos que ela ainda não situou.
    const projeto = montarProjetoVisual(
      agruparPorAmbiente([item({ name: "Órfão" })]),
      [foto({ _id: "f1", projectScope: "referencia" })],
    );
    expect(projeto.ambientes.map((a) => a.label)).toEqual(["Sem ambiente"]);
    expect(projeto.semAmbiente.referencias).toHaveLength(1);
    expect(projeto.ambientes[0].key).not.toBe(projeto.semAmbiente.key);
  });
});

describe("as quatro superfícies usam a MESMA função", () => {
  const fonte = (p: string) => readFileSync(p, "utf-8");
  /**
   * Fonte SEM comentário.
   *
   * O comentário de um módulo conta a história do defeito que ele corrigiu —
   * e cita o nome antigo da função. Sem isto, o teste acusaria a explicação
   * em vez do código.
   */
  const codigo = (p: string) =>
    fonte(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("a Folha de Carregamento agrupa pelo canônico", () => {
    const folha = montarFolhaDeCarregamento([
      { _id: "a", area: "ceremony", ambiente: "Jardim das oliveiras", name: "Arco" },
      { _id: "b", area: "lighting", ambiente: "Jardim das oliveiras", name: "Spots" },
    ]);
    expect(folha.ambientes).toHaveLength(1);
    expect(folha.ambientes[0].label).toBe("Jardim das oliveiras");
  });

  it("o Caderno de Montagem agrupa pelo canônico, não por BRIEFING_AREAS", () => {
    const pdf = codigo("src/lib/generate-assembly-pdf.ts");
    expect(pdf).toContain("agruparPorAmbiente(reportItems)");
    // O laço antigo percorria as áreas do briefing direto.
    expect(pdf).not.toContain("for (const area of BRIEFING_AREAS)");
  });

  it("a Ficha Técnica não tem mais a própria cópia da regra", () => {
    // Era a única superfície que já preferia `ambiente` — e por isso divergia
    // de todas as outras. A cópia existia em DOIS arquivos.
    for (const p of [
      "src/pages/app/events/[id]/ficha-tecnica/page.tsx",
      "src/lib/generate-ficha-tecnica-pdf.ts",
    ]) {
      expect(codigo(p)).not.toMatch(/ambiente\?\.trim\(\)\s*\|\|\s*\w+\.area/);
      expect(codigo(p)).toContain("agruparPorAmbiente");
    }
  });

  it("o Projeto Visual não normaliza por conta própria", () => {
    const visual = codigo("src/lib/projeto-visual.ts");
    // A chave do grupo JÁ vem normalizada; re-normalizar o rótulo aqui seria a
    // segunda implementação que esta rodada existe para eliminar.
    expect(visual).not.toContain("chaveVisual");
    expect(visual).toContain('from "./decoration-project.ts"');
  });

  it("ninguém mais importa normalizeName para agrupar ambiente", () => {
    for (const p of [
      "src/lib/projeto-visual.ts",
      "src/lib/loading-sheet.ts",
      "src/lib/generate-loading-pdf.ts",
      "src/lib/generate-ficha-tecnica-pdf.ts",
    ]) {
      expect(codigo(p)).not.toContain("normalizeName");
    }
  });
});

describe("o eco não volta aos documentos operacionais", () => {
  it("o Caderno só repete o ambiente quando ele diz algo novo", () => {
    const pdf = readFileSync("src/lib/generate-assembly-pdf.ts", "utf-8");
    expect(pdf).toContain("chaveDoAmbiente(ambienteDoItem) !== grupo.key");
  });

  it("a Folha de Carregamento idem", () => {
    const pdf = readFileSync("src/lib/generate-loading-pdf.ts", "utf-8");
    expect(pdf).toContain("chaveDoAmbiente(ambienteDoItem) !== ambiente.key");
  });

  it("a chave nunca é usada como rótulo em tela ou papel", () => {
    // `chaveDoAmbiente` devolve texto sem acento e em minúscula: imprimir isso
    // mostraria "salao de vidro" para a cliente.
    for (const p of [
      "src/lib/generate-assembly-pdf.ts",
      "src/lib/generate-loading-pdf.ts",
      "src/lib/generate-ficha-tecnica-pdf.ts",
    ]) {
      expect(readFileSync(p, "utf-8")).not.toMatch(/doc\.text\(\s*\w*[Cc]have/);
    }
  });

  it("a normalização não vaza para o que é gravado", () => {
    // Nenhuma mutation recebe a chave normalizada: o banco guarda o texto dela.
    expect(chaveDoAmbiente("Jardim das Oliveiras")).toBe("jardim das oliveiras");
    const page = readFileSync("src/pages/app/events/[id]/fotos/page.tsx", "utf-8");
    expect(page).not.toContain("chaveDoAmbiente");
    const itens = readFileSync(
      "src/pages/app/events/[id]/_components/assembly-items-section.tsx",
      "utf-8",
    );
    expect(itens).not.toContain("chaveDoAmbiente");
  });
});
