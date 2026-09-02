import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIPOS_DE_MATERIAL, UNIDADES } from "./materiais";
import {
  coberturaDaLinha,
  consolidarMateriais,
  necessidadeDoComponente,
  quantidadeLimpa,
  quantidadeTexto,
  resumirConsolidado,
  unidadesDaComposicao,
  type ComposicaoNoEvento,
} from "./fichaTecnica";

// A MESMA regra de escopo do Caderno de Montagem e da Folha de Carregamento.
// Reproduzida aqui apenas para o teste ter uma injeção; a de verdade vem de
// src/lib/decoration-project.ts, e há um teste amarrando as duas.
const ehObrigacao = (i: { projectScope?: string }) =>
  i.projectScope !== "referencia" && i.projectScope !== "nao_incluso";

const mesas: ComposicaoNoEvento = {
  _id: "c1",
  nome: "Arranjo baixo branco",
  area: "tables",
  ambiente: "Mesa dos convidados",
  quantidade: 20,
  receita: [
    { materialId: "m-rosa", nome: "Rosa branca", unidade: "haste", quantidade: 5 },
    { materialId: "m-lis", nome: "Lisianthus branco", unidade: "haste", quantidade: 3 },
    { materialId: "m-euc", nome: "Eucalipto", unidade: "haste", quantidade: 2 },
    { materialId: "m-vaso", nome: "Vaso vidro X", unidade: "un", quantidade: 1, tipo: "reutilizavel" },
    { materialId: "m-vela", nome: "Vela palito", unidade: "un", quantidade: 2 },
  ],
};

const cerimonia: ComposicaoNoEvento = {
  _id: "c2",
  nome: "Arranjo lateral corredor",
  area: "ceremony",
  quantidade: 10,
  receita: [
    { materialId: "m-rosa", nome: "Rosa branca", unidade: "haste", quantidade: 5 },
    { materialId: "m-euc", nome: "Eucalipto", unidade: "haste", quantidade: 3 },
  ],
};

const bolo: ComposicaoNoEvento = {
  _id: "c3",
  nome: "Guirlanda da mesa do bolo",
  area: "cake",
  quantidade: 1,
  receita: [
    { materialId: "m-rosa", nome: "Rosa branca", unidade: "haste", quantidade: 35 },
    { materialId: "m-lis", nome: "Lisianthus branco", unidade: "haste", quantidade: 20 },
  ],
};

const acharPorNome = (linhas: ReturnType<typeof consolidarMateriais>, nome: string) =>
  linhas.find((l) => l.nome === nome)!;

describe("multiplicação — a conta que a decoradora fazia no papel", () => {
  it("20 arranjos × 5 rosas = 100 rosas", () => {
    expect(necessidadeDoComponente({ quantidade: 20 }, { quantidade: 5 })).toBe(100);
  });

  it("composição sem quantidade vale 1, não zero", () => {
    // Uma guirlanda única não pode zerar a própria receita.
    expect(unidadesDaComposicao({})).toBe(1);
    expect(necessidadeDoComponente({}, { quantidade: 35 })).toBe(35);
  });

  it("quantidade ZERO do componente é resposta legítima", () => {
    // Zerar um ingrediente sem apagar a linha tem de dar zero, nunca 1.
    expect(necessidadeDoComponente({ quantidade: 20 }, { quantidade: 0 })).toBe(0);
  });

  it("quantidade negativa da composição é tratada como 1", () => {
    expect(unidadesDaComposicao({ quantidade: -5 })).toBe(1);
  });

  it("decimal funciona — 3 mesas × 2,5 m de tecido", () => {
    expect(necessidadeDoComponente({ quantidade: 3 }, { quantidade: 2.5 })).toBe(7.5);
  });
});

describe("ponto flutuante — quantidade FÍSICA não é dinheiro", () => {
  it("0,1 × 3 dá 0,3 e não 0,30000000000000004", () => {
    expect(necessidadeDoComponente({ quantidade: 3 }, { quantidade: 0.1 })).toBe(0.3);
  });

  it("somas encadeadas não acumulam lixo", () => {
    const linhas = consolidarMateriais(
      [
        { _id: "a", nome: "A", area: "x", quantidade: 3, receita: [{ nome: "Fita", unidade: "m", quantidade: 0.1 }] },
        { _id: "b", nome: "B", area: "x", quantidade: 3, receita: [{ nome: "Fita", unidade: "m", quantidade: 0.1 }] },
        { _id: "c", nome: "C", area: "x", quantidade: 1, receita: [{ nome: "Fita", unidade: "m", quantidade: 0.1 }] },
      ],
      ehObrigacao,
    );
    expect(linhas[0].necessario).toBe(0.7);
  });

  it("valor não finito não vira NaN na tela", () => {
    expect(quantidadeLimpa(NaN)).toBe(0);
    expect(quantidadeLimpa(Infinity)).toBe(0);
  });
});

describe("consolidado do evento — o exemplo real", () => {
  const linhas = consolidarMateriais([mesas, cerimonia, bolo], ehObrigacao);

  it("soma o mesmo material vindo de ambientes diferentes", () => {
    // 20×5 (mesas) + 10×5 (cerimônia) + 1×35 (bolo) = 185
    expect(acharPorNome(linhas, "Rosa branca").necessario).toBe(185);
    // 20×3 + 1×20 = 80
    expect(acharPorNome(linhas, "Lisianthus branco").necessario).toBe(80);
    // 20×2 + 10×3 = 70
    expect(acharPorNome(linhas, "Eucalipto").necessario).toBe(70);
    expect(acharPorNome(linhas, "Vaso vidro X").necessario).toBe(20);
    expect(acharPorNome(linhas, "Vela palito").necessario).toBe(40);
  });

  it("cada material aparece UMA vez", () => {
    expect(linhas).toHaveLength(5);
    expect(new Set(linhas.map((l) => l.chave)).size).toBe(5);
  });

  it("a ORIGEM de cada necessidade é rastreável", () => {
    const rosa = acharPorNome(linhas, "Rosa branca");
    expect(rosa.origens.map((o) => o.necessario)).toEqual([100, 50, 35]);
    expect(rosa.origens.map((o) => o.ambiente ?? o.area)).toEqual([
      "Mesa dos convidados",
      "ceremony",
      "cake",
    ]);
    // A soma das origens é exatamente o total — sem sobra nem falta.
    expect(rosa.origens.reduce((s, o) => s + o.necessario, 0)).toBe(rosa.necessario);
  });

  it("sai ordenado por nome, em português", () => {
    expect(linhas.map((l) => l.nome)).toEqual([
      "Eucalipto",
      "Lisianthus branco",
      "Rosa branca",
      "Vaso vidro X",
      "Vela palito",
    ]);
  });

  it("evento sem composição devolve lista vazia, não erro", () => {
    expect(consolidarMateriais([], ehObrigacao)).toEqual([]);
  });

  it("composição sem receita não gera linha nenhuma", () => {
    expect(consolidarMateriais([{ _id: "x", nome: "Vazia", area: "x", quantidade: 5 }], ehObrigacao)).toEqual([]);
  });
});

describe("UNIDADE NÃO SE MISTURA", () => {
  it("o mesmo material em unidades diferentes vira DUAS linhas", () => {
    const linhas = consolidarMateriais(
      [
        {
          _id: "a", nome: "A", area: "x", quantidade: 2,
          receita: [
            { materialId: "m-rosa", nome: "Rosa branca", unidade: "haste", quantidade: 10 },
            { materialId: "m-rosa", nome: "Rosa branca", unidade: "maco", quantidade: 1 },
          ],
        },
      ],
      ehObrigacao,
    );
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => `${l.necessario} ${l.unidade}`).sort()).toEqual(["2 maco", "20 haste"]);
  });

  it("materiais SEM id agrupam por nome, mas ainda separados por unidade", () => {
    const linhas = consolidarMateriais(
      [
        { _id: "a", nome: "A", area: "x", quantidade: 2, receita: [{ nome: "Fita", unidade: "m", quantidade: 3 }] },
        { _id: "b", nome: "B", area: "x", quantidade: 4, receita: [{ nome: "fita", unidade: "m", quantidade: 1 }] },
        { _id: "c", nome: "C", area: "x", quantidade: 1, receita: [{ nome: "Fita", unidade: "rolo", quantidade: 2 }] },
      ],
      ehObrigacao,
    );
    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.unidade === "m")!.necessario).toBe(10);
    expect(linhas.find((l) => l.unidade === "rolo")!.necessario).toBe(2);
  });
});

describe("PROJECT SCOPE — referência visual não consome material", () => {
  it("referência visual fica de fora do consolidado", () => {
    const linhas = consolidarMateriais(
      [mesas, { ...cerimonia, _id: "ref", projectScope: "referencia" }],
      ehObrigacao,
    );
    expect(acharPorNome(linhas, "Rosa branca").necessario).toBe(100); // só as mesas
  });

  it("'não incluso' também fica de fora", () => {
    const linhas = consolidarMateriais(
      [{ ...mesas, projectScope: "nao_incluso" }],
      ehObrigacao,
    );
    expect(linhas).toEqual([]);
  });

  it("'incluso' entra", () => {
    const linhas = consolidarMateriais([{ ...mesas, projectScope: "incluso" }], ehObrigacao);
    expect(acharPorNome(linhas, "Rosa branca").necessario).toBe(100);
  });

  it("SEM classificação entra — sair exige escolha explícita", () => {
    // Mesma decisão de `ehObrigacaoDeMontagem`: registro antigo continua valendo.
    const linhas = consolidarMateriais([mesas], ehObrigacao);
    expect(linhas.length).toBeGreaterThan(0);
  });
});

describe("tipo de material — a ponte com carregamento e compras", () => {
  const linhas = consolidarMateriais([mesas], ehObrigacao);

  it("vaso do acervo é retornável e não entra em compras por padrão", () => {
    const vaso = acharPorNome(linhas, "Vaso vidro X");
    expect(vaso.retornavel).toBe(true);
    expect(vaso.normalmenteCompra).toBe(false);
  });

  it("material sem tipo é consumível — não se promete devolução do que não volta", () => {
    const rosa = acharPorNome(linhas, "Rosa branca");
    expect(rosa.tipo).toBe("consumivel");
    expect(rosa.retornavel).toBe(false);
    expect(rosa.normalmenteCompra).toBe(true);
  });
});

describe("custo é ESTIMATIVA, e sabe quando não pode afirmar", () => {
  it("estima quando há custo de referência", () => {
    const linhas = consolidarMateriais(
      [{ _id: "a", nome: "A", area: "x", quantidade: 20, receita: [
        { nome: "Rosa", unidade: "haste", quantidade: 5, custoReferencia: 4.2 },
      ] }],
      ehObrigacao,
    );
    expect(linhas[0].custoEstimado).toBe(420); // 100 × 4,20
  });

  it("uma origem SEM custo torna a linha inteira sem estimativa", () => {
    // Metade do preço apresentado como total seria pior que nenhum preço.
    const linhas = consolidarMateriais(
      [
        { _id: "a", nome: "A", area: "x", quantidade: 10, receita: [
          { materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 5, custoReferencia: 4 },
        ] },
        { _id: "b", nome: "B", area: "x", quantidade: 10, receita: [
          { materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 5 },
        ] },
      ],
      ehObrigacao,
    );
    expect(linhas[0].necessario).toBe(100);
    expect(linhas[0].custoEstimado).toBeNull();
  });

  it("o resumo diz se a estimativa cobre tudo", () => {
    const parcial = resumirConsolidado(consolidarMateriais([mesas], ehObrigacao));
    expect(parcial.estimativaCompleta).toBe(false);
    expect(parcial.custoEstimado).toBe(0);

    const completo = resumirConsolidado(
      consolidarMateriais(
        [{ _id: "a", nome: "A", area: "x", quantidade: 2, receita: [
          { nome: "Rosa", unidade: "haste", quantidade: 5, custoReferencia: 3 },
        ] }],
        ehObrigacao,
      ),
    );
    expect(completo.estimativaCompleta).toBe(true);
    expect(completo.custoEstimado).toBe(30);
  });

  it("consolidado vazio não é 'estimativa completa'", () => {
    expect(resumirConsolidado([]).estimativaCompleta).toBe(false);
  });
});

describe("cobertura — NECESSIDADE ≠ COMPRA", () => {
  const linha = { necessario: 185 };

  it("comprar MAIS que o necessário é correto, não erro", () => {
    const c = coberturaDaLinha(linha, [{ quantity: 200, cancelada: false }]);
    expect(c.comprado).toBe(200);
    expect(c.faltam).toBe(0); // sobra não é falta
    expect(c.percentual).toBe(108);
  });

  it("comprar menos mostra o que falta", () => {
    const c = coberturaDaLinha(linha, [{ quantity: 120, cancelada: false }]);
    expect(c.faltam).toBe(65);
    expect(c.percentual).toBe(65);
  });

  it("compra CANCELADA não cobre nada", () => {
    const c = coberturaDaLinha(linha, [{ quantity: 200, cancelada: true }]);
    expect(c.comprado).toBe(0);
    expect(c.temCompra).toBe(false);
    expect(c.faltam).toBe(185);
  });

  it("várias compras somam", () => {
    const c = coberturaDaLinha(linha, [
      { quantity: 100, cancelada: false },
      { quantity: 85, cancelada: false },
    ]);
    expect(c.comprado).toBe(185);
    expect(c.percentual).toBe(100);
  });

  it("sem necessidade, o percentual é null e não 0%", () => {
    expect(coberturaDaLinha({ necessario: 0 }, [{ quantity: 10, cancelada: false }]).percentual).toBeNull();
  });

  it("compra sem quantidade não conta como zero silencioso", () => {
    const c = coberturaDaLinha(linha, [{ cancelada: false }]);
    expect(c.comprado).toBe(0);
    expect(c.temCompra).toBe(true); // existe, mas não cobre
  });

  it("detecta que a necessidade MUDOU depois da compra", () => {
    const c = coberturaDaLinha({ necessario: 210 }, [
      { quantity: 185, cancelada: false, necessidadeTecnica: 185 },
    ]);
    expect(c.necessidadeMudou).toBe(true);
  });

  it("necessidade igual não é divergência", () => {
    const c = coberturaDaLinha(linha, [{ quantity: 200, cancelada: false, necessidadeTecnica: 185 }]);
    expect(c.necessidadeMudou).toBe(false);
  });

  it("sem carimbo, não afirma nem nega — devolve null", () => {
    expect(coberturaDaLinha(linha, [{ quantity: 200, cancelada: false }]).necessidadeMudou).toBeNull();
  });

  it("compra cancelada não dispara alarme de divergência", () => {
    const c = coberturaDaLinha({ necessario: 210 }, [
      { quantity: 185, cancelada: true, necessidadeTecnica: 185 },
    ]);
    expect(c.necessidadeMudou).toBeNull();
  });
});

describe("texto da quantidade", () => {
  it.each([
    [185, "haste", "185 haste"],
    [2.5, "m", "2,5 m"],
    [20, "un", "20 un"],
    [1.25, "m2", "1,25 m²"],
    [7, "", "7"],
  ])("%s %s → %s", (q, u, esperado) => {
    expect(quantidadeTexto(q as number, u as string)).toBe(esperado);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANTIDUPLICAÇÃO — achados da auditoria cruzada do MASTER #6.
//
// O Convex exige literais estáticos nos validadores, então unidades e tipos
// aparecem escritos em `schema.ts`, `materials.ts` e `compositions.ts`. Este
// bloco garante que a repetição não vire divergência — já aconteceu quatro
// vezes neste projeto (categoria de fornecedor, tipo de evento, papel da
// equipe, tipo de documento do lead).
// ─────────────────────────────────────────────────────────────────────────────
describe("as listas escritas à mão batem com a fonte única", () => {
  const literais = (fonte: string, trecho: string) => {
    const i = fonte.indexOf(trecho);
    expect(i, `trecho "${trecho}" não existe mais`).toBeGreaterThan(-1);
    const abre = fonte.indexOf("v.union(", i);
    const fecha = fonte.indexOf(");", abre);
    return [...fonte.slice(abre, fecha).matchAll(/v\.literal\("([^"]+)"\)/g)].map((m) => m[1]);
  };

  const unidades = UNIDADES.map((u) => u.valor);
  const tipos = TIPOS_DE_MATERIAL.map((t) => t.valor);

  it.each([
    ["convex/schema.ts", "const unidadeDeMaterial = v.union("],
    ["convex/materials.ts", "const unidade = v.union("],
    ["convex/compositions.ts", "const unidade = v.union("],
  ])("%s aceita exatamente as unidades da fonte", (arquivo, trecho) => {
    expect(literais(readFileSync(arquivo, "utf-8"), trecho)).toEqual(unidades);
  });

  it.each([
    ["convex/schema.ts", "const tipoDeMaterial = v.union("],
    ["convex/materials.ts", "const tipo = v.union("],
    ["convex/compositions.ts", "const tipo = v.union("],
  ])("%s aceita exatamente os tipos da fonte", (arquivo, trecho) => {
    expect(literais(readFileSync(arquivo, "utf-8"), trecho)).toEqual(tipos);
  });
});

describe("a multiplicação existe em UM lugar só", () => {
  it.each([
    "convex/fichaTecnica.ts",
    "src/pages/app/events/[id]/ficha-tecnica/page.tsx",
    "src/pages/app/events/[id]/ficha-tecnica/_components/receita-dialog.tsx",
  ])("%s não refaz a conta", (arquivo) => {
    // `quantidade * quantity` espalhado é como a tela mostraria 185 e o PDF
    // 180 — e a decoradora compraria pelo número errado.
    const fonte = readFileSync(arquivo, "utf-8");
    expect(fonte, `${arquivo} multiplica por conta própria`).not.toMatch(
      /quantidade\s*\*\s*\(?item\.quantity|c\.quantidade\s*\*/,
    );
    expect(fonte).toMatch(/necessidadeDoComponente|consolidarMateriais/);
  });
});

describe("o consolidado é DERIVADO — nenhum total é gravado", () => {
  it("o schema não tem campo de total em lugar nenhum da ficha", () => {
    // Total guardado envelhece em silêncio; total calculado não tem como
    // divergir. Um `totalNecessario` no schema seria a porta de entrada.
    //
    // A trava é sobre TOTAIS DERIVADOS. `collectionItems.quantidadeTotal`
    // (MASTER #8) NÃO é derivado de nada: é o número cadastrado do acervo, a
    // própria fonte de verdade — e nele o disponível é que é calculado. Por
    // isso a verificação olha as tabelas da FICHA, não o schema inteiro.
    const schema = readFileSync("convex/schema.ts", "utf-8");
    const semComentarios = (texto: string) =>
      texto
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
    const daFicha = semComentarios(
      schema.slice(
        schema.indexOf("materials: defineTable({"),
        schema.indexOf("collectionItems: defineTable({"),
      ) +
        schema.slice(
          schema.indexOf("assemblyItems: defineTable({"),
          schema.indexOf("layoutRenders: defineTable({"),
        ),
    );
    for (const campo of ["totalNecessario", "totalConsolidado", "quantidadeTotal", "necessarioTotal"]) {
      expect(daFicha, `campo redundante ${campo} nas tabelas da ficha`).not.toContain(campo);
    }
  });
});
