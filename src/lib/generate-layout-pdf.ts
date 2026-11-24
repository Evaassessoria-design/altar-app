import jsPDF from "jspdf";
import type { DadosDoLayout } from "@/convex/lib/layoutSalao.ts";
import { lugaresDoLayout } from "@/convex/lib/layoutSalao.ts";
import { entregarPdf } from "./pdf-delivery.ts";
import { resolveIdentidade, type EmpresaLike } from "./brand.ts";
import { cabecalhoDaEmpresa, rodapeEmTodasAsPaginas } from "./pdf-marca.ts";
import { carregarImagemParaPdf, caixaProporcional } from "./imagem-para-pdf.ts";
import { fmtMetro, svgDaPlanta } from "./layout-salao.ts";

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT DO SALÃO — o PDF que vai para os clientes.
//
// Uma LEITURA do layout, como o Projeto Visual: a planta sai de `svgDaPlanta`,
// que é a mesma lista de formas desenhada na tela. Não há segundo desenho para
// divergir.
//
// Audiência CLIENTE: sem custo, sem fornecedor, sem observação interna — o
// layout não carrega nada disso, então não há o que vazar. Três partes:
//   1. a planta 2D em escala, com mesas numeradas;
//   2. a vista 3D que ela deixou na tela (se o 3D foi aberto);
//   3. as referências de cada ambiente, das fotos ligadas aos elementos.
// Foto que não carrega não derruba o documento: o ambiente aparece sem ela.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const M = 15;

export type LayoutPdfData = {
  evento: { name: string };
  nomeDoLayout: string;
  dados: DadosDoLayout;
  empresa?: EmpresaLike | null;
  /** JPEG da vista 3D atual. Ausente = o 3D não foi aberto; a página não sai. */
  vista3d?: string | null;
  /** Elemento → URL da foto de referência (versão leve quando houver). */
  referencias: { rotulo: string; url: string }[];
};

/** SVG → PNG, no navegador. Só formas e texto: o canvas nunca fica "sujo". */
async function svgParaPng(svg: string, largura: number, altura: number): Promise<string | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    const carregou = new Promise<void>((ok, falha) => {
      img.onload = () => ok();
      img.onerror = () => falha(new Error("svg"));
    });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await carregou;
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(img, 0, 0, largura, altura);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function generateLayoutPDF({
  evento,
  nomeDoLayout,
  dados,
  empresa,
  vista3d,
  referencias,
}: LayoutPdfData): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const identidade = resolveIdentidade(empresa);
  const destaque = `#${identidade.cor.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

  // ── 1. Planta ──────────────────────────────────────────────────────────────
  let y = cabecalhoDaEmpresa({ doc, identidade, titulo: "LAYOUT DO SALÃO", audiencia: "cliente" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(35, 32, 30);
  doc.text(evento.name, M, y + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 105, 100);
  const lugares = lugaresDoLayout(dados);
  const resumo = [
    nomeDoLayout,
    `Salão ${fmtMetro(dados.salao.largura)} × ${fmtMetro(dados.salao.comprimento)} m`,
    `${dados.mesas.posicoes.length} mesas de ${dados.mesas.lugares} lugares`,
    `${lugares} lugares no total`,
  ].join("  ·  ");
  doc.text(resumo, M, y + 9);
  y += 16;

  const pxPorMetro = 60;
  const svg = svgDaPlanta(dados, { destaque }, pxPorMetro);
  const wPx = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 1600);
  const hPx = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 1600);
  const png = await svgParaPng(svg, wPx, hPx);
  if (png) {
    const caixa = caixaProporcional({ w: wPx, h: hPx }, PAGE_W - 2 * M, PAGE_H - y - 24);
    doc.addImage(png, "PNG", M + caixa.dx, y, caixa.w, caixa.h);
  } else {
    doc.text("Não foi possível desenhar a planta neste navegador.", M, y + 10);
  }

  // ── 2. Vista 3D ────────────────────────────────────────────────────────────
  if (vista3d) {
    doc.addPage();
    let y2 = cabecalhoDaEmpresa({ doc, identidade, titulo: "LAYOUT DO SALÃO · VISTA 3D", audiencia: "cliente" });
    const props = doc.getImageProperties(vista3d);
    const caixa = caixaProporcional({ w: props.width, h: props.height }, PAGE_W - 2 * M, PAGE_H - y2 - 30);
    doc.addImage(vista3d, "JPEG", M + caixa.dx, y2, caixa.w, caixa.h);
    y2 += caixa.h + 6;
    doc.setFontSize(8.5);
    doc.setTextColor(125, 120, 114);
    doc.text("Ilustração do layout. Cores e acabamentos finais conforme o projeto de decoração.", M, y2);
  }

  // ── 3. Referências ─────────────────────────────────────────────────────────
  if (referencias.length > 0) {
    doc.addPage();
    let y3 = cabecalhoDaEmpresa({ doc, identidade, titulo: "LAYOUT DO SALÃO · REFERÊNCIAS", audiencia: "cliente" });
    const colunas = 2;
    const gap = 8;
    const cw = (PAGE_W - 2 * M - gap) / colunas;
    const ch = 62;
    let col = 0;
    for (const ref of referencias) {
      if (y3 + ch + 10 > PAGE_H - 20) {
        doc.addPage();
        y3 = cabecalhoDaEmpresa({ doc, identidade, titulo: "LAYOUT DO SALÃO · REFERÊNCIAS", audiencia: "cliente" });
        col = 0;
      }
      const x = M + col * (cw + gap);
      const img = await carregarImagemParaPdf(ref.url, 900);
      if (img) {
        const c = caixaProporcional(img, cw, ch);
        doc.addImage(img.dataUrl, "JPEG", x + c.dx, y3 + c.dy, c.w, c.h);
      } else {
        doc.setFillColor(246, 243, 239);
        doc.rect(x, y3, cw, ch, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(35, 32, 30);
      doc.text(ref.rotulo, x, y3 + ch + 5.5);
      col++;
      if (col === colunas) {
        col = 0;
        y3 += ch + 14;
      }
    }
  }

  rodapeEmTodasAsPaginas({ doc, identidade, audiencia: "cliente", referencia: evento.name });
  const nome = `layout-${evento.name}-${nomeDoLayout}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  entregarPdf(doc, `${nome || "layout"}.pdf`);
}
