import { afterEach, describe, expect, it, vi } from "vitest";

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
import { lerFonte } from "./assistenteExecutor";
import { agentePorId, ROTULO_DA_FONTE } from "./lib/assistente/agentes";
import { planoDeConsulta } from "./lib/assistente/plano";
import { rotear } from "./lib/assistente/roteamento";
import { redigirLocalmente, type FatoColetado } from "./lib/assistente/redacao";

// ═════════════════════════════════════════════════════════════════════════════
// A PERGUNTA DO BLOCO 7, ATRAVESSANDO A DEMO
//
// ── O DEFEITO QUE ESTE ARQUIVO EXISTE PARA NÃO DEIXAR VOLTAR ────────────────
// Na homologação da release de 28/09, em produção, "O que precisa da minha
// atenção hoje?" foi para a Gestão — certo — e a Gestão leu UMA fonte:
// "Eventos que pedem atenção". Respondeu "não há eventos pedindo atenção"
// com três recebimentos vencidos no briefing logo acima, na mesma tela.
//
// Nenhum teste pegou, porque os testes do Assistente provavam ROTEAMENTO e
// PERMISSÃO — que estavam certos — e nenhum provava QUAIS DADOS a pergunta
// alcançava. Este arquivo prova o que a plateia vai ver: a pergunta, com a
// demo semeada, chegando no dinheiro vencido.
//
// A redação é a por regra (`redigirLocalmente`), que é exatamente a que sai
// quando o modelo cai. Se ela acha o vencido, o modelo recebeu o vencido.
// ═════════════════════════════════════════════════════════════════════════════

const original = process.env.ALTAR_DEMO;
afterEach(() => {
  if (original === undefined) delete process.env.ALTAR_DEMO;
  else process.env.ALTAR_DEMO = original;
});

async function comADemo() {
  process.env.ALTAR_DEMO = "1";
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@demo.exemplo", role: "user", subject: "auth|aurora",
  });
  const r = await t.mutation(internal.demo.seed, {});
  expect(r.criado, "o seed não rodou — o resto deste arquivo não significaria nada").toBe(true);
  return dona;
}

/** O caminho do executor, sem o modelo: rota → plano → leitura → redação. */
async function perguntar(
  dona: Awaited<ReturnType<typeof comADemo>>,
  pergunta: string,
) {
  const { agenteId } = rotear(pergunta);
  const agente = agentePorId(agenteId)!;
  const fontes = planoDeConsulta(pergunta, agente);
  const fatos: FatoColetado[] = [];
  for (const fonte of fontes) {
    fatos.push({
      fonte,
      rotulo: ROTULO_DA_FONTE[fonte],
      // A leitura passa pela sessão da dona: o mesmo guarda de conta que o
      // executor herda quando chama as consultas com a identidade dela.
      dados: await lerFonte({ runQuery: dona.query } as never, fonte),
    });
  }
  return { agenteId, fontes, resposta: redigirLocalmente(agente, pergunta, fatos, "verde") };
}

describe("bloco 7 — 'o que precisa da minha atenção?' com a demo semeada", () => {
  for (const pergunta of [
    "O que precisa da minha atenção?", // a redação homologada do roteiro
    "O que precisa da minha atenção hoje?", // a que foi feita em produção
    "Organize meu dia.", // a reserva do roteiro
  ]) {
    it(`"${pergunta}" chega no dinheiro vencido`, async () => {
      const dona = await comADemo();
      const { agenteId, fontes, resposta } = await perguntar(dona, pergunta);

      expect(agenteId).toBe("gestao");
      expect(fontes, "a Gestão voltou a estreitar a pergunta ampla").toContain(
        "financeiro.vencidos",
      );
      expect(fontes).toContain("eventos.atencao");
      expect(fontes).toContain("compras.panorama");

      // O mapa da demo: duas cobranças vencidas (Sofia & Tomás, Lume) e uma
      // despesa vencida (Flores de Aurora). A resposta tem de nomear as duas
      // coisas — "Nada vencido" aqui é exatamente o defeito de 28/09.
      expect(resposta).toMatch(/Vencidos: \d+ a receber/);
      expect(resposta).toMatch(/a pagar/);
      expect(resposta).not.toContain("Nada vencido");
    });
  }

  it("o vencido que o Assistente lê é o mesmo que o Financeiro mostra", async () => {
    // Uma versão só da verdade: se o Assistente dissesse "2 vencidos" e o
    // Financeiro "3", a plateia veria o produto se contradizendo em dois
    // cliques.
    const dona = await comADemo();
    const doFinanceiro = await dona.query(api.financeiro.getVencidos, {});
    const { resposta } = await perguntar(dona, "O que precisa da minha atenção?");
    expect(resposta).toContain(`Vencidos: ${doFinanceiro.aReceber.quantidade} a receber`);
  });

  it("pergunta específica à Gestão mantém o assunto e ganha o panorama", async () => {
    // "financeiro" + "evento" são duas áreas → Gestão. O que ela citou vem
    // primeiro e não pode cair no teto de fontes.
    const dona = await comADemo();
    const { agenteId, fontes } = await perguntar(dona, "Como está o financeiro dos eventos?");
    expect(agenteId).toBe("gestao");
    expect(fontes[0]).toBe("financeiro.resumo");
    expect(fontes).toContain("financeiro.vencidos");
  });
});

describe("outra conta não enxerga a demo pelo Assistente", () => {
  it("a mesma pergunta, logada em outra conta, não acha vencido nenhum", async () => {
    process.env.ALTAR_DEMO = "1";
    const t = convexTest(schema, modules);
    await autenticarComo(t, {
      nome: "Aurora", email: "aurora@demo.exemplo", role: "user", subject: "auth|aurora",
    });
    await t.mutation(internal.demo.seed, {});
    const outra = await autenticarComo(t, {
      nome: "Rival", email: "rival@ex.com", role: "user", subject: "auth|rival",
    });
    const { resposta } = await perguntar(
      outra as Awaited<ReturnType<typeof comADemo>>,
      "O que precisa da minha atenção?",
    );
    expect(resposta).toContain("Nada vencido");
  });
});
