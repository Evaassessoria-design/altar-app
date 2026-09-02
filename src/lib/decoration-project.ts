import { BRIEFING_AREAS } from "./briefing-areas.ts";
import { scopeMeta, type ProjectScope } from "./photo-scope.ts";

// ─────────────────────────────────────────────────────────────────────────────
// PROJETO DE DECORAÇÃO
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

/**
 * Agrupa os itens por ambiente, na ordem das áreas conhecidas, com os
 * ambientes personalizados no fim.
 *
 * Ambiente sem item nenhum não aparece: o projeto mostra o que existe.
 */
export type GrupoDeAmbiente<T> = {
  key: string;
  label: string;
  emoji?: string;
  itens: T[];
};

/**
 * Agrupa QUALQUER coisa que tenha `area` por ambiente, na ordem das áreas
 * conhecidas, com os personalizados no fim.
 *
 * Genérica de propósito: o Projeto de Decoração e a Folha de Carregamento
 * olham os MESMOS itens sob ângulos diferentes. Se cada um tivesse a própria
 * ordenação, o mesmo evento apareceria com os ambientes fora de ordem entre
 * uma tela e a outra — e "Mesa do bolo" viria antes de "Cerimônia" num lugar
 * e depois no outro, sem que ninguém entendesse por quê.
 */
export function agruparPorAmbiente<T extends { area: string }>(
  itens: readonly T[],
): GrupoDeAmbiente<T>[] {
  const porArea = new Map<string, T[]>();
  for (const item of itens) {
    const lista = porArea.get(item.area) ?? [];
    lista.push(item);
    porArea.set(item.area, lista);
  }

  const ordemConhecida = BRIEFING_AREAS.map((a) => a.key);
  const chaves = [...porArea.keys()].sort((a, b) => {
    const ia = ordemConhecida.indexOf(a);
    const ib = ordemConhecida.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "pt-BR");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return chaves.map((key) => {
    const { label, emoji } = labelDoAmbiente(key);
    return { key, label, emoji, itens: porArea.get(key)! };
  });
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
