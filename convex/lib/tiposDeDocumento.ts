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

import {
  cabeNoTeto,
  MB,
  recadoDeTamanho,
  TAMANHO_MAXIMO_DOCUMENTO,
} from "./arquivos";

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

/**
 * Limite por arquivo.
 *
 * NÃO é um número próprio: é o teto de documento de `lib/arquivos.ts`, lido em
 * MB. Era declarado aqui como `20` à mão, enquanto o hook dizia 10 MB e o
 * backend aplicava 1.000.000 bytes — três fontes para a mesma regra, e a
 * decoradora descobria qual valia sendo recusada depois do upload.
 */
export const TAMANHO_MAXIMO_MB = Math.round(TAMANHO_MAXIMO_DOCUMENTO / MB);

/**
 * Diz por que o arquivo não pode ser enviado, ou `null` se pode.
 *
 * Primeira das duas portas da tela do funil. A segunda é `validarArquivo`, no
 * hook — e as duas chamam `cabeNoTeto` agora, então não há mais como uma
 * dizer sim e a outra não.
 *
 * Puro de propósito: a mesma regra é testada sem navegador.
 */
export function motivoParaRecusarArquivo(
  arquivo: { name: string; size: number } | null | undefined,
): string | null {
  if (!arquivo) return "Nenhum arquivo selecionado.";
  if (!arquivo.name.trim()) return "Arquivo sem nome.";
  if (arquivo.size === 0) return "O arquivo está vazio.";
  if (!cabeNoTeto(arquivo.size, TAMANHO_MAXIMO_DOCUMENTO)) {
    // Era "Arquivo maior que 20 MB." — correto e seco. Agora é a MESMA frase
    // que o hook e o backend usam, para a pessoa não ler três redações do
    // mesmo limite dependendo de onde bateu.
    return recadoDeTamanho(TAMANHO_MAXIMO_DOCUMENTO);
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
