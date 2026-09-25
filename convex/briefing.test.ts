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
import { api } from "./_generated/api";
import { autenticarComoAdmin, autenticarComoDecoradora } from "./test.auth";
import type { MutationCtx } from "./_generated/server";
import { LIVE_ALTAR } from "./lib/campanha";
import {
  AREAS,
  ITENS_EM_DESTAQUE,
  montarBriefing,
  saudacaoPara,
  type FatosDoBriefing,
} from "./lib/assistente/briefing";
import { possiveisDuplicados } from "./lib/duplicidade";
import { dataEmDias } from "./lib/dataDoDia";

// ═════════════════════════════════════════════════════════════════════════════
// O BRIEFING DA MANHÃ
//
// O que estes testes guardam é a diferença entre um briefing e um feed: um
// briefing PRIORIZA e tem fim; um feed mostra tudo e deixa a priorização para
// quem lê — que é exatamente o trabalho que ninguém faz às oito da manhã.
//
// E guardam a regra que sustenta a confiança nele: o briefing nunca afirma o
// que não mediu, e nunca anuncia trabalho que não fez.
// ═════════════════════════════════════════════════════════════════════════════

describe("a regra do briefing do Assistente", () => {
  it("área não medida NÃO vira zero", () => {
    // Anunciar zero sobre uma área que ninguém olhou é o jeito mais fácil de
    // um briefing dizer "está tudo bem" sobre um buraco.
    const b = montarBriefing({}, 9);
    expect(b.areasNaoMedidas.sort()).toEqual([...AREAS].sort());
    expect(b.resumo).toMatch(/não consegui olhar/i);
    expect(b.itens).toHaveLength(0);
  });

  it("medido e vazio diz que está tudo em dia", () => {
    const fatos: FatosDoBriefing = {
      financeiro: { recebimentosVencidos: 0, pagamentosVencidos: 0 },
      comercial: { semProximaAcao: 0, paradas: 0, propostasAguardando: 0 },
      eventos: { urgentes: [], emAtencao: 0 },
      compras: { atrasadas: 0, aguardandoEntrega: 0, foraDoCaixa: 0 },
      fornecedores: { aguardandoConfirmacao: 0, acoesPendentes: 0 },
      acervo: { naoRetornado: 0, deficit: 0 },
    };
    const b = montarBriefing(fatos, 9);
    expect(b.tudoEmDia).toBe(true);
    expect(b.resumo).toMatch(/nada pedindo você/i);
    expect(b.areasNaoMedidas).toHaveLength(0);
  });

  it("crítico vem antes de atenção, e o maior número antes do menor", () => {
    const b = montarBriefing(
      {
        financeiro: { recebimentosVencidos: 2, pagamentosVencidos: 0, valorVencido: 5000 },
        comercial: { semProximaAcao: 9, paradas: 5, propostasAguardando: 0 },
        compras: { atrasadas: 1, aguardandoEntrega: 0, foraDoCaixa: 0 },
      },
      9,
    );
    expect(b.itens[0].gravidade).toBe("critico");
    const criticos = b.itens.filter((i) => i.gravidade === "critico");
    expect(criticos.map((i) => i.quantidade)).toEqual([2, 1]);
    // Os comerciais são "atenção" e vêm depois, mesmo sendo números maiores.
    expect(b.itens[b.itens.length - 1].gravidade).not.toBe("critico");
  });

  it("informativo NÃO entra na contagem de coisas a fazer", () => {
    // Uma tela em que tudo é alerta é uma tela em que nada é. "Próxima ação
    // anotada" é o sistema mostrando o que ela mesma escreveu — não é
    // trabalho novo.
    const b = montarBriefing(
      { fornecedores: { aguardandoConfirmacao: 0, acoesPendentes: 4 } },
      9,
    );
    expect(b.contagem.informativo).toBe(1);
    expect(b.tudoEmDia, "informativo não é coisa a fazer").toBe(true);
    expect(b.resumo).toMatch(/nada pedindo você/i);
  });

  it("todo item carrega o número que o gerou", () => {
    // "Algumas pendências" é o tipo de frase que ninguém consegue conferir.
    const b = montarBriefing(
      {
        financeiro: { recebimentosVencidos: 3, pagamentosVencidos: 1 },
        compras: { atrasadas: 2, aguardandoEntrega: 4, foraDoCaixa: 1 },
      },
      9,
    );
    for (const item of b.itens) {
      expect(item.titulo, item.chave).toMatch(/\d/);
      expect(item.quantidade).toBeGreaterThan(0);
      expect(item.destino).toMatch(/^\//);
    }
  });

  it("o total vencido só aparece quando é legível", () => {
    // Somar ignorando um valor ilegível produz um total MENOR do que o real —
    // pior do que não mostrar total nenhum.
    const com = montarBriefing(
      { financeiro: { recebimentosVencidos: 2, pagamentosVencidos: 0, valorVencido: 1234.5 } },
      9,
    );
    expect(com.itens[0].detalhe).toContain("1.234,50");

    const sem = montarBriefing(
      { financeiro: { recebimentosVencidos: 2, pagamentosVencidos: 0 } },
      9,
    );
    expect(sem.itens[0].detalhe).toMatch(/sem valor legível/i);
  });

  it("evento urgente é NOMEADO, e o prazo é dito em português", () => {
    const b = montarBriefing(
      {
        eventos: {
          urgentes: [
            { nome: "Marina & Gabriel", diasAte: 0, motivo: "3 compras atrasadas" },
            { nome: "Festa Lopes", diasAte: 1, motivo: "contrato não anexado" },
            { nome: "Aniversário Rui", diasAte: -2, motivo: "peça não voltou" },
          ],
          emAtencao: 4,
        },
      },
      9,
    );
    expect(b.itens[0].titulo).toBe("Marina & Gabriel");
    expect(b.itens[0].detalhe).toContain("é hoje");
    expect(b.itens[1].detalhe).toContain("em 1 dia");
    expect(b.itens[2].detalhe).toContain("já passou");
  });

  it("'precisa de você' é DECISÃO, não execução", () => {
    // "2 recebimentos vencidos" é crítico e é execução (cobrar). "Proposta
    // aguardando resposta" é decisão comercial. Misturar enche a fila de
    // decisões com tarefa.
    const b = montarBriefing(
      {
        financeiro: { recebimentosVencidos: 2, pagamentosVencidos: 0 },
        comercial: { semProximaAcao: 0, paradas: 0, propostasAguardando: 3 },
      },
      9,
    );
    expect(b.precisamDeVoce.map((i) => i.chave)).toEqual(["comercial.propostas"]);
  });

  it("o briefing não anuncia rascunho que não preparou", () => {
    // O Assistente da decoradora não escreve mensagem para cliente dela em
    // lote. Dizer "preparei 5 rascunhos" seria anunciar trabalho inexistente.
    const b = montarBriefing({ financeiro: { recebimentosVencidos: 1, pagamentosVencidos: 0 } }, 9);
    for (const linha of b.trabalhoApurado) {
      expect(linha.toLowerCase()).not.toMatch(/rascunho|preparei|escrevi|enviei/);
    }
  });

  it("a saudação segue a hora de quem abre", () => {
    expect(saudacaoPara(6)).toBe("Bom dia");
    expect(saudacaoPara(11)).toBe("Bom dia");
    expect(saudacaoPara(12)).toBe("Boa tarde");
    expect(saudacaoPara(17)).toBe("Boa tarde");
    expect(saudacaoPara(18)).toBe("Boa noite");
    expect(saudacaoPara(23)).toBe("Boa noite");
  });

  it("o destaque tem fim — não é feed", () => {
    expect(ITENS_EM_DESTAQUE).toBeLessThanOrEqual(6);
  });
});

describe("o briefing lê os dados reais da conta", () => {
  it("vencido, funil e compras chegam ao briefing", async () => {
    const t = convexTest(schema, modules);
    const decoradora = await autenticarComoDecoradora(t);
    const userId = await decoradora.run(async (ctx: MutationCtx) => {
      const u = (await ctx.db.query("users").first())!;
      await ctx.db.insert("transactions", {
        userId: u._id,
        type: "income",
        category: "Sinal",
        description: "Entrada do casamento",
        amount: 3000,
        date: dataEmDias(-5),
        isPaid: false,
      });
      await ctx.db.insert("leads", {
        userId: u._id,
        clientName: "Noiva Sem Retorno",
        stage: "contacted",
        order: 0,
      });
      return u._id;
    });
    expect(userId).toBeTruthy();

    const b = await decoradora.query(api.assistenteBriefing.daManha, { hora: 9 });
    const chaves = b.itens.map((i) => i.chave);
    expect(chaves).toContain("financeiro.receber");
    expect(b.itens.find((i) => i.chave === "financeiro.receber")?.quantidade).toBe(1);
    expect(chaves).toContain("comercial.sem_acao");
    expect(b.tudoEmDia).toBe(false);
  });

  it("conta vazia diz que está em dia — não devolve nada inventado", async () => {
    const t = convexTest(schema, modules);
    const decoradora = await autenticarComoDecoradora(t);
    const b = await decoradora.query(api.assistenteBriefing.daManha, { hora: 15 });
    expect(b.tudoEmDia).toBe(true);
    expect(b.saudacao).toBe("Boa tarde");
    expect(b.itens).toHaveLength(0);
  });

  it("visitante sem sessão não alcança o briefing", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.assistenteBriefing.daManha, {})).rejects.toThrow();
  });

  it("uma conta NUNCA vê o dia da outra", async () => {
    const t = convexTest(schema, modules);
    const a = await autenticarComoDecoradora(t);
    await a.run(async (ctx: MutationCtx) => {
      const u = (await ctx.db.query("users").first())!;
      await ctx.db.insert("transactions", {
        userId: u._id,
        type: "income",
        category: "Sinal",
        description: "Da conta A",
        amount: 9999,
        date: dataEmDias(-10),
        isPaid: false,
      });
    });

    const b = await autenticarComoAdmin(t);
    const briefingDeB = await b.query(api.assistenteBriefing.daManha, { hora: 9 });
    expect(briefingDeB.itens.map((i) => i.chave)).not.toContain("financeiro.receber");
  });
});

describe("o briefing comercial da campanha", () => {
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

  it("campanha vazia não inventa números", async () => {
    const { admin } = await cenario();
    const b = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });
    expect(b.resumo).toMatch(/ainda não há ninguém/i);
    expect(b.hoje).toHaveLength(0);
    expect(b.preparado, "não preparou nada, e não diz que preparou").toHaveLength(0);
  });

  it("'preparei' só aparece quando há rascunho gravado", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();

    const antes = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });
    expect(antes.preparado).toHaveLength(0);

    await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    const depois = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });
    expect(depois.preparado).toHaveLength(1);
    expect(depois.preparado[0].rotulo).toBe("1 convite");
  });

  it("aprovado NÃO é enviado, e a frase diz isso", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "aprovar" });

    const b = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });
    const linha = b.preparado.find((l) => l.chave === "preparado.aprovados");
    expect(linha?.rotulo).toMatch(/esperando você enviar/i);
  });

  it("quem não tem canal cai na fila humana, com nome e sugestão", async () => {
    const { admin, interessado } = await cenario();
    await interessado({ name: "Sem Contato", whatsapp: undefined, email: "" });
    const b = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });
    expect(b.precisaDeVoce).toHaveLength(1);
    expect(b.precisaDeVoce[0].pessoa).toBe("Sem Contato");
    expect(b.precisaDeVoce[0].motivo).toMatch(/telefone nem e-mail/i);
  });

  it("a campanha sem link de sala DECLARA que não tem", async () => {
    const { admin } = await cenario();
    const b = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });
    expect(b.campanha?.linkDefinido).toBe(false);
  });

  it("decoradora não alcança o briefing comercial da ALTAR", async () => {
    const { decoradora } = await cenario();
    await expect(
      decoradora.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
  });
});

describe("possível duplicidade — apontar, nunca fundir", () => {
  const r = (over: Record<string, unknown>) => ({ _id: "x", name: "Ana Silva", ...over }) as never;

  it("mesmo telefone é suspeita ALTA", () => {
    const s = possiveisDuplicados([
      r({ _id: "a", name: "Ana Silva", whatsappE164: "+5511999998888" }),
      r({ _id: "b", name: "Ana S.", whatsappE164: "+5511999998888" }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].forca).toBe("alta");
    expect(s[0].ids).toEqual(["a", "b"]);
  });

  it("um par que bate por DOIS motivos entra pelo mais forte", () => {
    // ── O DEFEITO QUE ESTE TESTE GUARDA ───────────────────────────────────
    // O par é registrado uma vez, pelo primeiro grupo que o encontra. Confiar
    // na ordem de inserção do Map parecia funcionar: as chaves de registros
    // diferentes se intercalam, e o par podia ser achado primeiro pelo grupo
    // de NOME — entrando como suspeita "baixa" quando é quase certeza, e indo
    // para o fim de uma lista que ninguém lê até o fim.
    const s = possiveisDuplicados([
      r({ _id: "z1", name: "Outra Pessoa", email: "outra@ex.com" }),
      r({ _id: "z2", name: "Outra Pessoa", email: "diferente@ex.com" }),
      r({ _id: "a1", name: "Ana Silva", whatsappE164: "+5511999998888" }),
      r({ _id: "a2", name: "Ana Silva", whatsappE164: "+5511999998888" }),
    ]);
    const parDaAna = s.find((x) => x.ids[0] === "a1");
    expect(parDaAna?.forca, "entrou pelo sinal fraco").toBe("alta");
    expect(s[0].forca, "o mais forte vem primeiro").toBe("alta");
  });

  it("nome de UMA palavra não gera suspeita", () => {
    // "Ana" casa com meio mundo. Abaixo de duas palavras o sinal é ruído.
    expect(possiveisDuplicados([r({ _id: "a", name: "Ana" }), r({ _id: "b", name: "Ana" })])).toEqual(
      [],
    );
  });

  it("telefone diferente e nome diferente não é suspeita", () => {
    expect(
      possiveisDuplicados([
        r({ _id: "a", name: "Ana Silva", whatsappE164: "+5511999998888" }),
        r({ _id: "b", name: "Bia Costa", whatsappE164: "+5511777776666" }),
      ]),
    ).toEqual([]);
  });

  it("o mesmo par nunca aparece duas vezes", () => {
    const s = possiveisDuplicados([
      r({ _id: "a", name: "Ana Silva", email: "a@ex.com", whatsappE164: "+5511999998888" }),
      r({ _id: "b", name: "Ana Silva", email: "a@ex.com", whatsappE164: "+5511999998888" }),
    ]);
    expect(s).toHaveLength(1);
  });

  it("lista vazia e lista de um não quebram", () => {
    expect(possiveisDuplicados([])).toEqual([]);
    expect(possiveisDuplicados([r({ _id: "a" })])).toEqual([]);
  });

  it("o custo NÃO é quadrático — mil registros distintos passam rápido", () => {
    // Comparar todo mundo com todo mundo são quinhentas mil comparações a cada
    // abertura de tela. O agrupamento por chave é linear.
    const muitos = Array.from({ length: 1000 }, (_, i) =>
      r({ _id: `id${i}`, name: `Pessoa ${i}`, whatsappE164: `+551199999${String(i).padStart(4, "0")}` }),
    );
    const inicio = Date.now();
    expect(possiveisDuplicados(muitos)).toEqual([]);
    expect(Date.now() - inicio).toBeLessThan(500);
  });
});
