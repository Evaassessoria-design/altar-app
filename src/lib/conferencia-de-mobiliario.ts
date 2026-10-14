import { blocosDeMobiliario } from "./briefing-areas.ts";
import { agruparPorAmbiente, type GrupoDeAmbiente } from "./decoration-project.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA DE MOBILIÁRIO — UMA LEITURA, NÃO UM CADASTRO
//
// A aba Mobiliário passou a mostrar os móveis e apoios do evento INTEIRO:
// cadeiras da cerimônia, mesas da festa, aparadores, bar, lounge, mesa do
// bolo. Eles continuam cadastrados no bloco onde nasceram — esta é só a
// visão consolidada deles. Cadastrar "Cadeiras" de novo aqui faria a Folha
// de Carregamento pedir o dobro.
//
// ── A PEÇA QUE MUDA DE AMBIENTE ─────────────────────────────────────────────
// As cadeiras da cerimônia que vão para a festa são UMA linha, com
// `reaproveitamento`. A contagem física é a do item, uma vez; o segundo
// ambiente aparece como transferência, com horário e responsável.
// ─────────────────────────────────────────────────────────────────────────────

export type ItemDeMobiliario = {
  _id: string;
  area: string;
  name: string;
  bloco?: string;
  ambiente?: string;
  quantity?: number;
  unit?: string;
  situacao?: string;
  reaproveitamento?: { ambiente: string; horario?: string; responsavel?: string };
};

/** O item entra na conferência? Bloco de mobiliário, ou cadastrado na própria aba. */
export function ehMobiliario(item: { area: string; bloco?: string }, blocos = blocosDeMobiliario()): boolean {
  return item.area === "furniture" || (!!item.bloco && blocos.has(item.bloco));
}

export type ConferenciaDeMobiliario<T> = {
  grupos: GrupoDeAmbiente<T>[];
  itens: number;
  /** Peças físicas: soma das quantidades, cada item UMA vez. */
  pecas: number;
  /** Itens sem quantidade informada — a soma acima não os conta. */
  semQuantidade: number;
  reaproveitados: number;
};

export function montarConferenciaDeMobiliario<T extends ItemDeMobiliario>(
  todos: readonly T[],
): ConferenciaDeMobiliario<T> {
  const blocos = blocosDeMobiliario();
  // "Não se aplica" fica fora da conferência: foi registrado e descartado.
  const itens = todos.filter((i) => ehMobiliario(i, blocos) && i.situacao !== "nao_se_aplica");
  return {
    grupos: agruparPorAmbiente(itens),
    itens: itens.length,
    pecas: itens.reduce((s, i) => s + (i.quantity && i.quantity > 0 ? i.quantity : 0), 0),
    semQuantidade: itens.filter((i) => !i.quantity || i.quantity <= 0).length,
    reaproveitados: itens.filter((i) => !!i.reaproveitamento?.ambiente).length,
  };
}
