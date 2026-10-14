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
// O ITEM DO BRIEFING NO SERVIDOR
//
// Os campos novos são aditivos: o item antigo continua igual; o novo grava e
// limpa cada campo; a concorrente não alcança nada; e o defeito do fornecedor
// anotado (o `null` recusado pelo validador) não volta.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora" });
  const outra = await autenticarComo(t, { nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival" });
  const ids = await t.run(async (ctx: MutationCtx) => {
    const donaId = (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora")).unique())!._id;
    const evento = await ctx.db.insert("events", {
      userId: donaId, name: "Casamento", type: "wedding", date: "2026-12-05", location: "Fazenda", clientName: "Ana", status: "planning",
    });
    const antigo = await ctx.db.insert("assemblyItems", {
      userId: donaId, eventId: evento, area: "ceremony", order: 0, name: "Arco antigo",
      includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe", createdAt: "2026-09-01", updatedAt: "2026-09-01",
    });
    return { evento, antigo };
  });
  return { t, dona, outra, ...ids };
}

describe("item novo, cadastrado pelo bloco", () => {
  it("nasce com bloco, ambiente e situação, e grava os campos da conferência", async () => {
    const { dona, evento } = await cenario();
    const id = await dona.mutation(api.assemblyItems.create, {
      eventId: evento, area: "custom", name: "Monograma", includeInAssemblyReport: true, checkOnAssembly: true,
      visibility: "equipe", bloco: "identidade", situacao: "em_avaliacao",
    });
    await dona.mutation(api.assemblyItems.update, {
      id, origem: "locadora", corAcabamento: "dourado", medidas: "1,2 m", posicao: "atrás do altar",
      responsavelMontagem: "Diego", reaproveitamento: { ambiente: "Salão", horario: "20h", responsavel: "Diego" },
    });
    const [item] = (await dona.query(api.assemblyItems.listByEvent, { eventId: evento })).filter((i) => i._id === id);
    expect(item).toMatchObject({
      bloco: "identidade", situacao: "em_avaliacao", origem: "locadora", corAcabamento: "dourado",
      medidas: "1,2 m", posicao: "atrás do altar", responsavelMontagem: "Diego",
      reaproveitamento: { ambiente: "Salão", horario: "20h", responsavel: "Diego" },
    });
  });

  it("null limpa cada campo", async () => {
    const { dona, evento } = await cenario();
    const id = await dona.mutation(api.assemblyItems.create, {
      eventId: evento, area: "party", name: "Cadeiras", includeInAssemblyReport: true, checkOnAssembly: true,
      visibility: "equipe", bloco: "mesas", origem: "acervo", reaproveitamento: { ambiente: "Lounge" },
    });
    await dona.mutation(api.assemblyItems.update, { id, origem: null, reaproveitamento: null, bloco: null });
    const [item] = (await dona.query(api.assemblyItems.listByEvent, { eventId: evento })).filter((i) => i._id === id);
    expect(item.origem).toBeUndefined();
    expect(item.reaproveitamento).toBeUndefined();
    expect(item.bloco).toBeUndefined();
  });

  it("situação e origem fora do vocabulário são recusadas", async () => {
    const { dona, antigo } = await cenario();
    await expect(dona.mutation(api.assemblyItems.update, { id: antigo, situacao: "talvez" } as never)).rejects.toThrow();
    await expect(dona.mutation(api.assemblyItems.update, { id: antigo, origem: "vizinho" } as never)).rejects.toThrow();
  });
});

describe("item antigo e fornecedor anotado", () => {
  it("o item antigo continua lido sem nenhum campo novo", async () => {
    const { dona, evento } = await cenario();
    const [item] = await dona.query(api.assemblyItems.listByEvent, { eventId: evento });
    expect(item.name).toBe("Arco antigo");
    expect(item.bloco).toBeUndefined();
    expect(item.situacao).toBeUndefined();
  });

  it("anotar o fornecedor (supplierId: null) grava o nome — o defeito de 14/10 não volta", async () => {
    const { dona, evento, antigo } = await cenario();
    await dona.mutation(api.assemblyItems.update, { id: antigo, supplierName: "Floricultura Fictícia", supplierId: null });
    const [item] = await dona.query(api.assemblyItems.listByEvent, { eventId: evento });
    expect(item.supplierName).toBe("Floricultura Fictícia");
    expect(item.supplierId).toBeUndefined();
  });
});

describe("a concorrente", () => {
  it("não altera o item de outra conta", async () => {
    const { outra, dona, evento, antigo } = await cenario();
    await expect(
      outra.mutation(api.assemblyItems.update, { id: antigo, situacao: "aprovado", origem: "espaco" }),
    ).rejects.toThrow(/não encontrado/i);
    const [item] = await dona.query(api.assemblyItems.listByEvent, { eventId: evento });
    expect(item.situacao).toBeUndefined();
  });

  it("não cria item no evento de outra conta", async () => {
    const { outra, evento } = await cenario();
    await expect(
      outra.mutation(api.assemblyItems.create, {
        eventId: evento, area: "party", name: "Intruso", includeInAssemblyReport: true, checkOnAssembly: true, visibility: "equipe", bloco: "mesas",
      }),
    ).rejects.toThrow();
  });
});
