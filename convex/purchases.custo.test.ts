import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — lançar o custo de uma compra é IDEMPOTENTE e não vaza entre contas.
//
// `registerCost` exige sessão, e o componente do Better Auth não roda sob
// convex-test. Então: a mecânica de idempotência é exercitada sobre o banco
// real (espelho fiel do handler), e o bloco final amarra o espelho à fonte da
// mutation de verdade. Se um mudar sem o outro, este arquivo falha.
// ─────────────────────────────────────────────────────────────────────────────

const FONTE = readFileSync(join(__dirname, "purchases.ts"), "utf8");
const CORPO = FONTE.slice(
  FONTE.indexOf("export const registerCost"),
  FONTE.indexOf("export const unregisterCost"),
);

async function cenario() {
  const t = convexTest(schema, modules);
  const { userId, outroId, eventId, compraId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Decoradora", email: "a@ex.com", role: "user", subscriptionStatus: "active",
    });
    const outroId = await ctx.db.insert("users", {
      name: "Outra", email: "b@ex.com", role: "user", subscriptionStatus: "active",
    });
    const eventId = await ctx.db.insert("events", {
      userId, name: "Evento", type: "wedding", date: "2026-10-10",
      location: "Espaço", clientName: "Cliente", status: "planning",
    });
    const compraId = await ctx.db.insert("purchaseItems", {
      userId, eventId, name: "Velas pilar", category: "Decoração",
      supplier: "Casa das Velas", unitPrice: 12.9, quantity: 120,
      isPurchased: false, order: 0, status: "comprado", dueDate: "2026-09-20",
    });
    return { userId, outroId, eventId, compraId };
  });
  return { t, userId, outroId, eventId, compraId };
}

/** Espelha `registerCost`: mesma cascata de idempotência do handler real. */
async function lancar(
  t: ReturnType<typeof convexTest>,
  compraId: Id<"purchaseItems">,
  userId: Id<"users">,
) {
  return t.run(async (ctx) => {
    const item = (await ctx.db.get(compraId))!;
    const valor = (item.unitPrice ?? 0) * (item.quantity ?? 1);
    const campos = {
      type: "expense" as const,
      category: item.category ?? "Compras",
      description: `${item.name} — ${item.supplier}`,
      amount: valor,
      date: item.dueDate!,
      isPaid: item.status === "recebido",
      eventId: item.eventId,
    };
    if (item.transactionId) {
      const existente = await ctx.db.get(item.transactionId);
      if (existente && existente.userId === userId) {
        await ctx.db.patch(item.transactionId, campos);
        return { transactionId: item.transactionId, criado: false };
      }
    }
    const transactionId = await ctx.db.insert("transactions", { userId, ...campos });
    await ctx.db.patch(compraId, { transactionId });
    return { transactionId, criado: true };
  });
}

const contarLancamentos = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => (await ctx.db.query("transactions").collect()).length);

describe("idempotência — a mesma compra nunca vira dois custos", () => {
  it("lançar dez vezes produz UM lançamento", async () => {
    const { t, compraId, userId } = await cenario();
    for (let i = 0; i < 10; i++) await lancar(t, compraId, userId);
    expect(await contarLancamentos(t)).toBe(1);
  });

  it("o primeiro cria, os seguintes atualizam", async () => {
    const { t, compraId, userId } = await cenario();
    const um = await lancar(t, compraId, userId);
    const dois = await lancar(t, compraId, userId);
    expect(um.criado).toBe(true);
    expect(dois.criado).toBe(false);
    expect(dois.transactionId).toBe(um.transactionId);
  });

  it("mudar o preço REAJUSTA o mesmo lançamento", async () => {
    const { t, compraId, userId } = await cenario();
    await lancar(t, compraId, userId);
    await t.run(async (ctx) => ctx.db.patch(compraId, { unitPrice: 20 }));
    await lancar(t, compraId, userId);

    const txs = await t.run(async (ctx) => ctx.db.query("transactions").collect());
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(2400);
  });

  it("lançamento apagado à mão faz a compra lançar de novo", async () => {
    // O ponteiro ficou velho. Recriar é o certo — o custo existe.
    const { t, compraId, userId } = await cenario();
    const um = await lancar(t, compraId, userId);
    await t.run(async (ctx) => ctx.db.delete(um.transactionId));
    const dois = await lancar(t, compraId, userId);
    expect(dois.criado).toBe(true);
    expect(await contarLancamentos(t)).toBe(1);
  });
});

describe("isolamento entre contas", () => {
  it("o lançamento nasce com o dono da compra", async () => {
    const { t, compraId, userId, outroId } = await cenario();
    const { transactionId } = await lancar(t, compraId, userId);
    const tx = (await t.run(async (ctx) => ctx.db.get(transactionId))) as unknown as {
      userId: string;
    };
    expect(tx.userId).toBe(userId);
    expect(tx.userId).not.toBe(outroId);
  });

  it("ponteiro para lançamento de OUTRA conta não é reaproveitado", async () => {
    // Sem esta checagem, um id vazado permitiria escrever no livro alheio.
    const { t, compraId, userId, outroId, eventId } = await cenario();
    const alheio = await t.run(async (ctx) =>
      ctx.db.insert("transactions", {
        userId: outroId, type: "expense", category: "X",
        description: "Da outra conta", amount: 999, date: "2026-01-01",
        isPaid: false, eventId,
      }),
    );
    await t.run(async (ctx) => ctx.db.patch(compraId, { transactionId: alheio }));

    await lancar(t, compraId, userId);

    const alheiaDepois = (await t.run(async (ctx) => ctx.db.get(alheio))) as unknown as {
      amount: number;
      description: string;
    };
    expect(alheiaDepois.amount).toBe(999);
    expect(alheiaDepois.description).toBe("Da outra conta");
  });

  it("a mutation real confere o dono da compra E do lançamento", () => {
    expect(CORPO).toContain("item.userId !== user._id");
    expect(CORPO).toContain("existente.userId === user._id");
  });
});

describe("o que NÃO pode virar custo", () => {
  it("a mutation real recusa compra cancelada", () => {
    expect(CORPO).toContain('status === "cancelado"');
    expect(CORPO).toContain("Compra cancelada não vira custo");
  });

  it("a mutation real recusa compra sem preço", () => {
    expect(CORPO).toContain("valor <= 0");
    expect(CORPO).toContain("Informe o preço da compra");
  });

  it("a recusa vem ANTES de qualquer escrita", () => {
    const recusa = CORPO.indexOf('status === "cancelado"');
    const escreve = CORPO.indexOf("ctx.db.insert");
    expect(recusa).toBeGreaterThan(-1);
    expect(recusa).toBeLessThan(escreve);
  });
});

describe("a mutation real tem a mesma cascata de idempotência", () => {
  it("checa o vínculo ANTES de inserir", () => {
    const checa = CORPO.indexOf("if (item.transactionId)");
    const insere = CORPO.indexOf('ctx.db.insert("transactions"');
    expect(checa).toBeGreaterThan(-1);
    expect(checa).toBeLessThan(insere);
  });

  it("atualiza em vez de criar quando o lançamento existe", () => {
    expect(CORPO).toContain("await ctx.db.patch(item.transactionId, campos)");
    expect(CORPO).toContain("criado: false");
  });

  it("grava o vínculo ao criar — senão a próxima chamada duplicaria", () => {
    expect(CORPO).toContain("await ctx.db.patch(args.id, { transactionId })");
  });

  it("desfazer apaga o lançamento e limpa o vínculo", () => {
    const desfazer = FONTE.slice(FONTE.indexOf("export const unregisterCost"));
    expect(desfazer).toContain("ctx.db.delete(item.transactionId)");
    expect(desfazer).toContain("transactionId: undefined");
    expect(desfazer).toContain("lancamento.userId === user._id");
  });
});
