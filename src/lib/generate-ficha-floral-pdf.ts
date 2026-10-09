import jsPDF from "jspdf";
import { entregarPdf } from "./pdf-delivery.ts";
import { ASSINATURA_ALTAR, resolveIdentidade, type EmpresaLike } from "./brand.ts";
import { formatEventDayOnly } from "./event-date.ts";
import { agruparPorAmbiente } from "./decoration-project.ts";
import { caixaProporcional, carregarImagemParaPdf } from "./imagem-para-pdf.ts";
import { quantidadeTexto } from "@/convex/lib/fichaTecnica.ts";
import {
  ROTULO_DA_INSTRUCAO,
  rotuloDaOrigem,
  textoDaQuantidade,
  type AvisoFloral,
  type FlorDaLegenda,
  type InstrucoesFlorais,
  type ItemDeChecklist,
  type LinhaFloral,
  type LinhaDoResumo,
  type OrientacaoFloral,
} from "@/convex/lib/producaoFloral.ts";

// ─────────────────────────────────────────────────────────────────────────────
// FICHA DE PRODUÇÃO FLORAL — o papel que vai para o florista.
//
// ── O QUE ELE NÃO TEM, DE PROPÓSITO ─────────────────────────────────────────
//  · NENHUM VALOR. Nem custo de referência, nem margem, nem total em reais.
//    Ficha na mão de fornecedor com preço dentro é vazamento comercial
//    esperando acontecer — a mesma regra da Ficha Técnica e da Folha de
//    Carregamento;
//  · nada de compra, pagamento, cobertura ou estoque: o florista monta, não
//    administra;
//  · nada de referência visual ou item fora do projeto. Quem filtra é a
//    consulta (`producaoFloral.fichaDoFlorista`), com `ehObrigacaoDeMontagem` —
//    a MESMA regra do Caderno e da Folha.
//
// ── NÃO REFAZ NENHUMA CONTA ─────────────────────────────────────────────────
// Toda quantidade que aparece aqui vem pronta de `lib/producaoFloral.ts`, que
// por sua vez usa `necessidadeDoComponente` de `lib/fichaTecnica.ts`. Este
// arquivo não multiplica, não divide e não soma nada: se multiplicasse, o papel
// diria 95 rosas onde a tela diz 100.
//
// ── ECONÔMICO PARA IMPRIMIR ─────────────────────────────────────────────────
// Sem fundo colorido além da faixa do cabeçalho, sem zebra, sem ícone. Fotos
// só quando pedidas, e em miniatura. O florista imprime isto numa laser
// doméstica, às vezes em preto e branco.
// ─────────────────────────────────────────────────────────────────────────────

const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const HEADER_H = 26;
const RODAPE = 18;
const LARGURA = PAGE_W - MARGIN * 2;

/** Miniatura da flor: legível sem engordar o arquivo. */
const MINIATURA_MM = 26;
const MINIATURA_PX = 420;
/** Referência do arranjo: maior, porque é dela que sai a forma. */
const REFERENCIA_MM = 42;
const REFERENCIA_PX = 700;

export type ComposicaoFloralPdf = {
  _id: string;
  nome: string;
  area: string;
  ambiente?: string;
  quantidade?: number;
  instrucoes: InstrucoesFlorais;
  materiais: LinhaFloral[];
  orientacoes: OrientacaoFloral[];
  referenciaUrl: string | null;
};

export type FichaFloralPdfData = {
  evento: {
    nome: string;
    data?: string;
    local?: string;
    cliente?: string;
    responsavel?: string | null;
  };
  composicoes: ComposicaoFloralPdf[];
  avisos: AvisoFloral[];
  checklist: ItemDeChecklist[];
  resumo: LinhaDoResumo[];
  flores: FlorDaLegenda[];
  /** ISO da geração — vira a data e o código da versão no rodapé. */
  geradoEm: string;
  incluirFotosDasFlores?: boolean;
  incluirReferenciasDosArranjos?: boolean;
  empresa?: EmpresaLike | null;
};

/**
 * O código da versão impressa.
 *
 * Duas fichas do mesmo evento impressas em dias diferentes são documentos
 * diferentes, e o florista precisa saber qual está na bancada. O código é a
 * data e a hora da geração, que é a única coisa que distingue as duas sem
 * inventar um contador em lugar nenhum do banco.
 */
export function codigoDaVersao(geradoEm: string): string {
  const d = new Date(geradoEm);
  if (Number.isNaN(d.getTime())) return "FLORAL";
  const dois = (n: number) => String(n).padStart(2, "0");
  return (
    `FLORAL-${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}` +
    `-${dois(d.getHours())}${dois(d.getMinutes())}`
  );
}

/** "9 de outubro de 2026, 20:41" — a data de geração, por extenso curto. */
export function dataDaGeracao(geradoEm: string): string {
  const d = new Date(geradoEm);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function generateFichaFloralPDF(data: FichaFloralPdfData): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const identidade = resolveIdentidade(data.empresa);
  const versao = codigoDaVersao(data.geradoEm);

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

  const novaPagina = (titulo = "FICHA DE PRODUÇÃO FLORAL") => {
    doc.addPage();
    cabecalho(titulo);
  };

  const garantirEspaco = (altura: number) => {
    if (y + altura > PAGE_H - RODAPE) novaPagina();
  };

  /** Texto que quebra em várias linhas e respeita o fim da página. */
  const paragrafo = (texto: string, x: number, largura: number, tamanho = 9.5) => {
    doc.setFontSize(tamanho);
    for (const linha of doc.splitTextToSize(texto, largura) as string[]) {
      garantirEspaco(5);
      doc.text(linha, x, y);
      y += 4.4;
    }
  };

  const tituloDeBloco = (texto: string) => {
    garantirEspaco(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...identidade.cor);
    doc.text(texto.toUpperCase(), MARGIN, y);
    doc.setTextColor(30, 30, 30);
    y += 2;
    doc.setDrawColor(...identidade.cor);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "normal");
  };

  cabecalho("FICHA DE PRODUÇÃO FLORAL");

  // ── Identificação ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.evento.nome, MARGIN, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const identificacao = [
    data.evento.data ? formatEventDayOnly(data.evento.data) : null,
    data.evento.local,
    data.evento.cliente,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (identificacao) {
    doc.text(identificacao, MARGIN, y);
    y += 5;
  }
  // Responsável aparece SEMPRE, inclusive quando não há: "a definir" é
  // informação, e o florista precisa saber a quem ligar.
  doc.text(`Responsável: ${data.evento.responsavel?.trim() || "a definir"}`, MARGIN, y);
  y += 5;

  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Gerada em ${dataDaGeracao(data.geradoEm)}  ·  versão ${versao}`,
    MARGIN,
    y,
  );
  y += 9;
  doc.setTextColor(30, 30, 30);

  if (data.composicoes.length === 0) {
    doc.setFontSize(10);
    doc.text("Nenhuma composição com receita cadastrada neste evento.", MARGIN, y);
  }

  // ── Cuidados e horários, em destaque ──────────────────────────────────────
  // Repetidos de propósito: eles aparecem outra vez no bloco da composição. As
  // duas coisas que arruínam o evento são a flor que ficou sem água e o
  // arranjo que chegou depois da cerimônia, e ninguém pode descobrir isso na
  // página 4.
  if (data.avisos.length > 0) {
    tituloDeBloco("Cuidados e horários");
    for (const aviso of data.avisos) {
      garantirEspaco(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text(`${aviso.composicao} — ${aviso.ambiente}`, MARGIN, y);
      y += 4.4;
      doc.setFont("helvetica", "normal");
      if (aviso.horario) paragrafo(`Horário: ${aviso.horario}`, MARGIN + 2, LARGURA - 2, 9);
      if (aviso.cuidados) paragrafo(`Cuidados: ${aviso.cuidados}`, MARGIN + 2, LARGURA - 2, 9);
      y += 2;
    }
    y += 2;
  }

  // ── Ambientes e composições ───────────────────────────────────────────────
  for (const grupo of agruparPorAmbiente(data.composicoes)) {
    tituloDeBloco(grupo.label);

    for (const composicao of grupo.itens) {
      const unidades = composicao.quantidade ?? 1;
      garantirEspaco(20);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(composicao.nome, MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${unidades} ${unidades === 1 ? "arranjo" : "arranjos"}`,
        PAGE_W - MARGIN,
        y,
        { align: "right" },
      );
      y += 5.5;

      // Receita. As duas quantidades vêm prontas em uma frase só
      // (`textoDaQuantidade`), para a tela e o papel dizerem igual.
      if (composicao.materiais.length > 0) {
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        doc.text("RECEITA", MARGIN + 2, y);
        doc.setTextColor(30, 30, 30);
        y += 4.2;

        for (const linha of composicao.materiais) {
          garantirEspaco(6);
          const nome = [linha.nome, linha.variedade, linha.cor]
            .filter(Boolean)
            .join(" · ");
          const origem = rotuloDaOrigem(linha.origem);
          doc.setFontSize(9.5);
          doc.text(origem ? `${nome}  (${origem.toLowerCase()})` : nome, MARGIN + 2, y);
          doc.setFont("helvetica", "bold");
          doc.text(textoDaQuantidade(linha.quantidade), PAGE_W - MARGIN, y, {
            align: "right",
          });
          doc.setFont("helvetica", "normal");
          y += 4.6;
          if (linha.notes) {
            doc.setFontSize(8);
            doc.setTextColor(110, 110, 110);
            paragrafo(linha.notes, MARGIN + 4, LARGURA - 6, 8);
            doc.setTextColor(30, 30, 30);
          }
        }
        y += 1.5;
      }

      // Orientações: instrução sem quantidade. Aparecem separadas da receita
      // justamente para ninguém somá-las de cabeça.
      if (composicao.orientacoes.length > 0) {
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        garantirEspaco(6);
        doc.text("ORIENTAÇÕES (sem quantidade definida)", MARGIN + 2, y);
        doc.setTextColor(30, 30, 30);
        y += 4.2;
        for (const o of composicao.orientacoes) {
          const partes = [o.nome, o.cor, rotuloDaOrigem(o.origem)?.toLowerCase(), o.notes]
            .filter(Boolean)
            .join(" · ");
          paragrafo(`· ${partes}`, MARGIN + 2, LARGURA - 4, 9);
        }
        y += 1.5;
      }

      // Instruções de montagem, cada campo com o próprio rótulo.
      for (const campo of [
        "formato",
        "altura",
        "montagem",
        "substituicoes",
        "cuidados",
        "horario",
        "observacoes",
      ] as const) {
        const valor = composicao.instrucoes[campo];
        if (!valor) continue;
        garantirEspaco(8);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(`${ROTULO_DA_INSTRUCAO[campo]}:`, MARGIN + 2, y);
        const deslocamento = doc.getTextWidth(`${ROTULO_DA_INSTRUCAO[campo]}: `);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const linhas = doc.splitTextToSize(
          valor,
          LARGURA - 4 - deslocamento,
        ) as string[];
        doc.text(linhas[0] ?? "", MARGIN + 2 + deslocamento, y);
        y += 4.4;
        for (const extra of linhas.slice(1)) {
          garantirEspaco(5);
          doc.text(extra, MARGIN + 2 + deslocamento, y);
          y += 4.4;
        }
      }

      // Referência DO ARRANJO — não é a foto da flor. Rótulo explícito, porque
      // confundir as duas é mandar o florista copiar a cor errada.
      if (data.incluirReferenciasDosArranjos && composicao.referenciaUrl) {
        const img = await carregarImagemParaPdf(composicao.referenciaUrl, REFERENCIA_PX);
        if (img) {
          const caixa = caixaProporcional(img, REFERENCIA_MM, REFERENCIA_MM);
          garantirEspaco(caixa.h + 8);
          doc.setFontSize(8);
          doc.setTextColor(110, 110, 110);
          doc.text("REFERÊNCIA DO ARRANJO", MARGIN + 2, y);
          doc.setTextColor(30, 30, 30);
          y += 3.5;
          doc.addImage(img.dataUrl, "JPEG", MARGIN + 2, y, caixa.w, caixa.h);
          y += caixa.h + 3;
        }
      }

      y += 3;
    }
    y += 1;
  }

  // ── Checklist de produção ─────────────────────────────────────────────────
  if (data.checklist.length > 0) {
    novaPagina("CHECKLIST DE PRODUÇÃO");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    paragrafo(
      "Uma linha por composição. Marque na bancada; o papel é o controle.",
      MARGIN,
      LARGURA,
      8,
    );
    doc.setTextColor(30, 30, 30);
    y += 4;

    for (const item of data.checklist) {
      garantirEspaco(8);
      doc.setDrawColor(120, 120, 120);
      doc.rect(MARGIN, y - 3.2, 4, 4);
      doc.setFontSize(9.5);
      doc.text(`${item.composicao}`, MARGIN + 7, y);
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      const detalhe = [
        item.ambiente,
        `${item.unidades} ${item.unidades === 1 ? "arranjo" : "arranjos"}`,
        `${item.materiais} ${item.materiais === 1 ? "material" : "materiais"}`,
        item.comAviso ? "tem cuidado/horário" : null,
      ]
        .filter(Boolean)
        .join("  ·  ");
      doc.text(detalhe, PAGE_W - MARGIN, y, { align: "right" });
      doc.setTextColor(30, 30, 30);
      y += 6.5;
    }
  }

  // ── Resumo de materiais ───────────────────────────────────────────────────
  if (data.resumo.length > 0) {
    garantirEspaco(30);
    y += 4;
    tituloDeBloco("Resumo de materiais");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    paragrafo(
      "Soma do que esta ficha pede, por material e unidade. Unidades diferentes " +
        "não se somam: maço e haste são linhas separadas. Conferência de compra, " +
        "estoque e acervo continua nas telas do ALTAR — este resumo é papel.",
      MARGIN,
      LARGURA,
      8,
    );
    doc.setTextColor(30, 30, 30);
    y += 3;

    for (const linha of data.resumo) {
      garantirEspaco(7);
      doc.setFontSize(9.5);
      const detalhes = [linha.cor, rotuloDaOrigem(linha.origem ?? undefined)?.toLowerCase()]
        .filter(Boolean)
        .join(" · ");
      doc.text(detalhes ? `${linha.nome}  (${detalhes})` : linha.nome, MARGIN + 2, y);
      doc.setFont("helvetica", "bold");
      doc.text(quantidadeTexto(linha.total, linha.unidade), PAGE_W - MARGIN, y, {
        align: "right",
      });
      doc.setFont("helvetica", "normal");
      y += 5;
    }
  }

  // ── Legenda das flores, com foto ──────────────────────────────────────────
  const comFoto = data.incluirFotosDasFlores
    ? data.flores.filter((f) => f.fotoUrl)
    : [];
  if (comFoto.length > 0) {
    novaPagina("FOTOS DAS FLORES");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    paragrafo(
      "Para reconhecer a flor pelo nome. Não é a referência do arranjo — essa " +
        "vai junto de cada composição.",
      MARGIN,
      LARGURA,
      8,
    );
    doc.setTextColor(30, 30, 30);
    y += 4;

    const COLUNAS = 3;
    const PASSO = LARGURA / COLUNAS;
    let coluna = 0;
    let alturaDaLinha = 0;
    const inicioDaLinha = () => {
      garantirEspaco(MINIATURA_MM + 18);
      alturaDaLinha = 0;
    };
    inicioDaLinha();

    for (const flor of comFoto) {
      const img = flor.fotoUrl
        ? await carregarImagemParaPdf(flor.fotoUrl, MINIATURA_PX)
        : null;
      const x = MARGIN + coluna * PASSO;
      const caixa = img
        ? caixaProporcional(img, PASSO - 4, MINIATURA_MM)
        : { w: 0, h: 0, dx: 0, dy: 0 };
      if (img) doc.addImage(img.dataUrl, "JPEG", x, y, caixa.w, caixa.h);

      let yTexto = y + (img ? caixa.h : 0) + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(flor.nome, x, yTexto);
      yTexto += 3.6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      const legenda = [
        flor.variedade,
        flor.cor ? `cor desejada: ${flor.cor}` : null,
        rotuloDaOrigem(flor.origem ?? undefined),
        quantidadeTexto(flor.total, flor.unidade),
      ].filter(Boolean) as string[];
      for (const texto of doc.splitTextToSize(legenda.join(" · "), PASSO - 4) as string[]) {
        doc.text(texto, x, yTexto);
        yTexto += 3.2;
      }
      // A foto é da FLOR, e a cor é decisão deste projeto: a imagem pode não
      // ser da cor pedida. Sem este aviso o florista compra pela foto.
      if (flor.fotoIlustrativa) {
        doc.setTextColor(150, 100, 0);
        for (const texto of doc.splitTextToSize(
          "Foto ilustrativa: pode não ser a cor pedida.",
          PASSO - 4,
        ) as string[]) {
          doc.text(texto, x, yTexto);
          yTexto += 3.2;
        }
      }
      doc.setTextColor(30, 30, 30);

      alturaDaLinha = Math.max(alturaDaLinha, yTexto - y);
      coluna += 1;
      if (coluna === COLUNAS) {
        coluna = 0;
        y += alturaDaLinha + 6;
        inicioDaLinha();
      }
    }
    if (coluna !== 0) y += alturaDaLinha + 6;
  }

  // ── Rodapé em todas as páginas ────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`${ASSINATURA_ALTAR}  ·  ${versao}`, MARGIN, PAGE_H - 8);
    doc.text(`${p}/${paginas}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  entregarPdf(
    doc,
    `ficha-floral-${data.evento.nome.replace(/[^\w]+/g, "-").toLowerCase()}.pdf`,
  );
}
