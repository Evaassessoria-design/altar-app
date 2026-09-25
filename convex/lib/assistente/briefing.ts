// ─────────────────────────────────────────────────────────────────────────────
// O BRIEFING DA MANHÃ — O ALTAR OLHA ANTES DE SER PERGUNTADO
//
// ── A MUDANÇA QUE ESTE MÓDULO REPRESENTA ────────────────────────────────────
// Até aqui o Assistente era reativo: ela pergunta, ele responde. Funciona, e
// tem um defeito estrutural — ela só descobre o que perguntou. O recebimento
// que venceu ontem fica invisível até alguém lembrar de procurá-lo.
//
// Aqui a ordem inverte. O ALTAR olha as sete áreas, separa o que importa do
// que é barulho, e apresenta. Ela decide.
//
// ── POR QUE ISTO NÃO É UMA TABELA ───────────────────────────────────────────
// Um briefing GRAVADO envelhece: ela paga o boleto às 9h e o "2 recebimentos
// vencidos" continua lá até alguém regerar. Derivado, ele já nasce certo — e
// some sozinho quando o problema some. É a regra da casa aplicada ao lugar
// onde ela mais importa: a primeira tela do dia.
//
// ── QUATRO GRAVIDADES, E A DE BAIXO É A QUE MAIS IMPORTA ────────────────────
//   CRÍTICO      dinheiro vencido, evento em menos de sete dias com buraco
//   ATENÇÃO      tem prazo e ainda dá tempo
//   OPORTUNIDADE ninguém perde nada se ignorar, e ganha se olhar
//   INFORMATIVO  o sistema viu, ela não precisa fazer nada
//
// Sem "informativo" tudo vira alerta, e uma tela em que tudo é alerta é uma
// tela em que nada é. A classificação existe para que CRÍTICO continue
// significando alguma coisa na terceira semana de uso.
//
// ── O QUE O BRIEFING NUNCA FAZ ──────────────────────────────────────────────
// Não inventa métrica. Não diz "preparei 5 rascunhos" quando não preparou
// nenhum. Não transforma ausência de dado em zero. Cada linha carrega o número
// que a gerou, e quem discordar consegue apontar onde olhar.
// ─────────────────────────────────────────────────────────────────────────────

export const GRAVIDADES = ["critico", "atencao", "oportunidade", "informativo"] as const;
export type Gravidade = (typeof GRAVIDADES)[number];

export const AREAS = [
  "financeiro",
  "comercial",
  "eventos",
  "compras",
  "producao",
  "fornecedores",
  "acervo",
] as const;
export type AreaDoBriefing = (typeof AREAS)[number];

export const ROTULO_DA_AREA: Record<AreaDoBriefing, string> = {
  financeiro: "Financeiro",
  comercial: "Comercial",
  eventos: "Eventos",
  compras: "Compras",
  producao: "Produção",
  fornecedores: "Fornecedores",
  acervo: "Acervo",
};

export type ItemDoBriefing = {
  chave: string;
  area: AreaDoBriefing;
  gravidade: Gravidade;
  /** A frase, com o número dentro. Nunca "algumas pendências". */
  titulo: string;
  detalhe?: string;
  /** A tela onde isto se resolve. */
  destino: string;
  /** Quantas coisas. Ordena, e impede a tela de afirmar sem contar. */
  quantidade: number;
  /**
   * Isto exige uma DECISÃO dela, não uma execução.
   *
   * Separado da gravidade de propósito: "2 recebimentos vencidos" é crítico e
   * é execução (cobrar); "proposta de 18 mil parada há 12 dias" é uma decisão
   * comercial. Misturar os dois faz a fila de decisões encher de tarefa.
   */
  precisaDeVoce?: boolean;
};

/**
 * Os fatos, já contados por quem leu o banco.
 *
 * ── `undefined` NÃO É ZERO ──────────────────────────────────────────────────
 * Todo campo opcional aqui significa "não foi medido". A regra CALA sobre o
 * que não foi medido, em vez de anunciar zero — anunciar zero é o jeito mais
 * fácil de um briefing dizer "está tudo bem" sobre uma área que ninguém olhou.
 */
export type FatosDoBriefing = {
  financeiro?: {
    recebimentosVencidos: number;
    pagamentosVencidos: number;
    /** Soma do que está vencido. `undefined` = há lançamento sem valor legível. */
    valorVencido?: number;
  };
  comercial?: {
    /** Oportunidades sem próxima ação marcada. */
    semProximaAcao: number;
    /** Sem contato há mais tempo do que a janela de retorno. */
    paradas: number;
    /** Propostas enviadas e sem resposta. */
    propostasAguardando: number;
  };
  eventos?: {
    /** Eventos com motivo de atenção urgente, os três primeiros nomeados. */
    urgentes: readonly { nome: string; diasAte: number; motivo: string }[];
    /** Quantos estão em atenção sem ser urgentes. */
    emAtencao: number;
  };
  compras?: {
    atrasadas: number;
    aguardandoEntrega: number;
    /** Custo registrado que ainda não virou lançamento no livro-caixa. */
    foraDoCaixa: number;
  };
  fornecedores?: {
    aguardandoConfirmacao: number;
    /** Próximas ações escritas por ela, que são dela. */
    acoesPendentes: number;
  };
  acervo?: {
    /** Peças que saíram e não voltaram, com a janela já encerrada. */
    naoRetornado: number;
    /** Reservas que pedem mais do que existe livre. */
    deficit: number;
  };
};

export type Briefing = {
  /** "Bom dia", "Boa tarde", "Boa noite" — pela hora local de quem abre. */
  saudacao: string;
  /** A frase de abertura. Honesta inclusive quando não há nada. */
  resumo: string;
  /** Tudo, já ordenado. A tela decide quantos mostra. */
  itens: ItemDoBriefing[];
  /** Os que exigem decisão dela. Subconjunto de `itens`. */
  precisamDeVoce: ItemDoBriefing[];
  /**
   * O que o ALTAR já apurou sozinho, em frases.
   *
   * ── POR QUE NÃO DIZ "PREPAREI RASCUNHOS" ────────────────────────────────
   * Porque não preparou. O Assistente da decoradora não escreve mensagem para
   * cliente dela em lote, e anunciar um trabalho que não existe é a forma mais
   * rápida de ela deixar de acreditar no resto da tela.
   *
   * O trabalho que ele de fato fez é ESTE: ler sete áreas, cruzar prazo com
   * pendência, separar o que é urgente do que é normal, e nomear os eventos.
   * É pouco de se dizer e é muito de se fazer à mão toda manhã.
   */
  trabalhoApurado: string[];
  contagem: Record<Gravidade, number>;
  /** Nenhum item em nenhuma gravidade que peça ação. */
  tudoEmDia: boolean;
  /** As áreas que não foram medidas. A tela diz, em vez de fingir zero. */
  areasNaoMedidas: AreaDoBriefing[];
};

/**
 * Quantos itens a tela mostra antes de resumir o resto.
 *
 * O pedido foi explícito: prioridade acima de volume. Um briefing de vinte
 * linhas é uma caixa de entrada, e caixa de entrada é justamente o que a
 * decoradora já tem e não lê.
 */
export const ITENS_EM_DESTAQUE = 5;

const PESO: Record<Gravidade, number> = {
  critico: 0,
  atencao: 1,
  oportunidade: 2,
  informativo: 3,
};

export function saudacaoPara(hora: number): string {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** "2 recebimentos vencidos" — plural certo, número sempre presente. */
function frase(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function montarBriefing(fatos: FatosDoBriefing, hora: number): Briefing {
  const itens: ItemDoBriefing[] = [];
  const naoMedidas: AreaDoBriefing[] = [];
  const apurado: string[] = [];

  // ── FINANCEIRO ───────────────────────────────────────────────────────────
  if (fatos.financeiro) {
    const f = fatos.financeiro;
    apurado.push("Financeiro conferiu o que está vencido.");
    if (f.recebimentosVencidos > 0) {
      itens.push({
        chave: "financeiro.receber",
        area: "financeiro",
        gravidade: "critico",
        titulo: frase(f.recebimentosVencidos, "recebimento vencido", "recebimentos vencidos"),
        // O valor só entra quando TODOS os lançamentos tinham número legível.
        // Somar ignorando um valor ilegível produziria um total menor do que o
        // real, e é pior do que não mostrar total nenhum.
        detalhe:
          f.valorVencido !== undefined
            ? `${f.valorVencido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} a receber`
            : "há lançamento sem valor legível, então não há total",
        destino: "/financeiro",
        quantidade: f.recebimentosVencidos,
      });
    }
    if (f.pagamentosVencidos > 0) {
      itens.push({
        chave: "financeiro.pagar",
        area: "financeiro",
        gravidade: "critico",
        titulo: frase(f.pagamentosVencidos, "pagamento vencido", "pagamentos vencidos"),
        destino: "/financeiro",
        quantidade: f.pagamentosVencidos,
        // Pagar fornecedor atrasado é decisão de caixa, não tarefa.
        precisaDeVoce: true,
      });
    }
  } else {
    naoMedidas.push("financeiro");
  }

  // ── COMERCIAL ────────────────────────────────────────────────────────────
  if (fatos.comercial) {
    const c = fatos.comercial;
    apurado.push("Comercial olhou quem está esperando retorno.");
    if (c.paradas > 0) {
      itens.push({
        chave: "comercial.paradas",
        area: "comercial",
        gravidade: "atencao",
        titulo: frase(c.paradas, "oportunidade parada", "oportunidades paradas"),
        detalhe: "sem contato há mais tempo do que o combinado",
        destino: "/funil",
        quantidade: c.paradas,
      });
    }
    if (c.semProximaAcao > 0) {
      itens.push({
        chave: "comercial.sem_acao",
        area: "comercial",
        gravidade: "atencao",
        titulo: frase(
          c.semProximaAcao,
          "oportunidade sem próxima ação",
          "oportunidades sem próxima ação",
        ),
        destino: "/funil",
        quantidade: c.semProximaAcao,
      });
    }
    if (c.propostasAguardando > 0) {
      itens.push({
        chave: "comercial.propostas",
        area: "comercial",
        gravidade: "oportunidade",
        titulo: frase(
          c.propostasAguardando,
          "proposta aguardando resposta",
          "propostas aguardando resposta",
        ),
        destino: "/propostas",
        quantidade: c.propostasAguardando,
        precisaDeVoce: true,
      });
    }
  } else {
    naoMedidas.push("comercial");
  }

  // ── EVENTOS E PRODUÇÃO ───────────────────────────────────────────────────
  if (fatos.eventos) {
    const e = fatos.eventos;
    apurado.push("Produção cruzou prazo com pendência em cada evento.");
    for (const urgente of e.urgentes) {
      itens.push({
        chave: `eventos.urgente.${urgente.nome}`,
        area: "producao",
        gravidade: "critico",
        titulo: urgente.nome,
        detalhe:
          urgente.diasAte < 0
            ? `${urgente.motivo} — o evento já passou`
            : urgente.diasAte === 0
              ? `${urgente.motivo} — é hoje`
              : `${urgente.motivo} — em ${frase(urgente.diasAte, "dia", "dias")}`,
        destino: "/eventos",
        quantidade: 1,
      });
    }
    if (e.emAtencao > 0) {
      itens.push({
        chave: "eventos.atencao",
        area: "eventos",
        gravidade: "atencao",
        titulo: frase(e.emAtencao, "evento pede atenção", "eventos pedem atenção"),
        detalhe: "com prazo ainda confortável",
        destino: "/eventos",
        quantidade: e.emAtencao,
      });
    }
  } else {
    // Duas áreas, uma leitura. "Eventos" é a lista; "Produção" é o que falta
    // dentro de cada um — e as duas saem do mesmo painel de atenção. Declarar
    // só uma deixaria `producao` fora de `areasNaoMedidas` para sempre, e a
    // tela diria que a produção foi olhada quando nada foi.
    naoMedidas.push("eventos", "producao");
  }

  // ── COMPRAS ──────────────────────────────────────────────────────────────
  if (fatos.compras) {
    const c = fatos.compras;
    apurado.push("Compras separou o que está atrasado do que está a caminho.");
    if (c.atrasadas > 0) {
      itens.push({
        chave: "compras.atrasadas",
        area: "compras",
        gravidade: "critico",
        titulo: frase(c.atrasadas, "compra atrasada", "compras atrasadas"),
        destino: "/compras",
        quantidade: c.atrasadas,
      });
    }
    if (c.aguardandoEntrega > 0) {
      itens.push({
        chave: "compras.entrega",
        area: "compras",
        gravidade: "atencao",
        titulo: frase(c.aguardandoEntrega, "compra a caminho", "compras a caminho"),
        detalhe: "o dinheiro saiu e a caixa não chegou",
        destino: "/compras",
        quantidade: c.aguardandoEntrega,
      });
    }
    if (c.foraDoCaixa > 0) {
      itens.push({
        chave: "compras.fora_do_caixa",
        area: "compras",
        gravidade: "atencao",
        titulo: frase(
          c.foraDoCaixa,
          "custo fora do livro-caixa",
          "custos fora do livro-caixa",
        ),
        detalhe: "a margem do evento ainda não conta com eles",
        destino: "/compras",
        quantidade: c.foraDoCaixa,
      });
    }
  } else {
    naoMedidas.push("compras");
  }

  // ── FORNECEDORES ─────────────────────────────────────────────────────────
  if (fatos.fornecedores) {
    const f = fatos.fornecedores;
    if (f.aguardandoConfirmacao > 0) {
      itens.push({
        chave: "fornecedores.confirmar",
        area: "fornecedores",
        gravidade: "atencao",
        titulo: frase(
          f.aguardandoConfirmacao,
          "fornecedor sem confirmação",
          "fornecedores sem confirmação",
        ),
        destino: "/fornecedores",
        quantidade: f.aguardandoConfirmacao,
      });
    }
    if (f.acoesPendentes > 0) {
      itens.push({
        chave: "fornecedores.acoes",
        area: "fornecedores",
        gravidade: "informativo",
        titulo: frase(
          f.acoesPendentes,
          "próxima ação anotada",
          "próximas ações anotadas",
        ),
        detalhe: "escritas por você nos fornecedores",
        destino: "/fornecedores",
        quantidade: f.acoesPendentes,
      });
    }
  } else {
    naoMedidas.push("fornecedores");
  }

  // ── ACERVO ───────────────────────────────────────────────────────────────
  if (fatos.acervo) {
    const a = fatos.acervo;
    if (a.naoRetornado > 0) {
      itens.push({
        chave: "acervo.nao_retornado",
        area: "acervo",
        gravidade: "atencao",
        titulo: frase(a.naoRetornado, "peça não voltou", "peças não voltaram"),
        detalhe: "o evento já acabou",
        destino: "/acervo",
        quantidade: a.naoRetornado,
      });
    }
    if (a.deficit > 0) {
      itens.push({
        chave: "acervo.deficit",
        area: "acervo",
        gravidade: "critico",
        titulo: frase(a.deficit, "peça reservada a mais", "peças reservadas a mais"),
        detalhe: "dois eventos querem a mesma coisa no mesmo dia",
        destino: "/acervo",
        quantidade: a.deficit,
        precisaDeVoce: true,
      });
    }
  } else {
    naoMedidas.push("acervo");
  }

  itens.sort((a, b) => {
    const peso = PESO[a.gravidade] - PESO[b.gravidade];
    return peso !== 0 ? peso : b.quantidade - a.quantidade;
  });

  const contagem: Record<Gravidade, number> = {
    critico: 0,
    atencao: 0,
    oportunidade: 0,
    informativo: 0,
  };
  for (const i of itens) contagem[i.gravidade]++;

  // "Informativo" não conta como coisa a fazer: é o que o sistema viu e ela
  // não precisa tocar. Contá-lo faria toda manhã abrir com um número que não
  // corresponde a trabalho nenhum.
  const aFazer = contagem.critico + contagem.atencao + contagem.oportunidade;

  const resumo =
    naoMedidas.length === AREAS.length
      ? "Ainda não consegui olhar nenhuma área."
      : aFazer === 0
        ? "Nada pedindo você agora."
        : `${frase(aFazer, "coisa precisa", "coisas precisam")} da sua atenção.`;

  return {
    saudacao: saudacaoPara(hora),
    resumo,
    itens,
    precisamDeVoce: itens.filter((i) => i.precisaDeVoce),
    trabalhoApurado: apurado,
    contagem,
    tudoEmDia: aFazer === 0,
    areasNaoMedidas: naoMedidas,
  };
}
