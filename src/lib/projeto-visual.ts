import { normalizeName } from "@/convex/lib/supplierIdentity.ts";
import type { GrupoDeAmbiente } from "./decoration-project.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O PROJETO VISUAL — AS FOTOS ENCONTRANDO OS ITENS
//
// ── POR QUE NÃO EXISTE TELA NOVA ────────────────────────────────────────────
// O "Projeto de Decoração" já era a visão por ambiente: uma LEITURA de
// `assemblyItems` agrupada por área, com o selo de contratado/referência. O
// que faltava nele não era estrutura — eram as FOTOS.
//
// A galeria guarda setenta imagens de um casamento, cada uma com `ambiente`,
// `projectScope` e `category`. Nenhuma delas chegava ao projeto: a tela só
// mostrava as duas fotos presas ao item (`referencePhotoUrl` e
// `contractedPhotoUrl`). A decoradora classificava as referências da mesa do
// bolo e depois não as via no lugar onde pensa a mesa do bolo.
//
// Criar um "Projeto Visual" ao lado do "Projeto de Decoração" seria a mesma
// armadilha que este repositório já pagou duas vezes — cinco mapas de tipo de
// evento, três nomes para composição. Duas telas para o mesmo conceito
// divergem na primeira semana.
//
// ── A JUNÇÃO É PELO RÓTULO, E É O ÚNICO JEITO HONESTO ───────────────────────
// Os dois lados guardam ambiente de formas diferentes:
//
//   assemblyItems.area  → chave de área conhecida (`ceremony`) ou texto livre
//   eventPhotos.ambiente → texto livre, sempre
//
// Não há id ligando os dois, e inventar um exigiria cadastro de ambiente —
// burocracia que o domínio não pediu. O que existe é o RÓTULO: "Cerimônia" de
// um lado e "cerimônia" do outro são o mesmo lugar para quem está olhando.
//
// A comparação normaliza acento, caixa e espaço. O TEXTO ORIGINAL nunca é
// reescrito: o rótulo exibido é o que ela digitou, e a normalização serve só
// para agrupar.
// ─────────────────────────────────────────────────────────────────────────────

/** Chave de agrupamento. Só para comparar — nunca para exibir. */
export function chaveVisual(texto: string | undefined | null): string {
  return normalizeName(texto);
}

export type FotoDoProjeto = {
  _id: string;
  url: string | null;
  caption?: string;
  ambiente?: string;
  category: string;
  projectScope?: string;
};

/**
 * O que a foto é dentro do projeto.
 *
 * ── A DISTINÇÃO QUE NÃO PODE BORRAR ─────────────────────────────────────────
 * Uma foto de inspiração não pode parecer decisão contratada, e uma foto do
 * evento que já aconteceu não pode aparecer como inspiração futura. São três
 * significados diferentes, e a tela mostra os três separados.
 *
 * A FASE manda mais que o escopo: uma foto tirada NA montagem ou NO evento é
 * execução, qualquer que seja a classificação que ela tenha recebido antes.
 * Foi feita depois da decisão, então ela registra o que aconteceu.
 */
export type PapelDaFoto =
  | "referencia"
  | "contratado"
  | "execucao"
  | "fora_do_escopo"
  | "sem_classificacao";

export function papelDaFoto(foto: {
  category: string;
  projectScope?: string;
}): PapelDaFoto {
  if (foto.category === "montagem" || foto.category === "evento" || foto.category === "desmontagem") {
    return "execucao";
  }
  if (foto.projectScope === "referencia") return "referencia";
  if (foto.projectScope === "incluso") return "contratado";
  if (foto.projectScope === "nao_incluso") return "fora_do_escopo";
  // Sem classificação NÃO vira referência por conveniência: o padrão de uma
  // foto recém-enviada seria promovido a decisão estética sem ninguém dizer.
  return "sem_classificacao";
}

export type AmbienteVisual<T> = {
  key: string;
  label: string;
  emoji?: string;
  itens: T[];
  referencias: FotoDoProjeto[];
  contratadas: FotoDoProjeto[];
  execucao: FotoDoProjeto[];
  foraDoEscopo: FotoDoProjeto[];
  semClassificacao: FotoDoProjeto[];
};

/** Tem alguma coisa para mostrar? Ambiente vazio não vira bloco. */
export function ambienteTemConteudo<T>(a: AmbienteVisual<T>): boolean {
  return (
    a.itens.length > 0 ||
    a.referencias.length > 0 ||
    a.contratadas.length > 0 ||
    a.execucao.length > 0 ||
    a.foraDoEscopo.length > 0 ||
    a.semClassificacao.length > 0
  );
}

function vazio<T>(key: string, label: string, emoji?: string, itens: T[] = []): AmbienteVisual<T> {
  return {
    key, label, emoji, itens,
    referencias: [], contratadas: [], execucao: [], foraDoEscopo: [], semClassificacao: [],
  };
}

function guardar<T>(destino: AmbienteVisual<T>, foto: FotoDoProjeto): void {
  switch (papelDaFoto(foto)) {
    case "referencia": destino.referencias.push(foto); break;
    case "contratado": destino.contratadas.push(foto); break;
    case "execucao": destino.execucao.push(foto); break;
    case "fora_do_escopo": destino.foraDoEscopo.push(foto); break;
    default: destino.semClassificacao.push(foto);
  }
}

export type ProjetoVisual<T> = {
  /** Os ambientes, na ordem que `agruparPorAmbiente` já estabeleceu. */
  ambientes: AmbienteVisual<T>[];
  /**
   * Fotos sem ambiente nenhum.
   *
   * Não são "erro": é o estado natural de quem acabou de subir vinte imagens.
   * Aparecem como REFERÊNCIAS GERAIS do evento, e é daí que a tela convida a
   * classificar — em vez de escondê-las e a decoradora achar que sumiram.
   */
  semAmbiente: AmbienteVisual<T>;
};

/**
 * Junta os grupos de itens (já ordenados) com as fotos da galeria.
 *
 * Fotos cujo ambiente não bate com nenhum grupo criam o próprio bloco, no fim
 * — a decoradora pode ter classificado fotos de um ambiente que ainda não tem
 * item de montagem, e esconder isso seria perder o trabalho dela.
 */
export function montarProjetoVisual<T>(
  grupos: readonly GrupoDeAmbiente<T>[],
  fotos: readonly FotoDoProjeto[],
): ProjetoVisual<T> {
  const ambientes = grupos.map((g) => vazio<T>(g.key, g.label, g.emoji, g.itens));
  const porChave = new Map<string, AmbienteVisual<T>>();
  for (const a of ambientes) {
    const chave = chaveVisual(a.label);
    if (chave) porChave.set(chave, a);
  }

  const semAmbiente = vazio<T>("__sem-ambiente", "Referências do evento");
  const extras: AmbienteVisual<T>[] = [];

  for (const foto of fotos) {
    const chave = chaveVisual(foto.ambiente);
    if (!chave) {
      guardar(semAmbiente, foto);
      continue;
    }
    let destino = porChave.get(chave);
    if (!destino) {
      // O rótulo é o TEXTO ORIGINAL, como ela digitou — a normalização só
      // serviu para descobrir que as três grafias eram o mesmo lugar.
      destino = vazio<T>(chave, (foto.ambiente ?? "").trim());
      porChave.set(chave, destino);
      extras.push(destino);
    }
    guardar(destino, foto);
  }

  return {
    ambientes: [...ambientes, ...extras].filter(ambienteTemConteudo),
    semAmbiente,
  };
}

/** Quantas imagens o projeto carrega ao todo — a tela avisa antes de pesar. */
export function totalDeImagens<T>(projeto: ProjetoVisual<T>): number {
  const conta = (a: AmbienteVisual<T>) =>
    a.referencias.length + a.contratadas.length + a.execucao.length +
    a.foraDoEscopo.length + a.semClassificacao.length;
  return projeto.ambientes.reduce((s, a) => s + conta(a), 0) + conta(projeto.semAmbiente);
}
