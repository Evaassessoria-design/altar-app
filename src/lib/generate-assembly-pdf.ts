import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import {
  resolveAreasForAudience,
  itemVisibleTo,
  areaByKey,
  BRIEFING_AREAS,
  type Audience,
  type BriefingFields,
} from "./briefing-areas.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CADERNO DE MONTAGEM — relatório operacional do evento.
//
// Regras absolutas (todas aplicadas antes de desenhar qualquer coisa):
//  1. campo vazio não aparece;
//  2. área vazia não aparece;
//  3. item com includeInAssemblyReport=false não aparece;
//  4. informação financeira não entra (bloqueada pela visibilidade do campo);
//  5. só entra o que a audiência pode ver;
//  6. item com checkOnAssembly=true ganha ☐ para conferência manual.
//
// A audiência é parâmetro: hoje geramos "equipe", e os relatórios de cliente e
// interno saem da mesma função sem tocar em schema nem em dados.
// ─────────────────────────────────────────────────────────────────────────────

const PRIMARY: [number, number, number] = [178, 142, 96];
const PRIMARY_DARK: [number, number, number] = [120, 90, 50];
const LIGHT_BG: [number, number, number] = [252, 249, 244];
const BORDER: [number, number, number] = [220, 205, 180];
const MUTED: [number, number, number] = [120, 110, 100];
const DARK: [number, number, number] = [40, 35, 30];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

const THUMB_MM = 22; // miniatura do item
const MAP_MAX_MM = 110; // planta do evento

export type AssemblyItem = Doc<"assemblyItems"> & {
  referencePhotoUrl?: string | null;
  contractedPhotoUrl?: string | null;
};

export interface AssemblyReportData {
  event: Doc<"events">;
  briefing?: Partial<BriefingFields> | null;
  items?: AssemblyItem[];
  /** Checklist de montagem (fase "pre"). */
  checklist?: Pick<Doc<"checklistItems">, "name" | "category" | "quantity" | "unit">[];
  /** Cabeçalho — vindos de health.getEventHealth, todos opcionais. */
  guestCount?: string;
  assessoria?: string;
  responsible?: string;
  /** Planta premium aprovada (layoutRenders). Ausente = seção não aparece. */
  mapUrl?: string | null;
  audience?: Audience;
  generatedBy?: string;
}

// ── Imagens: miniatura comprimida ────────────────────────────────────────────

type Thumb = { dataUrl: string; w: number; h: number };

/**
 * Baixa a imagem e devolve um JPEG reduzido. Priorizamos legibilidade e tamanho
 * de arquivo — não resolução de impressão fotográfica.
 */
async function loadThumbnail(url: string, maxPx: number): Promise<Thumb | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Fundo branco: JPEG não tem transparência.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    return { dataUrl: canvas.toDataURL("image/jpeg", 0.7), w, h };
  } catch {
    return null; // imagem indisponível nunca derruba o relatório
  }
}

// ── Helpers de layout ────────────────────────────────────────────────────────

function addPageIfNeeded(doc: jsPDF, y: number, needed = 30): number {
  if (y + needed > PAGE_H - 17) {
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

function fieldRow(doc: jsPDF, label: string, value: string, y: number): number {
  y = addPageIfNeeded(doc, y, 8);
  const lines = doc.splitTextToSize(value, CONTENT_W - 55) as string[];
  const rowH = Math.max(7, lines.length * 4.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(label, MARGIN + 2, y + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(lines, MARGIN + 50, y + 4.5);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.1);
  doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
  return y + rowH + 1;
}

/** Quadrado vazio ☐ desenhado como vetor (fonte padrão do jsPDF não tem o glifo). */
function checkbox(doc: jsPDF, x: number, y: number, size = 4): void {
  doc.setDrawColor(...PRIMARY_DARK);
  doc.setLineWidth(0.4);
  doc.rect(x, y, size, size);
}

// ── Documento ────────────────────────────────────────────────────────────────

export async function generateAssemblyPDF(data: AssemblyReportData): Promise<void> {
  const audience: Audience = data.audience ?? "equipe";
  const { event, briefing, items = [], checklist = [] } = data;

  // Regras 3 e 5 aplicadas antes de qualquer desenho.
  const reportItems = items.filter(
    (i) => i.includeInAssemblyReport && itemVisibleTo(i.visibility, audience),
  );
  // Regras 1, 2 e 4.
  const areas = resolveAreasForAudience(briefing, audience);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_W, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text("CADERNO DE MONTAGEM", MARGIN, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("ALTAR · Documento operacional da equipe", MARGIN, 19.5);
  doc.setFontSize(7);
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    PAGE_W - MARGIN,
    19.5,
    { align: "right" },
  );

  let y = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...DARK);
  doc.text(doc.splitTextToSize(event.name, CONTENT_W) as string[], MARGIN, y);
  y += 10;

  // Só entram os dados que existem — nada de "—" ocupando espaço.
  // `eventCode` ainda não existe no ALTAR: quando existir, entra aqui.
  const header: [string, string | undefined][] = [
    ["Data", event.date ? format(new Date(event.date), "dd/MM/yyyy", { locale: ptBR }) : undefined],
    ["Local", event.location?.trim() || undefined],
    ["Convidados", data.guestCount?.trim() || undefined],
    ["Assessoria", data.assessoria?.trim() || undefined],
    ["Responsável", data.responsible?.trim() || undefined],
  ];
  const headerRows = header.filter((h): h is [string, string] => !!h[1]);
  if (headerRows.length > 0) {
    y = sectionHeader(doc, "Evento", y);
    for (const [label, value] of headerRows) y = fieldRow(doc, label, value, y);
    y += 3;
  }

  // ── Planta / mapa (só se existir) ─────────────────────────────────────────
  if (data.mapUrl) {
    const map = await loadThumbnail(data.mapUrl, 1400);
    if (map) {
      const ratio = map.h / map.w;
      const w = Math.min(CONTENT_W, MAP_MAX_MM / Math.max(ratio, 0.01));
      const drawW = Math.min(CONTENT_W, w);
      const drawH = drawW * ratio;
      y = sectionHeader(doc, "Planta do evento", y);
      y = addPageIfNeeded(doc, y, drawH + 6);
      doc.addImage(map.dataUrl, "JPEG", MARGIN, y, drawW, drawH);
      y += drawH + 6;
    }
  }

  // ── Itens de montagem, agrupados por área ─────────────────────────────────
  if (reportItems.length > 0) {
    const byArea = new Map<string, AssemblyItem[]>();
    for (const item of reportItems) {
      const list = byArea.get(item.area) ?? [];
      list.push(item);
      byArea.set(item.area, list);
    }

    // Percorre na ordem canônica das áreas; área sem item é pulada (regra 2).
    for (const area of BRIEFING_AREAS) {
      const list = byArea.get(area.key);
      if (!list || list.length === 0) continue;

      y = sectionHeader(doc, `Montagem · ${area.label}`, y);

      for (const item of list) {
        const thumbUrl = item.referencePhotoUrl ?? item.contractedPhotoUrl ?? null;
        const thumb = thumbUrl ? await loadThumbnail(thumbUrl, 320) : null;

        const detailPairs: [string, string][] = [];
        if (item.model?.trim()) detailPairs.push(["Modelo", item.model.trim()]);
        if (item.ambiente?.trim()) detailPairs.push(["Ambiente", item.ambiente.trim()]);
        if (item.supplierName?.trim()) detailPairs.push(["Fornecedor", item.supplierName.trim()]);
        if (item.notes?.trim()) detailPairs.push(["Obs.", item.notes.trim()]);

        const blockH = Math.max(
          thumb ? THUMB_MM + 4 : 0,
          10 + detailPairs.length * 4.4,
        );
        y = addPageIfNeeded(doc, y, blockH + 4);

        const textX = MARGIN + (thumb ? THUMB_MM + 5 : 8);
        let ty = y + 4;

        // ☐ de conferência (regra 6).
        if (item.checkOnAssembly) checkbox(doc, MARGIN + (thumb ? THUMB_MM + 5 : 2), y + 0.5, 4);

        // Título: "180 Cadeiras Tiffany"
        const qty = item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""} ` : "";
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...DARK);
        const titleX = item.checkOnAssembly ? textX + 6 : textX;
        doc.text(
          doc.splitTextToSize(`${qty}${item.name}`, CONTENT_W - (titleX - MARGIN)) as string[],
          titleX,
          ty,
        );
        ty += 5.5;

        doc.setFontSize(8);
        for (const [label, value] of detailPairs) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...MUTED);
          doc.text(`${label}:`, textX, ty);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...DARK);
          const lines = doc.splitTextToSize(value, CONTENT_W - (textX - MARGIN) - 22) as string[];
          doc.text(lines, textX + 20, ty);
          ty += 4.4 * lines.length;
        }

        if (thumb) {
          const ratio = thumb.h / thumb.w;
          const h = Math.min(THUMB_MM, THUMB_MM * ratio);
          doc.addImage(thumb.dataUrl, "JPEG", MARGIN, y, THUMB_MM, h);
        }

        y = Math.max(ty, y + (thumb ? THUMB_MM : 0)) + 3;
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.1);
        doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
        y += 3;
      }
      y += 2;
    }
  }

  // ── Briefing por área (condicional) ───────────────────────────────────────
  for (const area of areas) {
    const meta = areaByKey(area.key);
    y = sectionHeader(doc, `${meta?.label ?? area.label}`, y);
    for (const group of area.groups) {
      if (group.label) {
        y = addPageIfNeeded(doc, y, 10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...PRIMARY_DARK);
        doc.text(group.label, MARGIN + 2, y + 3);
        y += 7;
      }
      for (const field of group.fields) y = fieldRow(doc, field.label, field.value, y);
    }
    y += 3;
  }

  // ── Checklist de montagem ─────────────────────────────────────────────────
  if (checklist.length > 0) {
    y = sectionHeader(doc, "Checklist de montagem", y);
    for (const item of checklist) {
      y = addPageIfNeeded(doc, y, 8);
      checkbox(doc, MARGIN + 2, y + 0.5, 4);
      const qty = item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""} · ` : "";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text(`${qty}${item.name}`, MARGIN + 9, y + 4);
      if (item.category?.trim()) {
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(item.category.trim(), PAGE_W - MARGIN, y + 4, { align: "right" });
      }
      y += 7;
    }
    y += 3;
  }

  // Documento sem nenhuma seção: avisa em vez de entregar folha em branco.
  if (headerRows.length === 0 && reportItems.length === 0 && areas.length === 0 && checklist.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("Ainda não há informações suficientes para o caderno de montagem.", MARGIN, y + 6);
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Altar · Caderno de Montagem: ${event.name}`, MARGIN, PAGE_H - 4);
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 4, { align: "right" });
  }

  const safeName = event.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  doc.save(`caderno-montagem-${safeName}.pdf`);
}
