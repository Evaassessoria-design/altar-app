import { describe, expect, it, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import { DEMO_WEDDING } from "./lib/demoData";
import type { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// O SEED DE DEMONSTRAÇÃO.
//
// Metade destes testes prova que ele FUNCIONA; a outra metade prova que ele se
// RECUSA a funcionar onde não deve. A segunda metade importa mais: um seed
// disparado em produção inseriria um casamento fictício no meio dos dados reais
// de uma cliente.
// ─────────────────────────────────────────────────────────────────────────────

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

const seed = internal.demo.seed;

/** Ambiente demo válido: variável ligada e um único usuário sem cobrança. */
async function ambienteDemo(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  process.env.ALTAR_DEMO = "1";
  return t.run((ctx) =>
    ctx.db.insert("users", {
      name: "Conta Demo", email: "demo@exemplo.com.br",
      role: "admin", subscriptionStatus: "trial",
    }),
  );
}

describe("o seed se RECUSA a rodar fora do ambiente demo", () => {
  it("sem ALTAR_DEMO, recusa e não escreve nada", async () => {
    delete process.env.ALTAR_DEMO;
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "X", email: "x@x.com", role: "user", subscriptionStatus: "trial",
      }),
    );

    await expect(t.mutation(seed, {})).rejects.toThrow();

    await t.run(async (ctx) => {
      expect(await ctx.db.query("events").collect()).toHaveLength(0);
    });
  });

  it("com ALTAR_DEMO=1 MAS num banco com cobrança Asaas, recusa", async () => {
    // O acidente mais plausível: a variável copiada para produção por engano.
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Cliente real", email: "real@x.com", role: "user",
        subscriptionStatus: "active", asaasCustomerId: "cus_REAL",
      }),
    );

    await expect(t.mutation(seed, {})).rejects.toThrow();

    await t.run(async (ctx) => {
      expect(await ctx.db.query("events").collect()).toHaveLength(0);
      expect(await ctx.db.query("suppliers").collect()).toHaveLength(0);
      expect(await ctx.db.query("leads").collect()).toHaveLength(0);
    });
  });

  it("recusa num banco com usuários demais", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert("users", {
          name: `U${i}`, email: `u${i}@x.com`, role: "user", subscriptionStatus: "trial",
        });
      }
    });
    await expect(t.mutation(seed, {})).rejects.toThrow();
  });

  it("recusa quando não há nenhum usuário — o seed não cria login", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await expect(t.mutation(seed, {})).rejects.toThrow();
  });

  it("recusa quando há vários usuários e nenhum e-mail informado", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { name: "A", email: "a@x.com", role: "user", subscriptionStatus: "trial" });
      await ctx.db.insert("users", { name: "B", email: "b@x.com", role: "user", subscriptionStatus: "trial" });
    });
    await expect(t.mutation(seed, {})).rejects.toThrow();
  });
});

describe("o seed cria o casamento completo", () => {
  it("cria o evento com os dados de Marina & Gabriel", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);

    const r = await t.mutation(seed, {});
    expect(r.criado).toBe(true);

    await t.run(async (ctx) => {
      const eventos = await ctx.db.query("events").collect();
      expect(eventos).toHaveLength(1);
      expect(eventos[0].name).toBe("Marina & Gabriel");
      expect(eventos[0].date).toBe("2026-10-10");
      expect(eventos[0].location).toContain("Fazenda Aurora");
      expect(eventos[0].status).toBe("confirmed");
    });
  });

  it("preenche todas as telas que serão gravadas", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const contar = async (tabela: Parameters<typeof ctx.db.query>[0]) =>
        (await ctx.db.query(tabela).collect()).length;

      expect(await contar("briefings"), "Briefing").toBe(1);
      expect(await contar("suppliers"), "Catálogo").toBe(DEMO_WEDDING.suppliers.length);
      expect(await contar("eventSuppliers"), "Fornecedores").toBe(DEMO_WEDDING.suppliers.length);
      expect(await contar("teamMembers"), "Equipe").toBe(DEMO_WEDDING.team.length);
      expect(await contar("eventTeam"), "Escala").toBe(DEMO_WEDDING.team.length);
      expect(await contar("checklistItems"), "Checklist").toBe(DEMO_WEDDING.checklist.length);
      expect(await contar("purchaseItems"), "Compras").toBe(DEMO_WEDDING.purchases.length);
      expect(await contar("budgetItems"), "Orçamento").toBe(DEMO_WEDDING.budget.length);
      expect(await contar("transactions"), "Financeiro").toBe(DEMO_WEDDING.transactions.length);
      expect(await contar("assemblyItems"), "Carregamento").toBe(DEMO_WEDDING.assembly.length);
      expect(await contar("leads"), "Funil").toBe(DEMO_WEDDING.leads.length);
    });
  });

  it("liga o lead do casal ao evento — o funil mostra o fluxo completo", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    const r = await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const leads = await ctx.db.query("leads").collect();
      const principal = leads.find((l) => l.clientName.includes("Marina"));
      expect(principal?.stage).toBe("contracted");
      expect(principal?.convertedEventId).toBe(r.eventId);
      // Os demais leads não apontam para evento nenhum.
      expect(leads.filter((l) => l.convertedEventId !== undefined)).toHaveLength(1);
    });
  });

  it("cada fornecedor entra no catálogo E ganha vínculo com o evento", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const vinculos = await ctx.db.query("eventSuppliers").collect();
      for (const v of vinculos) {
        expect(v.supplierId, `${v.companyName} sem catálogo`).toBeDefined();
        const supplier = await ctx.db.get(v.supplierId!);
        expect(supplier?.companyName).toBe(v.companyName);
      }
    });
  });

  it("o evento parece EM ANDAMENTO, não concluído", async () => {
    // É o que faz o print parecer uso real em vez de vitrine.
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const checklist = await ctx.db.query("checklistItems").collect();
      const feitos = checklist.filter((c) => c.isChecked).length;
      expect(feitos).toBeGreaterThan(0);
      expect(feitos).toBeLessThan(checklist.length);

      const compras = await ctx.db.query("purchaseItems").collect();
      const compradas = compras.filter((c) => c.isPurchased).length;
      expect(compradas).toBeGreaterThan(0);
      expect(compradas).toBeLessThan(compras.length);

      const lancamentos = await ctx.db.query("transactions").collect();
      expect(lancamentos.some((l) => l.isPaid)).toBe(true);
      expect(lancamentos.some((l) => !l.isPaid)).toBe(true);

      // Fornecedores em estágios diferentes.
      const vinculos = await ctx.db.query("eventSuppliers").collect();
      expect(new Set(vinculos.map((v) => v.status)).size).toBeGreaterThanOrEqual(3);
    });
  });

  it("a Agenda terá conteúdo nas duas áreas", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const briefing = (await ctx.db.query("briefings").collect())[0];
      // Os quatro horários do dia do evento.
      for (const campo of ["setupTime", "ceremonyTime", "receptionTime", "teardownTime"] as const) {
        expect(briefing[campo], campo).toBeTruthy();
      }
      // Escala com horários repetidos — para a Agenda agrupar as pessoas.
      const escala = await ctx.db.query("eventTeam").collect();
      const horarios = escala.map((e) => e.scheduledTime);
      expect(new Set(horarios).size).toBeLessThan(horarios.length);
      // Alinhamentos alimentam "Antes do evento".
      const vinculos = await ctx.db.query("eventSuppliers").collect();
      expect(vinculos.some((v) => (v.alignments?.length ?? 0) > 0)).toBe(true);
    });
  });

  it("NÃO grava nenhuma imagem — as fotos você sobe depois", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);
    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      expect(await ctx.db.query("eventPhotos").collect()).toHaveLength(0);
      expect(await ctx.db.query("contracts").collect()).toHaveLength(0);
      expect(await ctx.db.query("layoutRenders").collect()).toHaveLength(0);
      const itens = await ctx.db.query("assemblyItems").collect();
      expect(itens.every((i) => i.referencePhotoStorageId === undefined)).toBe(true);
    });
  });
});

describe("o seed é idempotente e não destrói nada", () => {
  it("rodar três vezes cria uma vez só", async () => {
    const t = convexTest(schema, modules);
    await ambienteDemo(t);

    const r1 = await t.mutation(seed, {});
    const r2 = await t.mutation(seed, {});
    const r3 = await t.mutation(seed, {});

    expect(r1.criado).toBe(true);
    expect(r2.criado).toBe(false);
    expect(r3.criado).toBe(false);

    await t.run(async (ctx) => {
      expect(await ctx.db.query("events").collect()).toHaveLength(1);
      expect(await ctx.db.query("suppliers").collect()).toHaveLength(DEMO_WEDDING.suppliers.length);
    });
  });

  it("NÃO sobrescreve um evento que já existia no banco", async () => {
    const t = convexTest(schema, modules);
    const userId = await ambienteDemo(t);

    const anterior = await t.run((ctx) =>
      ctx.db.insert("events", {
        userId, name: "Evento anterior", type: "birthday", date: "2026-11-01",
        location: "Outro lugar", clientName: "Alguém", status: "planning",
      }),
    );

    await t.mutation(seed, {});

    await t.run(async (ctx) => {
      const original = await ctx.db.get(anterior);
      expect(original?.name).toBe("Evento anterior");
      expect(await ctx.db.query("events").collect()).toHaveLength(2);
    });
  });

  it("respeita o e-mail informado quando há mais de uma conta", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    const escolhido = await t.run(async (ctx) => {
      await ctx.db.insert("users", { name: "A", email: "a@x.com", role: "user", subscriptionStatus: "trial" });
      return ctx.db.insert("users", { name: "B", email: "b@x.com", role: "user", subscriptionStatus: "trial" });
    });

    await t.mutation(seed, { email: "b@x.com" });

    await t.run(async (ctx) => {
      const eventos = await ctx.db.query("events").collect();
      expect(eventos[0].userId).toBe(escolhido);
    });
  });
});

describe("os dados são reconhecidamente fictícios", () => {
  it("telefones seguem o padrão inventado (11) 9000X-XXXX", async () => {
    const telefones = [
      DEMO_WEDDING.event.clientPhone,
      ...DEMO_WEDDING.suppliers.map((s) => s.phone),
      ...DEMO_WEDDING.team.map((p) => p.phone),
      ...DEMO_WEDDING.leads.map((l) => l.clientPhone),
    ];
    for (const tel of telefones) {
      expect(tel, `${tel} fora do padrão fictício`).toMatch(/^\(11\) 900\d{2}-\d{4}$/);
    }
  });

  it("e-mails usam apenas o domínio de exemplo", () => {
    for (const s of DEMO_WEDDING.suppliers) {
      expect(s.email, s.email).toMatch(/@[\w.-]*exemplo\.com\.br$/);
    }
  });
});
