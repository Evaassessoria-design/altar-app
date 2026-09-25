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
import {
  ESTAGIOS,
  LIVE_ALTAR,
  estagioDe,
  funilDaCampanha,
  origemDe,
} from "./lib/campanha";

// ═════════════════════════════════════════════════════════════════════════════
// A CAMPANHA DA LIVE — E A FRONTEIRA QUE ELA NÃO PODE CRUZAR
//
// Leads da live são DECORADORAS interessadas no ALTAR. Vivem em
// `landingLeads`, atrás de `requireAdmin`, ao lado dos outros dados da
// operação do SaaS.
//
// `leads` é outra coisa inteiramente: são as clientes DA DECORADORA — noivas,
// aniversariantes —, isoladas por `userId`. Guardar o lead da live ali
// pareceria prático e faria a decoradora piloto abrir o funil dela e encontrar
// concorrentes no meio das noivas. É a regra 4 do README.
// ═════════════════════════════════════════════════════════════════════════════

const CAMPANHA = readFileSync("convex/lib/campanha.ts", "utf-8");

async function cenario() {
  const t = convexTest(schema, modules);
  const admin = await autenticarComoAdmin(t);
  const decoradora = await autenticarComoDecoradora(t);

  const interessado = (over: Record<string, unknown> = {}) =>
    t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("landingLeads", {
        name: "Decoradora Fulana",
        email: `f${Math.random()}@ex.com`,
        intent: "demo" as const,
        ...over,
      }),
    );

  return { t, admin, decoradora, interessado };
}

describe("o funil da campanha responde as sete perguntas", () => {
  it("conta por etapa, e quem avançou continua contando nas anteriores", async () => {
    // Contar só quem PAROU em "confirmou" faria o número encolher durante a
    // própria live, conforme as pessoas avançassem. Um indicador que cai
    // quando a campanha dá certo não serve para decidir nada.
    const { admin, interessado } = await cenario();
    for (const status of [
      "novo",
      "contatado",
      "interessado",
      "confirmou",
      "participou",
      "testando",
      "convertido",
      "descartado",
    ] as const) {
      await interessado({ campanha: LIVE_ALTAR.slug, status });
    }

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(8);
    expect(f.semContato, "só o novo está sem contato").toBe(1);
    expect(f.interessados, "interessado em diante, sem o descartado").toBe(5);
    expect(f.confirmados).toBe(4);
    expect(f.participaram).toBe(3);
    expect(f.testando).toBe(2);
    expect(f.clientes).toBe(1);
    expect(f.descartados).toBe(1);
  });

  it("quem disse NÃO fica fora de todos os acumulados", async () => {
    // Descartado não está atrás no funil: está fora dele.
    const { admin, interessado } = await cenario();
    await interessado({ campanha: LIVE_ALTAR.slug, status: "descartado" });
    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(1);
    expect(f.interessados).toBe(0);
    expect(f.semContato).toBe(0);
    expect(f.descartados).toBe(1);
  });

  it("só conta quem é DESTA campanha", async () => {
    const { admin, interessado } = await cenario();
    await interessado({ campanha: LIVE_ALTAR.slug, status: "confirmou" });
    await interessado({ status: "confirmou" });
    await interessado({ campanha: "outra-campanha", status: "confirmou" });

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(1);
  });

  it("campanha vazia devolve zeros — não devolve nada inventado", async () => {
    const { admin } = await cenario();
    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(0);
    expect(f.clientes).toBe(0);
    expect(f.campanha?.nome).toBe("Live ALTAR");
    expect(f.completa).toBe(true);
  });

  it("campanha que não existe não quebra, e diz que não conhece", async () => {
    const { admin } = await cenario();
    const f = await admin.query(api.admin.funilDaCampanha, { campanha: "inexistente" });
    expect(f.campanha).toBeNull();
    expect(f.total).toBe(0);
  });
});

describe("a listagem tem teto e diz quando parou", () => {
  it("devolve `temMais` em vez de afirmar um total que não contou", async () => {
    // `collect()` sem limite responde bem com trinta e para em silêncio com
    // três mil — e uma campanha existe para produzir três mil.
    const { admin, interessado } = await cenario();
    for (let i = 0; i < 205; i++) await interessado({ campanha: LIVE_ALTAR.slug });

    const r = await admin.query(api.admin.listLandingLeads, { campanha: LIVE_ALTAR.slug });
    expect(r.leads).toHaveLength(200);
    expect(r.temMais).toBe(true);
  });

  it("e não mente quando coube tudo", async () => {
    const { admin, interessado } = await cenario();
    await interessado({ campanha: LIVE_ALTAR.slug });
    const r = await admin.query(api.admin.listLandingLeads, { campanha: LIVE_ALTAR.slug });
    expect(r.temMais).toBe(false);
  });

  it("filtra por campanha no BANCO, não na página já carregada", async () => {
    const { admin, interessado } = await cenario();
    await interessado({ campanha: LIVE_ALTAR.slug, name: "Da live" });
    await interessado({ name: "Da landing" });

    const daLive = await admin.query(api.admin.listLandingLeads, { campanha: LIVE_ALTAR.slug });
    expect(daLive.leads.map((l) => l.name)).toEqual(["Da live"]);

    const todos = await admin.query(api.admin.listLandingLeads, {});
    expect(todos.leads).toHaveLength(2);
  });
});

describe("compatibilidade com o que já está gravado", () => {
  it("registro sem status é `novo`, e sem origem é `landing`", async () => {
    // Nenhum backfill: os interessados que já chegaram pela landing continuam
    // válidos exatamente como estão.
    const { admin, interessado } = await cenario();
    await interessado({});
    const r = await admin.query(api.admin.listLandingLeads, {});
    expect(r.leads[0].status).toBe("novo");
    expect(r.leads[0].origem).toBe("landing");
  });

  it("os quatro estágios originais continuam existindo com o mesmo nome", () => {
    // Alargar a união é aditivo. Renomear qualquer um deles invalidaria
    // registros gravados.
    for (const antigo of ["novo", "contatado", "convertido", "descartado"]) {
      expect(ESTAGIOS.some((e) => e.id === antigo), `sumiu o estágio ${antigo}`).toBe(true);
    }
  });
});

describe("mover de etapa e preencher são decisões DIFERENTES", () => {
  it("salvar o cadastro não move ninguém de etapa", async () => {
    // Um formulário que salva e avança junto faria toda correção de telefone
    // parecer progresso no funil.
    const { t, admin, interessado } = await cenario();
    const id = await interessado({ status: "contatado" });
    await admin.mutation(api.admin.atualizarInteressado, {
      leadId: id, empresa: "Estúdio Alba", cidade: "São Paulo",
    });
    const linha = await t.run((ctx: MutationCtx) => ctx.db.get(id));
    expect(linha!.status).toBe("contatado");
    expect(linha!.empresa).toBe("Estúdio Alba");
  });

  it("mover de etapa carimba a última interação", async () => {
    const { t, admin, interessado } = await cenario();
    const id = await interessado({});
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId: id, status: "contatado" });
    const linha = await t.run((ctx: MutationCtx) => ctx.db.get(id));
    expect(linha!.ultimaInteracao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("`null` LIMPA o campo — corrigir um engano é possível", async () => {
    const { t, admin, interessado } = await cenario();
    const id = await interessado({ empresa: "Errado" });
    await admin.mutation(api.admin.atualizarInteressado, { leadId: id, empresa: null });
    expect((await t.run((ctx: MutationCtx) => ctx.db.get(id)))!.empresa).toBeUndefined();
  });

  it("número ilegível em eventos por ano é RECUSADO", async () => {
    const { admin, interessado } = await cenario();
    const id = await interessado({});
    await expect(
      admin.mutation(api.admin.atualizarInteressado, { leadId: id, eventosPorAno: Number.NaN }),
    ).rejects.toThrow(/número/i);
  });
});

describe("nada disto é da decoradora", () => {
  it("decoradora NÃO lê os interessados no ALTAR", async () => {
    // São concorrentes dela. O painel é da operação do SaaS.
    const { decoradora, interessado } = await cenario();
    await interessado({ campanha: LIVE_ALTAR.slug });
    for (const chamada of [
      () => decoradora.query(api.admin.listLandingLeads, {}),
      () => decoradora.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug }),
    ]) {
      await expect(chamada()).rejects.toThrow();
    }
  });

  it("nem move etapa, nem preenche cadastro", async () => {
    const { t, decoradora, interessado } = await cenario();
    const id = await interessado({});
    await expect(
      decoradora.mutation(api.admin.setLandingLeadStatus, { leadId: id, status: "convertido" }),
    ).rejects.toThrow();
    await expect(
      decoradora.mutation(api.admin.atualizarInteressado, { leadId: id, empresa: "X" }),
    ).rejects.toThrow();
    const linha = await t.run((ctx: MutationCtx) => ctx.db.get(id));
    expect(linha!.status).toBeUndefined();
    expect(linha!.empresa).toBeUndefined();
  });

  it("sem sessão nenhuma também não", async () => {
    const { t, interessado } = await cenario();
    await interessado({});
    await expect(t.query(api.admin.listLandingLeads, {})).rejects.toThrow();
  });

  it("a campanha NÃO encosta na tabela `leads` da decoradora", () => {
    // Trava de leitura de fonte: o módulo da campanha fala de `landingLeads`,
    // e citar `leads` aqui seria o primeiro passo para os dois públicos se
    // misturarem. É a mesma trava que `central.fronteiras.test.ts` mantém.
    const codigo = CAMPANHA.split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(codigo).not.toMatch(/ctx\.db|"leads"|convertedEventId/);
  });
});

describe("as regras puras, sem banco", () => {
  it("estágio desconhecido degrada para `novo` em vez de quebrar", () => {
    expect(estagioDe({ status: "inventado" })).toBe("novo");
    expect(estagioDe({})).toBe("novo");
  });

  it("origem desconhecida degrada para `landing`", () => {
    expect(origemDe({ origem: "tiktok" })).toBe("landing");
    expect(origemDe({})).toBe("landing");
  });

  it("o funil de uma lista vazia é todo zero, nunca `NaN`", () => {
    const f = funilDaCampanha([]);
    expect(f.total).toBe(0);
    for (const e of f.porEstagio) expect(e.quantidade).toBe(0);
  });

  it("a live tem data e hora declaradas, não inventadas na tela", () => {
    expect(LIVE_ALTAR.data).toBe("2026-10-06");
    expect(LIVE_ALTAR.hora).toBe("19:00");
  });
});

describe("a inscrição pela landing pode chegar marcada", () => {
  it("slug conhecido marca a campanha e a origem", async () => {
    const { t, admin } = await cenario();
    await t.mutation(api.landingLeads.submit, {
      name: "Decoradora da live",
      email: "live@ex.com",
      intent: "demo",
      campanha: LIVE_ALTAR.slug,
    });
    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(1);
  });

  it("slug INVENTADO é descartado — e o cadastro entra assim mesmo", async () => {
    // A mutation é pública. Aceitar o texto como veio deixaria alguém gravar
    // mil registros com uma campanha inventada, e as contagens somariam lixo.
    // Mas recusar a inscrição por causa de um parâmetro errado na URL seria
    // perder a decoradora — trocar o essencial pelo acessório.
    const { t, admin } = await cenario();
    await t.mutation(api.landingLeads.submit, {
      name: "Decoradora",
      email: "x@ex.com",
      intent: "demo",
      campanha: "campanha-que-nao-existe",
    });
    const todos = await admin.query(api.admin.listLandingLeads, {});
    expect(todos.leads).toHaveLength(1);
    expect(todos.leads[0].campanha).toBeUndefined();
  });

  it("voltar pela landing sem campanha NÃO apaga a marcação de antes", async () => {
    // Apagar faria a contagem da campanha encolher sozinha, depois da live.
    const { t, admin } = await cenario();
    await t.mutation(api.landingLeads.submit, {
      name: "Marina", email: "m@ex.com", intent: "demo", campanha: LIVE_ALTAR.slug,
    });
    await t.mutation(api.landingLeads.submit, {
      name: "Marina", email: "m@ex.com", intent: "beta",
    });
    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total, "a segunda inscrição apagou a campanha").toBe(1);
  });
});
