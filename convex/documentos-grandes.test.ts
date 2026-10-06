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
import { MB, TAMANHO_MAXIMO_DOCUMENTO } from "./lib/arquivos";

// ═════════════════════════════════════════════════════════════════════════════
// DOCUMENTOS DE ATÉ 100 MB — AS PORTAS DO SERVIDOR
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// O teto de documento existia só na TELA. `contracts.saveContract` (pasta do
// evento) e `financeiro.anexarComprovante` não conferiam tamanho nenhum, e
// `leadDocuments.save` conferia o número que o navegador declara. Quem chama a
// mutation direto guardava o que quisesse — e storage é cobrado.
//
// ── O QUE ESTE ARQUIVO TRAVA ────────────────────────────────────────────────
//  · as três portas medem o arquivo GUARDADO, não o declarado;
//  · recusar o arquivo novo NÃO apaga o contrato antigo (a substituição por
//    tipo acontecia antes de qualquer conferência);
//  · o documento grande do lead continua visível depois da conversão;
//  · nada disso abriu porta entre contas.
//
// Os blobs têm o tamanho de verdade: 100 MB + 1 byte é alocado em memória.
// Testar com 4 bytes declarando 100 MB era o que deixava o defeito passar.
// ═════════════════════════════════════════════════════════════════════════════

const ACIMA = TAMANHO_MAXIMO_DOCUMENTO + 1;

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });
  const rival = await autenticarComo(t, {
    nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (s: string) =>
      (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", s))
        .unique())!._id;
    const donaId = await idDe("auth|aurora");
    const rivalId = await idDe("auth|rival");
    // Converter lead cria evento, e criar evento passa pelo paywall.
    await ctx.db.patch(donaId, { subscriptionStatus: "active" });

    const marina = await ctx.db.insert("events", {
      userId: donaId, name: "Marina & Gabriel", type: "wedding", date: "2026-12-05",
      location: "Fazenda", clientName: "Marina", status: "planning",
    });
    const lead = await ctx.db.insert("leads", {
      userId: donaId, clientName: "Joana", stage: "contact", order: 0,
    });
    const lancamento = await ctx.db.insert("transactions", {
      userId: donaId, eventId: marina, type: "income" as const, category: "Contrato",
      description: "Sinal", amount: 250000, date: "2026-10-10", isPaid: false,
    });
    return { donaId, rivalId, marina, lead, lancamento };
  });

  const guardar = (bytes: number) =>
    t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "application/pdf" })),
    );

  return { t, dona, rival, ids, guardar };
}

describe("pasta do evento — contracts.saveContract", () => {
  it("aceita 100 MB exatos", async () => {
    const c = await cenario();
    const storageId = await c.guardar(TAMANHO_MAXIMO_DOCUMENTO);
    await expect(
      c.dona.mutation(api.contracts.saveContract, {
        eventId: c.ids.marina, storageId, filename: "Orçamento.pptx", kind: "budget",
      }),
    ).resolves.toBeTruthy();
  });

  it("recusa 100 MB + 1 byte com a frase de gente", async () => {
    const c = await cenario();
    const storageId = await c.guardar(ACIMA);
    await expect(
      c.dona.mutation(api.contracts.saveContract, {
        eventId: c.ids.marina, storageId, filename: "Grande.pdf", kind: "budget",
      }),
    ).rejects.toThrow(/ultrapassa o limite de 100 MB/);
  });

  it("recusar o arquivo novo NÃO apaga o contrato que já estava lá", async () => {
    // A substituição por tipo apaga o anterior. Se a conferência viesse
    // depois dela, a pasta perderia os dois — o velho e o novo recusado.
    const c = await cenario();
    const antigo = await c.guardar(2 * MB);
    await c.dona.mutation(api.contracts.saveContract, {
      eventId: c.ids.marina, storageId: antigo, filename: "Contrato assinado.pdf",
    });

    const grande = await c.guardar(ACIMA);
    await expect(
      c.dona.mutation(api.contracts.saveContract, {
        eventId: c.ids.marina, storageId: grande, filename: "Contrato novo.pdf",
      }),
    ).rejects.toThrow(/ultrapassa o limite/);

    const docs = await c.dona.query(api.contracts.listDocuments, { eventId: c.ids.marina });
    expect(docs.map((d) => d.filename)).toEqual(["Contrato assinado.pdf"]);
    expect(docs[0]?.url).toBeTruthy();
  });

  it("arquivo que não chegou ao storage é recusado sem gravar linha", async () => {
    const c = await cenario();
    const storageId = await c.guardar(1024);
    await c.t.run(async (ctx) => ctx.storage.delete(storageId));
    await expect(
      c.dona.mutation(api.contracts.saveContract, {
        eventId: c.ids.marina, storageId, filename: "x.pdf",
      }),
    ).rejects.toThrow(/não chegou ao servidor/);
    const docs = await c.dona.query(api.contracts.listDocuments, { eventId: c.ids.marina });
    expect(docs).toEqual([]);
  });

  it("a rival recebe NOT_FOUND no evento da dona, mesmo com arquivo válido", async () => {
    const c = await cenario();
    const storageId = await c.guardar(1 * MB);
    await expect(
      c.rival.mutation(api.contracts.saveContract, {
        eventId: c.ids.marina, storageId, filename: "intruso.pdf",
      }),
    ).rejects.toThrow(/NOT_FOUND|não encontrado/i);
  });
});

describe("comprovante — financeiro.anexarComprovante", () => {
  it("aceita 100 MB exatos e recusa 100 MB + 1", async () => {
    const c = await cenario();
    const cabe = await c.guardar(TAMANHO_MAXIMO_DOCUMENTO);
    await expect(
      c.dona.mutation(api.financeiro.anexarComprovante, {
        id: c.ids.lancamento, storageId: cabe, filename: "pix.pdf",
      }),
    ).resolves.toEqual({ total: 1 });

    const grande = await c.guardar(ACIMA);
    await expect(
      c.dona.mutation(api.financeiro.anexarComprovante, {
        id: c.ids.lancamento, storageId: grande, filename: "grande.pdf",
      }),
    ).rejects.toThrow(/ultrapassa o limite de 100 MB/);
  });
});

describe("o documento grande do lead sobrevive à conversão", () => {
  it("anexado no funil, aparece no evento convertido — e só para a dona", async () => {
    const c = await cenario();
    const storageId = await c.guardar(36 * MB);
    await c.dona.mutation(api.leadDocuments.save, {
      leadId: c.ids.lead, storageId, fileName: "Orçamento fornecedor.pptx",
      documentType: "proposta", fileSize: 36 * MB,
    });

    const eventId = (await c.dona.mutation(api.funil.convertToEvent, {
      leadId: c.ids.lead, eventName: "Joana & Rafael", eventDate: "2027-03-20",
      location: "Sítio", clientName: "Joana", type: "wedding",
    })) as Id<"events">;

    const noEvento = await c.dona.query(api.leadDocuments.listForEvent, { eventId });
    expect(noEvento).toHaveLength(1);
    expect(noEvento[0]?.fileName).toBe("Orçamento fornecedor.pptx");
    expect(noEvento[0]?.fileSize).toBe(36 * MB);
    expect(noEvento[0]?.url).toBeTruthy();

    // Continua também no lead: converter não move nada.
    const noLead = await c.dona.query(api.leadDocuments.list, { leadId: c.ids.lead });
    expect(noLead).toHaveLength(1);

    // A rival não enxerga o evento da dona, nem por id.
    const daRival = await c.rival.query(api.leadDocuments.listForEvent, { eventId });
    expect(daRival).toEqual([]);
  });
});
