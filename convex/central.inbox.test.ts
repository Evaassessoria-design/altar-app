import { describe, expect, it, vi } from "vitest";

// A sessão do Better Auth vive num componente que o convex-test não registra.
// Só a tradução "sessão → usuário" é substituída; `requireUser`, `requireAdmin`
// e o índice `by_better_auth_id` continuam sendo os de verdade.
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
import { autenticarComoAdmin, autenticarComoDecoradora } from "./test.auth";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { textoDeBusca } from "./lib/central/busca";

// ═════════════════════════════════════════════════════════════════════════════
// CAIXA DE ENTRADA — o que a lista AFIRMA tem de ser verdade
//
// O defeito que estes testes existem para impedir é de uma família só: a tela
// mostrar um recorte e a pessoa lê-lo como o todo.
//
//   · filtrar depois de carregar devolve "as urgentes ENTRE as 25 primeiras";
//   · paginar sem filtro no banco esconde a conversa antiga que ainda importa;
//   · buscar sem índice acha só quem digitou exatamente como está gravado.
//
// Todos eles passam despercebidos em revisão de código e aparecem como
// "ninguém respondeu aquele cliente".
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = Date.parse("2026-09-18T12:00:00Z");

type Semente = {
  assunto: string;
  contato: string;
  telefone?: string;
  departamento?: "triagem" | "comercial" | "suporte" | "financeiro" | "ouvidoria";
  prioridade?: "baixa" | "normal" | "alta" | "urgente";
  status?:
    | "aberta"
    | "aguardando_cliente"
    | "aguardando_aprovacao"
    | "escalada_ceo"
    | "resolvida"
    | "arquivada";
  canal?: "whatsapp" | "instagram" | "email" | "chat";
  escalada?: boolean;
  quandoMs?: number;
  /** Simula conversa anterior ao campo `buscaTexto`/classificação. */
  semDerivados?: boolean;
};

async function comAdmin(t: ReturnType<typeof convexTest>) {
  return autenticarComoAdmin(t);
}

async function semear(
  t: ReturnType<typeof convexTest>,
  sementes: Semente[],
): Promise<Id<"communicationConversations">[]> {
  return t.run(async (ctx) => {
    const ids: Id<"communicationConversations">[] = [];
    for (const [indice, s] of sementes.entries()) {
      const contactId = await ctx.db.insert("adminContacts", {
        vertical: "altar_decor",
        displayName: s.contato,
        tipo: "interessado",
        criadoEm: AGORA,
        atualizadoEm: AGORA,
      });

      if (s.telefone) {
        await ctx.db.insert("communicationIdentities", {
          contactId,
          channel: s.canal ?? "whatsapp",
          externalId: s.telefone,
          verificadoPor: "automatico",
          criadoEm: AGORA,
        });
      }

      const conversationId = await ctx.db.insert("communicationConversations", {
        vertical: "altar_decor",
        channel: s.canal ?? "whatsapp",
        contactId,
        assunto: s.assunto,
        departamento: s.semDerivados ? undefined : (s.departamento ?? "triagem"),
        prioridade: s.semDerivados ? undefined : (s.prioridade ?? "normal"),
        status: s.status ?? "aberta",
        escaladaParaCeo: s.escalada,
        ultimaMensagemEm: s.quandoMs ?? AGORA - indice * 60_000,
        ultimaMensagemDirecao: "entrada",
        naoLidas: 1,
        buscaTexto: s.semDerivados
          ? undefined
          : textoDeBusca([s.assunto, s.contato, s.telefone]),
        criadaEm: AGORA,
        atualizadaEm: AGORA,
      });

      ids.push(conversationId);
    }
    return ids;
  });
}

const PAGINA = { numItems: 10, cursor: null };

describe("a lista responde pelo conjunto inteiro, não pela página", () => {
  it("o filtro de prioridade alcança conversa FORA da primeira página", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    // 30 conversas normais e recentes; a urgente é a MAIS ANTIGA — ou seja,
    // não cabe na primeira página por recência.
    const sementes: Semente[] = Array.from({ length: 30 }, (_, i) => ({
      assunto: `Conversa ${i}`,
      contato: `Pessoa ${i}`,
      quandoMs: AGORA - i * 60_000,
    }));
    sementes.push({
      assunto: "Cliente furioso",
      contato: "Helena",
      prioridade: "urgente",
      quandoMs: AGORA - 999 * 60_000,
    });
    await semear(t, sementes);

    const primeiraPagina = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      prioridade: "urgente",
    });

    expect(primeiraPagina.page.map((c) => c.assunto)).toContain("Cliente furioso");
  });

  it("filtrar por Triagem também traz a conversa SEM departamento gravado", async () => {
    // Ausente significa "triagem" (schema). Uma conversa recém-chegada é
    // justamente a que está em triagem — seria a única a sumir do filtro.
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(t, [
      { assunto: "Recém-chegada", contato: "Ana", semDerivados: true },
      { assunto: "Já roteada", contato: "Bruno", departamento: "comercial" },
    ]);

    const resultado = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      departamento: "triagem",
    });

    expect(resultado.page.map((c) => c.assunto)).toEqual(["Recém-chegada"]);
  });

  it("filtrar por prioridade Normal também traz a conversa sem prioridade gravada", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(t, [
      { assunto: "Sem prioridade", contato: "Ana", semDerivados: true },
      { assunto: "Urgente", contato: "Bruno", prioridade: "urgente" },
    ]);

    const resultado = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      prioridade: "normal",
    });

    expect(resultado.page.map((c) => c.assunto)).toEqual(["Sem prioridade"]);
  });

  it("os filtros se combinam: departamento + status + canal + escalada", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(t, [
      {
        assunto: "Alvo",
        contato: "Helena",
        departamento: "comercial",
        status: "escalada_ceo",
        canal: "whatsapp",
        escalada: true,
      },
      {
        assunto: "Outro departamento",
        contato: "Bruno",
        departamento: "suporte",
        status: "escalada_ceo",
        escalada: true,
      },
      {
        assunto: "Não escalada",
        contato: "Carla",
        departamento: "comercial",
        status: "aberta",
      },
      {
        assunto: "Outro canal",
        contato: "Diana",
        departamento: "comercial",
        status: "escalada_ceo",
        canal: "instagram",
        escalada: true,
      },
    ]);

    const resultado = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      departamento: "comercial",
      status: "escalada_ceo",
      canal: "whatsapp",
      apenasEscaladas: true,
    });

    expect(resultado.page.map((c) => c.assunto)).toEqual(["Alvo"]);
  });

  it("pagina de verdade: a segunda página continua de onde a primeira parou", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(
      t,
      Array.from({ length: 12 }, (_, i) => ({
        assunto: `Conversa ${i}`,
        contato: `Pessoa ${i}`,
        quandoMs: AGORA - i * 60_000,
      })),
    );

    const primeira = await admin.query(api.communications.listarConversas, {
      paginationOpts: { numItems: 5, cursor: null },
    });
    expect(primeira.page).toHaveLength(5);
    expect(primeira.isDone).toBe(false);

    const segunda = await admin.query(api.communications.listarConversas, {
      paginationOpts: { numItems: 5, cursor: primeira.continueCursor },
    });

    const idsDaPrimeira = primeira.page.map((c) => c._id);
    for (const c of segunda.page) {
      expect(idsDaPrimeira).not.toContain(c._id);
    }
  });

  it("sem busca, a ordem é por recência — e a tela é avisada disso", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(t, [
      { assunto: "Antiga", contato: "Ana", quandoMs: AGORA - 10 * 60_000 },
      { assunto: "Nova", contato: "Bruno", quandoMs: AGORA },
    ]);

    const resultado = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
    });

    expect(resultado.ordenadoPor).toBe("recencia");
    expect(resultado.page[0].assunto).toBe("Nova");
  });
});

describe("a busca encontra por nome, por número e por assunto", () => {
  it("acha pelo nome de quem está do outro lado", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(t, [
      { assunto: "Orçamento para setembro", contato: "Helena Prado" },
      { assunto: "Dúvida sobre acervo", contato: "Bruno Lima" },
    ]);

    const resultado = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      busca: "helena",
    });

    expect(resultado.ordenadoPor).toBe("relevancia");
    expect(resultado.page.map((c) => c.contato?.nome)).toEqual(["Helena Prado"]);
  });

  it("acha pelo telefone, mesmo com o número digitado sem formatação", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(t, [
      { assunto: "Quero conhecer", contato: "Helena", telefone: "+5511999998888" },
      { assunto: "Outra coisa", contato: "Bruno", telefone: "+5511777776666" },
    ]);

    const resultado = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      busca: "5511999998888",
    });

    expect(resultado.page.map((c) => c.contato?.nome)).toEqual(["Helena"]);
  });

  it("acha pelo assunto, ignorando acento e caixa", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(t, [
      { assunto: "Orçamento urgente", contato: "Ana" },
      { assunto: "Instalação da planta", contato: "Bruno" },
    ]);

    const resultado = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      busca: "ORCAMENTO",
    });

    expect(resultado.page.map((c) => c.assunto)).toEqual(["Orçamento urgente"]);
  });

  it("a busca respeita os filtros — não é um atalho para ver tudo", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(t, [
      { assunto: "Helena comercial", contato: "Helena", departamento: "comercial" },
      { assunto: "Helena suporte", contato: "Helena", departamento: "suporte" },
    ]);

    const resultado = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      busca: "helena",
      departamento: "suporte",
    });

    expect(resultado.page.map((c) => c.assunto)).toEqual(["Helena suporte"]);
  });

  it("termo de uma letra não é busca — devolve a lista normal", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await semear(t, [{ assunto: "Uma conversa", contato: "Ana" }]);

    const resultado = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      busca: "a",
    });

    expect(resultado.ordenadoPor).toBe("recencia");
    expect(resultado.page).toHaveLength(1);
  });
});

describe("o texto de busca é derivado e se mantém", () => {
  it("a conversa nasce encontrável pelo recebimento normal", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("landingLeads", {
        name: "Helena Prado",
        email: "helena@example.com",
        intent: "demo",
        whatsappE164: "+5511999998888",
      });
    });

    await t.mutation(internal.communications.registrarEntrada, {
      vertical: "altar_decor",
      provider: "mock",
      recebidoEm: AGORA,
      mensagens: [
        {
          canal: "whatsapp",
          externalMessageId: "wamid.1",
          externalContactId: "+5511999998888",
          direcao: "entrada",
          tipo: "texto",
          texto: "Oi! Queria conhecer o ALTAR",
          enviadaEm: AGORA,
        },
      ],
    });

    const porNome = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      busca: "helena",
    });
    expect(porNome.page).toHaveLength(1);

    const porNumero = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      busca: "5511999998888",
    });
    expect(porNumero.page).toHaveLength(1);
  });

  it("o reparo preenche as conversas anteriores ao campo, sem inventar nada", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    const [conversationId] = await semear(t, [
      { assunto: "Conversa antiga", contato: "Helena", semDerivados: true },
    ]);

    // Antes do reparo a conversa existe e opera normalmente — só não está
    // indexada para busca. (A busca em si não é exercitada aqui: o convex-test
    // não tolera documento sem o campo indexado, coisa que o Convex real
    // trata como "não casa".)
    const antes = await t.run(async (ctx) => ctx.db.get(conversationId));
    expect(antes?.buscaTexto).toBeUndefined();

    const resultado = await t.mutation(internal.communications.repararIndiceDeBusca, {});
    expect(resultado.reparadas).toBe(1);

    const depois = await t.run(async (ctx) => ctx.db.get(conversationId));
    expect(depois?.buscaTexto).toContain("helena");

    const achada = await admin.query(api.communications.listarConversas, {
      paginationOpts: PAGINA,
      busca: "helena",
    });
    expect(achada.page).toHaveLength(1);

    // Idempotente: rodar de novo não tem o que reparar.
    const denovo = await t.mutation(internal.communications.repararIndiceDeBusca, {});
    expect(denovo.reparadas).toBe(0);
  });
});

describe("histórico completo", () => {
  it("pagina as mensagens da mais recente para a mais antiga", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);

    const [conversationId] = await semear(t, [{ assunto: "Longa", contato: "Helena" }]);

    await t.run(async (ctx) => {
      for (let i = 0; i < 25; i++) {
        await ctx.db.insert("communicationMessages", {
          conversationId,
          vertical: "altar_decor",
          channel: "whatsapp",
          externalMessageId: `wamid.${i}`,
          direcao: "entrada",
          tipo: "texto",
          texto: `Mensagem ${i}`,
          autor: "cliente",
          enviadaEm: AGORA - (25 - i) * 60_000,
        });
      }
    });

    const primeira = await admin.query(api.communications.listarMensagens, {
      conversationId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(primeira.page).toHaveLength(10);
    expect(primeira.page[0].texto).toBe("Mensagem 24");
    expect(primeira.isDone).toBe(false);

    const segunda = await admin.query(api.communications.listarMensagens, {
      conversationId,
      paginationOpts: { numItems: 20, cursor: primeira.continueCursor },
    });
    expect(segunda.page).toHaveLength(15);
    expect(segunda.isDone).toBe(true);
  });
});

describe("notas internas", () => {
  it("gravam autor e data, e some junto quando a nota é apagada", async () => {
    const t = convexTest(schema, modules);
    const admin = await comAdmin(t);
    const [conversationId] = await semear(t, [{ assunto: "Conversa", contato: "Helena" }]);

    const contactId = await t.run(async (ctx) => {
      const conversa = await ctx.db.get(conversationId);
      return conversa!.contactId;
    });

    await admin.mutation(api.communications.definirNotas, {
      contactId,
      notas: "  Já pediu demonstração duas vezes.  ",
    });

    const comNota = await t.run(async (ctx) => ctx.db.get(contactId));
    expect(comNota?.notas).toBe("Já pediu demonstração duas vezes.");
    expect(comNota?.notasAtualizadasEm).toBeTypeOf("number");
    expect(comNota?.notasAtualizadasPorUserId).toBeTruthy();

    await admin.mutation(api.communications.definirNotas, { contactId, notas: "   " });

    const semNota = await t.run(async (ctx) => ctx.db.get(contactId));
    expect(semNota?.notas).toBeUndefined();
    expect(semNota?.notasAtualizadasEm).toBeUndefined();
    expect(semNota?.notasAtualizadasPorUserId).toBeUndefined();
  });

  it("quem não é administrador não lê nem escreve nada da Central", async () => {
    const t = convexTest(schema, modules);
    await comAdmin(t);
    const [conversationId] = await semear(t, [{ assunto: "Conversa", contato: "Helena" }]);
    const contactId = await t.run(async (ctx) => {
      const conversa = await ctx.db.get(conversationId);
      return conversa!.contactId;
    });

    const decoradora = await autenticarComoDecoradora(t);

    await expect(
      decoradora.query(api.communications.listarConversas, { paginationOpts: PAGINA }),
    ).rejects.toThrow();

    await expect(
      decoradora.mutation(api.communications.definirNotas, { contactId, notas: "oi" }),
    ).rejects.toThrow();

    await expect(
      decoradora.query(api.communications.listarMensagens, {
        conversationId,
        paginationOpts: PAGINA,
      }),
    ).rejects.toThrow();
  });
});
