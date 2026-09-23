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
import { identidadeDoFornecedor, separarPatch } from "./lib/fornecedorDoEvento";

// ═════════════════════════════════════════════════════════════════════════════
// O FORNECEDOR VIVO — IDENTIDADE VEM DO CATÁLOGO, COMBINADO FICA NO EVENTO
//
// O schema afirmava que a leitura consultava o catálogo quando havia vínculo.
// Não consultava. Corrigir o telefone da floricultura no catálogo não chegava
// a evento nenhum, e ela ligava para o número errado num casamento que ainda
// ia acontecer.
//
// A linha que este arquivo protege:
//
//   IDENTIDADE  (telefone, e-mail, contato, redes, endereço, logo)
//               → muda uma vez, vale em todo lugar;
//
//   COMBINADO   (categoria, situação, observação, condição, dados de
//               pagamento, alinhamentos, próxima ação)
//               → é daquele evento, e o catálogo NÃO pode reescrever.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const donaId = (await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|aurora"))
      .unique())!._id;

    const evento = async (name: string) =>
      ctx.db.insert("events", {
        userId: donaId, name, type: "wedding", date: "2026-12-05",
        location: "Fazenda", clientName: "Marina", status: "planning",
      });

    const marina = await evento("Marina & Gabriel");
    const joana = await evento("Joana & Rafael");

    const florescer = await ctx.db.insert("suppliers", {
      userId: donaId,
      companyName: "Floricultura Florescer",
      searchName: "floricultura florescer",
      category: "flores",
      phone: "(11) 90000-0000",
      contactName: "Dona Rosa",
      email: "contato@florescer.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    return { donaId, marina, joana, florescer };
  });

  return { t, dona, ids };
}

describe("a correção do telefone chega aos eventos", () => {
  it("o evento lê o telefone ATUAL do catálogo, não a cópia do dia do vínculo", async () => {
    const { t, dona, ids } = await cenario();

    await dona.mutation(api.suppliers.createFromCatalog, {
      eventId: ids.marina, supplierId: ids.florescer,
    });

    // Ela troca de número. No catálogo, uma vez.
    await dona.mutation(api.supplierCatalog.update, {
      supplierId: ids.florescer, phone: "(11) 98888-7777",
    });

    const noEvento = await dona.query(api.suppliers.listByEvent, { eventId: ids.marina });
    expect(noEvento[0].phone).toBe("(11) 98888-7777");
    expect(noEvento[0].doCatalogo).toBe(true);

    // A cópia no evento continua no banco como fallback — nada foi destruído.
    const linha = await t.run((ctx: MutationCtx) => ctx.db.get(noEvento[0]._id));
    expect(linha?.phone).toBe("(11) 90000-0000");
  });

  it("a correção alcança TODOS os eventos vinculados de uma vez", async () => {
    const { dona, ids } = await cenario();
    for (const eventId of [ids.marina, ids.joana]) {
      await dona.mutation(api.suppliers.createFromCatalog, { eventId, supplierId: ids.florescer });
    }
    await dona.mutation(api.supplierCatalog.update, {
      supplierId: ids.florescer, phone: "(11) 97777-6666",
    });

    for (const eventId of [ids.marina, ids.joana]) {
      const lista = await dona.query(api.suppliers.listByEvent, { eventId });
      expect(lista[0].phone).toBe("(11) 97777-6666");
    }
  });

  it("corrigir NA TELA DO EVENTO sobe para o catálogo", async () => {
    const { t, dona, ids } = await cenario();
    const vinculo = await dona.mutation(api.suppliers.createFromCatalog, {
      eventId: ids.marina, supplierId: ids.florescer,
    });

    await dona.mutation(api.suppliers.update, {
      id: vinculo as Id<"eventSuppliers">, phone: "(11) 95555-4444",
    });

    // Sem isto a correção morria naquele evento e o catálogo seguia errado —
    // ela teria de corrigir duas vezes, e ninguém corrige duas vezes.
    const doCatalogo = await t.run((ctx: MutationCtx) => ctx.db.get(ids.florescer));
    expect(doCatalogo?.phone).toBe("(11) 95555-4444");
  });

  it("fornecedor cadastrado NO EVENTO já nasce no catálogo, e a regra vale para ele", async () => {
    // `suppliers.create` chama `ensureInCatalog` desde que o catálogo existe:
    // quem cadastra um buffet hoje encontra esse buffet pronto no próximo
    // evento. Então ele também é um fornecedor VIVO.
    const { t, dona, ids } = await cenario();
    const buffet = await dona.mutation(api.suppliers.create, {
      eventId: ids.marina, category: "buffet", companyName: "Buffet Avulso",
      phone: "(11) 91111-1111",
    });
    await dona.mutation(api.suppliers.update, {
      id: buffet as Id<"eventSuppliers">, phone: "(11) 92222-2222",
    });

    const linha = (await dona.query(api.suppliers.listByEvent, { eventId: ids.marina }))
      .find((s) => s._id === buffet)!;
    expect(linha.phone).toBe("(11) 92222-2222");
    expect(linha.doCatalogo).toBe(true);

    const noCatalogo = await t.run((ctx: MutationCtx) =>
      ctx.db.get(linha.supplierId as Id<"suppliers">),
    );
    expect(noCatalogo?.phone).toBe("(11) 92222-2222");
  });

  it("vínculo ANTERIOR ao catálogo continua funcionando, lendo a cópia do evento", async () => {
    // É o estado de todo `eventSuppliers` gravado antes de `supplierId`
    // existir. Nada foi migrado, e nada precisa ser.
    const { t, dona, ids } = await cenario();
    const antigo = await t.run((ctx: MutationCtx) =>
      ctx.db.insert("eventSuppliers", {
        userId: ids.donaId, eventId: ids.marina,
        category: "som", companyName: "Som do Vale", phone: "(11) 93333-3333",
      }),
    );
    const linha = (await dona.query(api.suppliers.listByEvent, { eventId: ids.marina }))
      .find((s) => s._id === antigo)!;
    expect(linha.phone).toBe("(11) 93333-3333");
    expect(linha.doCatalogo).toBe(false);

    // E editar continua indo para o evento, como sempre foi.
    await dona.mutation(api.suppliers.update, {
      id: antigo, phone: "(11) 94444-4444",
    });
    const depois = await t.run((ctx: MutationCtx) => ctx.db.get(antigo));
    expect(depois?.phone).toBe("(11) 94444-4444");
  });

  it("vínculo APONTANDO PARA O VAZIO degrada para a cópia do evento", async () => {
    // Ponteiro quebrado não pode fazer a tela do fornecedor sumir.
    const { t, dona, ids } = await cenario();
    const vinculo = await dona.mutation(api.suppliers.createFromCatalog, {
      eventId: ids.marina, supplierId: ids.florescer,
    });
    await t.run((ctx: MutationCtx) => ctx.db.delete(ids.florescer));

    const linha = (await dona.query(api.suppliers.listByEvent, { eventId: ids.marina }))
      .find((s) => s._id === vinculo)!;
    expect(linha.companyName).toBe("Floricultura Florescer");
    expect(linha.phone).toBe("(11) 90000-0000");
    expect(linha.doCatalogo).toBe(false);
  });
});

describe("o combinado do evento não é reescrito pelo catálogo", () => {
  it("observação e condição continuam sendo daquele evento", async () => {
    const { dona, ids } = await cenario();
    const emMarina = await dona.mutation(api.suppliers.createFromCatalog, {
      eventId: ids.marina, supplierId: ids.florescer,
    });
    const emJoana = await dona.mutation(api.suppliers.createFromCatalog, {
      eventId: ids.joana, supplierId: ids.florescer,
    });

    await dona.mutation(api.suppliers.update, {
      id: emMarina as Id<"eventSuppliers">,
      notes: "Entrega às 6h, portão dos fundos",
      commercialInfo: "30% na assinatura",
      status: "contratado",
    });
    await dona.mutation(api.suppliers.update, {
      id: emJoana as Id<"eventSuppliers">,
      notes: "Só montagem no dia",
      status: "cotacao",
    });

    const marina = (await dona.query(api.suppliers.listByEvent, { eventId: ids.marina }))[0];
    const joana = (await dona.query(api.suppliers.listByEvent, { eventId: ids.joana }))[0];
    expect(marina.notes).toBe("Entrega às 6h, portão dos fundos");
    expect(marina.status).toBe("contratado");
    expect(joana.notes).toBe("Só montagem no dia");
    expect(joana.status).toBe("cotacao");
  });

  it("editar o COMBINADO num evento não toca no catálogo", async () => {
    const { t, dona, ids } = await cenario();
    const vinculo = await dona.mutation(api.suppliers.createFromCatalog, {
      eventId: ids.marina, supplierId: ids.florescer,
    });
    const antes = await t.run((ctx: MutationCtx) => ctx.db.get(ids.florescer));

    await dona.mutation(api.suppliers.update, {
      id: vinculo as Id<"eventSuppliers">,
      notes: "combinado deste evento",
      bankInfo: "PIX do evento",
    });

    const depois = await t.run((ctx: MutationCtx) => ctx.db.get(ids.florescer));
    expect(depois?.notes).toBe(antes?.notes);
    expect(depois?.bankInfo).toBe(antes?.bankInfo);
  });

  it("renomear a empresa no catálogo NÃO reescreve o nome no evento antigo", async () => {
    // É a mesma razão de `assemblyItems.supplierName` existir: o Caderno
    // impresso em junho tem de continuar legível em dezembro.
    const { dona, ids } = await cenario();
    await dona.mutation(api.suppliers.createFromCatalog, {
      eventId: ids.marina, supplierId: ids.florescer,
    });
    await dona.mutation(api.supplierCatalog.update, {
      supplierId: ids.florescer, companyName: "Florescer Flores e Eventos ME",
    });
    const lista = await dona.query(api.suppliers.listByEvent, { eventId: ids.marina });
    expect(lista[0].companyName).toBe("Floricultura Florescer");
  });
});

describe("a regra sozinha", () => {
  it("o catálogo manda CAMPO A CAMPO — vazio lá não apaga o que há aqui", () => {
    const r = identidadeDoFornecedor(
      { phone: "antigo", instagram: "@doEvento", email: "  " },
      { phone: "novo", instagram: "   ", email: "novo@ex.com" },
    );
    expect(r.phone).toBe("novo");
    // Essa era a diferença entre "corrigir o telefone" e "perder metade do
    // cadastro ao vincular".
    expect(r.instagram).toBe("@doEvento");
    expect(r.email).toBe("novo@ex.com");
  });

  it("sem catálogo, nada é sobreposto", () => {
    expect(identidadeDoFornecedor({ phone: "x" }, null)).toEqual({});
  });

  it("separarPatch põe cada campo do lado certo", () => {
    const { paraOCatalogo, paraOEvento } = separarPatch({
      phone: "1", email: "2", notes: "3", status: "contratado", bankInfo: "4",
      instagram: undefined,
    });
    expect(Object.keys(paraOCatalogo).sort()).toEqual(["email", "phone"]);
    expect(Object.keys(paraOEvento).sort()).toEqual(["bankInfo", "notes", "status"]);
    // `undefined` não viaja: em Convex ele significa "não mexa".
    expect("instagram" in paraOCatalogo).toBe(false);
  });
});
