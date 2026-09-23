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
