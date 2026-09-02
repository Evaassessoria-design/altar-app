import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canceladaComLancamento,
  custoDoEvento,
  motivoDaMargemAusente,
  valorDaCompra,
  valorDivergente,
  vinculoQuebrado,
  type CompraParaCusto,
  type LancamentoParaCusto,
} from "./custoDoEvento";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — o custo do evento não pode contar duas vezes, nem mentir precisão.
//
// O dinheiro vivia em três ilhas: orçamento, financeiro e compras. As compras
// tinham `unitPrice` e não entravam em cálculo nenhum — a decoradora
// registrava R$ 12.000 em flores e a margem seguia como se nada tivesse sido
// comprado.
//
// A decisão: `transactions` é o livro-caixa. Compra vira custo quando é
// LANÇADA. E o que ainda não foi lançado não é escondido: ele torna o
// resultado explicitamente incompleto.
// ─────────────────────────────────────────────────────────────────────────────

const compra = (over: Partial<CompraParaCusto> = {}): CompraParaCusto => ({
  cancelada: false,
  ...over,
});
const lanc = (
  type: string,
  amount: number,
  isPaid = false,
): LancamentoParaCusto => ({ type, amount, isPaid });

describe("valor de uma compra", () => {
  it.each([
    [{ unitPrice: 12.9, quantity: 120 }, 1548],
    [{ unitPrice: 100, quantity: undefined }, 100],
    [{ unitPrice: 0, quantity: 5 }, 0],
    [{ unitPrice: undefined, quantity: 5 }, 0],
    [{ unitPrice: Number.NaN, quantity: 2 }, 0],
    [{ unitPrice: 10, quantity: Number.NaN }, 10],
  ])("%o vale %d", (campos, esperado) => {
    expect(valorDaCompra(compra(campos))).toBeCloseTo(esperado, 6);
  });

  it("centavos não viram lixo de ponto flutuante", () => {
    // 0.1 * 3 = 0.30000000000000004 em JS. O total precisa continuar legível.
    expect(valorDaCompra(compra({ unitPrice: 0.1, quantity: 3 }))).toBeCloseTo(0.3, 10);
  });
});

describe("receita, custo lançado e custo pago são coisas distintas", () => {
  const livro = [
    lanc("income", 100_000, true),
    lanc("income", 50_000, false),
    lanc("expense", 40_000, true),
    lanc("expense", 20_000, false),
  ];

  it("separa os quatro conceitos", () => {
    const c = custoDoEvento(livro, []);
    expect(c.receita).toBe(150_000);
    expect(c.recebido).toBe(100_000);
    expect(c.custoLancado).toBe(60_000);
    expect(c.custoPago).toBe(40_000);
  });

  it("saldo a pagar é o que foi lançado e não liquidado", () => {
    expect(custoDoEvento(livro, []).saldoAPagar).toBe(20_000);
  });

  it("receita NUNCA é usada como custo", () => {
    const c = custoDoEvento([lanc("income", 90_000)], []);
    expect(c.custoLancado).toBe(0);
    expect(c.custoPago).toBe(0);
  });
});

describe("dupla contagem — o ponto central", () => {
  it("compra JÁ LANÇADA não soma de novo", () => {
    // Ela está no livro através da transação. Contá-la aqui também seria
    // exatamente o bug que a arquitetura existe para impedir.
    const c = custoDoEvento(
      [lanc("income", 100_000), lanc("expense", 12_000)],
      [compra({ unitPrice: 12_000, quantity: 1, transactionId: "tx1" })],
    );
    expect(c.custoLancado).toBe(12_000);
    expect(c.custoForaDoLivro).toBe(0);
    expect(c.completo).toBe(true);
  });

  it("dez compras lançadas continuam somando uma vez cada", () => {
    const compras = Array.from({ length: 10 }, (_, i) =>
      compra({ unitPrice: 100, quantity: 1, transactionId: `tx${i}` }),
    );
    const livro = Array.from({ length: 10 }, () => lanc("expense", 100));
    const c = custoDoEvento([lanc("income", 5000), ...livro], compras);
    expect(c.custoLancado).toBe(1000);
    expect(c.custoForaDoLivro).toBe(0);
  });
});

describe("o que ainda não foi lançado torna o resultado incompleto", () => {
  it("compra com preço e sem vínculo é dinheiro fora do livro", () => {
    const c = custoDoEvento(
      [lanc("income", 100_000), lanc("expense", 30_000)],
      [compra({ unitPrice: 400, quantity: 31 })],
    );
    expect(c.custoForaDoLivro).toBe(12_400);
    expect(c.comprasForaDoLivro).toBe(1);
    expect(c.completo).toBe(false);
  });

  it("e a margem NÃO é apresentada — incompleta vale mais que falsa", () => {
    const c = custoDoEvento(
      [lanc("income", 100_000), lanc("expense", 30_000)],
      [compra({ unitPrice: 12_400, quantity: 1 })],
    );
    expect(c.margem).toBeNull();
    expect(c.margemPercentual).toBeNull();
    expect(motivoDaMargemAusente(c)).toBe(
      "1 compra ainda não foi lançada no financeiro",
    );
  });

  it("com tudo lançado, a margem aparece", () => {
    const c = custoDoEvento(
      [lanc("income", 100_000), lanc("expense", 60_000)],
      [compra({ unitPrice: 60_000, quantity: 1, transactionId: "tx1" })],
    );
    expect(c.margem).toBe(40_000);
    expect(c.margemPercentual).toBe(40);
    expect(motivoDaMargemAusente(c)).toBeNull();
  });

  it("compra CANCELADA não é dinheiro que saiu", () => {
    const c = custoDoEvento(
      [lanc("income", 100_000), lanc("expense", 60_000)],
      [compra({ unitPrice: 9_000, quantity: 1, cancelada: true })],
    );
    expect(c.custoForaDoLivro).toBe(0);
    expect(c.completo).toBe(true);
    expect(c.margem).toBe(40_000);
  });

  it("compra SEM preço não conta como pendência — não há valor a lançar", () => {
    const c = custoDoEvento(
      [lanc("income", 100_000), lanc("expense", 60_000)],
      [compra({ unitPrice: undefined }), compra({ unitPrice: 0, quantity: 10 })],
    );
    expect(c.comprasForaDoLivro).toBe(0);
    expect(c.margem).toBe(40_000);
  });
});

describe("margem só existe com base real", () => {
  it("sem receita, não há margem", () => {
    const c = custoDoEvento([lanc("expense", 30_000)], []);
    expect(c.margem).toBeNull();
    expect(motivoDaMargemAusente(c)).toBe("Nenhuma receita lançada ainda");
  });

  it("sem custo, não há margem — 100% seria a mentira mais fácil", () => {
    const c = custoDoEvento([lanc("income", 100_000)], []);
    expect(c.margem).toBeNull();
    expect(motivoDaMargemAusente(c)).toBe("Nenhum custo lançado ainda");
  });

  it("evento vazio não quebra", () => {
    const c = custoDoEvento([], []);
    expect(c).toMatchObject({
      receita: 0,
      custoLancado: 0,
      saldoAPagar: 0,
      custoForaDoLivro: 0,
      completo: true,
      margem: null,
    });
  });

  it("margem negativa é mostrada — prejuízo é informação", () => {
    const c = custoDoEvento([lanc("income", 50_000), lanc("expense", 70_000)], []);
    expect(c.margem).toBe(-20_000);
    expect(c.margemPercentual).toBe(-40);
  });
});

describe("compatibilidade com o que já está gravado", () => {
  it("compra antiga (sem transactionId) não é erro — é custo fora do livro", () => {
    // É a situação de TODA compra que existe hoje. Ela não pode virar
    // inconsistência de um dia para o outro.
    const c = custoDoEvento(
      [lanc("income", 10_000), lanc("expense", 1_000)],
      [compra({ unitPrice: 500, quantity: 2 })],
    );
    expect(c.completo).toBe(false);
    expect(c.custoForaDoLivro).toBe(1_000);
    expect(motivoDaMargemAusente(c)).toContain("não foi lançada");
  });

  it("livro sem nenhuma compra continua funcionando como antes", () => {
    const c = custoDoEvento([lanc("income", 100), lanc("expense", 40)], []);
    expect(c.margem).toBe(60);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRIDADE DO VÍNCULO (auditoria pós-MASTER #5)
//
// Até aqui o vínculo era verificado só por EXISTÊNCIA. Isso deixava três
// maneiras de ele mentir em silêncio — e as três produziam MARGEM AFIRMADA
// sobre um custo errado, que é o pior resultado possível: um número com cara
// de exato.
// ─────────────────────────────────────────────────────────────────────────────

const compraBase = {
  unitPrice: 100,
  quantity: 4, // R$ 400
  cancelada: false,
};

const LANCAMENTOS = [
  { type: "income", amount: 10_000, isPaid: true },
  { type: "expense", amount: 400, isPaid: false },
];

describe("vínculo quebrado — o lançamento foi apagado", () => {
  it("é detectado", () => {
    expect(vinculoQuebrado({ ...compraBase, transactionId: "tx1", valorLancado: null })).toBe(true);
  });

  it("compra sem vínculo nenhum não é vínculo quebrado", () => {
    expect(vinculoQuebrado({ ...compraBase })).toBe(false);
  });

  it("cala a margem, mesmo com receita e custo lançados", () => {
    const c = custoDoEvento(LANCAMENTOS, [
      { ...compraBase, transactionId: "tx1", valorLancado: null },
    ]);
    expect(c.comprasComVinculoQuebrado).toBe(1);
    expect(c.completo).toBe(false);
    expect(c.margem).toBeNull();
    expect(motivoDaMargemAusente(c)).toBe(
      "1 compra aponta para um lançamento apagado — lance de novo no financeiro",
    );
  });
});

describe("cancelada com despesa viva", () => {
  it("é detectada", () => {
    expect(
      canceladaComLancamento({ ...compraBase, cancelada: true, transactionId: "tx1", valorLancado: 400 }),
    ).toBe(true);
  });

  it("cancelada SEM lançamento continua sendo apenas cancelada", () => {
    expect(canceladaComLancamento({ ...compraBase, cancelada: true })).toBe(false);
  });

  it("cala a margem — o dinheiro não saiu e a despesa está lá", () => {
    const c = custoDoEvento(LANCAMENTOS, [
      { ...compraBase, cancelada: true, transactionId: "tx1", valorLancado: 400 },
    ]);
    expect(c.comprasCanceladasComLancamento).toBe(1);
    expect(c.margem).toBeNull();
    expect(motivoDaMargemAusente(c)).toBe(
      "1 compra cancelada ainda tem despesa no financeiro",
    );
  });
});

describe("valor divergente — o preço mudou depois de lançar", () => {
  it("é detectado", () => {
    // Compra vale 400 agora; o livro guarda os 250 de antes.
    expect(valorDivergente({ ...compraBase, transactionId: "tx1", valorLancado: 250 })).toBe(true);
  });

  it("valores iguais não são divergência", () => {
    expect(valorDivergente({ ...compraBase, transactionId: "tx1", valorLancado: 400 })).toBe(false);
  });

  it("RUÍDO DE PONTO FLUTUANTE não é divergência", () => {
    // `0.1 * 3` dá 0.30000000000000004. Comparar por igualdade acusaria
    // centenas de compras corretas.
    const c = { unitPrice: 0.1, quantity: 3, cancelada: false, transactionId: "tx1" };
    expect(valorDivergente({ ...c, valorLancado: 0.3 })).toBe(false);
  });

  it("um centavo de diferença JÁ é divergência — é dinheiro", () => {
    expect(valorDivergente({ ...compraBase, transactionId: "tx1", valorLancado: 400.01 })).toBe(true);
  });

  it("cancelada não é avaliada por divergência — ela tem motivo próprio", () => {
    expect(
      valorDivergente({ ...compraBase, cancelada: true, transactionId: "tx1", valorLancado: 1 }),
    ).toBe(false);
  });

  it("cala a margem e diz como consertar", () => {
    const c = custoDoEvento(LANCAMENTOS, [
      { ...compraBase, transactionId: "tx1", valorLancado: 250 },
    ]);
    expect(c.comprasComValorDivergente).toBe(1);
    expect(c.margem).toBeNull();
    expect(motivoDaMargemAusente(c)).toBe(
      "1 compra mudou de valor depois de lançada — lance de novo para atualizar",
    );
  });
});

describe("cada compra entra em UM balde só", () => {
  it("vínculo quebrado não conta também como fora do livro", () => {
    const c = custoDoEvento(LANCAMENTOS, [
      { ...compraBase, transactionId: "tx1", valorLancado: null },
    ]);
    expect(c.comprasForaDoLivro).toBe(0);
    expect(c.custoForaDoLivro).toBe(0);
    expect(c.comprasComVinculoQuebrado).toBe(1);
  });

  it("a mensagem segue a ordem de gravidade", () => {
    // Quebrado é o pior: o custo SUMIU do livro. Os outros têm dinheiro
    // rastreável em algum lugar.
    const c = custoDoEvento(LANCAMENTOS, [
      { ...compraBase, transactionId: "tx1", valorLancado: null },
      { ...compraBase, transactionId: "tx2", valorLancado: 250 },
      { ...compraBase },
    ]);
    expect(motivoDaMargemAusente(c)).toContain("apagado");
  });
});

describe("compra correta e lançada continua permitindo a margem", () => {
  it("nada disto quebra o caminho feliz", () => {
    const c = custoDoEvento(LANCAMENTOS, [
      { ...compraBase, transactionId: "tx1", valorLancado: 400 },
    ]);
    expect(c.completo).toBe(true);
    expect(c.margem).toBe(9600);
    expect(motivoDaMargemAusente(c)).toBeNull();
  });

  it("compra SEM preço e sem vínculo não atrapalha nada", () => {
    // Zero e ausente têm a mesma resposta aqui: não há o que lançar.
    const c = custoDoEvento(LANCAMENTOS, [
      { cancelada: false },
      { unitPrice: 0, quantity: 10, cancelada: false },
      { ...compraBase, transactionId: "tx1", valorLancado: 400 },
    ]);
    expect(c.completo).toBe(true);
    expect(c.comprasForaDoLivro).toBe(0);
  });
});

describe("todo consumidor real resolve `valorLancado`", () => {
  it("resumirFinanceiro monta o mapa de lançamentos", () => {
    // Um consumidor que esqueça este campo volta ao comportamento antigo — o
    // vínculo mentindo em silêncio — sem que nenhum outro teste acuse.
    const fonte = readFileSync("convex/lib/eventSummary.ts", "utf-8");
    expect(fonte).toContain("valorLancado:");
    expect(fonte).toMatch(/valorPorLancamento/);
  });
});
