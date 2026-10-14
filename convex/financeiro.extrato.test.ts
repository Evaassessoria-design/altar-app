import { describe, expect, it, vi } from "vitest";

// Mesma substituição de sessão dos demais testes de banco — ver test.auth.ts.
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
import type { Id } from "./_generated/dataModel";
import { montarExtrato, periodoDoMes } from "./lib/extrato";

// ═════════════════════════════════════════════════════════════════════════════
// O EXTRATO NO SERVIDOR — TUDO DA CONTA, NADA DE OUTRA
//
// A pergunta que importa não é "funciona", é "lê tudo e só o que é dela":
// mais de 500 lançamentos, página a página, sem a linha da concorrente.
// ═════════════════════════════════════════════════════════════════════════════

const LANCAMENTOS_DA_DONA = 620;

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, { nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora" });
  const outra = await autenticarComo(t, { nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival" });
  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (subject: string) =>
      (await ctx.db.query("users").withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", subject)).unique())!._id;
    const donaId = await idDe("auth|aurora");
    const outraId = await idDe("auth|rival");
    const evento = await ctx.db.insert("events", {
      userId: donaId, name: "Casamento Ana", type: "wedding", date: "2026-11-20", location: "Fazenda", clientName: "Ana", status: "confirmed",
    });
    const eventoAlheio = await ctx.db.insert("events", {
      userId: outraId, name: "Evento da rival", type: "wedding", date: "2026-11-21", location: "Salão", clientName: "Cliente da rival", status: "confirmed",
    });
    const storage = (ctx as unknown as { storage: { store: (b: Blob) => Promise<Id<"_storage">> } }).storage;
    const arquivo = await storage.store(new Blob(["comprovante"]));
    for (let i = 0; i < LANCAMENTOS_DA_DONA; i++) {
      await ctx.db.insert("transactions", {
        userId: donaId, eventId: i % 2 ? evento : undefined, type: "income", category: "Contrato",
        description: `Parcela ${i}`, amount: 10, date: "2026-10-10", isPaid: true,
        paidAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      });
    }
    // Uma parcela com recebimento parcial e comprovante.
    await ctx.db.insert("transactions", {
      userId: donaId, eventId: evento, type: "income", category: "Contrato", description: "Entrada",
      amount: 1000, date: "2026-10-15", isPaid: false,
      recebimentos: [{ id: "r1", valor: 400, data: "2026-10-12", forma: "PIX", comprovanteStorageId: arquivo, registradoEm: "2026-10-12T12:00:00Z", chave: "k1" }],
      comprovantes: [{ storageId: arquivo, filename: "pix.pdf", uploadedAt: "2026-10-12T12:00:00Z" }],
    });
    // A concorrente tem lançamento no MESMO período, com valor inconfundível.
    await ctx.db.insert("transactions", {
      userId: outraId, eventId: eventoAlheio, type: "income", category: "Contrato", description: "Da rival",
      amount: 99999, date: "2026-10-10", isPaid: true, paidAt: "2026-10-10",
    });
    return { evento, eventoAlheio };
  });
  return { t, dona, outra, ...ids };
}

async function lerTudo(sessao: Awaited<ReturnType<typeof cenario>>["dona"], numItems = 250) {
  const todas: Awaited<ReturnType<typeof sessao.query<typeof api.financeiro.extratoPagina>>>["page"] = [];
  let cursor: string | null = null;
  let paginas = 0;
  for (;;) {
    const r: { page: typeof todas; isDone: boolean; continueCursor: string } = await sessao.query(
      api.financeiro.extratoPagina,
      { paginationOpts: { numItems, cursor } },
    );
    todas.push(...r.page);
    paginas++;
    if (r.isDone) break;
    cursor = r.continueCursor;
  }
  return { todas, paginas };
}

describe("lê tudo, em páginas", () => {
  it("621 lançamentos em 3 páginas de 250 — nenhum fica de fora, e a conta fecha", async () => {
    const { dona } = await cenario();
    const { todas, paginas } = await lerTudo(dona);
    expect(todas).toHaveLength(LANCAMENTOS_DA_DONA + 1);
    expect(paginas).toBe(3);
    const e = montarExtrato(todas, { ...periodoDoMes("2026-10"), evento: "todos", tipo: "todos" });
    expect(e.totais.recebidoCentavos).toBe(LANCAMENTOS_DA_DONA * 1000 + 40000);
    expect(e.totaisPendentes.aReceberCentavos).toBe(60000);
  });

  it("página pedida grande demais é recusada, em vez de ler sem limite", async () => {
    const { dona } = await cenario();
    await expect(
      dona.query(api.financeiro.extratoPagina, { paginationOpts: { numItems: 5000, cursor: null } }),
    ).rejects.toThrow(/grande demais/);
  });

  it("o comprovante sai como presença, nunca como id ou link de arquivo", async () => {
    const { dona } = await cenario();
    const { todas } = await lerTudo(dona);
    const entrada = todas.find((l) => l.description === "Entrada")!;
    expect(entrada.temComprovante).toBe(true);
    expect(entrada.recebimentos[0].comprovanteStorageId).toBe("tem");
    expect(JSON.stringify(todas)).not.toMatch(/https?:|_storage|storageId":"[a-z0-9]{20,}/);
  });
});

describe("isolamento entre empresas", () => {
  it("o lançamento da concorrente nunca aparece, nem no total", async () => {
    const { dona } = await cenario();
    const { todas } = await lerTudo(dona);
    expect(todas.some((l) => l.description === "Da rival")).toBe(false);
    expect(JSON.stringify(todas)).not.toContain("99999");
  });

  it("a concorrente lê só o dela", async () => {
    const { outra } = await cenario();
    const { todas } = await lerTudo(outra);
    expect(todas.map((l) => l.description)).toEqual(["Da rival"]);
  });

  it("nome de evento de outra conta não volta, mesmo pedindo o id", async () => {
    const { outra, evento, eventoAlheio } = await cenario();
    const r = await outra.query(api.financeiro.eventosDoExtrato, { ids: [evento, eventoAlheio] });
    expect(r.map((e) => e.name)).toEqual(["Evento da rival"]);
  });

  it("sem sessão, nada", async () => {
    const { t } = await cenario();
    await expect(t.query(api.financeiro.extratoPagina, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow();
  });
});
