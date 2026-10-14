import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ASSINATURA_ALTAR, resolveIdentidade, type EmpresaLike, type RGB } from "../brand";
import { brlDeCentavos, diaBr, type DocumentoDoExtrato } from "./documento-do-extrato.ts";

// ─────────────────────────────────────────────────────────────────────────────
// EXTRATO EM PDF — para imprimir e guardar
//
// Desenha o `DocumentoDoExtrato`, o mesmo objeto da planilha. As tabelas são
// do `jspdf-autotable` (já usado no Orçamento e no relatório do evento): o
// cabeçalho da tabela se repete em cada página e uma linha nunca é cortada ao
// meio. Nenhum link de arquivo: o comprovante sai como "Sim/Não".
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W = 297; // A4 deitado: onze colunas cabem sem espremer a descrição
const PAGE_H = 210;
const MARGIN = 12;
const DARK: RGB = [26, 21, 18];
const MUTED: RGB = [118, 108, 98];
const LINHA: RGB = [226, 214, 198];

/** A fonte padrão do PDF não desenha emoji nem símbolos fora do Latin-1. */
function paraPdf(t: string | undefined): string {
  if (!t) return "";
  return [...t.normalize("NFC")]
    .filter((ch) => {
      const cp = ch.codePointAt(0)!;
      return (cp >= 0x20 && cp <= 0xff) || "–—‘’“”•…€".includes(ch);
    })
    .join("");
}

export function desenharExtrato(d: DocumentoDoExtrato, empresa?: EmpresaLike | null): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const id = resolveIdentidade(empresa);
  const cor = id.cor;

  // ── Cabeçalho da primeira página ─────────────────────────────────────────
  doc.setFillColor(...cor);
  doc.rect(0, 0, PAGE_W, 22, "F");
  doc.setTextColor(...id.textoSobreCor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("EXTRATO FINANCEIRO", MARGIN, 10);
  doc.setFontSize(10);
  doc.text(paraPdf(d.empresa), MARGIN, 16.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Emitido em ${paraPdf(d.emitidoEm)}`, PAGE_W - MARGIN, 10, { align: "right" });

  let y = 30;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Período: ${d.periodo}`, MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(paraPdf(`Filtros: ${d.filtros}`), MARGIN, y + 5.5);
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  const criterio = doc.splitTextToSize(paraPdf(`Critério: ${d.criterio}`), PAGE_W - MARGIN * 2) as string[];
  doc.text(criterio, MARGIN, y + 11);
  y += 11 + criterio.length * 3.4 + 3;

  // ── Resumo em cartões ────────────────────────────────────────────────────
  const n = d.resumo.length;
  const gap = 4;
  const w = (PAGE_W - MARGIN * 2 - gap * (n - 1)) / n;
  d.resumo.forEach((r, i) => {
    const x = MARGIN + i * (w + gap);
    doc.setDrawColor(...LINHA);
    doc.setFillColor(246, 243, 238);
    doc.roundedRect(x, y, w, 18, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(paraPdf(r.rotulo), x + 3, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(brlDeCentavos(r.centavos), x + 3, y + 11.5);
    if (r.nota) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(paraPdf(r.nota), x + 3, y + 15.5);
    }
  });
  y += 24;

  const estilo = {
    theme: "grid" as const,
    headStyles: { fillColor: cor, textColor: id.textoSobreCor, fontSize: 7.5, fontStyle: "bold" as const },
    bodyStyles: { fontSize: 7.5, textColor: DARK },
    footStyles: { fillColor: [246, 243, 238] as RGB, textColor: DARK, fontStyle: "bold" as const, fontSize: 7.5 },
    styles: { lineColor: LINHA, lineWidth: 0.15, cellPadding: 1.6, overflow: "linebreak" as const },
    margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 14 },
    showHead: "everyPage" as const,
    showFoot: "lastPage" as const,
    rowPageBreak: "avoid" as const,
  };

  const titulo = (t: string, at: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...cor);
    doc.text(t, MARGIN, at);
  };
  const depois = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ── Movimentações ────────────────────────────────────────────────────────
  titulo(`Movimentações efetivas (${d.movimentos.length})`, y);
  autoTable(doc, {
    ...estilo,
    startY: y + 2,
    head: [["Data", "Descrição", "Cliente / evento", "Fornecedor", "Categoria", "Forma", "Comprov.", "Entrada", "Saída"]],
    body: d.movimentos.map((m) => [
      diaBr(m.data),
      paraPdf(m.descricao),
      paraPdf([m.cliente, m.evento].filter(Boolean).join(" · ")),
      paraPdf(m.fornecedor),
      paraPdf(m.categoria),
      paraPdf(m.forma),
      m.comprovante,
      m.entradaCentavos ? brlDeCentavos(m.entradaCentavos) : "",
      m.saidaCentavos ? brlDeCentavos(m.saidaCentavos) : "",
    ]),
    foot: [["", "Totais do período", "", "", "", "", "", brlDeCentavos(d.totais.recebidoCentavos), brlDeCentavos(d.totais.pagoCentavos)]],
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 62 },
      2: { cellWidth: 52 },
      3: { cellWidth: 30 },
      4: { cellWidth: 25 },
      5: { cellWidth: 22 },
      6: { cellWidth: 15, halign: "center" },
      7: { cellWidth: 24, halign: "right" },
      8: { cellWidth: 24, halign: "right" },
    },
  });
  if (d.movimentos.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Nenhuma movimentação efetiva neste período com estes filtros.", MARGIN, depois() + 5);
  }

  // ── Pendências ───────────────────────────────────────────────────────────
  y = depois() + 10;
  if (y > PAGE_H - 30) {
    doc.addPage();
    y = 20;
  }
  titulo(`Pendências — em aberto hoje, com vencimento no período (${d.pendencias.length})`, y);
  autoTable(doc, {
    ...estilo,
    startY: y + 2,
    head: [["Vencimento", "Tipo", "Descrição", "Cliente / evento", "Fornecedor", "Em aberto"]],
    body: d.pendencias.map((x) => [
      diaBr(x.vencimento),
      x.tipo,
      paraPdf(x.descricao),
      paraPdf([x.cliente, x.evento].filter(Boolean).join(" · ")),
      paraPdf(x.fornecedor),
      brlDeCentavos(x.centavos),
    ]),
    foot: [["", "", "A receber / a pagar", "", brlDeCentavos(d.totais.aReceberCentavos), brlDeCentavos(d.totais.aPagarCentavos)]],
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 20 },
      2: { cellWidth: 90 },
      3: { cellWidth: 70 },
      4: { cellWidth: 35 },
      5: { cellWidth: 36, halign: "right" },
    },
  });

  // ── Pagos sem data registrada ────────────────────────────────────────────
  if (d.semDataEfetiva.length > 0) {
    y = depois() + 10;
    if (y > PAGE_H - 30) {
      doc.addPage();
      y = 20;
    }
    titulo(`Pagos sem data registrada — fora dos totais (${d.semDataEfetiva.length})`, y);
    autoTable(doc, {
      ...estilo,
      startY: y + 2,
      head: [["Vencimento", "Tipo", "Descrição", "Evento", "Valor"]],
      body: d.semDataEfetiva.map((x) => [diaBr(x.vencimento), x.tipo, paraPdf(x.descricao), paraPdf(x.evento), brlDeCentavos(x.centavos)]),
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 20 }, 2: { cellWidth: 110 }, 3: { cellWidth: 85 }, 4: { cellWidth: 36, halign: "right" } },
    });
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      "Estes lançamentos estão marcados como pagos, mas o sistema não registrou quando. Não entram nos totais.",
      MARGIN,
      depois() + 4,
    );
  }

  // ── Rodapé em todas as páginas ───────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINHA);
    doc.line(MARGIN, PAGE_H - 9, PAGE_W - MARGIN, PAGE_H - 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(paraPdf(`${d.empresa} · Extrato ${d.periodo}`), MARGIN, PAGE_H - 5);
    doc.text(`Página ${i} de ${total}`, PAGE_W / 2, PAGE_H - 5, { align: "center" });
    doc.text(ASSINATURA_ALTAR, PAGE_W - MARGIN, PAGE_H - 5, { align: "right" });
  }
  return doc;
}
