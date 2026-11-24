import { v, type Infer } from "convex/values";

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT DO SALÃO — planta em escala, editável, que vira 2D e 3D.
//
// ── POR QUE ISTO NÃO É A PLANTA PREMIUM ─────────────────────────────────────
// A Planta Premium (`layoutRenders`) é uma IMAGEM gerada por IA a partir do
// croqui: bonita, mas muda inteira a cada geração e não sabe quantas mesas
// tem. O que a decoradora precisava no dia a dia era o contrário — tirar duas
// mesas da pista, aumentar o bar, mandar a versão nova para os clientes em
// cinco minutos — e isso só se faz sobre DADOS, não sobre pixels.
//
// Aqui o layout é a verdade: medidas do salão em metros, aberturas, pilares,
// elementos e mesas com posição. A planta 2D, o 3D e o PDF são LEITURAS do
// mesmo objeto. Nenhuma das três guarda uma segunda cópia.
//
// ── SISTEMA DE COORDENADAS ──────────────────────────────────────────────────
// Metros. Origem no canto inferior esquerdo da planta. `x` cresce para a
// direita (largura); `y` cresce para cima (comprimento). A parede "frente" é a
// de y = 0, onde costuma ficar o palco; "fundo" é a de y = comprimento. Todo
// elemento é guardado pelo CENTRO (`cx`, `cy`): girar e arrastar ficam uma
// conta só, e o 3D usa o mesmo ponto.
//
// ── LIMITES ─────────────────────────────────────────────────────────────────
// O layout vive num documento só, gravado inteiro a cada "Salvar". A diretriz
// do Convex é não guardar lista sem teto dentro de documento, e por isso as
// listas TÊM teto (`LIMITES`), conferido no servidor. Um salão de 400 mesas
// cabe com folga; um navegador mandando 50 mil elementos é recusado antes de
// encostar no banco.
// ─────────────────────────────────────────────────────────────────────────────

export const LIMITES = {
  /** Lado do salão, em metros. Abaixo de 2 m não é salão; acima de 300 é erro de digitação. */
  ladoMin: 2,
  ladoMax: 300,
  peDireitoMin: 2,
  peDireitoMax: 40,
  elementos: 300,
  mesas: 500,
  aberturas: 30,
  pilares: 150,
  /** Layouts por evento: opções A/B/C, não um histórico infinito. */
  layoutsPorEvento: 20,
  rotulo: 60,
  nome: 80,
  /** Folga fora das paredes: rótulo de varanda, acesso externo. */
  folgaExterna: 10,
} as const;

// ── Validadores (fonte única: schema e funções importam daqui) ───────────────

export const categoriaDeElemento = v.union(
  v.literal("palco"),
  v.literal("pista"),
  v.literal("bar"),
  v.literal("bolo"),
  v.literal("doces"),
  v.literal("buffet"),
  v.literal("principal"), // mesa principal / da família / imperial
  v.literal("lounge"),
  v.literal("movel"),
  v.literal("cerimonia"),
  v.literal("apoio"), // WC, DJ, recepção, estação
  v.literal("area"), // zona livre tracejada (frente do bolo, circulação)
);
export type CategoriaDeElemento = Infer<typeof categoriaDeElemento>;

export const formaDeElemento = v.union(
  v.literal("retangulo"),
  v.literal("redondo"),
  v.literal("oval"),
);
export type FormaDeElemento = Infer<typeof formaDeElemento>;

export const elementoDoLayout = v.object({
  /** Gerado no navegador; só identifica o elemento dentro DESTE layout. */
  id: v.string(),
  forma: formaDeElemento,
  categoria: categoriaDeElemento,
  rotulo: v.string(),
  cx: v.number(),
  cy: v.number(),
  /** Medida no eixo x antes da rotação (diâmetro, no redondo). */
  largura: v.number(),
  /** Medida no eixo y antes da rotação. No redondo, é igual à largura. */
  profundidade: v.number(),
  /** Graus, sentido horário. AUSENTE = 0. */
  rotacao: v.optional(v.number()),
  /** Altura no 3D, em metros. AUSENTE = a padrão da categoria. */
  altura: v.optional(v.number()),
  /**
   * Cadeiras dos dois lados maiores (mesa principal, mesa imperial).
   * AUSENTE = sem cadeiras desenhadas.
   */
  cadeirasPorLado: v.optional(v.number()),
  /**
   * Foto de referência da Galeria DESTE evento.
   *
   * PONTEIRO para `eventPhotos`, nunca cópia de arquivo — a mesma decisão do
   * item visual. O nome evita de propósito o prefixo `referencePhoto`, que a
   * trava de arquitetura reserva para `assemblyItems`.
   * AUSENTE = elemento sem referência.
   */
  fotoId: v.optional(v.id("eventPhotos")),
  /** De qual peça da biblioteca o elemento nasceu. AUSENTE = desenhado à mão. */
  peca: v.optional(v.string()),
});
export type ElementoDoLayout = Infer<typeof elementoDoLayout>;

export const paredeDoSalao = v.union(
  v.literal("frente"),
  v.literal("fundo"),
  v.literal("esquerda"),
  v.literal("direita"),
);
export type ParedeDoSalao = Infer<typeof paredeDoSalao>;

export const aberturaDoSalao = v.object({
  id: v.string(),
  parede: paredeDoSalao,
  /** Metros ao longo da parede, a partir do canto de menor x (ou menor y). */
  inicio: v.number(),
  fim: v.number(),
  rotulo: v.string(),
  tipo: v.union(v.literal("entrada"), v.literal("servico"), v.literal("saida")),
});
export type AberturaDoSalao = Infer<typeof aberturaDoSalao>;

export const pilarDoSalao = v.object({
  id: v.string(),
  cx: v.number(),
  cy: v.number(),
  lado: v.number(),
});

export const mesaDoLayout = v.object({
  id: v.string(),
  cx: v.number(),
  cy: v.number(),
});

export const dadosDoLayout = v.object({
  salao: v.object({
    largura: v.number(),
    comprimento: v.number(),
    /** AUSENTE = 3,5 m, só para o 3D. */
    peDireito: v.optional(v.number()),
    /** Paredes revestidas de cortina. AUSENTE = não. */
    cortina: v.optional(v.boolean()),
  }),
  aberturas: v.array(aberturaDoSalao),
  pilares: v.array(pilarDoSalao),
  elementos: v.array(elementoDoLayout),
  mesas: v.object({
    /** Diâmetro do tampo, em metros. */
    diametro: v.number(),
    lugares: v.number(),
    posicoes: v.array(mesaDoLayout),
  }),
});
export type DadosDoLayout = Infer<typeof dadosDoLayout>;

export const origemDoLayout = v.union(
  v.literal("em_branco"),
  v.literal("modelo"),
  v.literal("ia"),
  v.literal("copia"),
);
export type OrigemDoLayout = Infer<typeof origemDoLayout>;

// ── Validação de conteúdo ────────────────────────────────────────────────────
// O validador do Convex garante a FORMA; isto garante o SENTIDO. Número
// infinito, mesa a 900 m do salão, rótulo de 10 mil caracteres: tudo passa no
// `v.number()`/`v.string()` e quebra a tela de quem abrir depois.

const finito = (n: number) => typeof n === "number" && Number.isFinite(n);

/**
 * Lista os problemas do layout. Vazio = pode gravar.
 *
 * Devolve TODOS, não o primeiro: a mensagem de erro precisa dizer à pessoa
 * o que corrigir, e corrigir um por vez em cinco salvamentos é castigo.
 */
export function problemasDoLayout(d: DadosDoLayout): string[] {
  const erros: string[] = [];
  const { largura, comprimento, peDireito } = d.salao;

  const ladoOk = (n: number) => finito(n) && n >= LIMITES.ladoMin && n <= LIMITES.ladoMax;
  if (!ladoOk(largura) || !ladoOk(comprimento)) {
    erros.push(`Medidas do salão precisam ficar entre ${LIMITES.ladoMin} e ${LIMITES.ladoMax} m.`);
    // Sem salão válido, conferir posição não tem referência.
    return erros;
  }
  if (
    peDireito !== undefined &&
    (!finito(peDireito) || peDireito < LIMITES.peDireitoMin || peDireito > LIMITES.peDireitoMax)
  ) {
    erros.push(`Pé-direito precisa ficar entre ${LIMITES.peDireitoMin} e ${LIMITES.peDireitoMax} m.`);
  }

  if (d.elementos.length > LIMITES.elementos) erros.push(`Máximo de ${LIMITES.elementos} elementos.`);
  if (d.mesas.posicoes.length > LIMITES.mesas) erros.push(`Máximo de ${LIMITES.mesas} mesas.`);
  if (d.aberturas.length > LIMITES.aberturas) erros.push(`Máximo de ${LIMITES.aberturas} aberturas.`);
  if (d.pilares.length > LIMITES.pilares) erros.push(`Máximo de ${LIMITES.pilares} pilares.`);

  const f = LIMITES.folgaExterna;
  const dentro = (x: number, y: number) =>
    finito(x) && finito(y) && x >= -f && x <= largura + f && y >= -f && y <= comprimento + f;

  const medidaOk = (n: number) => finito(n) && n > 0 && n <= LIMITES.ladoMax;

  d.elementos.forEach((e, i) => {
    const nome = e.rotulo.trim() || `elemento ${i + 1}`;
    if (!dentro(e.cx, e.cy)) erros.push(`"${nome}" está fora do salão.`);
    if (!medidaOk(e.largura) || !medidaOk(e.profundidade)) erros.push(`"${nome}" tem medida inválida.`);
    if (e.rotulo.length > LIMITES.rotulo) erros.push(`O nome de "${nome.slice(0, 20)}…" é longo demais.`);
    if (e.rotacao !== undefined && !finito(e.rotacao)) erros.push(`"${nome}" tem rotação inválida.`);
    if (e.altura !== undefined && (!finito(e.altura) || e.altura < 0 || e.altura > 20)) {
      erros.push(`"${nome}" tem altura inválida.`);
    }
    if (
      e.cadeirasPorLado !== undefined &&
      (!Number.isInteger(e.cadeirasPorLado) || e.cadeirasPorLado < 0 || e.cadeirasPorLado > 60)
    ) {
      erros.push(`"${nome}" tem quantidade de cadeiras inválida.`);
    }
  });

  const m = d.mesas;
  if (!finito(m.diametro) || m.diametro < 0.4 || m.diametro > 5) {
    erros.push("O diâmetro das mesas precisa ficar entre 0,40 e 5 m.");
  }
  if (!Number.isInteger(m.lugares) || m.lugares < 1 || m.lugares > 30) {
    erros.push("Lugares por mesa precisa ser um número entre 1 e 30.");
  }
  if (m.posicoes.some((p) => !dentro(p.cx, p.cy))) erros.push("Há mesa fora do salão.");

  d.pilares.forEach((p) => {
    if (!dentro(p.cx, p.cy) || !finito(p.lado) || p.lado <= 0 || p.lado > 5) {
      erros.push("Há pilar com posição ou medida inválida.");
    }
  });

  d.aberturas.forEach((a) => {
    const parede = a.parede === "frente" || a.parede === "fundo" ? largura : comprimento;
    if (!finito(a.inicio) || !finito(a.fim) || a.inicio < 0 || a.fim > parede || a.fim <= a.inicio) {
      erros.push(`A abertura "${a.rotulo || a.tipo}" não cabe na parede.`);
    }
    if (a.rotulo.length > LIMITES.rotulo) erros.push("Nome de abertura longo demais.");
  });

  const ids = [...d.elementos.map((e) => e.id), ...d.mesas.posicoes.map((p) => p.id)];
  if (ids.some((id) => id.length === 0 || id.length > 64)) erros.push("Identificador inválido.");
  if (new Set(ids).size !== ids.length) erros.push("Há itens repetidos no layout.");

  // Deduplica: dez pilares errados viram uma linha, não dez.
  return [...new Set(erros)];
}

/** As fotos citadas no layout, sem repetição — o servidor confere cada uma. */
export function fotosDoLayout(d: DadosDoLayout) {
  return [...new Set(d.elementos.map((e) => e.fotoId).filter((f) => f !== undefined))];
}

/**
 * Copia um layout para OUTRO evento.
 *
 * As fotos de referência ficam para trás: a foto é da Galeria do evento de
 * origem, e uma referência do casamento da Joana não pode aparecer no layout
 * do 15 anos da Helena — mesmo sendo as duas da mesma decoradora. É a mesma
 * terceira pergunta de `requireEventPhoto`, respondida antes de perguntar.
 */
export function semFotos(d: DadosDoLayout): DadosDoLayout {
  return {
    ...d,
    elementos: d.elementos.map(({ fotoId: _foto, ...resto }) => resto),
  };
}

/** Contagem de convidados derivada — nunca gravada. */
export function lugaresDoLayout(d: DadosDoLayout): number {
  const nasMesas = d.mesas.posicoes.length * d.mesas.lugares;
  const nasPrincipais = d.elementos.reduce(
    (soma, e) => soma + (e.categoria === "principal" ? (e.cadeirasPorLado ?? 0) * 2 : 0),
    0,
  );
  return nasMesas + nasPrincipais;
}
