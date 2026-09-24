// ─────────────────────────────────────────────────────────────────────────────
// PASTA DO EVENTO — tipos de documento.
//
// Os mesmos valores que `convex/schema.ts` aceita em `contracts.kind`. O
// backend já suportava os cinco tipos e já sabia listá-los
// (`contracts.listDocuments`); a interface só permitia anexar contrato, e
// nunca mostrava a pasta.
//
// IMPORTANTE, e visível na tela: `contracts.saveContract` SUBSTITUI o
// documento do mesmo lugar, e o lugar é o par (TIPO, FORNECEDOR). Um arquivo
// por lugar, não um histórico — a tela avisa em vez de deixar a pessoa
// descobrir perdendo o anterior.
//
// O fornecedor entrou nessa conta porque sem ele o teto era de CINCO arquivos
// por casamento: um contrato, um aditivo, um orçamento, uma referência e um
// "outro". Com três fornecedores mandando contrato e orçamento, o segundo
// apagava o primeiro e o resto da papelada ia para o Drive.
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentKind = "contract" | "addendum" | "budget" | "reference" | "other";

export const DOCUMENT_KINDS: readonly { kind: DocumentKind; label: string }[] = [
  { kind: "contract", label: "Contrato" },
  { kind: "addendum", label: "Aditivo" },
  { kind: "budget", label: "Orçamento" },
  { kind: "reference", label: "Referência" },
  { kind: "other", label: "Outro documento" },
] as const;

/** Documento antigo sem `kind` é contrato — mesma regra do backend. */
export function labelDoTipo(kind: string | undefined): string {
  const alvo = kind ?? "contract";
  return DOCUMENT_KINDS.find((d) => d.kind === alvo)?.label ?? "Outro documento";
}

export type DocumentoLike = { kind?: string; uploadedAt: string };

/**
 * Ordena a pasta na ordem em que a decoradora pensa: contrato primeiro,
 * depois aditivo, orçamento, referência e o resto. Dentro do mesmo tipo, o
 * mais recente primeiro.
 */
export function ordenarDocumentos<T extends DocumentoLike>(docs: readonly T[]): T[] {
  const peso = (kind: string | undefined) => {
    const i = DOCUMENT_KINDS.findIndex((d) => d.kind === (kind ?? "contract"));
    return i === -1 ? DOCUMENT_KINDS.length : i;
  };
  return [...docs].sort((a, b) => {
    const pa = peso(a.kind);
    const pb = peso(b.kind);
    if (pa !== pb) return pa - pb;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });
}
