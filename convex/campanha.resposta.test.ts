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
import { autenticarComoDonoDaPlataforma, autenticarComoDecoradora } from "./test.auth";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { LIVE_ALTAR } from "./lib/campanha";

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRAR UMA RESPOSTA — SEM FINGIR QUE LEU O WHATSAPP
//
// ── A LINHA QUE NÃO PODE SER CRUZADA ────────────────────────────────────────
// O ALTAR não lê o aparelho de ninguém. Não há integração, e por isso não há
// "mensagem recebida": há uma pessoa registrando o que leu.
//
// Toda linha de `respostasRegistradas` tem autor humano, e a tela diz
// "registrado por você". No dia em que houver canal, a MESMA classificação
// roda sobre a mensagem de verdade — e este caminho continua, para quem
// responder por telefone.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const admin = await autenticarComoDonoDaPlataforma(t);
  const decoradora = await autenticarComoDecoradora(t);

  let n = 0;
  const interessado = (over: Record<string, unknown> = {}) => {
    n++;
    return t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("landingLeads", {
        name: `Marina Alves ${n}`,
        email: `m${n}@exemplo.com.br`,
        whatsapp: `(11) 99990-${String(n).padStart(4, "0")}`,
        whatsappE164: `+551199990${String(n).padStart(4, "0")}`,
        intent: "demo" as const,
        campanha: LIVE_ALTAR.slug,
        ...over,
      }),
    );
  };
  const ler = (id: Id<"landingLeads">) => t.run(async (ctx: MutationCtx) => ctx.db.get(id));
  const registrar = (leadId: Id<"landingLeads">, texto: string, aplicar = true) =>
    admin.mutation(api.escritorioCiclo.registrarResposta, {
      leadId,
      texto,
      aplicarSugestao: aplicar,
    });

  return { t, admin, decoradora, interessado, ler, registrar };
}

describe("o ciclo comercial se fecha", () => {
  it('"QUERO PARTICIPAR" move para interessado e guarda o e-mail', async () => {
    const { interessado, ler, registrar } = await cenario();
    const leadId = await interessado({ email: "" });

    const r = await registrar(leadId, "QUERO PARTICIPAR! meu email é marina@ateliealba.com.br");

    expect(r.intencao).toBe("quero_participar");
    expect(r.moveuPara).toBe("interessado");
    expect(r.emailGravado).toBe("marina@ateliealba.com.br");
    expect((await ler(leadId))?.email).toBe("marina@ateliealba.com.br");
  });

  it("o e-mail do cadastro NÃO é sobrescrito por um citado de passagem", async () => {
    // Trocaria um dado confirmado por um mencionado numa conversa.
    const { interessado, ler, registrar } = await cenario();
    const leadId = await interessado({ email: "oficial@exemplo.com.br" });
    await registrar(leadId, "quero participar, pode mandar pra outro@qualquer.com");
    expect((await ler(leadId))?.email).toBe("oficial@exemplo.com.br");
  });

  it("recusa move para descartado, mesmo vindo de etapa avançada", async () => {
    // `descartado` é a única que PODE andar para trás: dizer "não tenho
    // interesse" precisa poder tirar alguém de qualquer etapa.
    const { admin, interessado, ler, registrar } = await cenario();
    const leadId = await interessado();
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status: "confirmou" });

    await registrar(leadId, "na verdade não tenho interesse, obrigada");
    expect((await ler(leadId))?.status).toBe("descartado");
  });

  it("INCERTO não move ninguém — e não sugere destino", async () => {
    // "ok" pode ser "ok, quero" ou "ok, recebi". Escolher no escuro é como uma
    // sala se enche de gente que não confirmou.
    const { interessado, ler, registrar } = await cenario();
    const leadId = await interessado();
    const r = await registrar(leadId, "ok");

    expect(r.intencao).toBe("incerto");
    expect(r.estagioSugerido).toBeNull();
    expect(r.moveuPara).toBeNull();
    expect(r.precisaDeHumano).toBe(true);
    expect((await ler(leadId))?.status, "moveu no escuro").toBeUndefined();
  });

  it("sem aplicar a sugestão, só classifica", async () => {
    // É o que separa "o ALTAR entendeu" de "o ALTAR decidiu".
    const { interessado, ler, registrar } = await cenario();
    const leadId = await interessado();
    const r = await registrar(leadId, "QUERO PARTICIPAR", false);

    expect(r.intencao).toBe("quero_participar");
    expect(r.estagioSugerido).toBe("interessado");
    expect(r.moveuPara, "moveu sem pedirem").toBeNull();
    expect((await ler(leadId))?.status).toBeUndefined();
  });

  it("NUNCA rebobina quem já está mais à frente", async () => {
    const { admin, interessado, ler, registrar } = await cenario();
    const leadId = await interessado();
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status: "confirmou" });

    // "Quero participar" sugere "interessado", que está ATRÁS de "confirmou".
    await registrar(leadId, "quero participar sim!");
    expect((await ler(leadId))?.status, "voltou uma etapa").toBe("confirmou");
  });

  it("quem já é cliente não é movido por um 'obrigada'", async () => {
    const { admin, interessado, ler, registrar } = await cenario();
    const leadId = await interessado();
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status: "convertido" });
    await registrar(leadId, "não tenho interesse");
    expect((await ler(leadId))?.status).toBe("convertido");
  });

  it("o texto é gravado COM AUTOR — nunca como mensagem recebida", async () => {
    const { admin, interessado, registrar } = await cenario();
    const leadId = await interessado();
    await registrar(leadId, "QUERO PARTICIPAR");

    const hist = await admin.query(api.escritorioCiclo.respostasDe, { leadId });
    expect(hist).toHaveLength(1);
    expect(hist[0].texto).toBe("QUERO PARTICIPAR");
    expect(hist[0].registradoPorUserId, "resposta sem autor").toBeTruthy();
    expect(hist[0].estagioSugerido).toBe("interessado");
    expect(hist[0].estagioAplicado).toBe("interessado");
  });

  it("sugerido e aplicado são campos SEPARADOS", async () => {
    // É a prova de que a classificação sugere e uma pessoa decide — e permite
    // medir depois quantas vezes a sugestão foi aceita.
    const { admin, interessado, registrar } = await cenario();
    const leadId = await interessado();
    await registrar(leadId, "QUERO PARTICIPAR", false);

    const hist = await admin.query(api.escritorioCiclo.respostasDe, { leadId });
    expect(hist[0].estagioSugerido).toBe("interessado");
    expect(hist[0].estagioAplicado).toBeUndefined();
  });

  it("texto vazio e texto gigante são recusados", async () => {
    const { interessado, registrar } = await cenario();
    const leadId = await interessado();
    await expect(registrar(leadId, "   ")).rejects.toThrow(/cole o que ela respondeu/i);
    await expect(registrar(leadId, "a".repeat(5_000))).rejects.toThrow(/muito longa/i);
  });

  it("classificação desligada grava o texto e não move nada", async () => {
    // Registrar o que a pessoa disse é MEMÓRIA, não automação — desligar a
    // classificação não pode fazer o ALTAR esquecer a conversa.
    const { admin, interessado, ler, registrar } = await cenario();
    await admin.mutation(api.escritorioCiclo.definirAutonomia, {
      campanha: LIVE_ALTAR.slug,
      capacidade: "classificar_respostas",
      ligada: false,
    });
    const leadId = await interessado();

    const r = await registrar(leadId, "QUERO PARTICIPAR");
    expect(r.classificacaoAtiva).toBe(false);
    expect(r.moveuPara).toBeNull();
    expect((await ler(leadId))?.status).toBeUndefined();

    const hist = await admin.query(api.escritorioCiclo.respostasDe, { leadId });
    expect(hist, "o texto foi esquecido").toHaveLength(1);
  });

  it("decoradora não registra resposta na campanha da ALTAR", async () => {
    const { decoradora, interessado } = await cenario();
    const leadId = await interessado();
    await expect(
      decoradora.mutation(api.escritorioCiclo.registrarResposta, {
        leadId,
        texto: "QUERO PARTICIPAR",
      }),
    ).rejects.toThrow();
  });
});

describe('"Já enviei" faz a pessoa ANDAR no funil', () => {
  it("o convite marcado como enviado tira a pessoa de 'sem contato'", async () => {
    // ── O DEFEITO QUE ESTE TESTE GUARDA ───────────────────────────────────
    // Marcar "Já enviei" mexia só no rascunho. A pessoa continuava em "Novo",
    // a tela seguia dizendo "Procurou a ALTAR e ainda não teve resposta" sobre
    // alguém que acabara de receber o convite — e o ciclo prepararia OUTRO
    // convite na rodada seguinte.
    const { admin, interessado, ler } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });

    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "marcar_enviado" });

    const d = await ler(leadId);
    expect(d?.status).toBe("contatado");
    expect(d?.marcosEm?.convidado, "sem carimbo, o follow-up não tem o que subtrair").toBeTypeOf(
      "number",
    );

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.semContato).toBe(0);
    expect(f.aguardandoResposta).toBe(1);
  });

  it("e o ciclo NÃO prepara um segundo convite para ela", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "marcar_enviado" });

    const r = await admin.mutation(api.escritorioCiclo.rodarAgora, { campanha: LIVE_ALTAR.slug });
    expect(r.mensagensPreparadas, "convidou a mesma pessoa duas vezes").toBe(0);
  });

  it("um LEMBRETE enviado não move ninguém — quem o recebe já confirmou", async () => {
    const { admin, interessado, ler } = await cenario();
    const leadId = await interessado();
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status: "confirmou" });
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, {
      leadId,
      tipo: "lembrete_24h",
    });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "marcar_enviado" });

    expect((await ler(leadId))?.status).toBe("confirmou");
  });

  it("marcar enviado um convite atrasado NÃO rebobina quem já avançou", async () => {
    const { admin, interessado, ler } = await cenario();
    const leadId = await interessado();
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status: "interessado" });

    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "marcar_enviado" });
    expect((await ler(leadId))?.status, "voltou para convite enviado").toBe("interessado");
  });
});

describe("a jornada completa, com resposta registrada", () => {
  it("do convite à confirmação, sem nada sair do ALTAR", async () => {
    const { admin, interessado, ler, registrar } = await cenario();
    const leadId = await interessado({ email: "" });

    // 1. O Escritório escreve sozinho.
    const rodada = await admin.mutation(api.escritorioCiclo.rodarAgora, {
      campanha: LIVE_ALTAR.slug,
    });
    expect(rodada.mensagensPreparadas).toBe(1);

    // 2. Uma pessoa revisa, aprova e manda com o dedo dela.
    const fila = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "rascunho",
    });
    const draftId = fila.rascunhos[0]._id;
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "aprovar" });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "marcar_enviado" });
    expect((await ler(leadId))?.status).toBe("contatado");

    // 3. A resposta chega no WhatsApp dela e alguém registra.
    const r = await registrar(leadId, "QUERO PARTICIPAR — marina@ateliealba.com.br");
    expect(r.moveuPara).toBe("interessado");
    expect(r.emailGravado).toBe("marina@ateliealba.com.br");

    // 4. Confirma presença.
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status: "confirmou" });

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.convidados).toBe(1);
    expect(f.respostas).toBe(1);
    expect(f.interessados).toBe(1);
    expect(f.confirmados).toBe(1);

    // 5. E nada saiu: a aba de enviadas só tem o que uma pessoa marcou.
    const enviadas = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "enviado_manualmente",
    });
    expect(enviadas.rascunhos).toHaveLength(1);
    expect(enviadas.rascunhos[0].decididoPorUserId, "envio sem autor humano").toBeTruthy();
  });
});
