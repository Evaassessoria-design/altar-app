import jsPDF from "jspdf";
import { ASSINATURA_ALTAR, resolveIdentidade, type EmpresaLike } from "./brand.ts";
import { formatEventDayOnly } from "./event-date.ts";
import { labelDoAmbiente } from "./decoration-project.ts";
import {
  consolidarMateriais,
  necessidadeDoComponente,
  quantidadeTexto,
  type ComposicaoNoEvento,
  type LinhaConsolidada,
} from "@/convex/lib/fichaTecnica.ts";
import { ehObrigacaoDeMontagem } from "@/convex/lib/escopoDoProjeto.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PDF DA FICHA TÉCNICA
//
// Documento de PRODUÇÃO. Quem segura este papel é o florista montando os
// arranjos, a produção separando material, o responsável conferindo o galpão.
//
// ── O QUE ELE NÃO TEM, DE PROPÓSITO ─────────────────────────────────────────
//  · NENHUM VALOR. Nem custo estimado, nem preço, nem total. Ficha técnica com
//    preço na mão de um fornecedor é vazamento comercial esperando acontecer —
//    a mesma regra que a Folha de Carregamento já segue;
//  · nada de "comprado", "pago" ou cobertura: isso é conversa de compras, não
//    instrução de produção;
//  · nada de referência visual ou item fora do projeto (`ehObrigacaoDeMontagem`,
//    a MESMA regra do Caderno e da Folha). Mandar o florista fazer um arranjo
//    de inspiração é fazer alguém perder a manhã.
//
// ── É O SNAPSHOT DO EVENTO ──────────────────────────────────────────────────
// Recebe as composições DO EVENTO, com a receita congelada nelas. Nunca a
// biblioteca central: um evento de seis meses atrás tem de imprimir a receita
// que foi executada, não a que a decoradora ajustou depois.
//
// O Caderno de Montagem responde "como montar"; esta ficha responde "do que é
// feito". São documentos diferentes e continuam separados.
// ─────────────────────────────────────────────────────────────────────────────

const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const HEADER_H = 26;
const RODAPE = 18;

export type FichaTecnicaPdfData = {
  event: { name: string; date?: string; location?: string; clientName?: string };
  /** Composições DO EVENTO, com a receita em snapshot. */
  composicoes: ComposicaoNoEvento[];
  empresa?: EmpresaLike | null;
};

/** Agrupa por ambiente na mesma ordem que as telas usam. */
function porAmbiente(composicoes: readonly ComposicaoNoEvento[]) {
  const mapa = new Map<string, ComposicaoNoEvento[]>();
  for (const c of composicoes) {
    const chave = c.ambiente?.trim() || c.area;
    mapa.set(chave, [...(mapa.get(chave) ?? []), c]);
  }
  return [...mapa.entries()];
}

export async function generateFichaTecnicaPDF(data: FichaTecnicaPdfData): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const identidade = resolveIdentidade(data.empresa);

  // Só obrigações reais entram — a mesma regra central de todo o resto.
  const executaveis = data.composicoes.filter(
    (c) => ehObrigacaoDeMontagem(c) && (c.receita?.length ?? 0) > 0,
  );
  const consolidado = consolidarMateriais(data.composicoes, ehObrigacaoDeMontagem);

  let y = 0;

  const cabecalho = (titulo: string) => {
    doc.setFillColor(...identidade.cor);
    doc.rect(0, 0, PAGE_W, HEADER_H, "F");
    doc.setTextColor(...identidade.textoSobreCor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(titulo, MARGIN, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(identidade.nome, MARGIN, 18);
    doc.setTextColor(30, 30, 30);
    y = HEADER_H + 8;
  };

  const novaPagina = (titulo = "FICHA TÉCNICA") => {
    doc.addPage();
    cabecalho(titulo);
  };

  /** Quebra de página só quando falta espaço de verdade. */
  const garantirEspaco = (altura: number) => {
    if (y + altura > PAGE_H - RODAPE) novaPagina();
  };

  cabecalho("FICHA TÉCNICA");

  // ── Identificação ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.event.name, MARGIN, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const identificacao = [
    data.event.date ? formatEventDayOnly(data.event.date) : null,
    data.event.location,
    data.event.clientName,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (identificacao) {
    doc.text(identificacao, MARGIN, y);
    y += 5;
  }

  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `${executaveis.length} ${executaveis.length === 1 ? "composição" : "composições"}  ·  ` +
      `${consolidado.length} ${consolidado.length === 1 ? "material" : "materiais"}`,
    MARGIN,
    y,
  );
  y += 9;
  doc.setTextColor(30, 30, 30);

  if (executaveis.length === 0) {
    doc.setFontSize(10);
    doc.text("Nenhuma composição com ficha técnica cadastrada.", MARGIN, y);
  }

  // ── Por ambiente ──────────────────────────────────────────────────────────
  for (const [ambiente, itens] of porAmbiente(executaveis)) {
    garantirEspaco(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...identidade.cor);
    doc.text(labelDoAmbiente(ambiente).label.toUpperCase(), MARGIN, y);
    doc.setTextColor(30, 30, 30);
    y += 2;
    doc.setDrawColor(...identidade.cor);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;

    for (const item of itens) {
      const linhas = item.receita ?? [];
      // Uma composição inteira cabendo na mesma página sempre que der: nome +
      // quantidade + "por unidade" + as linhas + "total" + respiro.
      garantirEspaco(18 + linhas.length * 9);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(item.nome, MARGIN, y);
      const unidades = item.quantidade ?? 1;
      doc.setFont("helvetica", "normal");
      doc.text(
        `Quantidade: ${unidades}`,
        PAGE_W - MARGIN,
        y,
        { align: "right" },
      );
      y += 5;

      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text("POR UNIDADE", MARGIN + 2, y);
      doc.text("TOTAL", PAGE_W - MARGIN, y, { align: "right" });
      doc.setTextColor(30, 30, 30);
      y += 4.5;

      doc.setFontSize(9.5);
      for (const componente of linhas) {
        garantirEspaco(6);
        doc.text(
          `${quantidadeTexto(componente.quantidade, componente.unidade)}  ${componente.nome}`,
          MARGIN + 2,
          y,
        );
        doc.setFont("helvetica", "bold");
        doc.text(
          quantidadeTexto(necessidadeDoComponente(item, componente), componente.unidade),
          PAGE_W - MARGIN,
          y,
          { align: "right" },
        );
        doc.setFont("helvetica", "normal");
        y += 5;
      }
      y += 4;
    }
    y += 2;
  }

  // ── Consolidado ───────────────────────────────────────────────────────────
  if (consolidado.length > 0) {
    novaPagina("CONSOLIDADO DE MATERIAIS");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text("Tudo que o evento inteiro precisa, somado.", MARGIN, y);
    y += 7;
    doc.setTextColor(30, 30, 30);

    // Agrupa por categoria do material quando existe; o resto vai em "Outros".
    const categorias = new Map<string, LinhaConsolidada[]>();
    for (const linha of consolidado) {
      const chave = linha.categoria?.trim() || "Outros materiais";
      categorias.set(chave, [...(categorias.get(chave) ?? []), linha]);
    }

    for (const [categoria, linhas] of categorias) {
      garantirEspaco(16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...identidade.cor);
      doc.text(categoria.toUpperCase(), MARGIN, y);
      doc.setTextColor(30, 30, 30);
      y += 5;

      for (const linha of linhas) {
        // Uma linha "necessário/margem/sugerido" ocupa três alturas.
        const temMargem = linha.margemPercentual !== null && linha.margemPercentual > 0;
        garantirEspaco(temMargem ? 13 : 7);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.text(linha.nome, MARGIN + 2, y);
        doc.setFont("helvetica", "bold");
        doc.text(
          quantidadeTexto(linha.necessario, linha.unidade),
          PAGE_W - MARGIN,
          y,
          { align: "right" },
        );
        y += 4.5;

        if (temMargem) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(110, 110, 110);
          doc.text(
            `margem ${linha.margemPercentual}%  ·  providenciar ` +
              `${quantidadeTexto(linha.sugeridoOperacional, linha.unidade)}`,
            MARGIN + 2,
            y,
          );
          doc.setTextColor(30, 30, 30);
          y += 4.5;
        }

        // A equipe NÃO pode receber instrução falsa de retorno/consumo. Quando
        // dois ambientes classificaram o material de formas diferentes, o
        // papel diz isso em vez de escolher um lado.
        if (linha.tipoAmbiguo) {
          doc.setFontSize(8);
          doc.setTextColor(150, 100, 0);
          doc.text("classificação a revisar", MARGIN + 2, y);
          doc.setTextColor(30, 30, 30);
          y += 4.5;
        }
        y += 1;
      }
      y += 3;
    }
  }

  // ── Rodapé em todas as páginas ────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(ASSINATURA_ALTAR, MARGIN, PAGE_H - 8);
    doc.text(`${p}/${paginas}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  doc.save(`ficha-tecnica-${data.event.name.replace(/[^\w]+/g, "-").toLowerCase()}.pdf`);
}
