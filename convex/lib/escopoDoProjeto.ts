import { ITEM_SCOPES, type ItemScope } from "./projectScope";

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

/**
 * Configuração do selo. `undefined` quando o item não foi classificado.
 *
 * Procura em `ITEM_SCOPES`, não em `PROJECT_SCOPES`: com a lista das fotos, um
 * item "opcional" resolvia para `undefined`, caía em "sem classificação" — e
 * sem classificação ENTRA na operação. O opcional ia para o caminhão.
 */
export function scopeMeta(scope: string | undefined | null) {
  if (!scope) return undefined;
  return ITEM_SCOPES.find((s) => s.value === scope);
}

/**
 * Escopo efetivo. Ausente = `null`, e a tela NÃO exibe selo: item antigo não
 * pode virar "contratado" por omissão — seria transformar cadastro incompleto
 * em promessa ao cliente.
 */
export function escopoDoItem(item: { projectScope?: string }): ItemScope | null {
  return scopeMeta(item.projectScope)?.value ?? null;
}

/**
 * Uma referência estética nunca é obrigação de montagem — nem de compra.
 *
 * Sem classificação, o item segue o comportamento antigo e ENTRA na operação.
 * Só `referencia`, `nao_incluso` e `opcional` saem, e os três exigem escolha
 * explícita. O opcional sai porque ainda não foi contratado: entra na Folha,
 * na Ficha Técnica e nas compras no dia em que virar "incluso".
 */
export function ehObrigacaoDeMontagem(item: { projectScope?: string; situacao?: string }): boolean {
  const escopo = escopoDoItem(item);
  if (escopo === "referencia" || escopo === "nao_incluso" || escopo === "opcional") return false;
  // A SITUAÇÃO que o briefing registra (14/10). "Em avaliação" é pedido que a
  // cliente ainda não decidiu; "Não se aplica" é o que ficou de fora. Nenhum
  // dos dois vira obrigação de montagem, de compra ou de caminhão. Ausente,
  // "a definir", "aprovado" e "contratado" seguem como sempre.
  return item.situacao !== "em_avaliacao" && item.situacao !== "nao_se_aplica";
}

/** Oferecido e ainda não contratado. Ver `ESCOPO_OPCIONAL`. */
export function ehOpcional(item: { projectScope?: string }): boolean {
  return escopoDoItem(item) === "opcional";
}
