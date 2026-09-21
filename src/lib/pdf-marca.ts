import type jsPDF from "jspdf";
import { ASSINATURA_ALTAR, type IdentidadeDocumento } from "./brand.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CABEÇALHO E RODAPÉ — A PARTE QUE TODO DOCUMENTO TEM IGUAL
//
// ── O DEFEITO QUE ISTO EXISTE PARA FECHAR ───────────────────────────────────
// Seis documentos, duas famílias. Quatro — ficha técnica, caderno de montagem,
// folha de carregamento e proposta — respeitavam a regra que `brand.ts`
// declara no próprio cabeçalho:
//
//     "O protagonismo é da empresa; o ALTAR assina discretamente no rodapé."
//
// Os outros dois faziam o contrário. O Relatório do evento abria com uma faixa
// de 28mm escrita **"ALTAR — Plataforma para Decoradores de Eventos"**, em
// negrito de 18pt, e não mostrava o nome do estúdio em lugar nenhum. O
// Orçamento aceitava um `studioName` solto — e a tela mandava o nome da PESSOA
// (`currentUser.name`), não o do estúdio, então uma empresa chamada "Aurora
// Decorações" imprimia "Eva" no topo do documento de custo.
//
// Eram justamente os dois documentos INTERNOS: os únicos que só ela vê eram os
// únicos que anunciavam o fornecedor do software em vez da marca dela.
//
// ── POR QUE SÓ CABEÇALHO E RODAPÉ ───────────────────────────────────────────
// Porque é o que os seis têm em comum de verdade. O miolo de cada um é
// diferente por necessidade — uma folha de carregamento não se parece com uma
// proposta, e não deve. Abstrair o miolo seria construir um framework de
// documento para resolver um problema de identidade.
//
// Esta é a menor peça que faz os seis parecerem da mesma marca.
//
// ── A AUDIÊNCIA É DESENHADA, NÃO ESCRITA NUM CANTO ──────────────────────────
// `interno` ganha faixa de aviso no topo e repetição em toda página, porque
// quem imprime e separa folha não vê a capa — e porque mandar o Orçamento para
// a cliente é o erro caro do produto. `cliente` e `equipe` não levam selo: um
// documento de venda com carimbo de sistema deixa de parecer dela.
// ─────────────────────────────────────────────────────────────────────────────

export type AudienciaDoDocumento = "cliente" | "equipe" | "interno";

const A4_LARGURA = 210;
const A4_ALTURA = 297;

/** O aviso que só o documento interno carrega. */
export const AVISO_USO_INTERNO = "USO INTERNO — não enviar ao cliente";

type Cabecalho = {
  doc: jsPDF;
  identidade: IdentidadeDocumento;
  /** O que o documento é: "ORÇAMENTO", "FICHA TÉCNICA", "RELATÓRIO DO EVENTO". */
  titulo: string;
  audiencia: AudienciaDoDocumento;
  margem?: number;
};

/**
 * A faixa do topo. Devolve o `y` onde o conteúdo pode começar.
 *
 * A empresa vem primeiro e em destaque; o tipo de documento vem abaixo, menor.
 * É a ordem que faz o papel parecer dela — e é a ordem que os quatro
 * documentos certos já usavam.
 */
export function cabecalhoDaEmpresa({
  doc,
  identidade,
  titulo,
  audiencia,
  margem = 15,
}: Cabecalho): number {
  const altura = 26;
  doc.setFillColor(...identidade.cor);
  doc.rect(0, 0, A4_LARGURA, altura, "F");

  doc.setTextColor(...identidade.textoSobreCor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(identidade.nome, margem, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const linha = audiencia === "interno" ? `${titulo}  ·  ${AVISO_USO_INTERNO}` : titulo;
  doc.text(linha, margem, 18.5);

  if (identidade.contato) {
    doc.setFontSize(7.5);
    doc.text(identidade.contato, A4_LARGURA - margem, 18.5, { align: "right" });
  }

  doc.setTextColor(30, 30, 30);
  return altura + 8;
}

type Rodape = {
  doc: jsPDF;
  identidade: IdentidadeDocumento;
  audiencia: AudienciaDoDocumento;
  /** Identificação do evento, para a folha solta saber de onde veio. */
  referencia?: string;
  margem?: number;
};

/**
 * O rodapé, em TODAS as páginas. Chame por último: ele conta as páginas.
 *
 * A identificação repetida não é enfeite — é o que permite reconhecer uma
 * folha que caiu no chão do galpão, e é o que impede o Orçamento de circular
 * sem dizer que é interno.
 */
export function rodapeEmTodasAsPaginas({
  doc,
  identidade,
  audiencia,
  referencia,
  margem = 15,
}: Rodape): void {
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);

    const esquerda = [identidade.nome, referencia].filter(Boolean).join("  ·  ");
    doc.setTextColor(150, 150, 150);
    doc.text(esquerda, margem, A4_ALTURA - 12);
    doc.text(`${p}/${paginas}`, A4_LARGURA - margem, A4_ALTURA - 12, { align: "right" });

    if (audiencia === "interno") {
      // Vermelho discreto: legível sem transformar a folha em alerta.
      doc.setTextColor(170, 60, 60);
      doc.text(AVISO_USO_INTERNO, margem, A4_ALTURA - 8);
      doc.setTextColor(150, 150, 150);
    }

    doc.setFontSize(6.5);
    doc.text(ASSINATURA_ALTAR, A4_LARGURA - margem, A4_ALTURA - 8, { align: "right" });
  }
}
