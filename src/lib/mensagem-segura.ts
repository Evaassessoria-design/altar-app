// ─────────────────────────────────────────────────────────────────────────────
// A MENSAGEM DE ERRO QUE PODE IR PARA A TELA
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// A tela de "Algo deu errado" mostrava `error.message` de qualquer erro de
// renderização. Isso é "Cannot read properties of undefined (reading 'map')",
// ou, vindo do Convex, "[CONVEX Q(dashboard:getAttentionBoard)] [Request ID:
// …] Server Error" — nome interno de função e identificador de requisição
// na frente da decoradora. Não ajuda quem está montando um evento, e expõe o
// que não é dela.
//
// ── A REGRA ─────────────────────────────────────────────────────────────────
// Só atravessa o que o ALTAR ESCREVEU para a tela: o `data.message` de um
// ConvexError nosso, que já nasce em português e sem detalhe interno (é o
// padrão de todas as mutations). Qualquer outra coisa fica no console, para
// quem for depurar, e a tela mostra só o texto genérico dela.
// ─────────────────────────────────────────────────────────────────────────────

export function mensagemSeguraDoErro(erro: unknown): string | null {
  if (!erro || typeof erro !== "object") return null;
  const data = (erro as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const { message, code } = data as { message?: unknown; code?: unknown };
  // O par código + mensagem é a assinatura dos erros que o backend escreve
  // de propósito (`throw new ConvexError({ code, message })`).
  if (typeof message !== "string" || typeof code !== "string") return null;
  const limpa = message.trim();
  return limpa.length > 0 && limpa.length <= 300 ? limpa : null;
}
