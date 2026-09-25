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
import { autenticarComoAdmin } from "./test.auth";
import type { MutationCtx } from "./_generated/server";
import { LIVE_ALTAR } from "./lib/campanha";

// ═════════════════════════════════════════════════════════════════════════════
// A JORNADA INTEIRA, DE UMA PESSOA SÓ
//
// ── POR QUE ESTE TESTE EXISTE, SE JÁ HÁ DEZENAS ─────────────────────────────
// Os outros provam que cada peça funciona. Este prova que elas se LIGAM — que
// mover a etapa faz o funil mudar, que o rascunho preparado aparece no
// briefing, que aprovar não muda a contagem de enviados.
//
// É a diferença entre um motor que gira na bancada e um carro que anda. Cada
// peça passando no seu teste é condição necessária e não suficiente: o defeito
// que derruba uma demonstração quase sempre mora na junta.
//
// ── E É O ROTEIRO DA NOITE DA LIVE ──────────────────────────────────────────
// A sequência abaixo é literalmente o que uma pessoa vai fazer entre hoje e a
// semana seguinte à apresentação. Se este teste passar, aquele caminho existe.
// ═════════════════════════════════════════════════════════════════════════════

describe("do primeiro contato até o cliente", () => {
  it("a jornada inteira, com o funil acompanhando cada passo", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    // ── 1. A CAMPANHA EXISTE, E SE APRESENTA ────────────────────────────
    const inicio = await admin.query(api.comercialBriefing.hoje, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(inicio.campanha?.nome).toBe("Apresentação ALTAR — 06/10/2026");
    expect(inicio.campanha?.data).toBe("2026-10-06");
    expect(inicio.campanha?.hora).toBe("19:00");
    // Não há sala. A tela diz isso em vez de mostrar um campo vazio.
    expect(inicio.campanha?.linkDefinido).toBe(false);
    expect(inicio.resumo).toMatch(/ainda não há ninguém/i);

    // ── 2. UMA PESSOA CHEGA ─────────────────────────────────────────────
    const leadId = await t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("landingLeads", {
        name: "Marina Alves",
        email: "marina@exemplo.com.br",
        whatsapp: "(11) 99990-0042",
        whatsappE164: "+5511999900042",
        empresa: "Ateliê Flor de Lis",
        intent: "demo" as const,
        campanha: LIVE_ALTAR.slug,
      }),
    );

    // ── 3. A BUSCA A ENCONTRA, PELOS QUATRO CAMINHOS ────────────────────
    for (const termo of [
      "Marina Alves",
      "Ateliê Flor de Lis",
      "(11) 99990-0042",
      "marina@exemplo.com.br",
    ]) {
      const r = await admin.query(api.admin.buscarInteressados, {
        termo,
        campanha: LIVE_ALTAR.slug,
      });
      expect(r.resultados.map((p) => p._id), `"${termo}" não achou`).toContain(leadId);
    }

    // ── 4. O ALTAR ESCREVE O CONVITE ────────────────────────────────────
    const convite = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });

    const comRascunho = await admin.query(api.comercialBriefing.hoje, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(comRascunho.preparado[0].rotulo).toBe("1 convite");

    // Preparar de novo NÃO duplica: ela receberia a mesma mensagem duas vezes.
    expect(await admin.mutation(api.campanhaRascunhos.preparar, { leadId })).toBe(convite);

    // ── 5. UMA PESSOA REVISA, EDITA E APROVA ────────────────────────────
    const fila = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "rascunho",
    });
    expect(fila.rascunhos[0].texto).toContain("Marina");
    expect(fila.rascunhos[0].texto).toContain("QUERO PARTICIPAR");
    expect(fila.rascunhos[0].pendencias, "o convite não depende do link").toEqual([]);

    await admin.mutation(api.campanhaRascunhos.editarTexto, {
      draftId: convite,
      texto: "Oi Marina! Texto revisado por uma pessoa.",
    });
    await admin.mutation(api.campanhaRascunhos.decidir, {
      draftId: convite,
      decisao: "aprovar",
    });

    // APROVAR NÃO É ENVIAR. É a linha que separa este produto de um
    // disparador, e ela precisa ser verificável.
    const aprovados = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "aprovado",
    });
    expect(aprovados.rascunhos[0].status).toBe("aprovado");
    expect(aprovados.rascunhos[0].enviadoEm, "aprovar marcou envio").toBeUndefined();
    expect(aprovados.rascunhos[0].decididoPorUserId, "aprovação sem autor").toBeTruthy();

    const enviadosAinda = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "enviado_manualmente",
    });
    expect(enviadosAinda.rascunhos, "aprovado entrou como enviado").toHaveLength(0);

    // ── 6. A PESSOA MANDA, COM O DEDO DELA, E ANOTA ─────────────────────
    await admin.mutation(api.campanhaRascunhos.decidir, {
      draftId: convite,
      decisao: "marcar_enviado",
    });
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status: "contatado" });

    const enviados = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "enviado_manualmente",
    });
    expect(enviados.rascunhos[0].enviadoEm).toBeTypeOf("number");

    const convidada = await admin.query(api.admin.funilDaCampanha, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(convidada.convidados).toBe(1);
    expect(convidada.aguardandoResposta).toBe(1);
    // Com base 1, nenhuma porcentagem: um em um não é "100% de resposta".
    expect(convidada.taxas.find((x) => x.chave === "resposta")?.percentual).toBeNull();

    // ── 7. ELA RESPONDE, CONFIRMA, PARTICIPA E VIRA CLIENTE ─────────────
    for (const status of [
      "respondeu",
      "interessado",
      "confirmou",
      "participou",
      "testando",
      "convertido",
    ] as const) {
      await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status });
    }

    const fim = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(fim.total).toBe(1);
    expect(fim.clientes).toBe(1);
    // Os acumulados NÃO encolhem: ela passou por cada marco, e os carimbos
    // guardam isso mesmo estando hoje em "convertido".
    expect(fim.convidados).toBe(1);
    expect(fim.respostas).toBe(1);
    expect(fim.confirmados).toBe(1);
    expect(fim.participaram).toBe(1);

    // ── 8. E SAI DA CAMPANHA DE AQUISIÇÃO ───────────────────────────────
    // Continuar abordando quem assinou faz o cliente novo receber convite para
    // conhecer o produto que acabou de comprar.
    await expect(
      admin.mutation(api.campanhaRascunhos.preparar, { leadId }),
    ).rejects.toThrow(/já é cliente/i);
  });

  it("quem precisa de gente aparece na fila, com nome e sugestão", async () => {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);

    await t.run(async (ctx: MutationCtx) => {
      // Sem canal: é buraco de cadastro, e buraco de cadastro é decisão de
      // gente — procurar no Instagram, perguntar a quem indicou, ou descartar.
      await ctx.db.insert("landingLeads", {
        name: "Sem Telefone",
        email: "",
        intent: "demo" as const,
        campanha: LIVE_ALTAR.slug,
      });
      // Duas sócias dividindo o telefone do escritório: possível duplicidade,
      // e o ALTAR aponta sem nunca fundir.
      for (const nome of ["Ana Beatriz Reis", "Ana B. Reis"]) {
        await ctx.db.insert("landingLeads", {
          name: nome,
          email: `${nome.replace(/\W/g, "")}@exemplo.com.br`,
          whatsapp: "(11) 98888-7777",
          whatsappE164: "+5511988887777",
          intent: "demo" as const,
          campanha: LIVE_ALTAR.slug,
        });
      }
    });

    const b = await admin.query(api.comercialBriefing.hoje, { campanha: LIVE_ALTAR.slug });

    const semCanal = b.precisaDeVoce.find((p) => p.pessoa === "Sem Telefone");
    expect(semCanal?.motivo).toMatch(/telefone nem e-mail/i);
    expect(semCanal?.sugestao).toBeTruthy();

    const duplicidade = b.precisaDeVoce.find((p) => p.chave.startsWith("duplicidade."));
    expect(duplicidade?.motivo).toMatch(/mesmo telefone/i);
    expect(duplicidade?.sugestao, "o ALTAR não funde").toMatch(/conferir e decidir/i);
    expect(b.duplicidades[0].forca).toBe("alta");
  });
});
