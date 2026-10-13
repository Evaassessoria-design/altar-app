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
import { autenticarComo } from "./test.auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { consolidarMateriais, contaDaLinha, necessidadeDoComponente, textoDaConta } from "./lib/fichaTecnica";
import { ehObrigacaoDeMontagem } from "./lib/escopoDoProjeto";
import {
  legendaDasFlores,
  linhasDaComposicao,
  resumoDeMateriais,
  textoDaQuantidade,
} from "./lib/producaoFloral";

// ═════════════════════════════════════════════════════════════════════════════
// PRODUÇÃO FLORAL — a ficha do florista.
//
// O que estes testes protegem, em ordem de gravidade:
//
//  1. a distinção entre QUANTIDADE POR ARRANJO e TOTAL DISTRIBUÍDO. Errar aqui
//     compra 40 maços onde cabiam 2;
//  2. que orientação sem quantidade NÃO vira total inventado;
//  3. que unidades diferentes não se somam, nem aqui nem no resumo;
//  4. que a ficha do florista não carrega NENHUM valor financeiro;
//  5. que id de outra conta não devolve nada — nem o dado, nem a existência;
//  6. que o papel do florista não leva contato pessoal nem anotação interna;
//  7. que editar a parte floral não mexe em custo, margem, unidade nem
//     quantidade, e que "só orientação" não apaga o número.
// ═════════════════════════════════════════════════════════════════════════════

const NOW = "2026-10-09T12:00:00.000Z";
const CATEGORIA = "montagem" as const;

async function cenario() {
  const t = convexTest(schema, modules);
  const sessao = await autenticarComo(t, {
    nome: "Dona",
    email: "dona@ex.com",
    role: "user",
  });
  const sessaoDaOutra = await autenticarComo(t, {
    nome: "Outra",
    email: "outra@ex.com",
    role: "user",
  });

  const ids = await t.run(async (ctx: MutationCtx) => {
    const dona = await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|dona@ex.com"))
      .unique();
    const outra = await ctx.db
      .query("users")
      .withIndex("by_better_auth_id", (q) => q.eq("betterAuthId", "auth|outra@ex.com"))
      .unique();
    if (!dona || !outra) throw new Error("contas não criadas");

    const rosa = await ctx.db.insert("materials", {
      userId: dona._id, nome: "Rosa", searchName: "rosa", unidade: "haste",
      categoria: "Flores", custoReferencia: 4.2, margemPercentual: 10,
      variedade: "Avalanche", updatedAt: NOW,
    });
    const eucalipto = await ctx.db.insert("materials", {
      userId: dona._id, nome: "Eucalipto", searchName: "eucalipto", unidade: "maco",
      categoria: "Folhagens", custoReferencia: 18, updatedAt: NOW,
    });

    const eventId = await ctx.db.insert("events", {
      userId: dona._id, name: "Marina & Gabriel", type: "wedding", date: "2026-12-12",
      location: "Fazenda Santa Clara", clientName: "Cliente Secreta Souza",
      clientPhone: "(11) 98888-7777", status: "confirmed",
    });
    const eventoDaOutra = await ctx.db.insert("events", {
      userId: outra._id, name: "Evento alheio", type: "wedding", date: "2026-12-20",
      location: "Outro lugar", clientName: "Alheia", status: "confirmed",
    });

    const base = {
      userId: dona._id, eventId, order: 0, includeInAssemblyReport: true,
      checkOnAssembly: true, visibility: "interno" as const, createdAt: NOW, updatedAt: NOW,
    };

    // 20 mesas: 5 rosas EM CADA, e 2 maços de eucalipto NO TOTAL.
    const mesasId = await ctx.db.insert("assemblyItems", {
      ...base, area: "tables", name: "Arranjo baixo", ambiente: "Mesa dos convidados",
      quantity: 20,
      receita: [
        {
          materialId: rosa, nome: "Rosa", unidade: "haste", quantidade: 5,
          categoria: "Flores", custoReferencia: 4.2, margemPercentual: 10,
          variedade: "Avalanche", cor: "branca", origem: "natural" as const,
          notes: "Fornecedor Flores do Vale cobra R$ 4,20",
          orientacaoFlorista: "Abrir os botões na véspera",
        },
        {
          materialId: eucalipto, nome: "Eucalipto", unidade: "maco", quantidade: 2,
          categoria: "Folhagens", custoReferencia: 18,
          distribuicao: "total" as const, cor: "verde",
        },
        // Orientação: sem quantidade confiável.
        {
          nome: "Folhagem do jardim", unidade: "un", quantidade: 0,
          apenasOrientacao: true, notes: "pegar no sítio do primo",
          orientacaoFlorista: "o que estiver bonito no dia",
        },
      ],
      floral: {
        formato: "Compacto, baixo",
        altura: "Até 30 cm",
        cuidados: "Hortênsia fora da água murcha em 2 h",
        horario: "Entregar às 14h",
      },
    });

    // Cerimônia: meio maço de eucalipto por arranjo — fração com unidade.
    const cerimoniaId = await ctx.db.insert("assemblyItems", {
      ...base, order: 1, area: "ceremony", name: "Arranjo lateral", quantity: 4,
      receita: [
        {
          materialId: rosa, nome: "Rosa", unidade: "haste", quantidade: 12,
          cor: "rosê", origem: "permanente" as const, variedade: "Avalanche",
        },
        {
          materialId: eucalipto, nome: "Eucalipto", unidade: "maco", quantidade: 0.5,
        },
      ],
    });

    // Referência visual: não vai para o florista.
    await ctx.db.insert("assemblyItems", {
      ...base, order: 2, area: "lounge", name: "Lounge inspiração", quantity: 100,
      projectScope: "referencia",
      receita: [{ materialId: rosa, nome: "Rosa", unidade: "haste", quantidade: 99 }],
    });

    // Item do projeto SEM receita: a ficha conta, mas não inventa.
    await ctx.db.insert("assemblyItems", {
      ...base, order: 3, area: "cake", name: "Mesa do bolo", quantity: 1,
    });

    return { donaId: dona._id, outraId: outra._id, eventId, eventoDaOutra, mesasId, cerimoniaId, rosa, eucalipto };
  });

  return { t, sessao, sessaoDaOutra, ...ids };
}

describe("quantidade por arranjo × total distribuído", () => {
  it("5 rosas em cada uma das 20 mesas são 100 hastes", () => {
    const total = necessidadeDoComponente(
      { quantidade: 20 },
      { quantidade: 5 },
    );
    expect(total).toBe(100);
  });

  it("2 maços distribuídos entre as 20 mesas continuam 2 maços", () => {
    const total = necessidadeDoComponente(
      { quantidade: 20 },
      { quantidade: 2, distribuicao: "total" },
    );
    expect(total).toBe(2);
  });

  it("distribuição ausente é POR ARRANJO — toda receita antiga continua valendo", () => {
    expect(necessidadeDoComponente({ quantidade: 20 }, { quantidade: 2 })).toBe(40);
    expect(
      necessidadeDoComponente({ quantidade: 20 }, { quantidade: 2, distribuicao: "por_arranjo" }),
    ).toBe(40);
  });

  it("a frase da ficha distingue as duas, e não divide o total por arranjo", () => {
    const porArranjo = textoDaQuantidade({
      porArranjo: 5, total: 100, unidade: "haste", unidades: 20, distribuido: false,
    });
    // A abreviatura é a de `lib/materiais.ts` — a MESMA da ficha técnica e do
    // consolidado. A ficha do florista não inventa plural próprio.
    expect(porArranjo).toBe("5 haste por arranjo · 100 haste no total");

    const distribuido = textoDaQuantidade({
      porArranjo: null, total: 2, unidade: "maco", unidades: 20, distribuido: true,
    });
    expect(distribuido).toContain("distribuídos entre os 20 arranjos");
    // 2 ÷ 20 = 0,1 maço é um número que ninguém separa na bancada.
    expect(distribuido).not.toContain("0,1");
  });

  it("fração com unidade explícita: meio maço por arranjo em 4 arranjos = 2 maços", () => {
    expect(necessidadeDoComponente({ quantidade: 4 }, { quantidade: 0.5 })).toBe(2);
  });
});

describe("orientação sem quantidade", () => {
  it("não entra em total nenhum, nem com quantidade escrita na linha", () => {
    expect(
      necessidadeDoComponente(
        { quantidade: 20 },
        { quantidade: 99, apenasOrientacao: true },
      ),
    ).toBe(0);
  });

  it("fica fora do consolidado da ficha técnica e do resumo do florista", () => {
    const composicao = {
      _id: "c1", nome: "Arranjo", area: "tables", quantidade: 10,
      receita: [
        { nome: "Rosa", unidade: "haste", quantidade: 3 },
        { nome: "Folhagem a gosto", unidade: "un", quantidade: 5, apenasOrientacao: true },
      ],
    };
    const consolidado = consolidarMateriais([composicao], ehObrigacaoDeMontagem);
    expect(consolidado.map((l) => l.nome)).toEqual(["Rosa"]);
    expect(resumoDeMateriais([composicao]).map((l) => l.nome)).toEqual(["Rosa"]);
  });

  it("aparece como orientação, separada dos materiais — com a orientação ESCRITA para o florista", () => {
    const { materiais, orientacoes } = linhasDaComposicao({
      _id: "c1", nome: "Arranjo", area: "tables", quantidade: 10,
      receita: [
        { nome: "Rosa", unidade: "haste", quantidade: 3, notes: "interno: fornecedor X" },
        {
          nome: "Folhagem a gosto", unidade: "un", quantidade: 0, apenasOrientacao: true,
          notes: "interno: pegar no sítio", orientacaoFlorista: "o que houver",
        },
      ],
    });
    expect(materiais).toHaveLength(1);
    expect(orientacoes).toEqual([{ nome: "Folhagem a gosto", orientacaoFlorista: "o que houver" }]);
    // A anotação interna não sai em nenhuma das duas listas.
    expect(JSON.stringify({ materiais, orientacoes })).not.toContain("interno");
  });
});

describe("unidades diferentes não se somam", () => {
  it("rosa em haste e rosa em maço são duas linhas do resumo", () => {
    const linhas = resumoDeMateriais([
      {
        _id: "c1", nome: "A", area: "tables", quantidade: 1,
        receita: [
          { nome: "Rosa", unidade: "haste", quantidade: 10 },
          { nome: "Rosa", unidade: "maco", quantidade: 2 },
        ],
      },
    ]);
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.unidade).sort()).toEqual(["haste", "maco"]);
  });

  it("cores diferentes do mesmo material são DUAS linhas, cada uma com a sua cor", () => {
    const linhas = resumoDeMateriais([
      {
        _id: "c1", nome: "A", area: "tables", quantidade: 1,
        receita: [{ materialId: "m1", nome: "Rosa", unidade: "haste", quantidade: 5, cor: "branca" }],
      },
      {
        _id: "c2", nome: "B", area: "ceremony", quantidade: 1,
        receita: [{ materialId: "m1", nome: "Rosa", unidade: "haste", quantidade: 5, cor: "rosê" }],
      },
    ]);
    expect(linhas.map((l) => [l.cor, l.total])).toEqual([["branca", 5], ["rosê", 5]]);
  });
});

describe("o resumo não soma itens diferentes", () => {
  const composicao = (receita: object[]) => ({ _id: "c", nome: "A", area: "tables", quantidade: 1, receita: receita as never });

  it("natural e permanente da mesma rosa, na mesma cor, são compras separadas", () => {
    const linhas = resumoDeMateriais([
      composicao([
        { materialId: "m1", nome: "Rosa", unidade: "haste", quantidade: 100, cor: "branca", origem: "natural" },
        { materialId: "m1", nome: "Rosa", unidade: "haste", quantidade: 48, cor: "branca", origem: "permanente" },
      ]),
    ]);
    expect(linhas.map((l) => [l.origem, l.total])).toEqual([["natural", 100], ["permanente", 48]]);
  });

  it("variedades diferentes não se somam; sem variedade é outra linha", () => {
    const linhas = resumoDeMateriais([
      composicao([
        { nome: "Rosa", unidade: "haste", quantidade: 10, variedade: "Avalanche" },
        { nome: "Rosa", unidade: "haste", quantidade: 10, variedade: "Vendela" },
        { nome: "Rosa", unidade: "haste", quantidade: 10 },
      ]),
    ]);
    expect(linhas).toHaveLength(3);
    expect(linhas.every((l) => l.total === 10)).toBe(true);
  });

  it("o MESMO item em várias composições soma — maiúscula e espaço na cor não separam", () => {
    const linhas = resumoDeMateriais([
      composicao([{ materialId: "m1", nome: "Rosa", unidade: "haste", quantidade: 5, cor: "Branca", origem: "natural" }]),
      { ...composicao([{ materialId: "m1", nome: "Rosa", unidade: "haste", quantidade: 0.5, cor: " branca ", origem: "natural" }]), _id: "c2", quantidade: 4 },
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].total).toBe(7);
    expect(linhas[0].cor).toBe("Branca");
    expect(linhas[0].origens).toHaveLength(2);
  });

  it("dois materiais do catálogo com o mesmo nome continuam separados (pelo id)", () => {
    const linhas = resumoDeMateriais([
      composicao([
        { materialId: "m1", nome: "Rosa", unidade: "haste", quantidade: 1 },
        { materialId: "m2", nome: "Rosa", unidade: "haste", quantidade: 1 },
      ]),
    ]);
    expect(linhas.map((l) => l.materialId)).toEqual(["m1", "m2"]);
  });
});

describe("a conta escrita na Ficha Técnica", () => {
  it("por unidade × N, total distribuído e orientação — cada um com a sua frase", () => {
    expect(textoDaConta(contaDaLinha({ quantidade: 20 }, { quantidade: 5 }), "haste")).toBe(
      "5 haste × 20 = 100 haste",
    );
    const distribuido = textoDaConta(contaDaLinha({ quantidade: 20 }, { quantidade: 2, distribuicao: "total" }), "maco");
    expect(distribuido).toContain("no total, distribuídos");
    expect(distribuido).not.toContain("×");
    // Orientação com a quantidade PRESERVADA continua sem número na conta.
    const orientacao = textoDaConta(contaDaLinha({ quantidade: 20 }, { quantidade: 7, apenasOrientacao: true }), "un");
    expect(orientacao).toBe("orientação, fora dos totais");
    expect(orientacao).not.toMatch(/\d/);
  });

  it("meio maço por arranjo em 4 arranjos: fração com unidade, sem conversão", () => {
    expect(textoDaConta(contaDaLinha({ quantidade: 4 }, { quantidade: 0.5 }), "maco")).toBe("0,5 maço × 4 = 2 maço".replace("maço", "maço"));
  });
});

describe("a ficha do florista, sobre banco real", () => {
  it("soma por arranjo e total distribuído na mesma leitura", async () => {
    const { t, sessao, eventId } = await cenario();
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha).not.toBeNull();

    // 20×5 brancas naturais nas mesas; 4×12 rosê permanentes na cerimônia.
    // Duas compras diferentes — o resumo NÃO soma 148.
    const rosas = ficha!.resumo.filter((l) => l.nome === "Rosa" && l.unidade === "haste");
    expect(rosas.map((l) => [l.cor, l.origem, l.total])).toEqual([
      ["branca", "natural", 100],
      ["rosê", "permanente", 48],
    ]);

    // 2 maços distribuídos (verde) e 4 × meio maço (sem cor) = 2 + 2. Não 40.
    const euc = ficha!.resumo.filter((l) => l.nome === "Eucalipto");
    expect(euc.map((l) => [l.cor, l.total])).toEqual([[null, 2], ["verde", 2]]);
  });

  it("referência visual não vai para o florista, e item sem receita é contado sem ser inventado", async () => {
    const { t, sessao, eventId } = await cenario();
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha!.composicoes.map((c) => c.nome).sort()).toEqual([
      "Arranjo baixo",
      "Arranjo lateral",
    ]);
    expect(ficha!.foraDoProjeto).toBe(1);
    expect(ficha!.semReceita).toBe(1);
  });

  it("não devolve NENHUM valor financeiro", async () => {
    const { t, sessao, eventId } = await cenario();
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    const texto = JSON.stringify(ficha);
    for (const proibido of ["custoReferencia", "margemPercentual", "custoEstimado", "4.2", "sugerido"]) {
      expect(texto).not.toContain(proibido);
    }
  });

  it("não devolve contato pessoal nem anotação interna — só o que foi escrito para o florista", async () => {
    const { sessao, eventId } = await cenario();
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId, incluirFotos: true });
    const texto = JSON.stringify(ficha);
    for (const proibido of [
      "Cliente Secreta", "98888", // contatos da cliente
      "Flores do Vale", "R$", "sítio do primo",      // notas internas da receita
      "\"cliente\"", "\"notes\"",
    ]) {
      expect(texto).not.toContain(proibido);
    }
    // O evento continua identificado pelo nome.
    expect(ficha!.evento.nome).toBe("Marina & Gabriel");
    // A orientação escrita PARA o florista vai.
    expect(texto).toContain("Abrir os botões na véspera");
    expect(texto).toContain("o que estiver bonito no dia");
  });

  it("cuidados e horários viram avisos destacados, e o checklist sai derivado", async () => {
    const { t, sessao, eventId } = await cenario();
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha!.avisos).toHaveLength(1);
    expect(ficha!.avisos[0].horario).toBe("Entregar às 14h");
    expect(ficha!.checklist).toHaveLength(2);
    expect(ficha!.checklist.find((c) => c.composicao === "Arranjo baixo")!.comAviso).toBe(true);
  });

  it("a legenda das flores avisa quando a foto pode não ser da cor pedida", async () => {
    const flores = legendaDasFlores(
      [
        {
          chave: "a", materialId: "m1", nome: "Rosa", variedade: null, unidade: "haste", total: 100,
          cor: "rosê", origem: "natural", origens: [],
        },
        {
          chave: "b", materialId: "m2", nome: "Eucalipto", variedade: null, unidade: "maco", total: 2,
          cor: null, origem: null, origens: [],
        },
      ],
      (materialId) =>
        materialId === "m1"
          ? { fotoUrl: "https://arquivo/rosa.jpg", variedade: "Avalanche" }
          : { fotoUrl: null, variedade: null },
    );
    // A legenda preserva a ordem recebida — o resumo já chega alfabético.
    expect(flores.map((f) => f.nome)).toEqual(["Rosa", "Eucalipto"]);
    // Tem foto E tem cor pedida: a foto é da flor, não da cor.
    expect(flores[0].fotoIlustrativa).toBe(true);
    expect(flores[0].variedade).toBe("Avalanche");
    // Sem foto não há o que ressalvar.
    expect(flores[1].fotoIlustrativa).toBe(false);
  });
});

describe("isolamento entre contas", () => {
  it("evento de outra conta não devolve ficha nenhuma", async () => {
    const { sessaoDaOutra, eventId } = await cenario();
    const ficha = await sessaoDaOutra.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha).toBeNull();
  });

  it("sem sessão, a ficha não abre", async () => {
    const { t, eventId } = await cenario();
    const ficha = await t.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha).toBeNull();
  });

  it("gravar instrução em item de outra conta responde NOT_FOUND", async () => {
    const { sessaoDaOutra, mesasId } = await cenario();
    await expect(
      sessaoDaOutra.mutation(api.producaoFloral.setInstrucoes, {
        id: mesasId,
        floral: { formato: "quero mexer no item alheio" },
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("as flores da ficha de outra conta não vazam", async () => {
    const { sessaoDaOutra, eventId } = await cenario();
    const flores = await sessaoDaOutra.query(api.producaoFloral.floresDaFicha, { eventId });
    expect(flores).toEqual([]);
  });
});

describe("gravar e limpar instruções", () => {
  it("grava, aparece na ficha e some quando tudo fica em branco", async () => {
    const { sessao, cerimoniaId, eventId } = await cenario();

    await sessao.mutation(api.producaoFloral.setInstrucoes, {
      id: cerimoniaId,
      floral: { montagem: "Espuma hidratada", horario: "  " },
    });
    let ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    const lateral = () => ficha!.composicoes.find((c) => c.nome === "Arranjo lateral")!;
    expect(lateral().instrucoes.montagem).toBe("Espuma hidratada");
    // Campo só com espaço não vira string vazia impressa no papel.
    expect(lateral().instrucoes.horario).toBeUndefined();

    await sessao.mutation(api.producaoFloral.setInstrucoes, {
      id: cerimoniaId,
      floral: { montagem: "" },
    });
    ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(lateral().instrucoes).toEqual({});
  });

  it("recusa texto absurdamente longo em vez de gravar um contrato no campo", async () => {
    const { sessao, cerimoniaId } = await cenario();
    await expect(
      sessao.mutation(api.producaoFloral.setInstrucoes, {
        id: cerimoniaId,
        floral: { montagem: "x".repeat(2001) },
      }),
    ).rejects.toThrow(/2000/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE CÓDIGO — o PDF do florista não pode ganhar dinheiro nem refazer conta.
// ─────────────────────────────────────────────────────────────────────────────

const FONTE_PDF = readFileSync("src/lib/generate-ficha-floral-pdf.ts", "utf-8");
/**
 * A fonte SEM comentário. O cabeçalho do arquivo explica o que o documento não
 * faz ("NENHUM VALOR"), e um guarda que lê a prosa acusaria o próprio
 * comentário. Já aconteceu neste repositório mais de uma vez.
 */
const CODIGO_PDF = FONTE_PDF.split("\n")
  .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
  .join("\n");

describe("trava do PDF do florista", () => {
  it("não imprime valor financeiro", () => {
    for (const proibido of [
      "custoReferencia",
      "custoEstimado",
      "margemPercentual",
      "sugerido",
      // `currency` e `R$` são as duas formas de dinheiro aparecer num PDF
      // deste repositório. `toLocaleString` NÃO entra na lista: ele formata a
      // data de geração, e proibi-lo acusaria o carimbo da versão como se
      // fosse preço.
      "currency",
      "R$",
    ]) {
      expect(CODIGO_PDF).not.toContain(proibido);
    }
    // O que importa é que nenhum `toLocaleString` esteja formatando moeda.
    expect(CODIGO_PDF).not.toMatch(/toLocaleString\([^)]*currency/);
  });

  it("não multiplica nada por conta própria: a conta vem pronta", () => {
    expect(CODIGO_PDF).not.toMatch(/quantidade\s*\*/);
    expect(CODIGO_PDF).not.toContain("necessidadeDoComponente");
    expect(CODIGO_PDF).toContain("textoDaQuantidade");
  });

  it("entrega pelo caminho único e não chama doc.save direto", () => {
    expect(CODIGO_PDF).toContain("entregarPdf");
    expect(CODIGO_PDF).not.toContain("doc.save(");
  });

  it("não imprime contato da cliente nem anotação interna", () => {
    expect(CODIGO_PDF).not.toMatch(/\.cliente\b/);
    expect(CODIGO_PDF).not.toMatch(/clientPhone|clientEmail|telefone/);
    expect(CODIGO_PDF).not.toMatch(/\.notes\b/);
    expect(CODIGO_PDF).toContain("orientacaoFlorista");
  });

  it("nomeia as duas fotos com todas as letras", () => {
    expect(FONTE_PDF).toContain("REFERÊNCIA DO ARRANJO");
    expect(FONTE_PDF).toContain("FOTOS DAS FLORES");
    expect(FONTE_PDF).toContain("pode não ser a cor pedida");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR A PARTE FLORAL NÃO MEXE NO RESTO DA LINHA
// ─────────────────────────────────────────────────────────────────────────────

const linhaDaTela = (
  receita: readonly { nome: string; materialId?: Id<"materials">; cor?: string; origem?: "natural" | "permanente"; distribuicao?: string; apenasOrientacao?: boolean; orientacaoFlorista?: string }[],
  indice: number,
  mudanca: Partial<{ cor: string; origem: "natural" | "permanente"; distribuicao: "por_arranjo" | "total"; apenasOrientacao: boolean; orientacaoFlorista: string; quantidade: number }> = {},
) => {
  const l = receita[indice];
  return {
    indice,
    nome: l.nome,
    materialId: l.materialId,
    cor: l.cor,
    origem: l.origem,
    distribuicao: (l.distribuicao === "total" ? "total" : "por_arranjo") as "por_arranjo" | "total",
    apenasOrientacao: l.apenasOrientacao === true,
    orientacaoFlorista: l.orientacaoFlorista,
    ...mudanca,
  };
};

describe("setLinhasFlorais grava só a parte floral", () => {
  const lerItem = (t: Awaited<ReturnType<typeof cenario>>["t"], id: Id<"assemblyItems">) =>
    t.run(async (ctx) => (await ctx.db.get(id))!);

  it("mudar a cor não toca custo, margem, unidade, nome, variedade nem quantidade — mesmo com o catálogo mudado", async () => {
    const { t, sessao, mesasId, rosa } = await cenario();
    // O catálogo mudou DEPOIS da receita: custo, margem e unidade novos.
    await t.run(async (ctx) => ctx.db.patch(rosa, { custoReferencia: 9.99, margemPercentual: 50, unidade: "maco", variedade: "Vendela" }));
    const antes = await lerItem(t, mesasId);

    await sessao.mutation(api.producaoFloral.setLinhasFlorais, {
      id: mesasId,
      linhas: [linhaDaTela(antes.receita!, 0, { cor: "rosê", origem: "permanente" })],
    });

    const depois = (await lerItem(t, mesasId)).receita![0];
    expect(depois).toMatchObject({
      nome: "Rosa", unidade: "haste", quantidade: 5, custoReferencia: 4.2, margemPercentual: 10,
      variedade: "Avalanche", notes: "Fornecedor Flores do Vale cobra R$ 4,20",
      cor: "rosê", origem: "permanente",
    });
    // As outras linhas não foram reescritas.
    expect((await lerItem(t, mesasId)).receita!.slice(1)).toEqual(antes.receita!.slice(1));
  });

  it("a quantidade só muda quando vem no pedido", async () => {
    const { t, sessao, cerimoniaId } = await cenario();
    const antes = await lerItem(t, cerimoniaId);
    await sessao.mutation(api.producaoFloral.setLinhasFlorais, {
      id: cerimoniaId,
      linhas: [linhaDaTela(antes.receita!, 1, { quantidade: 0.75 })],
    });
    expect((await lerItem(t, cerimoniaId)).receita![1].quantidade).toBe(0.75);
  });

  it("'só orientação' guarda a quantidade, e desmarcar devolve o número", async () => {
    const { t, sessao, cerimoniaId, eventId } = await cenario();
    const antes = await lerItem(t, cerimoniaId);
    await sessao.mutation(api.producaoFloral.setLinhasFlorais, {
      id: cerimoniaId,
      linhas: [linhaDaTela(antes.receita!, 0, { apenasOrientacao: true })],
    });
    const marcada = (await lerItem(t, cerimoniaId)).receita![0];
    expect(marcada).toMatchObject({ apenasOrientacao: true, quantidade: 12 });
    // Fora dos totais enquanto marcada: a rosa rosê some do resumo.
    let ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha!.resumo.some((l) => l.cor === "rosê")).toBe(false);

    await sessao.mutation(api.producaoFloral.setLinhasFlorais, {
      id: cerimoniaId,
      linhas: [linhaDaTela((await lerItem(t, cerimoniaId)).receita!, 0, { apenasOrientacao: false })],
    });
    const desmarcada = (await lerItem(t, cerimoniaId)).receita![0];
    expect(desmarcada.apenasOrientacao).toBeUndefined();
    expect(desmarcada.quantidade).toBe(12);
    ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha!.resumo.find((l) => l.cor === "rosê")!.total).toBe(48);
  });

  it("a receita mudou no meio (nome ou material diferente no índice): CONFLITO e nada gravado", async () => {
    const { t, sessao, mesasId, eucalipto } = await cenario();
    const antes = await lerItem(t, mesasId);
    await expect(
      sessao.mutation(api.producaoFloral.setLinhasFlorais, {
        id: mesasId,
        linhas: [
          linhaDaTela(antes.receita!, 0, { cor: "amarela" }),
          { ...linhaDaTela(antes.receita!, 1), nome: "Rosa" },
        ],
      }),
    ).rejects.toThrow(/receita mudou/);
    await expect(
      sessao.mutation(api.producaoFloral.setLinhasFlorais, {
        id: mesasId,
        linhas: [{ ...linhaDaTela(antes.receita!, 0), materialId: eucalipto }],
      }),
    ).rejects.toThrow(/receita mudou/);
    await expect(
      sessao.mutation(api.producaoFloral.setLinhasFlorais, {
        id: mesasId,
        linhas: [{ ...linhaDaTela(antes.receita!, 0), indice: 9 }],
      }),
    ).rejects.toThrow(/receita mudou/);
    expect((await lerItem(t, mesasId)).receita).toEqual(antes.receita);
  });

  it("quantidade negativa ou inválida é recusada", async () => {
    const { t, sessao, mesasId } = await cenario();
    const antes = await lerItem(t, mesasId);
    for (const quantidade of [-1, Number.NaN]) {
      await expect(
        sessao.mutation(api.producaoFloral.setLinhasFlorais, {
          id: mesasId,
          linhas: [linhaDaTela(antes.receita!, 0, { quantidade })],
        }),
      ).rejects.toThrow(/inválida/);
    }
  });

  it("item de outra conta: NOT_FOUND, e o item não muda", async () => {
    const { t, sessaoDaOutra, mesasId } = await cenario();
    const antes = await lerItem(t, mesasId);
    await expect(
      sessaoDaOutra.mutation(api.producaoFloral.setLinhasFlorais, {
        id: mesasId,
        linhas: [linhaDaTela(antes.receita!, 0, { cor: "preta" })],
      }),
    ).rejects.toThrow(/não encontrado/i);
    expect((await lerItem(t, mesasId)).receita).toEqual(antes.receita);
  });

  it("salvar na Ficha Técnica (setReceita) mantém a parte floral que veio na linha", async () => {
    const { t, sessao, mesasId } = await cenario();
    const antes = (await lerItem(t, mesasId)).receita!;
    // O que o diálogo da Ficha Técnica manda agora: a linha com o resto preservado.
    await sessao.mutation(api.fichaTecnica.setReceita, {
      id: mesasId,
      receita: antes.map((l) => ({
        materialId: l.materialId, nome: l.nome, unidade: l.unidade, quantidade: l.quantidade,
        notes: l.notes, cor: l.cor, origem: l.origem as never, distribuicao: l.distribuicao as never,
        apenasOrientacao: l.apenasOrientacao, orientacaoFlorista: l.orientacaoFlorista,
      })),
    });
    const depois = (await lerItem(t, mesasId)).receita!;
    expect(depois.map((l) => [l.cor, l.origem, l.distribuicao, l.apenasOrientacao, l.orientacaoFlorista])).toEqual(
      antes.map((l) => [l.cor, l.origem, l.distribuicao, l.apenasOrientacao, l.orientacaoFlorista]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FOTOS: material de outra conta e foto da Galeria de outro evento
// ─────────────────────────────────────────────────────────────────────────────

describe("fotos respeitam conta e evento", () => {
  it("um materialId de OUTRA conta gravado numa receita antiga não traz foto nem variedade", async () => {
    const { t, sessao, eventId, mesasId, outraId } = await cenario();
    const alheio = await t.run(async (ctx) => {
      const foto = await ctx.storage.store(new Blob(["foto alheia"], { type: "image/jpeg" }));
      return ctx.db.insert("materials", {
        userId: outraId, nome: "Peônia", searchName: "peonia", unidade: "haste",
        variedade: "Sarah Bernhardt", fotoStorageId: foto, updatedAt: NOW,
      });
    });
    // Dado legado: a guarda de `setReceita` hoje recusa — então entra direto.
    await t.run(async (ctx) => {
      const item = (await ctx.db.get(mesasId))!;
      await ctx.db.patch(mesasId, {
        receita: [...item.receita!, { materialId: alheio, nome: "Peônia", unidade: "haste" as const, quantidade: 1 }],
      });
    });
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId, incluirFotos: true });
    const peonia = ficha!.flores.find((f) => f.nome === "Peônia")!;
    expect(peonia.fotoUrl).toBeNull();
    expect(peonia.variedade).toBeNull();
    expect(JSON.stringify(ficha)).not.toContain("Sarah Bernhardt");
    // E a guarda de gravação continua: material alheio não entra pela receita.
    await expect(
      sessao.mutation(api.fichaTecnica.setReceita, {
        id: mesasId,
        receita: [{ materialId: alheio, nome: "Peônia", unidade: "haste", quantidade: 1 }],
      }),
    ).rejects.toThrow(/não encontrado/i);
  });

  it("a foto da flor vem pelo ID do material — o da própria conta aparece", async () => {
    const { t, sessao, eventId, rosa } = await cenario();
    await t.run(async (ctx) => {
      const foto = await ctx.storage.store(new Blob(["rosa"], { type: "image/jpeg" }));
      await ctx.db.patch(rosa, { fotoStorageId: foto });
    });
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId, incluirFotos: true });
    const rosas = ficha!.flores.filter((f) => f.nome === "Rosa");
    expect(rosas.length).toBe(2);
    expect(rosas.every((f) => f.materialId === rosa && f.fotoUrl)).toBe(true);
    // Sem pedir fotos, nenhuma URL é montada.
    const semFotos = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(semFotos!.flores.every((f) => f.fotoUrl === null)).toBe(true);
  });

  it("referência apontando para foto da Galeria de OUTRO evento da mesma conta não entra", async () => {
    const { t, sessao, eventId, mesasId, cerimoniaId, donaId } = await cenario();
    await t.run(async (ctx) => {
      const outroEvento = await ctx.db.insert("events", {
        userId: donaId, name: "Outro evento", type: "wedding", date: "2027-01-10",
        location: "L", clientName: "C", status: "confirmed",
      });
      const arquivo = await ctx.storage.store(new Blob(["x"], { type: "image/jpeg" }));
      const deOutroEvento = await ctx.db.insert("eventPhotos", {
        userId: donaId, eventId: outroEvento, storageId: arquivo, filename: "outro.jpg", category: CATEGORIA, order: 0, uploadedAt: NOW,
      });
      const doEvento = await ctx.db.insert("eventPhotos", {
        userId: donaId, eventId, storageId: arquivo, filename: "deste.jpg", category: CATEGORIA, order: 0, uploadedAt: NOW,
      });
      await ctx.db.patch(mesasId, { referencePhotoId: deOutroEvento });
      await ctx.db.patch(cerimoniaId, { referencePhotoId: doEvento });
    });
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    const porNome = (n: string) => ficha!.composicoes.find((c) => c.nome === n)!;
    expect(porNome("Arranjo baixo").referenciaUrl).toBeNull();
    // Controle: a foto do PRÓPRIO evento aparece.
    expect(porNome("Arranjo lateral").referenciaUrl).toBeTruthy();
  });
});
