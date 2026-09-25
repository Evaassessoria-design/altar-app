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
// A fronteira é a regra 4 do README e tem trava própria
// (`central.fronteiras.test.ts`). Guardar o lead da live em `leads` pareceria
// prático e cruzaria a linha: a decoradora piloto abriria o funil dela e veria
// concorrentes no meio das noivas.
//
// ── POR QUE A CAMPANHA É UMA CONSTANTE, E NÃO UMA TABELA ────────────────────
// Ela tem nome, data, hora e uma observação — quatro valores que não mudam e
// que ninguém edita pela tela. "Leads relacionados" é um filtro pelo slug.
// Uma tabela para guardar isso seria um CRM de marketing construído para
// responder sete contagens.
// ─────────────────────────────────────────────────────────────────────────────

export type Campanha = {
  slug: string;
  nome: string;
  /** Dia civil "AAAA-MM-DD". */
  data: string;
  /** "HH:MM", fuso de Brasília — é como ela é anunciada. */
  hora: string;
  descricao: string;
};

/** A live de lançamento. O slug é o que fica gravado no lead. */
export const LIVE_ALTAR: Campanha = {
  slug: "live-altar-2026-10-06",
  nome: "Live ALTAR",
  data: "2026-10-06",
  hora: "19:00",
  descricao: "Apresentação do ALTAR para decoradoras de eventos.",
};

export const CAMPANHAS: readonly Campanha[] = [LIVE_ALTAR];

export function campanhaPorSlug(slug: string | undefined | null): Campanha | undefined {
  return slug ? CAMPANHAS.find((c) => c.slug === slug) : undefined;
}

// ── O PIPELINE ──────────────────────────────────────────────────────────────

export type EstagioDoInteressado =
  | "novo"
  | "contato_preparado"
  | "contatado"
  | "interessado"
  | "confirmou"
  | "participou"
  | "testando"
  | "convertido"
  | "descartado";

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
};

export const ESTAGIOS: readonly DefinicaoDeEstagio[] = [
  { id: "novo", rotulo: "Novo", detalhe: "Chegou e ninguém falou com ele ainda.", noCaminho: true },
  {
    id: "contato_preparado",
    rotulo: "Contato preparado",
    detalhe: "A mensagem está escrita, esperando uma pessoa enviar.",
    noCaminho: true,
  },
  { id: "contatado", rotulo: "Contatado", detalhe: "Alguém já falou com ele.", noCaminho: true },
  {
    id: "interessado",
    rotulo: "Interessado",
    detalhe: "Respondeu e demonstrou interesse.",
    noCaminho: true,
  },
  { id: "confirmou", rotulo: "Confirmou presença", detalhe: "Disse que vem.", noCaminho: true },
  { id: "participou", rotulo: "Participou", detalhe: "Esteve presente.", noCaminho: true },
  { id: "testando", rotulo: "Testando o ALTAR", detalhe: "Está usando o produto.", noCaminho: true },
  { id: "convertido", rotulo: "Cliente", detalhe: "Assinou.", noCaminho: true },
  {
    id: "descartado",
    rotulo: "Não interessado",
    detalhe: "Disse que não. Fica registrado para não ser abordado de novo.",
    noCaminho: false,
  },
];

/**
 * O estágio de um registro. AUSENTE = "novo".
 *
 * A leitura é feita em um lugar só porque o ausente tem significado declarado
 * no schema, e dois lugares lendo `?? "novo"` divergem no dia em que o padrão
 * mudar.
 */
export function estagioDe(lead: { status?: string }): EstagioDoInteressado {
  const id = lead.status as EstagioDoInteressado | undefined;
  return id && ESTAGIOS.some((e) => e.id === id) ? id : "novo";
}

export function definicaoDoEstagio(id: EstagioDoInteressado): DefinicaoDeEstagio {
  return ESTAGIOS.find((e) => e.id === id) ?? ESTAGIOS[0];
}

// ── AS CONTAGENS QUE A CAMPANHA PRECISA RESPONDER ───────────────────────────

export type FunilDaCampanha = {
  total: number;
  /** Quantos em cada estágio, na ordem de `ESTAGIOS`. */
  porEstagio: { id: EstagioDoInteressado; rotulo: string; quantidade: number }[];
  /** Ainda sem nenhum contato — `novo` ou com a mensagem só preparada. */
  semContato: number;
  /** Demonstrou interesse ou foi além disso. */
  interessados: number;
  confirmados: number;
  participaram: number;
  testando: number;
  clientes: number;
  descartados: number;
};

/** Do estágio para frente, incluindo ele — a ordem de `ESTAGIOS` é o caminho. */
function daquiParaFrente(estagio: EstagioDoInteressado): Set<EstagioDoInteressado> {
  const caminho = ESTAGIOS.filter((e) => e.noCaminho);
  const i = caminho.findIndex((e) => e.id === estagio);
  return new Set(caminho.slice(i < 0 ? caminho.length : i).map((e) => e.id));
}

/**
 * As sete perguntas da campanha, respondidas de uma vez.
 *
 * ── POR QUE "CONFIRMADOS" CONTA QUEM JÁ PARTICIPOU ──────────────────────────
 * Porque quem participou tinha confirmado. Contar só quem PAROU em "confirmou"
 * faria o número encolher ao longo da própria live, conforme as pessoas
 * avançassem — e um indicador que cai quando a campanha dá certo não serve
 * para decidir nada.
 *
 * `descartado` fica fora de todos os acumulados: quem disse não não está atrás
 * no funil, está fora dele.
 */
export function funilDaCampanha(
  leads: readonly { status?: string }[],
): FunilDaCampanha {
  const estagios = leads.map(estagioDe);
  const conta = (ids: Set<EstagioDoInteressado>) =>
    estagios.filter((e) => ids.has(e)).length;

  return {
    total: leads.length,
    porEstagio: ESTAGIOS.map((e) => ({
      id: e.id,
      rotulo: e.rotulo,
      quantidade: estagios.filter((x) => x === e.id).length,
    })),
    semContato: estagios.filter((e) => e === "novo" || e === "contato_preparado").length,
    interessados: conta(daquiParaFrente("interessado")),
    confirmados: conta(daquiParaFrente("confirmou")),
    participaram: conta(daquiParaFrente("participou")),
    testando: conta(daquiParaFrente("testando")),
    clientes: conta(daquiParaFrente("convertido")),
    descartados: estagios.filter((e) => e === "descartado").length,
  };
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
