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
import { LIVE_ALTAR } from "./lib/campanha";
import {
  aguardaPrimeiroContato,
  canalDe,
  prepararContatos,
  primeiroNome,
  rascunhoDeConvite,
} from "./lib/contatoDaCampanha";

// ═════════════════════════════════════════════════════════════════════════════
// PREPARAR O CONTATO — E PARAR ANTES DE ENVIAR
//
// A trava do produto: o ALTAR escreve a mensagem e devolve texto. Não envia,
// não agenda envio, não conhece número de saída. O último passo é de uma
// pessoa, e é isto que estes testes existem para manter.
//
// Uma campanha que dispara sozinha erra em escala — e erro em escala com o
// nome da empresa em cima não tem como voltar atrás.
// ═════════════════════════════════════════════════════════════════════════════

const MODULO = readFileSync("convex/lib/contatoDaCampanha.ts", "utf-8");
const TELA = readFileSync("src/pages/app/admin/_components/fila-de-contato.tsx", "utf-8");

const lead = (over: Record<string, unknown> = {}) => ({
  _id: "l1",
  name: "Marina Alves",
  ...over,
});

describe("o sistema NÃO envia — em nenhuma camada", () => {
  it("o módulo do rascunho não sabe fazer chamada nenhuma", () => {
    // Sem `fetch`, sem `ctx`, sem banco: ele recebe dados e devolve string.
    // É o que torna a trava verificável em vez de prometida num comentário.
    const codigo = MODULO.split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    for (const proibido of ["fetch(", "ctx.", "ctx.db", "scheduler", "sendMessage"]) {
      expect(codigo, `o módulo aprendeu a ${proibido}`).not.toContain(proibido);
    }
  });

  it("a tela oferece copiar, nunca enviar", () => {
    const codigo = TELA.split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(codigo).toContain("clipboard.writeText");
    // "Enviar para todos" é a frase que transforma isto noutra coisa.
    expect(codigo.toLowerCase()).not.toContain("enviar para todos");
    expect(codigo.toLowerCase()).not.toContain("disparar");
  });

  it("marcar como contatado NÃO é o mesmo que enviar, e é explícito", () => {
    // Dois estados diferentes: o rascunho existe × alguém falou com ela. Quem
    // confunde manda a mesma mensagem duas vezes, ou nenhuma.
    expect(TELA).toContain('status: "contatado"');
    expect(TELA).toContain("Já falei com ela");
  });
});

describe("o rascunho só diz o que está gravado", () => {
  it("usa o primeiro nome, não o nome completo", () => {
    expect(primeiroNome("Maria Fernanda Albuquerque")).toBe("Maria");
    const texto = rascunhoDeConvite(lead({ name: "Maria Fernanda Albuquerque" }));
    expect(texto).toContain("Olá, Maria!");
    expect(texto).not.toContain("Albuquerque");
  });

  it("nome vazio não vira 'Olá, !'", () => {
    expect(primeiroNome("   ")).toBeNull();
    const texto = rascunhoDeConvite(lead({ name: "  " }));
    expect(texto).toContain("Olá! Tudo bem?");
    expect(texto).not.toContain("Olá, !");
  });

  it("a abertura NÃO afirma um contato que nunca houve", () => {
    // ── O DEFEITO QUE ESTE TESTE GUARDA ───────────────────────────────────
    // "Você entrou em contato com a gente há um tempo demonstrando interesse"
    // é verdade para quem preencheu a landing e MENTIRA para quem veio de uma
    // lista de prospecção. Abrir uma primeira conversa afirmando um contato
    // inexistente é a forma mais rápida de queimar o número — e é o tipo de
    // erro que só aparece depois de trinta mensagens enviadas.
    const veioSozinha = rascunhoDeConvite(lead({ origem: "landing" }));
    expect(veioSozinha).toContain("Você entrou em contato com a gente");

    const prospectada = rascunhoDeConvite(lead({ origem: "prospeccao" }));
    expect(prospectada, "afirmou um contato que não existiu").not.toContain(
      "Você entrou em contato",
    );
    expect(prospectada).toContain("Estou falando com empresas de decoração");
  });

  it("na prospecção cita a empresa, e não inventa quando não existe", () => {
    // Citar a empresa mostra que não é disparo cego — e é um dado que quem
    // montou a lista já tinha. Quem veio da landing não precisa dessa prova:
    // foi ela quem procurou.
    const com = rascunhoDeConvite(lead({ origem: "prospeccao", empresa: "Estúdio Alba" }));
    expect(com).toContain("Estúdio Alba");

    const sem = rascunhoDeConvite(lead({ origem: "prospeccao" }));
    expect(sem).toContain("Estou falando com empresas de decoração");
    expect(sem).not.toContain("cheguei até a");
  });

  it("leva a data e a hora DECLARADAS da campanha", () => {
    const texto = rascunhoDeConvite(lead({}), LIVE_ALTAR);
    expect(texto).toContain("06/10");
    expect(texto).toContain("19:00");
  });

  it("NUNCA promete preço, desconto ou prazo de teste", () => {
    // Um rascunho que promete condição vira promessa quando alguém envia sem
    // ler. Condição comercial é conversa, não modelo de texto.
    const texto = rascunhoDeConvite(
      lead({ empresa: "Estúdio Alba", eventosPorAno: 40 }),
    ).toLowerCase();
    for (const proibido of ["desconto", "grátis", "gratuito", "r$", "%", "promoção", "oferta"]) {
      expect(texto, `o convite prometeu ${proibido}`).not.toContain(proibido);
    }
  });

  it("e não elogia um trabalho que ninguém viu", () => {
    // "Vi que você faz casamentos lindos" denuncia disparo automático
    // justamente quando tenta escondê-lo.
    const texto = rascunhoDeConvite(lead({ empresa: "Estúdio Alba" })).toLowerCase();
    for (const bajulacao of ["lindo", "incrível", "maravilhoso", "admiro", "acompanho seu"]) {
      expect(texto).not.toContain(bajulacao);
    }
  });

  it("é DETERMINÍSTICO — duas chamadas produzem o mesmo texto", () => {
    // Quem revisa trinta mensagens confia nas outras vinte e nove. Texto
    // diferente a cada chamada obriga a ler todas.
    const a = rascunhoDeConvite(lead({ empresa: "Alba" }));
    const b = rascunhoDeConvite(lead({ empresa: "Alba" }));
    expect(a).toBe(b);
  });
});

describe("a fila mostra quem falta abordar", () => {
  it("só quem ainda não teve contato", () => {
    const fila = prepararContatos([
      lead({ _id: "a", status: "novo" }),
      lead({ _id: "b", status: "contato_preparado" }),
      lead({ _id: "c", status: "contatado" }),
      lead({ _id: "d", status: "convertido" }),
      lead({ _id: "e", status: "descartado" }),
    ]);
    expect(fila.map((c) => c.leadId).sort()).toEqual(["a", "b"]);
  });

  it("quem declarou porte maior vem primeiro — e o motivo é o número DELA", () => {
    // Nenhum score inventado: ela aparece antes porque preencheu 40, não
    // porque um modelo achou que parecia promissora.
    const fila = prepararContatos([
      lead({ _id: "pequena", eventosPorAno: 5 }),
      lead({ _id: "grande", eventosPorAno: 40 }),
      lead({ _id: "semporte" }),
    ]);
    expect(fila[0].leadId).toBe("grande");
    expect(fila[0].motivo).toBe("40 eventos por ano");
    expect(fila[2].motivo).toBe("ainda sem contato");
  });

  it("WhatsApp na frente do e-mail", () => {
    expect(canalDe(lead({ whatsapp: "11999", email: "a@b.com" }))).toEqual({
      tipo: "whatsapp",
      valor: "11999",
    });
    expect(canalDe(lead({ email: "a@b.com" }))!.tipo).toBe("email");
  });

  it("quem não tem contato nenhum CONTINUA na fila, com o recado", () => {
    // Escondê-la faria a lista prometer que todo mundo é alcançável.
    const fila = prepararContatos([lead({ _id: "sem" })]);
    expect(fila).toHaveLength(1);
    expect(fila[0].canal).toBeNull();
  });

  it("aguardaPrimeiroContato degrada para `novo` num status desconhecido", () => {
    expect(aguardaPrimeiroContato(lead({ status: "inventado" }))).toBe(true);
  });
});

describe("a fila pelo servidor, e quem pode vê-la", () => {
  async function cenario() {
    const t = convexTest(schema, modules);
    const admin = await autenticarComoAdmin(t);
    const decoradora = await autenticarComoDecoradora(t);
    const interessado = (over: Record<string, unknown> = {}) =>
      t.run(async (ctx: MutationCtx) =>
        ctx.db.insert("landingLeads", {
          name: "Decoradora Fulana",
          email: `f${Math.random()}@ex.com`,
          intent: "demo" as const,
          ...over,
        }),
      );
    return { t, admin, decoradora, interessado };
  }

  it("devolve a mensagem pronta para quem falta abordar", async () => {
    const { admin, interessado } = await cenario();
    await interessado({ campanha: LIVE_ALTAR.slug, name: "Marina Alves", whatsapp: "11999" });
    await interessado({ campanha: LIVE_ALTAR.slug, status: "contatado" });

    const fila = await admin.query(api.admin.contatosAPreparar, { campanha: LIVE_ALTAR.slug });
    expect(fila.contatos).toHaveLength(1);
    expect(fila.contatos[0].nome).toBe("Marina Alves");
    expect(fila.contatos[0].mensagem).toContain("Olá, Marina!");
    expect(fila.contatos[0].canal).toEqual({ tipo: "whatsapp", valor: "11999" });
  });

  it("campanha desconhecida não inventa data — devolve fila vazia", async () => {
    // Sem data declarada não há convite a escrever. Interpolar `undefined`
    // mandaria "no dia undefined" para uma pessoa de verdade.
    const { admin, interessado } = await cenario();
    await interessado({ campanha: "inexistente" });
    const fila = await admin.query(api.admin.contatosAPreparar, { campanha: "inexistente" });
    expect(fila.campanha).toBeNull();
    expect(fila.contatos).toEqual([]);
  });

  it("a decoradora NÃO vê a fila de contatos do ALTAR", async () => {
    const { decoradora, interessado } = await cenario();
    await interessado({ campanha: LIVE_ALTAR.slug });
    await expect(
      decoradora.query(api.admin.contatosAPreparar, { campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
  });

  it("nem sem sessão nenhuma", async () => {
    const { t, interessado } = await cenario();
    await interessado({ campanha: LIVE_ALTAR.slug });
    await expect(
      t.query(api.admin.contatosAPreparar, { campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
  });
});
