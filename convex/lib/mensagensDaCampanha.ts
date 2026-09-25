import {
  LIVE_ALTAR,
  origemDe,
  type Campanha,
  type EstagioDoInteressado,
  type OrigemDoInteressado,
} from "./campanha";

// ─────────────────────────────────────────────────────────────────────────────
// AS MENSAGENS DA CAMPANHA — DEZ MODELOS, NENHUM ENVIO
//
// ── A TRAVA, ESCRITA EM CÓDIGO ──────────────────────────────────────────────
// Este módulo recebe dados e devolve texto. Não tem `fetch`, não tem `ctx`,
// não conhece WhatsApp, e-mail nem número de saída. O último passo — apertar
// enviar — é de uma pessoa, sempre. Há trava de leitura de fonte cobrando isso
// em `mensagens.campanha.test.ts`.
//
// ── POR QUE MODELO DE TEXTO, E NÃO CHAMADA DE IA ────────────────────────────
//   1. A live não pode depender de uma chamada externa que pode falhar ao
//      vivo. Modelo responde sempre, em microssegundos, de graça.
//   2. O rascunho precisa ser PREVISÍVEL. Quem manda trinta mensagens revisa
//      uma e confia nas outras vinte e nove; texto diferente a cada chamada
//      obriga a ler todas.
//   3. Nada aqui inventa fato. Só interpola o que está GRAVADO — nome,
//      empresa, data e hora da campanha.
//
// ── O DEFEITO QUE A ORIGEM CORRIGE ──────────────────────────────────────────
// A copy original do convite abre com "Você entrou em contato com a gente há um
// tempo demonstrando interesse em conhecer o ALTAR".
//
// É verdade para quem preencheu a landing. É FALSO para quem veio de uma lista
// de prospecção — e abrir uma primeira conversa afirmando um contato que nunca
// houve é a forma mais rápida de queimar o número. Por isso a linha de abertura
// olha a origem do registro: quem chegou sozinho ouve que chegou sozinho, e
// quem foi prospectado ouve a verdade, que é um convite frio bem-educado.
//
// ── O QUE NENHUM MODELO DIZ ─────────────────────────────────────────────────
// Preço, desconto, prazo de teste, promessa de resultado. Um rascunho que
// promete condição vira promessa quando alguém envia sem ler. Condição
// comercial é conversa, não modelo de texto.
// ─────────────────────────────────────────────────────────────────────────────

export type CanalSugerido = "whatsapp" | "email";

export const TIPOS_DE_MENSAGEM = [
  "convite",
  "follow_up_sem_resposta",
  "pedido_de_email",
  "confirmacao",
  "lembrete_24h",
  "lembrete_30min",
  "agradecimento_pos_live",
  "faltou_a_live",
  "convite_demonstracao",
  "convite_trial",
] as const;

export type TipoDeMensagem = (typeof TIPOS_DE_MENSAGEM)[number];

export type ContextoDaMensagem = {
  /** Nome completo como está gravado. O modelo extrai o primeiro. */
  nome: string;
  empresa?: string;
  /** De onde veio. Decide a linha de abertura do convite. */
  origem?: string;
  campanha?: Campanha;
};

/**
 * O texto pronto e o que falta nele.
 *
 * ── POR QUE A PENDÊNCIA VEM JUNTO COM O TEXTO ───────────────────────────────
 * O lembrete precisa do link da sala, e a sala ainda não existe. Duas saídas
 * ruins: inventar um link, ou devolver um texto com um buraco silencioso que
 * alguém envia sem perceber.
 *
 * A terceira é esta: o texto sai com o buraco MARCADO e a pendência sobe junto,
 * para a tela poder recusar a aprovação enquanto ela existir.
 */
export type MensagemRedigida = {
  texto: string;
  /** O que precisa ser preenchido por uma pessoa antes de enviar. */
  pendencias: string[];
};

export type ModeloDeMensagem = {
  id: TipoDeMensagem;
  rotulo: string;
  /** Quando usar, em uma frase — é o que a tela mostra na escolha. */
  quandoUsar: string;
  canal: CanalSugerido;
  /** Os estágios em que esta mensagem faz sentido. Fora deles, não se oferece. */
  estagios: readonly EstagioDoInteressado[];
  /** O que fazer DEPOIS de enviar. Nunca automático. */
  proximaAcao: string;
  /**
   * Para onde mover a pessoa depois que alguém enviar de fato.
   *
   * SUGESTÃO, não execução: quem move é a pessoa, no botão. Ausente quando
   * enviar não muda etapa nenhuma (um lembrete não faz ninguém avançar).
   */
  estagioApos?: EstagioDoInteressado;
  redigir: (c: ContextoDaMensagem) => MensagemRedigida;
};

// ── Peças comuns ────────────────────────────────────────────────────────────

/**
 * O primeiro nome, para a mensagem não começar com o nome completo.
 *
 * "Olá, Maria Fernanda Albuquerque dos Santos" é e-mail de banco. Nome vazio
 * devolve `null` e a saudação sai sem nome — melhor do que "Olá, !".
 */
export function primeiroNome(nome: string): string | null {
  const limpo = nome.trim().split(/\s+/)[0] ?? "";
  return limpo.length > 0 ? limpo : null;
}

function saudacao(c: ContextoDaMensagem): string {
  const nome = primeiroNome(c.nome);
  return nome ? `Olá, ${nome}! Tudo bem?` : "Olá! Tudo bem?";
}

/** "06/10" — a data como se fala, não como o banco guarda. */
export function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return mes && dia ? `${dia}/${mes}` : iso;
}

function campanhaDe(c: ContextoDaMensagem): Campanha {
  return c.campanha ?? LIVE_ALTAR;
}

/** As origens em que a pessoa procurou a ALTAR por conta própria. */
const VEIO_SOZINHA: ReadonlySet<OrigemDoInteressado> = new Set([
  "landing",
  "site",
  "whatsapp",
  "instagram",
  "indicacao",
]);

/**
 * A linha que explica por que esta pessoa está recebendo a mensagem.
 *
 * Quem se cadastrou ouve que se cadastrou. Quem foi prospectado ouve que foi
 * procurado — sem fingir um contato anterior que não existiu.
 */
function porQueEstouFalandoComVoce(c: ContextoDaMensagem): string {
  if (VEIO_SOZINHA.has(origemDe({ origem: c.origem }))) {
    return "Você entrou em contato com a gente há um tempo demonstrando interesse em conhecer o ALTAR, nossa plataforma criada especialmente para empresas de decoração de eventos.";
  }
  // Prospecção: citar a empresa mostra que não é disparo cego, e é um dado que
  // quem montou a lista já tinha. Sem elogio ao trabalho dela — "vi que você
  // faz casamentos lindos" denuncia mensagem automática justamente quando
  // tenta escondê-la.
  const empresa = c.empresa?.trim();
  return empresa
    ? `Estou falando com empresas de decoração de eventos para apresentar o ALTAR, uma plataforma criada especialmente para esse trabalho — e cheguei até a ${empresa}.`
    : "Estou falando com empresas de decoração de eventos para apresentar o ALTAR, uma plataforma criada especialmente para esse trabalho.";
}

const ASSINATURA = ["Matheus", "ALTAR"];

/** O que o ALTAR faz, na ordem em que a decoradora trabalha. */
const O_QUE_O_ALTAR_FAZ =
  "eventos, financeiro, compras, fornecedores, acervo, propostas, projeto visual e recursos de Inteligência Artificial";

/**
 * O link da sala, ou a pendência que impede a mensagem de sair.
 *
 * Nunca inventa. Quando não há link, o texto carrega um marcador visível e a
 * pendência sobe para a tela poder barrar a aprovação.
 */
function linkOuPendencia(campanha: Campanha): { linha: string; pendencia?: string } {
  if (campanha.linkDaReuniao) return { linha: campanha.linkDaReuniao };
  return {
    linha: "[LINK DA SALA — ainda não definido]",
    pendencia: "O link da sala ainda não foi definido na campanha.",
  };
}

function texto(linhas: string[], pendencias: string[] = []): MensagemRedigida {
  return { texto: linhas.join("\n").trim(), pendencias };
}

// ── Os dez modelos ──────────────────────────────────────────────────────────

export const MODELOS: readonly ModeloDeMensagem[] = [
  {
    id: "convite",
    rotulo: "Convite para a apresentação",
    quandoUsar: "A primeira mensagem, para quem ainda não foi abordado.",
    canal: "whatsapp",
    estagios: ["novo", "contato_preparado"],
    proximaAcao: 'Marcar "Convite enviado" depois de mandar.',
    estagioApos: "contatado",
    redigir: (c) => {
      const campanha = campanhaDe(c);
      return texto([
        saudacao(c),
        "",
        "Aqui é o Matheus, do ALTAR.",
        "",
        porQueEstouFalandoComVoce(c),
        "",
        `No dia ${diaEMes(campanha.data)}, às ${campanha.hora}, vamos realizar uma apresentação ao vivo para um grupo de decoradores e queria te fazer um convite especial.`,
        "",
        `Vamos mostrar na prática como o ALTAR centraliza ${O_QUE_O_ALTAR_FAZ}.`,
        "",
        "Se quiser participar, me responda QUERO PARTICIPAR e envie o melhor e-mail da sua empresa.",
        "",
        "Vamos colocar você na lista e enviar as informações e o lembrete da apresentação.",
        "",
        ...ASSINATURA,
      ]);
    },
  },
  {
    id: "follow_up_sem_resposta",
    rotulo: "Follow-up de quem não respondeu",
    quandoUsar: "Recebeu o convite há alguns dias e não deu retorno.",
    canal: "whatsapp",
    estagios: ["contatado"],
    proximaAcao: "Se não responder a este, parar e tentar de novo perto da data.",
    redigir: (c) => {
      const campanha = campanhaDe(c);
      return texto([
        saudacao(c),
        "",
        `Passando rapidinho para saber se você chegou a ver o convite da apresentação do ALTAR, no dia ${diaEMes(campanha.data)} às ${campanha.hora}.`,
        "",
        "Se fizer sentido para você, me responde que eu te coloco na lista. Se não for o momento, é só me dizer que eu não te incomodo mais.",
        "",
        ...ASSINATURA,
      ]);
    },
  },
  {
    id: "pedido_de_email",
    rotulo: "Pedido do e-mail",
    quandoUsar: "Disse que quer participar, mas não mandou o e-mail.",
    canal: "whatsapp",
    estagios: ["respondeu", "interessado"],
    proximaAcao: 'Com o e-mail em mãos, marcar "Confirmado na live".',
    redigir: (c) =>
      texto([
        saudacao(c),
        "",
        "Que bom que você quer participar!",
        "",
        "Me envia o melhor e-mail da sua empresa? É por ele que vão as informações da apresentação e o lembrete no dia.",
        "",
        ...ASSINATURA,
      ]),
  },
  {
    id: "confirmacao",
    rotulo: "Confirmação de inscrição",
    quandoUsar: "Já está na lista. Confirma a vaga e a data.",
    canal: "email",
    estagios: ["interessado", "confirmou"],
    proximaAcao: "Nada. O próximo contato é o lembrete de 24h.",
    estagioApos: "confirmou",
    redigir: (c) => {
      const campanha = campanhaDe(c);
      const link = linkOuPendencia(campanha);
      return texto(
        [
          saudacao(c),
          "",
          "Sua vaga na apresentação do ALTAR está confirmada.",
          "",
          `Data: ${diaEMes(campanha.data)}`,
          `Horário: ${campanha.hora} (horário de Brasília)`,
          `Link: ${link.linha}`,
          "",
          `Vamos mostrar na prática como o ALTAR centraliza ${O_QUE_O_ALTAR_FAZ}.`,
          "",
          "Se surgir qualquer dúvida antes do dia, é só responder aqui.",
          "",
          ...ASSINATURA,
        ],
        link.pendencia ? [link.pendencia] : [],
      );
    },
  },
  {
    id: "lembrete_24h",
    rotulo: "Lembrete de 24 horas",
    quandoUsar: "Na véspera, para quem confirmou.",
    canal: "whatsapp",
    estagios: ["confirmou"],
    proximaAcao: "Mandar o lembrete de 30 minutos no dia.",
    redigir: (c) => {
      const campanha = campanhaDe(c);
      const link = linkOuPendencia(campanha);
      return texto(
        [
          saudacao(c),
          "",
          `É amanhã! A apresentação do ALTAR é ${diaEMes(campanha.data)}, às ${campanha.hora} (horário de Brasília).`,
          "",
          `Link: ${link.linha}`,
          "",
          "Se puder entrar uns minutinhos antes, melhor. Até amanhã!",
          "",
          ...ASSINATURA,
        ],
        link.pendencia ? [link.pendencia] : [],
      );
    },
  },
  {
    id: "lembrete_30min",
    rotulo: "Lembrete de 30 minutos",
    quandoUsar: "Meia hora antes de começar.",
    canal: "whatsapp",
    estagios: ["confirmou"],
    proximaAcao: 'Depois da live, marcar "Participou" ou "Não participou".',
    redigir: (c) => {
      const campanha = campanhaDe(c);
      const link = linkOuPendencia(campanha);
      return texto(
        [
          saudacao(c),
          "",
          `Começamos em 30 minutos, às ${campanha.hora}.`,
          "",
          `Link: ${link.linha}`,
          "",
          "Te espero lá!",
          "",
          ...ASSINATURA,
        ],
        link.pendencia ? [link.pendencia] : [],
      );
    },
  },
  {
    id: "agradecimento_pos_live",
    rotulo: "Agradecimento pós-apresentação",
    quandoUsar: "Para quem participou, no dia seguinte.",
    canal: "whatsapp",
    estagios: ["participou"],
    proximaAcao: "Se demonstrar interesse, mandar o convite para testar.",
    redigir: (c) =>
      texto([
        saudacao(c),
        "",
        "Obrigado por participar da apresentação do ALTAR ontem. Foi muito bom ter você lá.",
        "",
        "Ficou alguma dúvida sobre alguma parte que a gente mostrou? Pode perguntar à vontade.",
        "",
        ...ASSINATURA,
      ]),
  },
  {
    id: "faltou_a_live",
    rotulo: "Não conseguiu participar",
    quandoUsar: "Confirmou e não apareceu.",
    canal: "whatsapp",
    estagios: ["nao_participou", "confirmou"],
    proximaAcao: 'Se aceitar, marcar "Demonstração individual".',
    redigir: (c) =>
      texto([
        saudacao(c),
        "",
        "Senti sua falta na apresentação de ontem — imagino que o dia tenha sido corrido.",
        "",
        "Se quiser, eu te mostro o ALTAR numa conversa só nossa, no horário que for melhor para você. São uns 30 minutos.",
        "",
        "Me diz um dia e um horário bons?",
        "",
        ...ASSINATURA,
      ]),
  },
  {
    id: "convite_demonstracao",
    rotulo: "Convite para demonstração individual",
    quandoUsar: "Não pôde ir à live, ou prefere uma conversa reservada.",
    canal: "whatsapp",
    estagios: ["respondeu", "interessado", "nao_participou"],
    proximaAcao: 'Com dia e horário combinados, marcar "Demonstração individual".',
    estagioApos: "demonstracao",
    redigir: (c) =>
      texto([
        saudacao(c),
        "",
        "Que tal eu te mostrar o ALTAR numa conversa só nossa?",
        "",
        `A gente abre o sistema com um evento montado dentro dele e passa por ${O_QUE_O_ALTAR_FAZ}. Uns 30 minutos, e você pergunta o que quiser no meio.`,
        "",
        "Me diz um dia e um horário bons para você?",
        "",
        ...ASSINATURA,
      ]),
  },
  {
    id: "convite_trial",
    rotulo: "Convite para testar",
    quandoUsar: "Já viu o ALTAR e demonstrou interesse.",
    canal: "whatsapp",
    estagios: ["participou", "demonstracao", "interessado"],
    proximaAcao: 'Quando a conta for criada, marcar "Testando o ALTAR".',
    estagioApos: "testando",
    redigir: (c) => {
      // Nenhuma condição comercial aqui de propósito: prazo, preço e desconto
      // são conversa, e um modelo de texto que os promete vira promessa no
      // instante em que alguém envia sem ler.
      const empresa = c.empresa?.trim();
      return texto([
        saudacao(c),
        "",
        "Você quer experimentar o ALTAR com um evento de verdade?",
        "",
        empresa
          ? `A gente cria a conta da ${empresa} e você monta um dos seus eventos lá dentro — do briefing ao projeto visual que a cliente recebe.`
          : "A gente cria a sua conta e você monta um dos seus eventos lá dentro — do briefing ao projeto visual que a cliente recebe.",
        "",
        "Me confirma o melhor e-mail que eu preparo o acesso?",
        "",
        ...ASSINATURA,
      ]);
    },
  },
];

const MODELO_POR_ID = new Map(MODELOS.map((m) => [m.id, m]));

export function modeloPorId(id: string | undefined | null): ModeloDeMensagem | undefined {
  return id ? MODELO_POR_ID.get(id as TipoDeMensagem) : undefined;
}

export function ehTipoDeMensagem(valor: unknown): valor is TipoDeMensagem {
  return typeof valor === "string" && MODELO_POR_ID.has(valor as TipoDeMensagem);
}

/**
 * Os modelos que fazem sentido para quem está NESTE estágio.
 *
 * Oferecer os dez sempre faria a tela pedir uma decisão que o sistema já sabe
 * tomar — e mandar lembrete de 24h para quem nunca foi convidado é o tipo de
 * erro que só aparece depois de enviado.
 */
export function modelosPara(estagio: EstagioDoInteressado): ModeloDeMensagem[] {
  return MODELOS.filter((m) => m.estagios.includes(estagio));
}
