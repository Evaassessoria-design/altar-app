import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { deleteUserDataCascade } from "./lib/cascade";
import type { MutationCtx } from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE CONSISTÊNCIA — o histórico de ajustes e o resto do sistema
// ─────────────────────────────────────────────────────────────────────────────

const NOW = "2026-09-02T12:00:00.000Z";

async function comAjuste() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: MutationCtx) => {
    const userId = await ctx.db.insert("users", {
      name: "Dona", email: "d@ex.com", role: "user", subscriptionStatus: "active",
    });
    const item = await ctx.db.insert("collectionItems", {
      userId, nome: "Vaso", searchName: "vaso", unidade: "un", quantidadeTotal: 40, updatedAt: NOW,
    });
    const evento = await ctx.db.insert("events", {
      userId, name: "Marina", type: "wedding", date: "2026-10-10",
      location: "F", clientName: "M", status: "confirmed",
    });
    const ajuste = await ctx.db.insert("collectionAdjustments", {
      userId, collectionItemId: item, tipo: "quebra", delta: -2,
      quantidadeAntes: 40, quantidadeDepois: 38, eventId: evento,
    });
    return { userId, item, evento, ajuste };
  });
  return { t, ...ids };
}

describe("evento apagado", () => {
  it("o ajuste SOBREVIVE — apagar o evento não apaga a prova da quebra", async () => {
    const { t, evento, ajuste } = await comAjuste();
    await t.run(async (ctx) => {
      await ctx.db.delete(evento);
      const a = await ctx.db.get(ajuste);
      expect(a).not.toBeNull();
      expect(a!.quantidadeDepois).toBe(38);
    });
  });

  it("o vínculo órfão não quebra a leitura — vira só 'sem evento'", async () => {
    const { t, evento, ajuste } = await comAjuste();
    await t.run(async (ctx) => {
      await ctx.db.delete(evento);
      const a = (await ctx.db.get(ajuste))!;
      // É isto que `historicoDoItem` faz: resolve e aceita o nulo.
      expect(await ctx.db.get(a.eventId!)).toBeNull();
    });
  });

  it("apagar evento NÃO devolve peça ao estoque", async () => {
    const { t, item, evento } = await comAjuste();
    await t.run(async (ctx) => {
      await ctx.db.delete(evento);
      expect((await ctx.db.get(item))!.quantidadeTotal).toBe(40);
    });
  });
});

describe("conta apagada não deixa histórico órfão", () => {
  it("o ajuste vai junto — senão sobraria dado de alguém que pediu exclusão", async () => {
    const { t, userId, ajuste } = await comAjuste();
    await t.run(async (ctx) => {
      await deleteUserDataCascade(ctx, userId);
      expect(await ctx.db.get(ajuste)).toBeNull();
    });
  });

  it("nenhum ajuste sobra no banco depois da cascata", async () => {
    const { t, userId } = await comAjuste();
    await t.run(async (ctx) => {
      await deleteUserDataCascade(ctx, userId);
      expect(await ctx.db.query("collectionAdjustments").collect()).toHaveLength(0);
    });
  });
});

describe("a cascata cita a tabela pelo nome", () => {
  it("collectionAdjustments está na cascata de conta", () => {
    // Guarda de intenção: tabela nova do acervo que fique de fora da cascata
    // vira vazamento silencioso de dado de conta excluída.
    const fonte = readFileSync("convex/lib/cascade.ts", "utf-8");
    const codigo = fonte
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
    expect(codigo).toContain("collectionAdjustments");
  });
});
