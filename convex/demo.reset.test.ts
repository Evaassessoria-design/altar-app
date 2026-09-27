import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CONFIRMACAO_DE_RESET } from "./demo";
import { TOTAL_DE_EVENTOS_DEMO } from "./lib/demoPortfolio";

// ═════════════════════════════════════════════════════════════════════════════
// APAGAR A DEMONSTRAÇÃO
//
// `limpar` e `resetar` são as únicas funções do seed que apagam. Metade destes
// testes prova que elas funcionam; a outra metade prova que elas se RECUSAM —
// e essa metade importa mais, porque o custo dos dois lados não é o mesmo. Um
// reset que não roda atrasa um ensaio. Um reset que roda no lugar errado apaga
// o trabalho de alguém.
// ═════════════════════════════════════════════════════════════════════════════

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

const seed = internal.demo.seed;
const limpar = internal.demo.limpar;
const resetar = internal.demo.resetar;

async function contaDemo(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  process.env.ALTAR_DEMO = "1";
  return t.run((ctx) =>
    ctx.db.insert("users", {
      name: "Conta Demo", email: "demo@exemplo.com.br",
      role: "admin", subscriptionStatus: "trial",
    }),
  );
}

async function semeada() {
  const t = convexTest(schema, modules);
  const userId = await contaDemo(t);
  await t.mutation(seed, {});
  return { t, userId };
}

type TabelaContavel = "events" | "transactions" | "suppliers" | "leads" | "budgetItems";
const contar = (t: ReturnType<typeof convexTest>, tabela: TabelaContavel) =>
  t.run(async (ctx) => (await ctx.db.query(tabela).collect()).length);

describe("as três travas, uma de cada vez", () => {
  it("sem a frase exata, recusa e não apaga nada", async () => {
    const { t } = await semeada();
    await expect(t.mutation(resetar, { confirmo: "sim" })).rejects.toThrow(/exatamente assim/);
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO);
  });

  it("a frase é sensível a maiúsculas, a acento e a espaço", async () => {
    // ── POR QUE ISTO NÃO É PREGUIÇA DE NORMALIZAR ─────────────────────────
    // Uma frase que aceita variações é uma frase que se digita de memória, e o
    // ponto dela é obrigar a LER antes de digitar.
    const { t } = await semeada();
    for (const quase of [
      "apagar e recriar a demonstracao",
      "APAGAR E RECRIAR A DEMONSTRAÇÃO",
      ` ${CONFIRMACAO_DE_RESET}`,
      `${CONFIRMACAO_DE_RESET}.`,
    ]) {
      await expect(t.mutation(resetar, { confirmo: quase }), quase).rejects.toThrow();
    }
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO);
  });

  it("sem ALTAR_DEMO, recusa mesmo com a frase certa", async () => {
    const { t } = await semeada();
    delete process.env.ALTAR_DEMO;
    await expect(t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET })).rejects.toThrow(
      /ALTAR_DEMO|demonstração/i,
    );
    process.env.ALTAR_DEMO = "1";
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO);
  });

  it("com rastro de cobrança Asaas, recusa — o banco parece produção", async () => {
    // A trava não pergunta "é produção?"; pergunta "há sinal de que seja?". Um
    // cliente pagante é o sinal mais forte que existe.
    const { t, userId } = await semeada();
    await t.run((ctx) => ctx.db.patch(userId, { asaasCustomerId: "cus_000123" }));
    await expect(t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET })).rejects.toThrow(/Asaas/);
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO);
  });

  it("num banco que NUNCA foi semeado, recusa em vez de limpar a conta", async () => {
    // ── O ACIDENTE QUE ESTA TRAVA IMPEDE ──────────────────────────────────
    // Rodar o reset no deployment errado, com a variável copiada por descuido.
    // Sem esta trava, ele apagaria a conta inteira de quem estivesse ali.
    const t = convexTest(schema, modules);
    const userId = await contaDemo(t);
    const meu = await t.run((ctx) =>
      ctx.db.insert("events", {
        userId, name: "Evento de verdade", type: "wedding", date: "2026-12-01",
        location: "Onde for", clientName: "Cliente real", status: "planning",
      }),
    );

    await expect(t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET })).rejects.toThrow(
      /nunca rodou aqui|marcador/i,
    );
    expect(await t.run((ctx) => ctx.db.get(meu))).not.toBeNull();
  });
});

describe("limpar", () => {
  it("apaga o conteúdo e NÃO recria", async () => {
    const { t } = await semeada();
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO);

    const r = await t.mutation(limpar, { confirmo: CONFIRMACAO_DE_RESET });
    expect(r.limpou).toBe(true);
    expect(r.incompleta).toBe(false);
    expect(r.proximoPasso).toMatch(/seed/);

    for (const tabela of ["events", "transactions", "suppliers", "leads", "budgetItems"] as const) {
      expect(await contar(t, tabela), tabela).toBe(0);
    }
  });

  it("NÃO apaga a conta — o login precisa sobreviver ao reset", async () => {
    // Apagar o usuário deixaria o ambiente sem como entrar, e o seed não cria
    // login: ele liga conteúdo a uma conta que já existe.
    const { t, userId } = await semeada();
    await t.mutation(limpar, { confirmo: CONFIRMACAO_DE_RESET });
    expect(await t.run((ctx) => ctx.db.get(userId))).not.toBeNull();
  });

  it("apagar duas vezes: a segunda recusa, porque já não há marcador", async () => {
    const { t } = await semeada();
    await t.mutation(limpar, { confirmo: CONFIRMACAO_DE_RESET });
    await expect(t.mutation(limpar, { confirmo: CONFIRMACAO_DE_RESET })).rejects.toThrow(
      /nunca rodou aqui|marcador/i,
    );
  });

  it("depois de limpar, o seed volta a semear do zero", async () => {
    const { t } = await semeada();
    await t.mutation(limpar, { confirmo: CONFIRMACAO_DE_RESET });
    const r = await t.mutation(seed, {});
    expect(r.criado).toBe(true);
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO);
  });
});

describe("resetar", () => {
  it("devolve a demo ao estado semeado, com os mesmos números", async () => {
    const { t } = await semeada();
    const antes = {
      eventos: await contar(t, "events"),
      lancamentos: await contar(t, "transactions"),
      fornecedores: await contar(t, "suppliers"),
      orcamento: await contar(t, "budgetItems"),
    };

    const r = await t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET });
    expect(r.resetou).toBe(true);
    expect(r.apagadas.events).toBe(antes.eventos);

    expect(await contar(t, "events")).toBe(antes.eventos);
    expect(await contar(t, "transactions")).toBe(antes.lancamentos);
    expect(await contar(t, "suppliers")).toBe(antes.fornecedores);
    expect(await contar(t, "budgetItems")).toBe(antes.orcamento);
  });

  it("desfaz o que o ensaio mexeu", async () => {
    // ── O MOTIVO DE ISTO EXISTIR ──────────────────────────────────────────
    // Cada ensaio marca um checklist, move um lead, dá uma conta como paga. É
    // exatamente isso que o terceiro ensaio precisa não encontrar.
    const { t } = await semeada();
    const marcados = () =>
      t.run(async (ctx) =>
        (await ctx.db.query("checklistItems").collect()).filter((c) => c.isChecked).length,
      );
    const antes = await marcados();

    await t.run(async (ctx) => {
      for (const c of await ctx.db.query("checklistItems").collect()) {
        await ctx.db.patch(c._id, { isChecked: true });
      }
      const [lead] = await ctx.db.query("leads").collect();
      await ctx.db.delete(lead._id);
    });
    expect(await marcados()).toBeGreaterThan(antes);

    await t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET });
    expect(await marcados()).toBe(antes);
  });

  it("resetar duas vezes seguidas não duplica nada", async () => {
    const { t } = await semeada();
    await t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET });
    await t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET });
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO);
  });

  it("o reset é de UMA conta — a de outro usuário fica intacta", async () => {
    // ── O DEFEITO QUE ISTO TRANCA ─────────────────────────────────────────
    // A limpeza varre por índice de usuário. Um `collect()` sem índice, ou um
    // índice trocado, apagaria a tabela inteira sem nenhum teste reclamar.
    const { t } = await semeada();
    const outro = await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Outra pessoa", email: "outra@exemplo.com.br",
        role: "user", subscriptionStatus: "trial",
      }),
    );
    const dela = await t.run((ctx) =>
      ctx.db.insert("events", {
        userId: outro, name: "Evento de outra conta", type: "birthday",
        date: "2027-01-10", location: "Outro lugar", clientName: "Outra cliente",
        status: "planning",
      }),
    );
    const lancamentoDela = await t.run((ctx) =>
      ctx.db.insert("transactions", {
        userId: outro, eventId: dela, type: "income", category: "Sinal",
        description: "Sinal dela", amount: 1000, date: "2026-12-01", isPaid: false,
      }),
    );

    await t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET });

    expect(await t.run((ctx) => ctx.db.get(dela)), "o evento da outra conta sumiu").not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(lancamentoDela))).not.toBeNull();
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO + 1);
  });

  it("RECUSA quando há foto subida à mão, em vez de deixá-la órfã", async () => {
    // ── O QUE ESTÁ EM JOGO ────────────────────────────────────────────────
    // As fotos de Marina & Gabriel são subidas pela interface e são o clímax
    // da apresentação. Um reset entre dois ensaios que as apagasse — ou que
    // apagasse o evento e as deixasse apontando para o nada — custaria a única
    // parte da demo que não se refaz com um comando.
    const { t, userId } = await semeada();
    const evento = await t.run(async (ctx) => {
      const e = (await ctx.db.query("events").collect()).find((x) => x.name === "Marina & Gabriel")!;
      await ctx.db.insert("eventPhotos", {
        userId, eventId: e._id,
        storageId: await ctx.storage.store(new Blob(["foto"])),
        filename: "marina-gabriel-01.jpg",
        category: "evento", order: 0,
        uploadedAt: new Date().toISOString(),
      });
      return e._id;
    });

    await expect(t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET })).rejects.toThrow(
      /1 foto/,
    );
    // Nada foi apagado: nem a foto, nem o evento.
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO);
    expect(await t.run((ctx) => ctx.db.get(evento))).not.toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.query("eventPhotos").collect()).length)).toBe(1);
  });

  it("com apagarArquivos, descarta o vínculo e não deixa foto órfã", async () => {
    const { t, userId } = await semeada();
    await t.run(async (ctx) => {
      const e = (await ctx.db.query("events").collect())[0];
      await ctx.db.insert("eventPhotos", {
        userId, eventId: e._id,
        storageId: await ctx.storage.store(new Blob(["foto"])),
        filename: "marina-gabriel-01.jpg",
        category: "evento", order: 0,
        uploadedAt: new Date().toISOString(),
      });
    });

    const r = await t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET, apagarArquivos: true });
    expect(r.apagadas.anexos).toBe(1);
    expect(await t.run(async (ctx) => (await ctx.db.query("eventPhotos").collect()).length)).toBe(0);
  });

  it("a notificação do cron NÃO sobrevive ao reset apontando para o nada", async () => {
    // ── O DEFEITO QUE ISTO TRANCA, ENCONTRADO AUDITANDO O CRON ────────────
    // `notifications.generateDailyAlerts` roda às 5h e cria avisos com
    // `relatedEventId`. Entre um ensaio e o outro, a conta de demonstração
    // acumula avisos apontando para os treze eventos. O reset apagava os
    // eventos e deixava os avisos: o sino mostraria uma linha que leva a um
    // evento que não existe mais.
    //
    // É dado DERIVADO — o cron da madrugada seguinte refaz —, então apagar é
    // a resposta certa, e não recusar como se faz com arquivo.
    const { t, userId } = await semeada();
    const aviso = await t.run(async (ctx) => {
      const e = (await ctx.db.query("events").collect())[0];
      return ctx.db.insert("notifications", {
        userId,
        type: "checklist_incomplete",
        title: "Checklist pendente",
        body: "Faltam itens",
        relatedEventId: e._id,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    });

    await t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET });
    expect(await t.run((ctx) => ctx.db.get(aviso)), "aviso órfão sobreviveu").toBeNull();
  });

  it("documento de lead subido à mão faz o reset RECUSAR, como a foto", async () => {
    // `leadDocuments.storageId` é obrigatório: toda linha ali É um arquivo.
    const { t, userId } = await semeada();
    await t.run(async (ctx) => {
      const lead = (await ctx.db.query("leads").collect())[0];
      await ctx.db.insert("leadDocuments", {
        userId, leadId: lead._id,
        storageId: await ctx.storage.store(new Blob(["contrato"])),
        fileName: "contrato-assinado.pdf",
        uploadedAt: new Date().toISOString(),
      });
    });

    await expect(t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET })).rejects.toThrow(
      /1 documento/,
    );
    expect(await contar(t, "events")).toBe(TOTAL_DE_EVENTOS_DEMO);
  });

  it("a demo recriada continua coerente — não é uma segunda cópia do roteiro", async () => {
    // `resetar` e `seed` chamam a MESMA função de inserção. Se um dia
    // divergirem, a demo recriada deixa de ser a demo ensaiada.
    const { t } = await semeada();
    const r = await t.mutation(resetar, { confirmo: CONFIRMACAO_DE_RESET });
    expect(r.resumo.fornecedores).toBeGreaterThan(0);
    expect(r.portfolio.eventos).toBeGreaterThan(0);

    await t.run(async (ctx) => {
      const eventos = await ctx.db.query("events").collect();
      expect(eventos.filter((e) => e.name === "Marina & Gabriel")).toHaveLength(1);
      const orfaos = (await ctx.db.query("transactions").collect()).filter(
        (x) => x.eventId !== undefined && !eventos.some((e) => e._id === x.eventId),
      );
      expect(orfaos, "sobrou lançamento apontando para evento apagado").toEqual([]);
    });
  });
});
