import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

const PRIMARY: [number, number, number] = [178, 142, 96];
const LIGHT_BG: [number, number, number] = [252, 249, 244];
const BORDER: [number, number, number] = [220, 205, 180];
const MUTED: [number, number, number] = [120, 110, 100];
const DARK: [number, number, number] = [40, 35, 30];
const GREEN: [number, number, number] = [40, 140, 80];
const RED: [number, number, number] = [180, 50, 50];

const PAGE_W = 210;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

type BudgetItem = Pick<Doc<"budgetItems">, "description" | "category" | "type" | "quantity" | "unitPrice" | "notes">;

export interface OrcamentoPDFData {
  event: Pick<Doc<"events">, "name" | "date" | "location" | "clientName" | "clientPhone" | "budget">;
  items: BudgetItem[];
  summary: {
    estimatedBudget: number;
    quotedIncome: number;
    quotedExpense: number;
    quotedProfit: number;
    realIncome: number;
    realExpense: number;
    profit: number;
    margin: number;
  };
  studioName?: string;
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function summaryRow(doc: jsPDF, label: string, value: string, y: number, bold = false, color?: [number, number, number]) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(9);
  doc.setTextColor(...(color ?? DARK));
  doc.text(label, MARGIN + 2, y);
  doc.text(value, PAGE_W - MARGIN - 2, y, { align: "right" });
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.1);
  doc.line(MARGIN, y + 2, MARGIN + CONTENT_W, y + 2);
  return y + 7;
}

export function generateOrcamentoPDF(data: OrcamentoPDFData): void {
  const { event, items, summary, studioName } = data;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Header bar
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_W, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(studioName ?? "ALTAR", MARGIN, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Orçamento de Evento", MARGIN, 18);
  const today = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
  doc.setTextColor(240, 230, 210);
  doc.text(`Emitido em ${today}`, PAGE_W - MARGIN, 18, { align: "right" });

  // Event info
  let y = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(event.name, MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `${format(new Date(event.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}  ·  ${event.location}  ·  Cliente: ${event.clientName}${event.clientPhone ? ` (${event.clientPhone})` : ""}`,
    MARGIN, y,
  );
  y += 8;

  // Summary box
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, CONTENT_W, 36, 2, 2, "FD");

  const col1 = MARGIN + 5;
  const col2 = MARGIN + CONTENT_W / 2 + 5;
  const boxRows: [string, string, string, string][] = [
    ["Orçamento Estimado", brl(summary.estimatedBudget), "Receita Real", brl(summary.realIncome)],
    ["Receita Orçada", brl(summary.quotedIncome), "Custos Reais", brl(summary.realExpense)],
    ["Custo Orçado", brl(summary.quotedExpense), "Lucro Real", brl(summary.profit)],
    ["Lucro Orçado", brl(summary.quotedProfit), "Margem Real", `${summary.margin.toFixed(1)}%`],
  ];
  let bY = y + 7;
  doc.setFontSize(8);
  for (const [l1, v1, l2, v2] of boxRows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(l1, col1, bY);
    doc.text(l2, col2, bY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    doc.text(v1, col1 + 42, bY);
    doc.text(v2, col2 + 42, bY);
    bY += 7;
  }
  y += 42;

  // Profitability highlight
  const profitable = summary.profit >= 0;
  doc.setFillColor(...(profitable ? [230, 248, 235] as [number, number, number] : [248, 230, 230] as [number, number, number]));
  doc.setDrawColor(...(profitable ? GREEN : RED));
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, CONTENT_W, 10, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...(profitable ? GREEN : RED));
  doc.text(
    profitable
      ? `Resultado positivo: ${brl(summary.profit)} (margem ${summary.margin.toFixed(1)}%)`
      : `Atenção: resultado negativo de ${brl(summary.profit)}`,
    PAGE_W / 2, y + 6.5,
    { align: "center" },
  );
  y += 16;

  // Items table split by type
  const incomeItems = items.filter((i) => i.type === "income");
  const expenseItems = items.filter((i) => i.type === "expense");

  for (const [sectionItems, sectionTitle, headerColor] of [
    [incomeItems, "Receitas / Honorários", [40, 120, 70]] as [BudgetItem[], string, [number, number, number]],
    [expenseItems, "Custos e Despesas", [160, 60, 60]] as [BudgetItem[], string, [number, number, number]],
  ]) {
    if (sectionItems.length === 0) continue;

    // Section label
    if (y + 20 > 275) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...headerColor);
    doc.text(sectionTitle.toUpperCase(), MARGIN + 2, y + 4);
    y += 8;

    const total = sectionItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    autoTable(doc, {
      startY: y,
      head: [["Descrição", "Categoria", "Qtd.", "Valor Unit.", "Total"]],
      body: sectionItems.map((i) => [
        i.description,
        i.category,
        i.quantity.toString(),
        brl(i.unitPrice),
        brl(i.quantity * i.unitPrice),
      ]),
      foot: [["", "", "", "Subtotal", brl(total)]],
      theme: "grid",
      headStyles: { fillColor: headerColor, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: DARK },
      footStyles: { fillColor: LIGHT_BG, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 246, 242] as [number, number, number] },
      styles: { lineColor: BORDER, lineWidth: 0.15 },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { cellWidth: 65 },
        1: { cellWidth: 40 },
        2: { cellWidth: 15, halign: "center" },
        3: { cellWidth: 30, halign: "right" },
        4: { cellWidth: 30, halign: "right" },
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 288, PAGE_W - MARGIN, 288);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(`${studioName ?? "Altar"} · Orçamento: ${event.name}`, MARGIN, 293);
    doc.text(`Página ${i} de ${totalPages}`, PAGE_W - MARGIN, 293, { align: "right" });
  }

  const safeName = event.name.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, "").trim().replace(/\s+/g, "-");
  doc.save(`altar-orcamento-${safeName}.pdf`);
}
