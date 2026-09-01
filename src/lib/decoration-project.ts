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

/**
 * Escopo efetivo de um item.
 *
 * Ausente = `null`, e a tela NÃO exibe selo. Item antigo não pode virar
 * "contratado" por omissão — seria transformar cadastro incompleto em promessa.
 */
export function escopoDoItem(item: { projectScope?: string }): ProjectScope | null {
  const meta = scopeMeta(item.projectScope);
  return meta ? meta.value : null;
}

/** Uma referência estética nunca é obrigação de montagem. */
export function ehObrigacaoDeMontagem(item: { projectScope?: string }): boolean {
  const escopo = escopoDoItem(item);
  // Sem classificação, o item segue o comportamento antigo: entra na operação.
  // Só `referencia` e `nao_incluso` saem — e ambos exigem escolha explícita.
  return escopo !== "referencia" && escopo !== "nao_incluso";
}

/**
 * Agrupa os itens por ambiente, na ordem das áreas conhecidas, com os
 * ambientes personalizados no fim.
 *
 * Ambiente sem item nenhum não aparece: o projeto mostra o que existe.
 */
export function montarProjeto(itens: readonly ItemDoProjeto[]): AmbienteDoProjeto[] {
  const porArea = new Map<string, ItemDoProjeto[]>();
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
    const itensDoAmbiente = porArea.get(key)!;
    const { label, emoji } = labelDoAmbiente(key);
    return {
      key,
      label,
      emoji,
      itens: itensDoAmbiente,
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
