import { parseEventDate, temHora } from "./event-date.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ÚLTIMO CONTATO COM A CLIENTE
//
// `lastInteraction` responde "quando eu falei com ela pela última vez" — e é
// a única coisa que sustenta a frase "este lead está parado". Nada a ver com
// `updatedAt`, que é "alguém mexeu neste registro": corrigir um acento no
// nome da noiva não é conversa.
//
// ── DUAS FORMAS NO BANCO, UMA LEITURA ───────────────────────────────────────
// A ação "Registrar contato" grava um INSTANTE em ISO ("2026-09-02T17:32:10Z").
// Registros anteriores podem ter só a data ("2026-08-20"), vindos de
// importação ou do tempo em que nenhuma tela gravava o campo.
//
// As duas são lidas por `parseEventDate` (src/lib/event-date.ts), que ancora
// data-sem-hora ao MEIO-DIA LOCAL. É o que impede o bug de dia anterior:
// `new Date("2026-08-20")` é meia-noite UTC, ou seja 19/08 às 21:00 no Brasil.
//
// ── E NÃO INVENTAMOS HORA ───────────────────────────────────────────────────
// Valor que só tinha data é exibido só com data. Escrever "20/08 às 12:00"
// seria mostrar como horário registrado uma âncora técnica que ninguém digitou.
// ─────────────────────────────────────────────────────────────────────────────

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** As duas datas caem no mesmo dia civil de quem está lendo? */
function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * "Hoje às 14:32", "Ontem às 18:10", "12/03 às 09:00", "12/03/2025".
 *
 * `null` quando não há contato registrado — e a tela não desenha nada, em vez
 * de escrever "nunca", que seria falso para todo lead anterior a este campo.
 *
 * O horário sai no fuso de QUEM LÊ: o instante é gravado em UTC pelo servidor
 * e convertido aqui pelo navegador, então "hoje às 22:00" em Brasília não
 * vira "amanhã" para ninguém.
 */
export function descreverUltimoContato(
  valor: string | undefined | null,
  agora: Date = new Date(),
): string | null {
  const quando = parseEventDate(valor);
  if (!quando) return null;

  const hora = temHora(valor) ? ` às ${doisDigitos(quando.getHours())}:${doisDigitos(quando.getMinutes())}` : "";

  if (mesmoDia(quando, agora)) return `Hoje${hora}`;

  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (mesmoDia(quando, ontem)) return `Ontem${hora}`;

  const dia = `${doisDigitos(quando.getDate())}/${doisDigitos(quando.getMonth() + 1)}`;
  const ano = quando.getFullYear() === agora.getFullYear() ? "" : `/${quando.getFullYear()}`;
  return `${dia}${ano}${hora}`;
}

/**
 * Dias inteiros desde o último contato, para a tela avisar que está esfriando.
 *
 * Conta DIAS CIVIS, não períodos de 24 horas: uma conversa ontem às 23h e
 * outra hoje às 1h são "1 dia" de diferença, e não "0". É a mesma leitura que
 * a decoradora faz olhando o calendário.
 *
 * `null` sem contato registrado. Nunca negativo: relógio adiantado vira 0.
 */
export function diasDesdeContato(
  valor: string | undefined | null,
  agora: Date = new Date(),
): number | null {
  const quando = parseEventDate(valor);
  if (!quando) return null;
  const soDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((soDia(agora) - soDia(quando)) / 86_400_000);
  return dias < 0 ? 0 : dias;
}
