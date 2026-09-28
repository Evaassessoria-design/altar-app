import { quantidadeLimpa } from "./fichaTecnica";
import { quantidadeFisicaValida } from "./acervo";

// ═════════════════════════════════════════════════════════════════════════════
// A CONDIÇÃO DO ACERVO — "temos 40 cadeiras" não diz quantas podem sair
//
// ── CONTADORES, NÃO PEÇAS ───────────────────────────────────────────────────
// O acervo do ALTAR é contado por QUANTIDADE — não há peça numerada. Então a
// condição também é quantidade: quantas das 40 estão para limpar, quantas em
// reparo. Registro por peça exigiria identidade de peça (ver
// docs/jornada-evento/qr-futuro.md).
//
// ── "PRONTO" NUNCA É GRAVADO ────────────────────────────────────────────────
// pronto = total − (limpeza + reparo + indisponível + conferência). Gravar
// "pronto" seria um segundo número para a mesma coisa, e os dois divergiriam
// na primeira peça que voltasse do conserto — a mesma regra que fez
// `disponivel` nunca existir no schema.
//
// ── REPARO É O `emManutencao` QUE JÁ EXISTIA ────────────────────────────────
// Não se cria "precisa de reparo" ao lado de "em manutenção": seriam dois
// estados para a mesma peça quebrada, e a decoradora teria de escolher entre
// eles sem saber a diferença.
//
// ── NADA SAI SEM RASTRO ─────────────────────────────────────────────────────
// Toda mudança passa por `moverCondicao` e vira uma linha no histórico de
// ajustes, com a condição anterior e a nova (`convex/acervo.ts`).
// ═════════════════════════════════════════════════════════════════════════════

export const CONDICOES = ["pronto", "limpeza", "reparo", "indisponivel", "conferencia"] as const;
export type Condicao = (typeof CONDICOES)[number];

/** As condições que tiram a peça de uso — todas menos "pronto". */
export const CONDICOES_FORA_DE_USO = ["limpeza", "reparo", "indisponivel", "conferencia"] as const;
export type CondicaoForaDeUso = (typeof CONDICOES_FORA_DE_USO)[number];

export const ROTULO_DA_CONDICAO: Record<Condicao, string> = {
  pronto: "Pronto para uso",
  limpeza: "Precisa limpar",
  reparo: "Precisa de reparo",
  indisponivel: "Danificado / indisponível",
  conferencia: "Em conferência",
};

/** Rótulo curto, para contagem em lista ("4 limpeza"). */
export const ROTULO_CURTO_DA_CONDICAO: Record<Condicao, string> = {
  pronto: "prontas",
  limpeza: "para limpar",
  reparo: "em reparo",
  indisponivel: "indisponíveis",
  conferencia: "em conferência",
};

/** Onde cada condição mora em `collectionItems`. Ausente = 0. */
export const CAMPO_DA_CONDICAO = {
  limpeza: "emLimpeza",
  reparo: "emManutencao",
  indisponivel: "indisponivel",
  conferencia: "emConferencia",
} as const satisfies Record<CondicaoForaDeUso, string>;

export type ItemComCondicoes = {
  quantidadeTotal: number;
  emLimpeza?: number;
  emManutencao?: number;
  indisponivel?: number;
  emConferencia?: number;
};

export type CondicoesDoItem = Record<Condicao, number> & { foraDeUso: number };

const n = (v: number | undefined) => quantidadeLimpa(Math.max(0, v ?? 0));

export function condicoesDoItem(item: ItemComCondicoes): CondicoesDoItem {
  const limpeza = n(item.emLimpeza);
  const reparo = n(item.emManutencao);
  const indisponivel = n(item.indisponivel);
  const conferencia = n(item.emConferencia);
  const foraDeUso = quantidadeLimpa(limpeza + reparo + indisponivel + conferencia);
  return {
    pronto: quantidadeLimpa(Math.max(0, n(item.quantidadeTotal) - foraDeUso)),
    limpeza,
    reparo,
    indisponivel,
    conferencia,
    foraDeUso,
  };
}

/** Quantas peças do item NÃO podem sair — o que a disponibilidade desconta. */
export function pecasForaDeUso(item: ItemComCondicoes): number {
  return condicoesDoItem(item).foraDeUso;
}

/** Para onde a peça pode ir: uma condição, ou "baixa" (sai do acervo). */
export type Destino = Condicao | "baixa";

export type MovimentoOk = {
  ok: true;
  /** Os campos de `collectionItems` a gravar. `undefined` = volta a ausente. */
  patch: Partial<Record<(typeof CAMPO_DA_CONDICAO)[CondicaoForaDeUso] | "quantidadeTotal", number | undefined>>;
  /** Quantas peças mudaram de condição (já limpa e validada). */
  quantidade: number;
  /** O que moveu o TOTAL: zero, exceto na baixa. */
  delta: number;
  quantidadeDepois: number;
  antes: CondicoesDoItem;
  depois: CondicoesDoItem;
};
export type MovimentoErro = { ok: false; motivo: string };

export function moverCondicao(entrada: {
  item: ItemComCondicoes;
  de: Condicao;
  para: Destino;
  quantidade: number;
  unidade: string;
}): MovimentoOk | MovimentoErro {
  const { item, de, para } = entrada;
  if (de === para) return { ok: false, motivo: "A condição nova é igual à atual." };
  if (!Number.isFinite(entrada.quantidade)) return { ok: false, motivo: "Informe quantas peças." };
  const quantidade = quantidadeLimpa(entrada.quantidade);
  if (quantidade === 0 || !quantidadeFisicaValida(quantidade, entrada.unidade)) {
    return { ok: false, motivo: `Quantidade inválida para a unidade "${entrada.unidade}".` };
  }

  const antes = condicoesDoItem(item);
  if (quantidade > antes[de]) {
    return {
      ok: false,
      motivo:
        antes[de] === 0
          ? `Nenhuma peça está em "${ROTULO_DA_CONDICAO[de]}".`
          : `Só ${antes[de]} estão em "${ROTULO_DA_CONDICAO[de]}".`,
    };
  }

  const patch: MovimentoOk["patch"] = {};
  const gravar = (c: CondicaoForaDeUso, valor: number) => {
    // Zero volta a AUSENTE: o schema diz que ausente é zero, e gravar 0
    // seria escrever o padrão no banco.
    patch[CAMPO_DA_CONDICAO[c]] = valor > 0 ? valor : undefined;
  };
  if (de !== "pronto") gravar(de, quantidadeLimpa(antes[de] - quantidade));
  if (para !== "pronto" && para !== "baixa") gravar(para, quantidadeLimpa(antes[para] + quantidade));

  let delta = 0;
  let quantidadeDepois = n(item.quantidadeTotal);
  if (para === "baixa") {
    delta = quantidadeLimpa(-quantidade);
    quantidadeDepois = quantidadeLimpa(quantidadeDepois - quantidade);
    patch.quantidadeTotal = quantidadeDepois;
  }

  const depois = condicoesDoItem({ ...item, ...patch, quantidadeTotal: quantidadeDepois });
  return { ok: true, patch, quantidade, delta, quantidadeDepois, antes, depois };
}
