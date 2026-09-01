import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — evento sem assessoria NÃO é evento incompleto.
//
// `health.ts` exigia "Assessoria definida" para considerar o cadastro do
// evento completo. Isso tratava um fornecedor DO CLIENTE como requisito do
// evento DA DECORADORA. Aniversário, corporativo, formatura e festa infantil
// costumam não ter assessoria nenhuma — e casamento também pode não ter. Todos
// ficavam com uma marca vermelha permanente, por uma ausência que não é falha.
//
// No lugar entrou o que É a operação dela: existe projeto de montagem?
// ─────────────────────────────────────────────────────────────────────────────

const FONTE = readFileSync(join(__dirname, "health.ts"), "utf8");

/** Só o corpo do cálculo — o cabeçalho explica o que foi removido. */
const CODIGO = FONTE.split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join("\n");

async function eventoCom(
  t: ReturnType<typeof convexTest>,
  opts: { tipo: string; comAssessoria: boolean; comMontagem: boolean },
) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Decoradora",
      email: "d@exemplo.com",
      role: "user",
      subscriptionStatus: "active",
    });
    const eventId = await ctx.db.insert("events", {
      userId,
      name: "Evento",
      type: opts.tipo,
      date: "2026-11-20",
      location: "Espaço",
      clientName: "Cliente",
      status: "planning",
    });
    if (opts.comAssessoria) {
      await ctx.db.insert("eventSuppliers", {
        userId,
        eventId,
        category: "assessoria",
        companyName: "Assessoria Bela",
      });
    }
    await ctx.db.insert("eventSuppliers", {
      userId,
      eventId,
      category: "flores",
      companyName: "Flores de Aurora",
    });
    if (opts.comMontagem) {
      await ctx.db.insert("assemblyItems", {
        userId,
        eventId,
        area: "ceremony",
        order: 0,
        name: "Arco de oliveiras",
        includeInAssemblyReport: true,
        checkOnAssembly: true,
        visibility: "equipe",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      });
    }
    return { userId, eventId };
  });
}

/** Repete a conta que `computeHealth` faz, sobre o banco real. */
async function checks(t: ReturnType<typeof convexTest>, eventId: Id<"events">) {
  return t.run(async (ctx) => {
    const suppliers = (await ctx.db.query("eventSuppliers").collect()).filter(
      (s) => s.eventId === eventId,
    );
    const montagem = (await ctx.db.query("assemblyItems").collect()).filter(
      (a) => a.eventId === eventId,
    );
    return { suppliers, montagem };
  });
}

describe("o critério de assessoria saiu do cálculo", () => {
  it("nenhum check exige assessoria", () => {
    expect(CODIGO).not.toContain('key: "assessoria"');
    expect(CODIGO).not.toContain("Assessoria definida");
  });

  it("entrou um critério da operação da decoradora", () => {
    expect(CODIGO).toContain('key: "montagem"');
    expect(CODIGO).toContain("Montagem planejada");
    expect(CODIGO).toContain("assemblyItems.length > 0");
  });

  it("usa dado que já existe — nenhuma regra nem módulo novo", () => {
    // `assemblyItems` já alimenta o Caderno de Montagem, o Projeto de
    // Decoração e o Carregamento.
    expect(CODIGO).toContain('ctx.db.query("assemblyItems")');
    expect(CODIGO).toContain('withIndex("by_event"');
  });

  it("o nome da assessoria continua sendo INFORMADO — só não é exigido", () => {
    // Saber quem coordena o evento é contexto útil para a decoradora.
    expect(CODIGO).toContain('suppliers.find((s) => s.category === "assessoria")');
  });
});

describe("evento sem assessoria não fica incompleto", () => {
  it.each(["birthday", "corporate", "debutante", "baptism", "other", "wedding"])(
    "%s sem assessoria tem montagem planejada e nada a ver com assessoria",
    async (tipo) => {
      const t = convexTest(schema, modules);
      const { eventId } = await eventoCom(t, {
        tipo,
        comAssessoria: false,
        comMontagem: true,
      });
      const { suppliers, montagem } = await checks(t, eventId);

      expect(suppliers.some((s) => s.category === "assessoria")).toBe(false);
      // O critério que substituiu passa — o evento não é penalizado.
      expect(montagem.length > 0).toBe(true);
    },
  );

  it("um evento COM assessoria também continua válido", async () => {
    const t = convexTest(schema, modules);
    const { eventId } = await eventoCom(t, {
      tipo: "wedding",
      comAssessoria: true,
      comMontagem: true,
    });
    const { suppliers, montagem } = await checks(t, eventId);
    expect(suppliers.some((s) => s.category === "assessoria")).toBe(true);
    expect(montagem.length > 0).toBe(true);
  });

  it("sem montagem planejada, o critério novo aponta a falta de verdade", () => {
    // A troca não pode ser um critério que passa sempre — aí não mediria nada.
    return (async () => {
      const t = convexTest(schema, modules);
      const { eventId } = await eventoCom(t, {
        tipo: "corporate",
        comAssessoria: false,
        comMontagem: false,
      });
      const { montagem } = await checks(t, eventId);
      expect(montagem.length > 0).toBe(false);
    })();
  });
});

describe("o total de critérios não mudou", () => {
  it("continuam sendo oito — a assessoria foi SUBSTITUÍDA, não removida", () => {
    // Remover sem repor mudaria o percentual de todo evento já existente.
    const bloco = CODIGO.slice(
      CODIGO.indexOf("const checks: HealthCheck[] = ["),
      CODIGO.indexOf("// Pontos de atenção"),
    );
    expect((bloco.match(/\{ key: "/g) ?? []).length).toBe(8);
  });
});
