import { quantidadeLimpa } from "./fichaTecnica";
import { ehIndivisivel } from "./materiais";

// ─────────────────────────────────────────────────────────────────────────────
// ACERVO — o que a decoradora POSSUI, e para quem já prometeu.
//
// A pergunta que este módulo existe para responder:
//
//   "Se dois eventos no mesmo fim de semana precisam dos mesmos 30 vasos, o
//    ALTAR consegue impedir que eu conte os mesmos vasos duas vezes?"
//
// ── QUATRO ESTADOS QUE NÃO SE CONFUNDEM ─────────────────────────────────────
//
//   TENHO     `quantidadeTotal` do item — o único número CADASTRADO
//   RESERVEI  intenção de uso numa janela; NÃO é movimento físico
//   SAIU      saiu fisicamente do galpão
//   VOLTOU    voltou fisicamente
//
// Reservar não faz nada sair. Sair não faz nada voltar. E nada disso mexe no
// total: se saíram 20 e voltaram 19, o acervo continua com 40 até alguém
// decidir o que aconteceu com a peça (perda? quebra? ficou no caminhão?).
// Baixar automático seria o sistema decidindo sozinho um prejuízo.
//
// ── O QUE É DERIVADO (e por isso nunca envelhece) ───────────────────────────
// Reservado, disponível, déficit e "falta voltar" são SEMPRE calculados. Não
// existe campo `disponivel` no banco: um total guardado diverge em silêncio na
// primeira reserva que alguém cancelar.
//
// ── O QUE ESTE MÓDULO NÃO É ─────────────────────────────────────────────────
// Não é ERP, não é WMS, não é patrimônio. Não há peça numerada, não há
// prateleira, não há custo médio, não há baixa. É contagem por quantidade —
// "Vaso X: 40" — que é o suficiente para responder a pergunta acima.
// ─────────────────────────────────────────────────────────────────────────────

// ── JANELA OPERACIONAL ──────────────────────────────────────────────────────
//
// Um casamento no sábado ocupa as peças desde a montagem na véspera até o
// retorno no domingo. Comparar só `event.date === outroEvento.date` deixaria
// passar exatamente o caso que dói: dois eventos em dias vizinhos disputando
// as mesmas peças.
//
// As datas são DIA CIVIL ("AAAA-MM-DD"), nunca instante: a peça está
// comprometida no dia inteiro. Isso também mantém a comparação textual segura
// e imune ao fuso — o mesmo cuidado de lib/dataDoDia.ts.

export type Janela = { inicio: string; fim: string };

/** Dias que o evento ocupa antes e depois, quando não há dado melhor. */
export const DIAS_ANTES_PADRAO = 1;
export const DIAS_DEPOIS_PADRAO = 1;

/**
 * Janela sugerida a partir da data do evento.
 *
 * O modelo NÃO guarda data de montagem nem de desmontagem — `setupTime` e
 * `teardownTime` do briefing são HORAS ("07:00"), não datas. Então o padrão é
 * a véspera e o dia seguinte, que é a operação real da decoração: monta-se na
 * véspera e recolhe-se no dia seguinte.
 *
 * É SUGESTÃO, não regra: a janela é editável, e a tela diz de onde veio. Um
 * palpite silencioso seria pior do que perguntar.
 */
export function janelaSugerida(dataDoEvento: string): Janela {
  const dia = dataDoEvento.slice(0, 10);
  const base = Date.parse(`${dia}T12:00:00Z`);
  if (Number.isNaN(base)) return { inicio: dia, fim: dia };
  const mover = (dias: number) =>
    new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
  return { inicio: mover(-DIAS_ANTES_PADRAO), fim: mover(DIAS_DEPOIS_PADRAO) };
}

/** A janela faz sentido? Fim antes do início é erro de digitação, não intenção. */
export function janelaValida(janela: Janela): boolean {
  const { inicio, fim } = janela;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) return false;
  return inicio <= fim;
}

/**
 * Janela em ordem canônica.
 *
 * A mutation recusa janela invertida, mas dado corrompido (importação, edição
 * direta, versão futura com bug) chegaria até aqui — e uma janela `10 → 05`
 * contida numa janela larga produz conflito por acidente aritmético, com datas
 * ilegíveis na tela ("de 10/10 a 05/10").
 *
 * Normalizamos em vez de descartar: as peças ESTÃO prometidas a alguém, e
 * fingir que a reserva não existe liberaria peça que não está livre. Trocar as
 * pontas é a leitura conservadora — mantém o compromisso e o torna legível.
 */
export function normalizarJanela(janela: Janela): Janela {
  return janela.inicio <= janela.fim
    ? janela
    : { inicio: janela.fim, fim: janela.inicio };
}

/**
 * Duas janelas disputam as mesmas peças?
 *
 * INCLUSIVA nas duas pontas, e isso é uma decisão, não um descuido: uma janela
 * que termina dia 11 e outra que começa dia 11 DISPUTAM o dia 11. A peça não
 * consegue estar desmontando num evento e montando no outro no mesmo dia — e
 * na dúvida entre avisar demais e deixar a decoradora descobrir no galpão, o
 * certo é avisar.
 */
export function janelasConflitam(entradaA: Janela, entradaB: Janela): boolean {
  const a = normalizarJanela(entradaA);
  const b = normalizarJanela(entradaB);
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

// ── DISPONIBILIDADE ─────────────────────────────────────────────────────────

export type ReservaParaCalculo = {
  _id: string;
  eventId: string;
  quantidade: number;
  inicio: string;
  fim: string;
};

export type Disponibilidade = {
  /** O que está cadastrado no acervo. O único número que ninguém deriva. */
  total: number;
  /** Somado das reservas de OUTROS eventos que disputam esta janela. */
  reservadoPorOutros: number;
  /** Sobra para este evento. Nunca negativo — sobra negativa é déficit. */
  disponivel: number;
  /** Quanto este evento já reservou nesta janela. */
  jaReservadoAqui: number;
  /** Quem está segurando as peças, para a tela poder mostrar. */
  conflitos: {
    reservaId: string;
    eventId: string;
    quantidade: number;
    inicio: string;
    fim: string;
  }[];
};

/**
 * Quanto sobra deste item para um evento, numa janela.
 *
 * A reserva DO PRÓPRIO evento não conta contra ele — senão editar uma reserva
 * de 20 para 25 acusaria conflito com ela mesma.
 *
 * `total` menos o que outros seguram. Reservas que não tocam a janela são
 * irrelevantes: as peças estarão de volta a tempo.
 */
export function disponibilidadeNaJanela(
  total: number,
  reservas: readonly ReservaParaCalculo[],
  janela: Janela,
  eventoAtual: string | null,
): Disponibilidade {
  const conflitantes = reservas.filter(
    (r) => r.eventId !== eventoAtual && janelasConflitam({ inicio: r.inicio, fim: r.fim }, janela),
  );
  const reservadoPorOutros = quantidadeLimpa(
    conflitantes.reduce((s, r) => s + r.quantidade, 0),
  );
  const jaReservadoAqui = quantidadeLimpa(
    reservas
      .filter((r) => r.eventId === eventoAtual && janelasConflitam({ inicio: r.inicio, fim: r.fim }, janela))
      .reduce((s, r) => s + r.quantidade, 0),
  );

  return {
    total: quantidadeLimpa(total),
    reservadoPorOutros,
    disponivel: quantidadeLimpa(Math.max(0, total - reservadoPorOutros)),
    jaReservadoAqui,
    conflitos: conflitantes.map((r) => {
      // A janela sai normalizada para a tela nunca exibir "de 10/10 a 05/10".
      const janelaDele = normalizarJanela({ inicio: r.inicio, fim: r.fim });
      return {
        reservaId: r._id,
        eventId: r.eventId,
        quantidade: r.quantidade,
        inicio: janelaDele.inicio,
        fim: janelaDele.fim,
      };
    }),
  };
}

/**
 * Falta peça para atender uma quantidade pretendida?
 *
 * Devolve o DÉFICIT — quanto o acervo não cobre. Zero quando dá para todos.
 *
 * Isto NÃO bloqueia: a decoradora resolve alugando ou comprando, e o sistema
 * não pode impedi-la de registrar a intenção real. Reservar 30 quando há 25
 * grava 30 e mostra déficit de 5 — cortar para 25 em silêncio esconderia
 * justamente o problema que ela precisa ver.
 */
export function deficitDaReserva(pretendido: number, disponivel: number): number {
  return quantidadeLimpa(Math.max(0, pretendido - disponivel));
}

// ── SAÍDA E RETORNO ─────────────────────────────────────────────────────────

export type ReservaComMovimento = {
  quantidade: number;
  saiu?: number;
  voltou?: number;
};

export type SituacaoDaReserva =
  | "planejada"
  | "fora"
  | "retorno_parcial"
  | "retornada";

export const ROTULO_DA_RESERVA: Record<SituacaoDaReserva, string> = {
  planejada: "Reservado",
  fora: "Saiu do galpão",
  retorno_parcial: "Voltou em parte",
  retornada: "Voltou",
};

/**
 * A situação é DERIVADA das quantidades — não há campo de status.
 *
 * Um `status` gravado ao lado dos números diverge deles no primeiro ajuste:
 * alguém corrige "voltou" de 18 para 20 e o status continua dizendo "retorno
 * parcial". Derivar torna a contradição impossível.
 */
export function situacaoDaReserva(reserva: ReservaComMovimento): SituacaoDaReserva {
  const saiu = reserva.saiu ?? 0;
  const voltou = reserva.voltou ?? 0;
  if (saiu <= 0) return "planejada";
  if (voltou <= 0) return "fora";
  return voltou >= saiu ? "retornada" : "retorno_parcial";
}

/** Quantas peças saíram e ainda não voltaram. Nunca negativo. */
export function faltaVoltar(reserva: ReservaComMovimento): number {
  return quantidadeLimpa(Math.max(0, (reserva.saiu ?? 0) - (reserva.voltou ?? 0)));
}

/**
 * Saiu quantidade diferente da reservada?
 *
 * Positivo = saiu MAIS do que o reservado (a equipe pegou peça extra);
 * negativo = saiu menos. Ambos acontecem e nenhum é erro do sistema — só
 * informação. A reserva NÃO é ajustada por isso.
 */
export function divergenciaDaSaida(reserva: ReservaComMovimento): number {
  if (reserva.saiu === undefined) return 0;
  return quantidadeLimpa(reserva.saiu - reserva.quantidade);
}

// ── VALIDAÇÃO DE QUANTIDADE ─────────────────────────────────────────────────

/**
 * Quantidade física aceitável para uma unidade.
 *
 * Zero é válido (acervo zerado, reserva zerada). Negativo nunca é: não existe
 * "menos cinco vasos". Unidade indivisível não aceita fração — 2,5 vasos não
 * é uma quantidade, é um erro de digitação. Metro e quilo aceitam.
 */
export function quantidadeFisicaValida(valor: number, unidade: string): boolean {
  if (!Number.isFinite(valor) || valor < 0) return false;
  if (ehIndivisivel(unidade) && !Number.isInteger(valor)) return false;
  return true;
}

/**
 * Voltar MAIS do que saiu é matematicamente impossível.
 *
 * Diferente de "saiu mais que o reservado", que acontece de verdade: a equipe
 * pega peça extra no galpão. Mas voltar 22 de uma saída de 20 significa erro
 * de conferência — e aceitar em silêncio produziria um acervo fantasma.
 */
export function retornoPossivel(saiu: number | undefined, voltou: number): boolean {
  if (voltou < 0) return false;
  return voltou <= (saiu ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSTITUIÇÃO EXPLÍCITA — vários itens de acervo para o mesmo material
//
// "Preciso de 30 castiçais dourados, e posso atender com Roma, Viena ou Alto."
//
// O modelo já permitia isso: `collectionItems.materialId` sempre aceitou que
// vários itens apontassem para o mesmo material, e esse vínculo sempre foi
// feito à mão — o ALTAR nunca juntou peça por nome parecido, e continua não
// juntando. O que faltava era o CÓDIGO respeitar a relação: o agrupamento era
// um `new Map(itens.map(i => [i.materialId, i]))`, e num Map o último par com
// a mesma chave sobrescreve os anteriores. Dois castiçais no mesmo material e
// um deles sumia, sem erro e sem aviso.
//
// UNIDADE NUNCA É CONVERTIDA. 15 metros de fita não viram 15 peças. Item de
// unidade diferente fica de fora da soma — mas é DEVOLVIDO à parte, para a
// tela poder dizer por que ficou.
// ─────────────────────────────────────────────────────────────────────────────

export type ItemDeAcervoAgrupavel = {
  materialId?: string;
  unidade: string;
  quantidadeTotal: number;
  archived?: boolean;
};

/**
 * Agrupa o acervo por material técnico, preservando TODOS os itens de cada um.
 *
 * Arquivado fica de fora (não entra em reserva nova). Item sem material
 * vinculado não entra: vínculo é sempre explícito.
 */
export function agruparAcervoPorMaterial<T extends ItemDeAcervoAgrupavel>(
  itens: readonly T[],
): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    if (!item.materialId || item.archived) continue;
    const atual = grupos.get(item.materialId);
    if (atual) atual.push(item);
    else grupos.set(item.materialId, [item]);
  }
  return grupos;
}

export type Substitutos<T> = {
  /** Mesma unidade do material — podem somar. */
  compativeis: T[];
  /** Unidade diferente. Ficam de fora da conta, mas não são escondidos. */
  incompativeis: T[];
  /** Soma do estoque FÍSICO dos compatíveis. Não é disponibilidade. */
  totalFisico: number;
};

/**
 * Separa os substitutos que podem somar dos que não podem.
 *
 * `totalFisico` é estoque, NÃO disponibilidade: disponibilidade depende de
 * janela e continua saindo de `disponibilidadeNaJanela`, item por item.
 */
export function substitutosCompativeis<T extends ItemDeAcervoAgrupavel>(
  itens: readonly T[],
  unidadeDoMaterial: string,
): Substitutos<T> {
  const compativeis: T[] = [];
  const incompativeis: T[] = [];
  for (const i of itens) {
    if (i.unidade === unidadeDoMaterial) compativeis.push(i);
    else incompativeis.push(i);
  }
  return {
    compativeis,
    incompativeis,
    totalFisico: compativeis.reduce((s, i) => s + i.quantidadeTotal, 0),
  };
}
