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

// ═════════════════════════════════════════════════════════════════════════════
// O DOCUMENTO SABE DE QUEM ELE É
//
// A Pasta do Evento já resolvia documento bem — um lugar, um envio, uma
// exclusão. O que faltava era uma ETIQUETA, para a ficha da Móveis Bella
// responder "o que foi contratado + quais documentos existem + quais itens ele
// entrega" sem nenhum gerenciador de arquivos novo.
//
// A etiqueta muda uma regra antiga, e é isso que este arquivo trava: a
// substituição por TIPO virou substituição por tipo E DONO. O orçamento da
// Móveis Bella e o da Floricultura Florescer são dois orçamentos diferentes, e
// o segundo envio destruiria o primeiro em silêncio.
// ═════════════════════════════════════════════════════════════════════════════

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

    const evento = async (userId: Id<"users">, name: string) =>
      ctx.db.insert("events", {
        userId, name, type: "wedding", date: "2026-12-05",
        location: "Fazenda", clientName: "Marina", status: "planning",
      });
    const marina = await evento(donaId, "Marina & Gabriel");
    const joana = await evento(donaId, "Joana & Rafael");
    const eventoAlheio = await evento(rivalId, "Da rival");

    const fornecedor = async (userId: Id<"users">, eventId: Id<"events">, nome: string) =>
      ctx.db.insert("eventSuppliers", {
        userId, eventId, category: "moveis", companyName: nome,
      });

    return {
      donaId, marina, joana, eventoAlheio,
      bella: await fornecedor(donaId, marina, "Móveis Bella"),
      florescer: await fornecedor(donaId, marina, "Floricultura Florescer"),
      deJoana: await fornecedor(donaId, joana, "Fornecedor da Joana"),
      alheio: await fornecedor(rivalId, eventoAlheio, "Fornecedor da rival"),
    };
  });

  const arquivo = () =>
    t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: { store: (b: Blob) => Promise<Id<"_storage">> } })
        .storage.store(new Blob(["pdf"])),
    );

  const anexar = async (
    nome: string,
    kind: "contract" | "budget" | "addendum" | "reference" | "other",
    supplierId?: Id<"eventSuppliers">,
  ) =>
    dona.mutation(api.contracts.saveContract, {
      eventId: ids.marina,
      storageId: await arquivo(),
      filename: nome,
      kind,
      supplierId,
    });

  return { t, dona, ids, anexar, arquivo };
}

describe("a etiqueta de fornecedor", () => {
  it("o documento guarda de quem é, e a Pasta devolve o nome", async () => {
    const { dona, ids, anexar } = await cenario();
    await anexar("orcamento-bella.pdf", "budget", ids.bella);
    const docs = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(docs[0].supplierId).toBe(ids.bella);
    expect(docs[0].supplierName).toBe("Móveis Bella");
  });

  it("documento SEM fornecedor continua sendo do evento", async () => {
    const { dona, ids, anexar } = await cenario();
    await anexar("contrato.pdf", "contract");
    const docs = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(docs[0].supplierId).toBeUndefined();
    expect(docs[0].supplierName).toBeUndefined();
  });
});

describe("a substituição passou a olhar o DONO, não só o tipo", () => {
  it("dois orçamentos de fornecedores diferentes convivem", async () => {
    // Era o defeito que a etiqueta criaria se a regra não mudasse junto: o
    // segundo envio apagaria o primeiro em silêncio.
    const { dona, ids, anexar } = await cenario();
    await anexar("orcamento-bella.pdf", "budget", ids.bella);
    await anexar("orcamento-florescer.pdf", "budget", ids.florescer);

    const docs = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(docs.map((d) => d.filename).sort()).toEqual([
      "orcamento-bella.pdf", "orcamento-florescer.pdf",
    ]);
  });

  it("o MESMO fornecedor substitui o próprio documento do mesmo tipo", async () => {
    const { t, dona, ids, anexar } = await cenario();
    await anexar("orcamento-v1.pdf", "budget", ids.bella);
    const antes = await t.run((ctx: MutationCtx) => ctx.db.query("contracts").collect());
    await anexar("orcamento-v2.pdf", "budget", ids.bella);

    const docs = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(docs.map((d) => d.filename)).toEqual(["orcamento-v2.pdf"]);
    // E o arquivo antigo saiu do storage — não virou lixo.
    const url = await t.run((ctx: MutationCtx) => ctx.storage.getUrl(antes[0].storageId));
    expect(url).toBeNull();
  });

  it("documento do EVENTO substitui documento do evento, como sempre fez", async () => {
    const { dona, ids, anexar } = await cenario();
    await anexar("contrato-v1.pdf", "contract");
    await anexar("contrato-v2.pdf", "contract");
    const docs = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(docs.map((d) => d.filename)).toEqual(["contrato-v2.pdf"]);
  });

  it("o contrato do fornecedor NÃO apaga o contrato do evento", async () => {
    const { dona, ids, anexar } = await cenario();
    await anexar("contrato-do-evento.pdf", "contract");
    await anexar("contrato-da-bella.pdf", "contract", ids.bella);
    const docs = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(docs).toHaveLength(2);
  });
});

describe("posse: a etiqueta não é porta lateral", () => {
  it("fornecedor de OUTRO evento da mesma dona é recusado", async () => {
    const { anexar, ids } = await cenario();
    await expect(anexar("x.pdf", "budget", ids.deJoana)).rejects.toThrow(/não encontrado/i);
  });

  it("fornecedor de OUTRA conta responde NOT_FOUND, nunca FORBIDDEN", async () => {
    const { anexar, ids } = await cenario();
    await expect(anexar("x.pdf", "budget", ids.alheio)).rejects.toThrow(/não encontrado/i);
  });

  it("recusado o fornecedor, NADA é gravado", async () => {
    const { t, anexar, ids } = await cenario();
    await expect(anexar("x.pdf", "budget", ids.alheio)).rejects.toThrow();
    const docs = await t.run((ctx: MutationCtx) => ctx.db.query("contracts").collect());
    expect(docs).toHaveLength(0);
  });

  it("a Pasta de outra conta não enxerga estes documentos", async () => {
    const { t, ids, anexar } = await cenario();
    await anexar("orcamento.pdf", "budget", ids.bella);
    const rival = await autenticarComo(t, {
      nome: "Rival2", email: "r2@ex.com", role: "user", subject: "auth|rival",
    });
    expect(await rival.query(api.contracts.listDocuments, { eventId: ids.marina }))
      .toEqual([]);
  });
});

describe("compatibilidade", () => {
  it("documento anterior à etiqueta continua abrindo e é do evento", async () => {
    const { t, dona, ids } = await cenario();
    // O arquivo é criado DENTRO do mesmo `t.run`: `arquivo()` abre um por
    // conta própria, e um `t.run` aninhado trava o convex-test.
    await t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("contracts", {
        eventId: ids.marina,
        userId: ids.donaId,
        storageId: await (
          ctx as unknown as { storage: { store: (b: Blob) => Promise<Id<"_storage">> } }
        ).storage.store(new Blob(["pdf antigo"])),
        filename: "antigo.pdf",
        uploadedAt: "2025-01-01T00:00:00.000Z",
      }),
    );
    const docs = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(docs[0].filename).toBe("antigo.pdf");
    // Sem `kind` gravado, a leitura continua dizendo "contract".
    expect(docs[0].kind).toBe("contract");
    expect(docs[0].supplierId).toBeUndefined();
    expect(docs[0].url).not.toBeNull();
  });
});
