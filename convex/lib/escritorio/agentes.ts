// ─────────────────────────────────────────────────────────────────────────────
// O CATÁLOGO DA EQUIPE — SETE PAPÉIS, EM CÓDIGO
//
// ── POR QUE CONSTANTE E NÃO TABELA ──────────────────────────────────────────
// Agente não é dado da decoradora: é PRODUTO. Uma tabela pediria cadastro que
// ninguém quer fazer, criaria a pergunta "posso apagar o Financeiro?" e
// obrigaria cada conta a ter as sete linhas semeadas — com a primeira que
// falhasse virando uma conta sem equipe.
//
// Em código, os sete existem para todo mundo no instante em que a conta nasce,
// e mudar o que um deles pode consultar é uma linha de diff revisável, não uma
// migração.
//
// ── O QUE UM AGENTE É, TECNICAMENTE ─────────────────────────────────────────
// Um NOME, uma FUNÇÃO e — a parte que importa — uma lista fechada de FONTES.
// Não existe "acesso ao banco". Existe um conjunto nomeado de consultas que
// aquele papel pode ler, e o executor recusa qualquer outra.
//
// É a diferença entre "IA, aqui está o banco, descubra" e "IA, aqui estão os
// recebimentos vencidos desta conta, escreva sobre eles".
//
// ── OS NOMES SÃO OS DO PRODUTO ──────────────────────────────────────────────
// Financeiro, Comercial, Compras, Fornecedores, Acervo — são as palavras que
// já estão no menu do ALTAR. Nenhum personagem, nenhum apelido: a decoradora
// não precisa aprender um segundo vocabulário para falar com a própria equipe.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As fontes de dados que um agente pode consultar.
 *
 * Cada uma corresponde a UMA consulta conhecida do executor, sobre dados JÁ
 * isolados por conta pelos guardas de `lib/identity.ts`. Acrescentar uma fonte
 * exige tocar nesta lista, no executor e no teste — que é exatamente a
 * fricção desejada.
 */
export const FONTES = [
  "financeiro.resumo",
  "financeiro.vencidos",
  "comercial.funil",
  "comercial.propostas",
  "compras.panorama",
  "eventos.proximos",
  "eventos.atencao",
  "acervo.itens",
  "fornecedores.catalogo",
] as const;

export type Fonte = (typeof FONTES)[number];

/** Como a fonte é chamada na tela. A decoradora nunca lê o nome técnico. */
export const ROTULO_DA_FONTE: Record<Fonte, string> = {
  "financeiro.resumo": "Resumo financeiro",
  "financeiro.vencidos": "Contas vencidas",
  "comercial.funil": "Funil de oportunidades",
  "comercial.propostas": "Propostas",
  "compras.panorama": "Painel de compras",
  "eventos.proximos": "Próximos eventos",
  "eventos.atencao": "Eventos que pedem atenção",
  "acervo.itens": "Acervo",
  "fornecedores.catalogo": "Catálogo de fornecedores",
};

export const AGENTES_IDS = [
  "gestao",
  "financeiro",
  "comercial",
  "compras",
  "producao",
  "fornecedores",
  "marketing",
] as const;

export type AgenteId = (typeof AGENTES_IDS)[number];

export type Agente = {
  id: AgenteId;
  /** Como ela chama esta pessoa. */
  nome: string;
  /** O cargo, numa linha. */
  funcao: string;
  /** Uma frase sobre o que ele resolve. */
  descricao: string;
  /** O que ele sabe fazer, em linguagem de gente. */
  capacidades: readonly string[];
  /** As ÚNICAS consultas que ele alcança. */
  fontes: readonly Fonte[];
  /** O que ele nunca faz — mostrado na tela, não só no código. */
  proibicoes: readonly string[];
};

/**
 * As proibições que valem para TODOS, sem exceção.
 *
 * Repetidas em cada cartão de propósito: a decoradora precisa poder ler, sem
 * abrir documentação, que ninguém ali mexe no dinheiro dela.
 */
export const PROIBICOES_COMUNS: readonly string[] = [
  "Movimentar dinheiro",
  "Apagar ou alterar dados",
  "Enviar mensagem, e-mail ou WhatsApp",
  "Mexer na assinatura do ALTAR",
];

export const AGENTES: readonly Agente[] = [
  {
    id: "gestao",
    nome: "Gestão",
    funcao: "Coordenação",
    descricao:
      "Junta as pontas quando a pergunta é ampla: o que precisa da sua atenção, o que está atrasado, por onde começar o dia.",
    capacidades: [
      "Organizar as prioridades do dia",
      "Cruzar eventos, dinheiro, compras e oportunidades",
      "Preparar um resumo para uma reunião",
    ],
    // O Gestor vê tudo porque a pergunta dele é justamente a que atravessa as
    // áreas. Continua sendo uma lista fechada — "tudo" aqui são nove consultas
    // nomeadas, não o banco.
    fontes: [...FONTES],
    proibicoes: [...PROIBICOES_COMUNS],
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    funcao: "Contas e recebimentos",
    descricao:
      "Olha o que entrou, o que saiu, o que venceu e o que ainda vai vencer. Analisa; nunca movimenta.",
    capacidades: [
      "Listar recebimentos e pagamentos vencidos",
      "Resumir entradas, saídas e resultado",
      "Apontar o que está sem comprovante",
    ],
    fontes: ["financeiro.resumo", "financeiro.vencidos", "eventos.proximos"],
    proibicoes: [...PROIBICOES_COMUNS, "Dar baixa em lançamento", "Emitir cobrança"],
  },
  {
    id: "comercial",
    nome: "Comercial",
    funcao: "Funil e propostas",
    descricao:
      "Cuida das oportunidades: quem está parado, quem precisa de retorno, qual proposta venceu.",
    capacidades: [
      "Apontar oportunidades sem próxima ação",
      "Listar quem está há muito tempo sem contato",
      "Apontar propostas vencidas ou sem resposta",
      "Redigir um rascunho de retorno para você enviar",
    ],
    fontes: ["comercial.funil", "comercial.propostas"],
    proibicoes: [...PROIBICOES_COMUNS, "Mover oportunidade de etapa", "Falar com a cliente"],
  },
  {
    id: "compras",
    nome: "Compras",
    funcao: "Necessidades e prazos",
    descricao:
      "Sabe o que falta comprar, o que está atrasado e o que ainda não entrou no financeiro.",
    capacidades: [
      "Apontar compras atrasadas e as da semana",
      "Mostrar o que está sem preço ou sem prazo",
      "Apontar o custo que ainda está fora do livro-caixa",
    ],
    fontes: ["compras.panorama", "fornecedores.catalogo"],
    proibicoes: [...PROIBICOES_COMUNS, "Fazer pedido a fornecedor", "Marcar compra como recebida"],
  },
  {
    id: "producao",
    nome: "Produção",
    funcao: "Eventos e montagem",
    descricao:
      "Acompanha os próximos eventos: o que está pronto, o que falta e o que pede atenção agora.",
    capacidades: [
      "Resumir a situação dos próximos eventos",
      "Apontar o que falta em cada um",
      "Dizer qual evento está pedindo atenção e por quê",
    ],
    fontes: ["eventos.proximos", "eventos.atencao", "compras.panorama"],
    proibicoes: [...PROIBICOES_COMUNS, "Alterar checklist", "Escalar equipe"],
  },
  {
    id: "fornecedores",
    nome: "Fornecedores e Acervo",
    funcao: "Parceiros e peças",
    descricao:
      "Conhece com quem você trabalha e o que é seu: peças reservadas, o que saiu e o que ainda não voltou.",
    capacidades: [
      "Mostrar o acervo e o que está comprometido",
      "Apontar peças que saíram e não voltaram",
      "Lembrar com quem você já trabalhou",
    ],
    fontes: ["fornecedores.catalogo", "acervo.itens", "eventos.proximos"],
    proibicoes: [...PROIBICOES_COMUNS, "Reservar peça", "Contratar fornecedor"],
  },
  {
    id: "marketing",
    nome: "Marketing",
    funcao: "Conteúdo e relacionamento",
    descricao:
      "Ajuda a falar do seu trabalho. Escreve rascunhos a partir do que você já fez — e não publica nada.",
    capacidades: [
      "Sugerir ideias de conteúdo a partir dos seus eventos",
      "Escrever rascunhos de legenda e de texto",
      "Apontar eventos recentes que renderiam publicação",
    ],
    // Marketing lê os EVENTOS para ter do que falar — nunca o financeiro, nunca
    // o funil. Conteúdo não precisa saber quanto a cliente pagou.
    fontes: ["eventos.proximos"],
    proibicoes: [...PROIBICOES_COMUNS, "Publicar em rede social", "Ver dados financeiros"],
  },
];

const POR_ID = new Map(AGENTES.map((a) => [a.id, a]));

/** O agente, ou `undefined` para um id que não existe. Nunca lança. */
export function agentePorId(id: string | undefined | null): Agente | undefined {
  return id ? POR_ID.get(id as AgenteId) : undefined;
}

export function ehAgenteId(valor: unknown): valor is AgenteId {
  return typeof valor === "string" && POR_ID.has(valor as AgenteId);
}

/**
 * Esta fonte é permitida para este agente?
 *
 * É a pergunta que o executor faz antes de CADA consulta. Sem ela, um agente
 * ganharia por acidente o alcance de outro — e o Marketing leria o financeiro.
 */
export function podeConsultar(agente: Agente, fonte: Fonte): boolean {
  return agente.fontes.includes(fonte);
}
