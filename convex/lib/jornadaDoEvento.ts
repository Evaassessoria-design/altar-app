// ═════════════════════════════════════════════════════════════════════════════
// A JORNADA DO EVENTO — em que etapa o projeto está, e o que vem depois
//
// ── DERIVADA, NUNCA GRAVADA ─────────────────────────────────────────────────
// Não existe campo "etapa atual" no evento. Cada etapa lê os dados que a
// própria tela dela já grava (briefing, orçamento, proposta, fotos…), como
// `saudeDoEvento` e `prontidaoDoEvento` já fazem. Um estágio gravado divergiria
// no primeiro orçamento apagado ou proposta recusada.
//
// ── ORDEM RECOMENDADA ≠ DEPENDÊNCIA REAL ────────────────────────────────────
// A jornada ORIENTA, não trava. "Você está aqui" é a primeira etapa não
// concluída na ordem recomendada — mas toda etapa abre a qualquer momento,
// porque cada empresa trabalha de um jeito e muitas desenham o projeto visual
// antes do contrato. `dependeDe` só existe onde o sistema de fato não funciona
// sem a anterior: a planta premium é GERADA a partir de um croqui.
//
// ── NADA É AFIRMADO SEM DADO ────────────────────────────────────────────────
// Contrato "concluído" quer dizer ANEXADO: não há campo de assinatura, e a tela
// não pode dizer "assinado". Cada `detalhe` diz o que o número significa.
// Decisões e a tabela do que se sabe ou não: docs/jornada-evento/.
// ═════════════════════════════════════════════════════════════════════════════

export type StatusDaEtapa = "nao_iniciado" | "em_andamento" | "concluido";

export const ETAPAS_DO_PROJETO = [
  "briefing",
  "comercial",
  "contrato",
  "inspiracoes",
  "fornecedores",
  "ficha",
  "acervo",
  "projeto",
  "croqui",
  "planta",
] as const;

export type ChaveDaEtapa = (typeof ETAPAS_DO_PROJETO)[number];

export type EtapaDaJornada = {
  chave: ChaveDaEtapa;
  numero: number;
  rotulo: string;
  /** Caminho relativo ao evento (`/eventos/:id/<rota>`). Vazio = a própria página. */
  rota: string;
  status: StatusDaEtapa;
  /** O que o status significa, em números — nunca só "ok". */
  detalhe: string;
  /** Dependência REAL (o sistema não funciona sem ela). Ausente = só ordem. */
  dependeDe?: ChaveDaEtapa;
};

export type Jornada = {
  etapas: EtapaDaJornada[];
  /** "Você está aqui": a primeira não concluída na ordem. `null` = tudo feito. */
  atual: ChaveDaEtapa | null;
  /** A próxima não concluída depois da atual. */
  proxima: ChaveDaEtapa | null;
  concluidas: number;
};

export type FatosDaJornada = {
  briefing: { existe: boolean; temConvidados: boolean; temConceito: boolean };
  comercial: {
    itensDeReceita: number;
    propostas: readonly { status: string; vencida?: boolean }[];
  };
  contrato: { anexado: boolean; pendencias: number };
  inspiracoes: { referencias: number };
  fornecedores: readonly { status?: string }[];
  ficha: { itens: number; itensComMateriais: number };
  acervo: { reservas: number; comDeficit: number };
  projeto: { apresentavel: boolean; prontos: number; totalDeItens: number };
  croqui: { enviados: number };
  planta: { geradas: number; gerando: boolean };
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const FORNECEDOR_FECHADO = new Set(["contratado", "confirmado", "finalizado"]);

type Avaliacao = { status: StatusDaEtapa; detalhe: string };

function avaliarBriefing(f: FatosDaJornada["briefing"]): Avaliacao {
  if (!f.existe) return { status: "nao_iniciado", detalhe: "Questionário não começado" };
  // Os mesmos dois sinais que a Saúde (convidados) e a Prontidão (conceito)
  // já usam: uma regra só para "o briefing diz o essencial".
  if (f.temConvidados && f.temConceito) {
    return { status: "concluido", detalhe: "Convidados e conceito definidos" };
  }
  const falta = [!f.temConvidados && "convidados", !f.temConceito && "conceito"].filter(Boolean);
  return { status: "em_andamento", detalhe: `Falta: ${falta.join(" e ")}` };
}

function avaliarComercial(f: FatosDaJornada["comercial"]): Avaliacao {
  if (f.propostas.some((p) => p.status === "aceita")) {
    return { status: "concluido", detalhe: "Proposta aprovada" };
  }
  const enviada = f.propostas.find((p) => p.status === "enviada");
  if (enviada) {
    return {
      status: "em_andamento",
      detalhe: enviada.vencida ? "Proposta enviada — validade vencida" : "Proposta enviada, aguardando resposta",
    };
  }
  if (f.propostas.length > 0) {
    const recusada = f.propostas.every((p) => p.status === "recusada");
    return {
      status: "em_andamento",
      detalhe: recusada ? "Proposta recusada — ajustar e reenviar" : "Proposta em rascunho",
    };
  }
  if (f.itensDeReceita > 0) {
    return { status: "em_andamento", detalhe: "Orçamento montado, proposta ainda não criada" };
  }
  return { status: "nao_iniciado", detalhe: "Sem orçamento nem proposta" };
}

function avaliarContrato(f: FatosDaJornada["contrato"]): Avaliacao {
  if (!f.anexado) return { status: "nao_iniciado", detalhe: "Contrato não anexado" };
  if (f.pendencias > 0) {
    return {
      status: "em_andamento",
      detalhe: `Anexado — ${plural(f.pendencias, "pendência apontada", "pendências apontadas")} na leitura`,
    };
  }
  // "Anexado", e não "assinado": não há como o sistema saber.
  return { status: "concluido", detalhe: "Contrato anexado" };
}

function avaliarInspiracoes(f: FatosDaJornada["inspiracoes"]): Avaliacao {
  return f.referencias > 0
    ? { status: "concluido", detalhe: `${plural(f.referencias, "referência", "referências")} na galeria` }
    : { status: "nao_iniciado", detalhe: "Nenhuma foto marcada como referência" };
}

function avaliarFornecedores(lista: FatosDaJornada["fornecedores"]): Avaliacao {
  if (lista.length === 0) return { status: "nao_iniciado", detalhe: "Nenhum fornecedor no evento" };
  const fechados = lista.filter((f) => f.status && FORNECEDOR_FECHADO.has(f.status)).length;
  if (fechados === lista.length) {
    return { status: "concluido", detalhe: `${plural(lista.length, "fornecedor fechado", "fornecedores fechados")}` };
  }
  return { status: "em_andamento", detalhe: `${fechados} de ${lista.length} fechados` };
}

function avaliarFicha(f: FatosDaJornada["ficha"]): Avaliacao {
  if (f.itens === 0) return { status: "nao_iniciado", detalhe: "Nenhum item de montagem" };
  if (f.itensComMateriais === f.itens) {
    return { status: "concluido", detalhe: `${plural(f.itens, "item", "itens")} com materiais` };
  }
  return { status: "em_andamento", detalhe: `${f.itensComMateriais} de ${f.itens} itens com materiais` };
}

function avaliarAcervo(f: FatosDaJornada["acervo"]): Avaliacao {
  if (f.reservas === 0) return { status: "nao_iniciado", detalhe: "Nenhuma peça reservada" };
  if (f.comDeficit > 0) {
    return {
      status: "em_andamento",
      detalhe: `${plural(f.comDeficit, "reserva sem peça suficiente", "reservas sem peça suficiente")}`,
    };
  }
  return { status: "concluido", detalhe: `${plural(f.reservas, "reserva coberta", "reservas cobertas")}` };
}

function avaliarProjeto(f: FatosDaJornada["projeto"]): Avaliacao {
  if (f.apresentavel) return { status: "concluido", detalhe: "Pronto para mostrar" };
  if (f.prontos === 0) return { status: "nao_iniciado", detalhe: "Nada montado ainda" };
  return { status: "em_andamento", detalhe: `${f.prontos} de ${f.totalDeItens} pontos prontos para mostrar` };
}

function avaliarCroqui(f: FatosDaJornada["croqui"]): Avaliacao {
  return f.enviados > 0
    ? { status: "concluido", detalhe: `${plural(f.enviados, "croqui enviado", "croquis enviados")}` }
    : { status: "nao_iniciado", detalhe: "Nenhum croqui enviado" };
}

function avaliarPlanta(f: FatosDaJornada["planta"]): Avaliacao {
  if (f.geradas > 0) return { status: "concluido", detalhe: `${plural(f.geradas, "planta gerada", "plantas geradas")}` };
  if (f.gerando) return { status: "em_andamento", detalhe: "Planta sendo gerada" };
  return { status: "nao_iniciado", detalhe: "Nenhuma planta gerada" };
}

const DEFINICAO: Record<ChaveDaEtapa, { rotulo: string; rota: string; dependeDe?: ChaveDaEtapa }> = {
  briefing: { rotulo: "Briefing", rota: "briefing" },
  comercial: { rotulo: "Orçamento e proposta", rota: "orcamento" },
  contrato: { rotulo: "Contrato", rota: "" },
  inspiracoes: { rotulo: "Inspirações", rota: "fotos" },
  fornecedores: { rotulo: "Fornecedores", rota: "fornecedores" },
  ficha: { rotulo: "Ficha técnica", rota: "ficha-tecnica" },
  acervo: { rotulo: "Acervo do evento", rota: "acervo" },
  projeto: { rotulo: "Projeto visual", rota: "projeto" },
  croqui: { rotulo: "Croqui", rota: "planta" },
  planta: { rotulo: "Planta premium", rota: "planta", dependeDe: "croqui" },
};

export function jornadaDoEvento(f: FatosDaJornada): Jornada {
  const avaliacoes: Record<ChaveDaEtapa, Avaliacao> = {
    briefing: avaliarBriefing(f.briefing),
    comercial: avaliarComercial(f.comercial),
    contrato: avaliarContrato(f.contrato),
    inspiracoes: avaliarInspiracoes(f.inspiracoes),
    fornecedores: avaliarFornecedores(f.fornecedores),
    ficha: avaliarFicha(f.ficha),
    acervo: avaliarAcervo(f.acervo),
    projeto: avaliarProjeto(f.projeto),
    croqui: avaliarCroqui(f.croqui),
    planta: avaliarPlanta(f.planta),
  };

  const etapas = ETAPAS_DO_PROJETO.map((chave, i) => ({
    chave,
    numero: i + 1,
    ...DEFINICAO[chave],
    ...avaliacoes[chave],
  }));

  const pendentes = etapas.filter((e) => e.status !== "concluido");
  return {
    etapas,
    atual: pendentes[0]?.chave ?? null,
    proxima: pendentes[1]?.chave ?? null,
    concluidas: etapas.length - pendentes.length,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// A OPERAÇÃO — depois do projeto, as peças saem, voltam e ficam prontas de novo
//
// Lida do que o ALTAR já registra: o status operacional de cada item de
// montagem (separado → carregado → conferido → retornou), o saiu/voltou das
// reservas de acervo, a conferência de retorno e as condições do acervo.
//
// Montagem e desmontagem NÃO têm registro no sistema hoje. A tela diz isso
// ("sem registro"), em vez de deduzir da data que aconteceram.
// ═════════════════════════════════════════════════════════════════════════════

export type StatusDaOperacao = StatusDaEtapa | "sem_registro";

export const ETAPAS_DA_OPERACAO = [
  "separacao",
  "carregamento",
  "conferencia",
  "montagem",
  "evento",
  "desmontagem",
  "retorno",
  "conferenciaDeRetorno",
  "limpezaReparo",
  "disponivel",
] as const;

export type ChaveDaOperacao = (typeof ETAPAS_DA_OPERACAO)[number];

export type EtapaDaOperacao = {
  chave: ChaveDaOperacao;
  rotulo: string;
  status: StatusDaOperacao;
  detalhe: string;
  /**
   * Onde a etapa se resolve, relativo ao evento. Ausente = não há tela para
   * ela (montagem, evento, desmontagem). Mora AQUI para a faixa da Operação e
   * o "Próximo passo" da Saúde levarem ao mesmo lugar — até 30/09 cada um
   * decidia o seu, e o da Saúde mandava a separação para o acervo.
   */
  rota?: string;
};

const ROTA_DA_OPERACAO: Partial<Record<ChaveDaOperacao, string>> = {
  // Separado, carregado e conferido são marcados nos itens de montagem.
  separacao: "briefing",
  carregamento: "briefing",
  conferencia: "briefing",
  // Retorno, conferência e condições se resolvem no acervo do evento.
  retorno: "acervo",
  conferenciaDeRetorno: "acervo",
  limpezaReparo: "acervo",
  disponivel: "acervo",
};

export type FatosDaOperacao = {
  /** "AAAA-MM-DD". */
  dataDoEvento: string;
  hoje: string;
  statusDoEvento?: string;
  /** Status operacional de cada item de montagem (ausente = pendente). */
  itensDeMontagem: readonly { operationalStatus?: string }[];
  reservas: readonly { saiu?: number; voltou?: number; conferidoEm?: number }[];
  /** Peças DOS ITENS deste evento hoje em limpeza, reparo ou indisponíveis. */
  pecasForaDeUsoNosItens: number;
  /** Peças que a conferência deste evento mandou para limpeza/reparo/indisp. */
  pecasEnviadasNaConferencia: number;
};

const ORDEM_OPERACIONAL = ["pendente", "separado", "carregado", "conferido", "retornou"];

function alcancou(status: string | undefined, alvo: string): boolean {
  return ORDEM_OPERACIONAL.indexOf(status ?? "pendente") >= ORDEM_OPERACIONAL.indexOf(alvo);
}

function etapaPorItens(
  itens: FatosDaOperacao["itensDeMontagem"],
  alvo: string,
  verbo: string,
): { status: StatusDaOperacao; detalhe: string } {
  if (itens.length === 0) return { status: "sem_registro", detalhe: "Sem itens de montagem" };
  const feitos = itens.filter((i) => alcancou(i.operationalStatus, alvo)).length;
  if (feitos === 0) return { status: "nao_iniciado", detalhe: `Nenhum item ${verbo}` };
  if (feitos === itens.length) return { status: "concluido", detalhe: `Todos os ${itens.length} itens` };
  return { status: "em_andamento", detalhe: `${feitos} de ${itens.length} itens` };
}

export function operacaoDoEvento(f: FatosDaOperacao): {
  etapas: EtapaDaOperacao[];
  atual: ChaveDaOperacao | null;
} {
  const aconteceu =
    f.statusDoEvento === "completed" || f.statusDoEvento === "in_progress" || f.dataDoEvento <= f.hoje;

  const saiu = f.reservas.filter((r) => (r.saiu ?? 0) > 0);
  const voltouTudo = saiu.filter((r) => (r.voltou ?? 0) >= (r.saiu ?? 0));
  const conferidas = saiu.filter((r) => r.conferidoEm !== undefined);

  const retorno: { status: StatusDaOperacao; detalhe: string } =
    saiu.length === 0
      ? etapaPorItens(f.itensDeMontagem, "retornou", "retornou")
      : voltouTudo.length === saiu.length
        ? { status: "concluido", detalhe: "Todo o acervo voltou" }
        : saiu.some((r) => (r.voltou ?? 0) > 0)
          ? { status: "em_andamento", detalhe: `${voltouTudo.length} de ${saiu.length} reservas voltaram inteiras` }
          : { status: "nao_iniciado", detalhe: "Acervo ainda fora" };

  const conferencia: { status: StatusDaOperacao; detalhe: string } =
    saiu.length === 0
      ? { status: "sem_registro", detalhe: "Nenhuma peça do acervo saiu" }
      : conferidas.length === saiu.length
        ? { status: "concluido", detalhe: "Retorno conferido" }
        : conferidas.length > 0
          ? { status: "em_andamento", detalhe: `${conferidas.length} de ${saiu.length} reservas conferidas` }
          : { status: "nao_iniciado", detalhe: "Retorno não conferido" };

  const limpeza: { status: StatusDaOperacao; detalhe: string } =
    conferidas.length === 0
      ? { status: "sem_registro", detalhe: "Depende da conferência de retorno" }
      : f.pecasEnviadasNaConferencia === 0
        ? { status: "concluido", detalhe: "Nada voltou precisando de limpeza ou reparo" }
        : f.pecasForaDeUsoNosItens > 0
          ? { status: "em_andamento", detalhe: `${plural(f.pecasForaDeUsoNosItens, "peça", "peças")} em limpeza, reparo ou indisponível` }
          : { status: "concluido", detalhe: "Tudo regularizado" };

  const etapas: EtapaDaOperacao[] = [
    { chave: "separacao", rotulo: "Separação", ...etapaPorItens(f.itensDeMontagem, "separado", "separado") },
    { chave: "carregamento", rotulo: "Carregamento", ...etapaPorItens(f.itensDeMontagem, "carregado", "carregado") },
    { chave: "conferencia", rotulo: "Conferência no local", ...etapaPorItens(f.itensDeMontagem, "conferido", "conferido") },
    { chave: "montagem", rotulo: "Montagem", status: "sem_registro", detalhe: "O ALTAR ainda não registra a montagem" },
    {
      chave: "evento",
      rotulo: "Evento",
      status: aconteceu ? "concluido" : "nao_iniciado",
      detalhe: aconteceu ? "Aconteceu" : "Ainda não aconteceu",
    },
    { chave: "desmontagem", rotulo: "Desmontagem", status: "sem_registro", detalhe: "O ALTAR ainda não registra a desmontagem" },
    { chave: "retorno", rotulo: "Retorno", ...retorno },
    { chave: "conferenciaDeRetorno", rotulo: "Conferência de retorno", ...conferencia },
    { chave: "limpezaReparo", rotulo: "Limpeza e reparo", ...limpeza },
    {
      chave: "disponivel",
      rotulo: "Disponível de novo",
      ...(limpeza.status === "concluido"
        ? { status: "concluido" as const, detalhe: "Peças prontas para o próximo evento" }
        : { status: limpeza.status === "sem_registro" ? ("sem_registro" as const) : ("nao_iniciado" as const), detalhe: "Aguardando o ciclo acima" }),
    },
  ];

  // Onde a operação está: a primeira etapa COM registro que não terminou.
  // "Sem registro" não prende o ponteiro — seria travar a tela no que o
  // sistema nem acompanha.
  const comRota = etapas.map((e) => (ROTA_DA_OPERACAO[e.chave] ? { ...e, rota: ROTA_DA_OPERACAO[e.chave] } : e));
  const atual = comRota.find((e) => e.status === "nao_iniciado" || e.status === "em_andamento");
  return { etapas: comRota, atual: atual?.chave ?? null };
}

// ═════════════════════════════════════════════════════════════════════════════
// O RESUMO QUE ABRE A PÁGINA — fase atual, próximo passo, o que precisa de você
//
// ── QUANDO O PROJETO VIRA OPERAÇÃO ──────────────────────────────────────────
// Antes da data, a fase é o PROJETO e o próximo passo é "você está aqui". A
// partir do dia do evento a fase é a OPERAÇÃO, mesmo com etapa de projeto em
// aberto: na segunda-feira pós-evento, o retorno do acervo importa mais do que
// a planta premium que ninguém gerou. E sem nada pendente, "tudo feito".
//
// A atenção junta o que a Saúde já aponta (cadastro) com o que só a jornada
// sabe (acervo sem peça, retorno não conferido) — sem repetir, com teto.
// ═════════════════════════════════════════════════════════════════════════════

export type ProximoPasso = { rotulo: string; detalhe: string; rota?: string };

/**
 * "Esse evento está saudável?" — em palavras, e com o porquê.
 *
 *   em_dia     nada bloqueando
 *   atencao    algo pede você, sem ameaçar o evento ainda
 *   risco      o evento (ou o acervo) é prejudicado se ninguém agir
 *   cancelado  o evento não vai acontecer
 */
export type Veredito = {
  nivel: "em_dia" | "atencao" | "risco" | "cancelado";
  titulo: string;
  /** O motivo principal, numa frase. */
  porque: string;
  /** Todos os motivos, do mais grave ao mais leve (riscos, depois atenção). */
  motivos: string[];
};

export type ResumoDaJornada = {
  fase: "projeto" | "operacao" | "concluido";
  /** O que fazer agora, com o caminho (relativo ao evento) — `null` = nada. */
  proximoPasso: ProximoPasso | null;
  atencao: string[];
  veredito: Veredito;
};

export const TETO_DE_ATENCAO = 6;

/** Até quantos dias antes do evento etapa crítica aberta é RISCO. */
export const DIAS_DE_RISCO = 7;
/** Até quantos dias antes do evento etapa crítica aberta é ATENÇÃO. */
export const DIAS_DE_ATENCAO = 30;

/**
 * Etapas cuja falta perto da data prejudica o EVENTO, não só o cadastro.
 * Inspirações, projeto visual, croqui e planta são apresentação: atrasá-los
 * é desconfortável, não perigoso. Briefing e comercial já passaram quando o
 * evento está a uma semana.
 */
const ETAPAS_CRITICAS: readonly ChaveDaEtapa[] = ["contrato", "fornecedores", "acervo"];

/** Avisos de `saudeDoEvento` que dizem o mesmo que um motivo de etapa. */
const AVISO_COBERTO_PELA_ETAPA: Record<string, string> = {
  "Contrato ainda não anexado": "Contrato",
  "Nenhum fornecedor cadastrado": "Fornecedores",
};

function aDiasDoEvento(dias: number): string {
  if (dias === 0) return "no dia do evento";
  return `a ${plural(dias, "dia", "dias")} do evento`;
}

/**
 * ── O DEFEITO QUE ESTE VEREDITO RESOLVE ─────────────────────────────────────
 * A Saúde dizia "71%" e uma lista. 71% de um evento daqui a seis meses é
 * normal; 71% a três dias, com o contrato sem anexar, não é — e os dois
 * apareciam iguais. O percentual mede CADASTRO (D5, e continua igual); o
 * veredito mede se alguém precisa agir, e por quê.
 *
 * ── SÓ O QUE O SISTEMA SABE ─────────────────────────────────────────────────
 * Nenhum prazo é inventado: a única data é a do evento. "Atrasado" quer dizer
 * "etapa crítica aberta perto da data", não "passou do prazo que alguém
 * definiu" — não há prazo cadastrado. Aviso de cadastro (fornecedor sem
 * alinhamento, por exemplo) longe da data continua na lista, mas não muda o
 * veredito: um evento de março com fornecedor sem alinhamento está em dia.
 */
export function vereditoDoEvento(e: {
  jornada: Jornada;
  cancelado: boolean;
  /** A data passou ou o evento está marcado como em andamento/realizado. */
  aconteceu: boolean;
  /** Dias até o evento (negativo = já passou). `null` = data ilegível. */
  diasParaOEvento: number | null;
  reservasComDeficit: number;
  /** Peças deste evento que saíram, a janela acabou e não voltaram. */
  pecasForaSemVoltar: number;
  retornoPorConferir: boolean;
  proximoPasso: ProximoPasso | null;
}): Veredito {
  const naoVoltaram =
    e.pecasForaSemVoltar > 0 &&
    `${plural(e.pecasForaSemVoltar, "peça do acervo ainda não voltou", "peças do acervo ainda não voltaram")}`;

  if (e.cancelado) {
    return naoVoltaram
      ? { nivel: "atencao", titulo: "Evento cancelado", porque: naoVoltaram, motivos: [naoVoltaram] }
      : {
          nivel: "cancelado",
          titulo: "Evento cancelado",
          porque: "As reservas de acervo dele não seguram mais peça.",
          motivos: [],
        };
  }

  const riscos: string[] = [];
  const atencoes: string[] = [];

  if (!e.aconteceu && e.reservasComDeficit > 0) {
    riscos.push(
      `Falta peça do acervo em ${plural(e.reservasComDeficit, "reserva", "reservas")}`,
    );
  }
  if (naoVoltaram) riscos.push(naoVoltaram);

  const d = e.diasParaOEvento;
  if (!e.aconteceu && d !== null && d >= 0 && d <= DIAS_DE_ATENCAO) {
    for (const chave of ETAPAS_CRITICAS) {
      const etapa = e.jornada.etapas.find((x) => x.chave === chave);
      // Acervo com déficit já entrou acima, com o número.
      if (!etapa || etapa.status === "concluido") continue;
      if (chave === "acervo" && e.reservasComDeficit > 0) continue;
      // Nenhuma peça reservada não é risco: muito evento não usa acervo.
      if (chave === "acervo" && etapa.status === "nao_iniciado") continue;
      const frase = `${etapa.rotulo} em aberto ${aDiasDoEvento(d)} — ${etapa.detalhe.toLowerCase()}`;
      (d <= DIAS_DE_RISCO ? riscos : atencoes).push(frase);
    }
  }

  if (e.retornoPorConferir) atencoes.push("Acervo voltou e o retorno ainda não foi conferido");
  const contrato = e.jornada.etapas.find((x) => x.chave === "contrato");
  if (contrato?.status === "em_andamento" && !(d !== null && d >= 0 && d <= DIAS_DE_ATENCAO && !e.aconteceu)) {
    atencoes.push(`Contrato: ${contrato.detalhe.toLowerCase()}`);
  }

  const motivos = [...riscos, ...atencoes];
  if (riscos.length > 0) return { nivel: "risco", titulo: "Em risco", porque: riscos[0], motivos };
  if (atencoes.length > 0) {
    return { nivel: "atencao", titulo: "Precisa de atenção", porque: atencoes[0], motivos };
  }
  return {
    nivel: "em_dia",
    titulo: "Em dia",
    porque: e.proximoPasso
      ? `Nada bloqueando. Próximo passo: ${e.proximoPasso.rotulo.toLowerCase()}.`
      : "Nada pendente.",
    motivos,
  };
}

export function resumoDaJornada(e: {
  jornada: Jornada;
  operacao: ReturnType<typeof operacaoDoEvento>;
  aconteceu: boolean;
  /** Os avisos que a Saúde já calcula (`saudeDoEvento().attention`). */
  atencaoDaSaude: readonly string[];
  reservasComDeficit: number;
  retornoPorConferir: boolean;
  /** Ausentes = comportamento anterior a 30/09 (sem veredito de data). */
  cancelado?: boolean;
  diasParaOEvento?: number | null;
  pecasForaSemVoltar?: number;
}): ResumoDaJornada {
  const etapaOperacional = e.operacao.etapas.find((x) => x.chave === e.operacao.atual);
  const etapaDoProjeto = e.jornada.etapas.find((x) => x.chave === e.jornada.atual);

  // O passo da operação leva aonde a etapa se resolve (`rota` da etapa) — e
  // "Evento", antes da data, não é passo: é espera. Até 30/09 a Saúde
  // mandava "Próximo passo: Evento — Ainda não aconteceu".
  const passoDaOperacao = (etapa: EtapaDaOperacao): ProximoPasso =>
    etapa.chave === "evento" && etapa.status !== "concluido"
      ? {
          rotulo: "Aguardar o evento",
          detalhe:
            e.diasParaOEvento != null && e.diasParaOEvento > 0
              ? `Faltam ${plural(e.diasParaOEvento, "dia", "dias")}. Projeto e preparação em dia.`
              : "Projeto e preparação em dia.",
        }
      : { rotulo: etapa.rotulo, detalhe: etapa.detalhe, rota: etapa.rota };

  let fase: ResumoDaJornada["fase"];
  let proximoPasso: ProximoPasso | null;
  if (e.aconteceu && etapaOperacional) {
    fase = "operacao";
    proximoPasso = passoDaOperacao(etapaOperacional);
  } else if (etapaDoProjeto) {
    fase = "projeto";
    proximoPasso = { rotulo: etapaDoProjeto.rotulo, detalhe: etapaDoProjeto.detalhe, rota: etapaDoProjeto.rota };
  } else if (etapaOperacional) {
    fase = "operacao";
    proximoPasso = passoDaOperacao(etapaOperacional);
  } else {
    fase = "concluido";
    proximoPasso = null;
  }

  const veredito = vereditoDoEvento({
    jornada: e.jornada,
    cancelado: e.cancelado ?? false,
    aconteceu: e.aconteceu,
    diasParaOEvento: e.diasParaOEvento ?? null,
    reservasComDeficit: e.reservasComDeficit,
    pecasForaSemVoltar: e.pecasForaSemVoltar ?? 0,
    retornoPorConferir: e.retornoPorConferir,
    proximoPasso,
  });

  // O déficit antes do evento e o retorno não conferido já estão nos motivos
  // do veredito; depois do evento, o déficit de reserva que nunca saiu ainda
  // é dito aqui (o veredito não o conta: o evento passou).
  const extras =
    e.aconteceu && e.reservasComDeficit > 0
      ? [plural(e.reservasComDeficit, "reserva de acervo sem peça suficiente", "reservas de acervo sem peça suficiente")]
      : [];
  // O que só a jornada sabe vem primeiro — e o veredito antes de tudo: a
  // Saúde já aparece inteira na sua própria lista, e o teto não pode cortar
  // justamente o aviso que decide o veredito.
  // Aviso da Saúde que o veredito já disse com a data junto não se repete:
  // "Contrato ainda não anexado" logo abaixo de "Contrato em aberto a 5 dias
  // do evento — contrato não anexado" é a mesma notícia duas vezes.
  const daSaude = e.atencaoDaSaude.filter((a) => {
    const etapa = AVISO_COBERTO_PELA_ETAPA[a];
    return !etapa || !veredito.motivos.some((m) => m.startsWith(etapa));
  });
  const atencao = [...new Set([...veredito.motivos, ...extras, ...daSaude])].slice(
    0,
    TETO_DE_ATENCAO,
  );

  return { fase, proximoPasso, atencao, veredito };
}
