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
import { deleteUserDataCascade } from "./lib/cascade";

// ═════════════════════════════════════════════════════════════════════════════
// COMPROVANTE É EVIDÊNCIA, `isPaid` É DECISÃO
//
// O pedido veio de decoradoras reais: "um espaço para colocar os comprovantes
// no financeiro dos noivos". Não existe tabela de parcelas no ALTAR — cada
// parcela JÁ É uma linha de `transactions` com `category: "Contrato"`.
//
// A trava que estes testes guardam: anexar comprovante NÃO marca como pago, e
// marcar como pago NÃO exige comprovante. Acoplar as duas faria um anexo
// errado virar uma baixa errada — dinheiro que o sistema afirma ter entrado.
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
    const marina = await evento(donaId, "Marina & Gabriel");
    const eventoAlheio = await evento(rivalId, "Evento da rival");

    const parcela = async (userId: Id<"users">, eventId: Id<"events">, desc: string) =>
      ctx.db.insert("transactions", {
        userId, eventId, type: "income" as const, category: "Contrato",
        description: desc, amount: 250000, date: "2026-10-10", isPaid: false,
      });

    return {
      donaId, marina, eventoAlheio,
      parcela: await parcela(donaId, marina, "Parcela 3/10"),
      outraParcela: await parcela(donaId, marina, "Parcela 4/10"),
      parcelaAlheia: await parcela(rivalId, eventoAlheio, "Parcela da rival"),
    };
  });

  const guardar = (c: string) =>
    t.run(async (ctx: MutationCtx) =>
      (ctx as unknown as { storage: Storage }).storage.store(new Blob([c])),
    );
  const arquivoExiste = async (id: Id<"_storage">) =>
    (await t.run(async (ctx: MutationCtx) => ctx.storage.getUrl(id))) !== null;
  const linha = (id: Id<"transactions">) =>
    t.run((ctx: MutationCtx) => ctx.db.get(id));

  return { t, dona, rival, ids, guardar, arquivoExiste, linha };
}

describe("anexar, listar e remover", () => {
  it("anexa e guarda o nome original do arquivo", async () => {
    // O storage não guarda nome: sem o snapshot, a lista mostraria um
    // identificador no lugar de "pix-outubro.pdf".
    const { dona, ids, guardar } = await cenario();
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela,
      storageId: await guardar("pix"),
      filename: "pix-outubro.pdf",
      contentType: "application/pdf",
    });

    const lista = await dona.query(api.financeiro.comprovantesDoLancamento, { id: ids.parcela });
    expect(lista).toHaveLength(1);
    expect(lista[0].filename).toBe("pix-outubro.pdf");
    expect(lista[0].contentType).toBe("application/pdf");
    expect(lista[0].url, "sem url não há como visualizar nem baixar").toBeTruthy();
    expect(lista[0].uploadedAt).toBeTruthy();
  });

  it("aceita MAIS DE UM comprovante no mesmo recebimento", async () => {
    // Um PIX e o extrato do banco provam o mesmo pagamento.
    const { dona, ids, guardar } = await cenario();
    for (const nome of ["pix.pdf", "extrato.png", "recibo.jpg"]) {
      await dona.mutation(api.financeiro.anexarComprovante, {
        id: ids.parcela, storageId: await guardar(nome), filename: nome,
      });
    }
    expect(await dona.query(api.financeiro.comprovantesDoLancamento, { id: ids.parcela }))
      .toHaveLength(3);
  });

  it("o mesmo arquivo anexado duas vezes não vira duas linhas", async () => {
    const { dona, ids, guardar } = await cenario();
    const arquivo = await guardar("pix");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: arquivo, filename: "pix.pdf",
    });
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: arquivo, filename: "pix.pdf",
    });
    expect(await dona.query(api.financeiro.comprovantesDoLancamento, { id: ids.parcela }))
      .toHaveLength(1);
  });

  it("remover leva o ARQUIVO junto — derivado órfão é cobrado para sempre", async () => {
    const { dona, ids, guardar, arquivoExiste } = await cenario();
    const arquivo = await guardar("pix");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: arquivo, filename: "pix.pdf",
    });

    await dona.mutation(api.financeiro.removerComprovante, {
      id: ids.parcela, storageId: arquivo,
    });

    expect(await dona.query(api.financeiro.comprovantesDoLancamento, { id: ids.parcela }))
      .toHaveLength(0);
    expect(await arquivoExiste(arquivo), "o arquivo ficou órfão").toBe(false);
  });

  it("remover UM não derruba os outros", async () => {
    const { dona, ids, guardar } = await cenario();
    const a = await guardar("a"); const b = await guardar("b");
    await dona.mutation(api.financeiro.anexarComprovante, { id: ids.parcela, storageId: a, filename: "a.pdf" });
    await dona.mutation(api.financeiro.anexarComprovante, { id: ids.parcela, storageId: b, filename: "b.pdf" });

    await dona.mutation(api.financeiro.removerComprovante, { id: ids.parcela, storageId: a });

    const lista = await dona.query(api.financeiro.comprovantesDoLancamento, { id: ids.parcela });
    expect(lista.map((c) => c.filename)).toEqual(["b.pdf"]);
  });

  it("arquivo que JÁ SUMIU não impede a remoção do registro", async () => {
    // O Convex lança ao apagar arquivo inexistente, e a mutation abortaria —
    // o comprovante continuaria listado apontando para nada, sem jeito de
    // tirar da lista. É o defeito que a auditoria do pipeline fechou.
    const { t, dona, ids, guardar } = await cenario();
    const arquivo = await guardar("some");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: arquivo, filename: "some.pdf",
    });
    await t.run(async (ctx: MutationCtx) => ctx.storage.delete(arquivo));

    await dona.mutation(api.financeiro.removerComprovante, { id: ids.parcela, storageId: arquivo });

    expect(await dona.query(api.financeiro.comprovantesDoLancamento, { id: ids.parcela }))
      .toHaveLength(0);
  });
});

describe("comprovante NÃO mexe no status, e vice-versa", () => {
  it("anexar não marca como pago", async () => {
    const { dona, ids, guardar, linha } = await cenario();
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: await guardar("pix"), filename: "pix.pdf",
    });
    expect((await linha(ids.parcela))!.isPaid, "o anexo deu baixa sozinho").toBe(false);
  });

  it("remover não desmarca o pago", async () => {
    const { dona, ids, guardar, linha } = await cenario();
    const arquivo = await guardar("pix");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: arquivo, filename: "pix.pdf",
    });
    await dona.mutation(api.financeiro.registrarPagamento, { id: ids.parcela, isPaid: true });
    await dona.mutation(api.financeiro.removerComprovante, { id: ids.parcela, storageId: arquivo });
    expect((await linha(ids.parcela))!.isPaid).toBe(true);
  });

  it("marcar como pago NÃO exige comprovante", async () => {
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.financeiro.registrarPagamento, {
      id: ids.parcela, isPaid: true, paidAt: "2026-10-08", paymentMethod: "PIX",
    });
    const tx = (await linha(ids.parcela))!;
    expect(tx.isPaid).toBe(true);
    expect(tx.comprovantes ?? []).toHaveLength(0);
  });
});

describe("o fechamento do recebimento", () => {
  it("guarda quando entrou, como entrou e a observação", async () => {
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.financeiro.registrarPagamento, {
      id: ids.parcela, isPaid: true, paidAt: "2026-10-08",
      paymentMethod: "PIX", notes: "Pago pela mãe da noiva",
    });
    const tx = (await linha(ids.parcela))!;
    expect(tx.paidAt).toBe("2026-10-08");
    expect(tx.paymentMethod).toBe("PIX");
    expect(tx.notes).toBe("Pago pela mãe da noiva");
    // O VENCIMENTO não é tocado: são perguntas diferentes.
    expect(tx.date).toBe("2026-10-10");
  });

  it("forma de pagamento é TEXTO LIVRE — permuta e cheque existem", async () => {
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.financeiro.registrarPagamento, {
      id: ids.parcela, paymentMethod: "Permuta (buffet)",
    });
    expect((await linha(ids.parcela))!.paymentMethod).toBe("Permuta (buffet)");
  });

  it("`null` LIMPA — `undefined` sumiria no transporte", async () => {
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.financeiro.registrarPagamento, {
      id: ids.parcela, paidAt: "2026-10-08", paymentMethod: "PIX",
    });
    await dona.mutation(api.financeiro.registrarPagamento, {
      id: ids.parcela, paidAt: null, paymentMethod: null,
    });
    const tx = (await linha(ids.parcela))!;
    expect(tx.paidAt).toBeUndefined();
    expect(tx.paymentMethod).toBeUndefined();
  });

  it("campo só com espaço não vira dado", async () => {
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.financeiro.registrarPagamento, {
      id: ids.parcela, paymentMethod: "   ", paidAt: "  ",
    });
    const tx = (await linha(ids.parcela))!;
    expect(tx.paymentMethod).toBeUndefined();
    expect(tx.paidAt).toBeUndefined();
  });

  it("`togglePaid` continua funcionando e NÃO inventa data", async () => {
    // Dar baixa hoje num PIX que caiu semana passada gravaria data errada, e
    // data errada em financeiro é pior que data ausente.
    const { dona, ids, linha } = await cenario();
    await dona.mutation(api.financeiro.togglePaid, { id: ids.parcela });
    const tx = (await linha(ids.parcela))!;
    expect(tx.isPaid).toBe(true);
    expect(tx.paidAt).toBeUndefined();
  });
});

describe("nada atravessa a fronteira da conta", () => {
  it("a rival não LÊ o comprovante da dona", async () => {
    const { dona, rival, ids, guardar } = await cenario();
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: await guardar("pix"), filename: "pix.pdf",
    });
    // Degrada para vazio: lançamento que não é seu não existe.
    expect(await rival.query(api.financeiro.comprovantesDoLancamento, { id: ids.parcela }))
      .toEqual([]);
  });

  it("a rival não ANEXA no lançamento da dona", async () => {
    const { dona, rival, ids, guardar, linha } = await cenario();
    await expect(
      rival.mutation(api.financeiro.anexarComprovante, {
        id: ids.parcela, storageId: await guardar("invasao"), filename: "x.pdf",
      }),
    ).rejects.toThrow(/não encontrado/i);
    expect((await linha(ids.parcela))!.comprovantes ?? []).toHaveLength(0);
    // E a dona também não alcança o lançamento da rival.
    await expect(
      dona.mutation(api.financeiro.anexarComprovante, {
        id: ids.parcelaAlheia, storageId: await guardar("x"), filename: "x.pdf",
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("a rival não REMOVE o comprovante da dona", async () => {
    const { dona, rival, ids, guardar, arquivoExiste } = await cenario();
    const arquivo = await guardar("pix");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: arquivo, filename: "pix.pdf",
    });
    await expect(
      rival.mutation(api.financeiro.removerComprovante, { id: ids.parcela, storageId: arquivo }),
    ).rejects.toThrow(/não encontrado/i);
    expect(await arquivoExiste(arquivo), "o arquivo da dona foi apagado").toBe(true);
  });

  it("a rival não FECHA o recebimento da dona", async () => {
    const { rival, ids, linha } = await cenario();
    await expect(
      rival.mutation(api.financeiro.registrarPagamento, { id: ids.parcela, isPaid: true }),
    ).rejects.toThrow(/não encontrado/i);
    expect((await linha(ids.parcela))!.isPaid).toBe(false);
  });

  it("`storageId` forjado não vira exclusão de arquivo", async () => {
    // O Convex não escopa storage por conta. Se `removerComprovante` apagasse
    // qualquer id recebido, seria uma porta para apagar arquivo alheio.
    const { dona, ids, guardar, arquivoExiste } = await cenario();
    const daRival = await guardar("arquivo-da-rival");
    await expect(
      dona.mutation(api.financeiro.removerComprovante, {
        id: ids.parcela, storageId: daRival,
      }),
    ).rejects.toThrow(/não encontrado/i);
    expect(await arquivoExiste(daRival), "apagou arquivo que não era do lançamento").toBe(true);
  });

  it("comprovante de um lançamento não alcança outro", async () => {
    const { dona, ids, guardar, arquivoExiste } = await cenario();
    const arquivo = await guardar("pix");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: arquivo, filename: "pix.pdf",
    });
    await expect(
      dona.mutation(api.financeiro.removerComprovante, {
        id: ids.outraParcela, storageId: arquivo,
      }),
    ).rejects.toThrow(/não encontrado/i);
    expect(await arquivoExiste(arquivo)).toBe(true);
  });

  it("deslogado não faz nada", async () => {
    const { t, ids, guardar } = await cenario();
    await expect(
      t.mutation(api.financeiro.anexarComprovante, {
        id: ids.parcela, storageId: await guardar("x"), filename: "x.pdf",
      }),
    ).rejects.toThrow();
  });
});

describe("a exclusão leva os arquivos junto", () => {
  it("apagar o lançamento apaga os comprovantes", async () => {
    const { dona, ids, guardar, arquivoExiste } = await cenario();
    const a = await guardar("a"); const b = await guardar("b");
    await dona.mutation(api.financeiro.anexarComprovante, { id: ids.parcela, storageId: a, filename: "a.pdf" });
    await dona.mutation(api.financeiro.anexarComprovante, { id: ids.parcela, storageId: b, filename: "b.pdf" });

    await dona.mutation(api.financeiro.deleteTransaction, { id: ids.parcela });

    expect(await arquivoExiste(a)).toBe(false);
    expect(await arquivoExiste(b)).toBe(false);
  });

  it("a CASCATA DO EVENTO leva os comprovantes", async () => {
    const { dona, ids, guardar, arquivoExiste } = await cenario();
    const arquivo = await guardar("pix");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: arquivo, filename: "pix.pdf",
    });

    await dona.mutation(api.events.remove, { id: ids.marina });

    expect(await arquivoExiste(arquivo), "a cascata do evento esqueceu o comprovante").toBe(false);
  });

  it("a CASCATA DO USUÁRIO leva os comprovantes, inclusive de lançamento AVULSO", async () => {
    // Lançamento sem `eventId` não é alcançado pela cascata do evento — só
    // por aqui. Se o arquivo ficasse, ninguém mais saberia que ele existiu.
    const { t, dona, ids, guardar, arquivoExiste } = await cenario();
    const doEvento = await guardar("do-evento");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: doEvento, filename: "evento.pdf",
    });

    const avulso = await dona.mutation(api.financeiro.addTransaction, {
      type: "income", category: "Outros", description: "Recebimento avulso",
      amount: 500, date: "2026-10-01", isPaid: true,
    });
    const semEvento = await guardar("avulso");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: avulso, storageId: semEvento, filename: "avulso.pdf",
    });

    await t.run(async (ctx: MutationCtx) => {
      await deleteUserDataCascade(ctx, ids.donaId);
    });

    expect(await arquivoExiste(doEvento), "comprovante de evento sobreviveu").toBe(false);
    expect(await arquivoExiste(semEvento), "comprovante avulso sobreviveu").toBe(false);
  });

  it("e o lançamento com arquivo já sumido ainda é apagável", async () => {
    const { t, dona, ids, guardar, linha } = await cenario();
    const arquivo = await guardar("some");
    await dona.mutation(api.financeiro.anexarComprovante, {
      id: ids.parcela, storageId: arquivo, filename: "some.pdf",
    });
    await t.run(async (ctx: MutationCtx) => ctx.storage.delete(arquivo));

    await dona.mutation(api.financeiro.deleteTransaction, { id: ids.parcela });

    expect(await linha(ids.parcela)).toBeNull();
  });
});
