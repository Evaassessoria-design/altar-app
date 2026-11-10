import type {
  CategoriaDeElemento,
  DadosDoLayout,
  ElementoDoLayout,
  FormaDeElemento,
} from "./layoutSalao";

// ─────────────────────────────────────────────────────────────────────────────
// BIBLIOTECA DE PEÇAS E MODELOS DO LAYOUT
//
// ── POR QUE NO CÓDIGO, E NÃO NUMA TABELA ────────────────────────────────────
// As medidas abaixo são o ponto de PARTIDA, iguais para todo mundo: um sofá de
// três lugares tem ~2,10 m em qualquer locadora. A decoradora muda a medida no
// próprio elemento depois de colocá-lo. Uma tabela de "móveis padrão" seria
// uma segunda verdade para editar, e o que é DELA (o que ela tem no galpão)
// já mora no Acervo.
//
// Os modelos seguem a mesma regra: são funções que DEVOLVEM um layout novo.
// Nada fica ligado ao modelo depois — mudar o modelo amanhã não mexe no salão
// que alguém já montou hoje.
// ─────────────────────────────────────────────────────────────────────────────

export type PecaDaBiblioteca = {
  chave: string;
  nome: string;
  grupo: "Estrutura" | "Serviço" | "Mesas" | "Lounge" | "Cerimônia" | "Apoio";
  categoria: CategoriaDeElemento;
  forma: FormaDeElemento;
  largura: number;
  profundidade: number;
  altura?: number;
  cadeirasPorLado?: number;
  /** O que aparece escrito na planta. AUSENTE = o nome em maiúsculas. */
  rotulo?: string;
};

export const PECAS: readonly PecaDaBiblioteca[] = [
  { chave: "palco", nome: "Palco", grupo: "Estrutura", categoria: "palco", forma: "retangulo", largura: 8, profundidade: 4, altura: 0.6 },
  { chave: "pista", nome: "Pista de dança", rotulo: "PISTA", grupo: "Estrutura", categoria: "pista", forma: "retangulo", largura: 7, profundidade: 6, altura: 0.04 },
  { chave: "cabine-dj", nome: "Cabine de DJ", rotulo: "DJ", grupo: "Estrutura", categoria: "apoio", forma: "retangulo", largura: 2, profundidade: 1, altura: 1.1 },
  { chave: "painel", nome: "Painel / backdrop", rotulo: "PAINEL", grupo: "Estrutura", categoria: "movel", forma: "retangulo", largura: 3, profundidade: 0.3, altura: 2.5 },
  { chave: "bar-oval", nome: "Bar oval (ilha)", rotulo: "BAR", grupo: "Serviço", categoria: "bar", forma: "oval", largura: 5, profundidade: 3, altura: 1.1 },
  { chave: "bar-reto", nome: "Bar reto", rotulo: "BAR", grupo: "Serviço", categoria: "bar", forma: "retangulo", largura: 3, profundidade: 0.8, altura: 1.1 },
  { chave: "buffet", nome: "Aparador de buffet", rotulo: "BUFFET", grupo: "Serviço", categoria: "buffet", forma: "retangulo", largura: 2.5, profundidade: 0.9, altura: 0.9 },
  { chave: "ilha-gastronomica", nome: "Ilha gastronômica", rotulo: "ILHA GASTRONÔMICA", grupo: "Serviço", categoria: "buffet", forma: "retangulo", largura: 1.5, profundidade: 1.5, altura: 0.9 },
  { chave: "mesa-bolo", nome: "Mesa do bolo", grupo: "Serviço", categoria: "bolo", forma: "retangulo", largura: 2.5, profundidade: 1, altura: 0.9 },
  { chave: "mesa-doces", nome: "Mesa de doces", grupo: "Serviço", categoria: "doces", forma: "retangulo", largura: 3, profundidade: 0.8, altura: 0.9 },
  { chave: "mesa-principal", nome: "Mesa principal / imperial", rotulo: "PRINCIPAL", grupo: "Mesas", categoria: "principal", forma: "retangulo", largura: 4.8, profundidade: 1.2, altura: 0.76, cadeirasPorLado: 8 },
  { chave: "mesa-bistro", nome: "Mesa bistrô", rotulo: "BISTRÔ", grupo: "Mesas", categoria: "movel", forma: "redondo", largura: 0.6, profundidade: 0.6, altura: 1.1 },
  { chave: "lounge", nome: "Lounge completo", rotulo: "LOUNGE", grupo: "Lounge", categoria: "lounge", forma: "retangulo", largura: 4.5, profundidade: 3.5 },
  { chave: "sofa", nome: "Sofá 3 lugares", rotulo: "SOFÁ", grupo: "Lounge", categoria: "movel", forma: "retangulo", largura: 2.1, profundidade: 0.9, altura: 0.85 },
  { chave: "poltrona", nome: "Poltrona", grupo: "Lounge", categoria: "movel", forma: "retangulo", largura: 0.8, profundidade: 0.8, altura: 0.85 },
  { chave: "mesa-centro", nome: "Mesa de centro", grupo: "Lounge", categoria: "movel", forma: "redondo", largura: 0.8, profundidade: 0.8, altura: 0.4 },
  { chave: "tapete", nome: "Tapete", rotulo: "TAPETE", grupo: "Lounge", categoria: "area", forma: "retangulo", largura: 3, profundidade: 2 },
  { chave: "altar", nome: "Altar / mesa de cerimônia", rotulo: "ALTAR", grupo: "Cerimônia", categoria: "cerimonia", forma: "retangulo", largura: 2, profundidade: 1, altura: 1 },
  { chave: "fileira-cadeiras", nome: "Fileira de cadeiras (cerimônia)", rotulo: "CADEIRAS", grupo: "Cerimônia", categoria: "cerimonia", forma: "retangulo", largura: 4, profundidade: 0.5, altura: 0.9 },
  { chave: "arranjo", nome: "Arranjo / vaso de chão", rotulo: "ARRANJO", grupo: "Apoio", categoria: "movel", forma: "redondo", largura: 0.6, profundidade: 0.6, altura: 1.6 },
  { chave: "recepcao", nome: "Recepção / lista", rotulo: "RECEPÇÃO", grupo: "Apoio", categoria: "apoio", forma: "retangulo", largura: 1.5, profundidade: 0.6, altura: 1 },
  { chave: "wc", nome: "Banheiro / WC", rotulo: "WC", grupo: "Apoio", categoria: "apoio", forma: "retangulo", largura: 1.5, profundidade: 2, altura: 2.3 },
  { chave: "area-livre", nome: "Área livre (tracejada)", rotulo: "", grupo: "Apoio", categoria: "area", forma: "retangulo", largura: 4, profundidade: 3 },
];

export const pecaPorChave = (chave: string) => PECAS.find((p) => p.chave === chave);

/** O texto da peça na planta — uma regra para modelos e para o editor. */
export const rotuloDaPeca = (p: PecaDaBiblioteca) => p.rotulo ?? p.nome.toUpperCase();

/** Altura padrão no 3D quando o elemento não tem a dele. */
export const ALTURA_PADRAO: Record<CategoriaDeElemento, number> = {
  palco: 0.6,
  pista: 0.04,
  bar: 1.1,
  bolo: 0.9,
  doces: 0.9,
  buffet: 0.9,
  principal: 0.76,
  lounge: 0.02,
  movel: 0.75,
  cerimonia: 0.9,
  apoio: 1.1,
  area: 0.01,
};

/** Área com cadeiras em volta da mesa redonda: tampo + ~0,55 m de cadeira. */
export const raioComCadeiras = (diametro: number) => diametro / 2 + 0.55;

// ── Distribuir mesas sem passar por cima de nada ─────────────────────────────

type Retangulo = { x0: number; y0: number; x1: number; y1: number };

/** Caixa que contém o elemento, já considerando rotação. */
export function caixaDoElemento(e: ElementoDoLayout): Retangulo {
  const r = ((e.rotacao ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const w = e.largura * c + e.profundidade * s;
  const h = e.largura * s + e.profundidade * c;
  return { x0: e.cx - w / 2, y0: e.cy - h / 2, x1: e.cx + w / 2, y1: e.cy + h / 2 };
}

/**
 * Coloca até `quantidade` mesas numa grade, do fundo para a frente, sem
 * sobrepor elemento, pilar nem outra mesa.
 *
 * Devolve SÓ as que couberam. Quem chama compara com o pedido e diz a
 * verdade ("couberam 26 de 30") em vez de empilhar mesa em cima do palco.
 */
export function distribuirMesas(
  d: DadosDoLayout,
  quantidade: number,
  opcoes: { espacamento?: number; folgaParede?: number } = {},
): { cx: number; cy: number }[] {
  const { largura, comprimento } = d.salao;
  const raio = raioComCadeiras(d.mesas.diametro);
  const passo = opcoes.espacamento ?? raio * 2 + 0.5;
  const folga = opcoes.folgaParede ?? 0.4;

  // Área de circulação mínima em volta do que não é mesa.
  const margem = 0.6;
  const bloqueios: Retangulo[] = [
    ...d.elementos
      .filter((e) => e.categoria !== "area" || e.peca === "area-livre")
      .map(caixaDoElemento),
    ...d.pilares.map((p) => ({
      x0: p.cx - p.lado / 2, y0: p.cy - p.lado / 2, x1: p.cx + p.lado / 2, y1: p.cy + p.lado / 2,
    })),
  ].map((b) => ({ x0: b.x0 - margem, y0: b.y0 - margem, x1: b.x1 + margem, y1: b.y1 + margem }));

  const colide = (x: number, y: number) =>
    bloqueios.some((b) => {
      // Distância do centro da mesa ao retângulo.
      const dx = Math.max(b.x0 - x, 0, x - b.x1);
      const dy = Math.max(b.y0 - y, 0, y - b.y1);
      return dx * dx + dy * dy < raio * raio;
    });

  const ocupadas = d.mesas.posicoes.map((p) => ({ cx: p.cx, cy: p.cy }));
  const pertoDeMesa = (x: number, y: number) =>
    ocupadas.some((p) => (p.cx - x) ** 2 + (p.cy - y) ** 2 < (passo - 0.05) ** 2);

  const novas: { cx: number; cy: number }[] = [];
  const colunas = Math.max(0, Math.floor((largura - 2 * (raio + folga)) / passo) + 1);
  const sobra = largura - 2 * (raio + folga) - (colunas - 1) * passo;
  const x0 = raio + folga + Math.max(0, sobra) / 2;

  for (let y = comprimento - raio - folga; y >= raio + folga && novas.length < quantidade; y -= passo) {
    for (let i = 0; i < colunas && novas.length < quantidade; i++) {
      const x = x0 + i * passo;
      if (colide(x, y) || pertoDeMesa(x, y)) continue;
      const p = { cx: arred(x), cy: arred(y) };
      novas.push(p);
      ocupadas.push(p);
    }
  }
  return novas;
}

const arred = (n: number) => Math.round(n * 100) / 100;

// ── Modelos prontos ──────────────────────────────────────────────────────────

export type ModeloDeLayout = {
  chave: string;
  nome: string;
  descricao: string;
  /** Recebe as medidas e o nº de mesas desejado; devolve um layout novo. */
  montar: (p: { largura: number; comprimento: number; mesas: number }) => DadosDoLayout;
};

let seq = 0;
const novoId = (prefixo: string) => `${prefixo}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function elemento(
  chave: string,
  cx: number,
  cy: number,
  extra: Partial<ElementoDoLayout> = {},
): ElementoDoLayout {
  const p = pecaPorChave(chave)!;
  return {
    id: novoId("el"),
    forma: p.forma,
    categoria: p.categoria,
    rotulo: rotuloDaPeca(p),
    cx: arred(cx),
    cy: arred(cy),
    largura: p.largura,
    profundidade: p.profundidade,
    ...(p.altura !== undefined ? { altura: p.altura } : {}),
    ...(p.cadeirasPorLado !== undefined ? { cadeirasPorLado: p.cadeirasPorLado } : {}),
    peca: p.chave,
    ...extra,
  };
}

function vazio(largura: number, comprimento: number): DadosDoLayout {
  return {
    salao: { largura, comprimento, peDireito: 3.5, cortina: false },
    aberturas: [],
    pilares: [],
    elementos: [],
    mesas: { diametro: 1.8, lugares: 10, posicoes: [] },
  };
}

function comMesas(d: DadosDoLayout, n: number): DadosDoLayout {
  const posicoes = distribuirMesas(d, n).map((p) => ({ id: novoId("m"), ...p }));
  return { ...d, mesas: { ...d.mesas, posicoes } };
}

export const MODELOS: readonly ModeloDeLayout[] = [
  {
    chave: "palco-pista-central",
    nome: "Palco, pista central e bar em ilha",
    descricao:
      "Palco na parede da frente com a pista diante dele, bar em ilha no meio do salão, mesa principal e mesa do bolo ao fundo, lounges nos cantos do palco. Mesas nas laterais.",
    montar: ({ largura, comprimento, mesas }) => {
      const d = vazio(largura, comprimento);
      const meio = largura / 2;
      const palcoW = Math.min(10.8, largura * 0.4);
      const palcoP = Math.min(5, comprimento * 0.18);
      const pistaW = Math.min(9, largura * 0.34);
      const pistaP = Math.min(6.5, comprimento * 0.23);
      const loungeW = Math.max(3, Math.min(7, (largura - palcoW) / 2 - 0.8));
      d.elementos.push(
        elemento("palco", meio, palcoP / 2, { largura: palcoW, profundidade: palcoP }),
        elemento("pista", meio, palcoP + pistaP / 2, { largura: pistaW, profundidade: pistaP }),
        elemento("bar-oval", meio, palcoP + pistaP + 3.2),
        elemento("mesa-principal", meio, comprimento * 0.74),
        elemento("mesa-bolo", meio, comprimento - 1.6, { largura: 5, profundidade: 1.5, rotulo: "MESA DO BOLO" }),
        elemento("lounge", loungeW / 2 + 0.6, 2.4, { largura: loungeW, profundidade: 4 }),
        elemento("lounge", largura - loungeW / 2 - 0.6, 2.4, { largura: loungeW, profundidade: 4 }),
        elemento("buffet", 0.9, comprimento * 0.7, { largura: 5, profundidade: 1, rotacao: 90, rotulo: "JANTAR" }),
      );
      // Corredor central livre do bar até a principal: as mesas ficam nas
      // laterais, que é como o salão deste modelo funciona na vida real.
      d.elementos.push(
        elemento("area-livre", meio, (palcoP + pistaP + comprimento * 0.74) / 2 + 1.5, {
          largura: Math.max(pistaW, 6), profundidade: comprimento * 0.74 - palcoP - pistaP, rotulo: "",
        }),
      );
      const comMesasProntas = comMesas(d, mesas);
      // A área de bloqueio cumpriu o papel; não precisa aparecer no salão.
      comMesasProntas.elementos = comMesasProntas.elementos.filter((e) => e.peca !== "area-livre");
      return comMesasProntas;
    },
  },
  {
    chave: "grade-com-pista",
    nome: "Mesas em grade com pista",
    descricao:
      "O mais simples: palco e pista na frente, buffet numa lateral, mesa de doces ao fundo e mesas distribuídas no restante.",
    montar: ({ largura, comprimento, mesas }) => {
      const d = vazio(largura, comprimento);
      const meio = largura / 2;
      d.elementos.push(
        elemento("palco", meio, 2, { largura: Math.min(8, largura * 0.45), profundidade: Math.min(4, comprimento * 0.15) }),
        elemento("pista", meio, 4 + Math.min(6, comprimento * 0.2) / 2, {
          largura: Math.min(7, largura * 0.4), profundidade: Math.min(6, comprimento * 0.2),
        }),
        elemento("buffet", largura - 0.9, comprimento / 2, { largura: 5, profundidade: 1, rotacao: 90 }),
        elemento("mesa-doces", meio, comprimento - 1.2),
      );
      return comMesas(d, mesas);
    },
  },
  {
    chave: "em-branco",
    nome: "Salão em branco",
    descricao: "Só as medidas. Você coloca cada peça.",
    montar: ({ largura, comprimento, mesas }) => comMesas(vazio(largura, comprimento), mesas),
  },
];
