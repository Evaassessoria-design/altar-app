import { describe, expect, it, vi } from "vitest";

// Mesma substituição de sessão dos demais testes de banco — ver test.auth.ts.
vi.mock("./auth", () => {
  const usuarioDaSessao = async (ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string; email?: string } | null> };
  }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { _id: identity.subject, email: identity.email ?? "", name: "Pessoa" };
  };
  return {
    authComponent: {
      safeGetAuthUser: usuarioDaSessao,
      getAuthUser: usuarioDaSessao,
      registerRoutes: () => {},
      adapter: () => ({}),
    },
    createAuth: () => ({}),
  };
});

import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import { dinheiroVencido } from "./lib/dinheiroVencido";
import { dataDoDia } from "./lib/dataDoDia";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// O FINANCEIRO RECUSA O QUE ESTRAGARIA TODAS AS CONTAS
//
// `addTransaction` recebia `v.number()` e gravava. A tela mandava
// `parseFloat(campo)` — e `parseFloat` devolve `NaN` para qualquer coisa que
// não comece com número. Uma linha com `NaN` não estraga a própria linha:
// estraga receita, despesa, lucro e previsão, todas, para sempre.
//
// Valor negativo é o mesmo problema mais calado: uma "receita" de -500 abaixa
// o total e a soma continua parecendo legítima. O sinal já vem do TIPO.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona",
  });
  const eventId = await t.run(async (ctx: MutationCtx) => {
    const donaId = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona"))
      .unique())!._id;
    return ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-12-12",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });
  });
  return { t, dona, eventId };
}

const lancamento = {
  type: "income" as const,
  category: "Honorários",
  description: "Sinal do contrato",
  date: "2026-09-10",
  isPaid: true,
};

describe("o que o servidor recusa gravar", () => {
  it("NaN não entra", async () => {
    const { dona } = await cenario();
    await expect(
      dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: NaN }),
    ).rejects.toThrow(/valor em reais/i);
  });

  it("infinito não entra", async () => {
    const { dona } = await cenario();
    await expect(
      dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: Infinity }),
    ).rejects.toThrow();
  });

  it("negativo é recusado com o caminho certo no recado", async () => {
    const { dona } = await cenario();
    await expect(
      dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: -500 }),
    ).rejects.toThrow(/Despesa/);
  });

  it("valor com um zero a mais é recusado", async () => {
    const { dona } = await cenario();
    await expect(
      dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 9e12 }),
    ).rejects.toThrow(/zero a mais/i);
  });

  it("editar também confere — a porta dos fundos", async () => {
    const { t, dona } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, amount: 1500,
    });
    await expect(
      dona.mutation(api.financeiro.updateTransaction, { id, amount: NaN }),
    ).rejects.toThrow();
    const tx = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(tx!.amount).toBe(1500);
  });

  it("as parcelas do contrato são conferidas ANTES de gravar a primeira", async () => {
    // Metade criada e metade recusada deixaria o evento num estado que ninguém
    // pediu — e a dedup impediria a segunda tentativa de consertar.
    const { t, dona, eventId } = await cenario();
    await expect(
      dona.mutation(api.financeiro.createReceivablesFromContract, {
        eventId,
        entries: [
          { description: "Sinal", amount: 5000, date: "2026-09-10" },
          { description: "Saldo", amount: NaN, date: "2026-11-10" },
        ],
      }),
    ).rejects.toThrow();
    const todas = await t.run(async (ctx: MutationCtx) =>
      ctx.db.query("transactions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    );
    expect(todas).toHaveLength(0);
  });
});

describe("o que ele aceita, e como grava", () => {
  it("zero passa — cortesia lançada é lançamento", async () => {
    const { t, dona } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 0 });
    const tx = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(tx!.amount).toBe(0);
  });

  it("a terceira casa é arredondada ao centavo, não recusada", async () => {
    // Um contrato dividido em três dá 1/3 do valor.
    const { t, dona } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, amount: 5000 / 3,
    });
    const tx = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(tx!.amount).toBe(1666.67);
  });
});

describe("as somas da tela", () => {
  it("cem lançamentos de dez centavos dão dez reais exatos", async () => {
    const { dona } = await cenario();
    for (let i = 0; i < 100; i++) {
      await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 0.1 });
    }
    const resumo = await dona.query(api.financeiro.getSummary, {});
    expect(resumo.totalIncome).toBe(10);
  });

  it("um NaN gravado ANTES da trava não zera a tela inteira", async () => {
    // A proteção de trás. Quem já tem a linha podre precisa continuar vendo o
    // total do resto — e conseguir encontrar a linha para apagá-la.
    const { t, dona } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 1500 });
    await t.run(async (ctx: MutationCtx) => {
      const donaId = (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona"))
        .unique())!._id;
      await ctx.db.insert("transactions", {
        userId: donaId, type: "income", category: "Honorários",
        description: "Linha podre", amount: NaN, date: "2026-09-11", isPaid: true,
      });
    });
    const resumo = await dona.query(api.financeiro.getSummary, {});
    expect(resumo.totalIncome).toBe(1500);
    expect(Number.isNaN(resumo.profit)).toBe(false);
  });

  it("o lucro é receita menos despesa, ao centavo", async () => {
    const { dona } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 0.3 });
    await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, type: "expense", category: "Flores", amount: 0.1,
    });
    const resumo = await dona.query(api.financeiro.getSummary, {});
    expect(resumo.profit).toBe(0.2);
  });

  it("o financeiro de uma empresa não enxerga o da outra", async () => {
    const { t, dona } = await cenario();
    const outra = await autenticarComo(t, {
      nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
    });
    await dona.mutation(api.financeiro.addTransaction, { ...lancamento, amount: 1500 });
    const resumo = await outra.query(api.financeiro.getSummary, {});
    expect(resumo.totalIncome).toBe(0);
    expect((await outra.query(api.financeiro.listTransactions, {})).itens).toHaveLength(0);
  });
});

// ═══════════════════════════════ A MESMA TRAVA NAS OUTRAS PORTAS DO DINHEIRO

describe("o orçamento do evento, a compra e o item de orçamento", () => {
  it("compra com preço NaN é recusada", async () => {
    // `unitPrice * quantity` da compra alimenta o custo do evento e a margem.
    const { dona, eventId } = await cenario();
    await expect(
      dona.mutation(api.purchases.addPurchase, {
        eventId, name: "Rosa branca", unitPrice: NaN, quantity: 200,
      }),
    ).rejects.toThrow(/Preço unitário/);
  });

  it("compra com quantidade negativa é recusada", async () => {
    const { dona, eventId } = await cenario();
    await expect(
      dona.mutation(api.purchases.addPurchase, {
        eventId, name: "Rosa branca", unitPrice: 4.2, quantity: -10,
      }),
    ).rejects.toThrow(/Quantidade/);
  });

  it("editar a compra confere também", async () => {
    const { dona, eventId } = await cenario();
    const id = await dona.mutation(api.purchases.addPurchase, {
      eventId, name: "Rosa branca", unitPrice: 4.2, quantity: 200,
    });
    await expect(
      dona.mutation(api.purchases.updatePurchase, { id, unitPrice: NaN }),
    ).rejects.toThrow();
  });

  it("apagar o preço continua possível — `null` é limpar, não um valor ruim", async () => {
    // A trava não pode atrapalhar a limpeza: o formulário de edição é
    // substituição, e campo esvaziado tem de sumir.
    const { t, dona, eventId } = await cenario();
    const id = await dona.mutation(api.purchases.addPurchase, {
      eventId, name: "Rosa branca", unitPrice: 4.2, quantity: 200,
    });
    await dona.mutation(api.purchases.updatePurchase, { id, unitPrice: null });
    const item = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(item!.unitPrice).toBeUndefined();
  });

  it("item de orçamento com valor unitário NaN é recusado", async () => {
    const { dona, eventId } = await cenario();
    await expect(
      dona.mutation(api.orcamento.addItem, {
        eventId, description: "Decoração da cerimônia", category: "Flores",
        quantity: 1, unitPrice: NaN, type: "income",
      }),
    ).rejects.toThrow(/Valor unitário/);
  });

  it("evento com orçamento NaN é recusado na criação", async () => {
    const { dona } = await cenario();
    await expect(
      dona.mutation(api.events.create, {
        name: "Novo", type: "wedding", date: "2027-01-10",
        location: "L", clientName: "C", status: "planning", budget: NaN,
      }),
    ).rejects.toThrow(/Orçamento/);
  });

  it("evento sem orçamento continua podendo ser criado", async () => {
    // A trava vale para o valor ruim, não para a ausência: orçamento é campo
    // opcional e a maior parte dos eventos nasce sem ele.
    const { dona } = await cenario();
    const id = await dona.mutation(api.events.create, {
      name: "Sem orçamento", type: "wedding", date: "2027-01-10",
      location: "L", clientName: "C", status: "planning",
    });
    expect(id).toBeTruthy();
  });

  it("o resumo do orçamento resiste a um item podre gravado antes", async () => {
    const { t, dona, eventId } = await cenario();
    await dona.mutation(api.orcamento.addItem, {
      eventId, description: "Decoração", category: "Flores",
      quantity: 1, unitPrice: 10000, type: "income",
    });
    await t.run(async (ctx: MutationCtx) => {
      const donaId = (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona"))
        .unique())!._id;
      await ctx.db.insert("budgetItems", {
        userId: donaId, eventId, description: "Linha podre", category: "Flores",
        quantity: 1, unitPrice: NaN, type: "income", order: 99,
      });
    });
    const resumo = await dona.query(api.orcamento.getSummary, { eventId });
    expect(resumo.quotedIncome).toBe(10000);
  });
});

// ═════════════════════════════════════ ID DE OUTRA EMPRESA NÃO MOVE DINHEIRO

describe("o lançamento de outra empresa é intocável", () => {
  async function comDuas() {
    const { t, dona, eventId } = await cenario();
    const outra = await autenticarComo(t, {
      nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
    });
    const id = await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, amount: 1500,
    });
    return { t, dona, outra, eventId, id };
  }

  it("editar responde NOT_FOUND e não muda o valor", async () => {
    const { t, outra, id } = await comDuas();
    await expect(
      outra.mutation(api.financeiro.updateTransaction, { id, amount: 1 }),
    ).rejects.toThrow(/não encontrado/i);
    const tx = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(tx!.amount).toBe(1500);
  });

  it("marcar como pago responde NOT_FOUND", async () => {
    const { t, outra, id } = await comDuas();
    await expect(
      outra.mutation(api.financeiro.togglePaid, { id }),
    ).rejects.toThrow(/não encontrado/i);
    const tx = await t.run(async (ctx: MutationCtx) => ctx.db.get(id));
    expect(tx!.isPaid).toBe(true);
  });

  it("apagar responde NOT_FOUND e o lançamento continua lá", async () => {
    const { t, outra, id } = await comDuas();
    await expect(
      outra.mutation(api.financeiro.deleteTransaction, { id }),
    ).rejects.toThrow(/não encontrado/i);
    expect(await t.run(async (ctx: MutationCtx) => ctx.db.get(id))).not.toBeNull();
  });

  it("criar lançamento no evento de outra empresa responde NOT_FOUND", async () => {
    // O caminho pelo `eventId`: `requireEventOwner` é quem barra.
    const { outra, eventId } = await comDuas();
    await expect(
      outra.mutation(api.financeiro.addTransaction, {
        ...lancamento, amount: 100, eventId,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("contas a receber no evento de outra empresa responde NOT_FOUND", async () => {
    const { outra, eventId } = await comDuas();
    await expect(
      outra.mutation(api.financeiro.createReceivablesFromContract, {
        eventId,
        entries: [{ description: "Sinal", amount: 5000, date: "2026-09-10" }],
      }),
    ).rejects.toThrow(/não encontrado/i);
  });
});

// ═════════════════════════════════ O QUE VENCEU E NÃO FOI LIQUIDADO

describe("os vencidos do painel da manhã", () => {
  it("só enxerga o que é da própria empresa", async () => {
    const { t, dona } = await cenario();
    const outra = await autenticarComo(t, {
      nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
    });
    await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, amount: 43_500, isPaid: false, date: "2020-01-10",
    });
    expect((await dona.query(api.financeiro.getVencidos, {})).aReceber.quantidade).toBe(1);
    expect((await outra.query(api.financeiro.getVencidos, {})).temAlgo).toBe(false);
  });

  it("marcar como recebido tira do painel", async () => {
    const { dona } = await cenario();
    const id = await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, amount: 43_500, isPaid: false, date: "2020-01-10",
    });
    expect((await dona.query(api.financeiro.getVencidos, {})).temAlgo).toBe(true);
    await dona.mutation(api.financeiro.togglePaid, { id });
    expect((await dona.query(api.financeiro.getVencidos, {})).temAlgo).toBe(false);
  });

  it("lançamento futuro não aparece como vencido", async () => {
    // Data bem à frente para o teste não virar bomba-relógio quando o
    // calendário passar por ela.
    const { dona } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, amount: 1_000, isPaid: false, date: "2099-12-31",
    });
    expect((await dona.query(api.financeiro.getVencidos, {})).temAlgo).toBe(false);
  });

  it("separa o que ela recebe do que ela paga", async () => {
    const { dona } = await cenario();
    await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, amount: 43_500, isPaid: false, date: "2020-01-10",
    });
    await dona.mutation(api.financeiro.addTransaction, {
      ...lancamento, type: "expense", category: "Flores",
      amount: 17_000, isPaid: false, date: "2020-01-05",
    });
    const r = await dona.query(api.financeiro.getVencidos, {});
    expect(r.aReceber).toEqual({ quantidade: 1, total: 43_500 });
    expect(r.aPagar).toEqual({ quantidade: 1, total: 17_000 });
  });

  it("sem sessão não responde nada", async () => {
    const { t } = await cenario();
    await expect(t.query(api.financeiro.getVencidos, {})).rejects.toThrow();
  });

  it("a consulta estreita no banco e a regra pura confere de novo", async () => {
    // O índice lê só o que está em aberto e com data no passado. A regra em
    // `lib/dinheiroVencido.ts` refiltra o que recebe — é ela a fonte da
    // verdade, e a consulta pode estreitar sem virar uma segunda regra.
    //
    // Este teste existe para o dia em que alguém mudar o índice: o resultado
    // tem de continuar igual ao de filtrar tudo em memória.
    const { t, dona } = await cenario();
    for (const [amount, isPaid, date] of [
      [43_500, false, "2020-01-10"],
      [1_000, true, "2020-01-11"],
      [2_000, false, "2099-12-31"],
    ] as const) {
      await dona.mutation(api.financeiro.addTransaction, {
        ...lancamento, amount, isPaid, date,
      });
    }
    const pelaConsulta = await dona.query(api.financeiro.getVencidos, {});

    const todas = await t.run(async (ctx: MutationCtx) =>
      ctx.db.query("transactions").collect(),
    );
    const naMemoria = dinheiroVencido(todas, dataDoDia());
    expect(pelaConsulta).toEqual(naMemoria);
  });
});
