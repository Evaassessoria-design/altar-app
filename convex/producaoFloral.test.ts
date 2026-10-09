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
import { consolidarMateriais, necessidadeDoComponente } from "./lib/fichaTecnica";
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
//  5. que id de outra conta não devolve nada — nem o dado, nem a existência.
// ═════════════════════════════════════════════════════════════════════════════

const NOW = "2026-10-09T12:00:00.000Z";

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
      location: "Fazenda Santa Clara", clientName: "Marina", status: "confirmed",
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
        },
        {
          materialId: eucalipto, nome: "Eucalipto", unidade: "maco", quantidade: 2,
          categoria: "Folhagens", custoReferencia: 18,
          distribuicao: "total" as const, cor: "verde",
        },
        // Orientação: sem quantidade confiável.
        {
          nome: "Folhagem do jardim", unidade: "un", quantidade: 0,
          apenasOrientacao: true, notes: "o que estiver bonito no dia",
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

  it("aparece como orientação, separada dos materiais", () => {
    const { materiais, orientacoes } = linhasDaComposicao({
      _id: "c1", nome: "Arranjo", area: "tables", quantidade: 10,
      receita: [
        { nome: "Rosa", unidade: "haste", quantidade: 3 },
        { nome: "Folhagem a gosto", unidade: "un", quantidade: 0, apenasOrientacao: true, notes: "o que houver" },
      ],
    });
    expect(materiais).toHaveLength(1);
    expect(orientacoes).toEqual([{ nome: "Folhagem a gosto", notes: "o que houver" }]);
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

  it("cores diferentes do mesmo material não viram uma cor inventada", () => {
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
    expect(linhas).toHaveLength(1);
    expect(linhas[0].total).toBe(10);
    expect(linhas[0].cor).toBeNull();
  });
});

describe("a ficha do florista, sobre banco real", () => {
  it("soma por arranjo e total distribuído na mesma leitura", async () => {
    const { t, sessao, eventId } = await cenario();
    const ficha = await sessao.query(api.producaoFloral.fichaDoFlorista, { eventId });
    expect(ficha).not.toBeNull();

    // 20×5 nas mesas + 4×12 na cerimônia = 148 hastes.
    const rosa = ficha!.resumo.find((l) => l.nome === "Rosa" && l.unidade === "haste")!;
    expect(rosa.total).toBe(148);

    // 2 maços distribuídos + 4 × meio maço = 4 maços. Não 40 + 2.
    const euc = ficha!.resumo.find((l) => l.nome === "Eucalipto")!;
    expect(euc.total).toBe(4);
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
          chave: "id:m1|haste", nome: "Rosa", unidade: "haste", total: 100,
          cor: "rosê", origem: "natural", origens: [],
        },
        {
          chave: "id:m2|maco", nome: "Eucalipto", unidade: "maco", total: 2,
          cor: null, origem: null, origens: [],
        },
      ],
      (chave) =>
        chave.startsWith("id:m1")
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

  it("nomeia as duas fotos com todas as letras", () => {
    expect(FONTE_PDF).toContain("REFERÊNCIA DO ARRANJO");
    expect(FONTE_PDF).toContain("FOTOS DAS FLORES");
    expect(FONTE_PDF).toContain("pode não ser a cor pedida");
  });
});
