// ─────────────────────────────────────────────────────────────────────────────
// TIPO DE EVENTO — O VALOR GRAVADO E O QUE SE MOSTRA
//
// ── O DEFEITO QUE ESTE MÓDULO EXISTE PARA FECHAR ────────────────────────────
// `events.type` guarda um slug em inglês: "wedding", "debutante", "baptism".
// A tela sempre traduziu — mas cada tela com a SUA cópia do mapa. Havia cinco:
// o seletor, a lista de eventos, o detalhe do evento, o PDF do relatório e o
// funil. O módulo canônico (`src/lib/event-types.ts`) dizia no cabeçalho que a
// duplicação tinha acabado, e a função de rótulo dele não tinha um único uso
// em produção.
//
// Cópia que ninguém chama envelhece sem avisar. Foi o que aconteceu quando a
// proposta comercial nasceu: ela copia `event.type` do evento, e ninguém
// traduziu — a cliente recebia um PDF dizendo **"wedding"**, sob o timbre do
// estúdio.
//
// ── POR QUE AQUI, E NÃO EM `src/lib` ────────────────────────────────────────
// Porque o servidor também precisa. `convex/` não importa de `src/`, então um
// mapa que só existisse lá seria inalcançável justamente na função que monta o
// documento da cliente. É a mesma razão de `abreviarUnidade` morar em
// `convex/lib/materiais.ts` — e nasceu do mesmo defeito: slug na tela.
//
// ── A REGRA DO DESCONHECIDO ─────────────────────────────────────────────────
// Valor fora da lista VOLTA COMO VEIO. `leads.eventType` é texto livre e já
// tem "Casamento" escrito à mão em contas reais; forçá-lo para "—" apagaria
// informação verdadeira. Slug desconhecido aparecer estranho é melhor do que
// ser exibido com confiança como outra coisa.
// ─────────────────────────────────────────────────────────────────────────────

/** Os valores gravados no banco. Não mudam: eventos antigos dependem deles. */
export const TIPOS_DE_EVENTO = [
  "wedding",
  "corporate",
  "birthday",
  "debutante",
  "baptism",
  "other",
] as const;

export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

/** Rótulos na ordem em que aparecem no seletor. */
export const EVENT_TYPES: readonly { value: TipoDeEvento; label: string }[] = [
  { value: "wedding", label: "Casamento" },
  { value: "birthday", label: "Aniversário" },
  { value: "debutante", label: "Debutante" },
  { value: "corporate", label: "Corporativo" },
  { value: "baptism", label: "Batizado" },
  { value: "other", label: "Outro" },
] as const;

/** O valor é um tipo de evento conhecido? Usado onde não há zod (onboarding). */
export function ehTipoDeEventoValido(valor: unknown): valor is TipoDeEvento {
  return typeof valor === "string" && (TIPOS_DE_EVENTO as readonly string[]).includes(valor);
}

/**
 * O rótulo legível de um tipo já gravado.
 *
 * Ausente devolve `undefined` — quem exibe decide entre "—", omitir a linha ou
 * não desenhar o bloco. Devolver "—" daqui obrigaria o documento da cliente a
 * imprimir um travessão onde a decoradora escolheu não dizer nada.
 */
export function rotuloDoTipoDeEvento(valor: string | undefined): string | undefined {
  if (!valor?.trim()) return undefined;
  return EVENT_TYPES.find((t) => t.value === valor)?.label ?? valor;
}
