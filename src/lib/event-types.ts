import { z } from "zod";
import {
  EVENT_TYPES,
  TIPOS_DE_EVENTO,
  ehTipoDeEventoValido,
  rotuloDoTipoDeEvento,
  type TipoDeEvento,
} from "@/convex/lib/tiposDeEvento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE EVENTO — o que é do formulário
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
// ── A LISTA MUDOU DE CASA ───────────────────────────────────────────────────
// Ela vive em `convex/lib/tiposDeEvento.ts`. Este arquivo dizia, por um tempo,
// que a duplicação tinha acabado — e não tinha: havia cinco cópias do mapa de
// rótulos, e a função daqui não era chamada por nenhuma tela. Foi assim que um
// slug ("wedding") chegou ao PDF da cliente, quando a proposta comercial
// nasceu copiando `event.type` do evento.
//
// O mapa teve de DESCER, não subir: `convex/` não importa de `src/`, então um
// mapa que só existisse aqui seria inalcançável exatamente na função que monta
// o documento da cliente.
//
// O que fica aqui é o que só o formulário usa: o schema zod e as mensagens.
// ─────────────────────────────────────────────────────────────────────────────

export { EVENT_TYPES, TIPOS_DE_EVENTO, ehTipoDeEventoValido, rotuloDoTipoDeEvento };
export type { TipoDeEvento };

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

/**
 * O rótulo, ou "—" quando não há tipo.
 *
 * Só para TELA: um card vazio precisa de um travessão para não desalinhar a
 * coluna. O documento da cliente usa `rotuloDoTipoDeEvento` direto, que devolve
 * `undefined` e deixa a linha inteira sumir — um PDF de venda não imprime
 * travessão no lugar do que a decoradora escolheu não dizer.
 */
export function labelDoTipoDeEvento(valor: string | undefined): string {
  return rotuloDoTipoDeEvento(valor) ?? "—";
}
