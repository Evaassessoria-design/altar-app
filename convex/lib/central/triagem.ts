// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM — PARA ONDE VAI A CONVERSA, E QUANDO O MATHEUS PRECISA VER
//
// Tudo aqui é FUNÇÃO PURA. A IA propõe; este módulo decide o que a proposta
// significa em termos de roteamento e escalonamento. A separação existe para
// que a regra de negócio da Central seja testável sem rede, sem banco e sem
// gastar uma chamada de modelo.
//
// ── DEPARTAMENTO NÃO É ESCOLHA LIVRE DA IA ──────────────────────────────────
// A IA classifica a CATEGORIA (o que a pessoa quer). O departamento é
// CONSEQUÊNCIA determinística disso. Se a IA pudesse escolher os dois, as duas
// respostas divergiriam — e no dia em que divergissem ninguém saberia qual
// valia. É a mesma recusa a duplicar fonte de verdade que a agenda operacional
// documenta em convex/agenda.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const DEPARTAMENTOS = [
  "triagem",
  "comercial",
  "suporte",
  "financeiro",
  "ouvidoria",
] as const;
export type Departamento = (typeof DEPARTAMENTOS)[number];

export const CATEGORIAS = [
  // Comercial
  "novo_interessado",
  "demonstracao",
  "follow_up",
  "trial",
  "conversao",
  // CS / Suporte
  "duvida",
  "onboarding",
  "problema",
  // Financeiro
  "cobranca",
  // Ouvidoria
  "reclamacao",
  "sugestao",
  "bug",
  "funcionalidade",
  "elogio",
  // Sem classificação possível
  "outro",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const PRIORIDADES = ["baixa", "normal", "alta", "urgente"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

/** Ausente = normal. Nenhum registro antigo precisa de backfill. */
export const PRIORIDADE_PADRAO: Prioridade = "normal";

/** Categoria → departamento. Mapa único e total. */
const DEPARTAMENTO_DA_CATEGORIA: Record<Categoria, Departamento> = {
  novo_interessado: "comercial",
  demonstracao: "comercial",
  follow_up: "comercial",
  trial: "comercial",
  conversao: "comercial",
  duvida: "suporte",
  onboarding: "suporte",
  problema: "suporte",
  cobranca: "financeiro",
  reclamacao: "ouvidoria",
  sugestao: "ouvidoria",
  bug: "ouvidoria",
  funcionalidade: "ouvidoria",
  elogio: "ouvidoria",
  outro: "triagem",
};

/** Categorias que viram sinal de Ouvidoria/Produto em vez de tarefa. */
export const CATEGORIAS_DE_OUVIDORIA = [
  "reclamacao",
  "sugestao",
  "bug",
  "funcionalidade",
  "elogio",
] as const;

export function ehCategoria(valor: unknown): valor is Categoria {
  return typeof valor === "string" && (CATEGORIAS as readonly string[]).includes(valor);
}

export function ehPrioridade(valor: unknown): valor is Prioridade {
  return typeof valor === "string" && (PRIORIDADES as readonly string[]).includes(valor);
}

export function ehDepartamento(valor: unknown): valor is Departamento {
  return typeof valor === "string" && (DEPARTAMENTOS as readonly string[]).includes(valor);
}

export function departamentoDaCategoria(categoria: Categoria): Departamento {
  return DEPARTAMENTO_DA_CATEGORIA[categoria];
}

export function ehCategoriaDeOuvidoria(categoria: Categoria): boolean {
  return (CATEGORIAS_DE_OUVIDORIA as readonly string[]).includes(categoria);
}

/**
 * Abaixo disto a IA não decide sozinha nem para ORGANIZAR: a conversa sobe
 * para o Matheus com o palpite à vista, em vez de ser arquivada num
 * departamento errado.
 */
export const CONFIANCA_MINIMA = 0.6;

export type TipoDeContato = "interessado" | "assinante" | "parceiro" | "desconhecido";

export type SugestaoDaIa = {
  categoria: string;
  prioridade?: string;
  confianca?: number;
};

export type ContextoDaTriagem = {
  /** Quem está do outro lado, quando já se sabe. */
  tipoDeContato?: TipoDeContato;
  /** A conversa já estava escalada antes desta mensagem. */
  jaEscalada?: boolean;
};

export type Escalonamento = { escalar: boolean; motivo?: string };

/**
 * Quando o CEO precisa ver.
 *
 * As regras são avaliadas em ordem e a PRIMEIRA que bate define o motivo — o
 * motivo aparece na tela do Matheus, então precisa ser o mais específico, não
 * o mais genérico.
 */
export function decidirEscalonamento(
  categoria: Categoria,
  prioridade: Prioridade,
  confianca: number | undefined,
  contexto: ContextoDaTriagem = {},
): Escalonamento {
  if (contexto.jaEscalada) {
    return { escalar: true, motivo: "Conversa já estava escalada" };
  }

  if (prioridade === "urgente") {
    return { escalar: true, motivo: "Prioridade urgente" };
  }

  if (categoria === "conversao") {
    return { escalar: true, motivo: "Fechamento de assinatura" };
  }

  if (categoria === "cobranca") {
    // O Financeiro da Central CLASSIFICA e abre tarefa; nunca movimenta nada.
    // Toda conversa de cobrança sobe porque a decisão é sempre humana.
    return {
      escalar: true,
      motivo: "Assunto de cobrança — decisão humana obrigatória",
    };
  }

  // "urgente" já retornou acima; aqui só resta distinguir "alta" do resto.
  if (categoria === "reclamacao" && prioridade === "alta") {
    return { escalar: true, motivo: "Reclamação grave" };
  }

  if (categoria === "problema" && contexto.tipoDeContato === "assinante") {
    return { escalar: true, motivo: "Assinante com problema" };
  }

  if (confianca !== undefined && confianca < CONFIANCA_MINIMA) {
    return { escalar: true, motivo: "IA sem confiança na classificação" };
  }

  return { escalar: false };
}

export type TriagemResolvida = {
  categoria: Categoria;
  departamento: Departamento;
  prioridade: Prioridade;
  escalar: boolean;
  motivoDoEscalonamento?: string;
};

/**
 * Transforma o palpite da IA em decisão utilizável.
 *
 * Categoria desconhecida vira `outro` e fica em `triagem`: o roteamento não
 * inventa destino a partir de texto que não reconhece.
 */
export function resolverTriagem(
  sugestao: SugestaoDaIa,
  contexto: ContextoDaTriagem = {},
): TriagemResolvida {
  const categoria: Categoria = ehCategoria(sugestao.categoria) ? sugestao.categoria : "outro";
  const prioridade: Prioridade = ehPrioridade(sugestao.prioridade)
    ? sugestao.prioridade
    : PRIORIDADE_PADRAO;
  const departamento = departamentoDaCategoria(categoria);
  const { escalar, motivo } = decidirEscalonamento(
    categoria,
    prioridade,
    sugestao.confianca,
    contexto,
  );

  return {
    categoria,
    departamento,
    prioridade,
    escalar,
    motivoDoEscalonamento: motivo,
  };
}

/** Tipos de tarefa que a Central abre a partir de uma conversa. */
export const TIPOS_DE_TRABALHO = [
  "follow_up",
  "demonstracao",
  "onboarding",
  "suporte",
  "contato_cobranca",
  "retorno",
  "outro",
] as const;
export type TipoDeTrabalho = (typeof TIPOS_DE_TRABALHO)[number];

/**
 * Que tarefa nasce desta categoria — ou `null` quando a categoria vira SINAL
 * de Ouvidoria em vez de tarefa.
 */
export function trabalhoSugerido(categoria: Categoria): TipoDeTrabalho | null {
  switch (categoria) {
    case "novo_interessado":
    case "follow_up":
    case "trial":
    case "conversao":
      return "follow_up";
    case "demonstracao":
      return "demonstracao";
    case "onboarding":
      return "onboarding";
    case "duvida":
    case "problema":
      return "suporte";
    case "cobranca":
      return "contato_cobranca";
    default:
      return null;
  }
}

/** Prazo padrão, em dias, da tarefa que nasce de cada prioridade. */
const PRAZO_POR_PRIORIDADE: Record<Prioridade, number> = {
  urgente: 0,
  alta: 1,
  normal: 3,
  baixa: 7,
};

export function prazoEmDias(prioridade: Prioridade): number {
  return PRAZO_POR_PRIORIDADE[prioridade];
}

export type EstadoDaConversa = {
  categoria?: string;
  departamento?: string;
  prioridade?: string;
};

/**
 * A IA errou?
 *
 * Compara o que a triagem propôs com o que ficou valendo depois que um humano
 * mexeu. É ESTE booleano, acumulado ao longo de semanas, que autoriza ou nega
 * a autonomia da Fase 2 — sem ele, liberar envio automático seria chute.
 */
export function houveDivergencia(
  proposto: { categoria: string; departamento: string; prioridade: string },
  atual: EstadoDaConversa,
): boolean {
  if (atual.categoria !== undefined && atual.categoria !== proposto.categoria) return true;
  if (atual.departamento !== undefined && atual.departamento !== proposto.departamento) {
    return true;
  }
  if (atual.prioridade !== undefined && atual.prioridade !== proposto.prioridade) return true;
  return false;
}
