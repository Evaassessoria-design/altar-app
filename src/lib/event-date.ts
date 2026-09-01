// ─────────────────────────────────────────────────────────────────────────────
// DATA DO EVENTO — uma convenção só, para 10/10 nunca virar 09/10.
//
// ── A CAUSA RAIZ ────────────────────────────────────────────────────────────
// `events.date` guarda DUAS formas, porque duas origens gravam nele:
//
//   "2026-10-10"        ← seed e importações (só data)
//   "2026-10-10T18:00"  ← formulário do evento (`datetime-local`)
//
// O JavaScript trata as duas de maneira OPOSTA:
//
//   new Date("2026-10-10")       → meia-noite UTC  → 09/10 21:00 no Brasil ✗
//   new Date("2026-10-10T18:00") → hora LOCAL      → 10/10 18:00 ✓
//
// Por isso o mesmo casamento aparecia como 10/10 na Agenda (que já usava a
// correção) e 09/10 na lista, no detalhe e no PDF. Não era um bug de tela: era
// a ausência de uma convenção.
//
// ── A CONVENÇÃO ─────────────────────────────────────────────────────────────
// Data sem hora é ancorada ao MEIO-DIA LOCAL. Meio-dia está a 12 horas de
// qualquer virada de dia, então nenhum fuso do planeta consegue empurrá-la para
// a véspera ou para o dia seguinte. Data com hora é lida como hora local, que
// já era o comportamento certo.
//
// E o mais importante: NÃO INVENTAMOS HORA. Uma data sem hora é exibida sem
// hora. A tela do evento mostrava "09 de outubro de 2026, 21:00" — as 21:00
// eram puro artefato do fuso, não um horário que alguém tivesse cadastrado.
// ─────────────────────────────────────────────────────────────────────────────

/** `2026-10-10` — data pura, sem hora. */
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-10-10T18:00` (com ou sem segundos), sem fuso declarado. */
const DATA_HORA_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/;

/** O valor guardado traz hora de verdade? */
export function temHora(valor: string | undefined | null): boolean {
  if (!valor) return false;
  return !SO_DATA.test(valor.trim());
}

/**
 * Converte o que está no banco em `Date`, sem deslocar o dia.
 *
 * @returns `null` para valor vazio ou não reconhecido — a tela decide o que
 *          mostrar, em vez de exibir "Invalid Date".
 */
export function parseEventDate(valor: string | undefined | null): Date | null {
  if (!valor) return null;
  const v = valor.trim();

  // Só data: ancora ao meio-dia local. Nenhum fuso vira o dia a partir daí.
  if (SO_DATA.test(v)) {
    const d = new Date(`${v}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Data com hora local: já é interpretada corretamente pelo runtime.
  if (DATA_HORA_LOCAL.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Qualquer outra coisa (ISO com Z, por exemplo) — deixa o runtime resolver.
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `2026-10-10`, para comparar com outras datas sem hora. */
export function toDateKey(valor: string | undefined | null): string | null {
  const d = parseEventDate(valor);
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Hoje como `2026-10-10`, no fuso de quem está usando. */
export function hojeDateKey(agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** Dias inteiros entre duas chaves `AAAA-MM-DD`. Negativo = já passou. */
export function diasAte(dataEvento: string | undefined | null, hoje = hojeDateKey()): number | null {
  const chave = toDateKey(dataEvento);
  if (!chave) return null;
  const de = Date.parse(`${hoje}T12:00:00Z`);
  const ate = Date.parse(`${chave}T12:00:00Z`);
  if (Number.isNaN(de) || Number.isNaN(ate)) return null;
  return Math.round((ate - de) / 86_400_000);
}

// ── Formatação ──────────────────────────────────────────────────────────────
// Centralizada aqui para que nenhuma tela volte a chamar `new Date(event.date)`
// direto e reintroduzir o deslocamento.

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Data do evento por extenso: "10 de outubro de 2026".
 *
 * A hora só entra quando ela existe de verdade no dado guardado.
 */
export function formatEventDateLong(valor: string | undefined | null): string {
  const d = parseEventDate(valor);
  if (!d) return "Data não informada";
  return temHora(valor)
    ? format(d, "dd 'de' MMMM 'de' yyyy', às' HH:mm", { locale: ptBR })
    : format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

/** Data curta: "10/10/2026" (com hora só quando existe). */
export function formatEventDateShort(valor: string | undefined | null): string {
  const d = parseEventDate(valor);
  if (!d) return "—";
  return temHora(valor)
    ? format(d, "dd/MM/yyyy HH:mm", { locale: ptBR })
    : format(d, "dd/MM/yyyy", { locale: ptBR });
}

/** Só o dia, sem hora nunca: "10/10/2026". Para tabelas e PDFs compactos. */
export function formatEventDayOnly(valor: string | undefined | null): string {
  const d = parseEventDate(valor);
  return d ? format(d, "dd/MM/yyyy", { locale: ptBR }) : "—";
}

/** "sábado, 10 de outubro de 2026" — cabeçalho da Agenda do dia. */
export function formatEventWeekday(valor: string | undefined | null): string {
  const d = parseEventDate(valor);
  if (!d) return "Data não informada";
  return format(d, "EEEE',' dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}
