import { afterEach, describe, expect, it, vi } from "vitest";

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
import { api, internal } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import { TOTAL_DE_EVENTOS_DEMO } from "./lib/demoPortfolio";
import { dataDoDia } from "./lib/dataDoDia";

// ═════════════════════════════════════════════════════════════════════════════
// A DEMO CHEGANDO NAS TELAS
//
// ── A DIFERENÇA ENTRE ESTE ARQUIVO E `demo.coerencia.test.ts` ───────────────
// Lá se prova que o dado semeado é coerente — lendo o banco direto. Aqui se
// prova que ele ATRAVESSA as consultas que as telas realmente chamam.
//
// São coisas diferentes, e a segunda já falhou na vida real: uma varredura com
// teto, um filtro por índice ou uma ordenação podem deixar o portfólio inteiro
// de fora sem que nenhum número do banco esteja errado. No dia da live isso
// aparece como "o Dashboard abriu com um evento só" — trinta segundos antes de
// alguém perguntar por quê.
//
// Cada teste chama a MESMA função que a tela chama, com o nome dela ao lado.
// ═════════════════════════════════════════════════════════════════════════════

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

/** A conta da demonstração, logada, com a demo semeada dentro. */
async function comADemo() {
  process.env.ALTAR_DEMO = "1";
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@demo.exemplo", role: "user", subject: "auth|aurora",
  });
  const r = await t.mutation(internal.demo.seed, {});
  expect(r.criado, "o seed não rodou — o resto deste arquivo não significaria nada").toBe(true);
  return dona;
}

describe("/dashboard — a primeira tela da live", () => {
  it("conta os treze eventos, não um", async () => {
    // ── O DEFEITO QUE ISTO TRANCA ─────────────────────────────────────────
    // O bloco 1 do roteiro abre aqui e a frase é "essa é a sua empresa hoje".
    // Um Dashboard que some um evento porque a consulta tem teto ou filtro
    // desmente a frase antes de ela terminar.
    const dona = await comADemo();
    const s = await dona.query(api.dashboard.getDashboardStats, {});
    expect(s.totalEvents).toBe(TOTAL_DE_EVENTOS_DEMO);
  });

  it("tem evento futuro e evento realizado para mostrar", async () => {
    const dona = await comADemo();
    const s = await dona.query(api.dashboard.getDashboardStats, {});
    expect(s.upcomingCount, "a agenda do Dashboard abre vazia").toBeGreaterThan(0);
    expect(s.completedCount, "a empresa parece nunca ter entregado nada").toBeGreaterThan(0);
    // Quatro situações diferentes: a demo mostra uma operação viva, não uma
    // fila de eventos todos no mesmo estado.
    const comAlgum = Object.values(s.byStatus).filter((n) => n > 0).length;
    expect(comAlgum).toBeGreaterThanOrEqual(4);
  });

  it("o próximo evento existe e tem nome", async () => {
    // O cartão "próximo evento" é a primeira coisa que a plateia lê.
    const dona = await comADemo();
    const s = await dona.query(api.dashboard.getDashboardStats, {});
    expect(s.nextEvent?.name).toBeTruthy();
  });

  it("o gráfico dos meses tem mais de um mês com receita", async () => {
    // ── O DEFEITO QUE ISTO TRANCA ─────────────────────────────────────────
    // Antes do portfólio, o histórico era uma barra só. Um gráfico de seis
    // meses com uma barra é pior do que gráfico nenhum: parece defeito.
    const dona = await comADemo();
    const s = await dona.query(api.dashboard.getDashboardStats, {});
    expect(s.monthlyData.filter((m) => m.revenue > 0).length).toBeGreaterThan(1);
  });

  it("tem tarefa urgente e compra pendente para o painel de atenção", async () => {
    const dona = await comADemo();
    const s = await dona.query(api.dashboard.getDashboardStats, {});
    expect(s.pendingPurchasesCount).toBeGreaterThan(0);
    expect(s.pendingChecklistCount).toBeGreaterThan(0);
  });
});

describe("/eventos — a lista com a saúde de cada um", () => {
  it("lista os treze", async () => {
    const dona = await comADemo();
    expect(await dona.query(api.events.list, {})).toHaveLength(TOTAL_DE_EVENTOS_DEMO);
  });

  it("os cartões de saúde cobrem todos, e Marina & Gabriel está entre eles", async () => {
    const dona = await comADemo();
    const cartoes = await dona.query(api.health.listCards, {});
    expect(cartoes.length).toBe(TOTAL_DE_EVENTOS_DEMO);
    expect(cartoes.some((c) => c.name === "Marina & Gabriel")).toBe(true);
  });

  it("o filtro de próximos não devolve a lista inteira", async () => {
    // Um filtro que não filtra é pior do que filtro nenhum: a tela afirma
    // "próximos" e mostra os realizados junto.
    const dona = await comADemo();
    const todos = await dona.query(api.health.listCards, { filter: "all" });
    const proximos = await dona.query(api.health.listCards, { filter: "upcoming" });
    expect(proximos.length).toBeGreaterThan(0);
    expect(proximos.length).toBeLessThan(todos.length);
  });
});

describe("/financeiro — o bloco 5", () => {
  it("o resumo enxerga o portfólio inteiro", async () => {
    const dona = await comADemo();
    const r = await dona.query(api.financeiro.getSummary, {});
    // `totalIncome` é o que ENTROU; `pendingIncome`, o que falta entrar. São
    // perguntas diferentes e a tela mostra as duas.
    expect(r.totalIncome, "o resumo parou no evento principal").toBeGreaterThan(186_500);
    expect(r.pendingIncome, "nada a receber: o Financeiro abre sem cobrança").toBeGreaterThan(0);
    expect(r.totalExpense).toBeGreaterThan(0);
    // Seis meses de histórico com movimento em mais de um.
    expect(r.months.filter((m) => m.income > 0).length).toBeGreaterThan(1);
    expect(r.incompleto, "a demo não cabe no teto do livro").toBe(false);
  });

  it("a lista traz as duas cobranças vencidas que o roteiro conta", async () => {
    // ── POR QUE ESTE NÚMERO É COMBINADO ───────────────────────────────────
    // O painel de atenção e o Assistente precisam ter o que apontar. Duas
    // cobranças vencidas é o que o portfólio semeia de propósito, e não pode
    // virar zero por causa de um teto de leitura.
    //
    // ── POR QUE O RELÓGIO É FIXO ──────────────────────────────────────────
    // A semente mistura datas RELATIVAS (o portfólio, `emDias`) com datas
    // FIXAS (o casamento Marina & Gabriel, `lib/demoData.ts`). A "Parcela
    // final" dele vence em 2026-10-05: até esse dia o roteiro tem duas
    // vencidas; a partir de 06/10 tem três, e este teste quebrava sozinho com
    // o calendário, sem nenhuma linha de código mudar.
    //
    // O relógio fica numa data em que a semente é coerente com o roteiro. A
    // expectativa continua 2, exata. O que este teste NÃO prova é que a demo
    // esteja coerente HOJE — isso depende da data em que ela for semeada.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-01T15:00:00Z") });
    try {
      const dona = await comADemo();
      const hoje = dataDoDia();
      expect(hoje).toBe("2026-10-01");
      const { itens, temMais } = await dona.query(api.financeiro.listTransactions, {});
      expect(temMais, "a demo não cabe numa página do livro").toBe(false);
      const vencidas = itens.filter((x) => x.type === "income" && !x.isPaid && x.date < hoje);
      expect(vencidas.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("o resumo e a lista somam o MESMO conjunto", async () => {
    // Dois números da mesma tela discordando é a pergunta que trava a reunião.
    const dona = await comADemo();
    const r = await dona.query(api.financeiro.getSummary, {});
    const { itens } = await dona.query(api.financeiro.listTransactions, {});
    const soma = (tipo: "income" | "expense", pago: boolean) =>
      itens
        .filter((x) => x.type === tipo && x.isPaid === pago)
        .reduce((s, x) => s + x.amount, 0);
    expect(r.totalIncome).toBe(soma("income", true));
    expect(r.totalExpense).toBe(soma("expense", true));
    expect(r.pendingIncome).toBe(soma("income", false));
  });
});

describe("/compras — o panorama de todos os eventos", () => {
  it("o panorama atravessa os eventos, não fica num só", async () => {
    const dona = await comADemo();
    const p = await dona.query(api.purchases.listPanorama, {});
    const eventos = new Set(p.map((i) => i.eventId as string));
    expect(eventos.size, "o panorama só enxerga um evento").toBeGreaterThan(1);
  });

  it("a compra atrasada do roteiro chega na tela", async () => {
    const dona = await comADemo();
    const hoje = dataDoDia();
    const p = await dona.query(api.purchases.listPanorama, {});
    const atrasadas = p.filter(
      (i) => !i.isPurchased && i.dueDate !== undefined && i.dueDate < hoje,
    );
    expect(atrasadas.length, "Compras abre sem nenhum vermelho").toBeGreaterThan(0);
  });
});

describe("/funil — o bloco 2", () => {
  it("tem leads, e o do casal aponta para o evento", async () => {
    const dona = await comADemo();
    const leads = await dona.query(api.funil.listLeads, {});
    expect(leads.length).toBeGreaterThan(0);
    const marina = leads.find((l) => l.clientName.includes("Marina"));
    expect(marina?.stage).toBe("contracted");
    expect(marina?.convertedEventId, "o lead do casal não aponta para o evento").toBeDefined();
  });

  it("nenhum lead do portfólio virou lead solto sem dono", async () => {
    // Os doze eventos de contorno não criam lead. Se um dia criarem, o funil
    // da demonstração enche de cartão que ninguém vai abrir na live.
    const dona = await comADemo();
    const leads = await dona.query(api.funil.listLeads, {});
    expect(leads.filter((l) => l.convertedEventId !== undefined)).toHaveLength(1);
  });
});

describe("/agenda — o que acontece nos próximos dias", () => {
  it("tem operação para mostrar", async () => {
    const dona = await comADemo();
    const hoje = dataDoDia();
    const r = await dona.query(api.agenda.listarOperacoes, { de: hoje, ate: "2027-01-31" });
    expect(r.eventos.length, "a Agenda abre vazia").toBeGreaterThan(0);
  });
});

/** O evento herói, que é o único que a live abre. */
async function heroi(dona: Awaited<ReturnType<typeof comADemo>>) {
  const eventos = await dona.query(api.events.list, {});
  const m = eventos.find((e) => e.name === "Marina & Gabriel");
  expect(m, "o seed não criou Marina & Gabriel").toBeDefined();
  return m!._id;
}

describe("/eventos/:id — o bloco 3, dentro do evento", () => {
  it("o herói abre com briefing, itens de montagem e fornecedores", async () => {
    const dona = await comADemo();
    const id = await heroi(dona);

    const evento = await dona.query(api.events.get, { id });
    expect(evento?.name).toBe("Marina & Gabriel");

    const resumo = await dona.query(api.health.getEventSummary, { eventId: id });
    expect(resumo).not.toBeNull();
    expect(resumo!.checklistPre.total, "checklist vazio").toBeGreaterThan(0);
    expect(resumo!.fornecedores.total, "nenhum fornecedor no evento").toBeGreaterThan(0);
    expect(resumo!.carregamento.itens, "nenhum item de montagem").toBeGreaterThan(0);
    expect(resumo!.equipe.escalados, "escala vazia").toBeGreaterThan(0);
    expect(resumo!.equipe.comHorario, "ninguém com horário — a Agenda não agrupa").toBeGreaterThan(0);
  });

  it("o resumo tem o que fazer a seguir — a tela não abre sem direção", async () => {
    const dona = await comADemo();
    const resumo = await dona.query(api.health.getEventSummary, {
      eventId: await heroi(dona),
    });
    expect(resumo!.proximasAcoes.length).toBeGreaterThan(0);
  });
});

describe("/eventos/:id/fornecedores — o bloco 4", () => {
  it("os vínculos vêm com o nome que está no catálogo", async () => {
    // ── O DEFEITO QUE ISTO TRANCA ─────────────────────────────────────────
    // `listByEvent` cruza `eventSuppliers` com o catálogo justamente para que
    // corrigir um telefone no catálogo chegue aos eventos. Se o cruzamento
    // sumir, a tela volta a mostrar a cópia velha e nada acusa.
    const dona = await comADemo();
    const vinculos = await dona.query(api.suppliers.listByEvent, {
      eventId: await heroi(dona),
    });
    expect(vinculos.length).toBeGreaterThan(0);
    for (const v of vinculos) {
      expect(v.companyName, "fornecedor sem nome na tela").toBeTruthy();
    }
  });

  it("os fornecedores estão em estágios DIFERENTES", async () => {
    // Todos no mesmo estágio faz o dossiê parecer uma lista, e o bloco 4
    // existe para mostrar que cada contratação tem um estado próprio.
    const dona = await comADemo();
    const vinculos = await dona.query(api.suppliers.listByEvent, {
      eventId: await heroi(dona),
    });
    expect(new Set(vinculos.map((v) => v.status)).size).toBeGreaterThanOrEqual(3);
  });
});

describe("/propostas/:id — o bloco 2", () => {
  it("o evento tem a proposta aceita que o originou", async () => {
    const dona = await comADemo();
    const propostas = await dona.query(api.propostas.doEvento, {
      eventId: await heroi(dona),
    });
    expect(propostas.length).toBe(1);
    expect(propostas[0].status).toBe("aceita");
  });

  it("a proposta abre inteira e soma o mesmo que o evento", async () => {
    // ── OS NÚMEROS CONVERSAM, TAMBÉM AQUI ─────────────────────────────────
    // O contrato é UM número e aparece no evento, no orçamento, no funil e na
    // proposta. Divergir na proposta é o pior lugar: é o documento que a
    // cliente assinou.
    const dona = await comADemo();
    const id = await heroi(dona);
    const evento = await dona.query(api.events.get, { id });
    const [resumo] = await dona.query(api.propostas.doEvento, { eventId: id });

    const proposta = await dona.query(api.propostas.get, { id: resumo._id });
    expect(proposta).not.toBeNull();
    const investimento = proposta!.itens.reduce((s, i) => s + i.valor, 0);
    expect(investimento).toBe(evento!.budget);
  });
});

describe("as duas telas de FOTO dependem do passo manual, e o produto sabe disso", () => {
  it("recém-semeado, o herói NÃO está apresentável", async () => {
    // ── POR QUE ISTO É UM TESTE, E NÃO UM AVISO NO DOCUMENTO ──────────────
    // O roteiro manda: "se houver qualquer ✕ em fotos ou capa, o bloco 6 não
    // deve ser apresentado". Nada conferia que esse aviso continuava
    // verdadeiro. Se um dia o seed passar a criar imagem, ou se a regra de
    // prontidão afrouxar, o aviso vira mentira — e o bloco 6 é o clímax.
    const dona = await comADemo();
    const p = await dona.query(api.health.getEventReadiness, {
      eventId: await heroi(dona),
    });
    expect(p).not.toBeNull();
    expect(p!.apresentavel, "o seed passou a criar foto? o roteiro precisa saber").toBe(false);
    expect(p!.faltando).toBeGreaterThan(0);
  });

  it("e a prontidão NOMEIA capa e fotos entre o que falta", async () => {
    // Um "não está pronto" sem dizer o que falta manda a pessoa procurar. Esta
    // consulta existe justamente para responder com número, não com promessa.
    const dona = await comADemo();
    const p = await dona.query(api.health.getEventReadiness, {
      eventId: await heroi(dona),
    });
    const faltando = p!.itens.filter((i) => i.situacao === "faltando").map((i) => i.chave);
    expect(faltando, "a capa deixou de ser cobrada").toContain("capa");
    expect(
      faltando.some((c) => c.includes("foto")),
      `nada sobre foto entre os faltantes: ${faltando.join(", ")}`,
    ).toBe(true);
  });
});

describe("a demo é de UMA conta", () => {
  it("outra pessoa logada não enxerga nada da demonstração", async () => {
    // ── O DEFEITO QUE ISTO TRANCA ─────────────────────────────────────────
    // Estes testes todos rodam com uma conta só, então um vazamento de
    // isolamento passaria despercebido justamente no arquivo que mais lê
    // consulta de tela.
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await autenticarComo(t, {
      nome: "Aurora", email: "aurora@demo.exemplo", role: "user", subject: "auth|aurora",
    });
    await t.mutation(internal.demo.seed, {});

    const outra = await autenticarComo(t, {
      nome: "Rival", email: "rival@exemplo.com", role: "user", subject: "auth|rival",
    });
    expect(await outra.query(api.events.list, {})).toEqual([]);
    expect((await outra.query(api.dashboard.getDashboardStats, {})).totalEvents).toBe(0);
    expect((await outra.query(api.financeiro.getSummary, {})).totalIncome).toBe(0);
  });
});
