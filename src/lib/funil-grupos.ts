import type { Doc } from "@/convex/_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// FUNIL EM QUATRO GRUPOS — UMA VISÃO, NÃO UM STATUS NOVO
//
// O quadro tinha sete colunas, e no notebook da decoradora metade ficava fora
// da tela; no celular era arrastar o quadro de lado coluna por coluna. Os
// sete estágios continuam sendo a verdade gravada em `leads.stage` — nenhum
// lead muda, nada é migrado. O que muda é como a tela os junta.
//
// ── POR QUE ESTES QUATRO ────────────────────────────────────────────────────
// São as perguntas que a decoradora faz ao abrir o funil:
//
//   Novos           — quem ainda não teve resposta?        contact
//   Em atendimento  — com quem estou conversando?          contacted, meeting
//   Proposta        — onde já há número na mesa?           quote_sent, negotiating
//   Fechamento      — o que já se resolveu?                contracted | discarded
//
// "Negociação" mora em Proposta, e não em Fechamento, porque ainda é
// oportunidade ATIVA: misturar quem está decidindo com quem já decidiu
// esconderia exatamente os leads que pedem atenção hoje.
//
// Fechamento junta os dois desfechos numa coluna só para tirá-los do
// caminho, mas a tela os mostra SEPARADOS — ganho e perdido não são a mesma
// lista (ver `desfecho`).
// ─────────────────────────────────────────────────────────────────────────────

export type Etapa = Doc<"leads">["stage"];

export type GrupoId = "novos" | "atendimento" | "proposta" | "fechamento";

export type Grupo = {
  id: GrupoId;
  rotulo: string;
  /** As etapas reais deste grupo, na ordem do funil. */
  etapas: readonly Etapa[];
  /** Oportunidade em aberto? Fechamento é desfecho, não oportunidade. */
  ativo: boolean;
};

export const GRUPOS: readonly Grupo[] = [
  { id: "novos", rotulo: "Novos", etapas: ["contact"], ativo: true },
  { id: "atendimento", rotulo: "Em atendimento", etapas: ["contacted", "meeting"], ativo: true },
  { id: "proposta", rotulo: "Proposta", etapas: ["quote_sent", "negotiating"], ativo: true },
  { id: "fechamento", rotulo: "Fechamento", etapas: ["contracted", "discarded"], ativo: false },
];

/** O grupo de uma etapa. Toda etapa tem exatamente um — ver o teste. */
export function grupoDaEtapa(etapa: Etapa): Grupo {
  const g = GRUPOS.find((x) => x.etapas.includes(etapa));
  // Só chega aqui se o schema ganhar uma etapa e este arquivo não: o teste de
  // cobertura quebra antes disso chegar na tela.
  if (!g) throw new Error(`Etapa sem grupo no funil: ${etapa}`);
  return g;
}

/**
 * Para onde vai um card SOLTO na coluna do grupo (não em cima de outro card).
 *
 * Só há resposta quando o grupo tem UMA etapa. "Em atendimento" é contato
 * realizado OU reunião agendada, e escolher uma delas por conta própria seria
 * a tela gravando uma etapa que a decoradora não escolheu. Nesse caso
 * devolve `null` e a tela explica como escolher.
 *
 * Soltar EM CIMA de um card não é ambíguo: o destino é a etapa daquele card.
 */
export function etapaAoSoltarNoGrupo(grupo: Grupo): Etapa | null {
  return grupo.etapas.length === 1 ? grupo.etapas[0] : null;
}

/**
 * Etapa inicial ao criar um lead pelo "+" do grupo. O formulário mostra a
 * etapa e deixa trocar, então aqui não há escolha escondida.
 *
 * `null` em Fechamento: lead nasce oportunidade, não desfecho.
 */
export function etapaAoCriarNoGrupo(grupo: Grupo): Etapa | null {
  return grupo.ativo ? grupo.etapas[0] : null;
}

/** Ganho ou perdido — os dois desfechos, que a tela nunca mistura. */
export function desfecho(etapa: Etapa): "ganho" | "perdido" | null {
  if (etapa === "contracted") return "ganho";
  if (etapa === "discarded") return "perdido";
  return null;
}

/** "visao" na URL: ausente = grupos (a visão inicial), "etapas" = as sete. */
export type Visao = "grupos" | "etapas";

export function visaoDaUrl(valor: string | null): Visao {
  return valor === "etapas" ? "etapas" : "grupos";
}
