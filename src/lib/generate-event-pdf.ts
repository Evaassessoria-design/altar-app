import jsPDF from "jspdf";
import { effectivePurchaseStatus } from "@/convex/lib/purchaseStatus.ts";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { resolveAreasForAudience } from "./briefing-areas.ts";

import { formatEventDateShort } from "./event-date";
// ─── Brand colors (bege/dourado) ─────────────────────────────────────────────
const PRIMARY: [number, number, number] = [178, 142, 96];      // #B28E60
const PRIMARY_DARK: [number, number, number] = [120, 90, 50];  // header text
const LIGHT_BG: [number, number, number] = [252, 249, 244];    // section bg
const BORDER: [number, number, number] = [220, 205, 180];
const MUTED: [number, number, number] = [120, 110, 100];
const DARK: [number, number, number] = [40, 35, 30];

const PAGE_W = 210;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

// As seções do briefing vinham duplicadas aqui e na UI, e já tinham divergido
// (`insuranceInfo` não saía em lugar nenhum, `referenceImages` faltava no PDF).
// Agora vêm de src/lib/briefing-areas.ts — fonte única. Este é o relatório
// completo do evento, então usa a audiência "interno".

const TYPE_LABELS: Record<string, string> = {
  wedding: "Casamento",
  corporate: "Corporativo",
  birthday: "Aniversário",
  debutante: "Debutante",
  baptism: "Batizado",
  other: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planejamento",
  confirmed: "Confirmado",
  in_progress: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type BriefingDoc = Partial<Omit<Doc<"briefings">, "_id" | "_creationTime">>;
type ChecklistItem = Pick<Doc<"checklistItems">, "name" | "category" | "quantity" | "unit" | "isChecked">;
type TeamAssignment = { member?: { name: string; role: string } | null; scheduledTime?: string };
type PurchaseItem = Pick<Doc<"purchaseItems">, "name" | "category" | "quantity" | "unit" | "supplier" | "unitPrice" | "isPurchased" | "status">;

export interface EventReportData {
  event: Doc<"events">;
  briefing?: BriefingDoc | null;
  preChecklist?: ChecklistItem[];
  postChecklist?: ChecklistItem[];
  team?: TeamAssignment[];
  purchases?: PurchaseItem[];
  generatedBy?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addPageIfNeeded(doc: jsPDF, y: number, needed = 30): number {
  if (y + needed > 280) {
    doc.addPage();
    return 20;
  }
  return y;
}

function sectionHeader(doc: jsPDF, title: string, y: number): number {
  y = addPageIfNeeded(doc, y, 18);
  doc.setFillColor(...LIGHT_BG);
  doc.rect(MARGIN, y - 1, CONTENT_W, 10, "F");
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 9, MARGIN + CONTENT_W, y + 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PRIMARY_DARK);
  doc.text(title.toUpperCase(), MARGIN + 3, y + 6.5);
  return y + 14;
}

function fieldRow(doc: jsPDF, label: string, value: string, y: number, colWidth = CONTENT_W): number {
  y = addPageIfNeeded(doc, y, 8);
  const lines = doc.splitTextToSize(value, colWidth - 55);
  const rowH = Math.max(7, lines.length * 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(label, MARGIN + 2, y + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(lines as string[], MARGIN + 50, y + 4.5);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.1);
  doc.line(MARGIN, y + rowH, MARGIN + colWidth, y + rowH);
  return y + rowH + 1;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function generateEventPDF(data: EventReportData): void {
  const { event, briefing, preChecklist = [], postChecklist = [], team = [], purchases = [] } = data;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── Cover header bar ──────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_W, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("ALTAR", MARGIN, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Plataforma para Decoradores de Eventos", MARGIN, 18);

  doc.setFontSize(8);
  doc.setTextColor(240, 230, 210);
  const today = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  doc.text(`Gerado em ${today}`, PAGE_W - MARGIN, 18, { align: "right" });
  if (data.generatedBy) {
    doc.text(data.generatedBy, PAGE_W - MARGIN, 23, { align: "right" });
  }

  // ── Event title block ─────────────────────────────────────────────────────
  let y = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text(event.name, MARGIN, y);

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(
    `${TYPE_LABELS[event.type] ?? event.type}  ·  ${STATUS_LABELS[event.status] ?? event.status}`,
    MARGIN,
    y,
  );

  // ── Event summary box ─────────────────────────────────────────────────────
  y += 6;
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, CONTENT_W, 30, 2, 2, "FD");

  const boxRows = [
    ["Data", formatEventDateShort(event.date)],
    ["Local", event.location],
    ["Cliente", `${event.clientName}${event.clientPhone ? `  ·  ${event.clientPhone}` : ""}`],
    ["Orçamento", event.budget
      ? event.budget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "—"],
  ];

  const colA = MARGIN + 3;
  const colB = MARGIN + 40;
  let boxY = y + 5;
  doc.setFontSize(8);
  for (const [label, val] of boxRows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(label, colA, boxY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const maxW = CONTENT_W - 45;
    const lines = doc.splitTextToSize(val, maxW);
    doc.text(lines as string[], colB, boxY);
    boxY += 6;
  }

  if (event.notes) {
    y += 36;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...MUTED);
    const noteLines = doc.splitTextToSize(`Notas: ${event.notes}`, CONTENT_W);
    doc.text(noteLines as string[], MARGIN, y);
    y += noteLines.length * 4.5 + 4;
  } else {
    y += 36;
  }

  y += 4;

  // ── BRIEFING ──────────────────────────────────────────────────────────────
  if (briefing) {
    y = sectionHeader(doc, "Briefing do Evento", y);
    // Campo vazio não aparece; área sem campo não aparece — as mesmas regras do
    // Caderno de Montagem, aplicadas pela função compartilhada.
    const areas = resolveAreasForAudience(briefing, "interno");
    for (const area of areas) {
      y = addPageIfNeeded(doc, y, 12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...PRIMARY);
      doc.text(area.label, MARGIN + 2, y + 3);
      y += 6;

      for (const group of area.groups) {
        for (const field of group.fields) {
          y = fieldRow(doc, field.label, field.value, y);
        }
      }
      y += 2;
    }
    if (areas.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text("Briefing ainda não preenchido.", MARGIN + 2, y + 4);
      y += 10;
    }
    y += 2;
  }

  // ── EQUIPE ────────────────────────────────────────────────────────────────
  if (team.length > 0) {
    y = sectionHeader(doc, "Equipe do Evento", y);
    autoTable(doc, {
      startY: y,
      head: [["Membro", "Função", "Horário"]],
      body: team.map((a) => [
        a.member?.name ?? "—",
        a.member?.role ?? "—",
        a.scheduledTime ?? "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: DARK },
      alternateRowStyles: { fillColor: LIGHT_BG },
      styles: { lineColor: BORDER, lineWidth: 0.2 },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 70 },
        2: { cellWidth: 40 },
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── CHECKLIST PRÉ ─────────────────────────────────────────────────────────
  if (preChecklist.length > 0) {
    y = sectionHeader(doc, `Checklist — Carregamento (pré-evento)  [${preChecklist.filter((i) => i.isChecked).length}/${preChecklist.length}]`, y);
    autoTable(doc, {
      startY: y,
      head: [["Item", "Categoria", "Qtd.", "Status"]],
      body: preChecklist.map((i) => [
        i.name,
        i.category ?? "—",
        i.quantity ? `${i.quantity}${i.unit ? ` ${i.unit}` : ""}` : "—",
        i.isChecked ? "✓" : "○",
      ]),
      theme: "striped",
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: DARK },
      alternateRowStyles: { fillColor: LIGHT_BG },
      styles: { lineColor: BORDER, lineWidth: 0.2 },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 50 },
        2: { cellWidth: 25, halign: "center" },
        3: { cellWidth: 20, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.column.index === 3 && data.section === "body") {
          const val = data.cell.text[0];
          if (val === "✓") {
            data.cell.styles.textColor = [50, 150, 80];
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.textColor = MUTED;
          }
        }
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── CHECKLIST PÓS ─────────────────────────────────────────────────────────
  if (postChecklist.length > 0) {
    y = sectionHeader(doc, `Checklist — Conferência (pós-evento)  [${postChecklist.filter((i) => i.isChecked).length}/${postChecklist.length}]`, y);
    autoTable(doc, {
      startY: y,
      head: [["Item", "Categoria", "Qtd.", "Status"]],
      body: postChecklist.map((i) => [
        i.name,
        i.category ?? "—",
        i.quantity ? `${i.quantity}${i.unit ? ` ${i.unit}` : ""}` : "—",
        i.isChecked ? "✓" : "○",
      ]),
      theme: "striped",
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: DARK },
      alternateRowStyles: { fillColor: LIGHT_BG },
      styles: { lineColor: BORDER, lineWidth: 0.2 },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 50 },
        2: { cellWidth: 25, halign: "center" },
        3: { cellWidth: 20, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.column.index === 3 && data.section === "body") {
          const val = data.cell.text[0];
          if (val === "✓") {
            data.cell.styles.textColor = [50, 150, 80];
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.textColor = MUTED;
          }
        }
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── LISTA DE COMPRAS ──────────────────────────────────────────────────────
  if (purchases.length > 0) {
    // Item cancelado não entra na conta impressa: um documento que diz
    // "7/12 adquiridos" contando peças canceladas manda a equipe procurar
    // coisa que ninguém comprou de propósito.
    const naConta = purchases.filter((p) => effectivePurchaseStatus(p) !== "cancelado");
    y = sectionHeader(doc, `Lista de Compras  [${naConta.filter((p) => p.isPurchased).length}/${naConta.length} adquiridos]`, y);
    const total = purchases.reduce((s, p) => s + (p.unitPrice ?? 0) * (p.quantity ?? 1), 0);
    const acquired = naConta.filter((p) => p.isPurchased).reduce((s, p) => s + (p.unitPrice ?? 0) * (p.quantity ?? 1), 0);

    autoTable(doc, {
      startY: y,
      head: [["Item", "Categoria", "Qtd.", "Fornecedor", "Valor Unit.", "Status"]],
      body: purchases.map((p) => [
        p.name,
        p.category ?? "—",
        p.quantity ? `${p.quantity}${p.unit ? ` ${p.unit}` : ""}` : "—",
        p.supplier ?? "—",
        p.unitPrice ? p.unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—",
        p.isPurchased ? "✓" : "○",
      ]),
      theme: "striped",
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: DARK },
      alternateRowStyles: { fillColor: LIGHT_BG },
      styles: { lineColor: BORDER, lineWidth: 0.2 },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 30 },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 35 },
        4: { cellWidth: 25, halign: "right" },
        5: { cellWidth: 15, halign: "center" },
      },
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    if (total > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text(
        `Total estimado: ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}   Adquirido: ${acquired.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        PAGE_W - MARGIN,
        y,
        { align: "right" },
      );
      y += 6;
    }
  }

  // ── Footer on each page ───────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 288, PAGE_W - MARGIN, 288);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(`Altar · Relatório do Evento: ${event.name}`, MARGIN, 293);
    doc.text(`Página ${i} de ${totalPages}`, PAGE_W - MARGIN, 293, { align: "right" });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeName = event.name.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, "").trim().replace(/\s+/g, "-");
  doc.save(`altar-relatorio-${safeName}.pdf`);
}
