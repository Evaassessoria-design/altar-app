// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE DOCUMENTO DA NEGOCIAÇÃO — fonte única.
//
// A mesma lista precisa existir em três lugares (validador do schema, seletor
// da tela, rótulo na listagem). Nas rodadas anteriores esse tipo de lista
// duplicada já causou divergência três vezes — categoria de fornecedor, tipo
// de evento e papel da equipe — então aqui ela nasce centralizada, e um teste
// estrutural (`leadDocuments.test.ts`) exige que o `v.union` do backend
// corresponda exatamente a esta lista.
//
// Módulo PURO: sem Convex, sem React. Pode ser importado pelo backend e pelo
// front (tsconfig mapeia `@/convex/*`).
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_DE_DOCUMENTO_DO_LEAD = [
  { valor: "proposta", rotulo: "Proposta" },
  { valor: "contrato", rotulo: "Contrato" },
  { valor: "comprovante", rotulo: "Comprovante" },
  { valor: "referencia", rotulo: "Referência" },
  { valor: "outro", rotulo: "Outro documento" },
] as const;

export type TipoDeDocumentoDoLead = (typeof TIPOS_DE_DOCUMENTO_DO_LEAD)[number]["valor"];

/**
 * Rótulo de um tipo. Documento SEM tipo não recebe rótulo inventado: devolve
 * `null`, e quem mostra decide (a tela não desenha selo nenhum). Chamar um
 * arquivo antigo de "Proposta" por padrão seria afirmar o que ninguém disse.
 */
export function rotuloDoTipo(valor: string | undefined | null): string | null {
  if (!valor) return null;
  return TIPOS_DE_DOCUMENTO_DO_LEAD.find((t) => t.valor === valor)?.rotulo ?? null;
}

/**
 * Ordena a lista como a decoradora procura: mais recente primeiro. Não agrupa
 * por tipo — no funil o que importa é "o que mandei por último", diferente da
 * pasta do evento, onde o contrato é sempre o primeiro item.
 */
export function ordenarDocumentosDoLead<T extends { uploadedAt: string }>(
  docs: readonly T[],
): T[] {
  return [...docs].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** Limite por arquivo. Acima disso o upload falha no meio, sem mensagem útil. */
export const TAMANHO_MAXIMO_MB = 20;

/**
 * Diz por que o arquivo não pode ser enviado, ou `null` se pode.
 * Puro de propósito: a mesma regra é testada sem navegador.
 */
export function motivoParaRecusarArquivo(
  arquivo: { name: string; size: number } | null | undefined,
): string | null {
  if (!arquivo) return "Nenhum arquivo selecionado.";
  if (!arquivo.name.trim()) return "Arquivo sem nome.";
  if (arquivo.size === 0) return "O arquivo está vazio.";
  if (arquivo.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
    return `Arquivo maior que ${TAMANHO_MAXIMO_MB} MB.`;
  }
  return null;
}

/** "1,4 MB" — tamanho legível. `undefined` quando o dado não foi gravado. */
export function tamanhoLegivel(bytes: number | undefined | null): string | null {
  if (bytes === undefined || bytes === null || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace(".", ",")} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace(".", ",")} MB`;
}
