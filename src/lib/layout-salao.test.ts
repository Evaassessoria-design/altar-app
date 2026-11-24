import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { DadosDoLayout } from "@/convex/lib/layoutSalao.ts";
import {
  desenharPlanta,
  duplicarAlvo,
  moverAlvo,
  removerAlvo,
  renumerarMesas,
  svgDaPlanta,
  textoSobre,
} from "./layout-salao.ts";

// ═════════════════════════════════════════════════════════════════════════════
// LAYOUT DO SALÃO — desenho e edição
//
// A trava principal é a de "um desenho, duas leituras": a planta da tela e a
// do PDF saem da MESMA lista de formas. Se alguém escrever um segundo desenho
// para o PDF, o papel que vai para os clientes deixa de bater com a tela.
// ═════════════════════════════════════════════════════════════════════════════

const base = (): DadosDoLayout => ({
  salao: { largura: 20, comprimento: 25, cortina: true },
  aberturas: [{ id: "a", parede: "esquerda", inicio: 20, fim: 23, rotulo: "ENTRADA", tipo: "entrada" }],
  pilares: [{ id: "p", cx: 10, cy: 12, lado: 0.5 }],
  elementos: [
    { id: "palco", forma: "retangulo", categoria: "palco", rotulo: "PALCO", cx: 10, cy: 2.5, largura: 10, profundidade: 5 },
    { id: "bar", forma: "oval", categoria: "bar", rotulo: "BAR & <DRINKS>", cx: 10, cy: 12, largura: 5, profundidade: 3, fotoId: undefined },
  ],
  mesas: {
    diametro: 1.8,
    lugares: 10,
    posicoes: [
      { id: "m1", cx: 15, cy: 5 },
      { id: "m2", cx: 3, cy: 20 },
      { id: "m3", cx: 8, cy: 20 },
    ],
  },
});

describe("um desenho, duas leituras", () => {
  it("o SVG do PDF é XML válido, escapa texto e numera todas as mesas", () => {
    const svg = svgDaPlanta(base());
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const textos = [...doc.querySelectorAll("text")].map((t) => t.textContent);
    expect(textos).toEqual(expect.arrayContaining(["1", "2", "3", "PALCO", "BAR & <DRINKS>", "ENTRADA"]));
  });

  it("o PDF nunca mostra a seleção", () => {
    const comSelecao = desenharPlanta(base(), { selecionado: { tipo: "mesa", id: "m1" } });
    expect(JSON.stringify(comSelecao)).toContain("#2563EB");
    expect(svgDaPlanta(base())).not.toContain("#2563EB");
  });

  it("o gerador de PDF desenha a planta por `svgDaPlanta`, não por conta própria", () => {
    const fonte = readFileSync("src/lib/generate-layout-pdf.ts", "utf-8");
    expect(fonte).toContain("svgDaPlanta(");
    expect(fonte).toContain("entregarPdf");
  });

  it("a tela desenha pela mesma lista de formas", () => {
    const fonte = readFileSync("src/components/layout-salao/planta-2d.tsx", "utf-8");
    expect(fonte).toContain("desenharPlanta(");
  });
});

describe("edição", () => {
  it("mover prende dentro do salão", () => {
    const d = moverAlvo(base(), { tipo: "mesa", id: "m1" }, 99, -5);
    expect(d.mesas.posicoes[0]).toMatchObject({ cx: 20, cy: 0 });
  });

  it("mover não muta o original (o desfazer depende disso)", () => {
    const original = base();
    moverAlvo(original, { tipo: "elemento", id: "bar" }, 1, 1);
    expect(original.elementos[1].cx).toBe(10);
  });

  it("renumerar vai do fundo para a frente, da esquerda para a direita", () => {
    const d = renumerarMesas(base());
    expect(d.mesas.posicoes.map((m) => m.id)).toEqual(["m2", "m3", "m1"]);
  });

  it("duplicar cria id novo e seleciona a cópia; remover tira só o alvo", () => {
    const r = duplicarAlvo(base(), { tipo: "elemento", id: "bar" })!;
    expect(r.dados.elementos).toHaveLength(3);
    expect(r.novo.id).not.toBe("bar");
    const sem = removerAlvo(r.dados, { tipo: "elemento", id: "bar" });
    expect(sem.elementos.map((e) => e.id)).toEqual(["palco", r.novo.id]);
  });

  it("texto claro sobre cor escura, escuro sobre clara", () => {
    expect(textoSobre("#3F3A34")).toBe("#FFFFFF");
    expect(textoSobre("#FCFBF8")).not.toBe("#FFFFFF");
  });
});
