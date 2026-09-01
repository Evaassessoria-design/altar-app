import { describe, expect, it } from "vitest";
import { isPendingStatus, isPurchasedForStatus } from "./purchaseStatus";
import {
  montarProximasAcoes,
  montarResumoOperacional,
  resumirCompras,
  resumirFinanceiro,
  resumirFornecedores,
} from "./eventSummary";

// O compromisso central deste módulo é HONESTIDADE: todo número é contagem de
// dado real. Estes testes existem sobretudo para travar isso — nenhum valor
// pode ser estimado, presumido ou arredondado a favor.

describe("resumirFornecedores", () => {
  it("confirmado e finalizado contam como resolvidos", () => {
    expect(
      resumirFornecedores([
        { companyName: "A", status: "confirmado" },
        { companyName: "B", status: "finalizado" },
        { companyName: "C", status: "em_negociacao" },
      ]),
    ).toEqual({ total: 3, confirmados: 2, aguardando: 1, semStatus: 0 });
  });

  it("fornecedor SEM status conta como aguardando", () => {
    // Não saber a situação é, na operação, o mesmo que estar pendente.
    expect(resumirFornecedores([{ companyName: "A" }])).toEqual({
      total: 1,
      confirmados: 0,
      aguardando: 1,
      semStatus: 1,
    });
  });

  it("lista vazia não quebra", () => {
    expect(resumirFornecedores([])).toEqual({
      total: 0,
      confirmados: 0,
      aguardando: 0,
      semStatus: 0,
    });
  });
});

describe("resumirCompras", () => {
  it("soma apenas o que TEM preço e conta o que não tem", () => {
    const r = resumirCompras([
      { isPurchased: true, quantity: 2, unitPrice: 50 },
      { isPurchased: false, quantity: 3, unitPrice: 10 },
      { isPurchased: false },
    ]);
    expect(r.cancelados).toBe(0);
    expect(r.total).toBe(3);
    expect(r.feitos).toBe(1);
    expect(r.pendentes).toBe(2);
    expect(r.valorComPreco).toBe(130);
    expect(r.semPreco).toBe(1);
  });

  it("item com preço e SEM quantidade conta como 1 unidade — não some da soma", () => {
    expect(resumirCompras([{ isPurchased: false, unitPrice: 80 }]).valorComPreco).toBe(80);
  });

  it("item CANCELADO não conta como pendente nem como feito", () => {
    // O bug: cancelado tem `isPurchased: false`, então a contagem antiga o
    // exibia como "falta comprar" — e o painel do Dashboard, que já usava
    // `isPendingStatus`, dizia o contrário. As duas telas se contradiziam.
    const r = resumirCompras([
      { isPurchased: false, status: "cancelado" },
      { isPurchased: false, status: "cotacao" },
      { isPurchased: true, status: "recebido" },
    ]);
    expect(r.total).toBe(3);
    expect(r.pendentes).toBe(1);
    expect(r.feitos).toBe(1);
    expect(r.cancelados).toBe(1);
    // Com cancelados, total deixa de ser feitos + pendentes. É a verdade.
    expect(r.feitos + r.pendentes).not.toBe(r.total);
  });

  it("compra CANCELADA não conta como dinheiro comprometido", () => {
    const r = resumirCompras([
      { isPurchased: false, status: "cancelado", unitPrice: 5000, quantity: 1 },
      { isPurchased: false, status: "aprovado", unitPrice: 100, quantity: 2 },
    ]);
    expect(r.valorComPreco).toBe(200);
  });

  it("RECEBIDO conta como feito, não como pendente", () => {
    const r = resumirCompras([{ isPurchased: true, status: "recebido" }]);
    expect(r.feitos).toBe(1);
    expect(r.pendentes).toBe(0);
  });

  it("item ANTIGO sem status continua contado pelo booleano", () => {
    const r = resumirCompras([{ isPurchased: false }, { isPurchased: true }]);
    expect(r.pendentes).toBe(1);
    expect(r.feitos).toBe(1);
    expect(r.cancelados).toBe(0);
  });

  it("NUNCA estima preço de item sem preço", () => {
    // A tentação seria usar a média dos outros itens. Isso inventaria custo.
    const r = resumirCompras([
      { isPurchased: false, unitPrice: 100 },
      { isPurchased: false },
    ]);
    expect(r.valorComPreco).toBe(100);
    expect(r.semPreco).toBe(1);
  });
});

describe("resumirFinanceiro", () => {
  const txs = [
    { type: "income", amount: 1000, isPaid: true },
    { type: "income", amount: 500, isPaid: false },
    { type: "expense", amount: 300, isPaid: true },
    { type: "expense", amount: 200, isPaid: false },
  ];

  it("separa previsto de realizado, receita de despesa", () => {
    expect(resumirFinanceiro(txs)).toEqual({
      receitaPrevista: 1500,
      receitaRecebida: 1000,
      despesaPrevista: 500,
      despesaPaga: 300,
      lancamentos: 4,
    });
  });

  it("sem lançamentos, tudo é zero e `lancamentos` deixa isso explícito", () => {
    // A tela usa `lancamentos === 0` para dizer "nada lançado" em vez de
    // exibir R$ 0,00 como se fosse um resultado apurado.
    expect(resumirFinanceiro([])).toEqual({
      receitaPrevista: 0,
      receitaRecebida: 0,
      despesaPrevista: 0,
      despesaPaga: 0,
      lancamentos: 0,
    });
  });

  it("não calcula margem — despesa incompleta produziria número enganoso", () => {
    const r = resumirFinanceiro(txs) as Record<string, unknown>;
    expect(r.margem).toBeUndefined();
    expect(r.lucro).toBeUndefined();
    expect(r.percentualSaude).toBeUndefined();
  });
});

describe("montarProximasAcoes", () => {
  const vazio = { total: 0, feitos: 0, pendentes: 0 };

  it("usa o texto que a decoradora escreveu, com o nome do fornecedor", () => {
    const acoes = montarProximasAcoes({
      fornecedores: [{ companyName: "Flores Bela", nextAction: "Enviar modelo do arranjo" }],
      checklistPre: vazio,
      checklistPos: vazio,
      compras: vazio,
      fornecedoresResumo: { total: 1, confirmados: 1, aguardando: 0, semStatus: 0 },
    });
    expect(acoes[0]).toEqual({
      origem: "fornecedor",
      texto: "Enviar modelo do arranjo",
      referencia: "Flores Bela",
    });
  });

  it("ações escritas à mão vêm ANTES das pendências agregadas", () => {
    const acoes = montarProximasAcoes({
      fornecedores: [{ companyName: "Bolo", nextAction: "Confirmar sabor" }],
      checklistPre: { total: 5, feitos: 1, pendentes: 4 },
      checklistPos: vazio,
      compras: { total: 3, feitos: 0, pendentes: 3 },
      fornecedoresResumo: { total: 2, confirmados: 1, aguardando: 1, semStatus: 0 },
    });
    expect(acoes[0].referencia).toBe("Bolo");
    expect(acoes.map((a) => a.origem)).toEqual([
      "fornecedor",
      "fornecedor",
      "compras",
      "checklist",
    ]);
  });

  it("singular e plural corretos", () => {
    const uma = montarProximasAcoes({
      fornecedores: [],
      checklistPre: { total: 2, feitos: 1, pendentes: 1 },
      checklistPos: vazio,
      compras: vazio,
      fornecedoresResumo: { total: 0, confirmados: 0, aguardando: 0, semStatus: 0 },
    });
    expect(uma[0].texto).toBe("1 item do carregamento ainda não conferido");
  });

  it("sem pendência nenhuma, não inventa ação", () => {
    expect(
      montarProximasAcoes({
        fornecedores: [{ companyName: "A", status: "confirmado" }],
        checklistPre: { total: 3, feitos: 3, pendentes: 0 },
        checklistPos: vazio,
        compras: { total: 2, feitos: 2, pendentes: 0 },
        fornecedoresResumo: { total: 1, confirmados: 1, aguardando: 0, semStatus: 0 },
      }),
    ).toEqual([]);
  });

  it("nextAction em branco não vira ação", () => {
    expect(
      montarProximasAcoes({
        fornecedores: [{ companyName: "A", status: "confirmado", nextAction: "   " }],
        checklistPre: vazio,
        checklistPos: vazio,
        compras: vazio,
        fornecedoresResumo: { total: 1, confirmados: 1, aguardando: 0, semStatus: 0 },
      }),
    ).toEqual([]);
  });
});

describe("montarResumoOperacional", () => {
  it("evento sem nenhum dado é marcado como vazio", () => {
    const r = montarResumoOperacional({
      checklistPre: [],
      checklistPos: [],
      compras: [],
      fornecedores: [],
      equipe: [],
      carregamento: [],
      transacoes: [],
    });
    expect(r.vazio).toBe(true);
    expect(r.proximasAcoes).toEqual([]);
  });

  it("um único dado já tira o evento do estado vazio", () => {
    const r = montarResumoOperacional({
      checklistPre: [],
      checklistPos: [],
      compras: [],
      fornecedores: [],
      equipe: [{ scheduledTime: "07:00" }],
      carregamento: [],
      transacoes: [],
    });
    expect(r.vazio).toBe(false);
    expect(r.equipe).toEqual({ escalados: 1, comHorario: 1 });
  });

  it("conta a operação completa de um casamento", () => {
    const r = montarResumoOperacional({
      checklistPre: [{ isChecked: true }, { isChecked: false }, { isChecked: false }],
      checklistPos: [{ isChecked: false }],
      compras: [
        { isPurchased: true, unitPrice: 100, quantity: 2 },
        { isPurchased: false },
      ],
      fornecedores: [
        { companyName: "Flores", status: "confirmado" },
        { companyName: "Bolo", status: "cotacao", nextAction: "Pedir orçamento" },
      ],
      equipe: [{ scheduledTime: "07:00" }, { scheduledTime: "" }],
      carregamento: [
        { checkOnAssembly: true },
        { checkOnAssembly: true },
        { checkOnAssembly: false },
      ],
      transacoes: [{ type: "income", amount: 5000, isPaid: false }],
    });

    expect(r.checklistPre).toEqual({ total: 3, feitos: 1, pendentes: 2 });
    expect(r.checklistPos).toEqual({ total: 1, feitos: 0, pendentes: 1 });
    expect(r.compras.valorComPreco).toBe(200);
    expect(r.compras.semPreco).toBe(1);
    expect(r.fornecedores).toEqual({ total: 2, confirmados: 1, aguardando: 1, semStatus: 0 });
    expect(r.equipe).toEqual({ escalados: 2, comHorario: 1 });
    expect(r.carregamento).toEqual({ itens: 3, aConferir: 2 });
    expect(r.financeiro.receitaPrevista).toBe(5000);
    expect(r.financeiro.receitaRecebida).toBe(0);
    expect(r.vazio).toBe(false);
    expect(r.proximasAcoes[0].referencia).toBe("Bolo");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE CONCORDÂNCIA ENTRE AS TRÊS SUPERFÍCIES
//
// A mesma compra é contada em três lugares: o painel "Precisam da sua atenção"
// (via `isPendingStatus`), o Resumo Operacional (via `resumirCompras`) e as
// Próximas Ações (derivadas do resumo). Se discordarem, a decoradora vê o
// Dashboard dizendo que está tudo certo e a tela do evento dizendo que falta
// comprar — e para de confiar nos dois.
//
// Foi exatamente o que acontecia com CANCELADO.
// ─────────────────────────────────────────────────────────────────────────────
describe("as três superfícies concordam sobre cada situação", () => {
  const SITUACOES = [
    "necessidade", "cotacao", "aprovado", "comprado", "recebido", "cancelado",
  ] as const;

  it.each(SITUACOES)("situação %s é contada igual nos três lugares", (status) => {
    const item = { status, isPurchased: isPurchasedForStatus(status) };

    const noDashboard = isPendingStatus(status);
    const noResumo = resumirCompras([item]).pendentes > 0;
    const naProximaAcao = montarResumoOperacional({
      checklistPre: [], checklistPos: [], compras: [item],
      fornecedores: [], equipe: [], carregamento: [], transacoes: [],
    }).proximasAcoes.some((a) => a.origem === "compras");

    expect(noResumo, `resumo discorda do dashboard em "${status}"`).toBe(noDashboard);
    expect(naProximaAcao, `próxima ação discorda do dashboard em "${status}"`).toBe(noDashboard);
  });
});
