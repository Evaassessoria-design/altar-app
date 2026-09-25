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
  analisar,
  detectarSeparador,
  dividirLinha,
  lerArquivo,
  pareceEmail,
} from "./lib/importacaoDeLeads";

// ═════════════════════════════════════════════════════════════════════════════
// IMPORTAR UMA LISTA — E NÃO ESTRAGAR O QUE JÁ ESTÁ LÁ
//
// Uma live traz nomes de vários lugares. Sem importação, cada um vira
// digitação — e cem pessoas digitadas uma a uma é a planilha voltando pela
// porta dos fundos.
//
// O que estes testes protegem: o arquivo é lido ANTES de gravar, quem já
// existe é PULADO e não sobrescrito, e nada disto envia mensagem nenhuma.
// ═════════════════════════════════════════════════════════════════════════════

const vazio = { emails: new Set<string>(), telefones: new Set<string>() };

describe("ler o arquivo", () => {
  it("entende ponto e vírgula, que é o que o Excel brasileiro exporta", () => {
    // Supor vírgula faria todo arquivo vindo do Excel em português virar uma
    // coluna só — e o erro apareceria como "não encontrei a coluna de nome".
    expect(detectarSeparador("nome;email;telefone")).toBe(";");
    expect(detectarSeparador("nome,email,telefone")).toBe(",");
    expect(detectarSeparador("nome\temail\ttelefone")).toBe("\t");
  });

  it("respeita aspas — nome com vírgula não empurra as colunas", () => {
    // Sem isto, o telefone de uma pessoa vira o e-mail de outra.
    expect(dividirLinha('"Silva, Maria";11999', ";")).toEqual(["Silva, Maria", "11999"]);
    expect(dividirLinha('"Ele disse ""oi""";x', ";")).toEqual(['Ele disse "oi"', "x"]);
  });

  it("aceita cabeçalho com acento, maiúscula e sinônimo", () => {
    const r = lerArquivo("Nome;E-mail;Celular;Estúdio\nMarina;m@ex.com;11999;Alba");
    expect(r.erro).toBeUndefined();
    expect(r.linhas[0]).toMatchObject({
      name: "Marina",
      email: "m@ex.com",
      whatsapp: "11999",
      empresa: "Alba",
    });
  });

  it("diz QUAIS colunas ignorou em vez de descartá-las calado", () => {
    const r = lerArquivo("nome;email;observacao interna\nMarina;m@ex.com;algo");
    expect(r.ignoradas).toContain("observacao interna");
  });

  it("sem coluna de nome, recusa e EXPLICA", () => {
    const r = lerArquivo("email;telefone\nm@ex.com;11999");
    expect(r.erro).toMatch(/nome/i);
    expect(r.linhas).toEqual([]);
  });

  it("arquivo vazio e arquivo só com cabeçalho têm recados diferentes", () => {
    expect(lerArquivo("").erro).toMatch(/vazio/i);
    expect(lerArquivo("nome;email").erro).toMatch(/cabeçalho/i);
  });

  it("guarda o número da linha do ARQUIVO, que é o que ela vê no Excel", () => {
    const r = lerArquivo("nome\nA\nB");
    expect(r.linhas.map((l) => l.linha)).toEqual([2, 3]);
  });
});

describe("o preview diz o que vai acontecer", () => {
  it("sem nome é inválida", () => {
    const s = analisar([{ linha: 2, name: "  ", email: "a@b.com" }], vazio);
    expect(s[0]).toMatchObject({ tipo: "invalida", motivo: "Sem nome" });
  });

  it("sem e-mail E sem telefone é inválida — não há como falar com ela", () => {
    const s = analisar([{ linha: 2, name: "Marina" }], vazio);
    expect(s[0].tipo).toBe("invalida");
  });

  it("e-mail malformado é recusado, e o motivo mostra o valor", () => {
    const s = analisar([{ linha: 2, name: "Marina", email: "marina@" }], vazio);
    expect(s[0]).toMatchObject({ tipo: "invalida" });
    expect((s[0] as { motivo: string }).motivo).toContain("marina@");
    expect(pareceEmail("m@ex.com")).toBe(true);
    expect(pareceEmail("m@ex")).toBe(false);
  });

  it("quem já está no banco é DUPLICADA, por e-mail ou por telefone", () => {
    const jaTem = {
      emails: new Set(["m@ex.com"]),
      telefones: new Set(["+5511999998888"]),
    };
    const s = analisar(
      [
        { linha: 2, name: "Marina", email: "M@Ex.com" },
        { linha: 3, name: "Outra", whatsapp: "(11) 99999-8888" },
      ],
      jaTem,
    );
    expect(s[0].tipo).toBe("duplicada");
    expect(s[1].tipo).toBe("duplicada");
  });

  it("repetida DENTRO do próprio arquivo também conta", () => {
    // Listas montadas à mão repetem gente. Importar duas vezes a mesma pessoa
    // é o mesmo defeito de importar quem já existe.
    const s = analisar(
      [
        { linha: 2, name: "Marina", email: "m@ex.com" },
        { linha: 3, name: "Marina de novo", email: "m@ex.com" },
      ],
      vazio,
    );
    expect(s[0].tipo).toBe("nova");
    expect(s[1]).toMatchObject({ tipo: "duplicada", motivo: "Repetido no próprio arquivo" });
  });

  it("NÃO casa por nome — duas Marias não são a mesma pessoa", () => {
    // Fundir duas pessoas é irreversível; pular uma linha se resolve
    // importando de novo.
    const s = analisar(
      [
        { linha: 2, name: "Maria Silva", email: "a@ex.com" },
        { linha: 3, name: "Maria Silva", email: "b@ex.com" },
      ],
      vazio,
    );
    expect(s.every((x) => x.tipo === "nova")).toBe(true);
  });
});

describe("importar pelo servidor", () => {
  async function cenario() {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const decoradora = await autenticarComoDecoradora(t);
    const todos = () =>
      t.run((ctx: MutationCtx) => ctx.db.query("landingLeads").collect());
    return { t, admin, decoradora, todos };
  }

  const ARQUIVO = [
    "nome;email;telefone;empresa;cidade;estado",
    "Marina Alves;marina@ex.com;11999998888;Estúdio Alba;São Paulo;SP",
    "Joana Reis;joana@ex.com;;Casa Reis;Campinas;SP",
    ";sem-nome@ex.com;;;;",
  ].join("\n");

  it("o preview NÃO grava nada", async () => {
    const { admin, todos } = await cenario();
    const p = await admin.query(api.admin.previewDeImportacao, { conteudo: ARQUIVO });
    expect(p.resumo).toMatchObject({ novas: 2, invalidas: 1, total: 3 });
    expect(await todos(), "o preview gravou").toHaveLength(0);
  });

  it("importar grava só as novas, com a campanha e a origem", async () => {
    const { admin, todos } = await cenario();
    const r = await admin.mutation(api.admin.importarInteressados, {
      conteudo: ARQUIVO,
      campanha: LIVE_ALTAR.slug,
      origem: "live",
    });
    expect(r).toMatchObject({ criados: 2, invalidas: 1 });

    const gravados = await todos();
    expect(gravados).toHaveLength(2);
    expect(gravados.every((l) => l.campanha === LIVE_ALTAR.slug)).toBe(true);
    expect(gravados.every((l) => l.origem === "live")).toBe(true);
    expect(gravados.every((l) => l.status === "novo")).toBe(true);
    // A data da coleta entra: lista de dois anos atrás não é contato, é ruído.
    expect(gravados.every((l) => !!l.coletadoEm)).toBe(true);
    const marina = gravados.find((l) => l.name === "Marina Alves")!;
    expect(marina.empresa).toBe("Estúdio Alba");
    expect(marina.whatsappE164).toBe("+5511999998888");
  });

  it("importar DUAS VEZES não duplica nem sobrescreve o trabalho já feito", async () => {
    // Quem já está no banco pode ter sido trabalhado — etapa movida,
    // observação escrita. Um arquivo velho apagaria isso em silêncio.
    const { t, admin, todos } = await cenario();
    await admin.mutation(api.admin.importarInteressados, { conteudo: ARQUIVO });
    const antes = await todos();
    const marina = antes.find((l) => l.name === "Marina Alves")!;
    await t.run(async (ctx: MutationCtx) => {
      await ctx.db.patch(marina._id, { status: "confirmou", observacoes: "Vai trazer a sócia" });
    });

    const r = await admin.mutation(api.admin.importarInteressados, { conteudo: ARQUIVO });
    expect(r.criados).toBe(0);
    expect(r.duplicadas).toBe(2);

    const depois = await todos();
    expect(depois).toHaveLength(2);
    const aindaMarina = depois.find((l) => l.name === "Marina Alves")!;
    expect(aindaMarina.status, "a importação sobrescreveu a etapa").toBe("confirmou");
    expect(aindaMarina.observacoes).toBe("Vai trazer a sócia");
  });

  it("arquivo sem coluna de nome é RECUSADO, e nada é gravado", async () => {
    const { admin, todos } = await cenario();
    await expect(
      admin.mutation(api.admin.importarInteressados, { conteudo: "email\nm@ex.com" }),
    ).rejects.toThrow(/nome/i);
    expect(await todos()).toHaveLength(0);
  });

  it("a decoradora não importa nada, nem vê o preview", async () => {
    const { decoradora, todos } = await cenario();
    await expect(
      decoradora.mutation(api.admin.importarInteressados, { conteudo: ARQUIVO }),
    ).rejects.toThrow();
    await expect(
      decoradora.query(api.admin.previewDeImportacao, { conteudo: ARQUIVO }),
    ).rejects.toThrow();
    expect(await todos()).toHaveLength(0);
  });

  it("e os importados entram na fila de contato, sem nada ser enviado", async () => {
    const { admin } = await cenario();
    await admin.mutation(api.admin.importarInteressados, {
      conteudo: ARQUIVO,
      campanha: LIVE_ALTAR.slug,
    });
    const fila = await admin.query(api.admin.contatosAPreparar, { campanha: LIVE_ALTAR.slug });
    expect(fila.contatos).toHaveLength(2);
    expect(fila.contatos[0].mensagem).toContain("Oi,");
  });
});
