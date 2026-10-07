import { describe, expect, it, vi } from "vitest";

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
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// PARCELA SEMPRE ACESSÍVEL — O CASO DO TESTE EM PROD (07/10)
//
// R$ 100 → recebe 40 → recebe 60 → quitada, e continua consultável e
// corrigível pelas regras de sempre: comprovante depois sem mexer em valor,
// anulação que recalcula saldo e status, correção = anular + registrar de
// novo (sem duplicar), edição que não fica abaixo do recebido, e nada acima
// do saldo. As telas (aba do evento e Financeiro) usam estas mesmas mutations.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora" });
  const rival = await autenticarComo(t, { nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival" });
  const ids = await t.run(async (ctx: MutationCtx) => {
    const donaId = (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora")).unique())!._id;
    const evento = await ctx.db.insert("events", {
      userId: donaId, name: "TESTE Live", type: "wedding", date: "2026-10-22",
      location: "Salão", clientName: "Cliente Teste", status: "planning",
    });
    const parcela = await ctx.db.insert("transactions", {
      userId: donaId, eventId: evento, type: "income", category: "Contrato",
      description: "Parcela 1/3", amount: 100, date: "2026-10-07", isPaid: false,
    });
    return { evento, parcela };
  });
  const parcelaDaAba = async () =>
    (await dona.query(api.financeiro.pagamentosDoEvento, { eventId: ids.evento }))!.parcelas.find((p) => p._id === ids.parcela)!;
  const linha = () => t.run(async (ctx) => (await ctx.db.get(ids.parcela))!);
  const guardar = () => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(256)], { type: "application/pdf" })));
  const receber = (chave: string, valor: number) =>
    dona.mutation(api.financeiro.registrarRecebimento, { id: ids.parcela, chave, valor, data: "2026-10-07", forma: "PIX" });
  return { t, dona, rival, ids, parcelaDaAba, linha, guardar, receber };
}

describe("R$ 100 → 40 → 60: quitada e ainda acessível", () => {
  it("o caso inteiro, com saldo e status recalculados a cada passo", async () => {
    const c = await cenario();
    const r40 = await c.receber("k40", 40);
    expect((await c.linha()).isPaid).toBe(false);
    await c.receber("k60", 60);

    // Quitada — e a aba continua devolvendo a parcela com o histórico inteiro.
    let p = await c.parcelaDaAba();
    expect(p.isPaid).toBe(true);
    expect(p.recebimentos.map((r) => r.valor)).toEqual([40, 60]);

    // Quitada não aceita receber acima do saldo.
    await expect(c.receber("k-extra", 1)).rejects.toThrow(/SEM_SALDO/);

    // Comprovante no recebimento ANTERIOR: valores intactos.
    const arquivo = await c.guardar();
    await c.dona.mutation(api.financeiro.anexarComprovanteAoRecebimento, {
      id: c.ids.parcela, recebimentoId: r40.id, storageId: arquivo, filename: "pix-40.pdf",
    });
    p = await c.parcelaDaAba();
    expect(p.isPaid).toBe(true);
    expect(p.comprovantes).toBe(1);
    expect(p.recebimentos[0].comprovanteStorageId).toBe(arquivo);

    // Anula o de 40: volta a parcial, saldo 40, e o anulado fica no histórico.
    await c.dona.mutation(api.financeiro.anularRecebimento, { id: c.ids.parcela, recebimentoId: r40.id, motivo: "teste" });
    p = await c.parcelaDaAba();
    expect(p.isPaid).toBe(false);
    expect(p.recebimentos).toHaveLength(2);
    expect(p.recebimentos[0].anulacao?.motivo).toBe("teste");
    const resumo = (await c.dona.query(api.financeiro.listTransactions, {})).itens.find((x) => x._id === c.ids.parcela)!;
    expect(resumo.isPaid).toBe(false);
  });

  it("corrigir = anular + registrar o certo: o histórico fica, nada duplica", async () => {
    const c = await cenario();
    const errado = await c.receber("k1", 45);
    await c.dona.mutation(api.financeiro.anularRecebimento, { id: c.ids.parcela, recebimentoId: errado.id, motivo: "era 40" });
    await c.receber("k2", 40);
    // a mesma correção reenviada (duplo clique) não vira dois recebimentos
    await c.receber("k2", 40);
    const p = await c.parcelaDaAba();
    expect(p.recebimentos.map((r) => [r.valor, !!r.anulacao])).toEqual([[45, true], [40, false]]);
  });

  it("editar valor e vencimento respeita o recebido e recalcula a baixa", async () => {
    const c = await cenario();
    await c.receber("k40", 40);
    await c.receber("k60", 60);
    await expect(
      c.dona.mutation(api.financeiro.updateTransaction, { id: c.ids.parcela, amount: 90, date: "2026-10-08" }),
    ).rejects.toThrow(/menor do que já foi recebido/);
    // Subir o valor reabre o saldo: a parcela deixa de estar quitada.
    await c.dona.mutation(api.financeiro.updateTransaction, { id: c.ids.parcela, amount: 120, date: "2026-10-09" });
    const l = await c.linha();
    expect(l).toMatchObject({ amount: 120, date: "2026-10-09", isPaid: false });
  });

  it("outra conta não abre, não edita e não corrige a parcela", async () => {
    const c = await cenario();
    const r = await c.receber("k40", 40);
    expect(await c.rival.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento })).toBeNull();
    await expect(c.rival.mutation(api.financeiro.updateTransaction, { id: c.ids.parcela, amount: 1 })).rejects.toThrow(/não encontrado/i);
    await expect(
      c.rival.mutation(api.financeiro.anularRecebimento, { id: c.ids.parcela, recebimentoId: r.id, motivo: "x" }),
    ).rejects.toThrow(/não encontrado/i);
    expect((await c.linha()).amount).toBe(100);
  });
});
