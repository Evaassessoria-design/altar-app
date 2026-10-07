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
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// PENDÊNCIAS ANTES DA LIVE (08/10)
//
//  1. Excluir evento não apaga histórico de recebimentos nem esconde peças do
//     acervo que não voltaram (ou voltaram e não foram conferidas).
//  2. "Receita do Mês" = o dinheiro que entrou no mês, e o destino do card
//     (`financeiro.recebidoNoMes`) fecha com ela.
//  3. O Assistente só EXECUTA para conta com acesso ativo — como já só
//     aceitava pedidos de conta com acesso ativo.
// ═════════════════════════════════════════════════════════════════════════════

afterEach(() => {
  vi.useRealTimers();
});

async function cenario(agoraISO = "2026-10-15T15:00:00Z") {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(agoraISO) });
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora" });
  const rival = await autenticarComo(t, { nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival" });
  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (s: string) =>
      (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", s)).unique())!._id;
    const donaId = await idDe("auth|aurora");
    const rivalId = await idDe("auth|rival");
    const evento = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-11-20",
      location: "Fazenda", clientName: "Marina", status: "planning",
    });
    return { donaId, rivalId, evento };
  });
  return { t, dona, rival, ids };
}

const recebimento = (valor: number, data: string, extra: Record<string, unknown> = {}) => ({
  id: `r-${valor}-${data}`, valor, data, registradoEm: `${data}T12:00:00Z`, chave: `k-${valor}-${data}`, ...extra,
});

// ─── 1. Exclusão de evento ──────────────────────────────────────────────────

describe("excluir evento não apaga histórico nem esconde peças", () => {
  async function peca(c: Awaited<ReturnType<typeof cenario>>, mov: Record<string, number>) {
    return c.t.run(async (ctx: MutationCtx) => {
      const item = await ctx.db.insert("collectionItems", {
        userId: c.ids.donaId, nome: "Arco de flores", searchName: "arco de flores", unidade: "un", quantidadeTotal: 4,
      } as never);
      await ctx.db.insert("collectionReservations", {
        userId: c.ids.donaId, collectionItemId: item, eventId: c.ids.evento, quantidade: 2,
        inicio: "2026-11-19", fim: "2026-11-21", origem: "manual", ...mov,
      } as never);
      return item;
    });
  }
  const contar = (c: Awaited<ReturnType<typeof cenario>>) =>
    c.t.run(async (ctx: MutationCtx) => ({
      evento: (await ctx.db.get(c.ids.evento)) !== null,
      parcelas: (await ctx.db.query("transactions").withIndex("by_event", (q) => q.eq("eventId", c.ids.evento)).collect()).length,
      reservas: (await ctx.db.query("collectionReservations").withIndex("by_event", (q) => q.eq("eventId", c.ids.evento)).collect()).length,
    }));

  it("recusa com recebimento ANULADO — e nada é apagado", async () => {
    const c = await cenario();
    await c.t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("transactions", {
        userId: c.ids.donaId, eventId: c.ids.evento, type: "income", category: "Contrato", description: "Sinal",
        amount: 1000, date: "2026-10-10", isPaid: false,
        recebimentos: [recebimento(1000, "2026-10-10", { anulacao: { em: "2026-10-11", motivo: "errado" } })],
      });
    });
    await expect(c.dona.mutation(api.events.remove, { id: c.ids.evento })).rejects.toThrow(/recebimentos registrados[\s\S]*nem o dos anulados[\s\S]*Cancelado/);
    expect(await contar(c)).toEqual({ evento: true, parcelas: 1, reservas: 0 });
  });

  it("recusa com peça que saiu e não voltou", async () => {
    const c = await cenario();
    await peca(c, { saiu: 2, voltou: 1 });
    await expect(c.dona.mutation(api.events.remove, { id: c.ids.evento })).rejects.toThrow(/1× Arco de flores[\s\S]*Registre o retorno/);
    expect((await contar(c)).reservas).toBe(1);
  });

  it("recusa com peça que voltou e ainda não foi conferida", async () => {
    const c = await cenario();
    await peca(c, { saiu: 2, voltou: 2, retornoAConferir: 2 });
    await expect(c.dona.mutation(api.events.remove, { id: c.ids.evento })).rejects.toThrow(/conferência/);
  });

  it("libera quando o retorno foi conferido, e sem recebimentos", async () => {
    const c = await cenario();
    await peca(c, { saiu: 2, voltou: 2, retornoAConferir: 2, conferidoEm: Date.now() });
    await c.t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("transactions", {
        userId: c.ids.donaId, eventId: c.ids.evento, type: "income", category: "Contrato", description: "Parcela sem pagamento",
        amount: 500, date: "2026-11-01", isPaid: false,
      });
    });
    expect(await c.dona.query(api.events.impedimentosDeExclusao, { id: c.ids.evento })).toEqual([]);
    await c.dona.mutation(api.events.remove, { id: c.ids.evento });
    expect(await contar(c)).toEqual({ evento: false, parcelas: 0, reservas: 0 });
  });

  it("a tela recebe o impedimento ANTES do clique; outra conta não lê nada nem exclui", async () => {
    const c = await cenario();
    await peca(c, { saiu: 2 });
    const frases = await c.dona.query(api.events.impedimentosDeExclusao, { id: c.ids.evento });
    expect(frases).toHaveLength(1);
    expect(frases![0]).toContain("2× Arco de flores");
    expect(await c.rival.query(api.events.impedimentosDeExclusao, { id: c.ids.evento })).toBeNull();
    await expect(c.rival.mutation(api.events.remove, { id: c.ids.evento })).rejects.toThrow(/não encontrado/i);
    expect((await contar(c)).evento).toBe(true);
  });
});

// ─── 2. Receita do Mês ──────────────────────────────────────────────────────

describe("Receita do Mês é o dinheiro que entrou no mês", () => {
  async function semear(c: Awaited<ReturnType<typeof cenario>>) {
    await c.t.run(async (ctx: MutationCtx) => {
      const base = { userId: c.ids.donaId, type: "income" as const, category: "Contrato" };
      // Parcial em outubro numa parcela que VENCE em novembro: conta R$ 1.200.
      await ctx.db.insert("transactions", {
        ...base, eventId: c.ids.evento, description: "Parcela 2/3", amount: 3000, date: "2026-11-10", isPaid: false,
        recebimentos: [recebimento(1200, "2026-10-03")],
      });
      // Quitada por dois recebimentos (set + out): conta só o de outubro, uma vez.
      await ctx.db.insert("transactions", {
        ...base, eventId: c.ids.evento, description: "Parcela 1/3", amount: 1000, date: "2026-10-01", isPaid: true,
        paidAt: "2026-10-02", recebimentos: [recebimento(400, "2026-09-28"), recebimento(600, "2026-10-02")],
      });
      // Anulado em outubro: não conta.
      await ctx.db.insert("transactions", {
        ...base, eventId: c.ids.evento, description: "Parcela 3/3", amount: 500, date: "2026-10-20", isPaid: false,
        recebimentos: [recebimento(500, "2026-10-05", { anulacao: { em: "2026-10-06", motivo: "duplicado" } })],
      });
      // Antigos, sem histórico: pela data do pagamento; sem ela, pelo vencimento.
      await ctx.db.insert("transactions", { ...base, description: "Antiga paga em outubro", amount: 250, date: "2026-09-15", isPaid: true, paidAt: "2026-10-09" });
      await ctx.db.insert("transactions", { ...base, description: "Antiga sem data de pagamento", amount: 100, date: "2026-10-12", isPaid: true });
      await ctx.db.insert("transactions", { ...base, description: "Antiga paga em setembro", amount: 999, date: "2026-10-01", isPaid: true, paidAt: "2026-09-30" });
      // Pendente sem nada recebido e despesa: não contam.
      await ctx.db.insert("transactions", { ...base, description: "Pendente", amount: 777, date: "2026-10-15", isPaid: false });
      await ctx.db.insert("transactions", { userId: c.ids.donaId, type: "expense", category: "Flores", description: "Despesa", amount: 50, date: "2026-10-04", isPaid: true });
    });
  }

  it("parciais pela data, anulados fora, quitada sem contar duas vezes, antigos por regra explícita", async () => {
    const c = await cenario();
    await semear(c);
    const painel = await c.dona.query(api.dashboard.getDashboardStats, {});
    // 1200 + 600 + 250 + 100
    expect(painel.revenueThisMonth).toBe(2150);
    expect(painel.expensesThisMonth).toBe(50);

    const destino = await c.dona.query(api.financeiro.recebidoNoMes, { mes: painel.mesDaReceita });
    expect(destino!.totalCentavos).toBe(215000);
    expect(destino!.entradas.map((e) => [e.descricao, e.data, e.origem])).toEqual([
      ["Antiga sem data de pagamento", "2026-10-12", "baixa_sem_historico"],
      ["Antiga paga em outubro", "2026-10-09", "baixa_sem_historico"],
      ["Parcela 1/3", "2026-10-02", "recebimento"],
      ["Parcela 2/3", "2026-10-03", "recebimento"],
    ].sort((a, b) => b[1].localeCompare(a[1])));
  });

  it("o gráfico do Financeiro diz o mesmo número para o mês", async () => {
    const c = await cenario();
    await semear(c);
    const resumo = await c.dona.query(api.financeiro.getSummary, {});
    expect(resumo.months[resumo.months.length - 1].income).toBe(2150);
    // setembro: o recebimento de 400 e a antiga paga em 30/09
    expect(resumo.months[resumo.months.length - 2].income).toBe(1399);
  });

  it("vira o mês no fuso do negócio: 31/10 às 23h30 em São Paulo ainda é outubro", async () => {
    const c = await cenario("2026-11-01T02:30:00Z");
    await semear(c);
    const painel = await c.dona.query(api.dashboard.getDashboardStats, {});
    expect(painel.mesDaReceita).toBe("2026-10");
    expect(painel.revenueThisMonth).toBe(2150);
  });

  it("outra conta não vê as entradas; mês inválido não vira recorte", async () => {
    const c = await cenario();
    await semear(c);
    expect((await c.rival.query(api.financeiro.recebidoNoMes, { mes: "2026-10" }))!.entradas).toEqual([]);
    expect(await c.dona.query(api.financeiro.recebidoNoMes, { mes: "2026-13" })).toBeNull();
  });
});

// ─── 3. Assistente ──────────────────────────────────────────────────────────

describe("o Assistente só executa para conta com acesso ativo", () => {
  async function tarefaNaFila(c: Awaited<ReturnType<typeof cenario>>, userId: Id<"users">) {
    return c.t.run((ctx: MutationCtx) =>
      ctx.db.insert("assistantTasks", {
        userId, pedido: "Quanto tenho a receber?", agenteId: "gestao", roteadoAutomaticamente: true,
        status: "queued", cor: "verde", criadoEm: Date.now(),
      } as never),
    );
  }

  it("conta bloqueada não executa — e o pedido fica na fila, intacto", async () => {
    const c = await cenario();
    const taskId = await tarefaNaFila(c, c.ids.donaId);
    await c.t.run((ctx: MutationCtx) => ctx.db.patch(c.ids.donaId, { subscriptionStatus: "cancelled" }));
    await expect(c.dona.action(api.assistenteExecutor.executar, { taskId })).rejects.toThrow(/SUBSCRIPTION_REQUIRED|assin|cancelad/i);
    const t = await c.t.run((ctx: MutationCtx) => ctx.db.get(taskId));
    expect(t!.status).toBe("queued");
  });

  it("tarefa de outra conta continua 'não encontrado' — antes de qualquer pergunta sobre acesso", async () => {
    const c = await cenario();
    const taskId = await tarefaNaFila(c, c.ids.donaId);
    await c.t.run((ctx: MutationCtx) => ctx.db.patch(c.ids.rivalId, { subscriptionStatus: "cancelled" }));
    await expect(c.rival.action(api.assistenteExecutor.executar, { taskId })).rejects.toThrow(/não encontrado/i);
  });
});
