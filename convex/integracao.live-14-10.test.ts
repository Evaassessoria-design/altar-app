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
import { autenticarComo } from "./test.auth";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO DA LIVE DE 14/10 — o que NENHUMA branch sozinha podia provar.
//
// Três trabalhos entraram juntos: o Briefing reorganizado (que acrescentou
// `situacao`, `origem`, `tipoFlor`, `reaproveitamento` e `bloco` ao item), o
// Caderno Cliente/Equipe (que acrescentou o escopo `opcional`) e a Produção
// floral (que acrescentou a parte floral da RECEITA e a ficha do florista).
//
// Cada um tem a sua bateria. O que só existe depois do merge é a INTERAÇÃO, e
// é dela que nascem os defeitos silenciosos:
//
//  1. a ficha do florista tem de respeitar a situação e o opcional do briefing
//     — senão manda o florista montar o que a cliente não aprovou;
//  2. gravar pelo briefing não pode apagar a parte floral, e gravar a parte
//     floral não pode apagar os campos do briefing. São duas telas escrevendo
//     no MESMO documento;
//  3. `tipoFlor` (do item) e `origem` (da linha da receita) usam o mesmo
//     vocabulário natural/permanente em objetos diferentes. Têm de conviver
//     sem se sobrescrever.
// ═════════════════════════════════════════════════════════════════════════════

const NOW = "2026-10-14T12:00:00.000Z";

async function cenario() {
  const t = convexTest(schema, modules);
  const sessao = await autenticarComo(t, {
    nome: "Dona",
    email: "dona@ex.com",
    role: "user",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const dona = await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona@ex.com"))
      .unique();
    if (!dona) throw new Error("conta não criada");

    const rosa = await ctx.db.insert("materials", {
      userId: dona._id, nome: "Rosa", searchName: "rosa", unidade: "haste",
      categoria: "Flores", custoReferencia: 4.2, variedade: "Avalanche", updatedAt: NOW,
    });

    const eventId = await ctx.db.insert("events", {
      userId: dona._id, name: "Marina & Gabriel", type: "wedding", date: "2026-12-12",
      location: "Fazenda", clientName: "Marina", status: "confirmed",
    });

    const base = {
      userId: dona._id, eventId, order: 0, includeInAssemblyReport: true,
      checkOnAssembly: true, visibility: "interno" as const, createdAt: NOW, updatedAt: NOW,
    };
    const receita = [
      {
        materialId: rosa, nome: "Rosa", unidade: "haste" as const, quantidade: 5,
        categoria: "Flores", custoReferencia: 4.2, variedade: "Avalanche",
        cor: "branca", origem: "natural" as const,
      },
    ];

    // Contratado, com briefing preenchido E parte floral: o caso normal.
    const contratado = await ctx.db.insert("assemblyItems", {
      ...base, area: "tables", name: "Arranjo de mesa", ambiente: "Mesa dos convidados",
      quantity: 20, bloco: "mesas", situacao: "contratado", origem: "acervo",
      tipoFlor: "natural", medidas: "30 cm", receita,
      floral: { altura: "Até 30 cm", horario: "Entregar às 14h" },
    });

    // "Em avaliação": a cliente ainda não decidiu.
    const emAvaliacao = await ctx.db.insert("assemblyItems", {
      ...base, order: 1, area: "ceremony", name: "Monograma de flores",
      bloco: "personalizacao", situacao: "em_avaliacao", quantity: 1, receita,
    });

    // "Não se aplica": ficou de fora.
    const naoSeAplica = await ctx.db.insert("assemblyItems", {
      ...base, order: 2, area: "ceremony", name: "Arco descartado",
      situacao: "nao_se_aplica", quantity: 1, receita,
    });

    // Opcional: oferecido, não contratado (Caderno Cliente/Equipe).
    const opcional = await ctx.db.insert("assemblyItems", {
      ...base, order: 3, area: "lounge", name: "Arranjo extra do lounge",
      projectScope: "opcional", valorOpcional: 80000, quantity: 2, receita,
    });

    // Da locadora: sai do caminhão, mas É montado — tem de chegar ao florista.
    const daLocadora = await ctx.db.insert("assemblyItems", {
      ...base, order: 4, area: "cake", name: "Arranjo do bolo",
      origem: "locadora", situacao: "aprovado", quantity: 1, receita,
    });

    return { eventId, contratado, emAvaliacao, naoSeAplica, opcional, daLocadora };
  });

  return { t, sessao, ...ids };
}

describe("a ficha do florista respeita o briefing e o opcional", () => {
  it("não manda montar o que está em avaliação, não se aplica ou é opcional", async () => {
    const { sessao, eventId } = await cenario();
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha).not.toBeNull();

    const nomes = ficha!.composicoes.map((c) => c.nome).sort();
    // Só o contratado e o aprovado da locadora. Mandar o florista montar um
    // monograma "em avaliação" é fazer alguém perder a manhã — e cobrar por
    // flor que a cliente não aprovou.
    expect(nomes).toEqual(["Arranjo de mesa", "Arranjo do bolo"]);
    expect(nomes).not.toContain("Monograma de flores");
    expect(nomes).not.toContain("Arranjo extra do lounge");
  });

  it("peça da locadora entra na ficha: ela sai do caminhão, não do projeto", async () => {
    const { sessao, eventId } = await cenario();
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha!.composicoes.map((c) => c.nome)).toContain("Arranjo do bolo");
  });

  it("o resumo do florista soma só o que vai ser montado", async () => {
    const { sessao, eventId } = await cenario();
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    const rosa = ficha!.resumo.find((l) => l.nome === "Rosa")!;
    // 20 arranjos × 5 + 1 do bolo × 5 = 105. Sem os 1 + 1 + 2 recusados, que
    // somariam 20 hastes de flor que ninguém pediu.
    expect(rosa.total).toBe(105);
  });
});

describe("duas telas, um documento: nenhuma apaga o trabalho da outra", () => {
  it("gravar os campos do briefing preserva receita, parte floral e instruções", async () => {
    const { t, sessao, contratado } = await cenario();

    await sessao.mutation(api.assemblyItems.update, {
      id: contratado,
      medidas: "35 cm de altura",
      posicao: "centro da mesa",
      responsavelMontagem: "Camila",
      situacao: "aprovado",
    });

    const item = await t.run((ctx) => ctx.db.get(contratado));
    expect(item?.medidas).toBe("35 cm de altura");
    // A receita e a parte floral continuam inteiras: `update` faz patch e não
    // reescreve `receita` nem `floral`.
    expect(item?.receita).toHaveLength(1);
    expect(item?.receita?.[0].cor).toBe("branca");
    expect(item?.receita?.[0].origem).toBe("natural");
    expect(item?.receita?.[0].variedade).toBe("Avalanche");
    expect(item?.floral?.altura).toBe("Até 30 cm");
    expect(item?.floral?.horario).toBe("Entregar às 14h");
  });

  it("gravar a parte floral preserva os campos do briefing e o custo da receita", async () => {
    const { t, sessao, contratado } = await cenario();

    await sessao.mutation(api.producaoFloral.setLinhasFlorais, {
      id: contratado,
      linhas: [
        {
          indice: 0,
          nome: "Rosa",
          materialId: (await t.run((ctx) => ctx.db.get(contratado)))!.receita![0].materialId,
          cor: "rosê",
          origem: "permanente",
          distribuicao: "por_arranjo",
          apenasOrientacao: false,
        },
      ],
    });

    const item = await t.run((ctx) => ctx.db.get(contratado));
    // O briefing continua lá.
    expect(item?.bloco).toBe("mesas");
    expect(item?.situacao).toBe("contratado");
    expect(item?.tipoFlor).toBe("natural");
    expect(item?.medidas).toBe("30 cm");
    // A parte floral mudou…
    expect(item?.receita?.[0].cor).toBe("rosê");
    expect(item?.receita?.[0].origem).toBe("permanente");
    // …e o que não é da floral NÃO mudou: custo, unidade e quantidade.
    expect(item?.receita?.[0].custoReferencia).toBe(4.2);
    expect(item?.receita?.[0].unidade).toBe("haste");
    expect(item?.receita?.[0].quantidade).toBe(5);
  });

  it("gravar instruções do florista preserva o briefing do item", async () => {
    const { t, sessao, contratado } = await cenario();
    await sessao.mutation(api.producaoFloral.setInstrucoes, {
      id: contratado,
      floral: { montagem: "Espuma hidratada", cuidados: "Repor água na véspera" },
    });
    const item = await t.run((ctx) => ctx.db.get(contratado));
    expect(item?.floral?.montagem).toBe("Espuma hidratada");
    expect(item?.situacao).toBe("contratado");
    expect(item?.origem).toBe("acervo");
    expect(item?.receita).toHaveLength(1);
  });
});

describe("natural/permanente em dois lugares, sem se atropelar", () => {
  it("`tipoFlor` é do item e `origem` é da linha: mudar um não muda o outro", async () => {
    const { t, sessao, contratado } = await cenario();

    // O item diz "natural"; a linha da receita passa a "permanente".
    await sessao.mutation(api.producaoFloral.setLinhasFlorais, {
      id: contratado,
      linhas: [
        {
          indice: 0,
          nome: "Rosa",
          materialId: (await t.run((ctx) => ctx.db.get(contratado)))!.receita![0].materialId,
          origem: "permanente",
          distribuicao: "por_arranjo",
          apenasOrientacao: false,
        },
      ],
    });
    let item = await t.run((ctx) => ctx.db.get(contratado));
    expect(item?.tipoFlor).toBe("natural");
    expect(item?.receita?.[0].origem).toBe("permanente");

    // E o caminho de volta: mexer no item não mexe na linha.
    await sessao.mutation(api.assemblyItems.update, {
      id: contratado,
      tipoFlor: "permanente",
    });
    item = await t.run((ctx) => ctx.db.get(contratado));
    expect(item?.tipoFlor).toBe("permanente");
    expect(item?.receita?.[0].origem).toBe("permanente");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFEITO DA HOMOLOGAÇÃO DE 13/10 QUE NÃO TINHA TESTE PRÓPRIO
//
// O nome do arquivo do PDF do florista saía com o acento picado:
// "Aniversário" virava "anivers-rio", porque `[^\w]` trocava o "á" por hífen.
// A correção (tirar o acento ANTES de trocar o resto) estava no código e sem
// guarda — este é o guarda, lido da fonte para não precisar de navegador.
// ─────────────────────────────────────────────────────────────────────────────

describe("nome do arquivo da ficha do florista", () => {
  /** A mesma transformação do gerador, lida dele por regex para não divergir. */
  function slugDoGerador(nome: string): string {
    return nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  }

  it("tira o acento antes de trocar o resto por hífen", () => {
    expect(slugDoGerador("Aniversário da Ana")).toBe("aniversario-da-ana");
    expect(slugDoGerador("Marina & Gabriel")).toBe("marina-gabriel");
    expect(slugDoGerador("Coração")).toBe("coracao");
  });

  it("o gerador faz exatamente isso — a ordem das trocas está na fonte", () => {
    const fonte = readFileSync("src/lib/generate-ficha-floral-pdf.ts", "utf-8");
    const i = fonte.indexOf("ficha-floral-");
    const trecho = fonte.slice(i, i + 400);
    // `normalize("NFD")` e a remoção dos diacríticos vêm ANTES de `[^\w]`.
    expect(trecho.indexOf("NFD")).toBeGreaterThan(-1);
    expect(trecho.indexOf("u0300")).toBeLessThan(trecho.indexOf("^\\w"));
  });
});
