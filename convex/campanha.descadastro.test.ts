import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { autenticarComoDonoDaPlataforma, autenticarComoDecoradora } from "./test.auth";
import type { MutationCtx } from "./_generated/server";
import { LIVE_ALTAR } from "./lib/campanha";
import { classificarResposta } from "./lib/respostaDoInteressado";
import { proximaAcao } from "./lib/proximaAcao";

// ═════════════════════════════════════════════════════════════════════════════
// "ME TIRA DA LISTA" — CONSENTIMENTO NÃO É UMA ETAPA DO FUNIL
//
// Até 28/09, quem pedia para não receber mais nada só saía do funil se alguém
// aplicasse a sugestão do classificador COM a autonomia ligada. Até lá, o
// ciclo das 07:30 preparava o próximo lembrete para ela. O que precisa ser
// verdade agora: o pedido é reconhecido, gravado sempre, e nenhuma porta —
// sugestão, escolha à mão, lote, aprovação, ciclo — prepara ou libera
// mensagem para essa pessoa.
// ═════════════════════════════════════════════════════════════════════════════

describe("o classificador separa 'sem interesse' de 'não me mande'", () => {
  it.each([
    "Me tira da lista, por favor",
    "Não me mande mais mensagens",
    "não quero receber isso",
    "PARE DE ME MANDAR",
    "quero descadastrar",
    "Remova meu número",
  ])("%j é pedido de silêncio", (texto) => {
    expect(classificarResposta(texto).pediuParaSair).toBe(true);
  });

  it.each([
    "Não tenho interesse",
    "Vou sair mais cedo do evento, mas quero participar",
    "QUERO PARTICIPAR",
    "Não vou poder participar",
    "ok",
  ])("%j NÃO é pedido de silêncio", (texto) => {
    expect(classificarResposta(texto).pediuParaSair).toBe(false);
  });
});

describe("a regra da próxima ação", () => {
  it("o pedido de silêncio vence tudo — inclusive quem está no auge do funil", () => {
    for (const status of ["confirmou", "testando", "convertido", undefined]) {
      const a = proximaAcao({ status, temCanal: true, descadastrado: true, procurouOAltar: true });
      expect(a).toMatchObject({ mensagem: null, urgencia: "nenhuma", acao: "Não enviar mensagens" });
    }
  });
});

describe("no banco: nenhuma porta reabre", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  async function cenario() {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoDonoDaPlataforma(t);
    const decoradora = await autenticarComoDecoradora(t);
    const leadId = await t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("landingLeads", {
        name: "Marina Alves", email: "marina@exemplo.com.br", whatsapp: "(11) 99990-0001",
        whatsappE164: "+5511999900001", intent: "demo", campanha: LIVE_ALTAR.slug,
      }),
    );
    const lead = () => t.run((ctx) => ctx.db.get(leadId));
    const rascunhos = () =>
      t.run((ctx) =>
        ctx.db.query("campaignDrafts").withIndex("by_lead", (q) => q.eq("landingLeadId", leadId)).collect(),
      );
    return { t, admin, decoradora, leadId, lead, rascunhos };
  }

  it("registrar 'me tira da lista' grava o pedido MESMO com a classificação desligada", async () => {
    const { admin, leadId, lead } = await cenario();
    await admin.mutation(api.escritorioCiclo.definirAutonomia, {
      campanha: LIVE_ALTAR.slug, capacidade: "classificar_respostas", ligada: false,
    });
    const r = await admin.mutation(api.escritorioCiclo.registrarResposta, {
      leadId, texto: "Oi, me tira da lista por favor",
    });
    expect(r.descadastrou).toBe(true);
    expect(r.moveuPara).toBeNull(); // o estágio NÃO se move sozinho
    expect((await lead())?.descadastradoEm).toBeTypeOf("number");
  });

  it("nem sugestão, nem tipo escolhido à mão, nem lote preparam mensagem", async () => {
    const { admin, leadId, rascunhos } = await cenario();
    await admin.mutation(api.admin.definirDescadastro, { leadId, descadastrado: true });

    await expect(admin.mutation(api.campanhaRascunhos.preparar, { leadId })).rejects.toThrow(
      /não receber mensagens/,
    );
    await expect(
      admin.mutation(api.campanhaRascunhos.preparar, { leadId, tipo: "convite" }),
    ).rejects.toThrow();
    await admin.mutation(api.campanhaRascunhos.prepararPendentes, { campanha: LIVE_ALTAR.slug });
    expect(await rascunhos()).toEqual([]);
  });

  it("o ciclo automático das 07:30 também não prepara nada para ela", async () => {
    const { t, admin, leadId, rascunhos } = await cenario();
    await admin.mutation(api.admin.definirDescadastro, { leadId, descadastrado: true });
    await t.mutation(internal.escritorioCiclo.rodarPeloSistema, {});
    expect(await rascunhos()).toEqual([]);
  });

  it("rascunho feito ANTES do pedido não pode ser aprovado nem marcado enviado — só descartado", async () => {
    const { admin, leadId, rascunhos } = await cenario();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId, tipo: "convite" });
    await admin.mutation(api.admin.definirDescadastro, { leadId, descadastrado: true });

    for (const decisao of ["aprovar", "marcar_enviado"] as const) {
      await expect(
        admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao }),
      ).rejects.toThrow(/não receber mensagens/);
    }
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "descartar" });
    expect((await rascunhos())[0].status).toBe("descartado");
  });

  it("desfazer volta o campo a AUSENTE; a decoradora não mexe em nada disso", async () => {
    const { admin, decoradora, leadId, lead } = await cenario();
    await admin.mutation(api.admin.definirDescadastro, { leadId, descadastrado: true });
    await admin.mutation(api.admin.definirDescadastro, { leadId, descadastrado: false });
    expect((await lead())?.descadastradoEm).toBeUndefined();
    await expect(
      decoradora.mutation(api.admin.definirDescadastro, { leadId, descadastrado: true }),
    ).rejects.toThrow();
    expect((await lead())?.descadastradoEm).toBeUndefined();
  });
});
