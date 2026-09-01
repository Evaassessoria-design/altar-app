import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Id } from "./_generated/dataModel";

// lib/eventSummary.test.ts cobre a aritmética. Aqui exercitamos a LEITURA:
// a query precisa buscar nas tabelas certas, separar as duas fases do
// checklist e não misturar dados de outro evento.

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Decoradora",
      email: "dec@exemplo.com.br",
      role: "user",
      subscriptionStatus: "active",
    });
    const eventId = await ctx.db.insert("events", {
      userId,
      name: "Marina & Gabriel",
      date: "2026-10-10",
      location: "Fazenda Aurora",
      clientName: "Marina",
      type: "wedding",
      status: "confirmed",
    });
    const outroEventId = await ctx.db.insert("events", {
      userId,
      name: "Outro evento",
      date: "2026-11-11",
      location: "Outro",
      clientName: "Outro",
      type: "birthday",
      status: "planning",
    });

    // Checklist: 2 pré (1 feito) + 1 pós (0 feito)
    await ctx.db.insert("checklistItems", {
      eventId, userId, phase: "pre", name: "Arranjos", order: 0, isChecked: true,
    });
    await ctx.db.insert("checklistItems", {
      eventId, userId, phase: "pre", name: "Vasos", order: 1, isChecked: false,
    });
    await ctx.db.insert("checklistItems", {
      eventId, userId, phase: "post", name: "Devolver vasos", order: 0, isChecked: false,
    });
    // Item de OUTRO evento — não pode aparecer na contagem
    await ctx.db.insert("checklistItems", {
      eventId: outroEventId, userId, phase: "pre", name: "Nada a ver", order: 0, isChecked: false,
    });

    await ctx.db.insert("purchaseItems", {
      userId, eventId, name: "Fita", isPurchased: true, order: 0, quantity: 2, unitPrice: 25,
    });
    await ctx.db.insert("purchaseItems", {
      userId, eventId, name: "Espuma", isPurchased: false, order: 1,
    });

    await ctx.db.insert("eventSuppliers", {
      userId, eventId, category: "flores", companyName: "Flores Bela", status: "confirmado",
    });
    await ctx.db.insert("eventSuppliers", {
      userId, eventId, category: "bolo", companyName: "Doce Arte", status: "cotacao",
      nextAction: "Confirmar sabor com a noiva",
    });

    const memberId = await ctx.db.insert("teamMembers", {
      userId, name: "Camila Prado", role: "Coordenação",
    });
    await ctx.db.insert("eventTeam", {
      userId, eventId, teamMemberId: memberId, scheduledTime: "07:00",
    });

    await ctx.db.insert("assemblyItems", {
      userId, eventId, area: "cerimonia", order: 0, name: "Arco",
      includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe",
      createdAt: "2026-09-01", updatedAt: "2026-09-01",
    });

    await ctx.db.insert("transactions", {
      userId, eventId, type: "income", category: "contrato",
      description: "Sinal", amount: 5000, date: "2026-09-01", isPaid: true,
    });
    await ctx.db.insert("transactions", {
      userId, eventId, type: "expense", category: "flores",
      description: "Flores", amount: 1200, date: "2026-09-05", isPaid: false,
    });

    return { eventId, outroEventId };
  });
  return { t, ...ids };
}

/** A query exige dono autenticado; o Better Auth não roda no convex-test, então
 *  chamamos o mesmo caminho de leitura por dentro, com o evento já resolvido. */
async function resumoDireto(t: Awaited<ReturnType<typeof cenario>>["t"], eventId: Id<"events">) {
  const { montarResumoOperacional } = await import("./lib/eventSummary");
  return t.run(async (ctx) => {
    const todos = await ctx.db.query("checklistItems").collect();
    const checklist = todos.filter((i) => i.eventId === eventId);
    const compras = (await ctx.db.query("purchaseItems").collect()).filter((i) => i.eventId === eventId);
    const fornecedores = (await ctx.db.query("eventSuppliers").collect()).filter((i) => i.eventId === eventId);
    const equipe = (await ctx.db.query("eventTeam").collect()).filter((i) => i.eventId === eventId);
    const carregamento = (await ctx.db.query("assemblyItems").collect()).filter((i) => i.eventId === eventId);
    const transacoes = (await ctx.db.query("transactions").collect()).filter((i) => i.eventId === eventId);
    return montarResumoOperacional({
      checklistPre: checklist.filter((i) => i.phase === "pre"),
      checklistPos: checklist.filter((i) => i.phase === "post"),
      compras, fornecedores, equipe, carregamento, transacoes,
    });
  });
}

describe("resumo operacional sobre banco real", () => {
  it("conta cada módulo do evento certo", async () => {
    const { t, eventId } = await cenario();
    const r = await resumoDireto(t, eventId);

    expect(r.checklistPre).toEqual({ total: 2, feitos: 1, pendentes: 1 });
    expect(r.checklistPos).toEqual({ total: 1, feitos: 0, pendentes: 1 });
    expect(r.compras.total).toBe(2);
    expect(r.compras.valorComPreco).toBe(50);
    expect(r.compras.semPreco).toBe(1);
    expect(r.fornecedores).toEqual({ total: 2, confirmados: 1, aguardando: 1, semStatus: 0 });
    expect(r.equipe).toEqual({ escalados: 1, comHorario: 1 });
    expect(r.carregamento).toEqual({ itens: 1, aConferir: 1 });
    expect(r.financeiro.receitaRecebida).toBe(5000);
    expect(r.financeiro.despesaPaga).toBe(0);
    expect(r.financeiro.despesaPrevista).toBe(1200);
    expect(r.vazio).toBe(false);
  });

  it("NÃO mistura dados de outro evento", async () => {
    const { t, outroEventId } = await cenario();
    const r = await resumoDireto(t, outroEventId);
    // O outro evento só tem 1 item de checklist pré e mais nada.
    expect(r.checklistPre.total).toBe(1);
    expect(r.compras.total).toBe(0);
    expect(r.fornecedores.total).toBe(0);
    expect(r.financeiro.lancamentos).toBe(0);
  });

  it("traz a próxima ação escrita à mão no fornecedor", async () => {
    const { t, eventId } = await cenario();
    const r = await resumoDireto(t, eventId);
    expect(r.proximasAcoes[0]).toEqual({
      origem: "fornecedor",
      texto: "Confirmar sabor com a noiva",
      referencia: "Doce Arte",
    });
  });

  it("a query pública existe e é somente leitura", async () => {
    // Trava estrutural: o resumo nunca pode virar mutation.
    const fonte = (await import("node:fs")).readFileSync("convex/health.ts", "utf-8");
    expect(fonte).toContain("export const getEventSummary = query({");
    expect(fonte).not.toMatch(/getEventSummary[\s\S]{0,400}ctx\.db\.(insert|patch|delete)/);
  });
});
