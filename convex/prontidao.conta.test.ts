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
import { autenticarComoDecoradora } from "./test.auth";
import type { MutationCtx } from "./_generated/server";
import { prontidaoDaConta, type DadosDaConta } from "./lib/prontidaoDaConta";

// ═════════════════════════════════════════════════════════════════════════════
// "MEU ALTAR ESTÁ PRONTO?"
//
// A pergunta que uma decoradora nova faz no primeiro minuto, quando a conta
// está vazia e ninguém sabe por onde começar.
//
// O que estes testes guardam: nenhum marco é um botão de "já fiz" (apagar o
// último evento faz o marco VOLTAR, porque é a verdade), o opcional não
// reprova, e a tela nunca afirma um total que não contou.
// ═════════════════════════════════════════════════════════════════════════════

const conta = (over: Partial<DadosDaConta> = {}): DadosDaConta => ({
  studioName: undefined,
  temLogo: false,
  eventos: 0,
  leads: 0,
  propostas: 0,
  materiais: 0,
  materiaisComFoto: 0,
  fornecedoresNoCatalogo: 0,
  lancamentos: 0,
  eventosApresentaveis: 0,
  eventosExaminados: 0,
  ...over,
});

const cheia = (): DadosDaConta =>
  conta({
    studioName: "Estúdio Alba",
    temLogo: true,
    eventos: 3,
    eventosApresentaveis: 1,
    eventosExaminados: 3,
  });

describe("a regra da prontidão da conta", () => {
  it("conta zerada não afirma nada a mais", () => {
    const p = prontidaoDaConta(conta());
    expect(p.feitos).toBe(0);
    expect(p.percentual).toBe(0);
    expect(p.pronto).toBe(false);
    expect(p.aha.alcancado).toBe(false);
    expect(p.proximo?.chave).toBe("estudio");
  });

  it("o opcional NÃO reprova", () => {
    // ── O DEFEITO QUE ESTE TESTE HERDA ────────────────────────────────────
    // Em `primeiros-passos.ts` o passo opcional contava no progresso, e a
    // conta ficava em 67% para sempre com um botão de "continuar
    // configuração" que não tinha o que continuar.
    const p = prontidaoDaConta(cheia());
    expect(p.pronto).toBe(true);
    expect(p.percentual).toBe(100);
    expect(p.marcos.some((m) => !m.essencial && m.situacao !== "feito")).toBe(true);
  });

  it("o próximo passo é ESSENCIAL antes de opcional", () => {
    // Mandar cadastrar fornecedor antes de criar o primeiro evento é mandar a
    // pessoa preencher cadastro sem ter visto o produto funcionar.
    const p = prontidaoDaConta(
      conta({ studioName: "Alba", materiais: 9, fornecedoresNoCatalogo: 5 }),
    );
    expect(p.proximo?.essencial).toBe(true);
    expect(p.proximo?.chave).toBe("logo");
  });

  it("nome em branco não conta como preenchido", () => {
    expect(prontidaoDaConta(conta({ studioName: "   " })).feitos).toBe(0);
  });

  it("todo marco leva a uma rota real e diz POR QUE importa", () => {
    // "Configure seu estúdio" não diz a ninguém por que valeria a pena. "É o
    // que aparece no topo de toda proposta" diz.
    const rotas = readFileSync("src/App.tsx", "utf-8");
    for (const m of prontidaoDaConta(conta()).marcos) {
      expect(m.destino, m.chave).toMatch(/^\//);
      expect(rotas, `destino ${m.destino} não é rota do app`).toContain(`path="${m.destino}"`);
      expect(m.porque.length, m.chave).toBeGreaterThan(30);
      expect(m.minutos, m.chave).toBeGreaterThan(0);
    }
  });

  it("os minutos restantes ENCOLHEM a cada passo", () => {
    // O número é a promessa que a tela faz. Um "quase lá" que nunca muda
    // ensina a não acreditar no próximo número que o produto der.
    const vazia = prontidaoDaConta(conta()).minutosRestantes;
    const comNome = prontidaoDaConta(conta({ studioName: "Alba" })).minutosRestantes;
    expect(comNome).toBeLessThan(vazia);
    expect(prontidaoDaConta(cheia()).minutosRestantes).toBeLessThan(comNome);
  });

  it("o AHA é separado do progresso", () => {
    // Uma conta pode ter 100% dos essenciais e ainda não ter gerado projeto
    // nenhum. Essa distância é o que a tela precisa mostrar.
    const semProjeto = prontidaoDaConta(
      conta({ studioName: "Alba", temLogo: true, eventos: 2, eventosExaminados: 2 }),
    );
    expect(semProjeto.aha.alcancado).toBe(false);
    expect(semProjeto.aha.detalhe).toMatch(/capa|classifique/i);
  });

  it("nenhum marco usa vocabulário técnico", () => {
    const tecnico = ["tenant", "query", "backend", "upload", "id", "token", "schema", "deploy"];
    for (const m of prontidaoDaConta(conta()).marcos) {
      const texto = `${m.titulo} ${m.porque} ${m.acao}`.toLowerCase();
      for (const palavra of tecnico) {
        expect(texto.split(/\s+/), `${m.chave} usa "${palavra}"`).not.toContain(palavra);
      }
    }
  });
});

describe("as duas telas de onboarding nunca se contradizem", () => {
  it("prontidão pronta implica primeiros passos completos", async () => {
    // ── POR QUE ESTA TRAVA EXISTE ─────────────────────────────────────────
    // São duas perguntas diferentes de propósito: o aviso de primeiros passos
    // mede "a configuração mínima está feita?" e some quando ela dispensa; a
    // prontidão mede a jornada até o ALTAR se pagar.
    //
    // Duas perguntas diferentes podem conviver. Duas RESPOSTAS diferentes
    // sobre o mesmo estado, não: a decoradora veria um "tudo pronto" ao lado
    // de um "2 de 3 passos" na mesma tela.
    //
    // A relação segura é de implicação: a prontidão é ESTRITAMENTE mais
    // exigente (pede logo e projeto visual além de estúdio e evento). Logo,
    // pronta ⇒ primeiros passos completos. O contrário não precisa valer.
    const { primeirosPassos } = await import("../src/lib/primeiros-passos");

    const casos: DadosDaConta[] = [
      conta(),
      conta({ studioName: "Alba" }),
      conta({ studioName: "Alba", temLogo: true }),
      conta({ studioName: "Alba", temLogo: true, eventos: 1, eventosExaminados: 1 }),
      cheia(),
    ];

    for (const c of casos) {
      const p = prontidaoDaConta(c);
      const passos = primeirosPassos({
        studioName: c.studioName ?? null,
        eventos: c.eventos,
        // A equipe é opcional nos dois lados e não muda a conclusão.
        equipe: 0,
      });
      if (p.pronto) {
        expect(
          passos?.completo,
          "a prontidão diz PRONTO e os primeiros passos dizem incompleto",
        ).toBe(true);
      }
    }
  });
});

describe("a consulta lê a conta de verdade", () => {
  it("conta nova devolve tudo pendente e nenhum AHA", async () => {
    const t = convexTest(schema, modules);
    const decoradora = await autenticarComoDecoradora(t);
    const p = await decoradora.query(api.onboarding.prontidao, {});
    expect(p.pronto).toBe(false);
    expect(p.aha.alcancado).toBe(false);
    expect(p.proximo?.chave).toBe("estudio");
  });

  it("o marco VOLTA quando o dado some — não é caixinha marcada", async () => {
    // ── A REGRA QUE SUSTENTA A CONFIANÇA ──────────────────────────────────
    // Caixa que a pessoa marca sozinha mente em duas direções: fica marcada
    // quando ela apagou o que tinha feito, e vazia quando ela fez o passo por
    // outra tela. Aqui tudo é derivado do banco.
    const t = convexTest(schema, modules);
    const decoradora = await autenticarComoDecoradora(t);

    const eventId = await decoradora.run(async (ctx: MutationCtx) => {
      const u = (await ctx.db.query("users").first())!;
      await ctx.db.patch(u._id, { studioName: "Estúdio Alba" });
      return ctx.db.insert("events", {
        userId: u._id,
        name: "Marina & Gabriel",
        date: "2026-12-12",
        type: "wedding",
        location: "Espaço Jardim",
        clientName: "Marina",
        status: "planning",
      });
    });

    const com = await decoradora.query(api.onboarding.prontidao, {});
    expect(com.marcos.find((m) => m.chave === "evento")?.situacao).toBe("feito");

    await decoradora.run(async (ctx: MutationCtx) => ctx.db.delete(eventId));

    const sem = await decoradora.query(api.onboarding.prontidao, {});
    expect(sem.marcos.find((m) => m.chave === "evento")?.situacao, "o marco não voltou").toBe(
      "pendente",
    );
  });

  it("uma conta NUNCA vê a prontidão da outra", async () => {
    const t = convexTest(schema, modules);
    const a = await autenticarComoDecoradora(t);
    await a.run(async (ctx: MutationCtx) => {
      const u = (await ctx.db.query("users").first())!;
      await ctx.db.patch(u._id, { studioName: "Estúdio Alba" });
      await ctx.db.insert("events", {
        userId: u._id,
        name: "Evento da conta A",
        date: "2026-12-12",
        type: "wedding",
        location: "Espaço Jardim",
        clientName: "Marina",
        status: "planning",
      });
    });

    const { autenticarComoAdmin } = await import("./test.auth");
    const b = await autenticarComoAdmin(t);
    const dela = await b.query(api.onboarding.prontidao, {});
    expect(dela.marcos.find((m) => m.chave === "evento")?.situacao).toBe("pendente");
    expect(dela.marcos.find((m) => m.chave === "estudio")?.detalhe).not.toContain("Alba");
  });

  it("visitante sem sessão não alcança", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.onboarding.prontidao, {})).rejects.toThrow();
  });

  it("a consulta NÃO usa collect() — o custo não pode crescer com a conta", () => {
    // Esta consulta roda na primeira tela, toda vez, e continua rodando meses
    // depois com quarenta eventos e mil fotos. Contar mil para responder
    // "passou de cinco?" é a consulta que só dói quando a cliente já está
    // grande — que é exatamente quando ela não pode doer.
    const fonte = readFileSync("convex/onboarding.ts", "utf-8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(fonte, "voltou um collect() sem teto").not.toContain(".collect()");
    expect(fonte).toContain(".take(");
  });
});
