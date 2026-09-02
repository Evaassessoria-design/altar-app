import { ConvexError } from "convex/values";

// ─────────────────────────────────────────────────────────────────────────────
// DATA DE EVENTO — o que pode entrar no banco
//
// ── POR QUE DUAS FORMAS, E POR QUE AS DUAS ESTÃO CERTAS ─────────────────────
// `events.date` recebe de duas origens, e elas querem dizer coisas diferentes:
//
//   "2026-10-10"        ← conversão de lead (`<input type="date">`) e seed.
//                          A cliente marcou o DIA; o horário ainda não existe.
//   "2026-10-10T18:00"  ← formulário do evento (`datetime-local`).
//                          O horário faz parte do evento de verdade.
//
// Guardar "T00:00" no primeiro caso seria INVENTAR uma meia-noite que ninguém
// combinou — e foi exatamente esse tipo de horário fantasma que já apareceu na
// tela do evento como "21:00" por artefato de fuso. Então as duas formas
// continuam válidas, e a leitura (src/lib/event-date.ts) já sabe distinguir.
//
// ── O QUE ESTE MÓDULO IMPEDE ────────────────────────────────────────────────
// Qualquer TERCEIRA forma. Foi uma terceira forma — a concatenação
// "2026-10-10T18:00" + "T12:00:00" — que derrubou o Painel Admin em produção.
// O banco aceitava `v.string()`, então nada barrava.
//
// ISO com fuso ("2026-10-10T18:00:00.000Z") é RECUSADO de propósito: aceitá-lo
// exigiria converter fuso na escrita, e conversão de fuso é justamente o que
// não pode acontecer aqui.
//
// ── NÃO MEXE NO PASSADO ─────────────────────────────────────────────────────
// Isto vale só para escrita nova. Nenhum registro existente é reescrito: os
// leitores continuam tolerando o que já está lá.
// ─────────────────────────────────────────────────────────────────────────────

/** `2026-10-10` — o dia, sem horário. */
const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-10-10T18:00`, com segundos opcionais (que são descartados). */
const DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export type DataDeEventoOk = {
  ok: true;
  /** O valor a gravar — já normalizado. */
  valor: string;
  /** O horário faz parte do evento? */
  temHora: boolean;
};

export type DataDeEventoErro = { ok: false; motivo: string };

/** O calendário aceita este dia? Barra 31/02, 30/02, mês 13. */
function diaExiste(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  );
}

/**
 * Valida e normaliza a data de um evento, SEM tocar em fuso e SEM inventar
 * horário.
 *
 * Normalização é só uma: segundos são descartados (`T18:00:30` → `T18:00`).
 * Evento não tem precisão de segundo, e permitir as duas grafias seria criar
 * mais uma ambiguidade em vez de fechar as que existem.
 */
export function validarDataDeEvento(
  valor: string | undefined | null,
): DataDeEventoOk | DataDeEventoErro {
  if (valor === undefined || valor === null || valor.trim() === "") {
    return { ok: false, motivo: "A data do evento é obrigatória." };
  }

  const v = valor.trim();

  const so = SO_DATA.exec(v);
  if (so) {
    const [, a, m, d] = so;
    if (!diaExiste(+a, +m, +d)) {
      return { ok: false, motivo: `A data ${v} não existe no calendário.` };
    }
    return { ok: true, valor: v, temHora: false };
  }

  const comHora = DATA_HORA.exec(v);
  if (comHora) {
    const [, a, m, d, hh, mm] = comHora;
    if (!diaExiste(+a, +m, +d)) {
      return { ok: false, motivo: `A data ${v} não existe no calendário.` };
    }
    if (+hh > 23 || +mm > 59) {
      return { ok: false, motivo: `O horário ${hh}:${mm} não existe.` };
    }
    return { ok: true, valor: `${a}-${m}-${d}T${hh}:${mm}`, temHora: true };
  }

  return {
    ok: false,
    motivo:
      `Data de evento em formato não suportado: "${v}". ` +
      "Use AAAA-MM-DD (só o dia) ou AAAA-MM-DDTHH:mm (dia e horário). " +
      "Data com fuso declarado não é aceita, para o dia não mudar na conversão.",
  };
}

/**
 * O mesmo, para usar dentro de mutation: devolve o valor a gravar ou recusa a
 * gravação com mensagem que a tela consegue mostrar.
 */
export function normalizarDataDeEvento(valor: string | undefined | null): string {
  const r = validarDataDeEvento(valor);
  if (!r.ok) {
    throw new ConvexError({ code: "DATA_DE_EVENTO_INVALIDA", message: r.motivo });
  }
  return r.valor;
}
