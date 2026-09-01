import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_FORA_DO_ESCOPO,
  foraDoEscopoDaDecoradora,
  resultadoDoProjeto,
} from "./financeScope";
import { DEMO_WEDDING } from "./demoData";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA: o DEMO não pode voltar a semear o orçamento do CASAMENTO INTEIRO.
//
// O seed original lançava "Buffet Terra Nova — R$ 57.600" e "Locação Fazenda
// Aurora — R$ 32.000" como CUSTO da decoradora. Isso contradizia até as
// próprias categorias do app (que só oferecem Flores, Tecidos, Móveis,
// Iluminação, Transporte, Equipe, Materiais...) e mostrava margem quase zero
// num projeto que na verdade é lucrativo.
// ─────────────────────────────────────────────────────────────────────────────

describe("o seed de demonstração respeita o escopo da decoradora", () => {
  it.each(DEMO_WEDDING.budget.map((b) => [b.description, b.category] as const))(
    "orçamento: %s (%s) é custo de decoração",
    (_descricao, categoria) => {
      expect(
        foraDoEscopoDaDecoradora(categoria),
        `A categoria "${categoria}" descreve um fornecedor do CASAL, não um custo da decoradora.`,
      ).toBe(false);
    },
  );

  it.each(DEMO_WEDDING.transactions.map((t) => [t.description, t.category] as const))(
    "lançamento: %s (%s) é da operação da decoradora",
    (_descricao, categoria) => {
      expect(foraDoEscopoDaDecoradora(categoria)).toBe(false);
    },
  );

  it("nenhuma descrição cita fornecedor do casal como custo", () => {
    // A categoria pode estar certa e a descrição errada ("Materiais — buffet").
    const proibidos = /buffet|loca[çc][ãa]o da fazenda|open bar|celebrante|assessoria|dj\b/i;
    for (const linha of [...DEMO_WEDDING.budget, ...DEMO_WEDDING.transactions]) {
      expect(
        proibidos.test(linha.description),
        `"${linha.description}" descreve um serviço do casamento, não da decoração.`,
      ).toBe(false);
    }
  });

  it("o demo mostra um projeto com margem plausível", () => {
    // Um demo com margem zero ensina a coisa errada sobre o produto.
    const r = resultadoDoProjeto(
      DEMO_WEDDING.budget.map((b) => ({
        type: b.type,
        amount: (b.quantity ?? 1) * b.unitPrice,
        isPaid: false,
      })),
    );
    expect(r.receita).toBe(186_500);
    expect(r.margemPrevista).toBeGreaterThan(0);
    expect(r.margemPercentual).toBeGreaterThanOrEqual(25);
    expect(r.margemPercentual).toBeLessThanOrEqual(70);
  });

  it("o teste realmente detecta o padrão antigo", () => {
    // Contraprova com os dados exatos que existiam antes da correção.
    expect(foraDoEscopoDaDecoradora("Buffet")).toBe(true);
    expect(foraDoEscopoDaDecoradora("Local")).toBe(true);
    expect(foraDoEscopoDaDecoradora("Bar")).toBe(true);
  });
});

describe("categorias fora do escopo", () => {
  it("compara sem acento e sem caixa", () => {
    expect(foraDoEscopoDaDecoradora("LOCAÇÃO DO ESPAÇO")).toBe(true);
    expect(foraDoEscopoDaDecoradora("Vídeo")).toBe(true);
  });

  it("categorias de decoração passam", () => {
    for (const c of ["Flores", "Tecidos", "Móveis", "Iluminação", "Equipe", "Transporte", "Materiais"]) {
      expect(foraDoEscopoDaDecoradora(c), c).toBe(false);
    }
  });

  it("categoria vazia não é considerada fora do escopo", () => {
    expect(foraDoEscopoDaDecoradora(undefined)).toBe(false);
    expect(foraDoEscopoDaDecoradora("")).toBe(false);
  });

  it("a regra NÃO bloqueia — só documenta e protege o seed", () => {
    // Bloquear impediria a exceção legítima: a decoradora contratando a
    // estrutura decorativa do balcão do bar dentro do escopo dela.
    expect(CATEGORIAS_FORA_DO_ESCOPO.length).toBeGreaterThan(0);
    expect(typeof foraDoEscopoDaDecoradora("bar")).toBe("boolean");
  });
});

describe("resultado do projeto não inventa margem", () => {
  it("sem custo lançado, margem é null — não 100%", () => {
    // Margem sobre custo inexistente é a mentira mais fácil de um painel.
    const r = resultadoDoProjeto([{ type: "income", amount: 100_000, isPaid: true }]);
    expect(r.receita).toBe(100_000);
    expect(r.margemPrevista).toBeNull();
    expect(r.margemPercentual).toBeNull();
  });

  it("sem receita lançada, margem é null — não negativa", () => {
    const r = resultadoDoProjeto([{ type: "expense", amount: 5_000, isPaid: true }]);
    expect(r.margemPrevista).toBeNull();
  });

  it("com receita e custo, calcula previsto e real separados", () => {
    const r = resultadoDoProjeto([
      { type: "income", amount: 100_000, isPaid: true },
      { type: "income", amount: 50_000, isPaid: false },
      { type: "expense", amount: 60_000, isPaid: true },
      { type: "expense", amount: 20_000, isPaid: false },
    ]);
    expect(r.receita).toBe(150_000);
    expect(r.recebido).toBe(100_000);
    expect(r.custoPlanejado).toBe(80_000);
    expect(r.custoReal).toBe(60_000);
    expect(r.margemPrevista).toBe(70_000);
    expect(r.margemPercentual).toBe(47);
  });

  it("lista vazia não quebra", () => {
    const r = resultadoDoProjeto([]);
    expect(r.receita).toBe(0);
    expect(r.margemPrevista).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A AGENDA DO DEMO REPRESENTA A OPERAÇÃO DA DECORAÇÃO.
//
// O seed original trazia "Degustação com os noivos — aprovado o menu 2" e
// "Degustação de drinks" como compromissos. São atividades de ASSESSORIA: não
// afetam estética, composição, montagem, logística nem materiais da
// decoradora, e davam ao ALTAR cara de sistema de assessoria.
// ─────────────────────────────────────────────────────────────────────────────
describe("agenda do demo é da operação da decoração", () => {
  const alinhamentos = DEMO_WEDDING.suppliers.flatMap((f) =>
    (f.alignments ?? []).map((a) => ({ fornecedor: f.companyName, ...a })),
  );

  it("existem alinhamentos para demonstrar", () => {
    expect(alinhamentos.length).toBeGreaterThan(5);
  });

  it.each(alinhamentos.map((a) => [a.note, a.fornecedor] as const))(
    "%s (%s) impacta a decoração",
    (nota) => {
      // Atividades típicas de assessoria, que não mudam nada na montagem.
      const assessoria = /degusta[çc][ãa]o|menu \d|drinks autorais|primeira dan[çc]a|valsa|coral|cerimonialista/i;
      expect(
        assessoria.test(nota),
        `"${nota}" é compromisso de assessoria, não da operação da decoração.`,
      ).toBe(false);
    },
  );

  it("o teste detecta o padrão antigo", () => {
    const antigo = "Degustação com os noivos — aprovado o menu 2";
    expect(/degusta[çc][ãa]o|menu \d/i.test(antigo)).toBe(true);
  });
});
