import { PROJECT_SCOPES, type ProjectScope } from "./projectScope";

// ─────────────────────────────────────────────────────────────────────────────
// O QUE É OBRIGAÇÃO DO PROJETO — regra única, agora alcançável pelo backend.
//
// A regra nasceu em `src/lib/decoration-project.ts` e já governa o Caderno de
// Montagem, a Folha de Carregamento e os PDFs. A Ficha Técnica precisa
// exatamente dela — mas roda no BACKEND, e o Convex não pode importar de
// `src/`.
//
// A saída NÃO foi copiar: a regra desceu para cá (módulo puro, sem Convex e
// sem React) e `src/lib/decoration-project.ts` passa a reexportá-la. Uma
// segunda definição de "isto faz parte do projeto" divergiria na primeira
// mudança — e aí a tela mostraria um material que o PDF não lista.
// ─────────────────────────────────────────────────────────────────────────────

/** Configuração do selo. `undefined` quando o item não foi classificado. */
export function scopeMeta(scope: string | undefined | null) {
  if (!scope) return undefined;
  return PROJECT_SCOPES.find((s) => s.value === scope);
}

/**
 * Escopo efetivo. Ausente = `null`, e a tela NÃO exibe selo: item antigo não
 * pode virar "contratado" por omissão — seria transformar cadastro incompleto
 * em promessa ao cliente.
 */
export function escopoDoItem(item: { projectScope?: string }): ProjectScope | null {
  return scopeMeta(item.projectScope)?.value ?? null;
}

/**
 * Uma referência estética nunca é obrigação de montagem — nem de compra.
 *
 * Sem classificação, o item segue o comportamento antigo e ENTRA na operação.
 * Só `referencia` e `nao_incluso` saem, e ambos exigem escolha explícita.
 */
export function ehObrigacaoDeMontagem(item: { projectScope?: string }): boolean {
  const escopo = escopoDoItem(item);
  return escopo !== "referencia" && escopo !== "nao_incluso";
}
