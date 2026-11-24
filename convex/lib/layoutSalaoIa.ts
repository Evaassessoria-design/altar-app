import { LIMITES, type CategoriaDeElemento, type DadosDoLayout, type ElementoDoLayout, type FormaDeElemento, type ParedeDoSalao } from "./layoutSalao";
import { distribuirMesas } from "./layoutSalaoBiblioteca";

// ─────────────────────────────────────────────────────────────────────────────
// IA DO LAYOUT — croqui + medidas → PRIMEIRO RASCUNHO, nunca a versão final.
//
// Mesmo padrão da importação de contrato e da Planta Premium: a IA LÊ e
// PROPÕE; a decoradora revisa no editor e só então salva. Nada aqui grava.
//
// ── O QUE ESTE MÓDULO FAZ COM A RESPOSTA ────────────────────────────────────
// Modelo de linguagem devolve JSON "quase certo": vírgula no lugar de ponto,
// categoria inventada, mesa a 40 m de um salão de 20, cerca de código em
// volta. Nada disso pode chegar ao editor como se fosse medida. Então:
//   · número que não é número vira ausência, não zero plausível;
//   · categoria desconhecida vira "movel" (aparece, e ela corrige);
//   · coordenada fora do salão é TRAZIDA para dentro e AVISADA;
//   · contagem de mesas sem posição vira grade automática, AVISADA.
// O aviso existe para a tela nunca afirmar o que a IA apenas chutou.
// ─────────────────────────────────────────────────────────────────────────────

export const PROMPT_VERSION_LAYOUT = "layout-salao-v1";

export const LAYOUT_SYSTEM_PROMPT = `Você monta a planta de um salão de eventos a partir de um croqui (desenho à mão) e/ou de uma descrição com medidas.

Responda SOMENTE com JSON, sem texto fora dele, neste formato:
{
  "salao": { "largura": number, "comprimento": number, "peDireito": number|null, "cortina": boolean },
  "aberturas": [ { "parede": "frente"|"fundo"|"esquerda"|"direita", "inicio": number, "fim": number, "rotulo": string, "tipo": "entrada"|"servico"|"saida" } ],
  "pilares": [ { "cx": number, "cy": number, "lado": number } ],
  "elementos": [ { "categoria": "palco"|"pista"|"bar"|"bolo"|"doces"|"buffet"|"principal"|"lounge"|"movel"|"cerimonia"|"apoio"|"area", "forma": "retangulo"|"redondo"|"oval", "rotulo": string, "cx": number, "cy": number, "largura": number, "profundidade": number, "rotacao": number } ],
  "mesas": { "quantidade": number, "lugares": number, "diametro": number, "posicoes": [ { "cx": number, "cy": number } ] },
  "observacoes": string
}

Regras:
- Unidades em METROS. Origem no canto inferior esquerdo. x cresce para a direita, y cresce para cima.
- A parede "frente" é a de y = 0 (onde normalmente fica o palco). "fundo" é a de y = comprimento.
- cx/cy são o CENTRO de cada elemento.
- Use as medidas informadas pelo usuário; o croqui define a DISPOSIÇÃO. Não invente medida que não foi dada: use medidas usuais (mesa redonda de 10 lugares = 1,80 m; pista 6x6; palco 8x4) e diga em "observacoes" o que foi suposto.
- Se o usuário pedir uma quantidade de mesas, "mesas.quantidade" deve ser essa quantidade. Distribua as posições respeitando o croqui; se não souber posicionar, deixe "posicoes" vazio.
- Mantenha circulação de pelo menos 0,6 m entre as áreas com cadeiras.`;

const CATEGORIAS: readonly CategoriaDeElemento[] = [
  "palco", "pista", "bar", "bolo", "doces", "buffet", "principal", "lounge", "movel", "cerimonia", "apoio", "area",
];
const FORMAS: readonly FormaDeElemento[] = ["retangulo", "redondo", "oval"];
const PAREDES: readonly ParedeDoSalao[] = ["frente", "fundo", "esquerda", "direita"];

/** "26,9" e "26.9 m" contam como número; "grande" não. */
function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number(v.replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) && v.trim() !== "" ? n : undefined;
  }
  return undefined;
}
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown, max: number = LIMITES.rotulo) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const arred = (n: number) => Math.round(n * 100) / 100;

export type RascunhoDaIa = {
  dados: DadosDoLayout;
  /** O que foi suposto ou corrigido — a tela mostra antes de ela aceitar. */
  avisos: string[];
  observacoes?: string;
};

/**
 * Resposta crua do modelo → layout que o editor consegue abrir.
 *
 * NUNCA lança. Resposta ilegível devolve um salão em branco com as medidas
 * que a pessoa digitou e um aviso dizendo que a leitura falhou — é melhor do
 * que um erro que a obriga a recomeçar.
 */
export function interpretarRascunhoDaIa(
  raw: string,
  padrao: { largura?: number; comprimento?: number; mesas?: number } = {},
): RascunhoDaIa {
  const avisos: string[] = [];
  const limpo = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let p: Record<string, unknown> | null = null;
  try {
    p = obj(JSON.parse(limpo));
  } catch {
    p = null;
  }
  if (!p) avisos.push("A IA não devolveu uma planta legível. Começamos com o salão em branco.");
  const r = p ?? {};

  const s = obj(r.salao) ?? {};
  let largura = num(s.largura) ?? padrao.largura;
  let comprimento = num(s.comprimento) ?? padrao.comprimento;
  if (largura === undefined || comprimento === undefined) {
    avisos.push("Medidas do salão não informadas — usamos 20 × 25 m. Ajuste antes de salvar.");
  }
  largura = limitar(largura ?? 20, LIMITES.ladoMin, LIMITES.ladoMax);
  comprimento = limitar(comprimento ?? 25, LIMITES.ladoMin, LIMITES.ladoMax);
  const pe = num(s.peDireito);

  let foraDoSalao = 0;
  const dentroX = (x: number) => {
    const c = limitar(x, 0, largura!);
    if (c !== x) foraDoSalao++;
    return arred(c);
  };
  const dentroY = (y: number) => {
    const c = limitar(y, 0, comprimento!);
    if (c !== y) foraDoSalao++;
    return arred(c);
  };

  let seq = 0;
  const id = (pfx: string) => `${pfx}-ia-${(seq++).toString(36)}`;

  const elementos: ElementoDoLayout[] = [];
  for (const bruto of arr(r.elementos).slice(0, LIMITES.elementos)) {
    const e = obj(bruto);
    if (!e) continue;
    const cx = num(e.cx);
    const cy = num(e.cy);
    if (cx === undefined || cy === undefined) continue;
    const cat = CATEGORIAS.includes(e.categoria as CategoriaDeElemento)
      ? (e.categoria as CategoriaDeElemento)
      : "movel";
    const forma = FORMAS.includes(e.forma as FormaDeElemento) ? (e.forma as FormaDeElemento) : "retangulo";
    const larg = limitar(num(e.largura) ?? 1, 0.2, largura);
    const prof = forma === "redondo" ? larg : limitar(num(e.profundidade) ?? 1, 0.2, comprimento);
    const rot = num(e.rotacao);
    elementos.push({
      id: id("el"),
      forma,
      categoria: cat,
      rotulo: texto(e.rotulo).toUpperCase() || cat.toUpperCase(),
      cx: dentroX(cx),
      cy: dentroY(cy),
      largura: arred(larg),
      profundidade: arred(prof),
      ...(rot ? { rotacao: arred(rot % 360) } : {}),
    });
  }

  const aberturas = arr(r.aberturas)
    .slice(0, LIMITES.aberturas)
    .map(obj)
    .filter((a): a is Record<string, unknown> => !!a && PAREDES.includes(a.parede as ParedeDoSalao))
    .map((a) => {
      const parede = a.parede as ParedeDoSalao;
      const tamanho = parede === "frente" || parede === "fundo" ? largura! : comprimento!;
      const ini = limitar(num(a.inicio) ?? 0, 0, tamanho - 0.5);
      const fim = limitar(num(a.fim) ?? ini + 2, ini + 0.5, tamanho);
      const tipo = a.tipo === "servico" || a.tipo === "saida" ? a.tipo : "entrada";
      return { id: id("ab"), parede, inicio: arred(ini), fim: arred(fim), rotulo: texto(a.rotulo).toUpperCase() || "ENTRADA", tipo } as const;
    });

  const pilares = arr(r.pilares)
    .slice(0, LIMITES.pilares)
    .map(obj)
    .filter((x): x is Record<string, unknown> => !!x && num(x.cx) !== undefined && num(x.cy) !== undefined)
    .map((x) => ({ id: id("pi"), cx: dentroX(num(x.cx)!), cy: dentroY(num(x.cy)!), lado: limitar(num(x.lado) ?? 0.5, 0.2, 2) }));

  const m = obj(r.mesas) ?? {};
  const diametro = limitar(num(m.diametro) ?? 1.8, 0.6, 3);
  const lugares = Math.round(limitar(num(m.lugares) ?? 10, 1, 30));
  let posicoes = arr(m.posicoes)
    .slice(0, LIMITES.mesas)
    .map(obj)
    .filter((x): x is Record<string, unknown> => !!x && num(x.cx) !== undefined && num(x.cy) !== undefined)
    .map((x) => ({ id: id("m"), cx: dentroX(num(x.cx)!), cy: dentroY(num(x.cy)!) }));

  const dados: DadosDoLayout = {
    salao: {
      largura: arred(largura),
      comprimento: arred(comprimento),
      ...(pe !== undefined ? { peDireito: limitar(pe, LIMITES.peDireitoMin, LIMITES.peDireitoMax) } : {}),
      cortina: s.cortina === true,
    },
    aberturas,
    pilares,
    elementos,
    mesas: { diametro, lugares, posicoes },
  };

  // O pedido da pessoa vale mais do que a contagem da IA.
  const pedido = padrao.mesas ?? num(m.quantidade);
  const quantidade = pedido !== undefined ? Math.round(limitar(pedido, 0, LIMITES.mesas)) : undefined;
  if (quantidade !== undefined && posicoes.length !== quantidade) {
    if (posicoes.length > quantidade) {
      posicoes = posicoes.slice(0, quantidade);
    } else {
      const extras = distribuirMesas(dados, quantidade - posicoes.length).map((p) => ({ id: id("m"), ...p }));
      posicoes = [...posicoes, ...extras];
      avisos.push(
        posicoes.length < quantidade
          ? `Couberam ${posicoes.length} de ${quantidade} mesas sem sobrepor nada. Revise a disposição.`
          : "Parte das mesas foi distribuída automaticamente em grade. Revise a disposição.",
      );
    }
    dados.mesas.posicoes = posicoes;
  }

  if (foraDoSalao > 0) avisos.push(`${foraDoSalao} posição(ões) estavam fora do salão e foram trazidas para dentro.`);

  const observacoes = texto(r.observacoes, 600) || undefined;
  return { dados, avisos, observacoes };
}
