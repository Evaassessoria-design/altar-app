import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSÃO: converter o mesmo lead duas vezes NÃO pode criar dois eventos.
//
// A tela desabilita o botão enquanto envia e o esconde depois. Isso é
// decoração: `funil.convertToEvent` é chamável direto do navegador, e um Enter
// repetido com a rede lenta bastava. Antes desta correção o resultado eram dois
// eventos, com o lead apontando só para o último — o primeiro virava órfão.
// ─────────────────────────────────────────────────────────────────────────────

async function cenario() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Decoradora", email: "d@exemplo.com.br", role: "user", subscriptionStatus: "active",
    });
    const leadId = await ctx.db.insert("leads", {
      userId,
      clientName: "Marina Duarte",
      clientPhone: "(11) 90001-2233",
      stage: "negotiating",
      order: 0,
      venue: "Fazenda Aurora",
      budget: 186500,
      notes: "Cerimônia no jardim",
    });
    return { userId, leadId };
  });
  return { t, ...ids };
}

/** Mesma lógica da mutation, sem depender de autenticação. */
async function converter(
  t: Awaited<ReturnType<typeof cenario>>["t"],
  leadId: string,
  userId: string,
  form: { location?: string; clientPhone?: string; budget?: number } = {},
) {
  return t.run(async (ctx) => {
    const lead = await ctx.db.get(leadId as never);
    if (!lead) throw new Error("lead sumiu");
    const l = lead as unknown as {
      convertedEventId?: string; venue?: string; clientPhone?: string;
      budget?: number; notes?: string; clientName: string;
    };
    if (l.convertedEventId) {
      const ja = await ctx.db.get(l.convertedEventId as never);
      if (ja && (ja as unknown as { userId: string }).userId === userId) {
        return (ja as unknown as { _id: string })._id;
      }
    }
    const eventId = await ctx.db.insert("events", {
      userId: userId as never,
      name: "Marina & Gabriel",
      date: "2026-10-10",
      type: "wedding",
      clientName: l.clientName,
      status: "planning",
      location: form.location || l.venue || "",
      clientPhone: form.clientPhone ?? l.clientPhone,
      budget: form.budget ?? l.budget,
      notes: l.notes,
    });
    await ctx.db.patch(leadId as never, {
      stage: "contracted", convertedEventId: eventId,
    } as never);
    return eventId;
  });
}

describe("converter lead em evento é idempotente", () => {
  it("dois cliques criam UM evento só, e devolvem o mesmo id", async () => {
    const { t, leadId, userId } = await cenario();
    const primeiro = await converter(t, leadId, userId);
    const segundo = await converter(t, leadId, userId);

    expect(segundo).toBe(primeiro);
    const eventos = await t.run(async (ctx) => ctx.db.query("events").collect());
    expect(eventos).toHaveLength(1);
  });

  it("o lead aponta para o evento que existe", async () => {
    const { t, leadId, userId } = await cenario();
    const eventId = await converter(t, leadId, userId);
    await converter(t, leadId, userId);
    const lead = await t.run(async (ctx) => ctx.db.get(leadId as never));
    expect((lead as unknown as { convertedEventId: string }).convertedEventId).toBe(eventId);
    expect((lead as unknown as { stage: string }).stage).toBe("contracted");
  });

  it("se o evento foi APAGADO, converter de novo é permitido", async () => {
    // Ponteiro velho. É o caso legítimo de "converti, apaguei, quero refazer".
    const { t, leadId, userId } = await cenario();
    const primeiro = await converter(t, leadId, userId);
    await t.run(async (ctx) => ctx.db.delete(primeiro as never));
    const segundo = await converter(t, leadId, userId);
    expect(segundo).not.toBe(primeiro);
    const eventos = await t.run(async (ctx) => ctx.db.query("events").collect());
    expect(eventos).toHaveLength(1);
  });
});

describe("reaproveitamento de dados do lead", () => {
  it("usa venue, telefone, orçamento e observações quando o formulário não traz", async () => {
    const { t, leadId, userId } = await cenario();
    const eventId = await converter(t, leadId, userId);
    const ev = await t.run(async (ctx) => ctx.db.get(eventId as never));
    const e = ev as unknown as {
      location: string; clientPhone?: string; budget?: number; notes?: string;
    };
    expect(e.location).toBe("Fazenda Aurora");
    expect(e.clientPhone).toBe("(11) 90001-2233");
    expect(e.budget).toBe(186500);
    expect(e.notes).toBe("Cerimônia no jardim");
  });

  it("o formulário tem precedência sobre o lead", async () => {
    const { t, leadId, userId } = await cenario();
    const eventId = await converter(t, leadId, userId, {
      location: "Espaço Novo", clientPhone: "(11) 98888-7777", budget: 200000,
    });
    const ev = await t.run(async (ctx) => ctx.db.get(eventId as never));
    const e = ev as unknown as { location: string; clientPhone?: string; budget?: number };
    expect(e.location).toBe("Espaço Novo");
    expect(e.clientPhone).toBe("(11) 98888-7777");
    expect(e.budget).toBe(200000);
  });
});

describe("a guarda existe na mutation real", () => {
  const corpo = (() => {
    const f = readFileSync("convex/funil.ts", "utf-8");
    const i = f.indexOf("export const convertToEvent =");
    return f.slice(i, f.indexOf("\n});", i));
  })();

  it("checa convertedEventId ANTES de inserir", () => {
    const posGuarda = corpo.indexOf("lead.convertedEventId");
    const posInsert = corpo.indexOf('ctx.db.insert("events"');
    expect(posGuarda).toBeGreaterThan(-1);
    expect(posGuarda).toBeLessThan(posInsert);
  });

  it("confere que o evento apontado é do MESMO usuário", () => {
    expect(corpo).toContain("jaConvertido.userId === user._id");
  });

  it("o paywall continua antes de tudo", () => {
    const posPaywall = corpo.indexOf("requireActiveAccess");
    expect(posPaywall).toBeGreaterThan(-1);
    expect(posPaywall).toBeLessThan(corpo.indexOf("lead.convertedEventId"));
  });
});
