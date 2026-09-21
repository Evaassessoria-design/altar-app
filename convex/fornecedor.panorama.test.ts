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

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// O FORNECEDOR POR INTEIRO
//
// Ela vai ligar para a floricultura. Antes quer saber: já trabalhei com eles
// em quantos casamentos? quanto já comprei? ficou algo em aberto?
//
// A resposta existia espalhada — `supplierCatalog.get` sem nenhuma tela,
// `listEventsForSupplier` mostrando três nomes numa linha do catálogo, e as
// compras só alcançáveis abrindo evento por evento.
//
// ── O QUE O TOTAL É, E O QUE ELE NÃO É ──────────────────────────────────────
// `valor` soma `unitPrice × quantity` das compras NÃO canceladas: é o que foi
// combinado com o fornecedor, não o que saiu do caixa. Compra sem preço não
// entra — e a resposta diz quantas são, porque um total que ignora dez itens,
// exibido sozinho, engana.
// ═════════════════════════════════════════════════════════════════════════════

const NOW = "2026-09-02T12:00:00.000Z";

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Dona", email: "dona@ex.com", role: "user", subject: "auth|dona",
  });
  const outra = await autenticarComo(t, {
    nome: "Outra", email: "outra@ex.com", role: "user", subject: "auth|outra",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (subject: string) =>
      (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", subject))
        .unique())!._id;
    const donaId = await idDe("auth|dona");
    const outraId = await idDe("auth|outra");

    const florista = await ctx.db.insert("suppliers", {
      userId: donaId, companyName: "Flores de Aurora", searchName: "flores de aurora",
      category: "flores", phone: "(11) 90000-0000", createdAt: NOW, updatedAt: NOW,
    });
    const alheio = await ctx.db.insert("suppliers", {
      userId: outraId, companyName: "Florista alheia", searchName: "florista alheia",
      category: "flores", createdAt: NOW, updatedAt: NOW,
    });

    const marina = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-10-10",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });
    const ana = await ctx.db.insert("events", {
      userId: donaId, name: "Ana & Pedro", type: "wedding", date: "2025-05-20",
      location: "Salão", clientName: "Ana", status: "completed",
    });
    const eventoDaOutra = await ctx.db.insert("events", {
      userId: outraId, name: "Da outra", type: "wedding", date: "2026-10-10",
      location: "L", clientName: "C", status: "confirmed",
    });

    return { donaId, outraId, florista, alheio, marina, ana, eventoDaOutra };
  });

  return { t, dona, outra, ...ids };
}

const compra = (
  sessao: Awaited<ReturnType<typeof autenticarComo>>,
  eventId: string,
  supplierId: string,
  extra: Record<string, unknown> = {},
) =>
  sessao.mutation(api.purchases.addPurchase, {
    eventId: eventId as never,
    name: "Rosa branca",
    supplierId: supplierId as never,
    quantity: 100,
    unitPrice: 4.2,
    ...extra,
  });

describe("o que já comprei deste fornecedor", () => {
  it("soma preço × quantidade das compras não canceladas", async () => {
    const { dona, marina, ana, florista } = await cenario();
    await compra(dona, marina, florista);
    await compra(dona, ana, florista, { quantity: 50, unitPrice: 10 });

    const r = await dona.query(api.supplierCatalog.panorama, { supplierId: florista });
    expect(r!.compras.total).toBe(2);
    expect(r!.compras.valor).toBe(920); // 100×4,20 + 50×10
  });

  it("compra CANCELADA não entra no total", async () => {
    const { dona, marina, florista } = await cenario();
    await compra(dona, marina, florista);
    await compra(dona, marina, florista, { name: "Rosa cancelada", status: "cancelado" });

    const r = await dona.query(api.supplierCatalog.panorama, { supplierId: florista });
    expect(r!.compras.total).toBe(1);
    expect(r!.compras.canceladas).toBe(1);
    expect(r!.compras.valor).toBe(420);
  });

  it("compra SEM PREÇO é contada à parte — o total não pode fingir que ela não existe", async () => {
    const { dona, marina, florista } = await cenario();
    await compra(dona, marina, florista);
    await compra(dona, marina, florista, { name: "Eucalipto", unitPrice: undefined });

    const r = await dona.query(api.supplierCatalog.panorama, { supplierId: florista });
    expect(r!.compras.total).toBe(2);
    expect(r!.compras.semPreco).toBe(1);
    expect(r!.compras.valor).toBe(420);
  });

  it("quantidade ausente vale 1, e não zera a linha", async () => {
    const { dona, marina, florista } = await cenario();
    await compra(dona, marina, florista, { quantity: undefined, unitPrice: 300 });
    const r = await dona.query(api.supplierCatalog.panorama, { supplierId: florista });
    expect(r!.compras.valor).toBe(300);
  });

  it("conta o que ainda exige ação", async () => {
    const { dona, marina, florista } = await cenario();
    await compra(dona, marina, florista, { status: "necessidade" });
    await compra(dona, marina, florista, { name: "Já recebida", status: "recebido" });

    const r = await dona.query(api.supplierCatalog.panorama, { supplierId: florista });
    expect(r!.compras.pendentes).toBe(1);
  });

  it("um preço podre não transforma o total em NaN", async () => {
    // A soma é `somaEmDinheiro`, que resiste — um registro anterior às travas
    // do Financeiro não pode apagar o número inteiro da tela.
    const { t, dona, marina, florista, donaId } = await cenario();
    await compra(dona, marina, florista);
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("purchaseItems", {
        userId: donaId, eventId: marina, name: "Linha podre", order: 99,
        supplierId: florista, quantity: 2, unitPrice: NaN, isPurchased: false,
        status: "necessidade",
      });
    });
    const r = await dona.query(api.supplierCatalog.panorama, { supplierId: florista });
    expect(Number.isNaN(r!.compras.valor)).toBe(false);
    expect(r!.compras.valor).toBe(420);
  });

  it("sem compra nenhuma, devolve zero — não devolve nada", async () => {
    const { dona, florista } = await cenario();
    const r = await dona.query(api.supplierCatalog.panorama, { supplierId: florista });
    expect(r!.compras.total).toBe(0);
    expect(r!.compras.valor).toBe(0);
    expect(r!.compras.recentes).toEqual([]);
  });
});

describe("onde já usei este fornecedor", () => {
  it("lista os eventos, do mais recente para o mais antigo", async () => {
    const { t, dona, donaId, marina, ana, florista } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("eventSuppliers", {
        userId: donaId, eventId: ana, category: "flores",
        companyName: "Flores de Aurora", supplierId: florista, status: "finalizado",
      });
      await ctx.db.insert("eventSuppliers", {
        userId: donaId, eventId: marina, category: "flores",
        companyName: "Flores de Aurora", supplierId: florista, status: "confirmado",
        nextAction: "Confirmar entrega às 8h",
      });
    });

    const r = await dona.query(api.supplierCatalog.panorama, { supplierId: florista });
    expect(r!.eventos.map((e) => e.nome)).toEqual(["Marina & Gabriel", "Ana & Pedro"]);
    expect(r!.eventos[0].proximaAcao).toBe("Confirmar entrega às 8h");
    expect(r!.eventos[1].status).toBe("finalizado");
  });

  it("fornecedor novo não inventa histórico", async () => {
    const { dona, florista } = await cenario();
    expect((await dona.query(api.supplierCatalog.panorama, { supplierId: florista }))!.eventos).toEqual([]);
  });
});

describe("id de outra empresa não abre nada", () => {
  it("o fornecedor alheio responde como inexistente", async () => {
    // `null` cobre inexistente E de outra empresa, sem distinguir: dizer "sem
    // permissão" já confirmaria que o fornecedor existe.
    const { dona, alheio } = await cenario();
    expect(await dona.query(api.supplierCatalog.panorama, { supplierId: alheio })).toBeNull();
  });

  it("compra da outra empresa no MESMO fornecedor não entra na conta", async () => {
    // Só nasceria de dado corrompido — e é exatamente quando a conferência de
    // dono precisa estar lá.
    const { t, dona, outraId, marina, florista, eventoDaOutra } = await cenario();
    await compra(dona, marina, florista);
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("purchaseItems", {
        userId: outraId, eventId: eventoDaOutra, name: "Compra alheia", order: 0,
        supplierId: florista, quantity: 1000, unitPrice: 1000, isPurchased: false,
        status: "necessidade",
      });
    });
    const r = await dona.query(api.supplierCatalog.panorama, { supplierId: florista });
    expect(r!.compras.total).toBe(1);
    expect(r!.compras.valor).toBe(420);
  });

  it("vínculo de evento da outra empresa não entra na lista", async () => {
    const { t, dona, outraId, eventoDaOutra, florista } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("eventSuppliers", {
        userId: outraId, eventId: eventoDaOutra, category: "flores",
        companyName: "Flores de Aurora", supplierId: florista,
      });
    });
    expect((await dona.query(api.supplierCatalog.panorama, { supplierId: florista }))!.eventos).toEqual([]);
  });

  it("sem sessão, ninguém abre", async () => {
    const { t, florista } = await cenario();
    await expect(
      t.query(api.supplierCatalog.panorama, { supplierId: florista }),
    ).rejects.toThrow();
  });
});

describe("a página do fornecedor", () => {
  const TELA = "src/pages/app/fornecedores/[id]/page.tsx";
  const fonte = readFileSync(TELA, "utf-8");

  it("não dá nota, não classifica e não ranqueia", () => {
    // Nada disso sai de dado que o ALTAR tenha: seriam números inventados
    // sobre gente real.
    const visivel = fonte.replace(/\/\/[^\n]*/g, " ").replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ");
    expect(visivel).not.toMatch(/estrela|ranking|nota d|avalia|score|rating/i);
  });

  it("não edita o cadastro — isso continua no catálogo", () => {
    // Uma segunda tela de edição divergiria da primeira.
    expect(fonte).not.toContain("api.supplierCatalog.update");
    expect(fonte).not.toContain("api.supplierCatalog.create");
  });

  it("diz o que o total deixa de fora", () => {
    expect(fonte).toMatch(/sem as canceladas/);
    expect(fonte).toMatch(/saiu do caixa está no Financeiro/);
  });

  it("o telefone é tocável — a tela abre antes de ligar", () => {
    expect(fonte).toMatch(/tel:\$\{telefoneDigits\}/);
    expect(fonte).toMatch(/min-h-9/);
  });

  it("o catálogo leva até ela", () => {
    const catalogo = readFileSync("src/pages/app/fornecedores/page.tsx", "utf-8");
    expect(catalogo).toMatch(/to=\{`\/fornecedores\/\$\{f\._id\}`\}/);
  });

  it("a rota existe e está declarada como sem menu", () => {
    expect(readFileSync("src/App.tsx", "utf-8")).toContain('path="/fornecedores/:id"');
    expect(readFileSync("src/lib/navigation.ts", "utf-8")).toContain('"/fornecedores/:id"');
  });
});

describe("a situação do fornecedor tem uma lista só", () => {
  it("a tela do evento não mantém cópia própria", () => {
    // O comentário daquela tela já registra que uma cópia anterior existiu e
    // foi eliminada por divergir. Esta é a trava contra a próxima.
    const tela = readFileSync("src/pages/app/events/[id]/fornecedores/page.tsx", "utf-8");
    expect(tela).toContain("SUPPLIER_STATUSES");
    expect(tela).not.toMatch(/label: "Em negociação", cls:/);
  });
});
