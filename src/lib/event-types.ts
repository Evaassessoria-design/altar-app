import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE EVENTO
//
// ── POR QUE NÃO EXISTE MAIS UM PADRÃO ───────────────────────────────────────
// O formulário nascia com "Casamento" selecionado. Parecia conveniência, mas
// era o produto se declarando: para quem cadastra o 15 anos da Helena ou a
// confraternização da Acme, o sistema já vinha dizendo que o assunto ali é
// casamento. O ALTAR é de DECORAÇÃO DE EVENTOS — a mesma empresa decora
// aniversário, bodas, formatura, corporativo, festa infantil.
//
// Pior que a mensagem era o efeito prático: quem não reparava no campo saía
// com o evento salvo como casamento. Um dado errado gravado em silêncio, por
// omissão de quem preenche.
//
// Agora o campo começa VAZIO e escolher é obrigatório. "Casamento" continua na
// lista, no mesmo lugar — deixou de ser a resposta presumida.
//
// ── UMA LISTA SÓ ────────────────────────────────────────────────────────────
// A lista vivia duplicada no formulário de evento e no onboarding. Duas cópias
// da mesma verdade divergem: uma ganha um tipo novo, a outra não, e o mesmo
// sistema passa a oferecer opções diferentes em telas diferentes.
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

export const PLACEHOLDER_TIPO_DE_EVENTO = "Selecione o tipo de evento";

/** Mensagem única: o erro do formulário e o do onboarding dizem a mesma coisa. */
export const ERRO_TIPO_OBRIGATORIO = "Escolha o tipo de evento";

/**
 * Validação do campo.
 *
 * ── POR QUE `errorMap` E NÃO `required_error` ───────────────────────────────
 * `required_error` cobre o campo nunca tocado (`undefined`) e
 * `invalid_type_error` cobre o tipo errado — mas NENHUM dos dois cobre uma
 * STRING fora da lista. Nesse caso o zod 3 emite `invalid_enum_value` com a
 * mensagem padrão dele, em inglês:
 *
 *   "Invalid enum value. Expected 'wedding' | 'corporate' | ..., received ''"
 *
 * Isso chegaria à tela da decoradora. O `errorMap` responde por todos os casos
 * com a mesma frase — que é o ponto: recusar o envio sempre dizendo o porquê,
 * na língua dela.
 */
export const tipoDeEventoSchema = z.enum(TIPOS_DE_EVENTO, {
  errorMap: () => ({ message: ERRO_TIPO_OBRIGATORIO }),
});

/** O valor é um tipo de evento conhecido? Usado onde não há zod (onboarding). */
export function ehTipoDeEventoValido(valor: unknown): valor is TipoDeEvento {
  return typeof valor === "string" && (TIPOS_DE_EVENTO as readonly string[]).includes(valor);
}

/** Rótulo legível de um tipo já gravado. Valor desconhecido volta como veio. */
export function labelDoTipoDeEvento(valor: string | undefined): string {
  if (!valor) return "—";
  return EVENT_TYPES.find((t) => t.value === valor)?.label ?? valor;
}
