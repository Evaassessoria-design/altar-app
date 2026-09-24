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
import { api, internal } from "./_generated/api";
import { autenticarComo } from "./test.auth";

// ═════════════════════════════════════════════════════════════════════════════
// AS DUAS FRONTEIRAS, ATACADAS DE PROPÓSITO
//
// O produto tem duas linhas que não podem se cruzar, e elas são independentes:
//
//   1ª  a decoradora só enxerga a EMPRESA DELA      (guardas de tenant)
//   2ª  só o dono da plataforma enxerga O NEGÓCIO   (requirePlatformOwner)
//
// A tentação é derivar uma da outra — "é admin, então vê tudo", "é interno,
// então é da casa". Este arquivo existe para que essa tentação quebre um
// teste. Cada caso abaixo é alguém que quase tem permissão: a admin do
// suporte, a conta interna, a beta, a dona do próprio tenant.
//
// Erro esperado: NOT_FOUND, nunca FORBIDDEN. "Acesso negado" já confirma que
// existe algo ali — é a mesma regra que o resto do produto usa para dado de
// outra conta.
// ═════════════════════════════════════════════════════════════════════════════

type Conta = {
  nome: string;
  email: string;
  role: "admin" | "user";
  accessType?: "client" | "beta" | "internal";
  platformOwner?: boolean;
};

async function cenario(contas: Conta[]) {
  const t = convexTest(schema, modules);
  const sessoes: Record<string, ReturnType<typeof t.withIdentity>> = {};

  for (const conta of contas) {
    const subject = `auth|${conta.email}`;
    sessoes[conta.email] = await autenticarComo(t, {
      nome: conta.nome,
      email: conta.email,
      role: conta.role,
      subject,
    });
    // O papel e o tipo de acesso entram por patch porque `autenticarComo` só
    // sabe de login: aqui o que interessa é justamente o estado EXTRA que
    // alguém poderia confundir com posse da plataforma.
    if (conta.accessType || conta.platformOwner) {
      await t.run(async (ctx) => {
        const linha = await ctx.db
          .query("users")
          .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", subject))
          .unique();
        if (!linha) throw new Error("conta não criada");
        await ctx.db.patch(linha._id, {
          accessType: conta.accessType,
          platformOwner: conta.platformOwner,
        });
      });
    }
  }

  return { t, sessoes };
}

const DONO = {
  nome: "Dono", email: "dono@altar.example", role: "admin" as const, platformOwner: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// QUEM NÃO PASSA
// ─────────────────────────────────────────────────────────────────────────────

const QUASE: Conta[] = [
  { nome: "Decoradora", email: "decoradora@ex.com", role: "user" },
  // A mais perigosa da lista: hoje `role: "admin"` abre o Painel e a Central.
  // Se um dia abrir o Escritório por tabela, alguém do suporte passa a ver o
  // faturamento sem que ninguém tenha decidido isso.
  { nome: "Suporte", email: "suporte@altar.example", role: "admin" },
  // Isenção de cobrança não é poder. Uma conta interna é uma decoradora que
  // não paga.
  { nome: "Interna", email: "interna@ex.com", role: "user", accessType: "internal" },
  { nome: "Beta", email: "beta@ex.com", role: "user", accessType: "beta" },
  // Dona da própria empresa dentro do ALTAR ≠ dona do ALTAR.
  { nome: "Dona do tenant", email: "dona@ex.com", role: "user", accessType: "client" },
];

describe("o Escritório interno recusa quem não é dono da plataforma", () => {
  it.each(QUASE.map((c) => [c.nome, c] as const))(
    "%s não lê o panorama do negócio",
    async (_nome, conta) => {
      const { sessoes } = await cenario([conta]);
      await expect(
        sessoes[conta.email].query(api.escritorio.panorama, {}),
      ).rejects.toThrow(/NOT_FOUND|não encontrado/i);
    },
  );

  it.each(QUASE.map((c) => [c.nome, c] as const))(
    "%s se reconhece como não-dona",
    async (_nome, conta) => {
      const { sessoes } = await cenario([conta]);
      expect(await sessoes[conta.email].query(api.escritorio.souDono, {})).toBe(false);
    },
  );

  it("deslogado não lê, e `souDono` responde false em vez de explodir", async () => {
    const { t } = await cenario([]);
    await expect(t.query(api.escritorio.panorama, {})).rejects.toThrow();
    // `souDono` roda em toda navegação; se lançasse, viraria erro de tela para
    // quem só abriu o app sem sessão válida.
    expect(await t.query(api.escritorio.souDono, {})).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QUEM PASSA
// ─────────────────────────────────────────────────────────────────────────────

describe("o dono da plataforma lê o negócio", () => {
  it("recebe números reais, não zeros de fachada", async () => {
    const { t, sessoes } = await cenario([
      DONO,
      { nome: "Pagante", email: "pagante@ex.com", role: "user" },
    ]);

    await t.run(async (ctx) => {
      await ctx.db.insert("landingLeads", {
        name: "Interessada", email: "quer@ex.com", intent: "demo",
      });
      await ctx.db.insert("landingLeads", {
        name: "Outra", email: "outra@ex.com", intent: "beta", status: "convertido",
      });
    });

    const panorama = await sessoes[DONO.email].query(api.escritorio.panorama, {});
    expect(panorama.negocio.total).toBe(2);
    expect(panorama.interessados.total).toBe(2);
    // AUSENTE = "novo": o registro sem status conta como novo, sem backfill.
    expect(panorama.interessados.novo).toBe(1);
    expect(panorama.interessados.convertido).toBe(1);
    // A tela não pode afirmar o que não sabe: com dois usuários lidos de um
    // teto de 5.000, não há mais páginas — e o campo diz isso.
    expect(panorama.leitura.haMaisUsuarios).toBe(false);
  });

  it("`souDono` responde true", async () => {
    const { sessoes } = await cenario([DONO]);
    expect(await sessoes[DONO.email].query(api.escritorio.souDono, {})).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A CONCESSÃO
// ─────────────────────────────────────────────────────────────────────────────

describe("ninguém vira dono da plataforma por inferência", () => {
  it("promover a admin e a conta interna NÃO concede a plataforma", async () => {
    const { t, sessoes } = await cenario([
      { nome: "Candidata", email: "candidata@ex.com", role: "user" },
    ]);

    await t.mutation(internal.admin.grantInternalAccessByEmail, {
      email: "candidata@ex.com",
    });

    const depois = await t.query(internal.admin.inspectAccountByEmail, {
      email: "candidata@ex.com",
    });
    expect(depois?.isAdmin).toBe(true);
    expect(depois?.accessType).toBe("internal");
    // As duas coisas que o produto mais confunde, separadas por um assert.
    expect(depois?.platformOwner).toBe(false);

    await expect(
      sessoes["candidata@ex.com"].query(api.escritorio.panorama, {}),
    ).rejects.toThrow(/NOT_FOUND|não encontrado/i);
  });

  it("a concessão é explícita, por e-mail digitado à mão, e reversível", async () => {
    const { t, sessoes } = await cenario([
      { nome: "Matheus", email: "operador@ex.com", role: "user" },
    ]);
    const sessao = sessoes["operador@ex.com"];

    await expect(sessao.query(api.escritorio.panorama, {})).rejects.toThrow();

    const concedido = await t.mutation(internal.admin.grantPlatformOwnerByEmail, {
      email: "operador@ex.com",
    });
    expect(concedido.platformOwner).toBe(true);
    expect(concedido.donosDaPlataforma).toEqual(["operador@ex.com"]);
    // Conceder a plataforma não promoveu a admin de tabela: são duas chamadas
    // porque são dois conceitos.
    expect(concedido.role).toBe("user");
    await expect(sessao.query(api.escritorio.panorama, {})).resolves.toBeTruthy();

    await t.mutation(internal.admin.grantPlatformOwnerByEmail, {
      email: "operador@ex.com", revoke: true,
    });
    await expect(sessao.query(api.escritorio.panorama, {})).rejects.toThrow();
    // Removido vira ausente, e não `false` gravado: o schema diz que ausente é
    // o padrão, e gravar o padrão é começar a precisar de backfill.
    await t.run(async (ctx) => {
      const linha = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "operador@ex.com"))
        .first();
      expect(linha?.platformOwner).toBeUndefined();
    });
  });

  it("o e-mail que não existe recusa em vez de criar conta", async () => {
    const { t } = await cenario([]);
    await expect(
      t.mutation(internal.admin.grantPlatformOwnerByEmail, { email: "ninguem@ex.com" }),
    ).rejects.toThrow(/NOT_FOUND|Nenhum usuário/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AS DUAS FRONTEIRAS SÃO INDEPENDENTES
// ─────────────────────────────────────────────────────────────────────────────

describe("uma fronteira não abre a outra", () => {
  it("ser dono da plataforma não dá acesso ao dado de nenhuma decoradora", async () => {
    const { t, sessoes } = await cenario([
      DONO,
      { nome: "Aurora", email: "aurora@ex.com", role: "user" },
    ]);

    const eventoDaAurora = await t.run(async (ctx) => {
      const aurora = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "aurora@ex.com"))
        .first();
      if (!aurora) throw new Error("sem Aurora");
      return ctx.db.insert("events", {
        userId: aurora._id,
        name: "Casamento da Aurora",
        type: "wedding",
        date: "2026-11-20",
        location: "Fazenda",
        clientName: "Aurora",
        status: "confirmed",
      });
    });

    // O panorama conta eventos; contar não é ler. Nenhum nome, nenhum id.
    const panorama = await sessoes[DONO.email].query(api.escritorio.panorama, {});
    expect(panorama.negocio.eventsTotal).toBe(1);
    expect(JSON.stringify(panorama)).not.toContain("Casamento da Aurora");
    expect(JSON.stringify(panorama)).not.toContain(eventoDaAurora);

    // E pela porta da decoradora, o dono da plataforma é só mais uma conta:
    // o evento da Aurora "não existe" para ele como para qualquer outra. A
    // leitura responde null em vez de lançar — mesma ideia do NOT_FOUND, sem
    // derrubar uma tela que só abriu um id velho.
    expect(
      await sessoes[DONO.email].query(api.events.get, { id: eventoDaAurora }),
    ).toBeNull();
  });

  it("o Assistente da decoradora não muda de comportamento para o dono", async () => {
    const { sessoes } = await cenario([DONO]);
    // O Assistente é feature de tenant: o dono da plataforma tem o dele, com
    // as tarefas dele, e nada além.
    const minhas = await sessoes[DONO.email].query(api.assistente.listar, {});
    expect(minhas.tarefas).toEqual([]);
  });
});
