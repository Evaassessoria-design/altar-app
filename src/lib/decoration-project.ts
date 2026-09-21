import { chaveDoAmbiente } from "@/convex/lib/ambiente.ts";
import { BRIEFING_AREAS } from "./briefing-areas.ts";
import { scopeMeta, type ProjectScope } from "./photo-scope.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PROJETO VISUAL (o antigo "Projeto de decoração")
//
// O nome mudou para a usuária; a estrutura não. A tela passou a mostrar também
// as FOTOS da galeria, agrupadas pelo mesmo ambiente — ver `projeto-visual.ts`.
//
// ── POR QUE NÃO EXISTE TABELA NOVA ──────────────────────────────────────────
// `assemblyItems` JÁ É o modelo de composição. Cada linha tem:
//
//   area            → o AMBIENTE (cerimônia, mesa do bolo, lounge...)
//   name            → a COMPOSIÇÃO ou item ("Mesa posta", "Arco de oliveiras")
//   model/quantity  → a DESCRIÇÃO
//   supplierName    → o FORNECEDOR
//   notes           → a OBSERVAÇÃO
//   reference/contractedPhoto → as REFERÊNCIAS VISUAIS
//   visibility      → para QUEM aquilo pode aparecer
//
// Criar uma segunda estrutura obrigaria a decoradora a cadastrar o mesmo item
// duas vezes — uma no projeto, outra na montagem — e as duas divergiriam na
// primeira semana. O Projeto de Decoração é uma LEITURA desses dados,
// organizada por ambiente, não um cadastro paralelo.
//
// O que faltava era um eixo: `projectScope`, dizendo se o item é contratado,
// referência estética ou algo que ficou de fora. Ele usa exatamente as mesmas
// palavras de `eventPhotos.projectScope` — item e foto respondem à mesma
// pergunta e precisam falar a mesma língua nos documentos.
// ─────────────────────────────────────────────────────────────────────────────

export type ItemDoProjeto = {
  _id: string;
  area: string;
  name: string;
  model?: string;
  quantity?: number;
  unit?: string;
  ambiente?: string;
  supplierName?: string;
  notes?: string;
  projectScope?: string;
  visibility: string;
  referencePhotoUrl?: string | null;
  contractedPhotoUrl?: string | null;
};

export type AmbienteDoProjeto = {
  /** Chave da área (`ceremony`, `flowers`...) ou o texto livre digitado. */
  key: string;
  label: string;
  emoji?: string;
  itens: ItemDoProjeto[];
  /** Quantos itens são efetivamente contratados neste ambiente. */
  inclusos: number;
  /** Quantos são referência estética — NÃO viram obrigação de montagem. */
  referencias: number;
};

/** Rótulo de um ambiente. Ambiente personalizado volta como foi digitado. */
export function labelDoAmbiente(area: string): { label: string; emoji?: string } {
  const conhecida = BRIEFING_AREAS.find((a) => a.key === area);
  // Ambiente personalizado é importante: a decoradora cria "Bem-casados",
  // "Ilha gastronômica", "Buquê"... e o sistema não pode chamar isso de
  // inválido nem esconder.
  return conhecida ? { label: conhecida.label, emoji: conhecida.emoji } : { label: area };
}

// ── ESCOPO DO ITEM ──────────────────────────────────────────────────────────
// A regra desceu para `convex/lib/escopoDoProjeto.ts` no MASTER #6: a Ficha
// Técnica precisa dela no BACKEND (para consolidar materiais) e o Convex não
// importa de `src/`. Reexportada aqui para os consumidores existentes — Caderno
// de Montagem, Folha de Carregamento e PDFs — não mudarem de endereço.
//
// Uma segunda cópia faria a tela mostrar um material que o PDF não lista.
import { escopoDoItem, ehObrigacaoDeMontagem } from "@/convex/lib/escopoDoProjeto.ts";
export { escopoDoItem, ehObrigacaoDeMontagem };

// ── ONDE A DECORAÇÃO ACONTECE — A REGRA CANÔNICA ────────────────────────────
//
// O item guarda DOIS campos, e eles não são sinônimos:
//
//   area     → a CATEGORIA do briefing (`ceremony`, `cake`, `lighting`).
//              Nasce da seção do Questionário em que o item foi cadastrado —
//              `assembly-items-section.tsx` filtra por `i.area === area`.
//              Nunca é digitada: é estrutura.
//   ambiente → o NOME DO ESPAÇO, texto livre, opcional. Nasce dos dedos da
//              decoradora ("Jardim das oliveiras", "Salão de vidro").
//
// A foto da galeria guarda só o segundo (`eventPhotos.ambiente`).
//
// ── O DEFEITO QUE ISTO CORRIGE ──────────────────────────────────────────────
// Até aqui existiam DUAS verdades no repositório:
//
//   Ficha Técnica          → agrupava por `ambiente || area`
//   Projeto / Carregamento → agrupavam só por `area`
//   Caderno de Montagem    → agrupava só por `area`
//
// Então o mesmo casamento se organizava de um jeito na ficha e de outro no
// caderno. Pior: no Projeto Visual os ITENS iam para "Cerimônia" e as FOTOS
// do mesmo lugar iam para "Jardim das oliveiras" — dois blocos para o mesmo
// canto do jardim, e a decoradora sem entender por quê.
//
// ── A REGRA ─────────────────────────────────────────────────────────────────
// Se ela deu nome ao espaço, o nome dela manda. Se não deu, a categoria
// traduzida serve de rótulo. A categoria NÃO some: vira `categoria` no grupo,
// e só aparece quando acrescenta alguma coisa (ver `categoriaDoGrupo`).
//
// A normalização é SÓ para comparar. O rótulo exibido é sempre o texto que ela
// digitou — "Jardim das Oliveiras" nunca vira "jardim das oliveiras" na tela.

/** Grupo de itens sem área e sem ambiente. Existe para nada desaparecer. */
export const SEM_AMBIENTE = "__sem-ambiente";

// A normalização desceu para `convex/lib/ambiente.ts` porque o FILTRO da
// galeria roda no servidor e precisa da mesma chave — senão o bloco mostra
// doze fotos e o link para a galeria devolve nove. Mesmo motivo de
// `escopoDoItem` ter descido no MASTER #6. Reexportada aqui para os
// consumidores não mudarem de endereço.
export { chaveDoAmbiente };

export type AmbienteResolvido = {
  /** Chave normalizada — comparação e agrupamento. */
  chave: string;
  /** O que aparece na tela e no papel. */
  label: string;
  emoji?: string;
  /** A categoria de briefing de onde o item veio. Pode ser vazia. */
  area: string;
  /** O rótulo veio do texto DELA (e não da tradução da categoria)? */
  doAmbiente: boolean;
};

/**
 * A ÚNICA função que responde "onde esta coisa acontece?".
 *
 * Serve item de montagem e foto da galeria: a foto entra aqui só com
 * `ambiente`, o item com os dois. Quem chamar isto agrupa igual a todo mundo.
 *
 * Não desceu para `convex/lib/` porque depende de `BRIEFING_AREAS`, que mora
 * em `src/`. No dia em que o backend precisar agrupar por ambiente, a lista de
 * áreas desce primeiro — e aí esta função desce junto, inteira.
 */
export function resolverAmbiente(item: {
  area?: string;
  ambiente?: string;
}): AmbienteResolvido {
  const area = item.area?.trim() ?? "";
  const digitado = item.ambiente?.trim() ?? "";
  const daArea = area ? labelDoAmbiente(area) : { label: "", emoji: undefined };

  if (digitado) {
    const chave = chaveDoAmbiente(digitado);
    // "Cerimônia" digitado dentro da área Cerimônia é o MESMO lugar, não um
    // ambiente novo: mantém o emoji da área e não anuncia categoria redundante.
    const mesmoQueAArea = !!area && chave === chaveDoAmbiente(daArea.label);
    return {
      chave,
      label: digitado,
      emoji: mesmoQueAArea ? daArea.emoji : undefined,
      area,
      doAmbiente: !mesmoQueAArea,
    };
  }

  if (area) {
    return {
      chave: chaveDoAmbiente(daArea.label),
      label: daArea.label,
      emoji: daArea.emoji,
      area,
      doAmbiente: false,
    };
  }

  // Nem área nem ambiente. Não é erro de dado que justifique sumir com o item:
  // a folha existe para carregar o caminhão, não para cobrar cadastro.
  return { chave: SEM_AMBIENTE, label: "Sem ambiente", area: "", doAmbiente: false };
}

export type GrupoDeAmbiente<T> = {
  /** A chave normalizada. Estável entre telas — é o que faz a junção. */
  key: string;
  label: string;
  emoji?: string;
  /**
   * A categoria do briefing ("Cerimônia"), quando ela ACRESCENTA informação.
   *
   * Ausente quando o rótulo já é a própria categoria (seria eco) e quando o
   * bloco reúne categorias diferentes — "Salão de vidro" com itens de Festa e
   * de Bolo não é nem uma coisa nem outra, e escolher uma seria mentir.
   */
  categoria?: string;
  itens: T[];
};

type Acumulado<T> = {
  key: string;
  label: string;
  emoji?: string;
  doAmbiente: boolean;
  /** Posição canônica: a da PRIMEIRA área do briefing que ocupa este bloco. */
  ordem: number;
  areas: Set<string>;
  itens: T[];
};

function categoriaDoGrupo<T>(g: Acumulado<T>): string | undefined {
  if (!g.doAmbiente) return undefined;
  if (g.areas.size !== 1) return undefined;
  const [area] = [...g.areas];
  if (!area) return undefined;
  return labelDoAmbiente(area).label;
}

/**
 * Agrupa QUALQUER coisa que tenha `area` e/ou `ambiente`, pela regra canônica.
 *
 * Genérica de propósito: Projeto Visual, Caderno de Montagem, Ficha Técnica e
 * Folha de Carregamento olham os MESMOS itens sob ângulos diferentes. Se cada
 * um agrupasse do seu jeito, o mesmo evento se organizaria de quatro maneiras
 * — e foi exatamente o que aconteceu até aqui.
 *
 * A ORDEM é a da categoria, não a do alfabeto: "Jardim das oliveiras" ocupa o
 * lugar que Cerimônia ocupava, porque é a mesma hora do dia. Um bloco que
 * reúne várias categorias assume a posição da primeira delas. Sem isso, dar
 * nome ao espaço jogaria o bloco para o fim da folha, e a equipe carregaria o
 * caminhão fora de ordem só porque alguém digitou um nome bonito.
 *
 * Ambiente sem item nenhum não aparece: o projeto mostra o que existe.
 */
export function agruparPorAmbiente<T extends { area?: string; ambiente?: string }>(
  itens: readonly T[],
): GrupoDeAmbiente<T>[] {
  const ordemConhecida = BRIEFING_AREAS.map((a) => a.key);
  const porChave = new Map<string, Acumulado<T>>();

  for (const item of itens) {
    const r = resolverAmbiente(item);
    const ordem = ordemConhecida.indexOf(r.area);
    const existente = porChave.get(r.chave);
    if (existente) {
      existente.itens.push(item);
      existente.areas.add(r.area);
      if (ordem !== -1 && (existente.ordem === -1 || ordem < existente.ordem)) {
        existente.ordem = ordem;
      }
      continue;
    }
    // O rótulo é o da PRIMEIRA ocorrência: entre "Jardim das Oliveiras" e
    // "jardim das oliveiras" o bloco é um só, e mostra a grafia que apareceu
    // primeiro. Reescrever o texto dela não é opção.
    porChave.set(r.chave, {
      key: r.chave,
      label: r.label,
      emoji: r.emoji,
      doAmbiente: r.doAmbiente,
      ordem,
      areas: new Set([r.area]),
      itens: [item],
    });
  }

  return [...porChave.values()]
    .sort((a, b) => {
      if (a.ordem === -1 && b.ordem === -1) return a.label.localeCompare(b.label, "pt-BR");
      if (a.ordem === -1) return 1;
      if (b.ordem === -1) return -1;
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return a.label.localeCompare(b.label, "pt-BR");
    })
    .map((g) => ({
      key: g.key,
      label: g.label,
      emoji: g.emoji,
      categoria: categoriaDoGrupo(g),
      itens: g.itens,
    }));
}

export function montarProjeto(itens: readonly ItemDoProjeto[]): AmbienteDoProjeto[] {
  return agruparPorAmbiente(itens).map((grupo) => {
    const itensDoAmbiente = grupo.itens;
    return {
      ...grupo,
      inclusos: itensDoAmbiente.filter((i) => escopoDoItem(i) === "incluso").length,
      referencias: itensDoAmbiente.filter((i) => escopoDoItem(i) === "referencia").length,
    };
  });
}

/** A foto que representa o item, e se ela é referência ou o contratado. */
export function fotoDoItem(item: ItemDoProjeto): {
  url: string | null;
  ehReferencia: boolean;
} {
  // Mesma precedência do Caderno de Montagem: o contratado manda.
  const contratada = item.contractedPhotoUrl ?? null;
  const referencia = item.referencePhotoUrl ?? null;
  return {
    url: contratada ?? referencia,
    ehReferencia: !contratada && !!referencia,
  };
}
