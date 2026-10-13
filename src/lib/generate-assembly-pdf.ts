import jsPDF from "jspdf";
import { format } from "date-fns";
import { entregarPdf } from "./pdf-delivery.ts";
import { opcaoDaAudiencia } from "./audiencia-do-caderno.ts";
import { ASSINATURA_ALTAR, resolveIdentidade, type EmpresaLike, type IdentidadeDocumento, type RGB } from "./brand";
import { caixaProporcional, carregarImagemParaPdf, type ImagemDoPdf } from "./imagem-para-pdf.ts";
import type {
  CadernoMontado,
  FichaDeAmbiente,
  GrupoDoCaderno,
  ImagemDoCaderno,
  LinhaDoCaderno,
} from "./caderno/montar-caderno.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CADERNO DE MONTAGEM — O DESENHO
//
// Este arquivo NÃO decide o que entra. Ele recebe o `CadernoMontado` pronto
// (`caderno/montar-caderno.ts`), o mesmo objeto que a prévia mostra na tela,
// e desenha. Quem pergunta "isto pode ir para a equipe?" está lá; aqui só se
// pergunta "cabe nesta página?".
//
// ── O QUE O PAPEL NUNCA TEM ─────────────────────────────────────────────────
//  · botão de interface ("Adicionar foto", "+ Ficha"): o papel não clica. A
//    prévia é que mostra como completar fotos e planta;
//  · rótulo sem valor: seção vazia não aparece;
//  · caixa marcada: Carga/Montado/Retorno saem em branco, para a mão.
//
// ── A MARCA É DA EMPRESA ────────────────────────────────────────────────────
// Faixa, logo, nome e contato vêm de Configurações (`resolveIdentidade`). O
// texto sobre a faixa é escolhido pelo contraste real com a cor dela. O
// ALTAR assina só no rodapé.
//
// ── NADA CORTADO ENTRE PÁGINAS ──────────────────────────────────────────────
// Todo bloco mede a própria altura antes de desenhar e pula de página
// inteiro. A tabela de carga repete o cabeçalho na página seguinte.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 32;
/** Miniatura do item na ficha: tamanho fixo, para o papel não explodir em páginas. */
const THUMB_MM = 22;
const TOPO = HEADER_H + 12;
const RODAPE = PAGE_H - 16;

const DARK: RGB = [26, 21, 18];
const MUTED: RGB = [118, 108, 98];
const LINHA: RGB = [226, 214, 198];
const CARTAO: RGB = [246, 243, 238];
const CREME: RGB = [250, 244, 236];
const ALERTA: RGB = [251, 236, 233];
const ALERTA_BARRA: RGB = [196, 84, 70];

/** As imagens já carregadas, pela URL. `null` = não carregou: o bloco some. */
export type ImagensDoCaderno = ReadonlyMap<string, ImagemDoPdf | null>;

export type ContextoDoDesenho = {
  identidade: IdentidadeDocumento;
  /** Logo em data URL. Ausente = cabeçalho sem logo, igualmente completo. */
  logoDataUrl?: string | null;
  imagens: ImagensDoCaderno;
  geradoEm: Date;
};

/**
 * Só o que a fonte padrão do PDF sabe desenhar. Emoji e símbolo fora do
 * Latin-1 saíam como lixo ("Ø=ÜÐ") no meio do nome de um item.
 */
const FORA_DO_LATIN1_QUE_A_FONTE_TEM = new Set([..."–—‘’“”•…€"]);

function paraPdf(texto: string): string {
  return [...texto.normalize("NFC")]
    .filter((ch) => {
      const cp = ch.codePointAt(0)!;
      return (cp >= 0x20 && cp <= 0xff) || ch === "\n" || FORA_DO_LATIN1_QUE_A_FONTE_TEM.has(ch);
    })
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** "Caderno dos noivos" / "do cliente" / "da equipe" — para o rodapé. */
function nomeDoDocumento(c: CadernoMontado): string {
  if (c.versao === "equipe") return "Caderno da equipe";
  return c.selo === "Para os noivos" ? "Caderno dos noivos" : "Caderno do cliente";
}

/** Tom claro da cor da marca, para o selo e os fundos de destaque. */
function clarear(cor: RGB, quanto = 0.82): RGB {
  return cor.map((v) => Math.round(v + (255 - v) * quanto)) as RGB;
}

class Pagina {
  y = TOPO;
  constructor(
    readonly doc: jsPDF,
    readonly cor: RGB,
  ) {}

  /** Garante `altura` livre; senão, página nova. Devolve se pulou. */
  garantir(altura: number): boolean {
    if (this.y + altura <= RODAPE) return false;
    this.doc.addPage();
    this.y = TOPO;
    return true;
  }

  texto(t: string, x: number, y: number, opts?: Parameters<jsPDF["text"]>[3]) {
    this.doc.text(paraPdf(t), x, y, opts);
  }

  linhas(t: string, largura: number): string[] {
    return this.doc.splitTextToSize(paraPdf(t), largura) as string[];
  }

  fonte(estilo: "normal" | "bold" | "italic" | "bolditalic", tamanho: number, cor: RGB = DARK, familia = "helvetica") {
    this.doc.setFont(familia, estilo);
    this.doc.setFontSize(tamanho);
    this.doc.setTextColor(...cor);
  }

  /** "C O N C E I T O ————" — o título de seção da referência. */
  secao(titulo: string, alturaMinimaDoConteudo = 16) {
    this.garantir(10 + alturaMinimaDoConteudo);
    this.fonte("bold", 7.5, this.cor);
    this.doc.setCharSpace(0.9);
    const t = paraPdf(titulo.toUpperCase());
    this.doc.text(t, MARGIN, this.y + 3);
    const w = this.doc.getTextWidth(t) + t.length * 0.9;
    this.doc.setCharSpace(0);
    this.doc.setDrawColor(...LINHA);
    this.doc.setLineWidth(0.3);
    if (MARGIN + w + 4 < PAGE_W - MARGIN) this.doc.line(MARGIN + w + 4, this.y + 2, PAGE_W - MARGIN, this.y + 2);
    this.y += 8;
  }

  cartao(x: number, y: number, w: number, h: number, fundo: RGB = [255, 255, 255]) {
    this.doc.setFillColor(...fundo);
    this.doc.setDrawColor(...LINHA);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");
  }

  caixinha(x: number, y: number, tamanho = 3.6) {
    this.doc.setDrawColor(...this.cor);
    this.doc.setLineWidth(0.35);
    this.doc.roundedRect(x, y, tamanho, tamanho, 0.7, 0.7, "S");
  }

  /** ✓ desenhado: a fonte padrão não tem o glifo. */
  visto(x: number, y: number) {
    this.doc.setFillColor(...this.cor);
    this.doc.circle(x + 1.8, y + 1.8, 1.8, "F");
    this.doc.setDrawColor(255, 255, 255);
    this.doc.setLineWidth(0.45);
    this.doc.line(x + 0.9, y + 1.9, x + 1.6, y + 2.6);
    this.doc.line(x + 1.6, y + 2.6, x + 2.8, y + 1.1);
  }

  /** Campo para preencher à mão: rótulo pequeno sobre uma linha. */
  campo(rotulo: string, valor: string | undefined, x: number, w: number) {
    this.fonte("normal", 6.5, MUTED);
    this.doc.setCharSpace(0.4);
    this.texto(rotulo.toUpperCase(), x, this.y + 3);
    this.doc.setCharSpace(0);
    // Até duas linhas: "Recepção do espaço — (11) 9…" cortado no meio do
    // telefone é um contato que não serve.
    let fim = this.y + 10;
    if (valor) {
      this.fonte("bold", 8.5);
      const l = this.linhas(valor, w).slice(0, 2);
      this.doc.text(l, x, this.y + 8);
      fim = this.y + 6.5 + l.length * 3.8;
    }
    this.doc.setDrawColor(...MUTED);
    this.doc.setLineWidth(0.3);
    this.doc.line(x, fim, x + w, fim);
  }

  /** Linhas em branco para escrever — só onde há o que escrever. */
  pauta(quantas: number, x = MARGIN, w = CONTENT_W, passo = 7) {
    this.doc.setDrawColor(...LINHA);
    this.doc.setLineWidth(0.3);
    for (let i = 1; i <= quantas; i++) this.doc.line(x, this.y + i * passo, x + w, this.y + i * passo);
    this.y += quantas * passo + 3;
  }

  /** Chips (pílulas) com quebra de linha. */
  chips(nomes: readonly string[]) {
    this.fonte("normal", 8.5);
    let x = MARGIN;
    const h = 6.5;
    this.garantir(h + 2);
    for (const n of nomes) {
      const t = paraPdf(n);
      const w = this.doc.getTextWidth(t) + 7;
      if (x + w > PAGE_W - MARGIN) {
        x = MARGIN;
        this.y += h + 2.2;
        this.garantir(h + 2);
      }
      this.doc.setDrawColor(...LINHA);
      this.doc.setFillColor(255, 255, 255);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(x, this.y, w, h, h / 2, h / 2, "FD");
      this.fonte("normal", 8.5);
      this.doc.text(t, x + 3.5, this.y + 4.4);
      x += w + 2.2;
    }
    this.y += h + 5;
  }

  /** Bloco de destaque com barra lateral (creme) ou alerta (vermelho). */
  aviso(partes: { negrito?: string; texto: string }[], tipo: "nota" | "alerta" = "nota") {
    const larguraTexto = CONTENT_W - 12;
    // Cada pedaço é medido NA fonte em que é desenhado: medir em normal e
    // escrever em negrito empurrava a linha para fora do quadro.
    const linhas: { t: string; negrito: boolean }[] = [];
    for (const p of partes) {
      if (p.negrito) {
        this.fonte("bold", 8.5);
        for (const l of this.linhas(p.negrito, larguraTexto)) linhas.push({ t: l, negrito: true });
      }
      this.fonte("normal", 8.5);
      for (const l of this.linhas(p.texto, larguraTexto)) linhas.push({ t: l, negrito: false });
    }
    const h = linhas.length * 4.4 + 7;
    this.garantir(h + 3);
    this.doc.setFillColor(...(tipo === "alerta" ? ALERTA : CREME));
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, h, 2, 2, "F");
    this.doc.setFillColor(...(tipo === "alerta" ? ALERTA_BARRA : this.cor));
    this.doc.rect(MARGIN, this.y, 1.2, h, "F");
    let ly = this.y + 5.5;
    for (const l of linhas) {
      this.fonte(l.negrito ? "bold" : "normal", 8.5);
      this.doc.text(l.t, MARGIN + 6, ly);
      ly += 4.4;
    }
    this.y += h + 4;
  }

  imagem(img: ImagemDoPdf, x: number, y: number, w: number, h: number) {
    const caixa = caixaProporcional(img, w, h);
    try {
      this.doc.addImage(img.dataUrl, "JPEG", x + caixa.dx, y + caixa.dy, caixa.w, caixa.h, undefined, "FAST");
      return true;
    } catch {
      return false;
    }
  }
}

// ── Seções ───────────────────────────────────────────────────────────────────

function capa(p: Pagina, c: CadernoMontado) {
  p.fonte("bold", 24, DARK, "times");
  const titulo = p.linhas(c.titulo, CONTENT_W);
  p.garantir(titulo.length * 9 + 30);
  p.doc.text(titulo, MARGIN, p.y + 8);
  p.y += titulo.length * 9 + 3;
  p.fonte("normal", 9, MUTED);
  p.texto(c.subtitulo, MARGIN, p.y + 2);
  p.y += 8;

  if (c.resumo.length > 0) {
    const n = c.resumo.length;
    const gap = 4;
    const w = (CONTENT_W - gap * (n - 1)) / n;
    // O valor quebra em até duas linhas: "Espaço Jardim Aurora" cortado em
    // "Espaço Jardim" é outro lugar.
    const tamanho = n > 3 ? 9.5 : 11;
    p.fonte("bold", tamanho);
    const valores = c.resumo.map((r) => p.linhas(r.valor, w - 8).slice(0, 2));
    const h = 13 + Math.max(...valores.map((v) => v.length)) * (tamanho * 0.42);
    c.resumo.forEach((r, i) => {
      const x = MARGIN + i * (w + gap);
      p.cartao(x, p.y, w, h, CARTAO);
      p.fonte("bold", 6, p.cor);
      p.doc.setCharSpace(0.25);
      p.texto(p.linhas(r.rotulo.toUpperCase(), w - 6)[0] ?? "", x + 4, p.y + 5.5);
      p.doc.setCharSpace(0);
      p.fonte("bold", tamanho);
      p.doc.text(valores[i], x + 4, p.y + 11.5);
    });
    p.y += h + 6;
  }

  if (c.preencher.length > 0) {
    const gap = 6;
    const w = (CONTENT_W - gap * (c.preencher.length - 1)) / c.preencher.length;
    p.garantir(18);
    c.preencher.forEach((f, i) => p.campo(f.rotulo, f.valor, MARGIN + i * (w + gap), w));
    p.y += 19;
  }
}

function conceito(p: Pagina, c: CadernoMontado) {
  if (!c.conceito) return;
  if (c.versao === "equipe") return; // a equipe lê o estilo em "Estilo e atenção"
  p.secao("Conceito");
  if (c.conceito.destaque) {
    p.fonte("bolditalic", 13, DARK, "times");
    const l = p.linhas(c.conceito.destaque, CONTENT_W);
    p.garantir(l.length * 6);
    p.doc.text(l, MARGIN, p.y + 4);
    p.y += l.length * 6 + 1;
  }
  if (c.conceito.texto) {
    p.fonte("normal", 9, MUTED);
    const l = p.linhas(c.conceito.texto, CONTENT_W);
    p.garantir(l.length * 4.4);
    p.doc.text(l, MARGIN, p.y + 3);
    p.y += l.length * 4.4 + 2;
  }
  p.y += 3;
}

function ambientes(p: Pagina, c: CadernoMontado) {
  if (c.ambientes.length === 0) return;
  if (c.versao === "cliente") {
    p.secao("Ambientes que vamos decorar");
    p.chips(c.ambientes);
    return;
  }
  p.secao("Ambientes a montar");
  const col = CONTENT_W / 3;
  p.fonte("normal", 9);
  for (let i = 0; i < c.ambientes.length; i += 3) {
    p.garantir(7);
    for (let j = 0; j < 3 && i + j < c.ambientes.length; j++) {
      const x = MARGIN + j * col;
      p.caixinha(x, p.y);
      p.fonte("normal", 9);
      p.texto(p.linhas(c.ambientes[i + j], col - 8)[0] ?? "", x + 6, p.y + 3);
    }
    p.y += 6.5;
  }
  p.y += 3;
}

/** Altura de um cartão de grupo, para decidir a página antes de desenhar. */
function alturaDoGrupo(p: Pagina, g: GrupoDoCaderno, w: number): number {
  p.fonte("normal", 8.5);
  let h = 11 + (g.origem ? 3.5 : 0);
  for (const l of g.linhas) {
    h += Math.max(1, p.linhas(l.nome, w - 22).length) * 4.2 + (l.detalhe ? 3.6 : 0) + 1.6;
  }
  return h + 3;
}

function desenharGrupo(p: Pagina, g: GrupoDoCaderno, x: number, y: number, w: number, h: number) {
  p.cartao(x, y, w, h);
  p.fonte("bold", 9, p.cor);
  p.texto(p.linhas(g.titulo, w - 8)[0] ?? "", x + 4, y + 6.5);
  let ly = y + 11.5;
  if (g.origem) {
    p.fonte("italic", 6.5, MUTED);
    p.texto(g.origem, x + 4, y + 10);
    ly += 3.5;
  }
  g.linhas.forEach((l, i) => {
    p.fonte("normal", 8.5);
    const nome = p.linhas(l.nome, w - 22);
    p.doc.text(nome, x + 4, ly);
    if (l.quantidade) {
      p.fonte("bold", 8.5);
      p.texto(l.quantidade.match(/^\d+$/) ? `×${l.quantidade}` : l.quantidade, x + w - 4, ly, { align: "right" });
    }
    let fim = ly + (nome.length - 1) * 4.2;
    if (l.detalhe) {
      p.fonte("normal", 6.8, MUTED);
      p.texto(p.linhas(l.detalhe, w - 10)[0] ?? "", x + 4, fim + 3.4);
      fim += 3.6;
    }
    if (i < g.linhas.length - 1) {
      p.doc.setDrawColor(...LINHA);
      p.doc.setLineDashPattern([0.6, 0.6], 0);
      p.doc.line(x + 4, fim + 1.6, x + w - 4, fim + 1.6);
      p.doc.setLineDashPattern([], 0);
    }
    ly = fim + 5.8;
  });
}

/** "O que está incluso" — cartões em duas colunas, pares lado a lado. */
function incluido(p: Pagina, c: CadernoMontado) {
  if (c.versao === "equipe" || c.incluido.length === 0) return;
  p.secao("O que está incluso", 30);
  const gap = 5;
  const w = (CONTENT_W - gap) / 2;
  for (let i = 0; i < c.incluido.length; i += 2) {
    const par = c.incluido.slice(i, i + 2);
    const h = Math.max(...par.map((g) => alturaDoGrupo(p, g, w)));
    // Cartão maior que a página inteira: desenha sozinho, em largura total,
    // em vez de cortar — lista longa de um ambiente só.
    if (h > RODAPE - TOPO) {
      for (const g of par) grupoLongo(p, g);
      continue;
    }
    p.garantir(h + 4);
    par.forEach((g, j) => desenharGrupo(p, g, MARGIN + j * (w + gap), p.y, w, h));
    p.y += h + 4;
  }
  p.y += 2;
}

/** Um grupo que não cabe numa página: vira lista corrida, linha a linha. */
function grupoLongo(p: Pagina, g: GrupoDoCaderno) {
  p.garantir(12);
  p.fonte("bold", 9, p.cor);
  p.texto(g.titulo, MARGIN, p.y + 4);
  p.y += 7;
  for (const l of g.linhas) {
    p.fonte("normal", 8.5);
    const nome = p.linhas(l.nome, CONTENT_W - 30);
    p.garantir(nome.length * 4.2 + 2);
    p.doc.text(nome, MARGIN + 2, p.y + 3);
    if (l.quantidade) {
      p.fonte("bold", 8.5);
      p.texto(l.quantidade, PAGE_W - MARGIN, p.y + 3, { align: "right" });
    }
    p.y += nome.length * 4.2 + 1.5;
  }
  p.y += 4;
}

function atencao(p: Pagina, c: CadernoMontado) {
  if (c.versao !== "equipe") return;
  const nota: { negrito?: string; texto: string }[] = [];
  if (c.conceito?.destaque) nota.push({ texto: c.conceito.destaque });
  if (c.conceito?.texto) nota.push({ texto: c.conceito.texto });
  if (c.atencao.confirmar.length > 0) {
    nota.push({ negrito: "Confirmar com a responsável antes de montar:", texto: c.atencao.confirmar.join("; ") + "." });
  }
  const alerta: { negrito?: string; texto: string }[] = [];
  if (c.atencao.naoLevarSemConfirmar.length > 0) {
    alerta.push({
      negrito: "Não levar nem montar, a menos que confirmado:",
      texto: c.atencao.naoLevarSemConfirmar.join(", ") + ".",
    });
  }
  if (c.atencao.naoIncluso.length > 0) {
    alerta.push({ negrito: "Não estão inclusos:", texto: c.atencao.naoIncluso.join(", ") + "." });
  }
  if (nota.length === 0 && alerta.length === 0) return;
  p.secao("Estilo e atenção");
  if (nota.length > 0) p.aviso(nota, "nota");
  if (alerta.length > 0) p.aviso(alerta, "alerta");
}

function listaRotulada(p: Pagina, titulo: string, linhas: { rotulo: string; valor: string }[]) {
  if (linhas.length === 0) return;
  p.secao(titulo);
  for (const l of linhas) {
    p.fonte("normal", 8.5);
    const v = p.linhas(l.valor, CONTENT_W - 48);
    p.garantir(v.length * 4.2 + 3);
    p.fonte("bold", 7.5, MUTED);
    p.texto(l.rotulo, MARGIN, p.y + 3);
    p.fonte("normal", 8.5);
    p.doc.text(v, MARGIN + 46, p.y + 3);
    p.y += v.length * 4.2 + 2.5;
  }
  p.y += 3;
}

function equipeEscalada(p: Pagina, c: CadernoMontado) {
  if (c.equipeEscalada.length === 0) return;
  listaRotulada(
    p,
    "Equipe escalada",
    c.equipeEscalada.map((m) => ({
      rotulo: m.horario ? `Chega ${m.horario}` : "Horário a combinar",
      valor: [m.nome, m.funcao].filter(Boolean).join(" · "),
    })),
  );
}

function layout(p: Pagina, c: CadernoMontado, imagens: ImagensDoCaderno) {
  if (!c.layout) return;
  const img = imagens.get(c.layout.url);
  if (!img) return; // sem imagem carregada, sem seção: nada de quadro vazio
  const equipe = c.versao === "equipe";
  const w = equipe ? CONTENT_W * 0.56 : CONTENT_W;
  const h = Math.min(equipe ? 120 : 150, (w * img.h) / img.w);
  p.secao("Layout do espaço", h + 8);
  p.garantir(h + 8);
  const y0 = p.y;
  p.cartao(MARGIN, y0, w, h + 2, [255, 255, 255]);
  p.imagem(img, MARGIN + 1, y0 + 1, w - 2, h);
  p.fonte("normal", 7, MUTED);
  p.texto(c.layout.legenda, MARGIN, y0 + h + 6);
  if (equipe) {
    // Coluna da direita: orientação, pauta para os pontos de atenção e as
    // duas conferências que a equipe assina no local.
    const x = MARGIN + w + 6;
    const wr = CONTENT_W - w - 6;
    let ry = y0;
    p.fonte("normal", 8.5);
    const nota = p.linhas("Use a planta como guia de posição. Confira as medidas no local antes de montar.", wr - 8);
    const hn = nota.length * 4.4 + 7;
    p.doc.setFillColor(...CREME);
    p.doc.roundedRect(x, ry, wr, hn, 2, 2, "F");
    p.doc.setFillColor(...p.cor);
    p.doc.rect(x, ry, 1.2, hn, "F");
    p.doc.text(nota, x + 5, ry + 5.5);
    ry += hn + 6;
    p.fonte("bold", 7, p.cor);
    p.doc.setCharSpace(0.6);
    p.texto("PONTOS DE ATENÇÃO DA MONTAGEM", x, ry);
    p.doc.setCharSpace(0);
    p.doc.setDrawColor(...LINHA);
    p.doc.setLineWidth(0.3);
    for (let i = 1; i <= 6; i++) p.doc.line(x, ry + i * 7, x + wr, ry + i * 7);
    ry += 6 * 7 + 7;
    for (const t of ["Medidas conferidas no local", "Layout aprovado pela responsável"]) {
      p.caixinha(x, ry - 3);
      p.fonte("normal", 8.5);
      p.texto(t, x + 6, ry);
      ry += 6.5;
    }
  }
  p.y = y0 + h + 10;
}

function grade(
  p: Pagina,
  titulo: string | null,
  lista: readonly ImagemDoCaderno[],
  imagens: ImagensDoCaderno,
) {
  const prontas = lista
    .map((im) => ({ im, img: imagens.get(im.url) }))
    .filter((x): x is { im: ImagemDoCaderno; img: ImagemDoPdf } => !!x.img);
  if (prontas.length === 0) return;
  const gap = 4;
  const w = (CONTENT_W - gap * 2) / 3;
  const h = 40;
  if (titulo) p.secao(titulo, h + 10);
  else p.garantir(h + 10);
  for (let i = 0; i < prontas.length; i += 3) {
    const linha = prontas.slice(i, i + 3);
    const temLegenda = linha.some((x) => x.im.legenda || x.im.ehReferencia);
    p.garantir(h + (temLegenda ? 9 : 4));
    linha.forEach(({ im, img }, j) => {
      const x = MARGIN + j * (w + gap);
      p.cartao(x, p.y, w, h, CARTAO);
      p.imagem(img, x + 0.5, p.y + 0.5, w - 1, h - 1);
      const rotulo = [im.legenda, im.ehReferencia ? "referência visual" : undefined].filter(Boolean).join(" · ");
      if (rotulo) {
        p.fonte("normal", 6.8, MUTED);
        p.texto(p.linhas(rotulo, w)[0] ?? "", x, p.y + h + 3.6);
      }
    });
    p.y += h + (temLegenda ? 9 : 5);
  }
  p.y += 2;
}

function ficha(p: Pagina, f: FichaDeAmbiente, c: CadernoMontado, imagens: ImagensDoCaderno) {
  const equipe = c.versao === "equipe";
  p.secao(`Ficha do ambiente · ${f.titulo}`, 30);
  grade(p, null, f.imagens, imagens);

  if (f.itens.length > 0) {
    p.fonte("bold", 7, p.cor);
    p.garantir(10);
    p.doc.setCharSpace(0.6);
    p.texto(equipe ? "O QUE ESTÁ CONTEMPLADO" : "O QUE ESTÁ CONTEMPLANDO", MARGIN, p.y + 3);
    p.doc.setCharSpace(0);
    p.y += 6;
    for (const it of f.itens) {
      const extras = [
        it.detalhe,
        !it.fotoUrl && it.ehReferencia ? "referência visual" : undefined,
        equipe && it.fornecedor ? `Fornecedor: ${it.fornecedor}` : undefined,
        equipe && it.observacao ? `Obs.: ${it.observacao}` : undefined,
      ].filter((e): e is string => !!e);
      // ── A FOTO DO ITEM, COM O NOME DO QUE ELA É ─────────────────────────
      // A precedência (contratado antes da referência) é de `fotoDoItem`, a
      // mesma do Projeto Visual. Aqui o papel só DIZ qual das duas saiu: uma
      // inspiração lida como aprovada faz a equipe montar o que não foi
      // contratado.
      const thumb = it.fotoUrl ? imagens.get(it.fotoUrl) : null;
      p.fonte("normal", 7);
      const extraLinhas = extras.flatMap((e) => p.linhas(e, CONTENT_W - (thumb ? THUMB_MM + 12 : 10)));
      const hTexto = 5 + extraLinhas.length * 3.4;
      // +3.4 do rótulo embaixo da miniatura: sem isso ele invadia o item seguinte.
      const h = Math.max(hTexto, thumb ? THUMB_MM * 0.8 + 3.4 : 0) + 3;
      p.garantir(h);
      let tx = MARGIN;
      if (thumb) {
        p.imagem(thumb, MARGIN, p.y, THUMB_MM, THUMB_MM * 0.8);
        p.fonte("bold", 5.5, it.ehReferencia ? MUTED : p.cor);
        p.texto(it.ehReferencia ? "REFERÊNCIA VISUAL" : "CONTRATADO", MARGIN, p.y + THUMB_MM * 0.8 + 2.6);
        tx = MARGIN + THUMB_MM + 3;
      }
      if (equipe && it.conferir) p.caixinha(tx, p.y);
      else p.visto(tx, p.y);
      p.fonte("normal", 9);
      p.texto(p.linhas(it.nome, CONTENT_W - (tx - MARGIN) - 8)[0] ?? "", tx + 6, p.y + 3);
      p.fonte("normal", 7, MUTED);
      p.doc.text(extraLinhas, tx + 6, p.y + 6.6);
      p.y += h;
    }
    p.y += 1;
  }
  if (equipe && f.opcionais.length > 0) {
    p.aviso([{ negrito: "Só montar se confirmado:", texto: f.opcionais.join(", ") + "." }], "alerta");
  }
  if (equipe && f.naoLevar.length > 0) {
    p.aviso([{ negrito: "Não levar (não incluso):", texto: f.naoLevar.join(", ") + "." }], "alerta");
  }
  p.y += 3;
}

function decisoes(p: Pagina, c: CadernoMontado) {
  if (c.versao !== "cliente" || c.pendencias.length === 0) return;
  p.fonte("normal", 9);
  const linhas = c.pendencias.map((t) => p.linhas(t, CONTENT_W - 18));
  const h = linhas.reduce((s, l) => s + l.length * 4.4 + 2.4, 0) + 8;
  p.secao("Decisões que faltam", h);
  p.garantir(h);
  p.cartao(MARGIN, p.y, CONTENT_W, h);
  let ly = p.y + 5;
  for (const l of linhas) {
    p.caixinha(MARGIN + 5, ly - 0.2);
    p.fonte("normal", 9);
    p.doc.text(l, MARGIN + 11, ly + 2.8);
    ly += l.length * 4.4 + 2.4;
  }
  p.y += h + 5;
}

function opcionais(p: Pagina, c: CadernoMontado) {
  if (c.versao !== "cliente" || c.opcionais.length === 0) return;
  const h = c.opcionais.length * 7 + 5;
  p.secao("Opcionais", h + 8);
  p.garantir(h + 8);
  p.cartao(MARGIN, p.y, CONTENT_W, h);
  let ly = p.y + 6.5;
  c.opcionais.forEach((o, i) => {
    p.fonte("normal", 9);
    p.texto(p.linhas(o.ambiente ? `${o.nome} · ${o.ambiente}` : o.nome, CONTENT_W - 50)[0] ?? "", MARGIN + 5, ly);
    if (o.valor) {
      p.fonte("bold", 9, p.cor);
      p.texto(o.valor, PAGE_W - MARGIN - 5, ly, { align: "right" });
    }
    if (i < c.opcionais.length - 1) {
      p.doc.setDrawColor(...LINHA);
      p.doc.setLineDashPattern([0.6, 0.6], 0);
      p.doc.line(MARGIN + 5, ly + 2.6, PAGE_W - MARGIN - 5, ly + 2.6);
      p.doc.setLineDashPattern([], 0);
    }
    ly += 7;
  });
  p.y += h + 2;
  p.fonte("normal", 7.5, MUTED);
  p.texto("Opcionais ainda não contratados. Só entram no projeto com a confirmação de vocês.", MARGIN, p.y + 2);
  p.y += 8;
}

// ── Equipe: a tabela de carga ────────────────────────────────────────────────

const COLUNAS = { qtd: PAGE_W - MARGIN - 70, carga: PAGE_W - MARGIN - 50, montado: PAGE_W - MARGIN - 30, retorno: PAGE_W - MARGIN - 10 };

function cabecalhoDaTabela(p: Pagina, colunas: [string, number][]) {
  p.fonte("bold", 6.5, p.cor);
  p.doc.setCharSpace(0.5);
  p.texto("ITEM", MARGIN + 2, p.y + 3);
  for (const [t, x] of colunas) p.texto(t, x, p.y + 3, { align: "center" });
  p.doc.setCharSpace(0);
  p.doc.setDrawColor(...p.cor);
  p.doc.setLineWidth(0.4);
  p.doc.line(MARGIN, p.y + 5, PAGE_W - MARGIN, p.y + 5);
  p.y += 7;
}

function tabelaDeCarga(p: Pagina, c: CadernoMontado) {
  if (c.versao !== "equipe" || c.carga.length === 0) return;
  const colunas: [string, number][] = [
    ["QTD.", COLUNAS.qtd],
    ["CARGA", COLUNAS.carga],
    ["MONTADO", COLUNAS.montado],
    ["RETORNO", COLUNAS.retorno],
  ];
  p.secao("Checklist de carga, montagem e retorno", 30);
  cabecalhoDaTabela(p, colunas);
  const linha = (l: LinhaDoCaderno) => {
    p.fonte("normal", 8.5);
    const nome = p.linhas(l.nome, COLUNAS.qtd - MARGIN - 14);
    const det = l.detalhe ? p.linhas(l.detalhe, COLUNAS.qtd - MARGIN - 14).slice(0, 1) : [];
    const h = nome.length * 4 + det.length * 3.2 + 3;
    if (p.garantir(h)) cabecalhoDaTabela(p, colunas);
    p.fonte("normal", 8.5);
    p.doc.text(nome, MARGIN + 2, p.y + 3.2);
    if (det.length) {
      p.fonte("normal", 6.5, MUTED);
      p.doc.text(det, MARGIN + 2, p.y + 3.2 + nome.length * 4 - 0.6);
    }
    p.fonte("bold", 8.5);
    p.texto(l.quantidade ?? "—", COLUNAS.qtd, p.y + 3.2, { align: "center" });
    for (const x of [COLUNAS.carga, COLUNAS.montado, COLUNAS.retorno]) p.caixinha(x - 1.8, p.y + 0.4);
    p.doc.setDrawColor(...LINHA);
    p.doc.setLineWidth(0.2);
    p.doc.line(MARGIN, p.y + h - 0.5, PAGE_W - MARGIN, p.y + h - 0.5);
    p.y += h;
  };
  for (const g of c.carga) {
    if (p.garantir(14)) cabecalhoDaTabela(p, colunas);
    p.doc.setFillColor(...CARTAO);
    p.doc.rect(MARGIN, p.y, CONTENT_W, 6, "F");
    p.fonte("bold", 8, p.cor);
    p.texto(g.origem ? `${g.titulo} (${g.origem})` : g.titulo, MARGIN + 2, p.y + 4.2);
    p.y += 7;
    g.linhas.forEach(linha);
  }
  // Se algum item ficou de fora por ser só referência, o papel DIZ — senão a
  // equipe acha que o dado sumiu e vai procurar no lugar errado.
  if (c.foraDaMontagem > 0) {
    p.garantir(8);
    p.fonte("italic", 7, MUTED);
    p.texto(
      c.foraDaMontagem === 1
        ? "1 item não entra na montagem por ser só referência visual."
        : `${c.foraDaMontagem} itens não entram na montagem por serem só referência visual.`,
      MARGIN,
      p.y + 3,
    );
    p.y += 6;
  }
  p.y += 5;
}

function pecasDoAcervo(p: Pagina, c: CadernoMontado) {
  if (c.versao !== "equipe" || c.pecasDoAcervo.length === 0) return;
  const colunas: [string, number][] = [
    ["RESERVADO", COLUNAS.qtd],
    ["SAIU", COLUNAS.carga],
    ["VOLTOU", COLUNAS.montado],
    ["CONFERIDO", COLUNAS.retorno],
  ];
  p.secao("Peças do acervo", 24);
  cabecalhoDaTabela(p, colunas);
  for (const peca of c.pecasDoAcervo) {
    if (p.garantir(7)) cabecalhoDaTabela(p, colunas);
    p.fonte("normal", 8.5);
    p.texto(p.linhas(peca.nome, COLUNAS.qtd - MARGIN - 16)[0] ?? "", MARGIN + 2, p.y + 3.2);
    p.fonte("bold", 8.5);
    p.texto(peca.reservado, COLUNAS.qtd, p.y + 3.2, { align: "center" });
    // Saiu/voltou: o que JÁ está registrado no ALTAR; vazio = linha para a mão.
    p.fonte("normal", 8.5);
    if (peca.saiu !== undefined) p.texto(String(peca.saiu), COLUNAS.carga, p.y + 3.2, { align: "center" });
    else p.doc.line(COLUNAS.carga - 5, p.y + 4, COLUNAS.carga + 5, p.y + 4);
    if (peca.voltou !== undefined) p.texto(String(peca.voltou), COLUNAS.montado, p.y + 3.2, { align: "center" });
    else p.doc.line(COLUNAS.montado - 5, p.y + 4, COLUNAS.montado + 5, p.y + 4);
    p.caixinha(COLUNAS.retorno - 1.8, p.y + 0.4);
    p.doc.setDrawColor(...LINHA);
    p.doc.line(MARGIN, p.y + 6.5, PAGE_W - MARGIN, p.y + 6.5);
    p.y += 7;
  }
  p.y += 5;
}

function checklistDoEvento(p: Pagina, c: CadernoMontado) {
  if (c.versao !== "equipe" || c.checklist.length === 0) return;
  p.secao("Checklist de montagem do evento", 14);
  for (const item of c.checklist) {
    p.garantir(7);
    p.caixinha(MARGIN + 1, p.y);
    p.fonte("normal", 9);
    const qtd = item.quantidade ? `${item.quantidade} · ` : "";
    p.texto(p.linhas(`${qtd}${item.nome}`, CONTENT_W - 50)[0] ?? "", MARGIN + 7, p.y + 3);
    if (item.detalhe) {
      p.fonte("normal", 7, MUTED);
      p.texto(item.detalhe, PAGE_W - MARGIN, p.y + 3, { align: "right" });
    }
    p.y += 6.5;
  }
  p.y += 4;
}

function fechamentoDaEquipe(p: Pagina, c: CadernoMontado) {
  if (c.versao !== "equipe") return;
  p.secao("Ocorrências e observações", 40);
  for (const o of c.ocorrencias) {
    p.fonte("normal", 8.5);
    const l = p.linhas(`• ${o}`, CONTENT_W);
    p.garantir(l.length * 4.2 + 1);
    p.doc.text(l, MARGIN, p.y + 3);
    p.y += l.length * 4.2 + 1;
  }
  p.garantir(34);
  p.pauta(2);
  p.y += 4;
  const gap = 6;
  const w = (CONTENT_W - gap * 2) / 3;
  ["Conferido por", "Data / horário", "Assinatura"].forEach((r, i) => p.campo(r, undefined, MARGIN + i * (w + gap), w));
  p.y += 14;
}

// ── Cabeçalho e rodapé em todas as páginas ──────────────────────────────────

function molduras(doc: jsPDF, c: CadernoMontado, ctx: ContextoDoDesenho) {
  const { identidade } = ctx;
  const total = doc.getNumberOfPages();
  const documento = nomeDoDocumento(c);
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    // ── Cabeçalho ───────────────────────────────────────────────────────
    doc.setFillColor(...identidade.cor);
    doc.rect(0, 0, PAGE_W, HEADER_H, "F");
    let x = MARGIN;
    if (ctx.logoDataUrl) {
      try {
        doc.addImage(ctx.logoDataUrl, MARGIN, 7, 18, 18, undefined, "FAST");
        x = MARGIN + 23;
      } catch {
        x = MARGIN; // logo ilegível não impede o documento
      }
    }
    doc.setTextColor(...identidade.textoSobreCor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setCharSpace(1.2);
    doc.text("CADERNO DE MONTAGEM", x, 11);
    doc.setCharSpace(0);
    doc.setFontSize(12);
    doc.text(paraPdf(identidade.nome), x, 17.5);
    if (identidade.contato) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text((doc.splitTextToSize(paraPdf(identidade.contato), PAGE_W - MARGIN - x - 42) as string[])[0] ?? "", x, 23);
    }
    // Selo: "PARA OS NOIVOS" / "PARA O CLIENTE" / "PARA A EQUIPE".
    const selo = paraPdf(c.selo.toUpperCase());
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const ws = doc.getTextWidth(selo) + 9;
    doc.setFillColor(...clarear(identidade.cor, c.versao === "equipe" ? 0.88 : 0.78));
    doc.roundedRect(PAGE_W - MARGIN - ws, 8, ws, 6.5, 3.2, 3.2, "F");
    doc.setTextColor(...DARK);
    doc.text(selo, PAGE_W - MARGIN - ws / 2, 12.4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...identidade.textoSobreCor);
    doc.text(format(ctx.geradoEm, "dd/MM/yyyy"), PAGE_W - MARGIN, 21, { align: "right" });

    // ── Rodapé ──────────────────────────────────────────────────────────
    doc.setDrawColor(...LINHA);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, PAGE_H - 11, PAGE_W - MARGIN, PAGE_H - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...MUTED);
    doc.text(paraPdf(`${identidade.nome} · ${c.titulo}`).slice(0, 70), MARGIN, PAGE_H - 6.5);
    doc.text(`${documento} · Página ${i} de ${total}`, PAGE_W / 2, PAGE_H - 6.5, { align: "center" });
    // Assinatura discreta: o documento é da empresa, não do ALTAR.
    doc.text(ASSINATURA_ALTAR, PAGE_W - MARGIN, PAGE_H - 6.5, { align: "right" });
  }
}

/**
 * Desenha o caderno. Puro: não baixa nada e não entrega nada — devolve o
 * documento. É o que os testes geram em Node, e o que a tela entrega.
 */
export function desenharCaderno(c: CadernoMontado, ctx: ContextoDoDesenho): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const p = new Pagina(doc, ctx.identidade.cor);

  capa(p, c);
  conceito(p, c);
  ambientes(p, c);
  atencao(p, c);
  incluido(p, c);
  listaRotulada(p, "Informações do local", c.informacoesDoLocal);
  equipeEscalada(p, c);
  layout(p, c, ctx.imagens);
  grade(p, "Referências de decoração", c.referencias, ctx.imagens);
  for (const f of c.fichas) ficha(p, f, c, ctx.imagens);
  decisoes(p, c);
  opcionais(p, c);
  tabelaDeCarga(p, c);
  pecasDoAcervo(p, c);
  checklistDoEvento(p, c);
  fechamentoDaEquipe(p, c);

  molduras(doc, c, ctx);
  return doc;
}

/** Todas as URLs de imagem que o caderno vai desenhar, sem repetir. */
export function urlsDoCaderno(c: CadernoMontado): string[] {
  const urls = new Set<string>();
  if (c.layout) urls.add(c.layout.url);
  for (const r of c.referencias) urls.add(r.url);
  for (const f of c.fichas) {
    for (const im of f.imagens) urls.add(im.url);
    for (const it of f.itens) if (it.fotoUrl) urls.add(it.fotoUrl);
  }
  return [...urls];
}

/**
 * Baixa e reduz as imagens. Cada arquivo uma vez, mesmo que apareça em dois
 * lugares — a foto não é copiada, só referenciada. Imagem que falha vira
 * `null`, e o bloco dela some sem derrubar o documento.
 */
export async function carregarImagensDoCaderno(c: CadernoMontado): Promise<ImagensDoCaderno> {
  const mapa = new Map<string, ImagemDoPdf | null>();
  await Promise.all(
    urlsDoCaderno(c).map(async (url) => {
      // Planta e referências merecem mais pixels que a miniatura de item.
      const maxPx = url === c.layout?.url ? 1600 : 1000;
      mapa.set(url, await carregarImagemParaPdf(url, maxPx));
    }),
  );
  return mapa;
}

export type AssemblyReportData = {
  caderno: CadernoMontado;
  /** Identidade da EMPRESA (Configurações). Ausente = padrão do ALTAR. */
  empresa?: EmpresaLike | null;
  logoDataUrl?: string | null;
};

export async function generateAssemblyPDF(data: AssemblyReportData): Promise<void> {
  const { caderno } = data;
  const doc = desenharCaderno(caderno, {
    identidade: resolveIdentidade(data.empresa),
    logoDataUrl: data.logoDataUrl,
    imagens: await carregarImagensDoCaderno(caderno),
    geradoEm: new Date(),
  });
  const safeName = caderno.titulo.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  // O sufixo da versão entra no nome: sem ele, gerar o do cliente sobrescreveria
  // o da equipe na pasta de downloads, e ninguém perceberia até imprimir.
  entregarPdf(doc, `caderno-montagem-${safeName}-${opcaoDaAudiencia(caderno.versao).sufixo}.pdf`);
}
