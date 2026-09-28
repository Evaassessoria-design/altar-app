import { INTENCOES_DE_INTERESSE, ROTULO_DA_INTENCAO } from "../respostaDoInteressado";

// ═════════════════════════════════════════════════════════════════════════════
// O RELATÓRIO DO ESCRITÓRIO — "o que aconteceu desde a última vez que entrei?"
//
// ── POR RELEVÂNCIA, NÃO POR ORDEM DE CHEGADA ────────────────────────────────
// Uma lista cronológica obriga o dono a ler tudo para achar o que importa. O
// relatório separa em cinco gavetas, na ordem em que se age sobre elas:
//
//   URGENTE           custa dinheiro ou oportunidade se esperar
//   ATENÇÃO           algo saiu do normal e merece olhar
//   OPORTUNIDADES     alguém demonstrou interesse
//   TRABALHO FEITO    o que o Escritório e a equipe já resolveram
//   AGUARDANDO VOCÊ   o que está pronto e só anda com uma decisão sua
//
// ── NADA AQUI AFIRMA O QUE NÃO ACONTECEU ────────────────────────────────────
// Cada linha nasce de um registro que existe: uma rodada gravada, um rascunho
// decidido, uma resposta registrada. Não há "o agente analisou o mercado":
// se não há tabela que prove, não há frase. O feed é a mesma matéria-prima em
// ordem de tempo, e cada item diz QUEM fez — o sistema, uma pessoa, a landing.
//
// Puro: o servidor lê as tabelas (`convex/escritorio.ts`), isto decide o que
// dizer. Testado em `escritorio.relatorio.test.ts`.
// ═════════════════════════════════════════════════════════════════════════════

export type RodadaNoRelatorio = {
  criadoEm: number;
  disparadoPor: "humano" | "sistema";
  analisadas: number;
  mensagensPreparadas: number;
  decisoesParaVoce: number;
  duplicidadesApontadas: number;
  resumo: string;
};

export type FatosDoRelatorio = {
  desde: number;
  agora: number;
  negocio: { inadimplentes: number; bloqueadas: number; testeVencido: number };
  /** Rodadas no período, da mais nova para a mais antiga. */
  rodadas: readonly RodadaNoRelatorio[];
  /** A última rodada de todas, mesmo antes do período. `null` = nunca rodou. */
  ultimaRodada: RodadaNoRelatorio | null;
  rascunhos: {
    porRevisar: number;
    aprovadosSemEnvio: number;
    /** Decididos NO PERÍODO. */
    decididos: readonly {
      em: number;
      status: "aprovado" | "descartado" | "enviado_manualmente";
      leadNome: string;
    }[];
  };
  respostas: readonly {
    em: number;
    leadNome: string;
    intencao: string;
    precisaDeHumano: boolean;
  }[];
  interessadosNovos: readonly { em: number; nome: string }[];
  central: {
    pendentes: number;
    decididas: readonly { em: number; status: string }[];
    expiradas: readonly { em: number }[];
  };
  /**
   * O Assistente das decoradoras, SÓ EM NÚMEROS: nenhum pedido, resposta ou
   * nome de conta sai daqui. É a observabilidade da IA — sem isto, um modelo
   * fora do ar em produção só apareceria quando alguém reclamasse, porque a
   * resposta por regra (`redacao.ts`) esconde a queda da decoradora, de
   * propósito. AUSENTE = não medido.
   */
  assistente?: {
    trabalhos: number;
    contas: number;
    falharam: number;
    contasComFalha: number;
    /** Concluídos sem passar pelo modelo. */
    porRegra: number;
  };
};

export type LinhaDoRelatorio = { texto: string; link?: string };

export type Relatorio = {
  urgente: LinhaDoRelatorio[];
  atencao: LinhaDoRelatorio[];
  oportunidades: LinhaDoRelatorio[];
  realizado: LinhaDoRelatorio[];
  aguardandoVoce: LinhaDoRelatorio[];
  /** Nada urgente, nada fora do normal, nada esperando decisão. */
  tudoEmDia: boolean;
};

/**
 * Depois de quanto tempo sem rodada o silêncio vira aviso.
 *
 * O cron roda uma vez por dia; 26 horas dá a folga de um atraso da
 * plataforma sem deixar passar um dia inteiro perdido. É o que faz uma rodada
 * automática que parou de acontecer aparecer aqui — e não na semana seguinte,
 * quando alguém estranhar a fila vazia.
 */
export const SILENCIO_DO_ESCRITORIO_MS = 26 * 60 * 60 * 1000;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Até três nomes, e o resto contado — nunca uma lista que some no meio. */
function nomes(lista: readonly string[]): string {
  const unicos = [...new Set(lista)];
  if (unicos.length <= 3) return unicos.join(", ");
  return `${unicos.slice(0, 3).join(", ")} e mais ${unicos.length - 3}`;
}

export function montarRelatorio(f: FatosDoRelatorio): Relatorio {
  const urgente: LinhaDoRelatorio[] = [];
  const atencao: LinhaDoRelatorio[] = [];
  const oportunidades: LinhaDoRelatorio[] = [];
  const realizado: LinhaDoRelatorio[] = [];
  const aguardandoVoce: LinhaDoRelatorio[] = [];

  // ── URGENTE ────────────────────────────────────────────────────────────
  if (f.central.pendentes > 0) {
    urgente.push({
      texto: `${plural(f.central.pendentes, "resposta da Central espera", "respostas da Central esperam")} aprovação — expiram com a janela do canal.`,
      link: "/central",
    });
  }
  if (f.negocio.inadimplentes > 0) {
    urgente.push({
      texto:
        `${plural(f.negocio.inadimplentes, "assinatura inadimplente", "assinaturas inadimplentes")}` +
        (f.negocio.bloqueadas > 0 ? ` (${f.negocio.bloqueadas} já bloqueada${f.negocio.bloqueadas === 1 ? "" : "s"}).` : "."),
      link: "/admin",
    });
  }

  // ── ATENÇÃO ────────────────────────────────────────────────────────────
  if (!f.ultimaRodada) {
    atencao.push({ texto: "O Escritório ainda não rodou nenhuma vez.", link: "/campanha" });
  } else if (f.agora - f.ultimaRodada.criadoEm > SILENCIO_DO_ESCRITORIO_MS) {
    atencao.push({
      texto:
        "O Escritório não roda há mais de um dia. A rodada automática é diária — " +
        "se ela parou, a fila de rascunhos também parou.",
      link: "/campanha",
    });
  }
  if (f.ultimaRodada && f.ultimaRodada.duplicidadesApontadas > 0) {
    atencao.push({
      texto: `${plural(f.ultimaRodada.duplicidadesApontadas, "possível cadastro duplicado", "possíveis cadastros duplicados")} na campanha.`,
      link: "/campanha",
    });
  }
  if (f.negocio.testeVencido > 0) {
    atencao.push({
      texto: `${plural(f.negocio.testeVencido, "conta terminou", "contas terminaram")} o teste sem assinar.`,
      link: "/admin",
    });
  }
  if (f.assistente && f.assistente.falharam > 0) {
    atencao.push({
      texto:
        `${plural(f.assistente.falharam, "trabalho do Assistente não terminou", "trabalhos do Assistente não terminaram")}` +
        ` (${plural(f.assistente.contasComFalha, "conta", "contas")}).`,
    });
  }
  if (f.assistente && f.assistente.porRegra > 0) {
    // Não é erro para a decoradora — ela recebeu resposta. É sinal para o
    // dono: o modelo caiu, está lento ou não está configurado.
    atencao.push({
      texto:
        `${plural(f.assistente.porRegra, "resposta do Assistente saiu", "respostas do Assistente saíram")} ` +
        "por regra, sem o modelo de IA — ele falhou, demorou ou não está configurado.",
    });
  }
  if (f.central.expiradas.length > 0) {
    atencao.push({
      texto: `${plural(f.central.expiradas.length, "proposta da Central expirou", "propostas da Central expiraram")} sem decisão.`,
      link: "/central",
    });
  }

  // ── OPORTUNIDADES ──────────────────────────────────────────────────────
  if (f.interessadosNovos.length > 0) {
    oportunidades.push({
      texto: `${plural(f.interessadosNovos.length, "novo interessado", "novos interessados")}: ${nomes(f.interessadosNovos.map((i) => i.nome))}.`,
      link: "/campanha",
    });
  }
  const interesse = f.respostas.filter((r) => INTENCOES_DE_INTERESSE.has(r.intencao));
  if (interesse.length > 0) {
    oportunidades.push({
      texto: `${plural(interesse.length, "resposta de interesse", "respostas de interesse")}: ${nomes(interesse.map((r) => r.leadNome))}.`,
      link: "/campanha",
    });
  }

  // ── TRABALHO FEITO ─────────────────────────────────────────────────────
  if (f.rodadas.length > 0) {
    const doSistema = f.rodadas.filter((r) => r.disparadoPor === "sistema").length;
    const preparadas = f.rodadas.reduce((s, r) => s + r.mensagensPreparadas, 0);
    // "Analisou" é da rodada mais recente: somar as rodadas contaria a mesma
    // pessoa duas vezes e o número cresceria sem ninguém novo.
    const analisadas = f.rodadas[0].analisadas;
    realizado.push({
      texto:
        `O Escritório rodou ${plural(f.rodadas.length, "vez", "vezes")}` +
        (doSistema > 0 ? ` (${doSistema} sozinho)` : "") +
        `: acompanha ${plural(analisadas, "interessado", "interessados")} e preparou ` +
        `${plural(preparadas, "mensagem", "mensagens")}.`,
    });
  }
  if (f.assistente && f.assistente.trabalhos > 0) {
    realizado.push({
      texto:
        `O Assistente fez ${plural(f.assistente.trabalhos, "trabalho", "trabalhos")} ` +
        `para ${plural(f.assistente.contas, "conta", "contas")}.`,
    });
  }
  if (f.respostas.length > 0) {
    realizado.push({
      texto: `${plural(f.respostas.length, "resposta registrada e classificada", "respostas registradas e classificadas")}.`,
    });
  }
  if (f.rascunhos.decididos.length > 0) {
    const n = (s: string) => f.rascunhos.decididos.filter((d) => d.status === s).length;
    const partes = [
      n("enviado_manualmente") && `${n("enviado_manualmente")} enviada(s)`,
      n("aprovado") && `${n("aprovado")} aprovada(s)`,
      n("descartado") && `${n("descartado")} descartada(s)`,
    ].filter(Boolean);
    realizado.push({
      texto: `${plural(f.rascunhos.decididos.length, "mensagem decidida", "mensagens decididas")}: ${partes.join(", ")}.`,
    });
  }

  // ── AGUARDANDO VOCÊ ────────────────────────────────────────────────────
  if (f.rascunhos.porRevisar > 0) {
    aguardandoVoce.push({
      texto: `${plural(f.rascunhos.porRevisar, "mensagem preparada", "mensagens preparadas")} para você revisar.`,
      link: "/campanha",
    });
  }
  if (f.rascunhos.aprovadosSemEnvio > 0) {
    aguardandoVoce.push({
      texto: `${plural(f.rascunhos.aprovadosSemEnvio, "mensagem aprovada espera", "mensagens aprovadas esperam")} você enviar — nenhum canal está conectado.`,
      link: "/campanha",
    });
  }
  if (f.ultimaRodada && f.ultimaRodada.decisoesParaVoce > 0) {
    aguardandoVoce.push({
      texto: `${plural(f.ultimaRodada.decisoesParaVoce, "decisão", "decisões")} que só você pode tomar.`,
      link: "/campanha",
    });
  }
  const pedemVoce = f.respostas.filter((r) => r.precisaDeHumano);
  if (pedemVoce.length > 0) {
    aguardandoVoce.push({
      texto: `${plural(pedemVoce.length, "resposta pede", "respostas pedem")} você: ${nomes(pedemVoce.map((r) => r.leadNome))}.`,
      link: "/campanha",
    });
  }

  return {
    urgente,
    atencao,
    oportunidades,
    realizado,
    aguardandoVoce,
    tudoEmDia: urgente.length === 0 && atencao.length === 0 && aguardandoVoce.length === 0,
  };
}

// ── O FEED ──────────────────────────────────────────────────────────────────

export type AtorDaAtividade = "sistema" | "pessoa" | "landing";

export type Atividade = { em: number; ator: AtorDaAtividade; texto: string };

const DECISAO: Record<string, string> = {
  aprovado: "aprovada",
  descartado: "descartada",
  enviado_manualmente: "marcada como enviada",
};

/**
 * O que aconteceu, em ordem de tempo, dizendo quem fez.
 *
 * "sistema" é o Escritório por conta própria (rodada automática, expiração);
 * "pessoa" é alguém da equipe (rodada manual, decisão, resposta registrada);
 * "landing" é gente de fora que chegou sozinha.
 */
export function montarFeed(f: FatosDoRelatorio, limite = 40): { atividades: Atividade[]; cortado: boolean } {
  const todas: Atividade[] = [
    ...f.rodadas.map((r) => ({
      em: r.criadoEm,
      ator: (r.disparadoPor === "sistema" ? "sistema" : "pessoa") as AtorDaAtividade,
      texto: `${r.disparadoPor === "sistema" ? "Rodada automática" : "Rodada manual"}: ${r.resumo}`,
    })),
    ...f.rascunhos.decididos.map((d) => ({
      em: d.em,
      ator: "pessoa" as const,
      texto: `Mensagem para ${d.leadNome} ${DECISAO[d.status] ?? d.status}.`,
    })),
    ...f.respostas.map((r) => ({
      em: r.em,
      ator: "pessoa" as const,
      texto:
        `Resposta de ${r.leadNome} registrada — classificada como ` +
        `"${(ROTULO_DA_INTENCAO as Record<string, string>)[r.intencao] ?? r.intencao}".`,
    })),
    ...f.interessadosNovos.map((i) => ({
      em: i.em,
      ator: "landing" as const,
      texto: `Novo interessado: ${i.nome}.`,
    })),
    ...f.central.decididas.map((d) => ({
      em: d.em,
      ator: "pessoa" as const,
      texto: `Resposta da Central ${d.status === "recusada" ? "recusada" : "aprovada"}.`,
    })),
    ...f.central.expiradas.map((e) => ({
      em: e.em,
      ator: "sistema" as const,
      texto: "Proposta da Central expirou sem decisão.",
    })),
  ].sort((a, b) => b.em - a.em);

  return { atividades: todas.slice(0, limite), cortado: todas.length > limite };
}

// ── DESDE QUANDO ────────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;

export type JanelaDoRelatorio = {
  desde: number;
  /** Como a tela deve chamar o período — nunca "desde sua última visita" sem ser. */
  base: "ultima_visita" | "ultimas_24h" | "ultimos_7_dias";
};

/**
 * O período do relatório.
 *
 * "Desde a última vez que entrei" é a pergunta, e a última visita vem do
 * navegador. Duas bordas, e a tela DIZ qual valeu:
 *   · visita há menos de 24h → as últimas 24h (um relatório de dez minutos
 *     diria "nada aconteceu", o que é verdade e inútil);
 *   · visita há mais de 7 dias, ou nenhuma → teto de 7 dias / 24h, para a
 *     leitura não crescer sem limite.
 */
export function janelaDoRelatorio(
  ultimaVisita: number | undefined,
  agora: number,
): JanelaDoRelatorio {
  const ontem = agora - DIA_MS;
  if (ultimaVisita === undefined || !Number.isFinite(ultimaVisita) || ultimaVisita >= ontem) {
    return { desde: ontem, base: "ultimas_24h" };
  }
  const semana = agora - 7 * DIA_MS;
  if (ultimaVisita < semana) return { desde: semana, base: "ultimos_7_dias" };
  return { desde: ultimaVisita, base: "ultima_visita" };
}
