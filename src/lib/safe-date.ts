import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─────────────────────────────────────────────────────────────────────────────
// CARIMBO DE TEMPO SEGURO — formatar sem derrubar a tela
//
// ── O QUE ACONTECEU ─────────────────────────────────────────────────────────
// O Painel Admin caiu inteiro em produção com "Invalid time value". Não foi
// dado corrompido: `format()` do date-fns LANÇA quando recebe uma data
// inválida, e um `<span>` que lança derruba a árvore inteira até o
// ErrorBoundary. Uma linha de uma linha de uma tabela apagou a página.
//
// `toLocaleDateString()` não lança — devolve a string "Invalid Date". Menos
// grave e mais silencioso, mas igualmente errado de se mostrar a alguém.
//
// ── A REGRA ─────────────────────────────────────────────────────────────────
// Data ausente ou irreconhecível vira "—". NUNCA vira data inventada, nunca
// vira "Invalid Date", e nunca derruba a tela. Data válida é exibida
// exatamente como antes.
//
// ── ONDE USAR CADA COISA ────────────────────────────────────────────────────
// Aqui moram os CARIMBOS DE TEMPO: `_creationTime`, `uploadedAt`, `receivedAt`,
// `trialEndDate` — instantes, em epoch ms ou ISO completo.
//
// Para DATA DO EVENTO e afins ("2026-10-10", "2026-10-10T18:00", vencimento de
// compra) use `event-date.ts`, que ancora ao meio-dia local para o dia não
// recuar por fuso. Os dois módulos existem porque os dois problemas são
// diferentes: aqui o risco é quebrar, lá o risco é mudar de dia.
// ─────────────────────────────────────────────────────────────────────────────

/** O que se mostra quando não há data legível. */
export const SEM_DATA = "—";

/**
 * Epoch ms, ISO ou `datetime-local` → `Date`.
 *
 * @returns `null` para vazio, nulo, NaN, infinito ou texto irreconhecível.
 *          Quem chama decide o que mostrar — nada é inventado aqui.
 */
export function parseTimestamp(valor: number | string | null | undefined): Date | null {
  if (valor === null || valor === undefined) return null;

  if (typeof valor === "number") {
    // NaN e Infinity chegam aqui como "número" e viram Invalid Date adiante.
    if (!Number.isFinite(valor)) return null;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const texto = valor.trim();
  if (texto === "") return null;

  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formata um carimbo de tempo. NUNCA lança.
 *
 * @param valor    epoch ms, ISO, ou ausente.
 * @param pattern  padrão do date-fns. Padrão: só o dia.
 * @param fallback o que mostrar quando não há data legível.
 */
export function formatTimestamp(
  valor: number | string | null | undefined,
  pattern = "dd/MM/yyyy",
  fallback: string = SEM_DATA,
): string {
  const d = parseTimestamp(valor);
  if (!d) return fallback;
  return format(d, pattern, { locale: ptBR });
}

/** Carimbo com hora: "10/10/2026 18:30". */
export function formatTimestampComHora(
  valor: number | string | null | undefined,
  fallback: string = SEM_DATA,
): string {
  return formatTimestamp(valor, "dd/MM/yyyy HH:mm", fallback);
}
