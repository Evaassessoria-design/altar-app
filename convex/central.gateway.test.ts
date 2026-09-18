import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// PORTA DE ENTRADA DA CENTRAL
//
// O que está sendo travado aqui:
//   · sem configuração, a porta fica FECHADA (503) — nunca aberta
//   · sem autenticação válida, 401 — e nada é gravado
//   · a mesma mensagem duas vezes NÃO vira duas conversas
//   · telefone conhecido vincula; telefone AMBÍGUO não vincula
//
// O modo `mock` usa o MESMO formato de payload da Meta Cloud API. É o que
// permite validar o fluxo inteiro sem token real, sem Phone ID e sem uma única
// chamada externa — e é o que faz a troca para produção ser só credencial.
// ─────────────────────────────────────────────────────────────────────────────

const ROTA = "/channels/whatsapp/webhook";
const TOKEN_MOCK = "token-de-desenvolvimento";

function payload(over: Record<string, unknown> = {}, from = "5511999998888") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "conta",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "PHONE_ID_FAKE" },
              contacts: [{ wa_id: from, profile: { name: "Helena" } }],
              messages: [
                {
                  from,
                  id: "wamid.MSG1",
                  timestamp: "1789000000",
                  type: "text",
                  text: { body: "Oi! Queria conhecer o ALTAR" },
                  ...over,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function enviar(t: ReturnType<typeof convexTest>, corpo: unknown, token = TOKEN_MOCK) {
  return t.fetch(ROTA, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Altar-Mock-Token": token },
    body: JSON.stringify(corpo),
  });
}

/** Liga o modo de simulação. Nenhum segredo real é usado em teste. */
function ligarMock() {
  vi.stubEnv("ALTAR_WHATSAPP_PROVIDER", "mock");
  vi.stubEnv("ALTAR_CENTRAL_MOCK_TOKEN", TOKEN_MOCK);
  vi.stubEnv("ALTAR_VERTICAL", "altar_decor");
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("a porta nasce fechada", () => {
  it("sem canal configurado responde 503 e não grava nada", async () => {
    const t = convexTest(schema, modules);
    const r = await enviar(t, payload());
    expect(r.status).toBe(503);

    const eventos = await t.run(async (ctx) => ctx.db.query("integrationEvents").collect());
    expect(eventos).toHaveLength(0);
  });

  it("canal desconhecido responde 404", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    const r = await t.fetch("/channels/pombo/webhook", { method: "POST", body: "{}" });
    expect(r.status).toBe(404);
  });
});

describe("autenticação", () => {
  it("token de simulação errado responde 401", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    const r = await enviar(t, payload(), "token-errado");
    expect(r.status).toBe(401);
  });

  it("POST sem token nenhum responde 401", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    const r = await t.fetch(ROTA, { method: "POST", body: JSON.stringify(payload()) });
    expect(r.status).toBe(401);
  });

  it("requisição NÃO autenticada não deixa rastro na auditoria", async () => {
    // Gravar evento de quem não se autenticou deixaria a trilha de auditoria
    // à mercê de qualquer um que conheça a URL.
    ligarMock();
    const t = convexTest(schema, modules);
    await enviar(t, payload(), "token-errado");

    const eventos = await t.run(async (ctx) => ctx.db.query("integrationEvents").collect());
    expect(eventos).toHaveLength(0);
  });
});

describe("recebimento", () => {
  it("mensagem nova vira contato, identidade, conversa e mensagem", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    const r = await enviar(t, payload());
    expect(r.status).toBe(200);

    const estado = await t.run(async (ctx) => ({
      contatos: await ctx.db.query("adminContacts").collect(),
      identidades: await ctx.db.query("communicationIdentities").collect(),
      conversas: await ctx.db.query("communicationConversations").collect(),
      mensagens: await ctx.db.query("communicationMessages").collect(),
      eventos: await ctx.db.query("integrationEvents").collect(),
    }));

    expect(estado.contatos).toHaveLength(1);
    expect(estado.contatos[0].displayName).toBe("Helena");
    expect(estado.contatos[0].tipo).toBe("desconhecido");
    expect(estado.contatos[0].vertical).toBe("altar_decor");

    expect(estado.identidades).toHaveLength(1);
    expect(estado.identidades[0].channel).toBe("whatsapp");
    expect(estado.identidades[0].externalId).toBe("+5511999998888");

    expect(estado.conversas).toHaveLength(1);
    expect(estado.conversas[0].status).toBe("aberta");
    expect(estado.conversas[0].naoLidas).toBe(1);
    expect(estado.conversas[0].ultimaMensagemDirecao).toBe("entrada");
    // Ainda NÃO triada: ausente significa "triagem", nada é presumido.
    expect(estado.conversas[0].departamento).toBeUndefined();
    expect(estado.conversas[0].categoria).toBeUndefined();

    expect(estado.mensagens).toHaveLength(1);
    expect(estado.mensagens[0].direcao).toBe("entrada");
    expect(estado.mensagens[0].autor).toBe("cliente");
    expect(estado.mensagens[0].texto).toBe("Oi! Queria conhecer o ALTAR");

    expect(estado.eventos).toHaveLength(1);
    expect(estado.eventos[0].outcome).toBe("applied");
    expect(estado.eventos[0].dedupKey).toBe("whatsapp:wamid.MSG1");
  });

  it("a janela de resposta do canal é gravada a partir da mensagem", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    await enviar(t, payload());

    const [conversa] = await t.run(async (ctx) =>
      ctx.db.query("communicationConversations").collect(),
    );
    // 1789000000s × 1000 + 24h
    expect(conversa.janelaRespostaAte).toBe(1_789_000_000_000 + 86_400_000);
  });

  it("MESMA mensagem duas vezes não vira duas conversas", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    await enviar(t, payload());
    const segunda = await enviar(t, payload());

    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toMatchObject({ duplicadas: 1 });

    const estado = await t.run(async (ctx) => ({
      conversas: await ctx.db.query("communicationConversations").collect(),
      mensagens: await ctx.db.query("communicationMessages").collect(),
      eventos: await ctx.db.query("integrationEvents").collect(),
    }));

    expect(estado.conversas).toHaveLength(1);
    expect(estado.mensagens).toHaveLength(1);
    // A repetição É registrada — é o que permite auditar reentrega depois.
    expect(estado.eventos.filter((e) => e.outcome === "duplicate")).toHaveLength(1);
  });

  it("segunda mensagem do mesmo contato entra na MESMA conversa", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    await enviar(t, payload());
    await enviar(t, payload({ id: "wamid.MSG2", text: { body: "Ainda está aí?" } }));

    const estado = await t.run(async (ctx) => ({
      conversas: await ctx.db.query("communicationConversations").collect(),
      mensagens: await ctx.db.query("communicationMessages").collect(),
    }));

    expect(estado.conversas).toHaveLength(1);
    expect(estado.conversas[0].naoLidas).toBe(2);
    expect(estado.mensagens).toHaveLength(2);
  });

  it("payload sem mensagem responde 200 e registra ignored", async () => {
    // A Meta reenvia qualquer webhook que não receba 200. Um status de entrega
    // não é mensagem, mas também não pode virar fila de reentrega infinita.
    ligarMock();
    const t = convexTest(schema, modules);
    const r = await enviar(t, {
      entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "delivered" }] } }] }],
    });

    expect(r.status).toBe(200);
    const eventos = await t.run(async (ctx) => ctx.db.query("integrationEvents").collect());
    expect(eventos[0].outcome).toBe("ignored");
  });

  it("corpo que não é JSON responde 200 e registra error", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    const r = await t.fetch(ROTA, {
      method: "POST",
      headers: { "X-Altar-Mock-Token": TOKEN_MOCK },
      body: "isto não é json",
    });

    expect(r.status).toBe(200);
    const eventos = await t.run(async (ctx) => ctx.db.query("integrationEvents").collect());
    expect(eventos[0].outcome).toBe("error");
  });
});

describe("vínculo com a operação do SaaS", () => {
  it("telefone de interessado da landing vincula automaticamente", async () => {
    ligarMock();
    const t = convexTest(schema, modules);

    await t.mutation(api.landingLeads.submit, {
      name: "Helena Decorações",
      email: "helena@exemplo.com.br",
      whatsapp: "(11) 99999-8888",
      intent: "demo",
    });

    await enviar(t, payload());

    const [contato] = await t.run(async (ctx) => ctx.db.query("adminContacts").collect());
    expect(contato.tipo).toBe("interessado");
    expect(contato.landingLeadId).toBeDefined();
    expect(contato.vinculoOrigem).toBe("automatico");
    expect(contato.displayName).toBe("Helena Decorações");
  });

  it("o nono dígito não impede o casamento", async () => {
    ligarMock();
    const t = convexTest(schema, modules);

    // Cadastro antigo, com oito dígitos.
    await t.mutation(api.landingLeads.submit, {
      name: "Cadastro Antigo",
      email: "antigo@exemplo.com.br",
      whatsapp: "(11) 9999-8888",
      intent: "beta",
    });

    // WhatsApp entrega com nove.
    await enviar(t, payload());

    const [contato] = await t.run(async (ctx) => ctx.db.query("adminContacts").collect());
    expect(contato.landingLeadId).toBeDefined();
  });

  it("telefone AMBÍGUO não vira vínculo — a decisão sobe para um humano", async () => {
    ligarMock();
    const t = convexTest(schema, modules);

    // Duas pessoas com o mesmo número: acontece (casal, sócios, número da
    // empresa). Escolher uma delas mostraria a conversa na ficha errada.
    await t.run(async (ctx) => {
      await ctx.db.insert("landingLeads", {
        name: "Pessoa A",
        email: "a@exemplo.com.br",
        whatsapp: "(11) 99999-8888",
        whatsappE164: "+5511999998888",
        intent: "demo",
      });
      await ctx.db.insert("landingLeads", {
        name: "Pessoa B",
        email: "b@exemplo.com.br",
        whatsapp: "(11) 99999-8888",
        whatsappE164: "+5511999998888",
        intent: "demo",
      });
    });

    await enviar(t, payload());

    const [contato] = await t.run(async (ctx) => ctx.db.query("adminContacts").collect());
    expect(contato.landingLeadId).toBeUndefined();
    expect(contato.userId).toBeUndefined();
    expect(contato.tipo).toBe("desconhecido");
    expect(contato.vinculoOrigem).toBeUndefined();
  });

  it("número desconhecido cria contato sem vínculo, e a mensagem não se perde", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    await enviar(t, payload({}, "5521988887777"));

    const estado = await t.run(async (ctx) => ({
      contatos: await ctx.db.query("adminContacts").collect(),
      mensagens: await ctx.db.query("communicationMessages").collect(),
    }));

    expect(estado.contatos[0].tipo).toBe("desconhecido");
    expect(estado.contatos[0].landingLeadId).toBeUndefined();
    expect(estado.mensagens).toHaveLength(1);
  });
});

describe("handshake da plataforma", () => {
  it("sem token de verificação configurado, recusa", async () => {
    ligarMock();
    const t = convexTest(schema, modules);
    const r = await t.fetch(
      `${ROTA}?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123`,
      { method: "GET" },
    );
    expect(r.status).toBe(403);
  });

  it("com o token certo, devolve o desafio", async () => {
    ligarMock();
    vi.stubEnv("ALTAR_WHATSAPP_VERIFY_TOKEN", "verificador");
    const t = convexTest(schema, modules);
    const r = await t.fetch(
      `${ROTA}?hub.mode=subscribe&hub.verify_token=verificador&hub.challenge=123`,
      { method: "GET" },
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("123");
  });

  it("com o token errado, recusa", async () => {
    ligarMock();
    vi.stubEnv("ALTAR_WHATSAPP_VERIFY_TOKEN", "verificador");
    const t = convexTest(schema, modules);
    const r = await t.fetch(
      `${ROTA}?hub.mode=subscribe&hub.verify_token=invasor&hub.challenge=123`,
      { method: "GET" },
    );
    expect(r.status).toBe(403);
  });
});
