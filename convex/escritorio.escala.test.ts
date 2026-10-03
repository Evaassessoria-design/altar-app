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
import { autenticarComoDonoDaPlataforma } from "./test.auth";
import type { MutationCtx } from "./_generated/server";
import { LIVE_ALTAR } from "./lib/campanha";
import { LIMITE_POR_RODADA } from "./escritorioCiclo";
import { chaveDaIntencao, planejarCiclo } from "./lib/escritorio/ciclo";

// ═════════════════════════════════════════════════════════════════════════════
// O CICLO COM MUITA GENTE DENTRO
//
// ── A PERGUNTA ──────────────────────────────────────────────────────────────
// "Rodar Escritório" numa campanha de mil pessoas: quantas leituras? Quantas
// escritas? O custo cresce com a campanha, ou com o que há para fazer?
//
// Medir TEMPO em teste é flaky — a máquina do CI varia mais do que o código.
// O que se mede aqui é FORMA: número de consultas por rodada, ausência de
// leitura por pessoa, e o comportamento no teto.
// ═════════════════════════════════════════════════════════════════════════════

const CICLO = readFileSync("convex/escritorioCiclo.ts", "utf-8");

function semComentarios(fonte: string): string {
  return fonte
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

const NOMES = ["Marina", "Joana", "Beatriz", "Carla", "Helena", "Rita", "Sofia"];
const SOB = ["Alves", "Costa", "Moreira", "Pacheco", "Rangel", "Vieira"];

async function comPessoas(n: number, over: Record<string, unknown> = {}) {
  const t = convexTest(schema, modules);
  const admin = await autenticarComoDonoDaPlataforma(t);
  await t.run(async (ctx: MutationCtx) => {
    for (let i = 0; i < n; i++) {
      await ctx.db.insert("landingLeads", {
        name: `${NOMES[i % 7]} ${SOB[i % 6]} ${i}`,
        email: `p${i}@exemplo.com.br`,
        whatsapp: `+551199990${String(i).padStart(4, "0")}`,
        whatsappE164: `+551199990${String(i).padStart(4, "0")}`,
        empresa: `Ateliê ${i}`,
        intent: "demo" as const,
        campanha: LIVE_ALTAR.slug,
        ...over,
      });
    }
  });
  const rodar = () => admin.mutation(api.escritorioCiclo.rodarAgora, { campanha: LIVE_ALTAR.slug });
  return { t, admin, rodar };
}

describe("a forma da rodada", () => {
  it("as leituras do banco são CONTADAS, não por pessoa", () => {
    // ── O DEFEITO QUE ISTO TRANCA ─────────────────────────────────────────
    // Bastaria alguém querer "os rascunhos desta pessoa" dentro do laço para
    // a rodada virar mil consultas numa campanha de mil. O plano recebe tudo
    // pronto justamente para não ter como pedir mais dados.
    const corpo = semComentarios(CICLO);
    const rodada = corpo.slice(
      corpo.indexOf("export const rodarAgora"),
      corpo.indexOf("export const LIMITE_DO_HISTORICO"),
    );

    // Três leituras: interessados, rascunhos por revisar, aprovados. Mais a
    // política. O `insert` do laço é escrita, e é limitado pelo teto.
    const leituras = (rodada.match(/ctx\.db\s*\n?\s*\.query\(/g) ?? []).length;
    expect(leituras, `a rodada faz ${leituras} consultas — eram 3`).toBeLessThanOrEqual(3);

    // E nenhuma leitura DENTRO do laço de intenções.
    const laco = rodada.slice(rodada.indexOf("for (const i of plano.intencoes)"));
    expect(laco, "voltou uma leitura por intenção").not.toContain("ctx.db.query");
    expect(laco, "voltou um get por intenção").not.toContain("ctx.db.get");
  });

  it("toda leitura tem teto declarado", () => {
    const corpo = semComentarios(CICLO);
    // O único `collect()` é o da política, limitada pelo número de
    // capacidades — quinze, por construção.
    const collects = (corpo.match(/\.collect\(\)/g) ?? []).length;
    expect(collects, `${collects} collect() no ciclo`).toBeLessThanOrEqual(1);
    expect(corpo).toContain("VARREDURA_DO_CICLO");
    expect(corpo).toContain("varreduraIncompleta");
  });

  it("o plano puro é linear no número de pessoas", () => {
    // Mil pessoas, sem banco: se houvesse comparação de todos contra todos,
    // seriam quinhentas mil operações e isto levaria segundos.
    const pessoas = Array.from({ length: 1000 }, (_, i) => ({
      _id: `l${i}`,
      nome: `Pessoa ${i}`,
      status: undefined,
      fatos: { temCanal: true, procurouOAltar: true },
    }));
    const inicio = Date.now();
    const p = planejarCiclo({
      campanha: "live",
      pessoas: pessoas as never,
      duplicidades: [],
      podeFazer: new Set(["preparar_primeiro_contato"]),
      jaFeito: new Set(),
    });
    const ms = Date.now() - inicio;
    expect(p.intencoes).toHaveLength(1000);
    expect(ms, `o plano levou ${ms}ms para mil pessoas`).toBeLessThan(500);
  });

  it("reconhecer trabalho feito também é linear", () => {
    // `jaFeito` é um Set: procurar mil chaves em mil é mil buscas O(1), não
    // um milhão de comparações.
    const pessoas = Array.from({ length: 1000 }, (_, i) => ({
      _id: `l${i}`,
      nome: `Pessoa ${i}`,
      status: undefined,
      fatos: { temCanal: true, procurouOAltar: true },
    }));
    const jaFeito = new Set(
      pessoas.map((p) => chaveDaIntencao("live", "preparar_mensagem", p._id, "convite")),
    );
    const inicio = Date.now();
    const p = planejarCiclo({
      campanha: "live",
      pessoas: pessoas as never,
      duplicidades: [],
      podeFazer: new Set(["preparar_primeiro_contato"]),
      jaFeito,
    });
    expect(Date.now() - inicio).toBeLessThan(500);
    expect(p.intencoes).toHaveLength(0);
    expect(p.jaExistiam).toBe(1000);
  });
});

describe("o custo cresce com o TRABALHO, não com a campanha", () => {
  it.each([10, 100])("com %i pessoas, a primeira rodada escreve até o teto", async (n) => {
    const { admin, rodar } = await comPessoas(n);
    const r = await rodar();
    expect(r.analisadas).toBe(n);
    expect(r.mensagensPreparadas).toBe(Math.min(n, LIMITE_POR_RODADA));
    // O custo de IA é do REGISTRO da rodada, não do retorno dela: é lá que
    // ele precisa estar para poder ser somado depois, e é lá que o teste de
    // fronteira o confere.
    const h = await admin.query(api.escritorioCiclo.execucoes, { campanha: LIVE_ALTAR.slug });
    expect(h.ultima?.chamadasDeIa).toBe(0);
  });

  it("com mil pessoas, a rodada ainda fecha e declara o que sobrou", async () => {
    const { rodar } = await comPessoas(1000);
    const r = await rodar();
    expect(r.analisadas).toBe(1000);
    expect(r.mensagensPreparadas).toBe(LIMITE_POR_RODADA);
    expect(r.naoCouberam).toBe(1000 - LIMITE_POR_RODADA);
    expect(r.varreduraIncompleta, "mil cabe na varredura").toBe(false);
  });

  it("a segunda rodada sobre mil NÃO reescreve as cinquenta primeiras", async () => {
    // É a prova de que a idempotência aguenta escala: sem ela, cada rodada
    // sobre uma campanha grande criaria mais cinquenta duplicatas.
    const { rodar } = await comPessoas(1000);
    await rodar();
    const segunda = await rodar();
    expect(segunda.jaExistiam).toBe(LIMITE_POR_RODADA);
    expect(segunda.mensagensPreparadas).toBe(LIMITE_POR_RODADA);
  });

  it("rodada sobre gente que já saiu do ciclo não escreve nada", async () => {
    // O custo de uma campanha ENCERRADA precisa ser praticamente zero: é o
    // estado em que ela passa a maior parte da vida.
    const { rodar } = await comPessoas(500, { status: "convertido" as const });
    const r = await rodar();
    expect(r.analisadas).toBe(500);
    expect(r.mensagensPreparadas).toBe(0);
    expect(r.decisoesParaVoce).toBe(0);
  });

  it("a duplicidade tem teto — mil pessoas com o mesmo telefone não travam", async () => {
    // Mil registros com o mesmo número geram quase meio milhão de pares. A
    // lista corta em cinquenta, e corta pelo fim fraco.
    const { rodar } = await comPessoas(200, { whatsappE164: "+5511999998888" });
    const r = await rodar();
    expect(r.duplicidadesApontadas).toBeLessThanOrEqual(50);
  });
});
