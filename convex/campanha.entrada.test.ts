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
import type { Id } from "./_generated/dataModel";
import { LIVE_ALTAR, procurouOAltar } from "./lib/campanha";

// ═════════════════════════════════════════════════════════════════════════════
// DO PAINEL PARA A CAMPANHA — A PONTE QUE NÃO EXISTIA
//
// ── A LACUNA REAL, ENCONTRADA EM HOMOLOGAÇÃO ────────────────────────────────
// O Painel Admin dizia "10 interessados, 9 sem contato". A `/campanha` dizia
// "ninguém aqui, importe uma lista". Duas telas lendo o mesmo banco e
// discordando.
//
// A causa: quem chega pela landing sem `?campanha=` fica com `campanha`
// ausente, e `/campanha` lê por índice `by_campanha`. Não era bug — era a
// ponte que nunca foi construída.
//
// E a saída que a tela sugeria era a pior possível: importar uma lista criaria
// AS MESMAS PESSOAS de novo.
//
// ── O QUE ESTES TESTES GUARDAM ──────────────────────────────────────────────
// Que adicionar à campanha grava UM campo e não toca em mais nada. Etapa,
// origem, carimbos e observações são trabalho já feito — e uma ação que os
// apagasse ainda diria "adicionado com sucesso".
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const admin = await autenticarComoAdmin(t);
  const decoradora = await autenticarComoDecoradora(t);

  const interessado = (over: Record<string, unknown> = {}) =>
    t.run(async (ctx: MutationCtx) =>
      ctx.db.insert("landingLeads", {
        name: "Marina Alves",
        email: `m${Math.random()}@exemplo.com.br`,
        whatsapp: "(11) 99990-0042",
        whatsappE164: "+5511999900042",
        intent: "demo" as const,
        ...over,
      }),
    );

  /**
   * Relê um interessado do banco.
   *
   * Tipado com `Id<"landingLeads">` de propósito: um `never` com cast na
   * chamada faria `ctx.db.get` devolver a união de TODAS as tabelas, e as
   * asserções sobre `origem` e `status` deixariam de ser verificadas pelo
   * compilador — que é exatamente o que elas existem para provar.
   */
  const ler = (id: Id<"landingLeads">) =>
    t.run(async (ctx: MutationCtx) => ctx.db.get(id));

  return { t, admin, decoradora, interessado, ler };
}

describe("interessado → campanha", () => {
  it("um interessado da landing entra na campanha e passa a aparecer nela", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();

    const antes = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(antes.total, "a campanha começa vazia").toBe(0);

    const r = await admin.mutation(api.admin.adicionarACampanha, {
      leadId,
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.resultado).toBe("adicionado");

    const depois = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(depois.total).toBe(1);

    // E aparece na LISTA da campanha, que é onde a pessoa vai procurá-la.
    const lista = await admin.query(api.admin.listLandingLeads, { campanha: LIVE_ALTAR.slug });
    expect(lista.leads.map((l) => l._id)).toContain(leadId);
  });

  it("adicionar de novo NÃO duplica e NÃO é erro", async () => {
    // Clicar duas vezes é rotina. Recusar faria a ação em lote parar na
    // primeira pessoa já adicionada.
    const { admin, interessado } = await cenario();
    const leadId = await interessado();

    await admin.mutation(api.admin.adicionarACampanha, { leadId, campanha: LIVE_ALTAR.slug });
    const segunda = await admin.mutation(api.admin.adicionarACampanha, {
      leadId,
      campanha: LIVE_ALTAR.slug,
    });
    expect(segunda.resultado).toBe("ja_estava");

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total, "a mesma pessoa contou duas vezes").toBe(1);
  });

  it("quem já está em OUTRA campanha não é movido em silêncio", async () => {
    // Mover apagaria o vínculo com a anterior e estragaria as duas contagens.
    const { admin, interessado, ler } = await cenario();
    const leadId = await interessado({ campanha: "outra-campanha" });

    const r = await admin.mutation(api.admin.adicionarACampanha, {
      leadId,
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.resultado).toBe("em_outra");
    expect((await ler(leadId))?.campanha).toBe("outra-campanha");
  });

  it("campanha que não existe é recusada — nada de grupo fantasma", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    await expect(
      admin.mutation(api.admin.adicionarACampanha, { leadId, campanha: "campanha-inventada" }),
    ).rejects.toThrow(/não encontrada/i);
  });

  it("id que não existe responde NOT_FOUND", async () => {
    const { t, admin, interessado } = await cenario();
    const leadId = await interessado();
    await t.run(async (ctx: MutationCtx) => ctx.db.delete(leadId));
    await expect(
      admin.mutation(api.admin.adicionarACampanha, { leadId, campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow(/não encontrado/i);
  });
});

describe("o que a ponte NÃO pode tocar", () => {
  it("o status é PRESERVADO — quem estava 'Convite enviado' continua", async () => {
    // ── O DEFEITO QUE ESTE TESTE GUARDA ───────────────────────────────────
    // Entre os 10 interessados reais há pelo menos um já contatado. Se
    // adicioná-lo à campanha o devolvesse para "Novo", o ALTAR mandaria
    // preparar um convite para quem já recebeu um — e a pessoa receberia a
    // mesma mensagem duas vezes.
    const { admin, interessado, ler } = await cenario();
    const leadId = await interessado();
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status: "contatado" });
    const antes = await ler(leadId);

    await admin.mutation(api.admin.adicionarACampanha, { leadId, campanha: LIVE_ALTAR.slug });
    const depois = await ler(leadId);

    expect(depois?.status, "o histórico foi rebobinado").toBe("contatado");
    // E o carimbo do convite, que é o que o follow-up subtrai.
    expect(depois?.marcosEm?.convidado).toBe(antes?.marcosEm?.convidado);
    expect(depois?.marcosEm?.convidado).toBeTypeOf("number");

    // A campanha conta essa pessoa como convidada, não como nova.
    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.convidados).toBe(1);
    expect(f.semContato).toBe(0);
  });

  it("a origem é PRESERVADA — e ausente continua significando landing", async () => {
    // Marcar como "live" faria a primeira mensagem abrir com um contexto que
    // não aconteceu, e a contagem por origem passaria a mentir sobre de onde
    // vieram os leads da campanha.
    const { admin, interessado, ler } = await cenario();
    const semOrigem = await interessado();
    const comOrigem = await interessado({ origem: "indicacao" as const });

    for (const id of [semOrigem, comOrigem]) {
      await admin.mutation(api.admin.adicionarACampanha, { leadId: id, campanha: LIVE_ALTAR.slug });
    }

    expect((await ler(semOrigem))?.origem, "inventou origem").toBeUndefined();
    expect((await ler(comOrigem))?.origem).toBe("indicacao");

    const lista = await admin.query(api.admin.listLandingLeads, { campanha: LIVE_ALTAR.slug });
    const origens = lista.leads.map((l) => l.origem).sort();
    expect(origens).toEqual(["indicacao", "landing"]);
  });

  it("observações, porte e empresa continuam onde estavam", async () => {
    const { admin, interessado, ler } = await cenario();
    const leadId = await interessado({
      empresa: "Ateliê Flor de Lis",
      observacoes: "Falou que faz 40 casamentos por ano",
      eventosPorAno: 40,
    });
    await admin.mutation(api.admin.adicionarACampanha, { leadId, campanha: LIVE_ALTAR.slug });

    const d = await ler(leadId);
    expect(d?.empresa).toBe("Ateliê Flor de Lis");
    expect(d?.observacoes).toMatch(/40 casamentos/);
    expect(d?.eventosPorAno).toBe(40);
  });
});

describe("em lote", () => {
  it("adiciona os que faltam e conta cada desfecho", async () => {
    const { admin, interessado } = await cenario();
    const novos = [await interessado(), await interessado(), await interessado()];
    const jaEstava = await interessado({ campanha: LIVE_ALTAR.slug });
    const emOutra = await interessado({ campanha: "outra-campanha" });

    const r = await admin.mutation(api.admin.adicionarVariosACampanha, {
      leadIds: [...novos, jaEstava, emOutra],
      campanha: LIVE_ALTAR.slug,
    });

    expect(r.adicionados).toBe(3);
    expect(r.jaEstavam).toBe(1);
    expect(r.emOutra).toHaveLength(1);

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(4);
  });

  it("id repetido na mesma chamada conta UMA vez", async () => {
    // Sem resolver antes de tocar o banco, o primeiro grava e o segundo lê o
    // registro já gravado e vira "já estava" — inflando a contagem de
    // desfechos sobre uma pessoa só.
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    const r = await admin.mutation(api.admin.adicionarVariosACampanha, {
      leadIds: [leadId, leadId, leadId],
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.adicionados).toBe(1);
    expect(r.jaEstavam).toBe(0);
  });

  it("um id apagado no meio não derruba o lote inteiro", async () => {
    const { t, admin, interessado } = await cenario();
    const vivo = await interessado();
    const morto = await interessado();
    await t.run(async (ctx: MutationCtx) => ctx.db.delete(morto));

    const r = await admin.mutation(api.admin.adicionarVariosACampanha, {
      leadIds: [vivo, morto],
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.adicionados).toBe(1);
    expect(r.sumiram).toBe(1);
  });

  it("o lote tem teto, e o teto é recusa e não corte silencioso", async () => {
    // Mil `patch` numa transação não fecham. E o modo de falha seria o pior
    // possível: metade adicionada, sem ninguém saber qual metade.
    const { admin, interessado } = await cenario();
    const um = await interessado();
    await expect(
      admin.mutation(api.admin.adicionarVariosACampanha, {
        leadIds: Array.from({ length: 101 }, () => um),
        campanha: LIVE_ALTAR.slug,
      }),
    ).rejects.toThrow(/no máximo/i);
  });
});

describe("adicionar lead direto na campanha", () => {
  it("cria quem não existe, já dentro da campanha", async () => {
    const { admin } = await cenario();
    const r = await admin.mutation(api.admin.criarInteressado, {
      name: "Joana Ribeiro",
      whatsapp: "(11) 98888-7777",
      empresa: "Casa Rara",
      origem: "indicacao",
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.resultado).toBe("criado");

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(1);
  });

  it("deduplica por TELEFONE, mesmo digitado em outro formato", async () => {
    // "(11) 99990-0042" e "+5511999900042" são o mesmo aparelho. Sem
    // normalizar, a mesma pessoa entraria duas vezes e receberia a mesma
    // mensagem duas vezes.
    const { admin, interessado } = await cenario();
    await interessado({ name: "Marina Alves" });

    const r = await admin.mutation(api.admin.criarInteressado, {
      name: "Marina A.",
      whatsapp: "+55 11 99990-0042",
      origem: "indicacao",
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.resultado).toBe("vinculado");
    expect(r.nome, "achou o registro existente").toBe("Marina Alves");

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total, "criou uma segunda pessoa").toBe(1);
  });

  it("deduplica por E-MAIL, ignorando maiúsculas", async () => {
    const { admin, interessado } = await cenario();
    await interessado({
      name: "Beatriz Costa",
      email: "beatriz@exemplo.com.br",
      whatsapp: undefined,
      whatsappE164: undefined,
    });

    const r = await admin.mutation(api.admin.criarInteressado, {
      name: "Bia",
      email: "BEATRIZ@EXEMPLO.COM.BR",
      origem: "indicacao",
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.resultado).toBe("vinculado");
    expect(r.nome).toBe("Beatriz Costa");
  });

  it("quem já está na campanha é reconhecido, sem escrever nada", async () => {
    const { admin, interessado, ler } = await cenario();
    const leadId = await interessado({ name: "Marina Alves", campanha: LIVE_ALTAR.slug });
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId, status: "interessado" });

    const r = await admin.mutation(api.admin.criarInteressado, {
      name: "Marina",
      whatsapp: "(11) 99990-0042",
      origem: "indicacao",
      campanha: LIVE_ALTAR.slug,
    });
    expect(r.resultado).toBe("ja_na_campanha");
    // E o trabalho já feito continua de pé.
    expect((await ler(leadId))?.status).toBe("interessado");
  });

  it("vincular NÃO sobrescreve o nome nem a origem de quem já existe", async () => {
    const { admin, interessado, ler } = await cenario();
    const leadId = await interessado({ name: "Marina Alves", origem: "landing" as const });

    await admin.mutation(api.admin.criarInteressado, {
      name: "OUTRO NOME",
      whatsapp: "(11) 99990-0042",
      origem: "prospeccao",
      campanha: LIVE_ALTAR.slug,
    });

    const d = await ler(leadId);
    expect(d?.name, "o nome do cadastro foi sobrescrito").toBe("Marina Alves");
    expect(d?.origem, "a origem virou prospecção").toBe("landing");
  });

  it("sem e-mail E sem telefone é recusado", async () => {
    // A pessoa entraria e cairia na fila "Precisa de você" no mesmo minuto em
    // que foi digitada.
    const { admin } = await cenario();
    await expect(
      admin.mutation(api.admin.criarInteressado, {
        name: "Sem Contato",
        origem: "indicacao",
        campanha: LIVE_ALTAR.slug,
      }),
    ).rejects.toThrow(/e-mail ou WhatsApp/i);
  });

  it("só telefone basta; só e-mail também", async () => {
    const { admin } = await cenario();
    expect(
      (
        await admin.mutation(api.admin.criarInteressado, {
          name: "Só Telefone",
          whatsapp: "(21) 97777-6666",
          origem: "indicacao",
          campanha: LIVE_ALTAR.slug,
        })
      ).resultado,
    ).toBe("criado");
    expect(
      (
        await admin.mutation(api.admin.criarInteressado, {
          name: "Só E-mail",
          email: "so@exemplo.com.br",
          origem: "indicacao",
          campanha: LIVE_ALTAR.slug,
        })
      ).resultado,
    ).toBe("criado");

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(2);
  });

  it("nome vazio é recusado", async () => {
    const { admin } = await cenario();
    await expect(
      admin.mutation(api.admin.criarInteressado, {
        name: "   ",
        whatsapp: "(11) 90000-0000",
        origem: "indicacao",
        campanha: LIVE_ALTAR.slug,
      }),
    ).rejects.toThrow(/nome/i);
  });
});

describe("quem procurou a ALTAR vem primeiro", () => {
  it("landing, site, indicação, Instagram e WhatsApp são inbound", () => {
    // Não é score: é um fato binário e verificável. Ou o registro nasceu de
    // alguém preenchendo um formulário, ou de alguém montando uma lista.
    for (const origem of ["landing", "site", "indicacao", "instagram", "whatsapp"]) {
      expect(procurouOAltar({ origem }), origem).toBe(true);
    }
    for (const origem of ["prospeccao", "evento", "live", "outro"]) {
      expect(procurouOAltar({ origem }), origem).toBe(false);
    }
    // Ausente = landing, que é a origem de todo registro antigo.
    expect(procurouOAltar({})).toBe(true);
  });

  it("a campanha marca quem procurou, e o motivo cobra a resposta", async () => {
    const { admin, interessado } = await cenario();
    const inbound = await interessado({ name: "Pediu Demo", campanha: LIVE_ALTAR.slug });
    await interessado({
      name: "Lista Fria",
      origem: "prospeccao" as const,
      campanha: LIVE_ALTAR.slug,
      email: "fria@exemplo.com.br",
      whatsapp: "(11) 97777-1111",
      whatsappE164: "+5511977771111",
    });

    const lista = await admin.query(api.admin.listLandingLeads, { campanha: LIVE_ALTAR.slug });
    const quem = new Map(lista.leads.map((l) => [l.name, l.procurouOAltar]));
    expect(quem.get("Pediu Demo")).toBe(true);
    expect(quem.get("Lista Fria")).toBe(false);

    // E o rascunho preparado diz POR QUE esta pessoa — "procurou a ALTAR e
    // ainda não teve resposta" cobra uma resposta que "chegou numa lista" não
    // cobra.
    await admin.mutation(api.campanhaRascunhos.preparar, { leadId: inbound });
    const fila = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "rascunho",
    });
    expect(fila.rascunhos[0].contexto).toMatch(/procurou a altar/i);
  });

  it("a primeira mensagem do inbound NÃO trata como desconhecido", async () => {
    // Quem pediu demonstração já ouviu falar do ALTAR. Abordá-la como
    // prospecção fria é o erro que faz a pessoa achar que ninguém leu o que
    // ela escreveu.
    const { admin, interessado } = await cenario();
    const leadId = await interessado({ campanha: LIVE_ALTAR.slug });
    await admin.mutation(api.campanhaRascunhos.preparar, { leadId });

    const fila = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "rascunho",
    });
    const texto = fila.rascunhos[0].texto;
    expect(texto).toContain("Você entrou em contato com a gente");
    expect(texto, "ofereceu saída a quem pediu contato").not.toMatch(/não te incomodo mais/i);
  });
});

describe("isolamento e ausência de ação externa", () => {
  it("decoradora não adiciona ninguém a campanha nenhuma", async () => {
    const { admin, decoradora, interessado } = await cenario();
    const leadId = await interessado();

    for (const chamada of [
      () => decoradora.mutation(api.admin.adicionarACampanha, { leadId, campanha: LIVE_ALTAR.slug }),
      () =>
        decoradora.mutation(api.admin.adicionarVariosACampanha, {
          leadIds: [leadId],
          campanha: LIVE_ALTAR.slug,
        }),
      () =>
        decoradora.mutation(api.admin.criarInteressado, {
          name: "X",
          whatsapp: "(11) 90000-0000",
          origem: "indicacao",
          campanha: LIVE_ALTAR.slug,
        }),
    ]) {
      await expect(chamada()).rejects.toThrow();
    }

    // E nada foi gravado pela tentativa.
    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(0);
  });

  it("visitante sem sessão não alcança nada", async () => {
    const { t, interessado } = await cenario();
    const leadId = await interessado();
    await expect(
      t.mutation(api.admin.adicionarACampanha, { leadId, campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
  });

  it("nenhuma das entradas novas sabe mandar mensagem", () => {
    // A trava vale para o caminho novo pelo mesmo motivo que vale para o
    // antigo: uma campanha que dispara sozinha erra em escala, e erro em
    // escala com o nome da empresa em cima não tem como voltar atrás.
    const codigo = readFileSync("convex/admin.ts", "utf-8");
    const inicio = codigo.indexOf("export const adicionarACampanha");
    const fim = codigo.indexOf("export const importarInteressados");
    const trecho = codigo
      .slice(inicio, fim)
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");

    for (const proibido of ["fetch(", "scheduler", "communicationsOutbox", "sendMessage"]) {
      expect(trecho, `a entrada da campanha aprendeu a ${proibido}`).not.toContain(proibido);
    }
  });

  it("aprovar um rascunho desta pessoa continua NÃO enviando", async () => {
    const { admin, interessado } = await cenario();
    const leadId = await interessado();
    await admin.mutation(api.admin.adicionarACampanha, { leadId, campanha: LIVE_ALTAR.slug });
    const draftId = await admin.mutation(api.campanhaRascunhos.preparar, { leadId });
    await admin.mutation(api.campanhaRascunhos.decidir, { draftId, decisao: "aprovar" });

    const aprovados = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "aprovado",
    });
    expect(aprovados.rascunhos[0].enviadoEm, "aprovar marcou envio").toBeUndefined();

    const enviados = await admin.query(api.campanhaRascunhos.listar, {
      campanha: LIVE_ALTAR.slug,
      status: "enviado_manualmente",
    });
    expect(enviados.rascunhos).toHaveLength(0);
  });
});

describe("a campanha responde com números reais", () => {
  it("vazia diz que está vazia; com gente, conta o que existe", async () => {
    const { admin, interessado } = await cenario();

    const vazia = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(vazia.total).toBe(0);
    expect(vazia.taxas.every((t) => t.percentual === null), "taxa sobre o nada").toBe(true);

    const ids = [await interessado(), await interessado(), await interessado()];
    await admin.mutation(api.admin.adicionarVariosACampanha, {
      leadIds: ids,
      campanha: LIVE_ALTAR.slug,
    });
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId: ids[0], status: "contatado" });
    await admin.mutation(api.admin.setLandingLeadStatus, { leadId: ids[1], status: "interessado" });

    const f = await admin.query(api.admin.funilDaCampanha, { campanha: LIVE_ALTAR.slug });
    expect(f.total).toBe(3);
    expect(f.semContato, "o terceiro nunca foi abordado").toBe(1);
    expect(f.convidados).toBe(2);
    expect(f.interessados).toBe(1);
    expect(f.descartados).toBe(0);
  });
});
