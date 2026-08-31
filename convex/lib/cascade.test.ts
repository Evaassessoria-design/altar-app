import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { modules } from "../test.setup";
import { deleteEventCascade, deleteUserDataCascade } from "./cascade";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — exclusão em cascata.
//
// O bug: `events.remove` apagava SÓ a linha do evento, e `admin.deleteUser` SÓ a
// linha do usuário. Briefing, checklist, orçamento, compras, fotos, contratos,
// financeiro, fornecedores, montagem e plantas ficavam órfãos no banco, junto
// com os arquivos no storage — enquanto a tela dizia à usuária que tudo tinha
// sido apagado.
//
// Estes testes montam um evento COMPLETO (uma linha em cada tabela que pende de
// evento) e conferem que, depois da exclusão, o banco fica vazio. É isso que
// faz uma tabela nova esquecida na cascata aparecer aqui.
// ─────────────────────────────────────────────────────────────────────────────

/** Todas as tabelas que guardam linhas presas a um evento. */
const EVENT_TABLES = [
  "briefings",
  "checklistItems",
  "purchaseItems",
  "budgetItems",
  "eventTeam",
  "transactions",
  "eventPhotos",
  "contracts",
  "eventSuppliers",
  "assemblyItems",
  "layoutRenders",
] as const;

const NOW_ISO = "2026-08-21T12:00:00.000Z";

/**
 * Cria um usuário e um evento com UMA linha em cada tabela dependente,
 * incluindo arquivos no storage. Devolve os ids para as asserções.
 */
/**
 * Contexto do convex-test: é o `MutationCtx` real MAIS `storage.store`, que
 * só existe no ambiente de teste (no app real, arquivos entram por
 * `generateUploadUrl`). Tipar com precisão evita o erro que o typecheck do
 * Convex acusou — uma assinatura estrutural frouxa (`table: string`) não é
 * compatível com `db.insert`, que exige um nome de tabela conhecido.
 */
type TestMutationCtx = MutationCtx & {
  storage: { store: (blob: Blob) => Promise<Id<"_storage">> };
};

async function seedFullEvent(ctx: TestMutationCtx) {
  const userId = (await ctx.db.insert("users", {
    name: "Decoradora Teste",
    email: "decoradora@exemplo.com",
    role: "user",
    subscriptionStatus: "active",
  })) as Id<"users">;

  const eventId = (await ctx.db.insert("events", {
    userId,
    name: "Casamento Teste",
    type: "wedding",
    date: "2026-12-12",
    location: "Salão",
    clientName: "Cliente",
    status: "confirmed",
  })) as Id<"events">;

  // Arquivos reais no storage — a cascata precisa removê-los também.
  const photoFile = await ctx.storage.store(new Blob(["foto"]));
  const contractFile = await ctx.storage.store(new Blob(["contrato"]));
  const logoFile = await ctx.storage.store(new Blob(["logo-fornecedor"]));
  const refFile = await ctx.storage.store(new Blob(["referencia"]));
  const contractedFile = await ctx.storage.store(new Blob(["contratado"]));
  const sketchFile = await ctx.storage.store(new Blob(["croqui"]));
  const renderFile = await ctx.storage.store(new Blob(["planta"]));

  await ctx.db.insert("briefings", { eventId, userId, guestCount: "120" });
  await ctx.db.insert("checklistItems", {
    eventId, userId, phase: "pre", name: "Cadeiras", order: 0, isChecked: false,
  });
  await ctx.db.insert("purchaseItems", {
    eventId, userId, name: "Velas", isPurchased: false, order: 0,
  });
  await ctx.db.insert("budgetItems", {
    eventId, userId, description: "Decoração", category: "decor",
    quantity: 1, unitPrice: 5000, type: "income", order: 0,
  });
  const teamMemberId = await ctx.db.insert("teamMembers", {
    userId, name: "Montador", role: "montagem",
  });
  await ctx.db.insert("eventTeam", { userId, eventId, teamMemberId });
  await ctx.db.insert("transactions", {
    userId, eventId, type: "income", category: "sinal",
    description: "Sinal", amount: 2500, date: "2026-08-01", isPaid: true,
  });
  await ctx.db.insert("eventPhotos", {
    userId, eventId, storageId: photoFile, filename: "foto.jpg",
    category: "montagem", order: 0, uploadedAt: NOW_ISO,
  });
  await ctx.db.insert("contracts", {
    eventId, userId, storageId: contractFile,
    filename: "contrato.pdf", uploadedAt: NOW_ISO,
  });
  await ctx.db.insert("eventSuppliers", {
    userId, eventId, category: "buffet",
    companyName: "Buffet X", logoStorageId: logoFile,
  });
  await ctx.db.insert("assemblyItems", {
    userId, eventId, area: "mesas", order: 0, name: "Mesa redonda",
    referencePhotoStorageId: refFile, contractedPhotoStorageId: contractedFile,
    includeInAssemblyReport: true, checkOnAssembly: true,
    visibility: "interno", createdAt: NOW_ISO, updatedAt: NOW_ISO,
  });
  await ctx.db.insert("layoutRenders", {
    userId, eventId,
    originalSketchStorageId: sketchFile, originalSketchFilename: "croqui.jpg",
    interpretation: { ambientes: ["salão"], elementos: [{ tipo: "mesa", quantidade: 12 }] },
    outputStorageId: renderFile,
    provider: "teste", model: "teste", promptVersion: "1",
    promptSnapshot: "…", generationVersion: 1, status: "done",
    createdAt: NOW_ISO, updatedAt: NOW_ISO,
  });
  await ctx.db.insert("notifications", {
    userId, type: "event_soon", title: "Evento próximo", body: "…",
    isRead: false, relatedEventId: eventId, createdAt: NOW_ISO,
  });
  await ctx.db.insert("leads", {
    userId, clientName: "Cliente", stage: "contracted",
    order: 0, convertedEventId: eventId,
  });

  return {
    userId,
    eventId,
    files: [photoFile, contractFile, logoFile, refFile, contractedFile, sketchFile, renderFile],
  };
}

describe("deleteEventCascade — não deixa nada para trás", () => {
  it("apaga todas as linhas de todas as tabelas do evento", async () => {
    const t = convexTest(schema, modules);
    const { eventId } = await t.run((ctx) => seedFullEvent(ctx));

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventId);
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(eventId)).toBeNull();
      for (const table of EVENT_TABLES) {
        const rows = await ctx.db.query(table).collect();
        expect(rows, `tabela ${table} ficou com linhas órfãs`).toHaveLength(0);
      }
    });
  });

  it("apaga também os arquivos no storage", async () => {
    const t = convexTest(schema, modules);
    const { eventId, files } = await t.run((ctx) => seedFullEvent(ctx));

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventId);
    });

    await t.run(async (ctx) => {
      for (const file of files) {
        expect(await ctx.storage.getUrl(file), `arquivo ${file} não foi apagado`).toBeNull();
      }
    });
  });

  it("apaga as notificações daquele evento", async () => {
    const t = convexTest(schema, modules);
    const { eventId } = await t.run((ctx) => seedFullEvent(ctx));

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventId);
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("notifications").collect()).toHaveLength(0);
    });
  });

  it("PRESERVA o lead do funil, só limpando o vínculo com o evento", async () => {
    // O lead é histórico comercial: sobrevive ao evento. Só o ponteiro morre.
    const t = convexTest(schema, modules);
    const { eventId } = await t.run((ctx) => seedFullEvent(ctx));

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventId);
    });

    await t.run(async (ctx) => {
      const leads = await ctx.db.query("leads").collect();
      expect(leads).toHaveLength(1);
      expect(leads[0].convertedEventId).toBeUndefined();
    });
  });

  it("não toca em outro evento do mesmo usuário", async () => {
    const t = convexTest(schema, modules);
    const { userId, eventId } = await t.run((ctx) => seedFullEvent(ctx));

    const outroEventoId = await t.run(async (ctx) => {
      const outro = await ctx.db.insert("events", {
        userId, name: "Outro", type: "birthday", date: "2027-01-01",
        location: "Casa", clientName: "Outro Cliente", status: "planning",
      });
      await ctx.db.insert("briefings", { eventId: outro, userId, guestCount: "50" });
      return outro;
    });

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventId);
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(outroEventoId)).not.toBeNull();
      expect(await ctx.db.query("briefings").collect()).toHaveLength(1);
      // A equipe do usuário não pertence ao evento e continua existindo.
      expect(await ctx.db.query("teamMembers").collect()).toHaveLength(1);
    });
  });

  it("devolve a contagem do que saiu", async () => {
    const t = convexTest(schema, modules);
    const { eventId } = await t.run((ctx) => seedFullEvent(ctx));

    const summary = await t.run((ctx) => deleteEventCascade(ctx, eventId));

    expect(summary.events).toBe(1);
    expect(summary.files).toBe(7);
    expect(summary.documents).toBeGreaterThanOrEqual(EVENT_TABLES.length);
  });

  it("não quebra quando o arquivo já sumiu do storage", async () => {
    // Exclusão repetida após falha parcial: `ctx.storage.delete` lança para um
    // arquivo inexistente, e isso não pode abortar a limpeza do banco.
    const t = convexTest(schema, modules);
    const { eventId, files } = await t.run((ctx) => seedFullEvent(ctx));

    await t.run(async (ctx) => {
      await ctx.storage.delete(files[0]);
    });

    await expect(t.run((ctx) => deleteEventCascade(ctx, eventId))).resolves.toBeDefined();

    await t.run(async (ctx) => {
      expect(await ctx.db.get(eventId)).toBeNull();
      expect(await ctx.db.query("eventPhotos").collect()).toHaveLength(0);
    });
  });
});

describe("deleteUserDataCascade — limpa tudo do usuário", () => {
  it("apaga eventos, dependências e as tabelas do próprio usuário", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await t.run((ctx) => seedFullEvent(ctx));

    await t.run(async (ctx) => {
      await deleteUserDataCascade(ctx, userId);
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("events").collect()).toHaveLength(0);
      for (const table of EVENT_TABLES) {
        expect(await ctx.db.query(table).collect(), `tabela ${table}`).toHaveLength(0);
      }
      // Tabelas do usuário fora de evento.
      expect(await ctx.db.query("teamMembers").collect()).toHaveLength(0);
      expect(await ctx.db.query("leads").collect()).toHaveLength(0);
      expect(await ctx.db.query("notifications").collect()).toHaveLength(0);
    });
  });

  it("não toca nos dados de OUTRO usuário", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await t.run((ctx) => seedFullEvent(ctx));

    const outroUserId = await t.run(async (ctx) => {
      const outro = await ctx.db.insert("users", {
        name: "Outra", email: "outra@exemplo.com",
        role: "user", subscriptionStatus: "trial",
      });
      await ctx.db.insert("events", {
        userId: outro, name: "Evento da outra", type: "corporate",
        date: "2027-02-02", location: "Hotel", clientName: "Empresa", status: "planning",
      });
      await ctx.db.insert("teamMembers", { userId: outro, name: "Ajudante", role: "apoio" });
      return outro;
    });

    await t.run(async (ctx) => {
      await deleteUserDataCascade(ctx, userId);
    });

    await t.run(async (ctx) => {
      const events = await ctx.db.query("events").collect();
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe(outroUserId);
      expect(await ctx.db.query("teamMembers").collect()).toHaveLength(1);
    });
  });

  it("apaga a logo da empresa do storage", async () => {
    const t = convexTest(schema, modules);
    const { userId, logo } = await t.run(async (ctx) => {
      const logo = await ctx.storage.store(new Blob(["logo-empresa"]));
      const userId = await ctx.db.insert("users", {
        name: "Com logo", email: "logo@exemplo.com", role: "user",
        subscriptionStatus: "active", logoStorageId: logo,
      });
      return { userId, logo };
    });

    await t.run(async (ctx) => {
      await deleteUserDataCascade(ctx, userId);
    });

    await t.run(async (ctx) => {
      expect(await ctx.storage.getUrl(logo)).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRA FUNDAMENTAL DO CATÁLOGO CENTRAL
//
// Excluir um evento apaga o VÍNCULO (`eventSuppliers`), NUNCA o fornecedor do
// catálogo (`suppliers`). Um fornecedor serve vários eventos: apagá-lo junto
// com um deles destruiria dado de todos os outros — o único caminho para perda
// irreversível nesta migração.
//
// Este é o teste que o requisito exigiu existir antes de a implementação ser
// considerada concluída.
// ─────────────────────────────────────────────────────────────────────────────

async function seedCatalogo(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Decoradora", email: "d@exemplo.com",
      role: "user", subscriptionStatus: "active",
    });

    const supplierId = await ctx.db.insert("suppliers", {
      userId,
      companyName: "Buffet Silva",
      searchName: "buffet silva",
      category: "buffet",
      phone: "(14) 99624-7868",
      phoneDigits: "14996247868",
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });

    // Dois eventos usando o MESMO fornecedor do catálogo.
    const eventoA = await ctx.db.insert("events", {
      userId, name: "Casamento A", type: "wedding", date: "2026-12-12",
      location: "Salão A", clientName: "Cliente A", status: "confirmed",
    });
    const eventoB = await ctx.db.insert("events", {
      userId, name: "Casamento B", type: "wedding", date: "2027-01-20",
      location: "Salão B", clientName: "Cliente B", status: "planning",
    });

    const vinculoA = await ctx.db.insert("eventSuppliers", {
      userId, eventId: eventoA, supplierId,
      category: "buffet", companyName: "Buffet Silva", status: "contratado",
    });
    const vinculoB = await ctx.db.insert("eventSuppliers", {
      userId, eventId: eventoB, supplierId,
      category: "buffet", companyName: "Buffet Silva", status: "cotacao",
    });

    return { userId, supplierId, eventoA, eventoB, vinculoA, vinculoB };
  });
}

describe("catálogo central: excluir evento NUNCA apaga o fornecedor", () => {
  it("apaga o vínculo do evento e PRESERVA o fornecedor do catálogo", async () => {
    const t = convexTest(schema, modules);
    const { supplierId, eventoA, vinculoA } = await seedCatalogo(t);

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventoA);
    });

    await t.run(async (ctx) => {
      // O vínculo morreu junto com o evento.
      expect(await ctx.db.get(vinculoA)).toBeNull();
      // O fornecedor do catálogo continua vivo e intacto.
      const supplier = await ctx.db.get(supplierId);
      expect(supplier, "o fornecedor do catálogo NÃO pode ser apagado").not.toBeNull();
      expect(supplier?.companyName).toBe("Buffet Silva");
      expect(supplier?.archivedAt).toBeUndefined();
    });
  });

  it("o outro evento que usa o mesmo fornecedor fica intacto", async () => {
    // O cenário que causaria perda real: apagar um evento e derrubar o
    // fornecedor de todos os outros.
    const t = convexTest(schema, modules);
    const { eventoA, eventoB, vinculoB, supplierId } = await seedCatalogo(t);

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventoA);
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(eventoB)).not.toBeNull();
      const vinculo = await ctx.db.get(vinculoB);
      expect(vinculo, "o vínculo do outro evento não pode ser tocado").not.toBeNull();
      expect(vinculo?.supplierId).toBe(supplierId);
      expect(vinculo?.status).toBe("cotacao");
    });
  });

  it("apagar os DOIS eventos ainda deixa o fornecedor no catálogo", async () => {
    const t = convexTest(schema, modules);
    const { eventoA, eventoB, supplierId } = await seedCatalogo(t);

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventoA);
      await deleteEventCascade(ctx, eventoB);
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("eventSuppliers").collect()).toHaveLength(0);
      expect(await ctx.db.get(supplierId)).not.toBeNull();
    });
  });

  it("a logo do catálogo sobrevive à exclusão do evento", async () => {
    // O vínculo copia a logo do catálogo. Apagar o ARQUIVO ao excluir o evento
    // deixaria o fornecedor do catálogo sem imagem — perda silenciosa.
    const t = convexTest(schema, modules);
    const { logo, eventoId, supplierId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "D", email: "d2@exemplo.com", role: "user", subscriptionStatus: "active",
      });
      const logo = await ctx.storage.store(new Blob(["logo"]));
      const supplierId = await ctx.db.insert("suppliers", {
        userId, companyName: "Flores", searchName: "flores", category: "flores",
        logoStorageId: logo, createdAt: NOW_ISO, updatedAt: NOW_ISO,
      });
      const eventoId = await ctx.db.insert("events", {
        userId, name: "E", type: "wedding", date: "2026-12-12",
        location: "L", clientName: "C", status: "planning",
      });
      await ctx.db.insert("eventSuppliers", {
        userId, eventId: eventoId, supplierId,
        category: "flores", companyName: "Flores", logoStorageId: logo,
      });
      return { logo, eventoId, supplierId };
    });

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventoId);
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(supplierId)).not.toBeNull();
      expect(
        await ctx.storage.getUrl(logo),
        "a logo do catálogo não pode ser apagada junto com o evento",
      ).not.toBeNull();
    });
  });

  it("vínculo ANTIGO (sem catálogo) continua tendo a logo apagada", async () => {
    // Compatibilidade: registros anteriores à migração têm arquivo próprio, e o
    // comportamento anterior — apagar junto — continua correto para eles.
    const t = convexTest(schema, modules);
    const { logo, eventoId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "D", email: "d3@exemplo.com", role: "user", subscriptionStatus: "active",
      });
      const logo = await ctx.storage.store(new Blob(["logo antiga"]));
      const eventoId = await ctx.db.insert("events", {
        userId, name: "E", type: "wedding", date: "2026-12-12",
        location: "L", clientName: "C", status: "planning",
      });
      await ctx.db.insert("eventSuppliers", {
        userId, eventId: eventoId, category: "som",
        companyName: "Som Antigo", logoStorageId: logo, // sem supplierId
      });
      return { logo, eventoId };
    });

    await t.run(async (ctx) => {
      await deleteEventCascade(ctx, eventoId);
    });

    await t.run(async (ctx) => {
      expect(await ctx.storage.getUrl(logo)).toBeNull();
    });
  });
});

describe("excluir a EMPRESA leva o catálogo junto", () => {
  it("deleteUserDataCascade apaga o catálogo — ele é dado da empresa", async () => {
    const t = convexTest(schema, modules);
    const { userId, supplierId } = await seedCatalogo(t);

    await t.run(async (ctx) => {
      await deleteUserDataCascade(ctx, userId);
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(supplierId)).toBeNull();
      expect(await ctx.db.query("suppliers").collect()).toHaveLength(0);
    });
  });

  it("não encosta no catálogo de OUTRA empresa", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCatalogo(t);

    const outroSupplierId = await t.run(async (ctx) => {
      const outroUser = await ctx.db.insert("users", {
        name: "Outra", email: "outra@exemplo.com", role: "user", subscriptionStatus: "trial",
      });
      return ctx.db.insert("suppliers", {
        userId: outroUser, companyName: "Buffet Silva", searchName: "buffet silva",
        category: "buffet", createdAt: NOW_ISO, updatedAt: NOW_ISO,
      });
    });

    await t.run(async (ctx) => {
      await deleteUserDataCascade(ctx, userId);
    });

    await t.run(async (ctx) => {
      // Mesmo nome, empresa diferente: intocado.
      expect(await ctx.db.get(outroSupplierId)).not.toBeNull();
    });
  });
});
