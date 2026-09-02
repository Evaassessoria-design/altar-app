import { agruparPorAmbiente, type GrupoDeAmbiente } from "./decoration-project.ts";
import {
  ASSEMBLY_STATUS_LABEL,
  effectiveAssemblyStatus,
  foraDoGalpao,
  resumirCarregamento,
  type AssemblyStatus,
} from "@/convex/lib/assemblyStatus.ts";

// ─────────────────────────────────────────────────────────────────────────────
// FOLHA DE CARREGAMENTO
//
// ── CADERNO ≠ CARREGAMENTO ──────────────────────────────────────────────────
// O Caderno de Montagem responde "como este projeto é montado": referências,
// composição, observações de execução. A Folha de Carregamento responde outra
// coisa, num outro momento e para outra pessoa:
//
//   "o que entra no caminhão, e o que voltou?"
//
// Quem usa está no galpão, de prancheta ou celular, conferindo caixa. Por isso
// aqui não há foto, não há referência estética e — regra dura — NÃO HÁ VALOR.
// Uma folha de logística com preço na mão de quem carrega é um vazamento
// comercial esperando acontecer.
//
// ── O AGRUPAMENTO É O MESMO DO PROJETO ──────────────────────────────────────
// Usa `agruparPorAmbiente`, a mesma função do Projeto de Decoração. Se cada
// tela ordenasse do seu jeito, "Mesa do bolo" viria antes de "Cerimônia" num
// lugar e depois no outro, e ninguém entenderia por quê.
// ─────────────────────────────────────────────────────────────────────────────

export type ItemDeCarregamento = {
  _id: string;
  area: string;
  name: string;
  quantity?: number;
  unit?: string;
  ambiente?: string;
  operationalStatus?: string;
};

export type LinhaDaFolha = ItemDeCarregamento & {
  situacao: AssemblyStatus;
  situacaoLabel: string;
  /** Saiu do galpão e ainda não voltou. */
  emAberto: boolean;
};

export type FolhaDeCarregamento = {
  ambientes: GrupoDeAmbiente<LinhaDaFolha>[];
  total: number;
  pendentes: number;
  /** Itens que saíram e não voltaram — a pergunta do dia seguinte. */
  naoVoltaram: number;
};

/** Quantidade legível: "120 un", "1", "8 arranjos". */
export function quantidadeTexto(item: ItemDeCarregamento): string {
  if (item.quantity === undefined) return "—";
  return item.unit?.trim() ? `${item.quantity} ${item.unit.trim()}` : String(item.quantity);
}

/**
 * A folha inteira, agrupada por ambiente.
 *
 * Item sem ambiente cadastrado NÃO é escondido: cai no grupo da área dele
 * como qualquer outro. Registro antigo continua aparecendo — a folha existe
 * para carregar o caminhão, não para cobrar cadastro.
 */
export function montarFolhaDeCarregamento(
  itens: readonly ItemDeCarregamento[],
): FolhaDeCarregamento {
  const linhas: LinhaDaFolha[] = itens.map((i) => {
    const situacao = effectiveAssemblyStatus(i);
    return {
      ...i,
      situacao,
      situacaoLabel: ASSEMBLY_STATUS_LABEL[situacao],
      emAberto: foraDoGalpao(i),
    };
  });

  const resumo = resumirCarregamento(itens);

  return {
    ambientes: agruparPorAmbiente(linhas),
    total: resumo.total,
    pendentes: resumo.pendentes,
    naoVoltaram: resumo.foraDoGalpao,
  };
}

/**
 * Frase do que ficou em aberto depois do evento.
 *
 * `null` quando não há nada pendente — o silêncio é a boa notícia, e inventar
 * um "0 itens em aberto" só ocuparia espaço.
 */
export function resumoDoRetorno(folha: FolhaDeCarregamento): string | null {
  if (folha.naoVoltaram === 0) return null;
  return folha.naoVoltaram === 1
    ? "1 item saiu e ainda não voltou"
    : `${folha.naoVoltaram} itens saíram e ainda não voltaram`;
}
