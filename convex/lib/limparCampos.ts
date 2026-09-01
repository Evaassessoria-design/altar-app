// ─────────────────────────────────────────────────────────────────────────────
// LIMPAR CAMPO OPCIONAL
//
// ── O PROBLEMA ──────────────────────────────────────────────────────────────
// `undefined` NÃO chega ao servidor. A serialização do Convex descarta a chave
// inteira antes de enviar:
//
//   convexToJson({ id, projectScope: undefined })  →  { "id": ... }
//
// Então uma tela que faz `update({ id, quantity: valor ? Number(valor) : undefined })`
// para apagar a quantidade envia só o `id`. O handler não vê o campo, o patch
// não o toca, o valor antigo permanece — e a tela ainda avisa "atualizado!".
// É o pior tipo de bug: silencioso e com confirmação de sucesso.
//
// ── A SOLUÇÃO ───────────────────────────────────────────────────────────────
// `null` sobrevive ao transporte. Ele passa a ser o sinal explícito de
// "limpar este campo", e o handler o traduz para `undefined` — que é o que o
// `ctx.db.patch` entende como "remover".
//
// Campo ausente continua significando "não mexer". As duas intenções, que antes
// se confundiam, agora são distintas:
//
//   campo ausente  → não mexer
//   campo = null   → limpar
//   campo = valor  → gravar
// ─────────────────────────────────────────────────────────────────────────────

/** Igual a `T`, mas sem `null`: o que o `ctx.db.patch` aceita. */
export type SemNulos<T> = { [K in keyof T]: Exclude<T[K], null> };

/**
 * Traduz o `null` que veio do cliente ("limpar") para o `undefined` que o
 * `ctx.db.patch` entende ("remover o campo").
 *
 * Chaves ausentes continuam ausentes — não vira patch de campo nenhum.
 */
export function limparCampos<T extends object>(fields: T): SemNulos<T> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(fields)) {
    saida[chave] = valor === null ? undefined : valor;
  }
  return saida as SemNulos<T>;
}
