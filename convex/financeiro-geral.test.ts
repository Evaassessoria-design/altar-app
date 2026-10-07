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
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { TAMANHO_MAXIMO_DOCUMENTO } from "./lib/arquivos";

// ═════════════════════════════════════════════════════════════════════════════
// FINANCEIRO GERAL — ANEXOS NO LANÇAMENTO E A MESMA OPERAÇÃO DO EVENTO
//
// Trava o que o Financeiro geral passou a fazer sem a pasta do evento:
//  · anexo no Novo lançamento, receita e despesa, pago ou pendente — e anexo
//    NUNCA dá baixa;
//  · receita de evento só se baixa por recebimento ("Já recebido", baixa
//    rápida e edição não contornam);
//  · comprovante acrescentado a um recebimento já registrado não mexe em
//    valor nenhum;
//  · arquivo de outra conta não se lê nem se mexe.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora" });
  const rival = await autenticarComo(t, { nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival" });
  const ids = await t.run(async (ctx: MutationCtx) => {
    const donaId = (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora")).unique())!._id;
    const evento = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-12-05",
      location: "Fazenda", clientName: "Marina", status: "planning",
    });
    const parcela = await ctx.db.insert("transactions", {
      userId: donaId, eventId: evento, type: "income", category: "Contrato",
      description: "Parcela 1/2", amount: 5000, date: "2026-11-10", isPaid: false,
    });
    const antigaPaga = await ctx.db.insert("transactions", {
      userId: donaId, eventId: evento, type: "income", category: "Contrato",
      description: "Entrada antiga", amount: 1000, date: "2026-09-10", isPaid: true,
    });
    return { donaId, evento, parcela, antigaPaga };
  });
  const guardar = (bytes = 1024) =>
    t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "application/pdf" })));
  const linha = (id: Id<"transactions">) => t.run(async (ctx) => (await ctx.db.get(id))!);
  const novo = (extra: Record<string, unknown>) =>
    dona.mutation(api.financeiro.addTransaction, {
      type: "income", category: "Outros", description: "Lançamento", amount: 300, date: "2026-10-06", isPaid: false,
      ...extra,
    } as never);
  return { t, dona, rival, ids, guardar, linha, novo };
}

describe("anexo no Novo lançamento", () => {
  it("receita avulsa PENDENTE com documento continua pendente", async () => {
    const c = await cenario();
    const storageId = await c.guardar();
    const id = await c.novo({ anexo: { storageId, filename: "orcamento.pdf" } });
    const l = await c.linha(id);
    expect(l.isPaid).toBe(false);
    expect(l.paidAt).toBeUndefined();
    expect(l.comprovantes).toHaveLength(1);
    expect(l.recebimentos).toBeUndefined();
  });

  it("despesa avulsa PAGA com comprovante guarda data, forma e arquivo", async () => {
    const c = await cenario();
    const storageId = await c.guardar();
    const id = await c.novo({
      type: "expense", category: "Flores", isPaid: true, paidAt: "2026-10-05", paymentMethod: "PIX",
      anexo: { storageId, filename: "nota.pdf", contentType: "application/pdf" },
    });
    const l = await c.linha(id);
    expect(l).toMatchObject({ isPaid: true, paidAt: "2026-10-05", paymentMethod: "PIX" });
    expect(l.comprovantes?.[0].filename).toBe("nota.pdf");
  });

  it("pendente não grava data nem forma de pagamento", async () => {
    const c = await cenario();
    const id = await c.novo({ paidAt: "2026-10-05", paymentMethod: "PIX" });
    const l = await c.linha(id);
    expect(l.paidAt).toBeUndefined();
    expect(l.paymentMethod).toBeUndefined();
  });

  it("arquivo acima do teto recusa o lançamento inteiro", async () => {
    const c = await cenario();
    const storageId = await c.guardar(TAMANHO_MAXIMO_DOCUMENTO + 1);
    await expect(c.novo({ description: "grande", anexo: { storageId, filename: "x.pdf" } })).rejects.toThrow(/ultrapassa o limite/);
    const todas = await c.t.run((ctx) => ctx.db.query("transactions").collect());
    expect(todas.some((x) => x.description === "grande")).toBe(false);
  });

  it("o mesmo formulário reenviado não cria dois lançamentos", async () => {
    const c = await cenario();
    const a = await c.novo({ chave: "form-1", description: "Uma vez" });
    const b = await c.novo({ chave: "form-1", description: "Uma vez" });
    expect(b).toBe(a);
    const todas = await c.t.run((ctx) => ctx.db.query("transactions").collect());
    expect(todas.filter((x) => x.description === "Uma vez")).toHaveLength(1);
  });

  it("receita de EVENTO 'já recebida' vira um recebimento, com o comprovante ligado", async () => {
    const c = await cenario();
    const storageId = await c.guardar();
    const id = await c.novo({
      eventId: c.ids.evento, category: "Contrato", description: "Sinal", amount: 2000, isPaid: true,
      paidAt: "2026-10-04", paymentMethod: "Transferência", anexo: { storageId, filename: "ted.pdf" },
    });
    const l = await c.linha(id);
    expect(l.isPaid).toBe(true);
    expect(l.paidAt).toBe("2026-10-04");
    expect(l.recebimentos).toHaveLength(1);
    expect(l.recebimentos![0]).toMatchObject({ valor: 2000, data: "2026-10-04", forma: "Transferência", comprovanteStorageId: storageId });
    // e a aba do evento enxerga o mesmo histórico
    const aba = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    expect(aba!.parcelas.find((p) => p._id === id)?.recebimentos).toHaveLength(1);
  });
});

describe("receita de evento só se baixa por recebimento", () => {
  it("baixa rápida, 'Já recebido' na edição e a baixa do diálogo são recusadas", async () => {
    const c = await cenario();
    await expect(c.dona.mutation(api.financeiro.togglePaid, { id: c.ids.parcela })).rejects.toThrow(/Registrar recebimento/);
    await expect(c.dona.mutation(api.financeiro.updateTransaction, { id: c.ids.parcela, isPaid: true })).rejects.toThrow(/Registrar recebimento/);
    await expect(c.dona.mutation(api.financeiro.registrarPagamento, { id: c.ids.parcela, isPaid: true })).rejects.toThrow(/Registrar recebimento/);
    expect((await c.linha(c.ids.parcela)).isPaid).toBe(false);
  });

  it("editar descrição com o mesmo 'pago' que já estava não é recusado", async () => {
    const c = await cenario();
    await c.dona.mutation(api.financeiro.updateTransaction, { id: c.ids.parcela, description: "Parcela 1/2 — saldo", isPaid: false });
    expect((await c.linha(c.ids.parcela)).description).toBe("Parcela 1/2 — saldo");
  });

  it("desmarcar uma baixa ANTIGA continua possível — é correção de dado legado", async () => {
    const c = await cenario();
    await c.dona.mutation(api.financeiro.togglePaid, { id: c.ids.antigaPaga });
    expect((await c.linha(c.ids.antigaPaga)).isPaid).toBe(false);
  });

  it("recebimento registrado pelo Financeiro é o MESMO da aba do evento", async () => {
    const c = await cenario();
    await c.dona.mutation(api.financeiro.registrarRecebimento, { id: c.ids.parcela, chave: "fin-1", valor: 1500, data: "2026-10-06" });
    const aba = await c.dona.query(api.financeiro.pagamentosDoEvento, { eventId: c.ids.evento });
    const p = aba!.parcelas.find((x) => x._id === c.ids.parcela)!;
    expect(p.recebimentos.map((r) => r.valor)).toEqual([1500]);
    const livro = await c.dona.query(api.financeiro.listTransactions, {});
    expect(livro.itens.find((x) => x._id === c.ids.parcela)?.recebimentos).toEqual(p.recebimentos);
  });
});

describe("comprovante depois do recebimento", () => {
  it("entra sem mudar valor, saldo, baixa nem histórico", async () => {
    const c = await cenario();
    const { id: recebimentoId } = await c.dona.mutation(api.financeiro.registrarRecebimento, {
      id: c.ids.parcela, chave: "r1", valor: 2000, data: "2026-10-06",
    });
    const antes = await c.linha(c.ids.parcela);
    const storageId = await c.guardar();
    await c.dona.mutation(api.financeiro.anexarComprovanteAoRecebimento, {
      id: c.ids.parcela, recebimentoId, storageId, filename: "pix.png", contentType: "image/png",
    });
    const depois = await c.linha(c.ids.parcela);
    expect(depois.isPaid).toBe(antes.isPaid);
    expect(depois.amount).toBe(antes.amount);
    expect(depois.recebimentos).toHaveLength(1);
    expect(depois.recebimentos![0].valor).toBe(2000);
    expect(depois.recebimentos![0].comprovanteStorageId).toBe(storageId);
    expect(depois.comprovantes).toHaveLength(1);
  });

  it("anexar de novo o mesmo arquivo não duplica", async () => {
    const c = await cenario();
    const { id: recebimentoId } = await c.dona.mutation(api.financeiro.registrarRecebimento, { id: c.ids.parcela, chave: "r1", valor: 100, data: "2026-10-06" });
    const storageId = await c.guardar();
    const args = { id: c.ids.parcela, recebimentoId, storageId, filename: "pix.png" };
    await c.dona.mutation(api.financeiro.anexarComprovanteAoRecebimento, args);
    await c.dona.mutation(api.financeiro.anexarComprovanteAoRecebimento, args);
    expect((await c.linha(c.ids.parcela)).comprovantes).toHaveLength(1);
  });

  it("recebimento anulado não recebe comprovante — e o histórico fica", async () => {
    const c = await cenario();
    const { id: recebimentoId } = await c.dona.mutation(api.financeiro.registrarRecebimento, { id: c.ids.parcela, chave: "r1", valor: 100, data: "2026-10-06" });
    await c.dona.mutation(api.financeiro.anularRecebimento, { id: c.ids.parcela, recebimentoId, motivo: "errado" });
    const storageId = await c.guardar();
    await expect(
      c.dona.mutation(api.financeiro.anexarComprovanteAoRecebimento, { id: c.ids.parcela, recebimentoId, storageId, filename: "x.pdf" }),
    ).rejects.toThrow(/anulado/);
    const l = await c.linha(c.ids.parcela);
    expect(l.recebimentos).toHaveLength(1);
    expect(l.recebimentos![0].anulacao?.motivo).toBe("errado");
  });
});

describe("arquivo de outra conta", () => {
  it("a rival não lê, não anexa, não remove e não liga comprovante — e nada muda", async () => {
    const c = await cenario();
    const storageId = await c.guardar();
    await c.dona.mutation(api.financeiro.anexarComprovante, { id: c.ids.parcela, storageId, filename: "pix.pdf" });
    const { id: recebimentoId } = await c.dona.mutation(api.financeiro.registrarRecebimento, { id: c.ids.parcela, chave: "r1", valor: 100, data: "2026-10-06" });
    const antes = await c.linha(c.ids.parcela);

    expect(await c.rival.query(api.financeiro.comprovantesDoLancamento, { id: c.ids.parcela })).toEqual([]);
    const outro = await c.guardar();
    await expect(c.rival.mutation(api.financeiro.anexarComprovante, { id: c.ids.parcela, storageId: outro, filename: "x" })).rejects.toThrow(/NOT_FOUND|não encontrado/i);
    await expect(c.rival.mutation(api.financeiro.removerComprovante, { id: c.ids.parcela, storageId })).rejects.toThrow(/NOT_FOUND|não encontrado/i);
    await expect(
      c.rival.mutation(api.financeiro.anexarComprovanteAoRecebimento, { id: c.ids.parcela, recebimentoId, storageId: outro, filename: "x" }),
    ).rejects.toThrow(/NOT_FOUND|não encontrado/i);

    expect(await c.linha(c.ids.parcela)).toEqual(antes);
    expect(await c.t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
  });
});
