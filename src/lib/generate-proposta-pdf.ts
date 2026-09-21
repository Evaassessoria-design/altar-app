import jsPDF from "jspdf";
import { entregarPdf } from "./pdf-delivery.ts";
import { ASSINATURA_ALTAR, resolveIdentidade, type EmpresaLike } from "./brand.ts";
import { formatEventDayOnly } from "./event-date.ts";
import type { PropostaParaCliente } from "@/convex/lib/propostaComercial.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PDF DA PROPOSTA COMERCIAL — O DOCUMENTO QUE VAI PARA A CLIENTE
//
// ── A FRONTEIRA ESTÁ NO TIPO ────────────────────────────────────────────────
// Este gerador recebe `PropostaParaCliente`, que é o que `paraOCliente`
// devolve — e só isso. Ele NÃO recebe o registro do banco, então não existe
// caminho por onde custo, margem, fornecedor ou nota interna cheguem até aqui:
// eles não estão no tipo, e não estão no objeto.
//
// É deliberadamente diferente do PDF do Orçamento, que recebe o resumo interno
// inteiro e por isso precisa se anunciar como documento interno em todas as
// páginas. Aqui a proteção não depende de aviso nenhum.
//
// ── O QUE "PREMIUM" SIGNIFICA AQUI ──────────────────────────────────────────
// Espaço, hierarquia e uma cor só — a da empresa. O investimento é a única
// coisa em destaque, porque é a pergunta que a cliente abre o documento para
// responder. Não há tabela com bordas, grade cinza nem carimbo de sistema: um
// documento de venda não pode parecer um relatório administrativo.
//
// Sem logo continua bonito: a identidade é tipográfica, e a imagem é um
// reforço opcional. Ela não é carregada aqui de propósito — baixar arquivo do
// storage para montar um PDF é uma decisão de infraestrutura que este
// documento não precisa tomar para ficar bom.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const RODAPE = 20;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type PropostaPdfData = {
  proposta: PropostaParaCliente;
  empresa?: EmpresaLike | null;
};

export function generatePropostaPDF({ proposta, empresa }: PropostaPdfData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const identidade = resolveIdentidade(empresa);
  const CINZA: [number, number, number] = [120, 115, 110];
  const ESCURO: [number, number, number] = [35, 32, 30];

  let y = 0;

  /**
   * Cabeçalho discreto: uma faixa fina da cor da empresa, não um bloco.
   *
   * Um retângulo colorido de 28mm no topo é linguagem de relatório. Aqui o
   * protagonista é o nome da empresa em tipografia, e a cor entra como
   * assinatura.
   */
  const cabecalho = () => {
    doc.setFillColor(...identidade.cor);
    doc.rect(0, 0, PAGE_W, 4, "F");

    doc.setTextColor(...ESCURO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(identidade.nome, MARGIN, 20);

    if (identidade.contato) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...CINZA);
      doc.text(identidade.contato, MARGIN, 25.5);
    }
    y = 38;
  };

  const novaPagina = () => {
    doc.addPage();
    cabecalho();
  };

  const garantirEspaco = (altura: number) => {
    if (y + altura > PAGE_H - RODAPE) novaPagina();
  };

  /** Texto que quebra em linhas, devolvendo a altura que ocupou. */
  const paragrafo = (texto: string, tamanho: number, cor: [number, number, number]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
    const linhas = doc.splitTextToSize(texto, CONTENT_W) as string[];
    const altura = linhas.length * (tamanho * 0.45);
    garantirEspaco(altura + 4);
    doc.text(linhas, MARGIN, y);
    y += altura + 4;
  };

  cabecalho();

  // ── Título e a quem se destina ───────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...ESCURO);
  const titulo = doc.splitTextToSize(proposta.titulo, CONTENT_W) as string[];
  doc.text(titulo, MARGIN, y);
  y += titulo.length * 9 + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...CINZA);
  doc.text(proposta.cliente, MARGIN, y);
  y += 5;

  // Data, local e convidados numa linha só — o cabeçalho do evento.
  const contexto = [
    proposta.evento?.tipo,
    proposta.evento?.data ? formatEventDayOnly(proposta.evento.data) : null,
    proposta.evento?.local,
    proposta.evento?.convidados !== undefined
      ? `${proposta.evento.convidados} convidados`
      : null,
  ].filter((v): v is string => !!v);
  if (contexto.length > 0) {
    doc.setFontSize(9);
    doc.text(contexto.join("   ·   "), MARGIN, y);
    y += 5;
  }

  y += 6;
  doc.setDrawColor(...identidade.cor);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, MARGIN + 28, y);
  y += 10;

  // ── Apresentação ─────────────────────────────────────────────────────────
  if (proposta.apresentacao) {
    paragrafo(proposta.apresentacao, 10.5, ESCURO);
    y += 6;
  }

  // ── Escopo ───────────────────────────────────────────────────────────────
  if (proposta.itens.length > 0) {
    garantirEspaco(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    doc.text("O QUE ESTÁ INCLUÍDO", MARGIN, y);
    y += 7;

    for (const item of proposta.itens) {
      // Uma linha por item, sem grade: descrição à esquerda, valor à direita.
      const descricao = doc.splitTextToSize(item.descricao, CONTENT_W - 42) as string[];
      const detalhe = item.detalhe
        ? (doc.splitTextToSize(item.detalhe, CONTENT_W - 42) as string[])
        : [];
      const altura = descricao.length * 5 + detalhe.length * 4 + 6;
      garantirEspaco(altura);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...ESCURO);
      doc.text(descricao, MARGIN, y);

      doc.setFont("helvetica", "normal");
      doc.text(brl(item.valor), PAGE_W - MARGIN, y, { align: "right" });

      let alturaDescricao = descricao.length * 5;
      if (detalhe.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(...CINZA);
        doc.text(detalhe, MARGIN, y + alturaDescricao);
        alturaDescricao += detalhe.length * 4;
      }

      y += alturaDescricao + 4;
      doc.setDrawColor(235, 232, 228);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y - 1.5, PAGE_W - MARGIN, y - 1.5);
      y += 2;
    }
    y += 4;
  }

  // ── Investimento — a pergunta que ela abre o documento para responder ────
  garantirEspaco(22);
  doc.setFillColor(...identidade.cor);
  doc.roundedRect(MARGIN, y, CONTENT_W, 16, 2, 2, "F");
  doc.setTextColor(...identidade.textoSobreCor);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("INVESTIMENTO", MARGIN + 6, y + 6.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(brl(proposta.investimento), PAGE_W - MARGIN - 6, y + 10.5, { align: "right" });
  y += 24;

  // ── Condições e validade ─────────────────────────────────────────────────
  if (proposta.condicoesPagamento) {
    garantirEspaco(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    doc.text("CONDIÇÕES", MARGIN, y);
    y += 6;
    paragrafo(proposta.condicoesPagamento, 10, ESCURO);
    y += 2;
  }

  if (proposta.validadeAte) {
    garantirEspaco(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    doc.text(
      `Proposta válida até ${formatEventDayOnly(proposta.validadeAte)}.`,
      MARGIN,
      y,
    );
    y += 8;
  }

  if (proposta.observacoes) {
    garantirEspaco(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    doc.text("OBSERVAÇÕES", MARGIN, y);
    y += 6;
    paragrafo(proposta.observacoes, 9.5, CINZA);
  }

  // ── Rodapé: a empresa assina, o ALTAR só carimba discretamente ───────────
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text(identidade.nome, MARGIN, PAGE_H - 12);
    doc.text(`${i}/${totalPaginas}`, PAGE_W - MARGIN, PAGE_H - 12, { align: "right" });
    doc.setFontSize(6.5);
    doc.text(ASSINATURA_ALTAR, MARGIN, PAGE_H - 8);
  }

  const nomeLimpo = proposta.cliente
    .replace(/[^a-zA-Z0-9À-ɏ ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  entregarPdf(doc, `proposta-${nomeLimpo || "cliente"}.pdf`);
}
