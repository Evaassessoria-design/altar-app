import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  montarApresentacao,
  apresentacaoTemConteudo,
  itemVaiParaOsNoivos,
  fotoVaiParaOsNoivos,
} from "./apresentacao-do-projeto.ts";
import { agruparPorAmbiente, fotoDoItem, type ItemDoProjeto } from "./decoration-project.ts";
import { montarProjetoVisual, type FotoDoProjeto } from "./projeto-visual.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O DOCUMENTO DOS NOIVOS — O QUE NÃO PODE ATRAVESSAR
//
// Este é o único papel do ALTAR que vai da decoradora para a CLIENTE com
// imagem. O que vazar aqui vaza uma vez, na mão dela, e não tem como voltar
// atrás: custo, margem, preço de compra, fornecedor, nota operacional,
// situação de montagem, e o item que ela mostrou e ficou de fora.
//
// A proteção principal é de TIPO — `ApresentacaoDoProjeto` simplesmente não
// tem esses campos, como o PDF da Proposta não recebe o registro do banco.
// Este arquivo protege as duas outras metades: a regra de filtro, e a trava de
// fonte que impede alguém de reintroduzir um campo proibido no gerador.
// ═════════════════════════════════════════════════════════════════════════════

const item = (over: Partial<ItemDoProjeto> = {}): ItemDoProjeto => ({
  _id: "i1",
  area: "furniture",
  name: "Cadeira Dior",
  visibility: "cliente",
  ...over,
});

const foto = (over: Partial<FotoDoProjeto> = {}): FotoDoProjeto => ({
  _id: "f1",
  url: "/o.jpg",
  previewUrl: "/l.jpg",
  category: "antes",
  ...over,
});

const montar = (itens: ItemDoProjeto[], fotos: FotoDoProjeto[] = []) =>
  montarApresentacao(
    montarProjetoVisual(agruparPorAmbiente(itens), fotos),
    fotoDoItem,
  );

describe("o que fica de fora", () => {
  it("item `nao_incluso` NÃO aparece", () => {
    // Foi mostrado e ficou de fora. Pôr isso num documento de apresentação é
    // reabrir uma negociação encerrada.
    expect(itemVaiParaOsNoivos(item({ projectScope: "nao_incluso" }))).toBe(false);
    const a = montar([item({ ambiente: "Cerimônia", projectScope: "nao_incluso" })]);
    expect(apresentacaoTemConteudo(a)).toBe(false);
  });

  it("item marcado como INTERNO não aparece", () => {
    expect(itemVaiParaOsNoivos(item({ visibility: "interno" }))).toBe(false);
    expect(itemVaiParaOsNoivos(item({ visibility: "equipe" }))).toBe(false);
    expect(itemVaiParaOsNoivos(item({ visibility: "cliente" }))).toBe(true);
  });

  it("foto `nao_incluso` não aparece", () => {
    expect(fotoVaiParaOsNoivos(foto({ projectScope: "nao_incluso" }))).toBe(false);
  });

  it("foto de EXECUÇÃO não aparece — este documento diz o que vai ser feito", () => {
    for (const category of ["montagem", "evento", "desmontagem"]) {
      expect(fotoVaiParaOsNoivos(foto({ category }))).toBe(false);
    }
    expect(fotoVaiParaOsNoivos(foto({ category: "antes" }))).toBe(true);
  });

  it("ambiente que ficou sem nada visível não vira página em branco", () => {
    const a = montar(
      [item({ ambiente: "Cerimônia", visibility: "interno" })],
      [foto({ ambiente: "Cerimônia", category: "evento" })],
    );
    expect(a.ambientes).toHaveLength(0);
  });
});

describe("o que fica", () => {
  it("item sem classificação ENTRA, e sem virar promessa", () => {
    // Esconder os não classificados produziria um documento vazio para quase
    // todo evento — e empurraria a decoradora de volta para o PowerPoint.
    const a = montar([item({ ambiente: "Cerimônia", quantity: 120, unit: "un" })]);
    expect(a.ambientes[0].itens[0]).toMatchObject({
      nome: "Cadeira Dior",
      quantidade: "120 un",
      ehReferencia: false,
    });
  });

  it("item marcado como referência é rotulado como inspiração", () => {
    const a = montar([item({ ambiente: "Cerimônia", projectScope: "referencia" })]);
    expect(a.ambientes[0].itens[0].ehReferencia).toBe(true);
  });

  it("quantidade zero não vira '0 un' — é ausência mal gravada", () => {
    const a = montar([item({ ambiente: "Cerimônia", quantity: 0 })]);
    expect(a.ambientes[0].itens[0].quantidade).toBeUndefined();
  });

  it("o `model` só entra quando acrescenta ao nome", () => {
    const igual = montar([item({ ambiente: "Cerimônia", model: "cadeira dior" })]);
    expect(igual.ambientes[0].itens[0].detalhe).toBeUndefined();
    const diferente = montar([item({ ambiente: "Cerimônia", model: "Dourada, assento linho" })]);
    expect(diferente.ambientes[0].itens[0].detalhe).toBe("Dourada, assento linho");
  });

  it("fotos sem ambiente entram como referências gerais", () => {
    const a = montar([], [foto({ projectScope: "referencia" })]);
    expect(a.inspiracoes).toHaveLength(1);
    expect(a.inspiracoes[0].ehReferencia).toBe(true);
  });

  it("a imagem usa a versão leve quando existe", () => {
    const a = montar([], [foto()]);
    expect(a.inspiracoes[0].url).toBe("/l.jpg");
  });

  it("foto antiga sem versão leve cai no original", () => {
    const a = montar([], [foto({ previewUrl: null })]);
    expect(a.inspiracoes[0].url).toBe("/o.jpg");
  });

  it("foto sem url nenhuma é descartada em vez de virar quadrado quebrado", () => {
    const a = montar([], [foto({ url: null, previewUrl: null })]);
    expect(a.inspiracoes).toHaveLength(0);
  });
});

describe("o item leva o que o objeto tem — e o objeto não tem o que vaza", () => {
  it("nem fornecedor, nem nota, nem situação atravessam a transformação", () => {
    const a = montar([
      item({
        ambiente: "Cerimônia",
        supplierName: "Móveis Bella",
        notes: "Chegam 6h, entrar pelos fundos",
        projectScope: "incluso",
      }),
    ]);
    const saida = JSON.stringify(a);
    expect(saida).not.toContain("Móveis Bella");
    expect(saida).not.toContain("fundos");
  });
});

// ── A TRAVA DE FONTE ─────────────────────────────────────────────────────────
// O tipo protege o que passa pela transformação. Esta trava protege contra
// alguém contornar a transformação e ler outra coisa dentro do gerador.
describe("o gerador não tem como falar de dinheiro", () => {
  const codigoDe = (p: string) =>
    readFileSync(p, "utf-8")
      // Comentários fora: este repositório já tropeçou na própria prosa quatro
      // vezes com travas assim.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  const GERADOR = codigoDe("src/lib/generate-projeto-visual-pdf.ts");
  const REGRA = codigoDe("src/lib/apresentacao-do-projeto.ts");

  it.each([
    ["amount", "valor de lançamento"],
    ["unitPrice", "preço de compra"],
    ["margem", "margem"],
    ["lucro", "lucro"],
    ["custo", "custo"],
    ["brl", "formatação de dinheiro"],
    ["toLocaleString", "formatação de dinheiro"],
    ["currency", "formatação de dinheiro"],
  ])("não menciona `%s` (%s)", (proibido) => {
    expect(GERADOR.toLowerCase()).not.toContain(proibido.toLowerCase());
  });

  it.each(["supplierName", "supplierId", "operationalStatus", "notes", "receita"])(
    "o tipo que chega ao papel não carrega `%s`",
    (campo) => {
      // Em `apresentacao-do-projeto.ts` estes nomes só podem aparecer como
      // entrada descartada, nunca na saída. `ItemParaOsNoivos` é o contrato.
      const tipo = REGRA.slice(
        REGRA.indexOf("export type ItemParaOsNoivos"),
        REGRA.indexOf("export type AmbienteParaOsNoivos"),
      );
      expect(tipo).not.toContain(campo);
    },
  );

  it("o gerador recebe a apresentação, nunca os itens crus", () => {
    // Se ele passasse a importar `ItemDoProjeto`, a fronteira deixaria de
    // existir sem ninguém mudar uma linha de regra.
    expect(GERADOR).not.toContain("ItemDoProjeto");
    expect(GERADOR).toContain("ApresentacaoDoProjeto");
  });

  it("e entrega pelo caminho único de PDF", () => {
    expect(GERADOR).toContain("entregarPdf");
    expect(GERADOR).not.toContain("doc.save(");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A LEGENDA E A AUDIÊNCIA DA FOTO
//
// Duas frestas que a proteção de TIPO não fecha, porque as duas são de LINHA:
// o texto que veio junto da foto, e a foto que veio por um ponteiro.
// ═════════════════════════════════════════════════════════════════════════════

/** As legendas que saíram impressas, em todos os ambientes. */
const legendasDe = (a: ReturnType<typeof montar>) =>
  a.ambientes.flatMap((amb) => amb.imagens.map((i) => i.legenda));

describe("a legenda interna não vai no documento", () => {
  it("legenda de foto SEM CLASSIFICAÇÃO não é impressa", () => {
    // `caption` é o que ela escreve para si mesma na Galeria: "refazer, ficou
    // torto", "conferir com a Flora". Sem classificação é o estado da maioria
    // das fotos — e era justamente o que vazava.
    const a = montar(
      [item({ ambiente: "Cerimônia" })],
      [foto({ ambiente: "Cerimônia", caption: "refazer, ficou torto" })],
    );
    expect(legendasDe(a)).toEqual([undefined]);
  });

  it("nem a de foto marcada como REFERÊNCIA", () => {
    const a = montar(
      [item({ ambiente: "Cerimônia" })],
      [foto({ ambiente: "Cerimônia", projectScope: "referencia", caption: "pedir orçamento" })],
    );
    expect(legendasDe(a)).toEqual([undefined]);
  });

  it("mas a de foto INCLUSO vai — é a única que exigiu um gesto deliberado", () => {
    const a = montar(
      [item({ ambiente: "Cerimônia" })],
      [foto({ ambiente: "Cerimônia", projectScope: "incluso", caption: "Arranjo alto do altar" })],
    );
    expect(legendasDe(a)).toEqual(["Arranjo alto do altar"]);
  });

  it("e nenhum texto interno atravessa o objeto inteiro", () => {
    const a = montar(
      [item({ ambiente: "Cerimônia" })],
      [
        foto({ _id: "f1", ambiente: "Cerimônia", caption: "fornecedor entregou errado" }),
        foto({ _id: "f2", ambiente: "Cerimônia", projectScope: "referencia", caption: "caro demais" }),
      ],
    );
    const serializado = JSON.stringify(a);
    expect(serializado).not.toContain("entregou errado");
    expect(serializado).not.toContain("caro demais");
  });
});

describe("foto marcada como SÓ PARA MIM não aparece", () => {
  it("nem sendo `antes` e sem nenhuma outra restrição", () => {
    // É o caso que o proxy `category === "antes"` deixava passar: a foto do
    // problema é tirada antes do evento como qualquer referência.
    expect(fotoVaiParaOsNoivos(foto({ visibility: "interno" }))).toBe(false);
    const a = montar(
      [item({ ambiente: "Cerimônia" })],
      [foto({ ambiente: "Cerimônia", visibility: "interno" })],
    );
    expect(a.ambientes.flatMap((amb) => amb.imagens)).toEqual([]);
  });

  it("e a marcação vence até a classificação de contratado", () => {
    expect(
      fotoVaiParaOsNoivos(foto({ visibility: "interno", projectScope: "incluso" })),
    ).toBe(false);
  });

  it("ausente continua entrando — nenhuma foto já enviada muda de comportamento", () => {
    expect(fotoVaiParaOsNoivos(foto({}))).toBe(true);
    expect(fotoVaiParaOsNoivos(foto({ visibility: "cliente" }))).toBe(true);
  });
});

describe("a foto do ITEM passa pela mesma porta das prateleiras", () => {
  /** Um item que aponta para uma foto da Galeria, como a tela resolve. */
  const itemApontando = (photoId: string, ambiente = "Cerimônia") =>
    item({
      ambiente,
      contractedFoto: {
        url: "/o.jpg",
        previewUrl: "/l.jpg",
        origem: "galeria",
        photoId,
      },
    });

  const fotosDosItens = (a: ReturnType<typeof montar>) =>
    a.ambientes.flatMap((amb) => amb.itens.map((i) => i.fotoUrl));

  it("item visível NÃO carrega foto marcada como só para mim", () => {
    // O item foi aprovado; a IMAGEM não. Antes ela entrava de carona, porque
    // ninguém perguntava nada sobre a linha apontada.
    const a = montar(
      [itemApontando("f9")],
      [foto({ _id: "f9", ambiente: "Cerimônia", visibility: "interno" })],
    );
    expect(fotosDosItens(a)).toEqual([null]);
  });

  it("nem foto de EXECUÇÃO", () => {
    const a = montar(
      [itemApontando("f9")],
      [foto({ _id: "f9", ambiente: "Cerimônia", category: "evento" })],
    );
    expect(fotosDosItens(a)).toEqual([null]);
  });

  it("nem foto `nao_incluso`", () => {
    const a = montar(
      [itemApontando("f9")],
      [foto({ _id: "f9", ambiente: "Cerimônia", projectScope: "nao_incluso" })],
    );
    expect(fotosDosItens(a)).toEqual([null]);
  });

  it("mas carrega a foto que pode aparecer", () => {
    const a = montar(
      [itemApontando("f9")],
      [foto({ _id: "f9", ambiente: "Cerimônia", projectScope: "incluso" })],
    );
    expect(fotosDosItens(a)).toEqual(["/l.jpg"]);
  });

  it("e o arquivo PRÓPRIO do item continua passando", () => {
    // Nunca esteve na Galeria e não tem eixo de audiência nenhum. O item já
    // foi aprovado; negar a foto dele tiraria do documento imagens que sempre
    // estiveram lá, sem defeito que justificasse.
    const a = montar([item({ ambiente: "Cerimônia", contractedPhotoUrl: "/proprio.jpg" })]);
    expect(fotosDosItens(a)).toEqual(["/proprio.jpg"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REGRESSÃO — O DOCUMENTO DA CLIENTE, DE PONTA A PONTA
//
// As travas acima testam cada fronteira isolada. Estas testam o objeto
// INTEIRO, serializado, do jeito que o gerador o recebe: é assim que um campo
// novo vaza — não por alguém decidir publicá-lo, mas por um `...item` num
// lugar onde ninguém estava olhando.
// ═════════════════════════════════════════════════════════════════════════════
describe("o objeto que chega ao PDF não contém nada interno", () => {
  /** Um evento com tudo que existe de interno em item e foto. */
  const completo = () =>
    montar(
      [
        item({
          _id: "i1",
          ambiente: "Cerimônia",
          name: "Arranjo alto",
          quantity: 12,
          supplierName: "Flora Bela Atacado",
          notes: "Fechar por 180 e pedir nota",
          operationalStatus: "carregado",
          receita: [{ nome: "Rosa branca", quantidade: 180, custoReferencia: 6.9 }],
          contractedFoto: {
            url: "/o.jpg",
            previewUrl: "/l.jpg",
            origem: "galeria",
            photoId: "f1",
          },
        } as never),
      ],
      [
        foto({
          _id: "f1",
          ambiente: "Cerimônia",
          projectScope: "incluso",
          caption: "Arranjo alto do altar",
        }),
        foto({
          _id: "f2",
          ambiente: "Cerimônia",
          visibility: "interno",
          caption: "fornecedor mandou a cor errada",
        }),
        foto({
          _id: "f3",
          ambiente: "Cerimônia",
          category: "evento",
          caption: "como ficou",
        }),
        foto({ _id: "f4", ambiente: "Cerimônia", projectScope: "nao_incluso" }),
      ],
    );

  it("nem fornecedor, nem custo, nem nota operacional, nem situação", () => {
    const serializado = JSON.stringify(completo());
    for (const interno of [
      "Flora Bela",
      "Fechar por 180",
      "carregado",
      "6.9",
      "custoReferencia",
      "supplierName",
      "receita",
      "operationalStatus",
    ]) {
      expect(serializado, `vazou "${interno}" para o documento da cliente`).not.toContain(
        interno,
      );
    }
  });

  it("a foto marcada SÓ PARA MIM não aparece em lugar nenhum do objeto", () => {
    // Nem como imagem de ambiente, nem como foto de item, nem pela legenda.
    const serializado = JSON.stringify(completo());
    expect(serializado).not.toContain("mandou a cor errada");
    expect(serializado).not.toContain("/f2");
  });

  it("nem a foto de execução, nem a `nao_incluso`", () => {
    const serializado = JSON.stringify(completo());
    expect(serializado).not.toContain("como ficou");
  });

  it("e o que É da cliente continua chegando inteiro", () => {
    // Uma trava que só proíbe acaba esvaziando o documento sem ninguém notar.
    const a = completo();
    const serializado = JSON.stringify(a);
    expect(serializado).toContain("Arranjo alto");
    expect(serializado).toContain("Arranjo alto do altar");
    expect(a.ambientes[0].itens[0].fotoUrl).toBe("/l.jpg");
  });
});
