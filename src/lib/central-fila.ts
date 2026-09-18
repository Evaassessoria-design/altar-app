// ─────────────────────────────────────────────────────────────────────────────
// FILA DA CENTRAL — ORDENAÇÃO E RÓTULOS
//
// Fora do componente para poder ser conferido por teste. A ordem da fila do
// Matheus é uma decisão de produto, não um detalhe de renderização: se ela
// mudar por acidente, a conversa urgente vai para o fim da lista e ninguém
// percebe até o cliente reclamar.
// ─────────────────────────────────────────────────────────────────────────────

export type Prioridade = "baixa" | "normal" | "alta" | "urgente";
export type Departamento = "triagem" | "comercial" | "suporte" | "financeiro" | "ouvidoria";

/** Peso da prioridade. Maior sobe na lista. */
const PESO_DA_PRIORIDADE: Record<Prioridade, number> = {
  urgente: 3,
  alta: 2,
  normal: 1,
  baixa: 0,
};

export type ItemDaFila = {
  _id: string;
  criadoEm: number;
  expirada?: boolean;
  conversa: {
    prioridade: Prioridade;
    escaladaParaCeo: boolean;
    departamento: Departamento;
  } | null;
};

/**
 * Ordem da fila de aprovação.
 *
 *   1. escalada para o CEO      — foi marcada porque precisa DELE
 *   2. prioridade, do maior     — urgente antes de alta antes de normal
 *   3. mais ANTIGA primeiro     — quem esperou mais é atendido antes
 *
 * As expiradas vão para o fim independentemente do resto: decidir uma
 * proposta que o canal já não aceita é trabalho jogado fora.
 */
export function ordenarFila<T extends ItemDaFila>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => {
    if ((a.expirada ?? false) !== (b.expirada ?? false)) return a.expirada ? 1 : -1;

    const escaladaA = a.conversa?.escaladaParaCeo ?? false;
    const escaladaB = b.conversa?.escaladaParaCeo ?? false;
    if (escaladaA !== escaladaB) return escaladaA ? -1 : 1;

    const pesoA = PESO_DA_PRIORIDADE[a.conversa?.prioridade ?? "normal"];
    const pesoB = PESO_DA_PRIORIDADE[b.conversa?.prioridade ?? "normal"];
    if (pesoA !== pesoB) return pesoB - pesoA;

    return a.criadoEm - b.criadoEm;
  });
}

export const ROTULO_DO_DEPARTAMENTO: Record<Departamento, string> = {
  triagem: "Triagem",
  comercial: "Comercial",
  suporte: "Suporte / CS",
  financeiro: "Financeiro",
  ouvidoria: "Ouvidoria",
};

export const ROTULO_DA_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const CLASSE_DA_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "bg-muted text-muted-foreground",
  normal: "bg-muted text-muted-foreground",
  alta: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  urgente: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export const ROTULO_DA_CATEGORIA: Record<string, string> = {
  novo_interessado: "Novo interessado",
  demonstracao: "Demonstração",
  follow_up: "Follow-up",
  trial: "Trial",
  conversao: "Conversão",
  duvida: "Dúvida",
  onboarding: "Onboarding",
  problema: "Problema",
  cobranca: "Cobrança",
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
  bug: "Bug",
  funcionalidade: "Funcionalidade",
  elogio: "Elogio",
  outro: "Outro",
};

/**
 * Como a confiança da IA aparece para quem decide.
 *
 * O número cru não diz nada a quem está com pressa; o que importa é se dá
 * para confiar na organização que a máquina fez.
 */
export function rotuloDaConfianca(confianca: number): {
  texto: string;
  classe: string;
} {
  if (confianca >= 0.85) {
    return {
      texto: "IA confiante",
      classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    };
  }
  if (confianca >= 0.6) {
    return { texto: "IA razoável", classe: "bg-muted text-muted-foreground" };
  }
  return {
    texto: "IA insegura",
    classe: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  };
}
