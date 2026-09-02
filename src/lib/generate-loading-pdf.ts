import jsPDF from "jspdf";
import { ASSINATURA_ALTAR, resolveIdentidade, type EmpresaLike } from "./brand.ts";
import { formatEventDayOnly } from "./event-date.ts";
import {
  montarFolhaDeCarregamento,
  quantidadeTexto,
  resumoDoRetorno,
  type ItemDeCarregamento,
} from "./loading-sheet.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PDF DA FOLHA DE CARREGAMENTO
//
// Documento de LOGÍSTICA, não de projeto. Quem segura esta folha está no
// galpão conferindo caixa, muitas vezes em pé, com a mão suja. Por isso:
//
//   · sem foto, sem referência estética, sem texto de venda;
//   · SEM VALOR NENHUM — folha de carga com preço na mão de quem carrega é
//     vazamento comercial esperando acontecer;
//   · colunas largas e caixas de marcar grandes o bastante para caneta;
//   · uma coluna para a SAÍDA e outra para o RETORNO, na mesma linha, porque
//     é a mesma caixa que sai e volta.
//
// O Caderno de Montagem continua sendo outro documento, com outro propósito.
// Misturar os dois produziria um papel que não serve bem para nenhum dos dois
// momentos.
// ─────────────────────────────────────────────────────────────────────────────

const MARGIN = 12;
const PAGE_W = 210;
const PAGE_H = 297;
const HEADER_H = 26;

export type LoadingPdfData = {
  event: { name: string; date?: string; location?: string; clientName?: string };
  items: ItemDeCarregamento[];
  empresa?: EmpresaLike | null;
  responsible?: string;
  responsiblePhone?: string;
};

export async function generateLoadingPDF(data: LoadingPdfData): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const identidade = resolveIdentidade(data.empresa);
  const folha = montarFolhaDeCarregamento(data.items);

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  doc.setFillColor(...identidade.cor);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  doc.setTextColor(...identidade.textoSobreCor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("FOLHA DE CARREGAMENTO", MARGIN, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(identidade.nome, MARGIN, 18);

  let y = HEADER_H + 8;
  doc.setTextColor(30, 30, 30);

  // ── Identificação do evento ───────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.event.name, MARGIN, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const linha = [
    data.event.date ? formatEventDayOnly(data.event.date) : null,
    data.event.location,
    data.event.clientName,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (linha) {
    doc.text(linha, MARGIN, y);
    y += 5;
  }

  const responsavel = [data.responsible, data.responsiblePhone].filter(Boolean).join(" · ");
  if (responsavel) {
    doc.text(`Responsável: ${responsavel}`, MARGIN, y);
    y += 5;
  }

  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `${folha.total} ${folha.total === 1 ? "item" : "itens"}  ·  ${folha.pendentes} ainda no galpão`,
    MARGIN,
    y,
  );
  y += 8;

  // ── Colunas ───────────────────────────────────────────────────────────────
  const X_ITEM = MARGIN;
  const X_QTD = 128;
  const X_SIT = 150;
  const X_SAIU = 180;
  const X_VOLTOU = 194;

  const cabecalhoDaTabela = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text("ITEM", X_ITEM, y);
    doc.text("QTD", X_QTD, y);
    doc.text("SITUAÇÃO", X_SIT, y);
    doc.text("SAIU", X_SAIU, y);
    doc.text("VOLTOU", X_VOLTOU - 2, y);
    y += 2;
    doc.setDrawColor(210, 210, 210);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 4;
  };

  const novaPagina = () => {
    doc.addPage();
    y = 18;
    cabecalhoDaTabela();
  };

  const garantirEspaco = (precisa: number) => {
    if (y + precisa > PAGE_H - 16) novaPagina();
  };

  cabecalhoDaTabela();

  if (folha.total === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text("Nenhum item cadastrado para carregar.", MARGIN, y + 4);
  }

  for (const ambiente of folha.ambientes) {
    garantirEspaco(16);

    // Título do ambiente — é por ele que a equipe separa no galpão.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...identidade.cor);
    doc.text(ambiente.label.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `${ambiente.itens.length} ${ambiente.itens.length === 1 ? "item" : "itens"}`,
      PAGE_W - MARGIN,
      y,
      { align: "right" },
    );
    y += 5;

    for (const item of ambiente.itens) {
      garantirEspaco(9);

      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      const detalhe = item.ambiente?.trim() ? `  (${item.ambiente.trim()})` : "";
      const nome = doc.splitTextToSize(`${item.name}${detalhe}`, X_QTD - X_ITEM - 4)[0] as string;
      doc.text(nome, X_ITEM, y);
      doc.text(quantidadeTexto(item), X_QTD, y);

      doc.setFontSize(7.5);
      doc.setTextColor(item.emAberto ? 190 : 120, item.emAberto ? 90 : 120, 60);
      doc.text(item.situacaoLabel, X_SIT, y);

      // Caixas de marcar — o motivo de existir uma folha de papel.
      doc.setDrawColor(120, 120, 120);
      doc.rect(X_SAIU, y - 3.2, 4, 4);
      doc.rect(X_VOLTOU, y - 3.2, 4, 4);

      y += 7;
      doc.setDrawColor(235, 235, 235);
      doc.line(MARGIN, y - 3, PAGE_W - MARGIN, y - 3);
    }

    y += 3;
  }

  // ── O que ficou em aberto ─────────────────────────────────────────────────
  const pendencia = resumoDoRetorno(folha);
  if (pendencia) {
    garantirEspaco(14);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(170, 70, 50);
    doc.text(pendencia.toUpperCase(), MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      "Confira a coluna VOLTOU antes de encerrar o evento.",
      MARGIN,
      y,
    );
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`${identidade.nome} · ${data.event.name}`, MARGIN, PAGE_H - 6);
    doc.text(`Página ${i} de ${total}`, PAGE_W / 2, PAGE_H - 6, { align: "center" });
    doc.text(ASSINATURA_ALTAR, PAGE_W - MARGIN, PAGE_H - 6, { align: "right" });
  }

  doc.save(`carregamento-${data.event.name.replace(/[^\w\s-]/g, "").trim() || "evento"}.pdf`);
}
