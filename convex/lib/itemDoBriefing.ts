import { v } from "convex/values";

// ─────────────────────────────────────────────────────────────────────────────
// O ITEM DE MONTAGEM, VISTO DO BRIEFING
//
// O briefing foi reorganizado em blocos (Altar, Entrada e corredor, Mesas de
// convidados, Bar…). Cada bloco tem itens — o genuflexório, o tapete do
// cantinho das crianças, o móvel do bar. Esses itens NÃO são um cadastro novo:
// são `assemblyItems`, a mesma linha que o Caderno de Montagem, a Folha de
// Carregamento, a Ficha Técnica e o Projeto Visual já leem.
//
// O que faltava no item para o briefing perguntar o que precisa perguntar:
//
//   bloco               → em que bloco do briefing ele foi cadastrado
//   situacao            → a definir / em avaliação / aprovado / contratado /
//                         não se aplica
//   origem              → acervo próprio / locadora / espaço / cliente /
//                         a definir — de onde a peça vem, e por isso se a
//                         equipe a carrega
//   corAcabamento,
//   medidas, posicao,
//   responsavelMontagem → o que a conferência de mobiliário mostra
//   tipoFlor            → natural ou permanente
//   reaproveitamento    → a MESMA peça usada num segundo ambiente
//
// Tudo opcional, sem backfill. AUSENTE significa o que o item sempre
// significou: um item antigo continua aparecendo, entrando no caderno e no
// caminhão exatamente como antes.
// ─────────────────────────────────────────────────────────────────────────────

export const SITUACOES = ["a_definir", "em_avaliacao", "aprovado", "contratado", "nao_se_aplica"] as const;
export type SituacaoDoItem = (typeof SITUACOES)[number];

export const situacaoDoItem = v.union(
  v.literal("a_definir"),
  v.literal("em_avaliacao"),
  v.literal("aprovado"),
  v.literal("contratado"),
  v.literal("nao_se_aplica"),
);

export const ROTULO_DA_SITUACAO: Record<SituacaoDoItem, string> = {
  a_definir: "A definir",
  em_avaliacao: "Em avaliação",
  aprovado: "Aprovado",
  contratado: "Contratado",
  nao_se_aplica: "Não se aplica",
};

export const ORIGENS = ["acervo", "locadora", "espaco", "cliente", "a_definir"] as const;
export type OrigemDoItem = (typeof ORIGENS)[number];

export const origemDoItem = v.union(
  v.literal("acervo"),
  v.literal("locadora"),
  v.literal("espaco"),
  v.literal("cliente"),
  v.literal("a_definir"),
);

export const ROTULO_DA_ORIGEM: Record<OrigemDoItem, string> = {
  acervo: "Acervo próprio",
  locadora: "Locadora",
  espaco: "Do espaço",
  cliente: "Da cliente",
  a_definir: "A definir",
};

export const tipoDeFlor = v.union(v.literal("natural"), v.literal("permanente"));

/**
 * A mesma peça física num segundo ambiente — as cadeiras da cerimônia que vão
 * para a festa. NÃO é outra peça: a quantidade física é a do item, uma vez só.
 */
export const reaproveitamento = v.object({
  ambiente: v.string(),
  /** "21h", "depois do cortejo". Texto livre. */
  horario: v.optional(v.string()),
  /** Quem faz a transferência. */
  responsavel: v.optional(v.string()),
});

/** Campos novos, para `create`/`createMany` (ausente = não informado). */
export const camposDoBriefingNoItem = {
  bloco: v.optional(v.string()),
  situacao: v.optional(situacaoDoItem),
  origem: v.optional(origemDoItem),
  corAcabamento: v.optional(v.string()),
  medidas: v.optional(v.string()),
  posicao: v.optional(v.string()),
  responsavelMontagem: v.optional(v.string()),
  tipoFlor: v.optional(tipoDeFlor),
  reaproveitamento: v.optional(reaproveitamento),
} as const;

/** Os mesmos, para `update`: `null` limpa (ver `lib/limparCampos.ts`). */
export const camposDoBriefingNoItemEditaveis = {
  bloco: v.optional(v.union(v.string(), v.null())),
  situacao: v.optional(v.union(situacaoDoItem, v.null())),
  origem: v.optional(v.union(origemDoItem, v.null())),
  corAcabamento: v.optional(v.union(v.string(), v.null())),
  medidas: v.optional(v.union(v.string(), v.null())),
  posicao: v.optional(v.union(v.string(), v.null())),
  responsavelMontagem: v.optional(v.union(v.string(), v.null())),
  tipoFlor: v.optional(v.union(tipoDeFlor, v.null())),
  reaproveitamento: v.optional(v.union(reaproveitamento, v.null())),
} as const;

/**
 * A equipe CARREGA esta peça?
 *
 * Só o que sai do galpão vai no caminhão. Peça do espaço já está lá; peça da
 * cliente chega com ela; a locadora entrega no local. Item sem origem
 * informada segue a regra de sempre — entra —, porque esconder o item antigo
 * faria a equipe chegar sem ele.
 */
export function equipeCarrega(item: { origem?: string }): boolean {
  return item.origem !== "espaco" && item.origem !== "cliente" && item.origem !== "locadora";
}
