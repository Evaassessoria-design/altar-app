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
// A PASTA DO EVENTO CABIA CINCO ARQUIVOS
//
// `saveContract` substituía o documento do MESMO TIPO. Com um tipo de contrato,
// um de aditivo, um de orçamento, um de referência e um "outro", o teto de um
// casamento inteiro era CINCO arquivos.
//
// Um casamento tem empresa de móveis, floricultura e iluminação, e cada uma
// manda contrato e orçamento. O segundo orçamento apagava o primeiro — com
// aviso na tela, mas apagava. O resto ia para o Drive e para o WhatsApp.
//
// O slot passou a ser (TIPO, FORNECEDOR). Documento sem fornecedor mantém o
// slot que sempre teve: a mudança só ACRESCENTA lugares.
// ═════════════════════════════════════════════════════════════════════════════

type Storage = { store: (b: Blob) => Promise<Id<"_storage">> };

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
        userId, name, type: "wedding" as const, date: "2026-12-05",
        location: "Fazenda", clientName: "Marina", status: "planning" as const,
      });
    return {
      donaId,
      marina: await evento(donaId, "Marina & Gabriel"),
      outroEvento: await evento(donaId, "Joana & Pedro"),
      eventoAlheio: await evento(rivalId, "Evento da rival"),
    };
  });

  const guardar = (c: string) =>
    t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: Storage }).storage.store(new Blob([c])),
    );
  const arquivoExiste = async (id: Id<"_storage">) =>
    (await t.run(async (ctx: MutationCtx) => ctx.storage.getUrl(id))) !== null;

  const fornecedor = (eventId: Id<"events">, companyName: string) =>
    dona.mutation(api.suppliers.create, {
      eventId, category: "mobiliario", companyName,
    });

  const anexar = async (
    eventId: Id<"events">,
    filename: string,
    kind: "contract" | "budget" | "reference" | "addendum" | "other",
    supplierId?: Id<"eventSuppliers">,
  ) => {
    const storageId = await guardar(filename);
    await dona.mutation(api.contracts.saveContract, {
      eventId, storageId, filename, kind, supplierId,
    });
    return storageId;
  };

  return { t, dona, rival, ids, guardar, arquivoExiste, fornecedor, anexar };
}

describe("cada fornecedor tem o próprio lugar", () => {
  it("dois orçamentos de fornecedores diferentes CONVIVEM", async () => {
    const { dona, ids, fornecedor, anexar, arquivoExiste } = await cenario();
    const moveis = await fornecedor(ids.marina, "Móveis SP");
    const flores = await fornecedor(ids.marina, "Flora Bela");

    const orcamentoMoveis = await anexar(ids.marina, "moveis.pdf", "budget", moveis);
    await anexar(ids.marina, "flores.pdf", "budget", flores);

    const pasta = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(pasta, "o segundo orçamento apagou o primeiro").toHaveLength(2);
    expect(await arquivoExiste(orcamentoMoveis)).toBe(true);
  });

  it("e contrato + orçamento do MESMO fornecedor também", async () => {
    const { dona, ids, fornecedor, anexar } = await cenario();
    const moveis = await fornecedor(ids.marina, "Móveis SP");
    await anexar(ids.marina, "contrato.pdf", "contract", moveis);
    await anexar(ids.marina, "orcamento.pdf", "budget", moveis);

    const pasta = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(pasta).toHaveLength(2);
  });

  it("o orçamento DO MESMO fornecedor ainda substitui — não vira histórico", async () => {
    // A regra de substituição continua valendo dentro do lugar. Trocar isso
    // seria outra decisão de produto, e a tela promete substituição.
    const { dona, ids, fornecedor, anexar, arquivoExiste } = await cenario();
    const moveis = await fornecedor(ids.marina, "Móveis SP");
    const primeiro = await anexar(ids.marina, "orcamento-v1.pdf", "budget", moveis);
    await anexar(ids.marina, "orcamento-v2.pdf", "budget", moveis);

    const pasta = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(pasta).toHaveLength(1);
    expect(pasta[0].filename).toBe("orcamento-v2.pdf");
    expect(await arquivoExiste(primeiro), "o arquivo substituído ficou no storage").toBe(false);
  });

  it("documento SEM fornecedor mantém o comportamento de sempre", async () => {
    // Nenhum arquivo já anexado muda de comportamento: "sem fornecedor" é UM
    // slot por tipo, como sempre foi.
    const { dona, ids, anexar } = await cenario();
    await anexar(ids.marina, "contrato-da-noiva-v1.pdf", "contract");
    await anexar(ids.marina, "contrato-da-noiva-v2.pdf", "contract");

    const pasta = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(pasta).toHaveLength(1);
    expect(pasta[0].filename).toBe("contrato-da-noiva-v2.pdf");
  });

  it("e o contrato de um fornecedor NÃO apaga o contrato da cliente", async () => {
    const { dona, ids, fornecedor, anexar } = await cenario();
    await anexar(ids.marina, "contrato-da-noiva.pdf", "contract");
    const moveis = await fornecedor(ids.marina, "Móveis SP");
    await anexar(ids.marina, "contrato-moveis.pdf", "contract", moveis);

    const pasta = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(pasta).toHaveLength(2);
  });
});

describe("o contrato da CLIENTE continua sendo o do evento", () => {
  it("`getContract` ignora contrato pendurado em fornecedor", async () => {
    // É ele que a leitura por IA interpreta para extrair parcelas. Ler o
    // contrato da empresa de móveis como se fosse o do casamento criaria
    // contas a receber que nunca existiram.
    const { dona, ids, fornecedor, anexar } = await cenario();
    const moveis = await fornecedor(ids.marina, "Móveis SP");
    await anexar(ids.marina, "contrato-moveis.pdf", "contract", moveis);

    expect(await dona.query(api.contracts.getContract, { eventId: ids.marina })).toBeNull();

    await anexar(ids.marina, "contrato-da-noiva.pdf", "contract");
    const contrato = await dona.query(api.contracts.getContract, { eventId: ids.marina });
    expect(contrato!.filename).toBe("contrato-da-noiva.pdf");
  });
});

describe("a pasta diz de quem veio cada arquivo", () => {
  it("o nome do fornecedor é resolvido na leitura, não gravado", async () => {
    const { t, dona, ids, fornecedor, anexar } = await cenario();
    const moveis = await fornecedor(ids.marina, "Móveis SP");
    await anexar(ids.marina, "orcamento.pdf", "budget", moveis);

    // Renomear a empresa aparece na pasta sem migração nenhuma.
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.patch(moveis, { companyName: "Móveis SP Ltda" });
    });

    const pasta = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(pasta[0].supplierName).toBe("Móveis SP Ltda");
  });

  it("documento do evento diz `null`, nunca 'desconhecido'", async () => {
    const { dona, ids, anexar } = await cenario();
    await anexar(ids.marina, "contrato.pdf", "contract");
    const pasta = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(pasta[0].supplierName).toBeNull();
  });
});

describe("remover o fornecedor não destrói a papelada", () => {
  it("o contrato assinado sobrevive, sem vínculo", async () => {
    // Arrumar a lista de fornecedores não desfaz o que foi combinado nem
    // apaga a prova disso. Regra 3 da cascata: referência ao que morreu é
    // LIMPA, não apagada.
    const { dona, ids, fornecedor, anexar, arquivoExiste } = await cenario();
    const moveis = await fornecedor(ids.marina, "Móveis SP");
    const arquivo = await anexar(ids.marina, "contrato-moveis.pdf", "contract", moveis);

    await dona.mutation(api.suppliers.remove, { id: moveis });

    const pasta = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    expect(pasta, "o contrato assinado sumiu com o cartão do fornecedor").toHaveLength(1);
    expect(pasta[0].supplierId).toBeUndefined();
    expect(pasta[0].supplierName).toBeNull();
    expect(await arquivoExiste(arquivo)).toBe(true);
  });

  it("e não mexe nos documentos dos OUTROS fornecedores", async () => {
    const { dona, ids, fornecedor, anexar } = await cenario();
    const moveis = await fornecedor(ids.marina, "Móveis SP");
    const flores = await fornecedor(ids.marina, "Flora Bela");
    await anexar(ids.marina, "moveis.pdf", "budget", moveis);
    await anexar(ids.marina, "flores.pdf", "budget", flores);

    await dona.mutation(api.suppliers.remove, { id: moveis });

    const pasta = await dona.query(api.contracts.listDocuments, { eventId: ids.marina });
    const daFlora = pasta.find((d) => d.filename === "flores.pdf")!;
    expect(daFlora.supplierId).toBe(flores);
  });
});

describe("nada atravessa a fronteira", () => {
  it("fornecedor de OUTRO evento é recusado, mesmo sendo da mesma conta", async () => {
    // Os dois eventos são dela, nenhuma regra de posse é violada — e ainda
    // assim seria o documento errado no lugar errado.
    const { dona, ids, fornecedor, guardar } = await cenario();
    const doOutroEvento = await fornecedor(ids.outroEvento, "Móveis SP");

    await expect(
      dona.mutation(api.contracts.saveContract, {
        eventId: ids.marina,
        storageId: await guardar("x"),
        filename: "x.pdf",
        kind: "budget",
        supplierId: doOutroEvento,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("fornecedor de outra CONTA é recusado", async () => {
    const { dona, rival, ids, guardar } = await cenario();
    const daRival = await rival.mutation(api.suppliers.create, {
      eventId: ids.eventoAlheio, category: "mobiliario", companyName: "Rival Móveis",
    });

    await expect(
      dona.mutation(api.contracts.saveContract, {
        eventId: ids.marina,
        storageId: await guardar("x"),
        filename: "x.pdf",
        kind: "budget",
        supplierId: daRival,
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("e a recusa não grava nada na pasta", async () => {
    const { dona, ids, fornecedor, guardar } = await cenario();
    const doOutroEvento = await fornecedor(ids.outroEvento, "Móveis SP");
    await expect(
      dona.mutation(api.contracts.saveContract, {
        eventId: ids.marina,
        storageId: await guardar("x"),
        filename: "x.pdf",
        kind: "budget",
        supplierId: doOutroEvento,
      }),
    ).rejects.toThrow();

    expect(await dona.query(api.contracts.listDocuments, { eventId: ids.marina })).toHaveLength(0);
  });

  it("a cascata do evento continua levando os documentos do fornecedor", async () => {
    const { dona, ids, fornecedor, anexar, arquivoExiste } = await cenario();
    const moveis = await fornecedor(ids.marina, "Móveis SP");
    const arquivo = await anexar(ids.marina, "contrato-moveis.pdf", "contract", moveis);

    await dona.mutation(api.events.remove, { id: ids.marina });

    expect(await arquivoExiste(arquivo), "documento de fornecedor ficou órfão").toBe(false);
  });
});
