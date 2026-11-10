import { describe, expect, it } from "vitest";
import { lugaresDoLayout, problemasDoLayout, semFotos, type DadosDoLayout } from "./layoutSalao";
import { caixaDoElemento, distribuirMesas, MODELOS, PECAS, raioComCadeiras } from "./layoutSalaoBiblioteca";
import { interpretarRascunhoDaIa } from "./layoutSalaoIa";
import type { Id } from "../_generated/dataModel";

// ═════════════════════════════════════════════════════════════════════════════
// LAYOUT DO SALÃO — regras puras (sem banco)
// ═════════════════════════════════════════════════════════════════════════════

const salao = (largura = 20, comprimento = 25): DadosDoLayout => ({
  salao: { largura, comprimento },
  aberturas: [],
  pilares: [],
  elementos: [],
  mesas: { diametro: 1.8, lugares: 10, posicoes: [] },
});

describe("modelos prontos", () => {
  it.each(MODELOS.map((m) => [m.chave, m] as const))(
    "%s gera layout válido em salões pequenos, médios e grandes",
    (_chave, modelo) => {
      for (const [l, c, n] of [[14, 18, 10], [26.9, 28.4, 28], [40, 50, 60]] as const) {
        const d = modelo.montar({ largura: l, comprimento: c, mesas: n });
        expect(problemasDoLayout(d), `${modelo.chave} ${l}x${c}`).toEqual([]);
        expect(d.mesas.posicoes.length).toBeLessThanOrEqual(n);
      }
    },
  );

  it("modelo é ponto de partida: dois usos geram objetos independentes", () => {
    const a = MODELOS[0].montar({ largura: 26.9, comprimento: 28.4, mesas: 10 });
    const b = MODELOS[0].montar({ largura: 26.9, comprimento: 28.4, mesas: 10 });
    a.elementos[0].rotulo = "MUDEI";
    expect(b.elementos[0].rotulo).not.toBe("MUDEI");
  });

  it("toda peça da biblioteca entra num layout válido", () => {
    const d = salao(30, 30);
    d.elementos = PECAS.map((p, i) => ({
      id: `e${i}`, forma: p.forma, categoria: p.categoria, rotulo: p.nome.toUpperCase(),
      cx: 15, cy: 15, largura: p.largura, profundidade: p.profundidade,
    }));
    expect(problemasDoLayout(d)).toEqual([]);
    expect(new Set(PECAS.map((p) => p.chave)).size).toBe(PECAS.length);
  });
});

describe("distribuir mesas", () => {
  it("nenhuma mesa sobrepõe o palco nem outra mesa", () => {
    const d = salao(20, 25);
    d.elementos.push({
      id: "palco", forma: "retangulo", categoria: "palco", rotulo: "PALCO", cx: 10, cy: 2.5, largura: 10, profundidade: 5,
    });
    const r = raioComCadeiras(1.8);
    const mesas = distribuirMesas(d, 30);
    const palco = caixaDoElemento(d.elementos[0]);
    for (const m of mesas) {
      const dx = Math.max(palco.x0 - m.cx, 0, m.cx - palco.x1);
      const dy = Math.max(palco.y0 - m.cy, 0, m.cy - palco.y1);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(r);
    }
    for (let i = 0; i < mesas.length; i++)
      for (let j = i + 1; j < mesas.length; j++)
        expect(Math.hypot(mesas[i].cx - mesas[j].cx, mesas[i].cy - mesas[j].cy)).toBeGreaterThanOrEqual(2 * r);
  });

  it("devolve SÓ as que couberam — não empilha mesa para bater a conta", () => {
    const d = salao(8, 8);
    const mesas = distribuirMesas(d, 50);
    expect(mesas.length).toBeGreaterThan(0);
    expect(mesas.length).toBeLessThan(50);
  });

  it("pedido de zero mesas não inventa mesa", () => {
    expect(distribuirMesas(salao(), 0)).toEqual([]);
  });
});

describe("leitura da resposta da IA", () => {
  it("resposta ilegível vira salão em branco com aviso — nunca lança", () => {
    const r = interpretarRascunhoDaIa("desculpe, não consegui", { largura: 18, comprimento: 22 });
    expect(r.dados.salao).toMatchObject({ largura: 18, comprimento: 22 });
    expect(r.avisos.join(" ")).toMatch(/não devolveu/);
    expect(problemasDoLayout(r.dados)).toEqual([]);
  });

  it("aceita cerca de código, vírgula decimal e número em texto", () => {
    const r = interpretarRascunhoDaIa(
      '```json\n{"salao":{"largura":"26,9","comprimento":28.4},"elementos":[{"categoria":"palco","forma":"retangulo","rotulo":"Palco","cx":"13,45","cy":2.5,"largura":10.84,"profundidade":5.13}]}\n```',
    );
    expect(r.dados.salao.largura).toBe(26.9);
    expect(r.dados.elementos[0]).toMatchObject({ cx: 13.45, rotulo: "PALCO" });
  });

  it("posição fora do salão é trazida para dentro E avisada", () => {
    const r = interpretarRascunhoDaIa(
      JSON.stringify({ salao: { largura: 20, comprimento: 20 }, elementos: [{ categoria: "bar", forma: "oval", rotulo: "bar", cx: 80, cy: -4, largura: 5, profundidade: 3 }] }),
    );
    expect(r.dados.elementos[0]).toMatchObject({ cx: 20, cy: 0 });
    expect(r.avisos.join(" ")).toMatch(/fora do salão/);
    expect(problemasDoLayout(r.dados)).toEqual([]);
  });

  it("categoria inventada vira 'movel' e elemento sem posição é descartado", () => {
    const r = interpretarRascunhoDaIa(
      JSON.stringify({ salao: { largura: 20, comprimento: 20 }, elementos: [
        { categoria: "nave espacial", cx: 5, cy: 5, largura: 1, profundidade: 1 },
        { categoria: "palco", largura: 8, profundidade: 4 },
      ] }),
    );
    expect(r.dados.elementos).toHaveLength(1);
    expect(r.dados.elementos[0].categoria).toBe("movel");
  });

  it("o nº de mesas que a pessoa pediu vale mais que o da IA, e a grade é avisada", () => {
    const r = interpretarRascunhoDaIa(
      JSON.stringify({ salao: { largura: 26.9, comprimento: 28.4 }, mesas: { quantidade: 40, posicoes: [] } }),
      { mesas: 28 },
    );
    expect(r.dados.mesas.posicoes).toHaveLength(28);
    expect(r.avisos.join(" ")).toMatch(/grade|Couberam/);
    expect(problemasDoLayout(r.dados)).toEqual([]);
  });

  it("IA que devolve mais mesas que o pedido é cortada no pedido", () => {
    const posicoes = Array.from({ length: 10 }, (_, i) => ({ cx: 2 + i, cy: 5 }));
    const r = interpretarRascunhoDaIa(JSON.stringify({ salao: { largura: 20, comprimento: 20 }, mesas: { posicoes } }), { mesas: 4 });
    expect(r.dados.mesas.posicoes).toHaveLength(4);
  });

  it("medidas ausentes viram 20 × 25 com aviso para ajustar", () => {
    const r = interpretarRascunhoDaIa(JSON.stringify({ elementos: [] }));
    expect(r.dados.salao).toMatchObject({ largura: 20, comprimento: 25 });
    expect(r.avisos.join(" ")).toMatch(/Ajuste antes de salvar/);
  });
});

describe("derivados e cópia", () => {
  it("lugares = mesas × lugares + cadeiras das mesas principais", () => {
    const d = salao();
    d.mesas.posicoes = [{ id: "a", cx: 3, cy: 3 }, { id: "b", cx: 8, cy: 3 }];
    d.elementos.push({
      id: "p", forma: "retangulo", categoria: "principal", rotulo: "FAMÍLIA", cx: 10, cy: 15,
      largura: 4.8, profundidade: 1.2, cadeirasPorLado: 8,
    });
    expect(lugaresDoLayout(d)).toBe(36);
  });

  it("semFotos remove todo ponteiro de foto e mantém o resto", () => {
    const d = salao();
    d.elementos.push({
      id: "bar", forma: "oval", categoria: "bar", rotulo: "BAR", cx: 10, cy: 10, largura: 5, profundidade: 3,
      fotoId: "foto123" as Id<"eventPhotos">,
    });
    const copia = semFotos(d);
    expect(copia.elementos[0]).not.toHaveProperty("fotoId");
    expect(copia.elementos[0].rotulo).toBe("BAR");
    expect(d.elementos[0].fotoId).toBe("foto123");
  });

  it("problemas vêm todos de uma vez, sem repetição", () => {
    const d = salao();
    d.pilares = [
      { id: "p1", cx: 999, cy: 1, lado: 0.5 },
      { id: "p2", cx: 999, cy: 2, lado: 0.5 },
    ];
    d.mesas.lugares = 0;
    const p = problemasDoLayout(d);
    expect(p.filter((x) => x.includes("pilar"))).toHaveLength(1);
    expect(p.some((x) => x.includes("Lugares"))).toBe(true);
  });
});
