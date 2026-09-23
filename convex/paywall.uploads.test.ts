import { describe, expect, it, vi } from "vitest";

// Sessão real, componente Better Auth substituído — ver convex/test.auth.ts.
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
import { readFileSync } from "node:fs";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ═════════════════════════════════════════════════════════════════════════════
// O PAYWALL VALE NO SERVIDOR, NÃO SÓ NA TELA
//
// `SubscriptionGuard` (src/App.tsx) redireciona para /paywall — e isso é tudo
// o que ele pode fazer. As funções do Convex são chamáveis direto do
// navegador, então quem estiver bloqueado e abrir o console continua podendo
// chamar o que o servidor não proteger.
//
// `lib/accessGuard.ts` SEMPRE disse que a guarda valia para "criar evento
// novo, enviar arquivos e todas as ações de IA". Os arquivos não estavam
// cobertos: uma conta com trial vencido subia quantos arquivos quisesse, e
// storage é cobrado por byte guardado.
//
// ── O QUE ESTES TESTES TRAVAM ───────────────────────────────────────────────
// Os dois lados. Bloqueado não sobe arquivo; e quem está em dia continua
// subindo — uma guarda que barra cliente pagante é pior do que a falha.
// ═════════════════════════════════════════════════════════════════════════════

const AGORA = Date.now();
const DIA = 24 * 60 * 60 * 1000;

type Estado = "ativa" | "trial_vencido" | "cancelada" | "inadimplente_fora_da_tolerancia";

async function contaCom(t: ReturnType<typeof convexTest>, estado: Estado) {
  const subject = `auth|${estado}`;

  await t.run(async (ctx) => {
    const comum = {
      name: "Decoradora",
      email: `${estado}@example.com`,
      role: "user",
      betterAuthId: subject,
    };

    if (estado === "ativa") {
      return ctx.db.insert("users", { ...comum, subscriptionStatus: "active" });
    }
    if (estado === "trial_vencido") {
      return ctx.db.insert("users", {
        ...comum,
        subscriptionStatus: "trial",
        trialStartDate: new Date(AGORA - 30 * DIA).toISOString(),
        trialEndDate: new Date(AGORA - 2 * DIA).toISOString(),
      });
    }
    if (estado === "cancelada") {
      return ctx.db.insert("users", { ...comum, subscriptionStatus: "cancelled" });
    }
    return ctx.db.insert("users", {
      ...comum,
      subscriptionStatus: "overdue",
      // Primeiro aviso de atraso há 30 dias: a tolerância de 7 dias acabou.
      overdueSince: AGORA - 30 * DIA,
    });
  });

  return t.withIdentity({ subject, tokenIdentifier: subject, email: `${estado}@example.com` });
}

/** Todo caminho que entrega uma URL de upload ao navegador. */
const UPLOADS = [
  ["galeria de fotos", api.gallery.generateUploadUrl],
  ["documentos do evento", api.contracts.generateUploadUrl],
  ["documentos do lead", api.leadDocuments.generateUploadUrl],
  ["itens de montagem", api.assemblyItems.generateUploadUrl],
  ["logo do fornecedor", api.suppliers.generateUploadUrl],
  ["croqui da planta", api.layoutRenders.generateUploadUrl],
] as const;

const BLOQUEADAS: Estado[] = ["trial_vencido", "cancelada", "inadimplente_fora_da_tolerancia"];

describe("conta bloqueada não consegue subir arquivo", () => {
  for (const estado of BLOQUEADAS) {
    it.each(UPLOADS)(`%s recusa uma conta ${estado}`, async (_nome, fn) => {
      const t = convexTest(schema, modules);
      const conta = await contaCom(t, estado);
      await expect(conta.mutation(fn, {})).rejects.toThrow(/SUBSCRIPTION_REQUIRED|Assine|período de teste|cancelada|atraso/i);
    });
  }

  it("sem sessão nenhuma também não sobe", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.gallery.generateUploadUrl, {})).rejects.toThrow();
  });
});

describe("quem está em dia continua trabalhando", () => {
  it.each(UPLOADS)("%s libera a conta ativa", async (_nome, fn) => {
    const t = convexTest(schema, modules);
    const conta = await contaCom(t, "ativa");
    await expect(conta.mutation(fn, {})).resolves.toBeTruthy();
  });

  it("trial DENTRO do prazo sobe arquivo — trial é uso legítimo", async () => {
    const t = convexTest(schema, modules);
    const subject = "auth|trial-vigente";
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Decoradora",
        email: "trial@example.com",
        role: "user",
        betterAuthId: subject,
        subscriptionStatus: "trial",
        trialStartDate: new Date(AGORA - 2 * DIA).toISOString(),
        trialEndDate: new Date(AGORA + 12 * DIA).toISOString(),
      });
    });
    const conta = t.withIdentity({ subject, tokenIdentifier: subject });
    await expect(conta.mutation(api.gallery.generateUploadUrl, {})).resolves.toBeTruthy();
  });
});

describe("o caminho de volta nunca é trancado", () => {
  // Quem está no paywall precisa completar CPF/CNPJ e a identidade da empresa
  // para conseguir PAGAR. Trancar a logo prenderia a cliente do lado de fora.
  it.each(BLOQUEADAS)("conta %s ainda envia a logo da empresa", async (estado) => {
    const t = convexTest(schema, modules);
    const conta = await contaCom(t, estado);
    await expect(conta.mutation(api.users.generateLogoUploadUrl, {})).resolves.toBeTruthy();
  });

  it.each(BLOQUEADAS)("conta %s ainda lê e edita os próprios dados", async (estado) => {
    const t = convexTest(schema, modules);
    const conta = await contaCom(t, estado);

    // Trancar o acesso aos próprios dados seria hostil, atrapalharia exportar
    // um evento já pago e criaria problema de LGPD.
    await expect(conta.query(api.events.list, {})).resolves.toBeDefined();
    await expect(
      conta.mutation(api.users.updateProfile, { name: "Nome novo" }),
    ).resolves.toBeDefined();
  });
});

describe("a guarda e a documentação dela não divergem", () => {
  // O defeito nasceu exatamente assim: o comentário dizia que arquivos estavam
  // cobertos, o código não cobria, e ninguém confere comentário.
  const guard = readFileSync("convex/lib/accessGuard.ts", "utf-8");

  it("o guard continua prometendo cobrir os uploads", () => {
    expect(guard).toMatch(/enviar arquivos/);
  });

  it.each([
    "gallery",
    "contracts",
    "leadDocuments",
    "assemblyItems",
    "suppliers",
    "layoutRenders",
  ])("%s.generateUploadUrl exige acesso ativo no código", (modulo) => {
    const fonte = readFileSync(`convex/${modulo}.ts`, "utf-8");
    const bloco = fonte.slice(fonte.indexOf("export const generateUploadUrl"));
    const corpo = bloco.slice(0, bloco.indexOf("});"));
    expect(corpo).toContain("requireActiveAccess");
  });

  it("users.generateLogoUploadUrl permanece FORA da guarda, de propósito", () => {
    const fonte = readFileSync("convex/users.ts", "utf-8");
    const bloco = fonte.slice(fonte.indexOf("export const generateLogoUploadUrl"));
    const corpo = bloco.slice(0, bloco.indexOf("});"));
    expect(corpo).not.toContain("requireActiveAccess");
    expect(guard).toMatch(/NUNCA aplicar a[\s\S]*generateLogoUploadUrl/);
  });
});

describe("o arquivo continua sendo do dono", () => {
  it("uma conta não salva foto no evento de outra", async () => {
    const t = convexTest(schema, modules);
    const dona = await contaCom(t, "ativa");

    const outra = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Outra",
        email: "outra@example.com",
        role: "user",
        subscriptionStatus: "active",
        betterAuthId: "auth|outra",
      });
      return ctx.db.insert("events", {
        userId,
        name: "Casamento da outra",
        type: "wedding",
        date: "2026-12-01",
        location: "Local",
        clientName: "Cliente",
        status: "planning",
      });
    });

    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["x"])));

    await expect(
      dona.mutation(api.gallery.savePhoto, {
        eventId: outra as Id<"events">,
        storageId,
        filename: "foto.jpg",
        category: "evento",
      }),
    ).rejects.toThrow(/não encontrado|NOT_FOUND/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O OUTRO LADO DA MESMA REGRA: BLOQUEADA AINDA LÊ O QUE É DELA
//
// `accessGuard.ts` sempre disse que a guarda NÃO se aplica a leituras nem à
// edição do que a conta já tem — "trancar o acesso aos próprios dados seria
// hostil, atrapalharia a exportação em PDF de um evento já pago e criaria
// problema de LGPD".
//
// A tela fazia o contrário: mandava todas as rotas para o paywall. O
// redirecionamento saiu; estes testes impedem que a guarda venha a ocupar o
// lugar dele, cobrindo as leituras uma a uma até ninguém perceber.
//
// A promessa é concreta: uma decoradora com trial vencido abre o evento que
// cadastrou, lê o orçamento, confere a ficha técnica e gera o PDF que já era
// dela. O que ela NÃO faz é criar coisa nova — e isso os testes acima travam.
// ═════════════════════════════════════════════════════════════════════════════

describe("conta bloqueada continua enxergando os próprios dados", () => {
  /** Uma conta bloqueada com um evento já cadastrado, como no mundo real. */
  async function contaBloqueadaComEvento(t: ReturnType<typeof convexTest>, estado: Estado) {
    const sessao = await contaCom(t, estado);
    const eventId = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect()).find(
        (u) => u.email === `${estado}@example.com`,
      )!;
      const eventId = await ctx.db.insert("events", {
        userId: user._id,
        name: "Casamento já pago",
        type: "wedding",
        date: "2026-12-01",
        location: "Fazenda",
        clientName: "Cliente",
        status: "confirmed",
      });
      await ctx.db.insert("transactions", {
        userId: user._id,
        eventId,
        type: "income",
        category: "Sinal",
        description: "Sinal do contrato",
        amount: 10_000,
        date: "2026-06-01",
        isPaid: true,
      });
      return eventId;
    });
    return { sessao, eventId };
  }

  it.each(BLOQUEADAS)("%s ainda lista os eventos que cadastrou", async (estado) => {
    const t = convexTest(schema, modules);
    const { sessao } = await contaBloqueadaComEvento(t, estado);

    const eventos = await sessao.query(api.events.list, {});
    expect(eventos).toHaveLength(1);
    expect(eventos[0].name).toBe("Casamento já pago");
  });

  it.each(BLOQUEADAS)("%s ainda abre o evento pelo id", async (estado) => {
    const t = convexTest(schema, modules);
    const { sessao, eventId } = await contaBloqueadaComEvento(t, estado);

    const evento = await sessao.query(api.events.get, { id: eventId });
    expect(evento?.name).toBe("Casamento já pago");
  });

  it.each(BLOQUEADAS)("%s ainda lê o próprio financeiro", async (estado) => {
    // É o dado de que ela precisa para fechar o mês e para o contador — e é
    // exatamente o que o redirecionamento tirava dela.
    const t = convexTest(schema, modules);
    const { sessao } = await contaBloqueadaComEvento(t, estado);

    const lancamentos = await sessao.query(api.financeiro.listTransactions, {});
    expect(lancamentos.itens.length).toBeGreaterThan(0);
  });

  it("mas continua SEM criar evento novo — o bloqueio é o que custa", async () => {
    const t = convexTest(schema, modules);
    const { sessao } = await contaBloqueadaComEvento(t, "trial_vencido");

    // A asserção precisa ser ESPECÍFICA: `rejects.toThrow()` sozinho passaria
    // com um erro de validação de argumento, que não prova paywall nenhum.
    // Foi o que aconteceu na primeira versão deste teste — faltava `status`, e
    // ele passou verde pelo motivo errado até o TypeScript apontar.
    await expect(
      sessao.mutation(api.events.create, {
        name: "Evento novo",
        type: "wedding",
        status: "planning",
        date: "2027-01-01",
        location: "X",
        clientName: "Y",
      }),
    ).rejects.toThrow(/assin|teste terminou|atraso/i);
  });

  it("uma conta bloqueada não enxerga o evento de OUTRA conta", async () => {
    // Abrir a navegação não pode afrouxar o isolamento: continua valendo que
    // id vindo do navegador não é prova de posse.
    const t = convexTest(schema, modules);
    const { eventId } = await contaBloqueadaComEvento(t, "trial_vencido");
    const invasora = await contaCom(t, "cancelada");

    const roubado = await invasora.query(api.events.get, { id: eventId });
    expect(roubado).toBeNull();
    expect(await invasora.query(api.events.list, {})).toEqual([]);
  });
});

describe("as leituras não podem ganhar a guarda por descuido", () => {
  it("nenhuma query de leitura de evento exige acesso ativo", () => {
    // Trava por leitura de código. Acrescentar `requireActiveAccess` a uma
    // query devolveria o aplicativo ao estado anterior — sem redirecionamento,
    // mas com tela de erro, que é pior.
    const eventos = readFileSync("convex/events.ts", "utf-8");
    for (const nome of ["export const list", "export const get"]) {
      const inicio = eventos.indexOf(nome);
      expect(inicio, nome).toBeGreaterThan(-1);
      const bloco = eventos.slice(inicio, eventos.indexOf("\n});", inicio));
      expect(bloco, `${nome} passou a exigir assinatura`).not.toContain("requireActiveAccess");
    }
  });
});
