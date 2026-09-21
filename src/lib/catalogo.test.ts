import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  categoriasPresentes,
  filtrarComposicoes,
  filtrarMateriais,
} from "./catalogo.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O CATÁLOGO DO ESTÚDIO
//
// Materiais e composições sempre existiram no servidor, com tudo: criar,
// corrigir, arquivar, ver onde é usado. O ÚNICO caminho até eles era abrir um
// evento → Ficha Técnica → um item → o diálogo da receita.
//
// Para revisar a própria biblioteca antes da temporada, a decoradora precisava
// entrar num evento — geralmente um que não tinha nada a ver com o que ela
// queria arrumar.
// ═════════════════════════════════════════════════════════════════════════════

const material = (nome: string, categoria?: string) => ({
  nome,
  categoria,
  unidade: "un",
});

const composicao = (nome: string, materiais: string[], categoria?: string) => ({
  nome,
  categoria,
  receita: materiais.map((m) => ({ nome: m })),
});

describe("buscar material", () => {
  const lista = [
    material("Rosa branca importada", "Flores"),
    material("Eucalipto baby blue", "Flores"),
    material("Vaso de vidro 25cm", "Peças"),
  ];

  it("acha pelo nome", () => {
    expect(filtrarMateriais(lista, "rosa").map((m) => m.nome)).toEqual([
      "Rosa branca importada",
    ]);
  });

  it("acha pela categoria", () => {
    expect(filtrarMateriais(lista, "flores")).toHaveLength(2);
  });

  it("ignora acento e caixa", () => {
    // A mesma normalização que a deduplicação do catálogo usa: duas regras
    // diferentes fariam a busca não encontrar o material que o cadastro
    // considera repetido.
    expect(filtrarMateriais([material("Açúcar cristal")], "acucar")).toHaveLength(1);
    expect(filtrarMateriais([material("Açúcar cristal")], "AÇÚCAR")).toHaveLength(1);
  });

  it("busca vazia devolve tudo", () => {
    expect(filtrarMateriais(lista, "")).toHaveLength(3);
    expect(filtrarMateriais(lista, "   ")).toHaveLength(3);
  });

  it("não encontra nada é lista vazia, não a lista inteira", () => {
    // O erro clássico: filtro que falha e devolve tudo faz a tela mentir.
    expect(filtrarMateriais(lista, "cadeira")).toEqual([]);
  });

  it("não altera a lista recebida", () => {
    const original = [...lista];
    filtrarMateriais(lista, "rosa");
    expect(lista).toEqual(original);
  });
});

describe("buscar composição", () => {
  const lista = [
    composicao("Arranjo baixo do corredor", ["Rosa branca", "Eucalipto"], "Cerimônia"),
    composicao("Centro de mesa alto", ["Rosa branca", "Vaso de vidro"], "Festa"),
    composicao("Mesa posta", ["Sousplat", "Guardanapo"], "Festa"),
  ];

  it("acha pelo nome", () => {
    expect(filtrarComposicoes(lista, "corredor")).toHaveLength(1);
  });

  it("acha PELO MATERIAL — é a pergunta que ela faz quando falta insumo", () => {
    // "O fornecedor avisou que não tem eucalipto: quais receitas eu preciso
    // repensar?" Sem isto, seria preciso abrir uma a uma.
    expect(filtrarComposicoes(lista, "eucalipto").map((c) => c.nome)).toEqual([
      "Arranjo baixo do corredor",
    ]);
    expect(filtrarComposicoes(lista, "rosa")).toHaveLength(2);
  });

  it("acha pela categoria", () => {
    expect(filtrarComposicoes(lista, "festa")).toHaveLength(2);
  });

  it("receita vazia não quebra a busca", () => {
    expect(filtrarComposicoes([composicao("Sem receita", [])], "qualquer")).toEqual([]);
    expect(filtrarComposicoes([composicao("Sem receita", [])], "sem")).toHaveLength(1);
  });
});

describe("as categorias vêm do que existe", () => {
  it("lista as presentes, sem repetir, em ordem", () => {
    // Sai do que EXISTE, não de uma lista fixa: a decoradora escreve a
    // categoria que quiser, e opções que ninguém usou seriam ruído.
    expect(
      categoriasPresentes([
        { categoria: "Peças" },
        { categoria: "Flores" },
        { categoria: "Flores" },
      ]),
    ).toEqual(["Flores", "Peças"]);
  });

  it("categoria ausente ou em branco não vira opção", () => {
    expect(categoriasPresentes([{}, { categoria: "" }, { categoria: "   " }])).toEqual([]);
  });
});

describe("a tela não cria uma segunda fonte de verdade", () => {
  const TELA = "src/pages/app/catalogo/page.tsx";
  const fonte = readFileSync(TELA, "utf-8");

  it("usa as MESMAS consultas que a ficha técnica usa", () => {
    expect(fonte).toContain("api.materials.list");
    expect(fonte).toContain("api.compositions.list");
  });

  it("reaproveita os diálogos, em vez de copiá-los", () => {
    // Duas cópias do diálogo de material divergiriam na primeira correção — e
    // o aviso do rodapé ("as receitas já salvas não mudam") é justamente o que
    // não pode divergir.
    expect(fonte).toContain("@/components/catalogo/material-dialog.tsx");
    expect(fonte).toContain("@/components/catalogo/composicao-dialog.tsx");
    const receita = readFileSync(
      "src/pages/app/events/[id]/ficha-tecnica/_components/receita-dialog.tsx",
      "utf-8",
    );
    expect(receita).toContain("@/components/catalogo/material-dialog.tsx");
    expect(receita).toContain("@/components/catalogo/composicao-dialog.tsx");
  });

  it("não escreve no catálogo por conta própria", () => {
    // Criar material acontece onde ele é usado — dentro da receita. Um
    // formulário em branco aqui encheria o catálogo de coisa que nenhuma
    // receita cita.
    expect(fonte).not.toContain("api.materials.create");
    expect(fonte).not.toContain("api.compositions.create");
  });

  it("nenhuma conta nasce na tela", () => {
    const codigo = fonte
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(codigo).not.toMatch(/quantidade \* |reduce\(\(s/);
  });

  it("o arquivado continua alcançável — arquivar não é apagar", () => {
    expect(fonte).toContain("incluirArquivados: verArquivados");
    expect(fonte).toContain("incluirArquivadas: verArquivados");
    expect(fonte).toMatch(/Ver arquivados/);
  });

  it("o estado vazio explica de onde o catálogo nasce", () => {
    // Ele nasce do trabalho já feito, não de um formulário em branco — e a
    // tela precisa dizer isso, senão parece quebrada.
    expect(fonte).toMatch(/Ficha Técnica/);
    expect(fonte).toMatch(/Salvar na biblioteca/);
  });
});

describe("o catálogo está no menu", () => {
  const nav = readFileSync("src/lib/navigation.ts", "utf-8");

  it("aparece no menu lateral e no 'Mais' do celular", () => {
    // Um item só no menu lateral é, no telefone, um botão que não existe.
    const lateral = nav.slice(nav.indexOf("NAV_ITEMS"), nav.indexOf("BOTTOM_NAV_ITEMS"));
    const mais = nav.slice(nav.indexOf("MORE_MENU_ITEMS"));
    expect(lateral).toContain('{ to: "/catalogo", label: "Catálogo" }');
    expect(mais).toContain('{ to: "/catalogo", label: "Catálogo" }');
  });

  it("a rota existe", () => {
    expect(readFileSync("src/App.tsx", "utf-8")).toContain('path="/catalogo"');
  });

  it("a barra inferior continua com quatro destinos", () => {
    // Com seis itens o rótulo estoura num aparelho de 320px. O Catálogo entra
    // no "Mais", não na barra.
    const inferior = nav.slice(nav.indexOf("BOTTOM_NAV_ITEMS"), nav.indexOf("MORE_MENU_ITEMS"));
    expect([...inferior.matchAll(/\{ to: "/g)]).toHaveLength(4);
  });
});
