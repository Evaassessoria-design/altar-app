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

// ═════════════════════════════════════════════════════════════════════════════
// A PROPOSTA SOB ATAQUE
//
// A proposta é o documento mais sensível do ALTAR por dois motivos ao mesmo
// tempo:
//
//  1. ela carrega PREÇO — o que a decoradora cobra de uma cliente específica.
//     Duas decoradoras da mesma cidade disputam o mesmo casamento; uma tabela
//     de preços vazada é dano comercial direto, não constrangimento;
//  2. ela é o único documento que SAI do sistema. Um campo interno que
//     atravesse a fronteira não volta.
//
// Por isso este arquivo não testa o caminho feliz. Ele testa o id colado do
// navegador, a sessão ausente, a proposta da concorrente e o orçamento que
// tem custo dentro.
//
// ── A CONVENÇÃO DO NOT_FOUND ────────────────────────────────────────────────
// Registro de outra conta responde "não encontrado", nunca "sem permissão".
// "Sem permissão" CONFIRMA que aquele id existe — e num sistema onde o id
// carrega o nome da cliente, confirmar já é contar.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = "2026-09-20T12:00:00.000Z";

/**
 * Duas decoradoras, cada uma com seu lead, seu evento e sua proposta.
 *
 * A da "outra" existe para ser atacada: todo teste abaixo tenta alcançá-la com
 * a sessão da "dona".
 */
async function cenario() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });
  const outra = await autenticarComo(t, {
    nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const idDe = async (subject: string) =>
      (await ctx.db
        .query("users")
        .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", subject))
        .unique())!._id;
    const donaId = await idDe("auth|aurora");
    const outraId = await idDe("auth|rival");

    const leadDaDona = await ctx.db.insert("leads", {
      userId: donaId, clientName: "Marina", stage: "contact", order: 0,
      eventType: "casamento", eventDate: "2026-12-05", guestCount: 180,
    });
    const leadAlheio = await ctx.db.insert("leads", {
      userId: outraId, clientName: "Cliente da rival", stage: "contact", order: 0,
    });
    const eventoDaDona = await ctx.db.insert("events", {
      userId: donaId, name: "Casamento Marina", type: "wedding",
      date: "2026-12-05", location: "Fazenda", clientName: "Marina", status: "planning",
    });
    const eventoAlheio = await ctx.db.insert("events", {
      userId: outraId, name: "Evento da rival", type: "wedding",
      date: "2026-12-06", location: "Salão", clientName: "Cliente da rival",
      status: "planning",
    });
    const propostaAlheia = await ctx.db.insert("proposals", {
      userId: outraId,
      eventId: eventoAlheio,
      titulo: "Proposta da rival",
      clienteNome: "Cliente da rival",
      itens: [{ descricao: "Projeto completo", valor: 240000 }],
      status: "enviada",
      versaoEnviada: {
        enviadaEm: AGORA,
        titulo: "Proposta da rival",
        investimento: 240000,
        itens: [{ descricao: "Projeto completo", valor: 240000 }],
      },
      createdAt: AGORA,
      updatedAt: AGORA,
    });

    return { donaId, outraId, leadDaDona, leadAlheio, eventoDaDona, eventoAlheio, propostaAlheia };
  });

  return { t, dona, outra, ids };
}

describe("proposta — sem sessão não se lê nem se escreve", () => {
  it("toda função pública recusa o visitante anônimo", async () => {
    const { t, ids } = await cenario();

    await expect(t.query(api.propostas.list, {})).rejects.toThrow();
    await expect(
      t.query(api.propostas.get, { id: ids.propostaAlheia }),
    ).rejects.toThrow();
    await expect(
      t.query(api.propostas.comoOClienteVe, { id: ids.propostaAlheia }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.propostas.create, { leadId: ids.leadDaDona }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.propostas.update, { id: ids.propostaAlheia, titulo: "x" }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.propostas.registrarEnvio, { id: ids.propostaAlheia }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.propostas.remove, { id: ids.propostaAlheia }),
    ).rejects.toThrow();
  });
});

describe("proposta de outra empresa", () => {
  it("não aparece na lista de quem não é dona", async () => {
    const { dona, ids } = await cenario();
    const minhas = await dona.query(api.propostas.list, {});
    expect(minhas.map((p) => p._id)).not.toContain(ids.propostaAlheia);
    expect(minhas).toHaveLength(0);
  });

  it("responde como inexistente na leitura — sem confirmar que existe", async () => {
    const { dona, ids } = await cenario();
    expect(await dona.query(api.propostas.get, { id: ids.propostaAlheia })).toBeNull();
    expect(
      await dona.query(api.propostas.comoOClienteVe, { id: ids.propostaAlheia }),
    ).toBeNull();
  });

  it("não pode ser editada, enviada, decidida nem apagada", async () => {
    const { t, dona, ids } = await cenario();

    await expect(
      dona.mutation(api.propostas.update, { id: ids.propostaAlheia, titulo: "invadida" }),
    ).rejects.toThrow(/não encontrada/i);
    await expect(
      dona.mutation(api.propostas.registrarEnvio, { id: ids.propostaAlheia }),
    ).rejects.toThrow(/não encontrada/i);
    await expect(
      dona.mutation(api.propostas.registrarDecisao, {
        id: ids.propostaAlheia, decisao: "recusada",
      }),
    ).rejects.toThrow(/não encontrada/i);
    await expect(
      dona.mutation(api.propostas.trazerDoOrcamento, { id: ids.propostaAlheia }),
    ).rejects.toThrow(/não encontrada/i);
    await expect(
      dona.mutation(api.propostas.remove, { id: ids.propostaAlheia }),
    ).rejects.toThrow(/não encontrada/i);

    // O ataque não pode ter deixado marca: o documento da rival continua
    // inteiro, com o título e a versão enviada que ela registrou.
    const intacta = await t.run((ctx: MutationCtx) => ctx.db.get(ids.propostaAlheia));
    expect(intacta?.titulo).toBe("Proposta da rival");
    expect(intacta?.status).toBe("enviada");
    expect(intacta?.versaoEnviada?.investimento).toBe(240000);
  });

  it("as consultas por vínculo não atravessam a fronteira", async () => {
    const { dona, ids } = await cenario();
    expect(await dona.query(api.propostas.doLead, { leadId: ids.leadAlheio })).toEqual([]);
    expect(await dona.query(api.propostas.doEvento, { eventId: ids.eventoAlheio })).toEqual([]);
  });
});

describe("nascer de um vínculo alheio", () => {
  it("recusa lead e evento de outra conta, e não grava nada", async () => {
    const { t, dona, ids } = await cenario();

    await expect(
      dona.mutation(api.propostas.create, { leadId: ids.leadAlheio }),
    ).rejects.toThrow(/não encontrad/i);
    await expect(
      dona.mutation(api.propostas.create, { eventId: ids.eventoAlheio }),
    ).rejects.toThrow(/não encontrad/i);

    const total = await t.run(async (ctx: MutationCtx) =>
      (await ctx.db.query("proposals").collect()).length,
    );
    // Só a da rival, criada no cenário.
    expect(total).toBe(1);
  });

  it("recusa a proposta que não nasce de lugar nenhum", async () => {
    const { dona } = await cenario();
    await expect(dona.mutation(api.propostas.create, {})).rejects.toThrow(
      /oportunidade ou de um evento/i,
    );
  });
});

describe("a versão enviada é passado, e passado não se reescreve", () => {
  it("editar a proposta não toca no que a cliente recebeu", async () => {
    const { t, dona, ids } = await cenario();
    const id = await dona.mutation(api.propostas.create, { leadId: ids.leadDaDona });

    await dona.mutation(api.propostas.update, {
      id,
      titulo: "Casamento Marina & Gabriel",
      itens: [{ descricao: "Projeto floral", valor: 38000 }],
    });
    await dona.mutation(api.propostas.registrarEnvio, { id });

    const enviada = (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!.versaoEnviada;
    expect(enviada?.investimento).toBe(38000);

    // Ela muda de ideia DEPOIS de mandar.
    await dona.mutation(api.propostas.update, {
      id,
      titulo: "Outro título",
      itens: [{ descricao: "Projeto floral", valor: 52000 }],
    });

    const depois = (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!;
    expect(depois.itens[0].valor).toBe(52000);
    // O congelado continua congelado — é o número que a cliente tem na mão.
    expect(depois.versaoEnviada?.investimento).toBe(38000);
    expect(depois.versaoEnviada?.titulo).toBe("Casamento Marina & Gabriel");

    // E a tela precisa saber que as duas divergem, para ela não discutir um
    // valor que a cliente nunca viu.
    const [resumo] = await dona.query(api.propostas.list, {});
    expect(resumo.divergeDoEnviado).toBe(true);
  });

  it("desfazer a decisão devolve ao rascunho sem apagar o envio", async () => {
    const { t, dona, ids } = await cenario();
    const id = await dona.mutation(api.propostas.create, { eventId: ids.eventoDaDona });
    await dona.mutation(api.propostas.update, {
      id, itens: [{ descricao: "Projeto", valor: 10000 }],
    });
    await dona.mutation(api.propostas.registrarEnvio, { id });
    await dona.mutation(api.propostas.registrarDecisao, { id, decisao: "aceita" });

    const aceita = (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!;
    expect(aceita.status).toBe("aceita");
    expect(aceita.decididaEm).toBeTruthy();

    await dona.mutation(api.propostas.registrarDecisao, { id, decisao: "rascunho" });
    const desfeita = (await t.run((ctx: MutationCtx) => ctx.db.get(id)))!;
    expect(desfeita.status).toBe("rascunho");
    expect(desfeita.decididaEm).toBeUndefined();
    expect(desfeita.versaoEnviada?.investimento).toBe(10000);
  });

  it("recusa registrar o envio de uma proposta sem escopo", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.propostas.create, { leadId: ids.leadDaDona });
    await expect(dona.mutation(api.propostas.registrarEnvio, { id })).rejects.toThrow(
      /pelo menos um item/i,
    );
  });
});

describe("o orçamento interno não atravessa para a proposta", () => {
  it("traz só receita — custo de fornecedor fica onde está", async () => {
    const { t, dona, ids } = await cenario();
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.insert("budgetItems", {
        userId: ids.donaId, eventId: ids.eventoDaDona, description: "Projeto floral",
        category: "flores", quantity: 1, unitPrice: 38000, type: "income", order: 0,
      });
      await ctx.db.insert("budgetItems", {
        userId: ids.donaId, eventId: ids.eventoDaDona,
        description: "Flores — Atacadão do Ceasa", category: "flores",
        quantity: 1, unitPrice: 9400, type: "expense", order: 1,
      });
    });

    const id = await dona.mutation(api.propostas.create, { eventId: ids.eventoDaDona });
    const r = await dona.mutation(api.propostas.trazerDoOrcamento, { id });
    expect(r.acrescentados).toBe(1);

    const doc = await dona.query(api.propostas.comoOClienteVe, { id });
    const texto = JSON.stringify(doc);
    expect(texto).toContain("Projeto floral");
    // O nome do fornecedor e o custo dele não podem existir no documento.
    expect(texto).not.toContain("Atacadão");
    expect(texto).not.toContain("9400");
  });

  it("a proposta sem evento não tem orçamento de onde trazer", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.propostas.create, { leadId: ids.leadDaDona });
    await expect(dona.mutation(api.propostas.trazerDoOrcamento, { id })).rejects.toThrow(
      /não está ligada a um evento/i,
    );
  });
});

describe("o documento que sai tem exatamente as chaves previstas", () => {
  it("nenhum campo interno do registro atravessa a fronteira", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.propostas.create, { leadId: ids.leadDaDona });
    // TODOS os campos opcionais preenchidos: o Convex não transporta chave
    // com valor `undefined`, então uma proposta vazia esconderia justamente as
    // chaves que este teste existe para enumerar.
    await dona.mutation(api.propostas.update, {
      id,
      apresentacao: "O conceito do dia.",
      condicoesPagamento: "30% na assinatura.",
      validadeAte: "2026-10-30",
      observacoes: "Valores sujeitos a confirmação de data.",
      itens: [{ descricao: "Projeto", detalhe: "Cerimônia e recepção", valor: 38000 }],
    });
    const doc = (await dona.query(api.propostas.comoOClienteVe, { id }))!;

    // Lista FECHADA: um campo novo no schema não entra aqui sem alguém
    // escrevê-lo em `paraOCliente` e neste teste, nessa ordem.
    expect(Object.keys(doc).sort()).toEqual(
      [
        "apresentacao", "cliente", "condicoesPagamento", "estudio", "evento",
        "investimento", "itens", "observacoes", "titulo", "validadeAte",
      ].sort(),
    );
    expect(Object.keys(doc.itens[0]).sort()).toEqual(["descricao", "detalhe", "valor"]);

    // E nada do registro interno: id, dono, status, vínculos, carimbos.
    for (const proibido of [
      "_id", "userId", "leadId", "eventId", "status", "versaoEnviada",
      "createdAt", "updatedAt", "decididaEm", "decididaPor", "motivoDaRecusa",
    ]) {
      expect(doc).not.toHaveProperty(proibido);
    }
  });
});

describe("valor que não pode ser gravado", () => {
  it("recusa NaN, infinito e negativo em vez de gravar um documento podre", async () => {
    const { dona, ids } = await cenario();
    const id = await dona.mutation(api.propostas.create, { leadId: ids.leadDaDona });

    for (const valor of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      await expect(
        dona.mutation(api.propostas.update, {
          id, itens: [{ descricao: "Projeto", valor }],
        }),
      ).rejects.toThrow();
    }
  });
});
