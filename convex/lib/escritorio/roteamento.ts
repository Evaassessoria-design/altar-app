import { type AgenteId } from "./agentes";

// ─────────────────────────────────────────────────────────────────────────────
// QUEM CUIDA DESTE PEDIDO
//
// ── POR QUE NÃO PERGUNTAMOS À IA ────────────────────────────────────────────
// Porque "recebimentos vencidos" é Financeiro, e descobrir isso não vale uma
// chamada de modelo. Um roteador de palavras-chave acerta a esmagadora maioria
// dos pedidos reais, custa zero, responde em microssegundos e é testável linha
// a linha — três coisas que o modelo não oferece.
//
// A Central já pratica este desenho: `lib/central/triagem.ts` tem as regras
// determinísticas e usa a IA só onde ela acrescenta. Aqui vale o mesmo.
//
// ── O EMPATE NÃO É CHUTE ────────────────────────────────────────────────────
// Pedido que não bate com ninguém, ou que bate com duas áreas ao mesmo tempo,
// vai para a GESTÃO — que é o papel cujo trabalho é justamente atravessar
// áreas. Escolher uma das duas na moeda produziria uma resposta que ignora
// metade da pergunta, e a decoradora não teria como saber disso.
// ─────────────────────────────────────────────────────────────────────────────

export type Roteamento = {
  agenteId: AgenteId;
  /** `true` quando ninguém casou e a Gestão assumiu por padrão. */
  porPadrao: boolean;
  /** Quantas áreas distintas o texto mencionou. 2+ também cai na Gestão. */
  areasCitadas: number;
};

function normalizar(texto: string): string {
  return ` ${texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/**
 * Os sinais de cada área.
 *
 * Substantivos do domínio, não verbos: o verbo quem classifica é o semáforo.
 * "vencido" aparece em Financeiro E em Compras de propósito — é assim que um
 * pedido genuinamente ambíguo chega à Gestão em vez de ser decidido no escuro.
 */
const SINAIS: Record<Exclude<AgenteId, "gestao">, readonly string[]> = {
  financeiro: [
    "financeiro", "dinheiro", "caixa", "receita", "receitas", "despesa",
    "despesas", "recebimento", "recebimentos", "a receber", "a pagar",
    "pagamento", "pagamentos", "vencido", "vencidos", "vencendo", "inadimplen",
    "lucro", "margem", "faturamento", "comprovante", "comprovantes", "parcela",
    "parcelas", "saldo",
  ],
  comercial: [
    "lead", "leads", "funil", "oportunidade", "oportunidades", "proposta",
    "propostas", "orcamento enviado", "follow up", "followup", "retorno",
    "prospect", "cliente novo", "interessad", "negociacao", "fechamento",
    "conversao",
  ],
  compras: [
    "compra", "compras", "comprar", "cotacao", "cotacoes", "pedido",
    "insumo", "insumos", "material", "materiais", "flores para comprar",
    "lista de compras", "fornecedor para comprar",
  ],
  producao: [
    "evento", "eventos", "casamento", "casamentos", "montagem", "desmontagem",
    "checklist", "briefing", "equipe", "producao", "cronograma", "agenda",
    "proximos eventos", "aniversario", "debutante", "formatura",
  ],
  fornecedores: [
    "fornecedor", "fornecedores", "acervo", "peca", "pecas", "vaso", "vasos",
    "reserva", "reservas", "estoque", "galpao", "parceiro", "parceiros",
    "nao voltou", "devolucao",
  ],
  marketing: [
    "marketing", "conteudo", "post", "posts", "instagram", "rede social",
    "redes sociais", "legenda", "divulgacao", "divulgar", "portfolio",
    "ideias de conteudo", "publicacao",
  ],
};

const AREAS = Object.keys(SINAIS) as Exclude<AgenteId, "gestao">[];

/** Sinais de que a pergunta é ampla — vai para a Gestão mesmo casando com uma área. */
const SINAIS_DE_GESTAO: readonly string[] = [
  "meu dia", "meu dia a dia", "organize meu dia", "prioridade", "prioridades",
  "minha atencao", "precisa da minha atencao", "o que e mais urgente",
  "visao geral", "panorama geral", "resumo geral", "reuniao", "por onde comeco",
  "o que fazer hoje", "como esta tudo", "como estao as coisas",
];

function casa(texto: string, sinais: readonly string[]): boolean {
  return sinais.some((s) => texto.includes(` ${s} `) || texto.includes(` ${s}`));
}

/**
 * Descobre quem deve cuidar do pedido.
 *
 * Usado só no modo "ALTAR escolhe". Quando ela aponta um agente, a escolha
 * dela vale — inclusive se for a "errada": é a equipe dela.
 */
export function rotear(pedido: string): Roteamento {
  const texto = normalizar(pedido);

  if (casa(texto, SINAIS_DE_GESTAO)) {
    return { agenteId: "gestao", porPadrao: false, areasCitadas: 0 };
  }

  const citadas = AREAS.filter((area) => casa(texto, SINAIS[area]));

  if (citadas.length === 1) {
    return { agenteId: citadas[0], porPadrao: false, areasCitadas: 1 };
  }

  // Nenhuma área ou mais de uma: a Gestão é quem atravessa.
  return {
    agenteId: "gestao",
    porPadrao: citadas.length === 0,
    areasCitadas: citadas.length,
  };
}
