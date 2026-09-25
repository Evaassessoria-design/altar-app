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
import { autenticarComoAdmin } from "./test.auth";
import type { MutationCtx } from "./_generated/server";
import { LIVE_ALTAR } from "./lib/campanha";
import { LIMITE_DE_INTERESSADOS } from "./admin";

// ═════════════════════════════════════════════════════════════════════════════
// A CAMPANHA COM GENTE DENTRO
//
// ── A PERGUNTA ──────────────────────────────────────────────────────────────
// "Se amanhã tivermos 100 interessados, o ALTAR aguenta organizar?"
//
// Uma resposta de opinião não serve. Estes testes medem a FORMA das consultas
// — nenhuma leitura por pessoa dentro de um laço — e conferem os números com
// 100 e com 250 registros de verdade no banco.
//
// Medir TEMPO em teste é flaky e não diz nada: a máquina do CI varia mais do
// que o código. Forma não varia.
// ═════════════════════════════════════════════════════════════════════════════

const BRIEFING = readFileSync("convex/comercialBriefing.ts", "utf-8");
const RASCUNHOS = readFileSync("convex/campanhaRascunhos.ts", "utf-8");

function semComentarios(fonte: string): string {
  return fonte
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

/** Nomes variados: é a forma que uma lista de campanha real tem. */
const PRIMEIROS_NOMES = ["Marina", "Joana", "Beatriz", "Carla", "Helena", "Rita", "Sofia"];
const SOBRENOMES = ["Alves", "Costa", "Moreira", "Pacheco", "Rangel", "Vieira"];

/** O telefone da pessoa `i`, em E.164 válido: +55 11 9 9990 00NN. */
function telefoneDe(i: number): string {
  return `+551199990${String(i).padStart(4, "0")}`;
}

async function cenario(quantos: number, over: Record<string, unknown> = {}) {
  const t = convexTest(schema, modules);
  const admin = await autenticarComoAdmin(t);
  await t.run(async (ctx: MutationCtx) => {
    for (let i = 0; i < quantos; i++) {
      await ctx.db.insert("landingLeads", {
        // ── POR QUE OS NOMES SÃO DISTINTOS ────────────────────────────────
        // A primeira versão chamava todo mundo de "Decoradora N", e a busca
        // por "Decoradora 177" falhava entre 250 registros: o termo "Decoradora"
        // casava com os 250 e o teto de 25 cortava antes de chegar ao 177.
        //
        // Isso dizia mais sobre o dado de teste do que sobre o produto — uma
        // campanha real tem nomes distintos. Testar com 250 homônimos mediria
        // a qualidade do ranking, que é do Convex, e não a da consulta.
        name: `${PRIMEIROS_NOMES[i % PRIMEIROS_NOMES.length]} ${SOBRENOMES[i % SOBRENOMES.length]} ${i}`,
        email: `pessoa${i}@exemplo.com.br`,
        whatsapp: telefoneDe(i),
        whatsappE164: telefoneDe(i),
        // ── POR QUE TODO REGISTRO AQUI TEM EMPRESA ────────────────────────
        // O banco falso do `convex-test` chama `.split()` no campo de um
        // índice de busca sem conferir se ele existe, e explode em qualquer
        // registro sem `empresa` — inclusive numa busca por NOME, porque a
        // consulta usa os dois índices.
        //
        // É limitação do simulador, não do Convex: lá, documento sem o campo
        // simplesmente não casa. Mas isso não foi verificado contra um
        // deployment de verdade, e por isso está listado como risco a
        // homologar em `docs/homologacao-pre-live.md`, §6.
        empresa: `Ateliê ${i}`,
        intent: "demo" as const,
        campanha: LIVE_ALTAR.slug,
        ...over,
      });
    }
  });
  return { t, admin };
}

describe("a forma das consultas — nenhuma leitura por pessoa", () => {
  it("o briefing comercial NÃO lê o banco dentro do laço de pessoas", () => {
    // ── O DEFEITO QUE ISTO TRANCA ─────────────────────────────────────────
    // `proximaAcao` é pura e recebe só o que já foi lido em lote. Bastaria
    // alguém querer "os eventos da conta de teste dela" dentro do `.map()`
    // para virar uma leitura POR PESSOA — 100 consultas para desenhar a tela
    // que se abre primeiro, todo dia. É o mesmo defeito que `health.listCards`
    // e o painel de atenção já tiveram.
    const corpo = semComentarios(BRIEFING);
    const laco = corpo.slice(corpo.indexOf("const pedidos = leads"), corpo.indexOf("const duplicidades"));
    expect(laco, "voltou uma leitura por pessoa no briefing").not.toContain("ctx.db");
    expect(laco).toContain("proximaAcao(");
  });

  it("toda leitura da campanha tem teto", () => {
    // `collect()` sobre uma tabela que só cresce para em silêncio quando a
    // conta cresce — e a campanha existe justamente para fazê-la crescer.
    for (const [nome, fonte] of [
      ["comercialBriefing", BRIEFING],
      ["campanhaRascunhos", RASCUNHOS],
    ] as const) {
      const corpo = semComentarios(fonte);
      const usos = corpo.match(/\.collect\(\)/g) ?? [];
      // O único `collect()` tolerado é o da busca por (pessoa, tipo), que é
      // limitada pelo índice a alguns registros da MESMA pessoa.
      expect(usos.length, `${nome} tem ${usos.length} collect() sem teto`).toBeLessThanOrEqual(2);
      expect(corpo).toContain(".take(");
    }
  });

  it("a varredura declara quando não viu tudo", () => {
    expect(semComentarios(BRIEFING)).toContain("completa");
    expect(semComentarios(RASCUNHOS)).toContain("varreduraIncompleta");
  });
});

describe("cem interessados", () => {
  it("o funil conta os cem, e as taxas saem com base declarada", async () => {
    const { admin } = await cenario(100);
    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });

    expect(f.total).toBe(100);
    expect(f.completa, "cem cabe na varredura").toBe(true);
    expect(f.semContato, "ninguém foi abordado ainda").toBe(100);
    // Sem convidados não há base para taxa de resposta — e a tela diz isso em
    // vez de mostrar 0%, que pareceria fracasso em vez de "ainda não começou".
    const resposta = f.taxas.find((t) => t.chave === "resposta");
    expect(resposta?.percentual).toBeNull();
    expect(resposta?.semPercentualPorque).toMatch(/ninguém/i);
  });

  it("o briefing responde com os cem sem ler nada por pessoa", async () => {
    const { admin } = await cenario(100);
    const b = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });
    expect(b.completa).toBe(true);
    expect(b.pessoasLidas).toBe(100);
    expect(b.resumo).toContain("100");
  });

  it("preparar os cem convites leva dois lotes, e o corte é declarado", async () => {
    // O lote tem teto de 50. Preparar cem numa transação não fecha — e, pior,
    // fecharia pela metade sem ninguém saber quais.
    const { admin } = await cenario(100);

    const um = await admin.mutation(api.campanhaRascunhos.prepararPendentes, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(um.preparados).toBe(50);
    expect(um.restantes, "o corte precisa ser declarado").toBe(50);

    const dois = await admin.mutation(api.campanhaRascunhos.prepararPendentes, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(dois.preparados).toBe(50);
    expect(dois.restantes).toBe(0);

    const tres = await admin.mutation(api.campanhaRascunhos.prepararPendentes, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(tres.preparados, "rodar de novo não duplica").toBe(0);
  });

  it("a listagem para no teto e DIZ que há mais", async () => {
    const { admin } = await cenario(LIMITE_DE_INTERESSADOS + 50);
    const lista = await admin.query(api.admin.listLandingLeads, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(lista.leads).toHaveLength(LIMITE_DE_INTERESSADOS);
    expect(lista.temMais, "a tela precisa saber que há mais").toBe(true);
  });

  it("a busca acha uma pessoa entre 250 pelo nome", async () => {
    const { admin, t } = await cenario(250);
    const alvo = await t.run(async (ctx: MutationCtx) => {
      const todos = await ctx.db.query("landingLeads").collect();
      return todos[177].name;
    });

    const r = await admin.query(api.admin.buscarInteressados, {
      termo: alvo,
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.resultados.map((p) => p.name)).toContain(alvo);
  });

  it("busca por telefone acha mesmo digitado em outro formato", async () => {
    // ── A RAZÃO DE O TELEFONE SER NORMALIZADO ─────────────────────────────
    // "(11) 99990-0042" e "+5511999900042" são o mesmo aparelho, e nenhum casa
    // com o outro por comparação de string. Sem normalizar, procurar pelo
    // número copiado do WhatsApp não acharia o registro digitado à mão — e a
    // pessoa seria cadastrada de novo, que é a duplicidade que este painel
    // existe para combater.
    const { admin } = await cenario(100);
    for (const formato of ["(11) 99990-0042", "11999900042", "+55 11 99990-0042"]) {
      const r = await admin.query(api.admin.buscarInteressados, {
        termo: formato,
        campanha: LIVE_ALTAR.slug,
      });
      expect(
        r.resultados.map((p) => p.whatsapp),
        `"${formato}" não achou o aparelho`,
      ).toContain(telefoneDe(42));
    }
  });

  it("busca por empresa acha quem não se lembra do nome da dona", async () => {
    const { admin } = await cenario(120);
    const r = await admin.query(api.admin.buscarInteressados, {
      termo: "Ateliê 88",
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.resultados.map((p) => p.empresa)).toContain("Ateliê 88");
  });

  it("termo curto demais não devolve ruído com cara de resultado", async () => {
    const { admin } = await cenario(100);
    const r = await admin.query(api.admin.buscarInteressados, {
      termo: "a",
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.curtoDemais).toBe(true);
    expect(r.resultados).toEqual([]);
  });
});

describe("a fila humana não vira um mural", () => {
  it("cem pessoas sem contato NÃO produzem cem linhas de 'precisa de você'", async () => {
    // Prioridade acima de volume. Uma fila de cem itens é a mesma paralisia
    // com mais rolagem — e nenhuma delas seria lida.
    const { admin } = await cenario(100, { whatsapp: undefined, whatsappE164: undefined, email: "" });
    const b = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });
    expect(b.precisaDeVoce.length).toBeLessThanOrEqual(25);
  });

  it("a duplicidade tem teto e aponta as mais fortes primeiro", async () => {
    // Cem pessoas com o MESMO telefone geram milhares de pares. A lista corta,
    // e corta pelo fim fraco.
    const { admin } = await cenario(60, { whatsappE164: "+5511999998888" });
    const b = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });
    expect(b.duplicidades.length).toBeLessThanOrEqual(50);
    expect(b.duplicidades[0]?.forca).toBe("alta");
  });
});
