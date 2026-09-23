import { type Agente, type Fonte } from "./agentes";

// ─────────────────────────────────────────────────────────────────────────────
// O PLANO DE CONSULTA — QUAIS DADOS ESTE PEDIDO PRECISA
//
// ── POR QUE NÃO MANDAR TUDO QUE O AGENTE ALCANÇA ────────────────────────────
// Porque "quais recebimentos estão vencidos?" não precisa de eventos, fotos,
// briefing, fornecedores nem acervo. Mandar tudo custa três coisas:
//
//   · dinheiro, porque contexto é cobrado por token;
//   · qualidade, porque o modelo perde o fio no meio de dados irrelevantes;
//   · risco, porque cada dado a mais é um dado a mais que pode vazar numa
//     resposta que ninguém pediu.
//
// ── A INTERSEÇÃO É O PONTO ──────────────────────────────────────────────────
// O plano NUNCA amplia: ele é sempre um subconjunto do que o agente já podia
// ler. Um pedido que fale de dinheiro não faz o Marketing enxergar o
// Financeiro — só faz o Financeiro enxergar menos do que poderia.
//
// É por isso que a função recebe o agente e não só o texto: o texto é do
// usuário, e texto de usuário nunca decide permissão.
// ─────────────────────────────────────────────────────────────────────────────

function normalizar(texto: string): string {
  return ` ${texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** Palavras que puxam cada fonte. Só afinam; nunca abrem o que estava fechado. */
const PUXA: Record<Fonte, readonly string[]> = {
  "financeiro.vencidos": [
    "vencido", "vencidos", "vencendo", "atrasado", "atrasada", "atrasadas",
    "atraso", "inadimplen", "a receber", "a pagar", "recebimento", "recebimentos",
  ],
  "financeiro.resumo": [
    "financeiro", "faturamento", "receita", "receitas", "despesa", "despesas",
    "lucro", "margem", "caixa", "saldo", "resultado", "quanto entrou",
    "quanto saiu", "balanco",
  ],
  "comercial.funil": [
    "lead", "leads", "funil", "oportunidade", "oportunidades", "sem retorno",
    "follow up", "followup", "parado", "parados", "contato", "prospect",
  ],
  "comercial.propostas": ["proposta", "propostas", "enviada", "aceita", "recusada"],
  "compras.panorama": [
    "compra", "compras", "comprar", "cotacao", "insumo", "insumos", "material",
    "materiais", "pedido", "urgente", "urgentes",
  ],
  "eventos.proximos": [
    "evento", "eventos", "casamento", "casamentos", "agenda", "proximo",
    "proximos", "semana", "mes", "montagem", "aniversario", "formatura",
  ],
  "eventos.atencao": [
    "atencao", "urgente", "urgentes", "atrasado", "pendencia", "pendencias",
    "prioridade", "prioridades", "risco", "problema", "meu dia", "hoje",
  ],
  "acervo.itens": [
    "acervo", "peca", "pecas", "vaso", "vasos", "estoque", "reserva",
    "reservas", "nao voltou", "galpao",
  ],
  "fornecedores.catalogo": [
    "fornecedor", "fornecedores", "parceiro", "parceiros", "floricultura",
    "locadora",
  ],
};

/**
 * Quando o pedido não diz nada de específico, o agente ainda precisa de um
 * ponto de partida — e ele é PEQUENO de propósito.
 *
 * O Gestor é o único com três fontes por padrão, porque a pergunta dele
 * ("o que precisa da minha atenção?") é genuinamente ampla. Os demais partem
 * do que define o papel.
 */
const PADRAO: Record<string, readonly Fonte[]> = {
  gestao: ["eventos.atencao", "financeiro.vencidos", "comercial.funil"],
  financeiro: ["financeiro.vencidos", "financeiro.resumo"],
  comercial: ["comercial.funil"],
  compras: ["compras.panorama"],
  producao: ["eventos.proximos", "eventos.atencao"],
  fornecedores: ["fornecedores.catalogo", "acervo.itens"],
  marketing: ["eventos.proximos"],
};

/** Teto de fontes por tarefa. Mais que isso é pergunta para duas tarefas. */
export const MAXIMO_DE_FONTES = 4;

/**
 * As fontes que este pedido, com este agente, deve consultar.
 *
 * Sempre um subconjunto de `agente.fontes`. Nunca vazio: um agente sem nada
 * para ler responderia no vácuo, e responder no vácuo é o que faz um produto
 * de IA parecer mentiroso.
 */
export function planoDeConsulta(pedido: string, agente: Agente): Fonte[] {
  const texto = normalizar(pedido);

  const puxadas = agente.fontes.filter((fonte) =>
    PUXA[fonte].some((termo) => texto.includes(` ${termo}`)),
  );

  const escolhidas = puxadas.length > 0
    ? puxadas
    : // O padrão do papel, ainda intersectado com o que ele alcança: mudar
      // `agente.fontes` amanhã não pode fazer o padrão abrir uma porta.
      (PADRAO[agente.id] ?? agente.fontes).filter((f) => agente.fontes.includes(f));

  const final = escolhidas.slice(0, MAXIMO_DE_FONTES);

  // Rede de segurança: agente com fontes declaradas nunca sai daqui sem ao
  // menos uma, mesmo que o padrão e as palavras falhem juntos.
  return final.length > 0 ? final : [agente.fontes[0]];
}
