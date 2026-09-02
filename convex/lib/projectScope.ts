// ─────────────────────────────────────────────────────────────────────────────
// O QUE UMA IMAGEM SIGNIFICA NO PROJETO
//
// Decoração é um trabalho visual, e a confusão mais cara do setor é o cliente
// achar que uma imagem de inspiração é o que foi contratado. Uma foto de
// moodboard salva na mesma pasta do projeto aprovado vira expectativa — e
// depois vira discussão no dia do evento.
//
// Por isso este eixo existe SEPARADO da `category` (a fase: antes, montagem,
// evento, desmontagem). São perguntas diferentes:
//   category     → quando a foto foi tirada
//   projectScope → o que ela representa no combinado
//
// Imagem sem classificação NÃO ganha selo nenhum. Não presumimos que uma foto
// solta é item contratado.
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectScope = "incluso" | "referencia" | "nao_incluso";

export const PROJECT_SCOPES: readonly {
  value: ProjectScope;
  label: string;
  /** Texto de apoio, na linguagem que evita mal-entendido com o cliente. */
  detalhe: string;
  classe: string;
}[] = [
  {
    value: "incluso",
    label: "Incluso no projeto",
    detalhe: "Faz parte do que foi contratado",
    classe: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  {
    value: "referencia",
    label: "Referência visual",
    detalhe: "Imagem conceitual — não contratada",
    classe: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  {
    value: "nao_incluso",
    label: "Não incluso",
    detalhe: "Mostrado, mas fora do projeto",
    classe: "bg-muted text-muted-foreground",
  },
] as const;

/** Configuração do selo. `undefined` quando a imagem não foi classificada. */
export function scopeMeta(scope: string | undefined) {
  if (!scope) return undefined;
  return PROJECT_SCOPES.find((s) => s.value === scope);
}

/**
 * Texto honesto para exibir sobre uma imagem conceitual.
 *
 * Usado onde a imagem aparece grande (moodboard, apresentação): a frase tem
 * que deixar claro que aquilo é inspiração, não entrega.
 */
export const AVISO_REFERENCIA = "REFERÊNCIA VISUAL — imagem conceitual";
