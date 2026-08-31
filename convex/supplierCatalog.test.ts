import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// BACKFILL do catálogo central, com banco real.
//
// Três exigências do requisito, cada uma com teste próprio:
//   · idempotente — rodar de novo não duplica nada;
//   · não apaga NADA — só preenche `supplierId` e insere no catálogo;
//   · dedup conservadora — funde só com nome E telefone iguais.
// ─────────────────────────────────────────────────────────────────────────────

async function seedUser(t: ReturnType<typeof convexTest>, email: string): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      name: email, email, role: "user", subscriptionStatus: "active",
    }),
  );
}

async function seedEvento(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  nome: string,
): Promise<Id<"events">> {
  return t.run((ctx) =>
    ctx.db.insert("events", {
      userId, name: nome, type: "wedding", date: "2026-12-12",
      location: "Salão", clientName: "Cliente", status: "planning",
    }),
  );
}

const backfill = internal.supplierCatalog.backfillFromEventSuppliers;

describe("backfill — cria o catálogo a partir do que já existe", () => {
  it("cria um fornecedor e vincula o registro do evento", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "a@x.com");
    const eventId = await seedEvento(t, userId, "Casamento");
    const vinculoId = await t.run((ctx) =>
      ctx.db.insert("eventSuppliers", {
        userId, eventId, category: "buffet", companyName: "Buffet Silva",
        phone: "(14) 99624-7868", contactName: "Silva", bankInfo: "Banco X",
      }),
    );

    const r = await t.mutation(backfill, {});
    expect(r.criados).toBe(1);

    await t.run(async (ctx) => {
      const vinculo = await ctx.db.get(vinculoId);
      expect(vinculo?.supplierId).toBeDefined();

      const supplier = await ctx.db.get(vinculo!.supplierId!);
      expect(supplier?.companyName).toBe("Buffet Silva");
      expect(supplier?.searchName).toBe("buffet silva");
      expect(supplier?.phoneDigits).toBe("14996247868");
      // O perfil migra junto — é o que elimina a redigitação.
      expect(supplier?.contactName).toBe("Silva");
      expect(supplier?.bankInfo).toBe("Banco X");
    });
  });

  it("É IDEMPOTENTE — rodar três vezes não duplica", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "b@x.com");
    const eventId = await seedEvento(t, userId, "Casamento");
    await t.run((ctx) =>
      ctx.db.insert("eventSuppliers", {
        userId, eventId, category: "flores", companyName: "Flores",
        phone: "14996247868",
      }),
    );

    const r1 = await t.mutation(backfill, {});
    const r2 = await t.mutation(backfill, {});
    const r3 = await t.mutation(backfill, {});

    expect(r1.criados).toBe(1);
    expect(r2.criados).toBe(0);
    expect(r2.jaVinculados).toBe(1);
    expect(r3.criados).toBe(0);

    await t.run(async (ctx) => {
      expect(await ctx.db.query("suppliers").collect()).toHaveLength(1);
    });
  });

  it("NÃO APAGA NADA — os dados antigos continuam onde estavam", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "c@x.com");
    const eventId = await seedEvento(t, userId, "Casamento");
    const vinculoId = await t.run((ctx) =>
      ctx.db.insert("eventSuppliers", {
        userId, eventId, category: "som", companyName: "Som Bom",
        phone: "14996247868", status: "contratado", nextAction: "Enviar contrato",
        alignments: [{ date: "2026-10-01", note: "Primeira reunião" }],
      }),
    );

    await t.mutation(backfill, {});

    await t.run(async (ctx) => {
      const v = await ctx.db.get(vinculoId);
      // Todos os campos antigos intactos, inclusive o operacional do evento.
      expect(v?.companyName).toBe("Som Bom");
      expect(v?.phone).toBe("14996247868");
      expect(v?.status).toBe("contratado");
      expect(v?.nextAction).toBe("Enviar contrato");
      expect(v?.alignments).toHaveLength(1);
    });
  });
});

describe("backfill — deduplicação conservadora", () => {
  it("funde o MESMO fornecedor usado em dois eventos", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "d@x.com");
    const e1 = await seedEvento(t, userId, "Casamento 1");
    const e2 = await seedEvento(t, userId, "Casamento 2");

    await t.run(async (ctx) => {
      await ctx.db.insert("eventSuppliers", {
        userId, eventId: e1, category: "buffet",
        companyName: "Buffet Silva", phone: "(14) 99624-7868",
      });
      await ctx.db.insert("eventSuppliers", {
        userId, eventId: e2, category: "buffet",
        companyName: "BUFFET SILVA", phone: "14996247868",
      });
    });

    const r = await t.mutation(backfill, {});
    expect(r.criados).toBe(1); // um fornecedor só para os dois eventos

    await t.run(async (ctx) => {
      const catalogo = await ctx.db.query("suppliers").collect();
      expect(catalogo).toHaveLength(1);
      const vinculos = await ctx.db.query("eventSuppliers").collect();
      expect(vinculos[0].supplierId).toBe(vinculos[1].supplierId);
    });
  });

  it("NÃO funde sem telefone — prefere duplicidade temporária", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "e@x.com");
    const e1 = await seedEvento(t, userId, "C1");
    const e2 = await seedEvento(t, userId, "C2");

    await t.run(async (ctx) => {
      await ctx.db.insert("eventSuppliers", {
        userId, eventId: e1, category: "buffet", companyName: "Buffet Silva",
      });
      await ctx.db.insert("eventSuppliers", {
        userId, eventId: e2, category: "buffet", companyName: "Buffet Silva",
      });
    });

    const r = await t.mutation(backfill, {});
    // Dois registros: podem ser empresas diferentes com o mesmo nome.
    expect(r.criados).toBe(2);
  });

  it("NÃO funde telefones diferentes", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "f@x.com");
    const e1 = await seedEvento(t, userId, "C1");

    await t.run(async (ctx) => {
      await ctx.db.insert("eventSuppliers", {
        userId, eventId: e1, category: "buffet",
        companyName: "Buffet Silva", phone: "14996247868",
      });
      await ctx.db.insert("eventSuppliers", {
        userId, eventId: e1, category: "buffet",
        companyName: "Buffet Silva", phone: "11988887777",
      });
    });

    expect((await t.mutation(backfill, {})).criados).toBe(2);
  });

  it("NUNCA funde entre empresas diferentes", async () => {
    // Catálogo é por empresa. O mesmo buffet atendendo duas decoradoras vira
    // dois registros — cada uma com o seu.
    const t = convexTest(schema, modules);
    const userA = await seedUser(t, "g@x.com");
    const userB = await seedUser(t, "h@x.com");
    const eA = await seedEvento(t, userA, "A");
    const eB = await seedEvento(t, userB, "B");

    await t.run(async (ctx) => {
      await ctx.db.insert("eventSuppliers", {
        userId: userA, eventId: eA, category: "buffet",
        companyName: "Buffet Silva", phone: "14996247868",
      });
      await ctx.db.insert("eventSuppliers", {
        userId: userB, eventId: eB, category: "buffet",
        companyName: "Buffet Silva", phone: "14996247868",
      });
    });

    const r = await t.mutation(backfill, {});
    expect(r.criados).toBe(2);

    await t.run(async (ctx) => {
      const catalogo = await ctx.db.query("suppliers").collect();
      expect(new Set(catalogo.map((s) => s.userId)).size).toBe(2);
    });
  });

  it("pula registro sem nome, sem quebrar o resto", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "i@x.com");
    const eventId = await seedEvento(t, userId, "C");

    await t.run(async (ctx) => {
      await ctx.db.insert("eventSuppliers", {
        userId, eventId, category: "x", companyName: "   ",
      });
      await ctx.db.insert("eventSuppliers", {
        userId, eventId, category: "buffet", companyName: "Válido",
      });
    });

    const r = await t.mutation(backfill, {});
    expect(r.semNome).toBe(1);
    expect(r.criados).toBe(1);
  });
});
