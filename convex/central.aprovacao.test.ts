import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import schema from "./schema";
import { modules } from "./test.setup";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ═════════════════════════════════════════════════════════════════════════════
// TRAVA CENTRAL DA FASE 1
//
//   NENHUMA MENSAGEM EXTERNA SAI SEM APROVAÇÃO HUMANA,
//   E NA FASE 1 NENHUMA SAI DE JEITO NENHUM.
//
// As quatro travas do portão são exercitadas aqui pelo caminho REAL — a
// action de saída, com banco de verdade — e não só em unidade
// (lib/central/autonomia.test.ts). Uma trava que passa em unidade mas é
// contornada pelo fluxo não vale nada.
//
// O teste também espiona `fetch` global: se qualquer caminho tentar falar com
// o mundo, o espião registra e o teste quebra. É a prova de "zero chamada
// externa real", não a promessa.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = Date.parse("2026-09-18T12:00:00Z");

type Cenario = {
  conversationId: Id<"communicationConversations">;
  approvalId: Id<"adminApprovals">;
  adminId: Id<"users">;
};

/** Conversa recebida, triada e com resposta proposta — pronta para decisão. */
async function montarCenario(
  t: ReturnType<typeof convexTest>,
  over: {
    statusDaAprovacao?: "pendente" | "aprovada" | "recusada" | "expirada" | "executada";
    comAutor?: boolean;
    janelaRespostaAte?: number | null;
    optOut?: boolean;
  } = {},
): Promise<Cenario> {
  return t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      name: "Matheus",
      email: "matheus@altar.example",
      role: "admin",
      subscriptionStatus: "active",
    });

    const contactId = await ctx.db.insert("adminContacts", {
      vertical: "altar_decor",
      displayName: "Helena",
      tipo: "interessado",
      optOut: over.optOut,
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    });

    await ctx.db.insert("communicationIdentities", {
      contactId,
      channel: "whatsapp",
      externalId: "+5511999998888",
      verificadoPor: "automatico",
      criadoEm: AGORA,
    });

    const conversationId = await ctx.db.insert("communicationConversations", {
      vertical: "altar_decor",
      channel: "whatsapp",
      contactId,
      assunto: "Quer conhecer o ALTAR",
      departamento: "comercial",
      categoria: "novo_interessado",
      prioridade: "normal",
      status: "aguardando_aprovacao",
      ultimaMensagemEm: AGORA - 60_000,
      ultimaMensagemDirecao: "entrada",
      naoLidas: 1,
      // Relativa ao RELÓGIO, não à data fixa do cenário: a janela do canal é
      // um intervalo real de 24h, e o portão a compara com `Date.now()`.
      janelaRespostaAte:
        over.janelaRespostaAte === undefined
          ? Date.now() + 3_600_000
          : (over.janelaRespostaAte ?? undefined),
      criadaEm: AGORA,
      atualizadaEm: AGORA,
    });

    const approvalId = await ctx.db.insert("adminApprovals", {
      vertical: "altar_decor",
      conversationId,
      contactId,
      proposta: { kind: "mensagem_saida", texto: "Olá, Helena! Posso te mostrar o ALTAR?" },
      status: over.statusDaAprovacao ?? "aprovada",
      geradoPor: "ia",
      modelo: "modelo-de-teste",
      decididoPorUserId: (over.comAutor ?? true) ? adminId : undefined,
      decididoEm: (over.comAutor ?? true) ? AGORA : undefined,
      criadoEm: AGORA,
    });

    return { conversationId, approvalId, adminId };
  });
}

let espiaoDeFetch: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.unstubAllEnvs();
  espiaoDeFetch = vi.spyOn(globalThis, "fetch");
});

/** Nada saiu: nem requisição externa, nem mensagem de saída no histórico. */
async function nadaSaiu(t: ReturnType<typeof convexTest>) {
  const chamadasExternas = espiaoDeFetch.mock.calls.filter((chamada: unknown[]) => {
    const alvo = chamada[0];
    return typeof alvo === "string" && alvo.startsWith("http");
  });
  expect(chamadasExternas).toHaveLength(0);

  const saidas = await t.run(async (ctx) =>
    ctx.db
      .query("communicationMessages")
      .filter((q) => q.eq(q.field("direcao"), "saida"))
      .collect(),
  );
  expect(saidas).toHaveLength(0);
}

describe("as quatro travas, pelo caminho real", () => {
  it("TRAVA 3 — com TUDO aprovado, a Fase 1 ainda não deixa sair", async () => {
    // O cenário mais importante do BLOCO 1: o Matheus aprovou, o autor está
    // registrado, a janela está aberta, o canal está configurado. Mesmo assim
    // NÃO sai, porque ALTAR_CENTRAL_ENVIO_HABILITADO não está ligada.
    vi.stubEnv("ALTAR_WHATSAPP_PROVIDER", "mock");
    vi.stubEnv("ALTAR_CENTRAL_MOCK_TOKEN", "token-dev");

    const t = convexTest(schema, modules);
    const { approvalId } = await montarCenario(t);

    const r = await t.action(internal.communicationsOutbox.executarAprovacao, { approvalId });

    expect(r.enviado).toBe(false);
    expect(r.motivo).toContain("ALTAR_CENTRAL_ENVIO_HABILITADO");
    await nadaSaiu(t);
  });

  it("TRAVA 3 — env explicitamente 'false' também não deixa sair", async () => {
    vi.stubEnv("ALTAR_CENTRAL_ENVIO_HABILITADO", "false");
    const t = convexTest(schema, modules);
    const { approvalId } = await montarCenario(t);

    const r = await t.action(internal.communicationsOutbox.executarAprovacao, { approvalId });
    expect(r.enviado).toBe(false);
    await nadaSaiu(t);
  });

  it("TRAVA 1 — proposta pendente não sai, mesmo com o envio ligado", async () => {
    vi.stubEnv("ALTAR_CENTRAL_ENVIO_HABILITADO", "true");
    const t = convexTest(schema, modules);
    const { approvalId } = await montarCenario(t, { statusDaAprovacao: "pendente" });

    const r = await t.action(internal.communicationsOutbox.executarAprovacao, { approvalId });
    expect(r.enviado).toBe(false);
    expect(r.motivo).toContain("aprovado");
    await nadaSaiu(t);
  });

  it("TRAVA 2 — aprovação SEM autor não sai, mesmo com o envio ligado", async () => {
    vi.stubEnv("ALTAR_CENTRAL_ENVIO_HABILITADO", "true");
    const t = convexTest(schema, modules);
    const { approvalId } = await montarCenario(t, { comAutor: false });

    const r = await t.action(internal.communicationsOutbox.executarAprovacao, { approvalId });
    expect(r.enviado).toBe(false);
    expect(r.motivo).toContain("autor");
    await nadaSaiu(t);
  });

  it("TRAVA 4 — janela do canal expirada não sai, mesmo com o envio ligado", async () => {
    vi.stubEnv("ALTAR_CENTRAL_ENVIO_HABILITADO", "true");
    const t = convexTest(schema, modules);
    const { approvalId } = await montarCenario(t, { janelaRespostaAte: Date.now() - 1 });

    const r = await t.action(internal.communicationsOutbox.executarAprovacao, { approvalId });
    expect(r.enviado).toBe(false);
    expect(r.motivo).toContain("Janela");
    await nadaSaiu(t);
  });

  it("opt-out do contato barra a saída antes do canal", async () => {
    vi.stubEnv("ALTAR_CENTRAL_ENVIO_HABILITADO", "true");
    vi.stubEnv("ALTAR_WHATSAPP_PROVIDER", "mock");
    vi.stubEnv("ALTAR_CENTRAL_MOCK_TOKEN", "token-dev");

    const t = convexTest(schema, modules);
    const { approvalId } = await montarCenario(t, { optOut: true });

    const r = await t.action(internal.communicationsOutbox.executarAprovacao, { approvalId });
    expect(r.enviado).toBe(false);
    expect(r.motivo).toContain("não ser mais contatado");
    await nadaSaiu(t);
  });

  it("canal não configurado barra a saída", async () => {
    vi.stubEnv("ALTAR_CENTRAL_ENVIO_HABILITADO", "true");
    const t = convexTest(schema, modules);
    const { approvalId } = await montarCenario(t);

    const r = await t.action(internal.communicationsOutbox.executarAprovacao, { approvalId });
    expect(r.enviado).toBe(false);
    expect(r.motivo).toContain("não configurado");
    await nadaSaiu(t);
  });
});

describe("o bloqueio não é falha", () => {
  it("aprovação bloqueada continua APROVADA, nunca 'falhou' nem 'executada'", async () => {
    // Marcar `falhou` apagaria a diferença entre "o Matheus aprovou e o
    // ambiente está fechado" e "tentamos enviar e a plataforma recusou".
    const t = convexTest(schema, modules);
    const { approvalId } = await montarCenario(t);

    await t.action(internal.communicationsOutbox.executarAprovacao, { approvalId });

    const aprovacao = await t.run(async (ctx) => ctx.db.get(approvalId));
    expect(aprovacao?.status).toBe("aprovada");
    expect(aprovacao?.executadaEm).toBeUndefined();
    expect(aprovacao?.execucaoErro).toContain("ALTAR_CENTRAL_ENVIO_HABILITADO");
  });

  it("a conversa não é marcada como respondida", async () => {
    const t = convexTest(schema, modules);
    const { approvalId, conversationId } = await montarCenario(t);

    await t.action(internal.communicationsOutbox.executarAprovacao, { approvalId });

    const conversa = await t.run(async (ctx) => ctx.db.get(conversationId));
    expect(conversa?.ultimaMensagemDirecao).toBe("entrada");
    expect(conversa?.status).not.toBe("aguardando_cliente");
  });
});

describe("expiração da fila", () => {
  it("proposta pendente além da janela vira 'expirada'", async () => {
    const t = convexTest(schema, modules);
    const agora = Date.now();

    await t.run(async (ctx) => {
      const contactId = await ctx.db.insert("adminContacts", {
        vertical: "altar_decor",
        displayName: "Antiga",
        criadoEm: agora - 100 * 3_600_000,
        atualizadoEm: agora - 100 * 3_600_000,
      });
      await ctx.db.insert("adminApprovals", {
        vertical: "altar_decor",
        contactId,
        proposta: { kind: "mensagem_saida", texto: "oi" },
        status: "pendente",
        geradoPor: "ia",
        criadoEm: agora - 48 * 3_600_000,
      });
    });

    const r = await t.mutation(internal.adminApprovals.expirarPendentes, { agora });
    expect(r.expiradas).toBe(1);

    const [aprovacao] = await t.run(async (ctx) => ctx.db.query("adminApprovals").collect());
    expect(aprovacao.status).toBe("expirada");
  });

  it("proposta recente continua pendente", async () => {
    const t = convexTest(schema, modules);
    const agora = Date.now();
    await montarCenario(t, { statusDaAprovacao: "pendente" });

    const r = await t.mutation(internal.adminApprovals.expirarPendentes, { agora });
    expect(r.expiradas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAVAS ESTRUTURAIS
//
// O componente Better Auth não é registrado sob convex-test, então não há como
// autenticar de verdade e chamar as mutations administrativas. A alternativa
// honesta — a mesma de convex/tenant.isolation.test.ts — é exigir por leitura
// do código que o guarda esteja lá.
// ─────────────────────────────────────────────────────────────────────────────

describe("decisão é sempre humana e autenticada", () => {
  const fonte = readFileSync("convex/adminApprovals.ts", "utf-8");

  function corpoDe(nome: string): string {
    const i = fonte.indexOf(`export const ${nome} =`);
    expect(i).toBeGreaterThan(-1);
    const proximo = fonte.indexOf("\nexport ", i + 1);
    return fonte.slice(i, proximo === -1 ? undefined : proximo);
  }

  it.each(["aprovar", "recusar"])("%s exige administrador", (nome) => {
    expect(corpoDe(nome)).toContain("requireAdmin");
  });

  it("aprovar grava QUEM decidiu", () => {
    expect(corpoDe("aprovar")).toContain("decididoPorUserId: admin._id");
  });

  it("recusar grava QUEM decidiu", () => {
    expect(corpoDe("recusar")).toContain("decididoPorUserId: admin._id");
  });

  it("a IA só cria proposta PENDENTE", () => {
    const corpo = corpoDe("proporPelaTriagem");
    expect(corpo).toContain('status: "pendente"');
    expect(corpo).not.toContain('status: "aprovada"');
    expect(corpo).not.toContain("decididoPorUserId");
  });
});
