import type {
  CategoriaDeElemento,
  DadosDoLayout,
  ElementoDoLayout,
} from "@/convex/lib/layoutSalao.ts";
import {
  pecaPorChave,
  raioComCadeiras,
  rotuloDaPeca,
  type PecaDaBiblioteca,
} from "@/convex/lib/layoutSalaoBiblioteca.ts";

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT DO SALÃO — o desenho 2D, em um lugar só.
//
// ── POR QUE PRIMITIVAS, E NÃO UM COMPONENTE SVG ─────────────────────────────
// A mesma planta sai em DOIS lugares: na tela, onde se arrasta mesa com o
// dedo, e no PDF que vai para os clientes. Se cada um desenhasse a sua, a
// primeira mudança de cor ou de rótulo faria o papel divergir da tela — e o
// papel é o que os clientes guardam.
//
// Então o desenho é uma LISTA de formas (`desenharPlanta`). O componente da
// tela transforma cada uma num elemento React com alça de arrastar; o PDF
// transforma a mesma lista numa string SVG (`svgDaPlanta`). Um desenho, duas
// leituras.
//
// Coordenadas: metros, com o eixo y invertido para a tela (a planta tem o
// palco embaixo; o SVG cresce para baixo).
// ─────────────────────────────────────────────────────────────────────────────

export type Alvo =
  | { tipo: "elemento"; id: string }
  | { tipo: "mesa"; id: string }
  | { tipo: "pilar"; id: string };

type Base = { alvo?: Alvo; transform?: string };

export type Forma =
  | (Base & { k: "rect"; x: number; y: number; w: number; h: number; rx?: number; fill: string; stroke?: string; sw?: number; dash?: string; opacity?: number })
  | (Base & { k: "circle"; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number; dash?: string })
  | (Base & { k: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: string; stroke?: string; sw?: number })
  | (Base & { k: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash?: string })
  | (Base & { k: "text"; x: number; y: number; texto: string; size: number; fill: string; weight?: number; anchor?: "start" | "middle" | "end"; rotate?: number; italic?: boolean });

/** Paleta neutra; a cor da empresa entra como destaque (`destaque`). */
export const CORES = {
  piso: "#F6F3EE",
  parede: "#3F3A34",
  cortina: "#D9C7A3",
  linha: "#3F3A34",
  texto: "#2B2723",
  textoClaro: "#FFFFFF",
  suave: "#8A847C",
  mesa: "#FFFFFF",
} as const;

const PREENCHIMENTO: Record<CategoriaDeElemento, string> = {
  palco: "#3F3A34",
  pista: "#FCFBF8",
  bar: "#C9A86A",
  bolo: "#EFE6D6",
  doces: "#EFE6D6",
  buffet: "#E6DCC8",
  principal: "#C9A86A",
  lounge: "#EFE7D8",
  movel: "#E8DFCF",
  cerimonia: "#E6DCC8",
  apoio: "#E2DDD5",
  area: "none",
};

/** Categorias que levam a cor da empresa, quando ela tem uma. */
const LEVA_DESTAQUE: ReadonlySet<CategoriaDeElemento> = new Set(["palco"]);

export function corDoElemento(cat: CategoriaDeElemento, destaque?: string) {
  if (destaque && LEVA_DESTAQUE.has(cat)) return destaque;
  return PREENCHIMENTO[cat];
}

/** Texto legível sobre um fundo hex (#rrggbb). */
export function textoSobre(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return CORES.texto;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.55 ? CORES.textoClaro : CORES.texto;
}

export const fmtMetro = (n: number) => n.toFixed(2).replace(".", ",");

export type OpcoesDoDesenho = {
  destaque?: string;
  selecionado?: Alvo | null;
  /** Ids de elementos com foto de referência — ganham um marcador. */
  comFoto?: ReadonlySet<string>;
  /** No PDF não se mostra o contorno de seleção nem as alças. */
  paraImpressao?: boolean;
};

/** Margem em volta do salão, em metros, para rótulos de aberturas e cotas. */
export const MARGEM_DESENHO = 3.2;

export function caixaDoDesenho(d: DadosDoLayout) {
  const m = MARGEM_DESENHO;
  return { x: -m, y: -m, w: d.salao.largura + 2 * m, h: d.salao.comprimento + 2 * m };
}

export function desenharPlanta(d: DadosDoLayout, op: OpcoesDoDesenho = {}): Forma[] {
  const { largura: W, comprimento: L } = d.salao;
  const Y = (y: number) => L - y;
  const f: Forma[] = [];
  const sel = op.selecionado;
  const ehSel = (a: Alvo) => !op.paraImpressao && sel?.tipo === a.tipo && sel.id === a.id;

  // Piso e paredes.
  f.push({ k: "rect", x: 0, y: 0, w: W, h: L, fill: CORES.piso });
  if (d.salao.cortina) {
    const c = 0.3;
    f.push(
      { k: "rect", x: 0, y: 0, w: W, h: c, fill: CORES.cortina },
      { k: "rect", x: 0, y: L - c, w: W, h: c, fill: CORES.cortina },
      { k: "rect", x: 0, y: 0, w: c, h: L, fill: CORES.cortina },
      { k: "rect", x: W - c, y: 0, w: c, h: L, fill: CORES.cortina },
    );
  }
  f.push({ k: "rect", x: 0, y: 0, w: W, h: L, fill: "none", stroke: CORES.parede, sw: 0.14 });

  // Aberturas: um vão na parede + rótulo do lado de fora.
  for (const a of d.aberturas) {
    const cor = a.tipo === "entrada" ? "#B08D57" : CORES.parede;
    const meio = (a.inicio + a.fim) / 2;
    if (a.parede === "esquerda" || a.parede === "direita") {
      const x = a.parede === "esquerda" ? 0 : W;
      f.push({ k: "line", x1: x, y1: Y(a.inicio), x2: x, y2: Y(a.fim), stroke: CORES.piso, sw: 0.5 });
      const tx = a.parede === "esquerda" ? -0.4 : W + 0.4;
      f.push({ k: "text", x: tx, y: Y(meio), texto: a.rotulo, size: 0.42, fill: cor, weight: 700, anchor: "middle", rotate: a.parede === "esquerda" ? -90 : 90 });
    } else {
      const y = a.parede === "frente" ? L : 0;
      f.push({ k: "line", x1: a.inicio, y1: y, x2: a.fim, y2: y, stroke: CORES.piso, sw: 0.5 });
      const ty = a.parede === "frente" ? L + 0.75 : -0.45;
      f.push({ k: "text", x: meio, y: ty, texto: a.rotulo, size: 0.42, fill: cor, weight: 700, anchor: "middle" });
    }
  }

  // Elementos. Áreas primeiro (ficam por baixo).
  const ordenados = [...d.elementos].sort((a, b) => Number(b.categoria === "area") - Number(a.categoria === "area"));
  for (const e of ordenados) {
    const alvo: Alvo = { tipo: "elemento", id: e.id };
    const cx = e.cx;
    const cy = Y(e.cy);
    const transform = e.rotacao ? `rotate(${e.rotacao} ${cx} ${cy})` : undefined;
    const fill = corDoElemento(e.categoria, op.destaque);
    const stroke = ehSel(alvo) ? "#2563EB" : e.categoria === "area" ? "#B08D57" : CORES.linha;
    const sw = ehSel(alvo) ? 0.12 : 0.05;
    const dash = e.categoria === "area" ? "0.3 0.2" : undefined;

    if (e.categoria === "principal" && e.cadeirasPorLado) {
      // Cadeiras dos lados maiores, desenhadas para a mesa "ter gente".
      const n = e.cadeirasPorLado;
      const passo = e.largura / n;
      for (let i = 0; i < n; i++) {
        const x = cx - e.largura / 2 + passo * (i + 0.5);
        for (const lado of [-1, 1]) {
          f.push({ k: "rect", x: x - 0.2, y: cy + lado * (e.profundidade / 2 + 0.3) - 0.2, w: 0.4, h: 0.4, rx: 0.06, fill: "#FFFFFF", stroke: CORES.suave, sw: 0.03, transform, alvo });
        }
      }
    }

    if (e.forma === "redondo") {
      f.push({ k: "circle", cx, cy, r: e.largura / 2, fill, stroke, sw, dash, alvo });
    } else if (e.forma === "oval") {
      f.push({ k: "ellipse", cx, cy, rx: e.largura / 2, ry: e.profundidade / 2, fill, stroke, sw, transform, alvo });
      if (e.categoria === "bar") {
        // Bar em ilha: o miolo é onde o barman trabalha.
        f.push({ k: "ellipse", cx, cy, rx: e.largura * 0.3, ry: e.profundidade * 0.2, fill: CORES.piso, stroke: CORES.linha, sw: 0.04, transform, alvo });
      }
    } else {
      f.push({ k: "rect", x: cx - e.largura / 2, y: cy - e.profundidade / 2, w: e.largura, h: e.profundidade, rx: 0.12, fill, stroke, sw, dash, transform, alvo });
      if (e.categoria === "lounge") desenharLounge(f, e, cy, transform, alvo);
    }

    if (e.rotulo) {
      const vertical = e.profundidade > e.largura * 2.2;
      const tam = Math.max(0.28, Math.min(0.6, Math.min(e.largura, e.profundidade) * (vertical ? 0.3 : 0.32), (vertical ? e.profundidade : e.largura) / (e.rotulo.length * 0.62)));
      const cor = e.categoria === "area" ? "#B08D57" : textoSobre(fill === "none" ? CORES.piso : fill);
      const rot = (e.rotacao ?? 0) + (vertical ? -90 : 0);
      const ty = e.categoria === "lounge" ? cy - e.profundidade / 2 + 0.55 : cy;
      f.push({ k: "text", x: cx, y: ty, texto: e.rotulo, size: tam, fill: cor, weight: 700, anchor: "middle", rotate: rot || undefined, italic: e.categoria === "area", alvo });
    }

    if (op.comFoto?.has(e.id)) {
      // Marcador discreto de "tem referência": um ponto da cor de destaque.
      f.push({ k: "circle", cx: cx + e.largura / 2 - 0.25, cy: cy - e.profundidade / 2 + 0.25, r: 0.18, fill: op.destaque ?? "#B08D57", stroke: "#FFFFFF", sw: 0.05, transform, alvo });
    }
  }

  for (const p of d.pilares) {
    const alvo: Alvo = { tipo: "pilar", id: p.id };
    f.push({ k: "rect", x: p.cx - p.lado / 2, y: Y(p.cy) - p.lado / 2, w: p.lado, h: p.lado, fill: CORES.parede, stroke: ehSel(alvo) ? "#2563EB" : undefined, sw: 0.1, alvo });
  }

  // Mesas, numeradas na ordem da lista.
  const r = d.mesas.diametro / 2;
  const rc = raioComCadeiras(d.mesas.diametro);
  d.mesas.posicoes.forEach((m, i) => {
    const alvo: Alvo = { tipo: "mesa", id: m.id };
    const cy = Y(m.cy);
    f.push({ k: "circle", cx: m.cx, cy, r: rc, fill: "none", stroke: CORES.suave, sw: 0.03, dash: "0.12 0.12", alvo });
    f.push({ k: "circle", cx: m.cx, cy, r, fill: CORES.mesa, stroke: ehSel(alvo) ? "#2563EB" : CORES.linha, sw: ehSel(alvo) ? 0.12 : 0.06, alvo });
    f.push({ k: "text", x: m.cx, y: cy, texto: String(i + 1), size: Math.min(0.55, r * 0.6), fill: CORES.texto, weight: 700, anchor: "middle", alvo });
  });

  // Cotas.
  f.push(
    { k: "line", x1: 0, y1: L + 1.6, x2: W, y2: L + 1.6, stroke: CORES.suave, sw: 0.03 },
    { k: "text", x: W / 2, y: L + 2.3, texto: `${fmtMetro(W)} m`, size: 0.4, fill: CORES.suave, anchor: "middle" },
    { k: "line", x1: W + 1.6, y1: 0, x2: W + 1.6, y2: L, stroke: CORES.suave, sw: 0.03 },
    { k: "text", x: W + 2.3, y: L / 2, texto: `${fmtMetro(L)} m`, size: 0.4, fill: CORES.suave, anchor: "middle", rotate: 90 },
  );

  return f;
}

function desenharLounge(f: Forma[], e: ElementoDoLayout, cy: number, transform: string | undefined, alvo: Alvo) {
  const x0 = e.cx - e.largura / 2;
  const y0 = cy - e.profundidade / 2;
  const sofaW = e.largura * 0.62;
  f.push({ k: "rect", x: e.cx - sofaW / 2, y: y0 + e.profundidade - 1.1, w: sofaW, h: 0.85, rx: 0.2, fill: "#E2D6C0", stroke: CORES.linha, sw: 0.03, transform, alvo });
  for (const dx of [0.75, e.largura - 0.75]) {
    f.push({ k: "rect", x: x0 + dx - 0.4, y: y0 + 1.0, w: 0.8, h: 0.8, rx: 0.15, fill: "#E2D6C0", stroke: CORES.linha, sw: 0.03, transform, alvo });
  }
  f.push({ k: "circle", cx: e.cx, cy: cy + 0.15, r: 0.45, fill: "#FFFFFF", stroke: CORES.linha, sw: 0.03, transform, alvo });
}

// ── SVG em texto (PDF) ───────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n2 = (n: number) => Math.round(n * 1000) / 1000;

export function atributosDoTexto(t: Extract<Forma, { k: "text" }>) {
  const transform = [t.transform, t.rotate ? `rotate(${t.rotate} ${n2(t.x)} ${n2(t.y)})` : ""].filter(Boolean).join(" ");
  return transform || undefined;
}

export function svgDaPlanta(d: DadosDoLayout, op: OpcoesDoDesenho = {}, pxPorMetro = 40): string {
  const box = caixaDoDesenho(d);
  const partes = desenharPlanta(d, { ...op, paraImpressao: true }).map((s) => {
    const tr = s.transform ? ` transform="${s.transform}"` : "";
    switch (s.k) {
      case "rect":
        return `<rect x="${n2(s.x)}" y="${n2(s.y)}" width="${n2(s.w)}" height="${n2(s.h)}"${s.rx ? ` rx="${s.rx}"` : ""} fill="${s.fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.sw ?? 0.05}"` : ""}${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}${tr}/>`;
      case "circle":
        return `<circle cx="${n2(s.cx)}" cy="${n2(s.cy)}" r="${n2(s.r)}" fill="${s.fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.sw ?? 0.05}"` : ""}${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}${tr}/>`;
      case "ellipse":
        return `<ellipse cx="${n2(s.cx)}" cy="${n2(s.cy)}" rx="${n2(s.rx)}" ry="${n2(s.ry)}" fill="${s.fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.sw ?? 0.05}"` : ""}${tr}/>`;
      case "line":
        return `<line x1="${n2(s.x1)}" y1="${n2(s.y1)}" x2="${n2(s.x2)}" y2="${n2(s.y2)}" stroke="${s.stroke}" stroke-width="${s.sw}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
      case "text": {
        const t = atributosDoTexto(s);
        return `<text x="${n2(s.x)}" y="${n2(s.y)}" font-size="${n2(s.size)}" fill="${s.fill}" font-family="Helvetica, Arial, sans-serif"${s.weight ? ` font-weight="${s.weight}"` : ""}${s.italic ? ' font-style="italic"' : ""} text-anchor="${s.anchor ?? "start"}" dominant-baseline="central"${t ? ` transform="${t}"` : ""}>${esc(s.texto)}</text>`;
      }
    }
  });
  const w = Math.round(box.w * pxPorMetro);
  const h = Math.round(box.h * pxPorMetro);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#FFFFFF"/>${partes.join("")}</svg>`;
}

// ── Edição (funções puras sobre os dados) ────────────────────────────────────

let contador = 0;
export const novoIdLocal = (prefixo: string) =>
  `${prefixo}-${Date.now().toString(36)}-${(contador++).toString(36)}`;

export function elementoDaPeca(peca: PecaDaBiblioteca, cx: number, cy: number): ElementoDoLayout {
  return {
    id: novoIdLocal("el"),
    forma: peca.forma,
    categoria: peca.categoria,
    rotulo: rotuloDaPeca(peca),
    cx: arred(cx),
    cy: arred(cy),
    largura: peca.largura,
    profundidade: peca.profundidade,
    ...(peca.altura !== undefined ? { altura: peca.altura } : {}),
    ...(peca.cadeirasPorLado !== undefined ? { cadeirasPorLado: peca.cadeirasPorLado } : {}),
    peca: peca.chave,
  };
}

export const arred = (n: number) => Math.round(n * 100) / 100;

/** Move qualquer alvo para (cx, cy) em metros da planta, preso dentro do salão. */
export function moverAlvo(d: DadosDoLayout, alvo: Alvo, cx: number, cy: number): DadosDoLayout {
  const x = arred(Math.min(d.salao.largura, Math.max(0, cx)));
  const y = arred(Math.min(d.salao.comprimento, Math.max(0, cy)));
  if (alvo.tipo === "mesa") {
    return { ...d, mesas: { ...d.mesas, posicoes: d.mesas.posicoes.map((m) => (m.id === alvo.id ? { ...m, cx: x, cy: y } : m)) } };
  }
  if (alvo.tipo === "pilar") {
    return { ...d, pilares: d.pilares.map((p) => (p.id === alvo.id ? { ...p, cx: x, cy: y } : p)) };
  }
  return { ...d, elementos: d.elementos.map((e) => (e.id === alvo.id ? { ...e, cx: x, cy: y } : e)) };
}

export function posicaoDoAlvo(d: DadosDoLayout, alvo: Alvo): { cx: number; cy: number } | null {
  const lista = alvo.tipo === "mesa" ? d.mesas.posicoes : alvo.tipo === "pilar" ? d.pilares : d.elementos;
  const item = lista.find((i) => i.id === alvo.id);
  return item ? { cx: item.cx, cy: item.cy } : null;
}

export function removerAlvo(d: DadosDoLayout, alvo: Alvo): DadosDoLayout {
  if (alvo.tipo === "mesa") return { ...d, mesas: { ...d.mesas, posicoes: d.mesas.posicoes.filter((m) => m.id !== alvo.id) } };
  if (alvo.tipo === "pilar") return { ...d, pilares: d.pilares.filter((p) => p.id !== alvo.id) };
  return { ...d, elementos: d.elementos.filter((e) => e.id !== alvo.id) };
}

/** Duplica ao lado (1 m para a direita), já selecionável. */
export function duplicarAlvo(d: DadosDoLayout, alvo: Alvo): { dados: DadosDoLayout; novo: Alvo } | null {
  if (alvo.tipo === "mesa") {
    const m = d.mesas.posicoes.find((x) => x.id === alvo.id);
    if (!m) return null;
    const id = novoIdLocal("m");
    const copia = { id, cx: Math.min(d.salao.largura, m.cx + raioComCadeiras(d.mesas.diametro) * 2 + 0.3), cy: m.cy };
    return { dados: { ...d, mesas: { ...d.mesas, posicoes: [...d.mesas.posicoes, copia] } }, novo: { tipo: "mesa", id } };
  }
  if (alvo.tipo === "elemento") {
    const e = d.elementos.find((x) => x.id === alvo.id);
    if (!e) return null;
    const id = novoIdLocal("el");
    const copia = { ...e, id, cx: Math.min(d.salao.largura, e.cx + 1) };
    return { dados: { ...d, elementos: [...d.elementos, copia] }, novo: { tipo: "elemento", id } };
  }
  return null;
}

/**
 * Renumera as mesas pela posição: do fundo para a frente, da esquerda para a
 * direita. A numeração É a ordem da lista — não há campo "número" para
 * divergir da posição quando alguém arrasta uma mesa.
 */
export function renumerarMesas(d: DadosDoLayout): DadosDoLayout {
  const faixa = raioComCadeiras(d.mesas.diametro);
  const posicoes = [...d.mesas.posicoes].sort((a, b) => {
    if (Math.abs(a.cy - b.cy) > faixa) return b.cy - a.cy;
    return a.cx - b.cx;
  });
  return { ...d, mesas: { ...d.mesas, posicoes } };
}

export function pecaDoElemento(e: ElementoDoLayout) {
  return e.peca ? pecaPorChave(e.peca) : undefined;
}

export const ROTULO_CATEGORIA: Record<CategoriaDeElemento, string> = {
  palco: "Palco",
  pista: "Pista",
  bar: "Bar",
  bolo: "Mesa do bolo",
  doces: "Doces",
  buffet: "Buffet / gastronomia",
  principal: "Mesa principal",
  lounge: "Lounge",
  movel: "Móvel",
  cerimonia: "Cerimônia",
  apoio: "Apoio",
  area: "Área livre",
};
