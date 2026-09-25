// ─────────────────────────────────────────────────────────────────────────────
// CAMPANHA E PIPELINE DE QUEM SE INTERESSOU PELO ALTAR
//
// ── DOIS PÚBLICOS QUE NUNCA SE MISTURAM ─────────────────────────────────────
// `leads` são as clientes DA DECORADORA — noivas, aniversariantes. Vivem
// isoladas por `userId` e o painel da ALTAR não as enxerga.
//
// `landingLeads` são decoradoras interessadas NO ALTAR. É deste público que
// este módulo fala, e é por isso que tudo aqui vive atrás de `requireAdmin`.
//
// A fronteira é a regra 5 do CLAUDE.md e tem trava própria
// (`central.fronteiras.test.ts`). Guardar o lead da live em `leads` pareceria
// prático e cruzaria a linha: a decoradora piloto abriria o funil dela e veria
// concorrentes no meio das noivas.
//
// ── POR QUE A CAMPANHA É UMA CONSTANTE, E NÃO UMA TABELA ────────────────────
// Ela tem nome, data, hora e uma observação — valores que não mudam e que
// ninguém edita pela tela. "Leads relacionados" é um filtro pelo slug. Uma
// tabela para guardar isso seria um CRM de marketing construído para responder
// uma dúzia de contagens.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoDeCampanha = "live" | "demonstracao" | "prospeccao";

export type Campanha = {
  slug: string;
  nome: string;
  tipo: TipoDeCampanha;
  /** Dia civil "AAAA-MM-DD". */
  data: string;
  /** "HH:MM" no fuso abaixo — é como ela é anunciada. */
  hora: string;
  /**
   * O fuso em que `hora` foi anunciada.
   *
   * Escrito porque "19:00" sem fuso é uma promessa ambígua para quem assiste
   * de Portugal ou do Acre, e porque o lembrete de 30 minutos precisa saber
   * contra o que comparar.
   */
  timezone: string;
  descricao: string;
  /**
   * O link da sala. AUSENTE = ainda não definido.
   *
   * Nunca inventado, e a tela escreve "Link ainda não definido" em vez de
   * mostrar um campo vazio que parece um defeito de carregamento.
   */
  linkDaReuniao?: string;
  /** Teto de participantes, quando a plataforma impuser um. */
  capacidade?: number;
  observacoes?: string;
};

/** A live de lançamento. O slug é o que fica gravado no lead. */
export const LIVE_ALTAR: Campanha = {
  slug: "live-altar-2026-10-06",
  nome: "Apresentação ALTAR — 06/10/2026",
  tipo: "live",
  data: "2026-10-06",
  hora: "19:00",
  timezone: "America/Sao_Paulo",
  descricao: "Apresentação do ALTAR para empresas de decoração de eventos.",
  // `linkDaReuniao` ausente de propósito: a sala ainda não foi criada, e um
  // link inventado é a única coisa pior do que nenhum link.
};

export const CAMPANHAS: readonly Campanha[] = [LIVE_ALTAR];

export function campanhaPorSlug(slug: string | undefined | null): Campanha | undefined {
  return slug ? CAMPANHAS.find((c) => c.slug === slug) : undefined;
}

// ── A SITUAÇÃO DA CAMPANHA É DERIVADA, NUNCA GRAVADA ────────────────────────

export type SituacaoDaCampanha = "agendada" | "hoje" | "realizada";

/**
 * Onde a campanha está no tempo.
 *
 * Derivada da data, não gravada: um campo `status` editável ficaria em
 * "agendada" para sempre no dia em que ninguém lembrasse de virar a chave, e a
 * tela passaria a convidar para uma live que já aconteceu.
 *
 * `hoje` compara DIA CIVIL, não instante — a campanha continua sendo "hoje"
 * às 22h do dia 06, depois de terminada, porque é assim que quem operou o dia
 * inteiro pensa nela.
 */
export function situacaoDaCampanha(campanha: Campanha, hojeISO: string): SituacaoDaCampanha {
  if (hojeISO < campanha.data) return "agendada";
  if (hojeISO === campanha.data) return "hoje";
  return "realizada";
}

/** Dias civis até a campanha. Negativo depois dela. `0` no próprio dia. */
export function diasAte(campanha: Campanha, hojeISO: string): number {
  const ms = Date.parse(`${campanha.data}T12:00:00Z`) - Date.parse(`${hojeISO}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// ── O PIPELINE ──────────────────────────────────────────────────────────────

export type EstagioDoInteressado =
  | "novo"
  | "contato_preparado"
  | "contatado"
  | "respondeu"
  | "interessado"
  | "confirmou"
  | "participou"
  | "nao_participou"
  | "demonstracao"
  | "testando"
  | "convertido"
  | "descartado";

/**
 * Os MARCOS que uma pessoa já atravessou.
 *
 * ── POR QUE NÃO BASTA A POSIÇÃO NO ARRAY ────────────────────────────────────
 * Enquanto o funil era uma fila reta, "interessados" era "deste índice para
 * frente" e funcionava. Deixou de funcionar quando entraram os DESVIOS:
 *
 *   · `nao_participou` — confirmou e faltou. Está DEPOIS de "confirmou" no
 *     tempo e não deve contar como participante. Por posição, contaria.
 *   · `demonstracao` — recebeu atendimento individual, nunca passou pela
 *     live. Não confirmou presença em nada, e por posição pareceria ter
 *     confirmado.
 *
 * Um `nao_participou` contado como participante inflaria a taxa de
 * comparecimento exatamente no número que a live existe para medir. Por isso
 * cada estágio DECLARA o que a pessoa comprovadamente fez, em vez de deixar a
 * ordem de um array decidir por ela.
 */
export type MarcoDoInteressado =
  | "convidado"
  | "respondeu"
  | "interessado"
  | "confirmou"
  | "participou"
  | "testando"
  | "cliente";

export type DefinicaoDeEstagio = {
  id: EstagioDoInteressado;
  rotulo: string;
  /** O que significa estar aqui, em uma frase. */
  detalhe: string;
  /**
   * Faz parte do caminho até virar cliente?
   *
   * `descartado` não: quem não tem interesse não está "atrás" no funil, está
   * fora dele. Somá-lo ao total de etapas faria toda campanha parecer parada.
   */
  noCaminho: boolean;
  /** O que esta pessoa comprovadamente já fez. Ver `MarcoDoInteressado`. */
  marcos: readonly MarcoDoInteressado[];
  /**
   * Um desvio da linha principal — não é progresso nem retrocesso.
   *
   * A tela agrupa estes à parte para que a coluna do funil continue lendo
   * como uma descida, em vez de virar uma lista de doze caixas iguais.
   */
  ramo: boolean;
};

export const ESTAGIOS: readonly DefinicaoDeEstagio[] = [
  {
    id: "novo",
    rotulo: "Novo",
    detalhe: "Chegou e ninguém falou com ele ainda.",
    noCaminho: true,
    marcos: [],
    ramo: false,
  },
  {
    id: "contato_preparado",
    rotulo: "Convite preparado",
    detalhe: "A mensagem está escrita, esperando uma pessoa enviar.",
    noCaminho: true,
    // Preparado NÃO é convidado. Contar aqui faria a taxa de resposta ter no
    // denominador gente que nunca recebeu nada — e é justamente o erro que
    // faz uma campanha parecer fracassada antes de começar.
    marcos: [],
    ramo: false,
  },
  {
    id: "contatado",
    rotulo: "Convite enviado",
    detalhe: "Uma pessoa enviou o convite. Aguardando resposta.",
    noCaminho: true,
    marcos: ["convidado"],
    ramo: false,
  },
  {
    id: "respondeu",
    rotulo: "Respondeu",
    detalhe: "Deu retorno, e ainda não está claro se tem interesse.",
    noCaminho: true,
    marcos: ["convidado", "respondeu"],
    ramo: false,
  },
  {
    id: "interessado",
    rotulo: "Interessado",
    detalhe: "Respondeu e demonstrou interesse.",
    noCaminho: true,
    marcos: ["convidado", "respondeu", "interessado"],
    ramo: false,
  },
  {
    id: "confirmou",
    rotulo: "Confirmado na live",
    detalhe: "Disse que vem.",
    noCaminho: true,
    marcos: ["convidado", "respondeu", "interessado", "confirmou"],
    ramo: false,
  },
  {
    id: "participou",
    rotulo: "Participou",
    detalhe: "Esteve presente na apresentação.",
    noCaminho: true,
    marcos: ["convidado", "respondeu", "interessado", "confirmou", "participou"],
    ramo: false,
  },
  {
    id: "nao_participou",
    rotulo: "Não participou",
    detalhe: "Tinha confirmado e não veio. Ainda dá para recuperar com uma demonstração.",
    noCaminho: true,
    // Confirmou, não participou. É exatamente o que o marco diz.
    marcos: ["convidado", "respondeu", "interessado", "confirmou"],
    ramo: true,
  },
  {
    id: "demonstracao",
    rotulo: "Demonstração individual",
    detalhe: "Vai ver o ALTAR numa conversa só dele, fora da live.",
    noCaminho: true,
    // Nunca confirmou presença na live — e dizer que confirmou inflaria o
    // número que a live existe para medir.
    marcos: ["convidado", "respondeu", "interessado"],
    ramo: true,
  },
  {
    id: "testando",
    rotulo: "Testando o ALTAR",
    detalhe: "Está usando o produto.",
    noCaminho: true,
    marcos: ["convidado", "respondeu", "interessado", "testando"],
    ramo: false,
  },
  {
    id: "convertido",
    rotulo: "Cliente",
    detalhe: "Assinou.",
    noCaminho: true,
    marcos: ["convidado", "respondeu", "interessado", "testando", "cliente"],
    ramo: false,
  },
  {
    id: "descartado",
    rotulo: "Perdido",
    detalhe: "Disse que não, ou não é público. Fica registrado para não ser abordado de novo.",
    noCaminho: false,
    // Um descartado PODE ter sido convidado antes de dizer não — e nesta
    // estrutura não há como saber. Deixá-lo com zero marcos tiraria gente do
    // denominador da taxa de resposta e a inflaria. Por isso o denominador das
    // taxas não usa marcos de quem saiu: ver `metricasDaCampanha`, que declara
    // a base que usou em vez de escolher uma em silêncio.
    marcos: [],
    ramo: true,
  },
];

const POR_ID = new Map(ESTAGIOS.map((e) => [e.id, e]));

/**
 * O estágio de um registro. AUSENTE = "novo".
 *
 * A leitura é feita em um lugar só porque o ausente tem significado declarado
 * no schema, e dois lugares lendo `?? "novo"` divergem no dia em que o padrão
 * mudar.
 */
export function estagioDe(lead: { status?: string }): EstagioDoInteressado {
  const id = lead.status as EstagioDoInteressado | undefined;
  return id && POR_ID.has(id) ? id : "novo";
}

export function definicaoDoEstagio(id: EstagioDoInteressado): DefinicaoDeEstagio {
  return POR_ID.get(id) ?? ESTAGIOS[0];
}

export function ehEstagio(valor: unknown): valor is EstagioDoInteressado {
  return typeof valor === "string" && POR_ID.has(valor as EstagioDoInteressado);
}

/** O registro mínimo que o funil precisa ler. */
export type InteressadoNoFunil = {
  status?: string;
  marcosEm?: Partial<Record<MarcoDoInteressado, number | undefined>>;
};

/**
 * Esta pessoa já atravessou este marco?
 *
 * ── DUAS EVIDÊNCIAS, NESTA ORDEM ────────────────────────────────────────────
 * 1. O CARIMBO (`marcosEm`), quando existe. É registro do que aconteceu, não
 *    inferência — e sobrevive a voltar de etapa, que é justamente quando a
 *    inferência erra.
 * 2. O que o estágio atual COMPROVA, quando não há carimbo. Cobre os registros
 *    anteriores a `marcosEm` sem backfill e sem inventar data.
 *
 * A segunda evidência é deliberadamente tímida: `testando` não comprova
 * "participou", porque se chega a testando por três caminhos. Na ausência de
 * carimbo, o funil prefere subestimar — uma taxa de comparecimento inflada
 * mente sobre a única coisa que a live existe para medir.
 */
export function alcancou(lead: InteressadoNoFunil, marco: MarcoDoInteressado): boolean {
  if (lead.marcosEm?.[marco] !== undefined) return true;
  return definicaoDoEstagio(estagioDe(lead)).marcos.includes(marco);
}

/**
 * Os carimbos a GRAVAR quando alguém é movido para este estágio.
 *
 * Devolve só os que faltam: carimbo existente nunca é reescrito. Sem essa
 * regra, corrigir uma etapa clicada por engano moveria a data de convite para
 * hoje — e a pessoa esquecida há uma semana voltaria para o fim da fila de
 * follow-up, que é o oposto do que a fila existe para fazer.
 */
export function carimbosAGravar(
  lead: InteressadoNoFunil,
  novoEstagio: EstagioDoInteressado,
  agora: number,
): Partial<Record<MarcoDoInteressado, number>> | undefined {
  const faltando = definicaoDoEstagio(novoEstagio).marcos.filter(
    (m) => lead.marcosEm?.[m] === undefined,
  );
  if (faltando.length === 0) return undefined;
  return Object.fromEntries(faltando.map((m) => [m, agora]));
}

// ── AS CONTAGENS QUE A CAMPANHA PRECISA RESPONDER ───────────────────────────

export type FunilDaCampanha = {
  total: number;
  /** Quantos em cada estágio, na ordem de `ESTAGIOS`. */
  porEstagio: { id: EstagioDoInteressado; rotulo: string; quantidade: number; ramo: boolean }[];
  /** Ainda sem nenhum convite enviado — `novo` ou com a mensagem só preparada. */
  semContato: number;
  /** A mensagem está escrita e ninguém enviou. */
  convitesPreparados: number;
  /** Receberam o convite, em qualquer momento do caminho. */
  convidados: number;
  respostas: number;
  interessados: number;
  confirmados: number;
  participaram: number;
  naoParticiparam: number;
  demonstracoes: number;
  testando: number;
  clientes: number;
  descartados: number;
  /** Convidados que ainda não deram sinal nenhum. É a fila de follow-up. */
  aguardandoResposta: number;
};

/**
 * Todas as contagens da campanha, de uma vez.
 *
 * ── POR QUE OS ACUMULADOS NÃO ENCOLHEM ──────────────────────────────────────
 * "Confirmados" conta quem já participou, porque quem participou tinha
 * confirmado. Contar só quem PAROU em "confirmou" faria o número cair durante
 * a própria live, conforme as pessoas avançassem — e um indicador que despenca
 * quando a campanha dá certo não serve para decidir nada.
 *
 * Quem faz esse acumulado funcionar são os MARCOS, não a posição no array:
 * `nao_participou` tem o marco "confirmou" e não tem o de "participou", que é
 * a única leitura verdadeira de quem confirmou e faltou.
 */
export function funilDaCampanha(leads: readonly InteressadoNoFunil[]): FunilDaCampanha {
  const estagios = leads.map(estagioDe);
  const comMarco = (m: MarcoDoInteressado) => leads.filter((l) => alcancou(l, m)).length;
  const noEstagio = (id: EstagioDoInteressado) => estagios.filter((e) => e === id).length;

  return {
    total: leads.length,
    porEstagio: ESTAGIOS.map((e) => ({
      id: e.id,
      rotulo: e.rotulo,
      quantidade: noEstagio(e.id),
      ramo: e.ramo,
    })),
    semContato: noEstagio("novo") + noEstagio("contato_preparado"),
    convitesPreparados: noEstagio("contato_preparado"),
    convidados: comMarco("convidado"),
    respostas: comMarco("respondeu"),
    interessados: comMarco("interessado"),
    confirmados: comMarco("confirmou"),
    participaram: comMarco("participou"),
    naoParticiparam: noEstagio("nao_participou"),
    demonstracoes: noEstagio("demonstracao"),
    testando: comMarco("testando"),
    clientes: comMarco("cliente"),
    descartados: noEstagio("descartado"),
    // Convidado, sem resposta e ainda não descartado. É quem o follow-up
    // procura — e a conta é por marco, não por estágio, porque um convidado
    // que já virou "interessado" não está mais esperando.
    aguardandoResposta: leads.filter(
      (l) =>
        alcancou(l, "convidado") &&
        !alcancou(l, "respondeu") &&
        estagioDe(l) !== "descartado",
    ).length,
  };
}

// ── AS TAXAS ────────────────────────────────────────────────────────────────

/**
 * Abaixo desta base, a taxa não é mostrada.
 *
 * Um cliente em dois convidados é "50% de conversão", e é uma frase que só
 * serve para enganar quem a lê — inclusive quem escreveu. Abaixo do mínimo a
 * tela mostra os dois números crus e nenhuma porcentagem.
 */
export const BASE_MINIMA_PARA_TAXA = 5;

export type Taxa = {
  chave: string;
  rotulo: string;
  /** O que está sendo contado. */
  numerador: number;
  /** Sobre o quê. Sempre escrito na tela: taxa sem base é propaganda. */
  denominador: number;
  /** A base do denominador, em palavras. */
  baseRotulo: string;
  /** 0–100, ou `null` quando a base é zero ou pequena demais. */
  percentual: number | null;
  /** Por que não há percentual. Ausente quando há. */
  semPercentualPorque?: string;
};

function taxa(
  chave: string,
  rotulo: string,
  numerador: number,
  denominador: number,
  baseRotulo: string,
): Taxa {
  if (denominador <= 0) {
    return {
      chave,
      rotulo,
      numerador,
      denominador,
      baseRotulo,
      percentual: null,
      semPercentualPorque: `Ninguém ${baseRotulo} ainda.`,
    };
  }
  if (denominador < BASE_MINIMA_PARA_TAXA) {
    return {
      chave,
      rotulo,
      numerador,
      denominador,
      baseRotulo,
      percentual: null,
      semPercentualPorque: `Base pequena demais (${denominador}) para virar porcentagem.`,
    };
  }
  return {
    chave,
    rotulo,
    numerador,
    denominador,
    baseRotulo,
    percentual: Math.round((numerador / denominador) * 100),
  };
}

/**
 * As taxas da campanha, cada uma com a base declarada.
 *
 * ── DUAS REGRAS QUE ESTA FUNÇÃO NÃO QUEBRA ──────────────────────────────────
 * Nunca divide por zero, e nunca devolve porcentagem sobre base pequena. As
 * duas produzem o mesmo estrago: um número que parece medição e é ruído, numa
 * tela onde alguém vai decidir se a campanha está indo bem.
 *
 * Os descartados ficam FORA de todos os denominadores, e o rótulo da base diz
 * isso. Quem disse "não" não está atrasado no funil — e mantê-lo no
 * denominador faria o trabalho bem feito de qualificar a lista parecer queda
 * de desempenho.
 */
export function taxasDaCampanha(f: FunilDaCampanha): Taxa[] {
  return [
    taxa("resposta", "Taxa de resposta", f.respostas, f.convidados, "recebeu o convite"),
    taxa("confirmacao", "Taxa de confirmação", f.confirmados, f.respostas, "respondeu"),
    taxa(
      "comparecimento",
      "Taxa de comparecimento",
      f.participaram,
      f.confirmados,
      "confirmou presença",
    ),
    taxa("trial", "Taxa de trial", f.testando, f.participaram, "participou"),
    taxa("conversao", "Taxa de conversão", f.clientes, f.testando, "começou a testar"),
  ];
}

// ── ORIGEM ──────────────────────────────────────────────────────────────────

export type OrigemDoInteressado =
  | "landing"
  | "instagram"
  | "indicacao"
  | "whatsapp"
  | "site"
  | "evento"
  | "live"
  | "prospeccao"
  | "outro";

export const ORIGENS: readonly { id: OrigemDoInteressado; rotulo: string }[] = [
  { id: "landing", rotulo: "Landing page" },
  { id: "instagram", rotulo: "Instagram" },
  { id: "indicacao", rotulo: "Indicação" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "site", rotulo: "Site" },
  { id: "evento", rotulo: "Evento" },
  { id: "live", rotulo: "Live" },
  { id: "prospeccao", rotulo: "Prospecção" },
  { id: "outro", rotulo: "Outro" },
];

/** AUSENTE = veio pela landing, que é a origem de todo registro antigo. */
export function origemDe(lead: { origem?: string }): OrigemDoInteressado {
  const id = lead.origem as OrigemDoInteressado | undefined;
  return id && ORIGENS.some((o) => o.id === id) ? id : "landing";
}

export function rotuloDaOrigem(id: OrigemDoInteressado): string {
  return ORIGENS.find((o) => o.id === id)?.rotulo ?? "Landing page";
}
