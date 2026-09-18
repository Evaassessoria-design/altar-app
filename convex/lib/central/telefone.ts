// ─────────────────────────────────────────────────────────────────────────────
// TELEFONE — E.164 BRASILEIRO E O NONO DÍGITO
//
// A Central precisa responder "esta pessoa já falou com a gente?". Hoje o
// telefone está guardado como TEXTO LIVRE em dois lugares:
//
//   landingLeads.whatsapp   "(11) 99999-9999", "11999999999", "+55 11 9999-9999"
//   users.phone             mesma bagunça
//
// Comparar string com string não casa nenhum desses formatos entre si. Este
// módulo produz UMA forma canônica (E.164) e, separadamente, o conjunto de
// VARIANTES aceitáveis para busca.
//
// ── POR QUE VARIANTE, E NÃO SÓ CANÔNICO ─────────────────────────────────────
// Desde 2016 os celulares brasileiros têm nove dígitos após o DDD. Cadastros
// antigos guardaram oito. O MESMO aparelho aparece como:
//
//   +5511987654321   (nove dígitos — o que o WhatsApp entrega hoje)
//   +551187654321    (oito  dígitos — o que a pessoa digitou em 2019)
//
// Tratar os dois como números diferentes cria contato duplicado. Tratar
// qualquer coisa parecida como igual mostra a conversa de um cliente na ficha
// de outro. A saída é: canônico para GRAVAR, variantes para BUSCAR, e o
// resultado da busca só vira vínculo quando é ÚNICO (ver `casarContato`).
//
// ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
// Não adivinha país. Número que não é reconhecidamente brasileiro e não veio
// em E.164 explícito devolve `null` — e `null` NUNCA vira vínculo.
// ─────────────────────────────────────────────────────────────────────────────

/** Menor e maior DDD válidos no Brasil. */
const DDD_MIN = 11;
const DDD_MAX = 99;

/** Primeiro dígito de um celular brasileiro de nove dígitos. */
const PREFIXO_CELULAR = "9";

/** Primeiros dígitos que, em oito dígitos, indicam celular antigo. */
const PREFIXOS_CELULAR_ANTIGO = ["6", "7", "8", "9"];

function somenteDigitos(bruto: string): string {
  return bruto.replace(/\D+/g, "");
}

function dddValido(ddd: string): boolean {
  const n = Number(ddd);
  return Number.isInteger(n) && n >= DDD_MIN && n <= DDD_MAX;
}

/**
 * Forma canônica "+55DDNNNNNNNNN" (ou oito dígitos, quando é o que existe).
 *
 * Devolve `null` para qualquer entrada que não seja reconhecidamente um
 * telefone brasileiro. `null` é resposta legítima e significa "não sei" —
 * jamais "não é a mesma pessoa".
 */
export function normalizarE164(bruto?: string | null): string | null {
  if (!bruto) return null;

  const limpo = bruto.trim();
  let d = somenteDigitos(limpo);
  if (!d) return null;

  // ── DDI EXPLÍCITO ─────────────────────────────────────────────────────────
  // "+" ou "00" na frente significam que a pessoa JÁ escreveu o país. Nesse
  // caso o país tem de ser 55, ponto final.
  //
  // Sem esta trava, "+1 415 555 2671" (Estados Unidos) tem onze dígitos e é
  // indistinguível de um celular brasileiro sem DDI — viraria
  // "+5514155552671", um número de Bauru que pertence a outra pessoa. A
  // Central mostraria a conversa de um desconhecido dentro da ficha dela.
  const ddiExplicito = limpo.startsWith("+") || d.startsWith("00");
  if (d.startsWith("00")) d = d.slice(2);

  if (ddiExplicito) {
    if (!d.startsWith("55")) return null;
    if (d.length !== 13 && d.length !== 12) return null;
    return dddValido(d.slice(2, 4)) ? `+${d}` : null;
  }

  // Zero de operadora antes do DDD ("0 11 99999-9999").
  if ((d.length === 11 || d.length === 12) && d.startsWith("0")) d = d.slice(1);

  // DDI 55 digitado sem "+".
  if ((d.length === 13 || d.length === 12) && d.startsWith("55")) {
    return dddValido(d.slice(2, 4)) ? `+${d}` : null;
  }

  // DDD + número, sem DDI.
  if (d.length === 11 || d.length === 10) {
    return dddValido(d.slice(0, 2)) ? `+55${d}` : null;
  }

  return null;
}

/** Parte nacional (sem "+55DD") de um canônico já validado. */
function parteNacional(e164: string): { ddd: string; numero: string } | null {
  if (!e164.startsWith("+55")) return null;
  // DDD (2) + número (9 ou 8).
  const d = e164.slice(3);
  if (d.length !== 11 && d.length !== 10) return null;
  return { ddd: d.slice(0, 2), numero: d.slice(2) };
}

/**
 * Todas as formas E.164 sob as quais ESTE MESMO aparelho pode ter sido
 * gravado. Sempre inclui o próprio canônico, e sempre em ordem estável.
 */
export function variantesDeBusca(e164?: string | null): string[] {
  if (!e164) return [];
  const partes = parteNacional(e164);
  if (!partes) return [e164];

  const { ddd, numero } = partes;
  const variantes = new Set<string>([e164]);

  // Nove dígitos começando em 9 → também existe a forma de oito.
  if (numero.length === 9 && numero.startsWith(PREFIXO_CELULAR)) {
    variantes.add(`+55${ddd}${numero.slice(1)}`);
  }

  // Oito dígitos de celular antigo → também existe a forma de nove.
  if (numero.length === 8 && PREFIXOS_CELULAR_ANTIGO.includes(numero[0])) {
    variantes.add(`+55${ddd}${PREFIXO_CELULAR}${numero}`);
  }

  return [...variantes];
}

/**
 * Os dois textos são o mesmo telefone?
 *
 * Entrada não normalizável devolve `false` — "não sei" nunca vira "é igual".
 */
export function mesmoNumero(a?: string | null, b?: string | null): boolean {
  const ca = normalizarE164(a);
  const cb = normalizarE164(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;

  const va = new Set(variantesDeBusca(ca));
  return variantesDeBusca(cb).some((v) => va.has(v));
}

/**
 * Escolhe UM dono entre os candidatos encontrados.
 *
 * Regra dura da Central: só vira vínculo automático quando o casamento é
 * ÚNICO. Dois candidatos significam ambiguidade real — e mostrar a conversa
 * de um cliente na ficha de outro é pior do que não mostrar nada. Nesse caso
 * a decisão vai para um humano, com a lista inteira à vista.
 */
export function casarContato<T>(
  candidatos: readonly T[],
): { tipo: "unico"; escolhido: T } | { tipo: "nenhum" } | { tipo: "ambiguo"; candidatos: readonly T[] } {
  if (candidatos.length === 0) return { tipo: "nenhum" };
  if (candidatos.length === 1) return { tipo: "unico", escolhido: candidatos[0] };
  return { tipo: "ambiguo", candidatos };
}

/**
 * Telefone parcialmente oculto, para o painel executivo do Escritório 3D.
 *
 * O 3D é visão de comando: precisa saber QUANTAS conversas existem, não com
 * quem. O número inteiro só sai no endpoint de conversa.
 */
export function mascarar(e164?: string | null): string {
  const canonico = normalizarE164(e164);
  if (!canonico) return "—";
  const partes = parteNacional(canonico);
  if (!partes) return "—";
  const { ddd, numero } = partes;
  const fim = numero.slice(-4);
  return `+55 ${ddd} ${"*".repeat(Math.max(0, numero.length - 4))}${fim}`;
}

/** Exibição amigável no Painel Admin, onde o número completo é legítimo. */
export function formatarBr(e164?: string | null): string {
  const canonico = normalizarE164(e164);
  if (!canonico) return e164?.trim() || "—";
  const partes = parteNacional(canonico);
  if (!partes) return canonico;
  const { ddd, numero } = partes;
  const corte = numero.length === 9 ? 5 : 4;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}
