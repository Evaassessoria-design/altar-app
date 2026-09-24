import jsPDF from "jspdf";
import { entregarPdf } from "./pdf-delivery.ts";
import { ASSINATURA_ALTAR, resolveIdentidade, type EmpresaLike, type RGB } from "./brand.ts";
import { formatEventDayOnly } from "./event-date.ts";
import { carregarImagemParaPdf, caixaProporcional } from "./imagem-para-pdf.ts";
import type { ApresentacaoDoProjeto } from "./apresentacao-do-projeto.ts";
import type { ConceitoDoEvento } from "./conceito-do-evento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PROJETO VISUAL — A APRESENTAÇÃO DO EVENTO
//
// ── O DOCUMENTO QUE FALTAVA ─────────────────────────────────────────────────
// O ALTAR gerava seis PDFs e NENHUM servia para mostrar o projeto à cliente. A
// Proposta é texto e números, sem uma imagem. O Orçamento se anuncia como
// interno em todas as páginas. O Caderno, a Ficha Técnica e a Folha de
// Carregamento são para a equipe e a produção.
//
// A melhor coisa que este produto sabe montar — o Projeto Visual, com capa,
// conceito, ambientes e fotos classificadas — só existia dentro da conta dela.
// Para mostrar aos noivos, ela virava a tela do notebook.
//
// ── ELE É UMA LEITURA, NÃO UMA SEGUNDA VERDADE ──────────────────────────────
// Nenhuma tabela nova, nenhum editor paralelo, nenhum moodboard separado. Este
// gerador recebe o MESMO `ProjetoVisual` que a tela desenha, já filtrado por
// `apresentacao-do-projeto.ts`. Mudar a quantidade de 120 para 130 na lista de
// itens faz o papel seguinte sair com 130, sem ninguém sincronizar nada.
//
// ── A FRONTEIRA ESTÁ NO TIPO, COMO NA PROPOSTA ──────────────────────────────
// `ApresentacaoDoProjeto` não tem custo, margem, preço de compra, fornecedor,
// observação operacional nem situação de montagem. Não há caminho por onde
// eles cheguem ao papel, porque não estão no objeto. É deliberadamente
// diferente do PDF do Orçamento, que recebe o resumo interno inteiro e por
// isso precisa se anunciar como interno em todas as páginas — aqui a proteção
// não depende de aviso nenhum.
//
// ── O QUE "PREMIUM" SIGNIFICA AQUI ──────────────────────────────────────────
// Espaço, hierarquia e uma cor só — a da empresa. Imagem grande quando ela é o
// assunto. Sem grade cinza, sem tabela com bordas, sem carimbo de sistema: um
// documento de apresentação não pode parecer um relatório administrativo.
//
// Sem logo e sem fotos ele continua de pé: a identidade é tipográfica e a
// imagem é reforço. Nenhuma imagem que falhe ao carregar derruba o documento.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const RODAPE = 18;

const ESCURO: RGB = [35, 32, 30];
const CINZA: RGB = [125, 120, 114];
const CLARO: RGB = [246, 243, 239];

export type ProjetoVisualPdfData = {
  evento: {
    name: string;
    date?: string;
    location?: string;
    clientName?: string;
    tipoLabel?: string;
  };
  apresentacao: ApresentacaoDoProjeto;
  conceito?: ConceitoDoEvento | null;
  /** URL da capa ESCOLHIDA por ela. Ausente = capa tipográfica. */
  capaUrl?: string | null;
  empresa?: EmpresaLike | null;
};

export async function generateProjetoVisualPDF({
  evento,
  apresentacao,
  conceito,
  capaUrl,
  empresa,
}: ProjetoVisualPdfData): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const identidade = resolveIdentidade(empresa);

  let y = 0;

  /**
   * Cabeçalho das páginas internas: uma faixa fina da cor da empresa e o nome
   * em tipografia. Um retângulo colorido de 28 mm no topo é linguagem de
   * relatório — aqui a cor entra como assinatura, não como moldura.
   */
  const cabecalho = () => {
    doc.setFillColor(...identidade.cor);
    doc.rect(0, 0, PAGE_W, 3, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    doc.text(identidade.nome, MARGIN, 13);
    doc.text(evento.name, PAGE_W - MARGIN, 13, { align: "right" });
    y = 26;
  };

  const novaPagina = () => {
    doc.addPage();
    cabecalho();
  };

  const garantirEspaco = (altura: number) => {
    if (y + altura > PAGE_H - RODAPE) novaPagina();
  };

  // ── CAPA ──────────────────────────────────────────────────────────────────
  // A foto escolhida por ela ocupa o terço superior inteiro, sangrando nas
  // laterais. Sem capa, o mesmo espaço vira um campo da cor da empresa — e o
  // documento continua elegante em vez de começar com um buraco.
  const capa = capaUrl ? await carregarImagemParaPdf(capaUrl, 1600, 0.8) : null;
  const ALTURA_CAPA = 132;

  if (capa) {
    // `cover`, não `contain`: a imagem preenche a faixa e o excesso é cortado
    // pelo clip. Deixar barra branca dos lados numa capa é o que faz um
    // documento parecer montado às pressas.
    const escala = Math.max(PAGE_W / capa.w, ALTURA_CAPA / capa.h);
    const w = capa.w * escala;
    const h = capa.h * escala;
    doc.addImage(capa.dataUrl, "JPEG", (PAGE_W - w) / 2, (ALTURA_CAPA - h) / 2, w, h);
    // Faixa clara por cima da emenda, para o texto abaixo não encostar na foto.
    doc.setFillColor(255, 255, 255);
    doc.rect(0, ALTURA_CAPA, PAGE_W, PAGE_H - ALTURA_CAPA, "F");
  } else {
    doc.setFillColor(...CLARO);
    doc.rect(0, 0, PAGE_W, ALTURA_CAPA, "F");
  }

  doc.setFillColor(...identidade.cor);
  doc.rect(0, ALTURA_CAPA, PAGE_W, 2, "F");

  y = ALTURA_CAPA + 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA);
  doc.text("PROJETO VISUAL", MARGIN, y);
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...ESCURO);
  // Nome longo quebra em duas linhas em vez de sair da página.
  const nome = doc.splitTextToSize(evento.name, CONTENT_W) as string[];
  doc.text(nome, MARGIN, y);
  y += nome.length * 10 + 4;

  const contexto = [
    evento.tipoLabel,
    evento.date ? formatEventDayOnly(evento.date) : null,
    evento.location,
  ].filter((v): v is string => !!v && !!v.trim());
  if (contexto.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...CINZA);
    doc.text(contexto.join("   ·   "), MARGIN, y);
    y += 8;
  }

  // Assinatura da empresa, no pé da capa.
  doc.setFontSize(9);
  doc.setTextColor(...CINZA);
  doc.text(identidade.nome, MARGIN, PAGE_H - 26);
  if (identidade.contato) {
    doc.setFontSize(8);
    doc.text(identidade.contato, MARGIN, PAGE_H - 21);
  }

  // ── CONCEITO ──────────────────────────────────────────────────────────────
  // O texto que ela já escreveu no Questionário. Não há campo novo e não há
  // segunda escrita: estilo, paleta e atmosfera vêm de `conceitoDoEvento`.
  if (conceito) {
    novaPagina();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...ESCURO);
    doc.text("O conceito", MARGIN, y);
    y += 12;

    const linhas: [string, string | undefined][] = [
      ["Estilo", conceito.estilo],
      ["Paleta", conceito.paleta],
    ];
    for (const [rotulo, valor] of linhas) {
      if (!valor) continue;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...CINZA);
      doc.text(rotulo.toUpperCase(), MARGIN, y);
      doc.setFontSize(12);
      doc.setTextColor(...ESCURO);
      const v = doc.splitTextToSize(valor, CONTENT_W) as string[];
      doc.text(v, MARGIN, y + 6);
      y += 6 + v.length * 5.5 + 8;
    }

    if (conceito.atmosfera) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...CINZA);
      doc.text("ATMOSFERA", MARGIN, y);
      y += 6;
      doc.setFontSize(11);
      doc.setTextColor(...ESCURO);
      const texto = doc.splitTextToSize(conceito.atmosfera, CONTENT_W) as string[];
      for (const linha of texto) {
        garantirEspaco(6);
        doc.text(linha, MARGIN, y);
        y += 5.6;
      }
      y += 6;
    }
  }

  // ── AMBIENTES ─────────────────────────────────────────────────────────────
  for (const ambiente of apresentacao.ambientes) {
    // Cada ambiente começa em página nova. É o que separa visualmente a
    // cerimônia da recepção — numa apresentação, a quebra é informação, e
    // juntar dois ambientes na mesma folha some com ela.
    novaPagina();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...ESCURO);
    doc.text(
      ambiente.emoji ? `${ambiente.emoji}  ${ambiente.titulo}` : ambiente.titulo,
      MARGIN,
      y,
    );
    y += 6;
    doc.setDrawColor(...identidade.cor);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + 22, y);
    y += 12;

    // As imagens do ambiente, grandes, em duas colunas.
    await desenharGrade(ambiente.imagens);

    // Os itens, como uma lista limpa — sem grade, sem bordas, sem zebra.
    for (const item of ambiente.itens) {
      const thumb = item.fotoUrl
        ? await carregarImagemParaPdf(item.fotoUrl, 700, 0.72)
        : null;
      const ALTURA = thumb ? 26 : 12;
      garantirEspaco(ALTURA + 4);

      let x = MARGIN;
      if (thumb) {
        const caixa = caixaProporcional(thumb, 22, 22);
        doc.addImage(thumb.dataUrl, "JPEG", x + caixa.dx, y + caixa.dy, caixa.w, caixa.h);
        x += 28;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...ESCURO);
      const titulo = item.quantidade ? `${item.quantidade}  ·  ${item.nome}` : item.nome;
      const tituloLinhas = doc.splitTextToSize(titulo, CONTENT_W - (x - MARGIN)) as string[];
      doc.text(tituloLinhas[0], x, y + (thumb ? 8 : 4));

      const abaixo: string[] = [];
      if (item.detalhe) abaixo.push(item.detalhe);
      // O aviso de referência é a distinção mais cara da decoração: a cliente
      // achar que a inspiração foi contratada. O papel diz, item a item.
      if (item.ehReferencia) abaixo.push("inspiração — não contratado");
      if (abaixo.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...CINZA);
        const sub = doc.splitTextToSize(
          abaixo.join("   ·   "),
          CONTENT_W - (x - MARGIN),
        ) as string[];
        doc.text(sub[0], x, y + (thumb ? 14 : 9.5));
      }

      y += ALTURA + 4;
    }
  }

  // ── INSPIRAÇÕES GERAIS ────────────────────────────────────────────────────
  if (apresentacao.inspiracoes.length > 0) {
    novaPagina();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...ESCURO);
    doc.text("Referências", MARGIN, y);
    y += 6;
    doc.setDrawColor(...identidade.cor);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + 22, y);
    y += 12;
    await desenharGrade(apresentacao.inspiracoes);
  }

  rodapeEmTodasAsPaginas();
  const arquivo = `projeto-visual-${slug(evento.name)}.pdf`;
  entregarPdf(doc, arquivo);

  /** Duas colunas de imagens grandes, proporção preservada. */
  async function desenharGrade(
    imagens: { url: string; legenda?: string; ehReferencia: boolean }[],
  ) {
    const COLUNAS = 2;
    const GAP = 6;
    const LARGURA = (CONTENT_W - GAP * (COLUNAS - 1)) / COLUNAS;
    const ALTURA = 58;

    for (let i = 0; i < imagens.length; i += COLUNAS) {
      const linha = imagens.slice(i, i + COLUNAS);
      const carregadas = await Promise.all(
        linha.map((img) => carregarImagemParaPdf(img.url, 1100, 0.75)),
      );
      // Linha em que NENHUMA imagem carregou não ocupa espaço em branco.
      if (carregadas.every((c) => c === null)) continue;

      const temLegenda = linha.some((l) => l.legenda || l.ehReferencia);
      garantirEspaco(ALTURA + (temLegenda ? 7 : 0) + GAP);

      linha.forEach((img, col) => {
        const carregada = carregadas[col];
        const x = MARGIN + col * (LARGURA + GAP);
        if (carregada) {
          const caixa = caixaProporcional(carregada, LARGURA, ALTURA);
          doc.addImage(
            carregada.dataUrl,
            "JPEG",
            x + caixa.dx,
            y + caixa.dy,
            caixa.w,
            caixa.h,
          );
        }
        const legenda = [img.legenda, img.ehReferencia ? "inspiração" : null]
          .filter((v): v is string => !!v)
          .join("  ·  ");
        if (carregada && legenda) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...CINZA);
          const t = doc.splitTextToSize(legenda, LARGURA) as string[];
          doc.text(t[0], x, y + ALTURA + 4.5);
        }
      });

      y += ALTURA + (temLegenda ? 7 : 0) + GAP;
    }
  }

  /**
   * Rodapé em todas as páginas MENOS a capa.
   *
   * A capa é a cara do documento; um número de página e uma assinatura de
   * sistema nela são exatamente o que faz um material de apresentação parecer
   * relatório.
   */
  function rodapeEmTodasAsPaginas() {
    const total = doc.getNumberOfPages();
    for (let p = 2; p <= total; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...CINZA);
      doc.text(identidade.nome, MARGIN, PAGE_H - 10);
      doc.text(`${p - 1}`, PAGE_W / 2, PAGE_H - 10, { align: "center" });
      doc.text(ASSINATURA_ALTAR, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
    }
  }
}

/** Nome de arquivo legível e sem surpresa em sistema de arquivos nenhum. */
function slug(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "evento"
  );
}
