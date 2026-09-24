import {
  agruparPorAmbiente,
  ehObrigacaoDeMontagem,
  type GrupoDeAmbiente,
} from "./decoration-project.ts";
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
  /** "referencia" e "nao_incluso" não são objeto físico. */
  projectScope?: string;
};

export type LinhaDaFolha = ItemDeCarregamento & {
  situacao: AssemblyStatus;
  situacaoLabel: string;
  /** Saiu do galpão e ainda não voltou. */
  emAberto: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// AS PEÇAS DO ACERVO — O SEGUNDO BLOCO DA FOLHA
//
// ── POR QUE ELAS NÃO SÃO ITENS DE MONTAGEM ──────────────────────────────────
// `assemblyItems` é o que se MONTA: "Arranjo baixo branco ×20". A reserva de
// acervo é o que SAI DO GALPÃO: "Vaso âmbar ×60" — as peças de que aqueles
// vinte arranjos são feitos, e que voltam para a prateleira depois.
//
// Fundir os dois numa lista só produziria contagem dupla e, pior, uma lista em
// que ninguém sabe o que conferir: vinte arranjos ou sessenta vasos?
//
// ── E POR QUE ELAS PRECISAVAM ESTAR AQUI ────────────────────────────────────
// A folha perguntava "o que vai no caminhão?" e respondia só metade. A outra
// metade — o número que SAIU e o que VOLTOU — já estava gravada em
// `collectionReservations.saiu` e `.voltou`, e vivia noutra tela. Quem está no
// galpão com a prancheta precisava das duas ao mesmo tempo, e tinha de abrir o
// celular para ver a segunda.
//
// Blocos separados, cabeçalhos diferentes, mesma folha. Planejamento e
// conferência continuam sendo perguntas distintas — e as colunas dizem qual é
// qual.
// ─────────────────────────────────────────────────────────────────────────────

export type PecaDoAcervo = {
  _id: string;
  nome: string;
  unidade?: string;
  /** Quanto foi prometido a este evento. */
  quantidade: number;
  /** Quanto saiu fisicamente. AUSENTE = nada saiu ainda. */
  saiu?: number;
  /** Quanto voltou. AUSENTE = nada voltou ainda. */
  voltou?: number;
};

export type LinhaDoAcervo = PecaDoAcervo & {
  /** Quanto ainda não voltou. `0` quando está tudo resolvido. */
  faltaVoltar: number;
};

/**
 * As peças do acervo, prontas para a folha.
 *
 * `faltaVoltar` é DERIVADO, nunca gravado — a regra é a mesma de
 * `convex/lib/acervo.ts`, e um número guardado ao lado divergiria no primeiro
 * retorno parcial.
 *
 * Reserva sem item resolvido (peça excluída do acervo depois da reserva) é
 * descartada: uma linha sem nome na prancheta não ajuda ninguém a conferir.
 */
export function montarPecasDoAcervo(
  reservas: readonly (PecaDoAcervo | null | undefined)[],
): { linhas: LinhaDoAcervo[]; faltamVoltar: number } {
  const linhas = reservas
    .filter((r): r is PecaDoAcervo => !!r && !!r.nome?.trim())
    .map((r) => ({
      ...r,
      // Só o que SAIU pode faltar voltar. Uma peça que nunca saiu não está
      // pendente de retorno — está pendente de saída, que é outra coisa.
      faltaVoltar: Math.max(0, (r.saiu ?? 0) - (r.voltou ?? 0)),
    }));
  return {
    linhas,
    faltamVoltar: linhas.filter((l) => l.faltaVoltar > 0).length,
  };
}

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
  // ── SÓ ENTRA O QUE É COISA ────────────────────────────────────────────────
  // Uma "referência visual" é uma foto de inspiração; "não incluso" é o que
  // ficou fora do contrato. Nenhum dos dois é caixa para pôr no caminhão.
  // Mandar a equipe procurar no galpão um objeto que nunca existiu é fazer
  // alguém perder a manhã.
  //
  // É a MESMA regra do Caderno de Montagem (`ehObrigacaoDeMontagem`): item sem
  // classificação continua entrando, porque sair exige escolha explícita.
  const fisicos = itens.filter(ehObrigacaoDeMontagem);

  const linhas: LinhaDaFolha[] = fisicos.map((i) => {
    const situacao = effectiveAssemblyStatus(i);
    return {
      ...i,
      situacao,
      situacaoLabel: ASSEMBLY_STATUS_LABEL[situacao],
      emAberto: foraDoGalpao(i),
    };
  });

  const resumo = resumirCarregamento(fisicos);

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
export function resumoDoRetorno(
  folha: FolhaDeCarregamento,
  /** Peças do acervo que saíram e não voltaram inteiras. */
  pecasPendentes = 0,
): string | null {
  const total = folha.naoVoltaram + pecasPendentes;
  if (total === 0) return null;
  return total === 1
    ? "1 item saiu e ainda não voltou"
    : `${total} itens saíram e ainda não voltaram`;
}
