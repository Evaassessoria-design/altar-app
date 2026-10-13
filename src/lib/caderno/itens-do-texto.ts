import { chaveDoAmbiente } from "../decoration-project.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ITENS QUE SÓ EXISTEM COMO TEXTO
//
// A leitura do contrato com IA (`contract-import-dialog.tsx`) grava a lista de
// itens da decoração num campo de texto do briefing, `furnitureNotes`:
//
//   "mobiliário: Aparador (x1); mobiliário: Cadeiras do acervo local (x200);
//    decoração: Toalhas em tecido (x27); flores: Folhagens"
//
// e o Caderno imprimia isso como um parágrafo corrido. Quem montava tinha de
// achar "220 cadeiras" no meio de uma linha de quinze.
//
// ── O QUE ESTE MÓDULO FAZ, E O QUE NÃO FAZ ──────────────────────────────────
// LÊ o texto para o papel. Não cria item de montagem, não grava nada e não
// diz que nada foi contratado — o texto continua sendo o que era, uma
// anotação do briefing, e o Caderno o mostra com essa origem.
//
// Pedaço que não casa com o formato NÃO é descartado: vira linha sem
// quantidade, com o texto como estava. Texto antigo que ninguém consegue ler
// em lista (um parágrafo) volta inteiro como `textoLivre`, para ser mostrado
// como bloco — nenhum evento perde uma letra.
// ─────────────────────────────────────────────────────────────────────────────

export type ItemDoTexto = {
  /** "Mobiliário" — a categoria escrita, com a primeira letra maiúscula. */
  categoria?: string;
  nome: string;
  quantidade?: number;
};

export type LeituraDoTexto = {
  itens: ItemDoTexto[];
  /** O texto não tem cara de lista: vai inteiro, como parágrafo. */
  textoLivre?: string;
  /** Nomes que apareciam mais de uma vez no próprio texto (não somados). */
  repetidos: string[];
};

const PEDACO = /^(?:(?<categoria>[^:]{1,40}):\s*)?(?<nome>.+?)(?:\s*\(\s*x\s*(?<qtd>\d+)\s*\))?$/i;

const capitalizar = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** Chave para comparar nomes: sem acento, sem caixa, sem espaço sobrando. */
export function chaveDoNome(nome: string): string {
  return chaveDoAmbiente(nome);
}

/**
 * Lê a lista "categoria: item (xN); …".
 *
 * Só aceita como LISTA o texto com pelo menos um separador e pedaços curtos;
 * um parágrafo com ponto e vírgula no meio não é lista de itens.
 */
export function lerItensDoTexto(texto: string | undefined | null): LeituraDoTexto {
  const t = texto?.trim();
  if (!t) return { itens: [], repetidos: [] };

  const pedacos = t.split(/\s*;\s*|\n+/).map((p) => p.trim()).filter(Boolean);
  const pareceLista =
    pedacos.length >= 2 &&
    pedacos.every((p) => p.length <= 90) &&
    pedacos.filter((p) => /\(\s*x\s*\d+\s*\)\s*$/i.test(p) || /^[^:]{1,40}:/.test(p)).length >=
      Math.ceil(pedacos.length / 2);
  if (!pareceLista) return { itens: [], textoLivre: t, repetidos: [] };

  const itens: ItemDoTexto[] = [];
  const vistos = new Set<string>();
  const repetidos: string[] = [];
  for (const p of pedacos) {
    const m = PEDACO.exec(p);
    const nome = (m?.groups?.nome ?? p).trim();
    if (!nome) continue;
    const chave = chaveDoNome(nome);
    // O mesmo nome duas vezes no texto NÃO é somado: o mais provável é a
    // linha repetida na leitura, e 400 cadeiras no papel quando o contrato diz
    // 200 é o erro que não se percebe até o caminhão chegar.
    if (vistos.has(chave)) {
      repetidos.push(nome);
      continue;
    }
    vistos.add(chave);
    const qtd = m?.groups?.qtd ? Number(m.groups.qtd) : undefined;
    itens.push({
      categoria: m?.groups?.categoria ? capitalizar(m.groups.categoria.trim()) : undefined,
      nome,
      quantidade: qtd && qtd > 0 ? qtd : undefined,
    });
  }
  return { itens, repetidos };
}

/**
 * Os ambientes, quando o texto é uma LISTA de ambientes.
 *
 * A importação do contrato grava "Cerimônia, recepção, Welcome Drink, altar…"
 * em `atmosphereDescription` — que no resto do sistema é o parágrafo da
 * atmosfera. Só vira lista quando parece lista: três ou mais pedaços curtos.
 * Senão é atmosfera, e quem o lê é o conceito.
 */
export function lerAmbientesDoTexto(texto: string | undefined | null): string[] | null {
  const t = texto?.trim();
  if (!t) return null;
  const pedacos = t
    .replace(/\.$/, "")
    .split(/\s*[,;\n]\s*|\s+e\s+(?=[^,]*$)/)
    .map((p) => p.trim())
    .filter(Boolean);
  const curtos = pedacos.every((p) => p.split(/\s+/).length <= 4 && p.length <= 32);
  if (pedacos.length < 3 || !curtos) return null;
  return pedacos.map(capitalizar);
}
