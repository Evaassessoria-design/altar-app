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

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComoAdmin, autenticarComoDecoradora } from "./test.auth";
import type { MutationCtx } from "./_generated/server";
import { LIVE_ALTAR } from "./lib/campanha";
import { MODELOS, TIPOS_DE_MENSAGEM, modeloPorId } from "./lib/mensagensDaCampanha";

// ═════════════════════════════════════════════════════════════════════════════
// PREPARAR, REVISAR, E PARAR
//
// A trava do produto: o ALTAR escreve a mensagem e para. Não envia, não agenda
// envio, não conhece número de saída. O último passo é de uma pessoa — e é
// isto que estes testes existem para manter, de forma verificável em vez de
// prometida num comentário.
//
// Uma campanha que dispara sozinha erra em escala, e erro em escala com o nome
// da empresa em cima não tem como voltar atrás.
// ═════════════════════════════════════════════════════════════════════════════

const MODULO = readFileSync("convex/campanhaRascunhos.ts", "utf-8");
const MENSAGENS = readFileSync("convex/lib/mensagensDaCampanha.ts", "utf-8");

function semComentarios(fonte: string): string {
  return fonte
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

async function cenario() {
  const t = convexTest(schema, modules);
  const admin = await autenticarComoAdmin(t);
  const decoradora = await autenticarComoDecoradora(t);

  const interessado = (over: Record<string, unknown> = {}) =>
    t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("landingLeads", {
        name: "Marina Alves",
        email: `m${Math.random()}@ex.com`,
        whatsapp: "(11) 99999-8888",
        intent: "demo" as const,
        campanha: LIVE_ALTAR.slug,
        ...over,
      }),
    );

  return { t, admin, decoradora, interessado };
}

// ── A FRONTEIRA ─────────────────────────────────────────────────────────────

describe("o sistema NÃO envia — em nenhuma camada", () => {
  it("o módulo de rascunhos não sabe fazer chamada nem agendar nada", () => {
    const codigo = semComentarios(MODULO);
    for (const proibido of [
      "fetch(",
      "scheduler",
      "communicationsOutbox",
      "adminApprovals",
      "sendMessage",
      "twilio",
      "graph.facebook",
    ]) {
      expect(codigo, `o módulo de rascunhos aprendeu a ${proibido}`).not.toContain(proibido);
    }
  });

  it("a biblioteca de mensagens recebe dados e devolve texto, e nada mais", () => {
    const codigo = semComentarios(MENSAGENS);
    for (const proibido of ["fetch(", "ctx.", "scheduler", "sendMessage", "process.env"]) {
      expect(codigo, `a biblioteca aprendeu a ${proibido}`).not.toContain(proibido);
    }
  });

  it('não existe estado "enviado" sem "manualmente"', () => {
    // O nome longo é a trava. Encurtar para "enviado" faria o estado parecer
    // algo que o sistema faz — e a fila inteira parecer uma fila de disparo.
    const codigo = semComentarios(MODULO);
    expect(codigo).toContain("enviado_manualmente");
    expect(codigo).not.toMatch(/v\.literal\("enviado"\)/);

    const esquema = semComentarios(readFileSync("convex/schema.ts", "utf-8"));
    const tabela = esquema.slice(
      esquema.indexOf("campaignDrafts: defineTable"),
      esquema.indexOf("campaignDrafts: defineTable") + 3000,
    );
    expect(tabela).not.toMatch(/v\.literal\("enviado"\)/);
    // A tabela não pode ganhar um ponteiro para a Central: é por ali que a
    // porta de saída acha o que mandar.
    expect(tabela).not.toContain("conversationId");
    expect(tabela).not.toContain("communicationsOutbox");
  });
});

// ── QUEM PODE ───────────────────────────────────────────────────────────────

describe("isolamento — a campanha é da ALTAR, não das assinantes", () => {
  it("decoradora não lê, não prepara e não decide", async () => {
    const { admin, decoradora, interessado } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });

    await expect(
      decoradora.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
    await expect(
      decoradora.mutation(api.campanhaRascunhos.preparar, { leadId }),
    ).rejects.toThrow();
    await expect(
      decoradora.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "aprovar" }),
    ).rejects.toThrow();
    await expect(
      decoradora.mutation(api.campanhaRascunhos.editarTexto, { draftId, texto: "oi" }),
    ).rejects.toThrow();
  });

  it("visitante sem sessão não alcança nada", async () => {
    const { t, admin, interessado } = await cenario();
    const leadId = await interessado();
    await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await expect(
      t.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
  });
});

// ── PREPARAR ────────────────────────────────────────────────────────────────

describe("preparar", () => {
  it("preparar duas vezes NÃO cria dois convites iguais", async () => {
    // Clicar duas vezes deixaria dois convites na fila, e alguém mandaria os
    // dois. A mesma decoradora receberia a mesma mensagem em duplicata.
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const a = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    const b = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    expect(b).toBe(a);

    const lista = await admin.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug });
    expect(lista.rascunhos).toHaveLength(1);
  });

  it("mas um rascunho DESCARTADO não bloqueia preparar de novo", async () => {
    // Descartar é dizer "este texto não serve". Se isso travasse o preparo,
    // corrigir um rascunho ruim seria impossível sem mexer no banco.
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const a = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId: a, decisao: "descartar" });
    const b = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    expect(b).not.toBe(a);
  });

  it("o texto fica GRAVADO, não é regerado na leitura", async () => {
    // O modelo é determinístico hoje. No dia em que alguém corrigir uma
    // vírgula, o que foi aprovado e o que seria enviado passariam a ser duas
    // coisas — e ninguém perceberia.
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    const lista = await admin.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug });
    expect(lista.rascunhos[0].texto).toContain("Olá, Marina!");
    expect(lista.rascunhos[0].texto.length).toBeGreaterThan(100);
  });

  it("quem não tem canal NÃO entra na fila de rascunhos sozinho", async () => {
    // ── DUAS FILAS DIFERENTES ─────────────────────────────────────────────
    // Preparar uma mensagem para quem não tem telefone nem e-mail é produzir
    // trabalho que não tem para onde ir. Essa pessoa é caso da fila "Precisa
    // de você" — alguém procura o contato dela —, não da fila de revisão.
    const { admin, interessado } = await cenario();
    const leadId = await interessado({ whatsapp: undefined, email: "" });
    await expect(
      admin.mutation(api.campanhaRascunhos.preparar, { leadId }),
    ).rejects.toThrow(/telefone nem e-mail/i);

    const lote = await admin.mutation(api.campanhaRascunhos.prepararPendentes, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(lote.preparados, "o lote também não prepara no vácuo").toBe(0);
  });

  it("mas um pedido EXPLÍCITO prepara, com a pendência escrita", async () => {
    // A escolha de quem clicou vale — é o mesmo princípio do Assistente. O que
    // não pode é a pendência sumir: sem canal, aquele texto não sai, e aprovar
    // precisa continuar barrado.
    const { admin, interessado } = await cenario();
    const leadId = await interessado({ whatsapp: undefined, email: "" });
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, {
      leadId,
      tipo: "convite",
    });

    const lista = await admin.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug });
    expect(lista.rascunhos[0].pendencias.join(" ")).toMatch(/telefone nem e-mail/i);
    await expect(
      admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "aprovar" }),
    ).rejects.toThrow(/falta resolver/i);
  });

  it("id de um interessado que não existe responde NOT_FOUND", async () => {
    const { t, admin, interessado } = await cenario();
    const leadId = await interessado();
    await t.run(async (ctx: MutationCtx) => ctx.db.delete(leadId));
    await expect(
      admin.mutation(api.campanhaRascunhos.preparar, { leadId }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("modelo que não existe responde NOT_FOUND, não escolhe outro em silêncio", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    await expect(
      admin.mutation(api.campanhaRascunhos.preparar, { leadId, tipo: "modelo_inventado" }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("quem já é cliente NÃO recebe mensagem de aquisição preparada", async () => {
    // Continuar abordando quem assinou faz o cliente novo receber convite para
    // conhecer o produto que ele acabou de comprar.
    const { admin, interessado } = await cenario();
    const leadId = await interessado({ status: "convertido" });
    await expect(
      admin.mutation(api.campanhaRascunhos.preparar, { leadId }),
    ).rejects.toThrow(/não há mensagem a preparar/i);
  });

  it("quem disse que não também não recebe nada preparado", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado({ status: "descartado" });
    await expect(
      admin.mutation(api.campanhaRascunhos.preparar, { leadId }),
    ).rejects.toThrow(/não há mensagem a preparar/i);
  });
});

// ── LOTE ────────────────────────────────────────────────────────────────────

describe("preparar em lote", () => {
  it("prepara os que precisam e ignora os que já têm", async () => {
    const { admin, interessado } = await cenario();
    for (let i = 0; i < 5; i++) await interessado();
    const primeiro = await admin.mutation(api.campanhaRascunhos.prepararPendentes, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(primeiro.preparados).toBe(5);

    const segundo = await admin.mutation(api.campanhaRascunhos.prepararPendentes, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(segundo.preparados, "rodar de novo não duplica").toBe(0);
  });

  it("não toca em quem é de OUTRA campanha", async () => {
    const { admin, interessado } = await cenario();
    await interessado();
    await interessado({ campanha: "outra-campanha" });
    await interessado({ campanha: undefined });

    const r = await admin.mutation(api.campanhaRascunhos.prepararPendentes, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.preparados).toBe(1);
  });

  it("o teto do lote é declarado, e rodar de novo continua de onde parou", async () => {
    // Preparar trezentos numa transação não fecha — e, pior, fecharia pela
    // metade sem ninguém saber quais ficaram.
    const { admin, interessado } = await cenario();
    for (let i = 0; i < 55; i++) await interessado();

    const primeiro = await admin.mutation(api.campanhaRascunhos.prepararPendentes, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(primeiro.preparados).toBe(50);
    expect(primeiro.restantes, "o corte precisa ser declarado").toBe(5);

    const segundo = await admin.mutation(api.campanhaRascunhos.prepararPendentes, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(segundo.preparados).toBe(5);
    expect(segundo.restantes).toBe(0);
  });
});

// ── DECIDIR ─────────────────────────────────────────────────────────────────

describe("aprovar, descartar, anotar envio", () => {
  it("aprovar NÃO envia nada — só muda o estado e registra quem decidiu", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "aprovar" });

    const lista = await admin.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug });
    const r = lista.rascunhos[0];
    expect(r.status).toBe("aprovado");
    expect(r.decididoPorUserId, "aprovação sem autor não é aprovação").toBeTruthy();
    expect(r.enviadoEm, "aprovar não é enviar").toBeUndefined();
  });

  it("NÃO dá para aprovar um texto com buraco", async () => {
    // O lembrete precisa do link da sala, e a sala não existe. Aprovar um
    // texto com "[LINK DA SALA — ainda não definido]" no meio é o mesmo que
    // não ter revisado: o buraco só apareceria para quem recebesse.
    const { admin, interessado } = await cenario();
    const leadId = await interessado({ status: "confirmou" });
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, {
      leadId,
      tipo: "lembrete_24h",
    });

    const lista = await admin.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug });
    expect(lista.rascunhos[0].pendencias.join(" ")).toMatch(/link da sala/i);
    await expect(
      admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "aprovar" }),
    ).rejects.toThrow(/falta resolver/i);
  });

  it("editar depois de aprovado DERRUBA a aprovação", async () => {
    // A aprovação era daquele texto, não daquela pessoa. Sem esta regra,
    // editar depois de aprovado produziria um texto aprovado que ninguém leu.
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "aprovar" });
    await admin.mutation(api.campanhaRascunhos.editarTexto, {
      draftId,
      texto: "Outro texto completamente diferente.",
    });

    const lista = await admin.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug });
    expect(lista.rascunhos[0].status).toBe("rascunho");
    expect(lista.rascunhos[0].decididoPorUserId).toBeUndefined();
    expect(lista.rascunhos[0].geradoPor).toBe("humano");
  });

  it("o que já foi enviado não pode ser reescrito", async () => {
    // Reescrever apagaria o registro do que a pessoa mandou, e o histórico
    // deixaria de bater com o WhatsApp dela.
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "marcar_enviado" });
    await expect(
      admin.mutation(api.campanhaRascunhos.editarTexto, { draftId, texto: "mudei de ideia" }),
    ).rejects.toThrow(/já foi enviada/i);
  });

  it("texto vazio não passa", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await expect(
      admin.mutation(api.campanhaRascunhos.editarTexto, { draftId, texto: "   " }),
    ).rejects.toThrow(/vazio/i);
  });

  it("marcar enviado registra QUANDO alguém disse que enviou, não entrega", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "marcar_enviado" });

    const lista = await admin.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug });
    expect(lista.rascunhos[0].status).toBe("enviado_manualmente");
    expect(lista.rascunhos[0].enviadoEm).toBeTypeOf("number");
  });

  it("o filtro por estado é da CONSULTA, não da página carregada", async () => {
    const { admin, interessado } = await cenario();
    const a = await interessado();
    const b = await interessado();
    const da = await admin.mutation(api.campanhaRascunhos.preparar, { leadId: a });
    await admin.mutation(api.campanhaRascunhos.preparar, { leadId: b });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId: da, decisao: "aprovar" });

    const aprovados = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "aprovado",
    });
    expect(aprovados.rascunhos).toHaveLength(1);
    expect(aprovados.rascunhos[0]._id).toBe(da);
  });
});

// ── OS MODELOS ──────────────────────────────────────────────────────────────

describe("a biblioteca de mensagens", () => {
  it("tem os dez modelos que a campanha precisa", () => {
    expect(MODELOS).toHaveLength(10);
    expect(new Set(MODELOS.map((m) => m.id)).size, "id repetido").toBe(10);
    for (const tipo of TIPOS_DE_MENSAGEM) {
      expect(modeloPorId(tipo), `falta o modelo ${tipo}`).toBeTruthy();
    }
  });

  it("nenhum modelo promete preço, desconto ou prazo", () => {
    // Um rascunho que promete condição vira promessa quando alguém envia sem
    // ler. Condição comercial é conversa, não modelo de texto.
    for (const modelo of MODELOS) {
      const texto = modelo
        .redigir({ nome: "Marina Alves", empresa: "Estúdio Alba" })
        .texto.toLowerCase();
      for (const proibido of [
        "desconto",
        "grátis",
        "gratuito",
        "r$",
        "%",
        "promoção",
        "oferta",
        "sem compromisso",
        "por tempo limitado",
      ]) {
        expect(texto, `${modelo.id} prometeu ${proibido}`).not.toContain(proibido);
      }
    }
  });

  it("nenhum modelo elogia um trabalho que ninguém viu", () => {
    for (const modelo of MODELOS) {
      const texto = modelo
        .redigir({ nome: "Marina", empresa: "Estúdio Alba" })
        .texto.toLowerCase();
      for (const bajulacao of ["lindo", "incrível", "maravilhoso", "admiro", "acompanho seu"]) {
        expect(texto, `${modelo.id} bajulou`).not.toContain(bajulacao);
      }
    }
  });

  it("todo modelo é DETERMINÍSTICO", () => {
    // Quem revisa trinta mensagens confia nas outras vinte e nove. Texto
    // diferente a cada chamada obriga a ler todas.
    for (const modelo of MODELOS) {
      const c = { nome: "Marina Alves", empresa: "Alba" };
      expect(modelo.redigir(c).texto, modelo.id).toBe(modelo.redigir(c).texto);
    }
  });

  it("nome vazio nunca produz 'Olá, !'", () => {
    for (const modelo of MODELOS) {
      const texto = modelo.redigir({ nome: "   " }).texto;
      expect(texto, modelo.id).not.toContain("Olá, !");
      expect(texto, modelo.id).toContain("Olá!");
    }
  });

  it("os modelos que dependem do link DECLARAM que ele falta", () => {
    // A campanha não tem link de sala. Nenhum modelo inventa um, e os que
    // precisam dele sobem a pendência em vez de deixar um buraco silencioso.
    expect(LIVE_ALTAR.linkDaReuniao, "a sala ainda não existe").toBeUndefined();
    for (const id of ["confirmacao", "lembrete_24h", "lembrete_30min"] as const) {
      const r = modeloPorId(id)!.redigir({ nome: "Marina" });
      expect(r.pendencias.join(" "), id).toMatch(/link da sala/i);
      expect(r.texto, id).toContain("[LINK DA SALA");
    }
  });

  it("os modelos que NÃO dependem do link saem sem pendência", () => {
    for (const id of ["convite", "follow_up_sem_resposta", "convite_trial"] as const) {
      expect(modeloPorId(id)!.redigir({ nome: "Marina" }).pendencias, id).toEqual([]);
    }
  });

  it("a chamada do convite bate com o que o classificador de respostas espera", () => {
    // O convite pede "me responda QUERO PARTICIPAR". Se o texto e o
    // classificador divergirem, a resposta combinada com a própria pessoa
    // deixaria de ser reconhecida.
    expect(modeloPorId("convite")!.redigir({ nome: "Marina" }).texto).toContain(
      "QUERO PARTICIPAR",
    );
  });
});
