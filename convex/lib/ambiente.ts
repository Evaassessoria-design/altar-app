import { normalizeName } from "./supplierIdentity";

// ─────────────────────────────────────────────────────────────────────────────
// A CHAVE DO AMBIENTE — a mesma dos dois lados da rede
//
// A regra completa de "onde a decoração acontece" (`resolverAmbiente`) mora em
// `src/lib/decoration-project.ts`, porque depende de `BRIEFING_AREAS`, que é do
// front. Mas a NORMALIZAÇÃO desceu para cá, e por um motivo concreto:
//
// O filtro de ambiente de `gallery.listPhotos` comparava com
// `trim().toLowerCase()`. O Projeto Visual junta "Salão de vidro" e "salao de
// vidro" no mesmo bloco; a galeria, filtrando pela outra regra, devolvia menos
// fotos do que o bloco mostrava. Clicar em "+12 na Galeria" e encontrar 9 é a
// tela contradizendo a si mesma.
//
// Duas normalizações para a mesma pergunta é o mesmo defeito que esta rodada
// existe para tirar do repositório — só que atravessando a rede.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chave de comparação: minúscula, sem acento, espaços colapsados.
 *
 * Só para agrupar e filtrar. NUNCA para exibir, e nunca gravada por cima do
 * texto que a decoradora digitou.
 */
export function chaveDoAmbiente(texto: string | undefined | null): string {
  const normalizada = normalizeName(texto);
  // Texto que normaliza para vazio ("***") ainda é um rótulo que ela digitou:
  // vira chave própria em vez de colidir com todos os outros no vazio.
  return normalizada || (texto ?? "").trim().toLowerCase();
}
