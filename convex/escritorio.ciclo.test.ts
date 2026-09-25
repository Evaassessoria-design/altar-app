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
import { LIVE_ALTAR } from "./lib/campanha";
import {
  CATALOGO,
  podeAgir,
  resumoDaAutonomia,
  situacaoDasCapacidades,
} from "./lib/escritorio/autonomia";
import { chaveDaIntencao, planejarCiclo, resumirCiclo } from "./lib/escritorio/ciclo";
import { nomeParaMensagem } from "./lib/escritorio/redacaoDaCampanha";

// ═════════════════════════════════════════════════════════════════════════════
// O ESCRITÓRIO TRABALHANDO SOZINHO
//
// ── O PRINCÍPIO QUE ESTES TESTES GUARDAM ────────────────────────────────────
// "O ALTAR não pede autorização para trabalhar. Ele pede decisão quando
// ultrapassa a autonomia que o usuário definiu."
//
// As duas metades precisam ser verdade ao mesmo tempo. Um sistema que pergunta
// antes de cada passo devolve ao humano o trabalho que existia para tirar
// dele; um que decide tudo sozinho erra em escala com o nome da empresa em
// cima.
//
// ── E A PROPRIEDADE QUE TORNA ISSO SEGURO ───────────────────────────────────
// IDEMPOTÊNCIA. Rodar de novo não pode duplicar nada — senão "Rodar
// Escritório" vira um botão que ninguém ousa clicar duas vezes, e um botão que
// dá medo não é automação.
// ═════════════════════════════════════════════════════════════════════════════

async function cenario() {
  const t = convexTest(schema, modules);
  const admin = await autenticarComoAdmin(t);
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

  const ler = (id: Id<"landingLeads">) =>
    t.run(async (ctx: MutationCtx) => ctx.db.get(id));

  const rascunhos = (status: "rascunho" | "aprovado" | "enviado_manualmente" = "rascunho") =>
    admin.query(api.campanhaRascunhos.listar, { campanha: LIVE_ALTAR.slug, status });

  const rodar = () => admin.mutation(api.escritorioCiclo.rodarAgora, { campanha: LIVE_ALTAR.slug });

  return { t, admin, decoradora, interessado, ler, rascunhos, rodar };
}

// ── O MODELO DE AUTONOMIA ───────────────────────────────────────────────────

describe("o semáforo do Escritório", () => {
  it("verde nasce ligado; amarelo e vermelho, desligados", () => {
    // Obrigar o dono a ligar nove interruptores antes de o produto fazer
    // qualquer coisa é devolver a ele a configuração que ele queria evitar.
    const s = situacaoDasCapacidades([], false);
    for (const c of s) {
      if (c.cor === "verde") expect(c.escolhida, c.id).toBe(true);
      else expect(c.escolhida, c.id).toBe(false);
    }
  });

  it("VERMELHO nunca liga — nem com preferência gravada dizendo que sim", () => {
    // ── A TRAVA ────────────────────────────────────────────────────────────
    // Olhar a preferência para as vermelhas abriria a porta para um `patch`
    // no banco virar autorização. A política é código, não dado.
    const vermelhas = CATALOGO.filter((c) => c.cor === "vermelho");
    expect(vermelhas.length).toBeGreaterThan(0);

    const forcadas = vermelhas.map((c) => ({ capacidade: c.id, ligada: true }));
    const s = situacaoDasCapacidades(forcadas, true);
    for (const c of s.filter((x) => x.cor === "vermelho")) {
      expect(c.ativa, `${c.id} ligou`).toBe(false);
      expect(c.porQueNao).toMatch(/nunca é automática/i);
    }
  });

  it("amarelo sem canal é INDISPONÍVEL, não desligado", () => {
    // A distinção é a diferença entre "você escolheu" e "não dá". Um
    // interruptor que o dono liga e que não faz nada ensina que os outros
    // também podem ser decorativos.
    const querEnviar = [{ capacidade: "enviar_whatsapp", ligada: true }];

    const semCanal = situacaoDasCapacidades(querEnviar, false).find(
      (c) => c.id === "enviar_whatsapp",
    )!;
    expect(semCanal.escolhida, "a escolha dele foi registrada").toBe(true);
    expect(semCanal.disponivel).toBe(false);
    expect(semCanal.ativa).toBe(false);
    expect(semCanal.porQueNao).toMatch(/conectar o canal/i);

    const comCanal = situacaoDasCapacidades(querEnviar, true).find(
      (c) => c.id === "enviar_whatsapp",
    )!;
    expect(comCanal.ativa).toBe(true);
  });

  it("desligar uma verde de fato a desliga", () => {
    expect(podeAgir("preparar_follow_up", [], false)).toBe(true);
    expect(
      podeAgir("preparar_follow_up", [{ capacidade: "preparar_follow_up", ligada: false }], false),
    ).toBe(false);
  });

  it("o resumo conta o que está esperando canal", () => {
    const r = resumoDaAutonomia(situacaoDasCapacidades([], false));
    expect(r.verdesAtivas).toBe(r.verdesTotal);
    expect(r.esperandoCanal, "as duas amarelas").toBe(2);
  });
});

describe("a política, pelo banco", () => {
  it("a tela recebe as capacidades e o recado honesto sobre envio", async () => {
    const { admin } = await cenario();
    const a = await admin.query(api.escritorioCiclo.autonomia, { campanha: LIVE_ALTAR.slug });
    expect(a.capacidades.length).toBe(CATALOGO.length);
    expect(a.recado).toMatch(/quem envia é você/i);
  });

  it("gravar uma preferência muda o comportamento do ciclo", async () => {
    const { admin, interessado, rodar, rascunhos } = await cenario();
    await interessado();

    await admin.mutation(api.escritorioCiclo.definirAutonomia, {
      campanha: LIVE_ALTAR.slug,
      capacidade: "preparar_primeiro_contato",
      ligada: false,
    });

    const r = await rodar();
    expect(r.mensagensPreparadas, "escreveu com a capacidade desligada").toBe(0);
    expect(r.bloqueadasPorAutonomia).toBeGreaterThan(0);
    expect((await rascunhos()).rascunhos).toHaveLength(0);
  });

  it("ligar uma VERMELHA é recusado pela mutation", async () => {
    const { admin } = await cenario();
    await expect(
      admin.mutation(api.escritorioCiclo.definirAutonomia, {
        campanha: LIVE_ALTAR.slug,
        capacidade: "dar_desconto",
        ligada: true,
      }),
    ).rejects.toThrow(/nunca é automática/i);
  });

  it("capacidade e campanha inventadas são recusadas", async () => {
    const { admin } = await cenario();
    await expect(
      admin.mutation(api.escritorioCiclo.definirAutonomia, {
        campanha: LIVE_ALTAR.slug,
        capacidade: "dominar_o_mundo",
        ligada: true,
      }),
    ).rejects.toThrow(/não encontrada/i);
    await expect(
      admin.mutation(api.escritorioCiclo.definirAutonomia, {
        campanha: "campanha-inventada",
        capacidade: "priorizar",
        ligada: true,
      }),
    ).rejects.toThrow(/não encontrada/i);
  });
});

// ── RODAR ───────────────────────────────────────────────────────────────────

describe("rodar o Escritório", () => {
  it("escreve o que falta, sem ninguém pedir lead por lead", async () => {
    const { interessado, rodar, rascunhos } = await cenario();
    for (let i = 0; i < 5; i++) await interessado();

    const r = await rodar();
    expect(r.analisadas).toBe(5);
    expect(r.mensagensPreparadas).toBe(5);
    expect((await rascunhos()).rascunhos).toHaveLength(5);
    expect(r.resumo).toMatch(/5 mensagens escritas/i);
  });

  it("RODAR DE NOVO NÃO DUPLICA NADA", async () => {
    // ── A PROPRIEDADE QUE TORNA O BOTÃO USÁVEL ────────────────────────────
    // Sem isto, clicar duas vezes deixaria dez rascunhos para cinco pessoas —
    // e alguém mandaria os dez. Um botão que dá medo de clicar duas vezes não
    // é automação.
    const { interessado, rodar, rascunhos } = await cenario();
    for (let i = 0; i < 5; i++) await interessado();

    await rodar();
    const segunda = await rodar();

    expect(segunda.mensagensPreparadas).toBe(0);
    expect(segunda.jaExistiam, "a idempotência precisa ser VISÍVEL").toBe(5);
    expect((await rascunhos()).rascunhos).toHaveLength(5);
    expect(segunda.resumo).toMatch(/já estava pronto/i);
  });

  it("rodar três vezes continua com cinco", async () => {
    const { interessado, rodar, rascunhos } = await cenario();
    for (let i = 0; i < 5; i++) await interessado();
    await rodar();
    await rodar();
    await rodar();
    expect((await rascunhos()).rascunhos).toHaveLength(5);
  });

  it("um rascunho DESCARTADO libera a pessoa para a próxima rodada", async () => {
    // Descartar é dizer "este texto não serve". Se isso travasse o ciclo, a
    // pessoa ficaria sem mensagem para sempre.
    const { admin, interessado, rodar, rascunhos } = await cenario();
    await interessado();
    await rodar();

    const primeiro = (await rascunhos()).rascunhos[0];
    await admin.mutation(api.campanhaRascunhos.decidir, {
      draftId: primeiro._id,
      decisao: "descartar",
    });

    const segunda = await rodar();
    expect(segunda.mensagensPreparadas).toBe(1);
  });

  it("quem já é cliente ou disse não NÃO recebe trabalho novo", async () => {
    const { interessado, rodar } = await cenario();
    await interessado({ status: "convertido" as const });
    await interessado({ status: "descartado" as const });

    const r = await rodar();
    expect(r.analisadas).toBe(2);
    expect(r.mensagensPreparadas, "abordou quem já saiu do ciclo").toBe(0);
  });

  it("a rodada é registrada MESMO quando não produz nada", async () => {
    // Sem isto, "o Escritório rodou e estava tudo em dia" não deixa prova
    // nenhuma — e um sistema autônomo sem prova do que fez é opaco.
    const { admin, rodar } = await cenario();
    await rodar();

    const h = await admin.query(api.escritorioCiclo.execucoes, { campanha: LIVE_ALTAR.slug });
    expect(h.rodadas).toHaveLength(1);
    expect(h.hoje.rodadas).toBe(1);
    expect(h.hoje.nuncaRodou).toBe(false);
    expect(h.ultima?.chamadasDeIa, "o ciclo é determinístico").toBe(0);
  });

  it("campanha vazia diz que está vazia, sem inventar número", async () => {
    const { rodar } = await cenario();
    const r = await rodar();
    expect(r.analisadas).toBe(0);
    expect(r.resumo).toMatch(/não há ninguém/i);
  });

  it("o teto por rodada é declarado, e a rodada seguinte continua", async () => {
    const { interessado, rodar } = await cenario();
    for (let i = 0; i < 55; i++) await interessado();

    const primeira = await rodar();
    expect(primeira.mensagensPreparadas).toBe(50);
    expect(primeira.naoCouberam, "o corte precisa ser declarado").toBe(5);

    const segunda = await rodar();
    expect(segunda.mensagensPreparadas).toBe(5);
    expect(segunda.naoCouberam).toBe(0);
  });
});

// ── O PLANO, PURO ───────────────────────────────────────────────────────────

describe("o plano do ciclo", () => {
  const pessoa = (id: string, over: Record<string, unknown> = {}) => ({
    _id: id,
    nome: `Pessoa ${id}`,
    status: undefined,
    fatos: { temCanal: true, procurouOAltar: true, ...over },
  });

  it("a chave é determinística — é ela que impede duplicação", () => {
    const a = chaveDaIntencao("live", "preparar_mensagem", "l1", "convite");
    const b = chaveDaIntencao("live", "preparar_mensagem", "l1", "convite");
    expect(a).toBe(b);
    // Sem data nem hora: rodar às 8h e às 14h precisa dar a MESMA chave.
    expect(a).not.toMatch(/\d{13}/);
  });

  it("o que já existe é contado, não refeito", () => {
    const chave = chaveDaIntencao("live", "preparar_mensagem", "l1", "convite");
    const p = planejarCiclo({
      campanha: "live",
      pessoas: [pessoa("l1") as never],
      duplicidades: [],
      podeFazer: new Set(["preparar_primeiro_contato"]),
      jaFeito: new Set([chave]),
    });
    expect(p.intencoes).toHaveLength(0);
    expect(p.jaExistiam).toBe(1);
  });

  it("capacidade desligada vira contagem, não silêncio", () => {
    const p = planejarCiclo({
      campanha: "live",
      pessoas: [pessoa("l1") as never],
      duplicidades: [],
      podeFazer: new Set(),
      jaFeito: new Set(),
    });
    expect(p.intencoes).toHaveLength(0);
    expect(p.bloqueadasPorAutonomia).toBe(1);
  });

  it("quem precisa de gente vira decisão, não mensagem", () => {
    const p = planejarCiclo({
      campanha: "live",
      pessoas: [pessoa("l1", { temCanal: false }) as never],
      duplicidades: [],
      podeFazer: new Set(["relatorio_diario", "preparar_primeiro_contato"]),
      jaFeito: new Set(),
    });
    expect(p.intencoes).toHaveLength(1);
    expect(p.intencoes[0].tipo).toBe("pedir_decisao");
  });

  it("'nada novo' é resposta legítima, e a frase não soa como falha", () => {
    const r = resumirCiclo({
      intencoes: [],
      analisadas: 12,
      bloqueadasPorAutonomia: 0,
      jaExistiam: 12,
    });
    expect(r.semTrabalhoNovo).toBe(true);
  });
});

// ── O NOME QUE VAI PARA A MENSAGEM ──────────────────────────────────────────

describe("[TESTE] nunca vaza para a mensagem", () => {
  it("o prefixo some do texto e permanece no cadastro", async () => {
    // ── O DEFEITO QUE ESTE TESTE GUARDA ───────────────────────────────────
    // Registros de homologação entram marcados: "[TESTE] Helena Rangel".
    // Internamente isso é útil — é como se distingue dado sintético de pessoa
    // real. Na mensagem vira "Olá, [TESTE]! Tudo bem?", e basta alguém copiar
    // sem ler para uma decoradora receber isso.
    const { interessado, rodar, rascunhos, ler } = await cenario();
    const leadId = await interessado({ name: "[TESTE] Helena Rangel" });
    await rodar();

    const texto = (await rascunhos()).rascunhos[0].texto;
    expect(texto).toContain("Olá, Helena!");
    expect(texto, "a marca vazou para a mensagem").not.toContain("[TESTE]");

    // E o cadastro continua marcado: é ele que distingue dado sintético.
    expect((await ler(leadId))?.name).toBe("[TESTE] Helena Rangel");
  });

  it("marcas empilhadas também somem", () => {
    expect(nomeParaMensagem("[TESTE] [DEMO] Ana Paula")).toBe("Ana Paula");
  });

  it("colchete no MEIO do nome é parte do nome", () => {
    // Apagá-lo seria corrigir o que não está errado.
    expect(nomeParaMensagem("Ana [do Ateliê] Paula")).toBe("Ana [do Ateliê] Paula");
  });

  it("nome que era SÓ a marca não vira vazio", () => {
    // A saudação sairia como "Olá, !".
    expect(nomeParaMensagem("[TESTE]")).toBe("[TESTE]");
  });
});

// ── FRONTEIRAS ──────────────────────────────────────────────────────────────

describe("o ciclo não fala com ninguém de fora", () => {
  it("nem o ciclo nem o plano sabem fazer chamada", () => {
    for (const arquivo of [
      "convex/escritorioCiclo.ts",
      "convex/lib/escritorio/ciclo.ts",
      "convex/lib/escritorio/autonomia.ts",
      "convex/lib/escritorio/redacaoDaCampanha.ts",
    ]) {
      const codigo = readFileSync(arquivo, "utf-8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      for (const proibido of ["fetch(", "scheduler", "communicationsOutbox", "sendMessage", "OpenAI"]) {
        expect(codigo, `${arquivo} aprendeu a ${proibido}`).not.toContain(proibido);
      }
    }
  });

  it("uma rodada inteira não gasta chamada de IA nenhuma", async () => {
    // É o que torna "rodar de novo" uma operação sem consequência — e a
    // idempotência só vale alguma coisa se repetir for barato.
    const { admin, interessado, rodar } = await cenario();
    for (let i = 0; i < 10; i++) await interessado();
    await rodar();
    const h = await admin.query(api.escritorioCiclo.execucoes, { campanha: LIVE_ALTAR.slug });
    expect(h.ultima?.chamadasDeIa).toBe(0);
  });

  it("decoradora não roda o Escritório da ALTAR nem muda a política", async () => {
    const { decoradora, interessado } = await cenario();
    await interessado();
    await expect(
      decoradora.mutation(api.escritorioCiclo.rodarAgora, { campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
    await expect(
      decoradora.query(api.escritorioCiclo.autonomia, { campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
    await expect(
      decoradora.mutation(api.escritorioCiclo.definirAutonomia, {
        campanha: LIVE_ALTAR.slug,
        capacidade: "priorizar",
        ligada: false,
      }),
    ).rejects.toThrow();
  });

  it("visitante sem sessão não alcança nada", async () => {
    const { t } = await cenario();
    await expect(
      t.mutation(api.escritorioCiclo.rodarAgora, { campanha: LIVE_ALTAR.slug }),
    ).rejects.toThrow();
  });
});
