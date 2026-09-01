// ─────────────────────────────────────────────────────────────────────────────
// REGRAS DE APRESENTAÇÃO DO CHECKLIST
//
// Lógica pura, fora do componente, para ser testável sem renderizar a tela.
// Não decide nada de negócio — só como a lista aparece e como o progresso é
// contado.
// ─────────────────────────────────────────────────────────────────────────────

export type ChecklistLike = {
  _id: string;
  name: string;
  order: number;
  isChecked: boolean;
};

/**
 * Ordena a lista do jeito que serve no galpão: o que FALTA primeiro.
 *
 * Antes a ordem era só `order`, então um item concluído no começo empurrava os
 * pendentes para baixo — exatamente ao contrário do que interessa a quem está
 * conferindo. Dentro de cada grupo a ordem de cadastro é preservada, para que a
 * lista não "pule" a cada item marcado.
 */
export function sortChecklistItems<T extends ChecklistLike>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
    return a.order - b.order;
  });
}

export type ChecklistProgress = {
  total: number;
  concluidos: number;
  pendentes: number;
  /** Inteiro de 0 a 100. Zero itens = 0%, nunca NaN. */
  percentual: number;
  completo: boolean;
};

/** Contagem honesta: números reais, sem arredondar para cima. */
export function checklistProgress(items: readonly ChecklistLike[]): ChecklistProgress {
  const total = items.length;
  const concluidos = items.filter((i) => i.isChecked).length;
  return {
    total,
    concluidos,
    pendentes: total - concluidos,
    percentual: total > 0 ? Math.round((concluidos / total) * 100) : 0,
    completo: total > 0 && concluidos === total,
  };
}

/** Textos da fase, no vocabulário de quem monta evento. */
export const CHECKLIST_PHASE_COPY = {
  pre: {
    titulo: "Carregamento (Pré-evento)",
    emoji: "🚚",
    vazioTitulo: "Nada listado para carregar ainda",
    vazioDescricao:
      "Liste aqui tudo que sai do galpão para este evento. No dia da montagem a equipe confere por esta lista.",
  },
  post: {
    titulo: "Conferência (Pós-evento)",
    emoji: "✅",
    vazioTitulo: "Nada listado para conferir na volta",
    vazioDescricao:
      "Liste o que precisa voltar do evento. É o que evita descobrir um item faltando semanas depois.",
  },
} as const;
