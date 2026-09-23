// ─────────────────────────────────────────────────────────────────────────────
// QUANTAS PESSOAS — UM NÚMERO GRAVADO EM TRÊS FORMATOS
//
// `leads.guestCount` é número. `briefings.guestCount` é TEXTO LIVRE, porque no
// briefing a resposta honesta muitas vezes é "entre 150 e 180" ou "180
// confirmados". `proposals.eventoConvidados` é número outra vez, porque o
// documento que vai para a cliente diz "180 convidados" e não uma faixa.
//
// A conversão só acontece quando o texto diz UM número sem ambiguidade. Um
// campo que diz "150 a 180" NÃO vira 150: o documento comercial passaria a
// afirmar um número que ninguém combinou, e ninguém repararia.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O número de convidados que o briefing afirma, quando afirma um só.
 *
 * `undefined` para vazio, para faixa ("150 a 180", "150-180", "entre 150 e
 * 180") e para qualquer coisa sem dígito. Melhor um campo vazio na proposta,
 * que ela preenche olhando, do que um número inventado que ela não confere.
 */
export function convidadosDoBriefing(texto?: string | null): number | undefined {
  const t = texto?.trim();
  if (!t) return undefined;
  // Mais de um número = faixa ou anotação com duas contagens. Não decidimos.
  const numeros = t.replace(/\./g, "").match(/\d+/g);
  if (!numeros || numeros.length !== 1) return undefined;
  const n = Number(numeros[0]);
  // Inteiro positivo e plausível. `Number.isSafeInteger` evita o que `NaN` e
  // `Infinity` fariam ao atravessar até o PDF.
  if (!Number.isSafeInteger(n) || n <= 0) return undefined;
  return n;
}
