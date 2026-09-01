// ─────────────────────────────────────────────────────────────────────────────
// PAPÉIS DA EQUIPE DA DECORADORA
//
// ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────────
// A lista existia DUAS vezes, com conteúdos diferentes:
//
//   onboarding → Assistente, Florista, Auxiliar de Montagem, Fotógrafo,
//                Cerimonialista, Outro
//   equipe     → Montador, Auxiliar, Florista, Motorista, Coordenador,
//                Fotógrafo, Cozinheiro, Garçom, Segurança, DJ, Outros
//
// Duas cópias já seriam problema — a mesma pessoa via opções diferentes
// conforme a tela. Mas o conteúdo era o erro maior: cozinheiro, garçom,
// segurança, DJ, fotógrafo e cerimonialista NÃO são a equipe de uma empresa de
// decoração. São a equipe do buffet, da assessoria e do cliente. É a mesma
// confusão de escopo que aparecia nos fornecedores e no Dashboard.
//
// ── COMPATIBILIDADE COM O QUE JÁ ESTÁ GRAVADO ───────────────────────────────
// `teamMembers.role` é `v.string()` — texto livre. Quem já tem alguém salvo
// como "Fotógrafo(a)" ou "DJ" NÃO perde o dado: `opcoesDePapel` devolve o valor
// atual junto da lista quando ele não está mais nela.
//
// Sem isso, abrir para editar esse membro mostraria o seletor vazio e salvar
// trocaria o papel dele em silêncio. Tirar uma opção do cadastro NOVO é uma
// coisa; reescrever registro antigo é outra, e não é o que foi pedido.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Funções que existem dentro da operação de uma decoradora.
 *
 * Ordem de uso no dia a dia. "Outro" fecha a lista porque o campo é livre e
 * sempre haverá uma função que não previmos.
 */
export const PAPEIS_DA_EQUIPE = [
  "Coordenação",
  "Produção",
  "Montagem",
  "Desmontagem",
  "Florista",
  "Designer / Projetista",
  "Marcenaria",
  "Iluminação decorativa",
  "Logística",
  "Motorista",
  "Assistente",
  "Apoio",
  "Outro",
] as const;

export type PapelDaEquipe = (typeof PAPEIS_DA_EQUIPE)[number];

/** O papel está na lista oferecida hoje? */
export function ehPapelConhecido(papel: string | undefined | null): boolean {
  return !!papel && (PAPEIS_DA_EQUIPE as readonly string[]).includes(papel);
}

/**
 * Opções do seletor, preservando um papel já gravado que saiu da lista.
 *
 * Sem `atual`, devolve só a lista — é o caso do cadastro de alguém novo, em
 * que as opções antigas não devem mais ser oferecidas.
 */
export function opcoesDePapel(atual?: string | null): string[] {
  const lista = [...PAPEIS_DA_EQUIPE];
  if (atual?.trim() && !ehPapelConhecido(atual)) return [atual, ...lista];
  return lista;
}
