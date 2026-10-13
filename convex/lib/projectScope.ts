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

// ─────────────────────────────────────────────────────────────────────────────
// O QUARTO ESCOPO — SÓ DO ITEM: "OPCIONAL"
//
// O Caderno da cliente tem uma seção que nenhum dado do sistema alimentava:
// "estrutura do bar, lounge adicional — podem ser contratados depois". Isso
// vivia como frase no contrato lido por IA ("no valor de 2800, são opcionais")
// e saía impresso para a EQUIPE junto com o valor.
//
// Opcional é um ITEM que foi oferecido e ainda não foi contratado. Ele tem
// nome, ambiente, quantidade e foto como qualquer item — por isso mora no
// item, e não numa tabela paralela que obrigaria a digitar tudo de novo no dia
// em que a cliente disser "sim". A confirmação é trocar o escopo para
// "Incluso no projeto": o mesmo item passa a entrar na Folha de Carregamento,
// na Ficha Técnica e nas compras, sem cópia.
//
// ── POR QUE NÃO ENTRA EM `PROJECT_SCOPES` ───────────────────────────────────
// `PROJECT_SCOPES` também é o vocabulário das FOTOS, e `eventPhotos` não aceita
// este valor. Uma foto não é "oferecida": ela mostra um item, e o item é que
// tem escopo. Acrescentar aqui ofereceria na Galeria uma opção que o servidor
// recusa.
// ─────────────────────────────────────────────────────────────────────────────
export type ItemScope = ProjectScope | "opcional";

export const ESCOPO_OPCIONAL = {
  value: "opcional" as const,
  label: "Opcional",
  detalhe: "Oferecido, ainda não contratado — não montar sem confirmação",
  classe: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
};

/** Os escopos que um ITEM aceita: os da foto mais "opcional". */
export const ITEM_SCOPES: readonly {
  value: ItemScope;
  label: string;
  detalhe: string;
  classe: string;
}[] = [...PROJECT_SCOPES, ESCOPO_OPCIONAL];

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
