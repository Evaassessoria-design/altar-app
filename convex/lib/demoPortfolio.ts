import { DEMO_MARKER } from "./demoData";
import { dataEmDias } from "./dataDoDia";

// ─────────────────────────────────────────────────────────────────────────────
// A EMPRESA EM VOLTA DO EVENTO PRINCIPAL
//
// ── O PROBLEMA QUE ISTO RESOLVE ─────────────────────────────────────────────
// O seed cria Marina & Gabriel com muita profundidade — briefing de oito
// áreas, ficha técnica, acervo, reservas, financeiro. É o evento que sustenta
// o clímax da apresentação.
//
// E deixava o resto do produto vazio. O Dashboard abria com um evento, a
// Agenda com uma data, o Financeiro com um cliente. A primeira frase da
// apresentação — "essa é a sua empresa hoje" — caía no vazio, porque uma
// empresa com um casamento não é uma empresa.
//
// ── POR QUE ESTES EVENTOS SÃO RASOS DE PROPÓSITO ────────────────────────────
// Eles existem para dar CONTORNO, não para serem abertos. Cada um tem evento,
// financeiro coerente e o suficiente de compras para aparecer nos painéis.
// Encher os doze de briefing completo faria o seed demorar, o banco crescer e
// ninguém veria a diferença — porque a live abre um evento, não doze.
//
// QUALIDADE > QUANTIDADE, e a qualidade aqui é a COERÊNCIA.
//
// ── AS DATAS SÃO RELATIVAS ──────────────────────────────────────────────────
// `dataEmDias(-40)` e não "2026-08-16". Um seed com datas fixas envelhece: o
// evento "da semana que vem" vira passado no primeiro ensaio de novembro, e a
// demo passa a mostrar uma empresa que parou de trabalhar.
//
// Marina & Gabriel mantém data fixa (10/10/2026) porque ela é citada no
// roteiro e precisa cair quatro dias depois da live.
//
// ── A REGRA QUE NENHUM DADO AQUI PODE QUEBRAR ───────────────────────────────
// OS NÚMEROS CONVERSAM. Se um evento está `completed`, o financeiro dele não
// tem recebimento em aberto. Se uma compra foi recebida, ela não aparece como
// pendente. Se algo está pago, não aparece vencido.
//
// Há teste cobrando cada uma dessas (`demo.coerencia.test.ts`) — porque um
// número que não fecha numa apresentação é pior do que um campo vazio: o campo
// vazio é honesto, o número errado destrói a confiança em todos os outros.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um lançamento do portfólio.
 *
 * ── POR QUE É UMA UNIÃO, E NÃO UM OBJETO COM CAMPOS OPCIONAIS ──────────────
 * `isPaid: true` sem dizer QUANDO e COMO foi pago é exatamente o defeito que
 * a trava `demo.test.ts > "o que está pago diz QUANDO e COMO"` pegou na
 * primeira rodada deste portfólio — vinte lançamentos pagos sem `paidAt` nem
 * `paymentMethod`, que na tela viram um recebimento quitado sem data.
 *
 * Com a união, o TypeScript recusa antes do teste: não há como escrever aqui
 * um lançamento pago que não diga como foi pago, nem um em aberto que carregue
 * forma de pagamento.
 *
 * `pagoEmDias` AUSENTE = pago na data do vencimento. A demo não conta história
 * de atraso onde não precisa: a única tensão de dinheiro dela são as duas
 * cobranças vencidas, e espalhar atrasinhos por vinte linhas diluiria isso.
 */
type LancamentoDoPortfolio = {
  type: "income" | "expense";
  category: string;
  description: string;
  amount: number;
  /** Dias a partir de hoje para o vencimento/competência. */
  emDias: number;
} & (
  | { isPaid: true; forma: string; pagoEmDias?: number }
  | { isPaid: false; forma?: undefined; pagoEmDias?: undefined }
);

export type EventoDoPortfolio = {
  event: {
    name: string;
    type: "wedding" | "corporate" | "birthday" | "debutante" | "baptism" | "other";
    /** Dias a partir de hoje. Negativo = passado. */
    emDias: number;
    location: string;
    clientName: string;
    clientPhone?: string;
    budget?: number;
    status: "planning" | "confirmed" | "in_progress" | "completed" | "cancelled";
    notes?: string;
  };
  /** Lançamentos do evento. */
  transacoes: LancamentoDoPortfolio[];
  /** Compras do evento. Poucas, e só onde contam uma história. */
  compras?: {
    name: string;
    category?: string;
    quantity?: number;
    unit?: string;
    supplier?: string;
    unitPrice?: number;
    isPurchased: boolean;
    /** Prazo em dias a partir de hoje. Ausente = sem prazo. */
    prazoEmDias?: number;
  }[];
  /** Itens de checklist da fase pré. Só onde o evento está próximo. */
  checklist?: { name: string; isChecked: boolean }[];
};

/**
 * Os doze eventos que dão contorno à empresa.
 *
 * A distribuição é deliberada, e cada um existe para fazer UMA tela dizer
 * alguma coisa:
 *
 *   · três realizados      → Financeiro com histórico, e margem já fechada
 *   · um esta semana       → painel de atenção com urgência de verdade
 *   · um com compra atrasada → Compras com o vermelho que a tela precisa ter
 *   · um com saldo a receber vencido → Financeiro com cobrança pendente
 *   · quatro em planejamento → Agenda e Eventos com futuro
 *   · dois em negociação   → Funil com oportunidade viva
 *
 * Nenhum deles é casamento por padrão: o produto atende corporativo, quinze
 * anos e aniversário, e uma demo só de noivos ensina o público errado sobre o
 * que o ALTAR faz.
 */
export const PORTFOLIO_DEMO: readonly EventoDoPortfolio[] = [
  // ── REALIZADOS ────────────────────────────────────────────────────────
  {
    event: {
      name: "Casamento Helena & Rui",
      type: "wedding",
      emDias: -62,
      location: "Casa Rara — São Paulo, SP",
      clientName: "Helena Prado e Rui Sampaio",
      clientPhone: "(11) 90010-1122",
      budget: 142_000,
      status: "completed",
      notes: `Casamento no fim de tarde, 140 convidados. ${DEMO_MARKER}`,
    },
    // Evento fechado: tudo recebido, tudo pago. Um `completed` com saldo em
    // aberto faria o Financeiro mostrar cobrança de quem já foi embora.
    transacoes: [
      { type: "income", category: "Sinal", description: "Sinal do contrato", amount: 56_800, emDias: -140, isPaid: true, forma: "PIX" },
      { type: "income", category: "Parcela", description: "Segunda parcela", amount: 56_800, emDias: -90, isPaid: true, forma: "Transferência" },
      { type: "income", category: "Parcela", description: "Parcela final", amount: 28_400, emDias: -60, isPaid: true, forma: "Transferência" },
      { type: "expense", category: "Flores", description: "Floricultura Aurora", amount: 21_400, emDias: -66, isPaid: true, forma: "PIX" },
      { type: "expense", category: "Locação", description: "Mobiliário e louça", amount: 18_900, emDias: -64, isPaid: true, forma: "Boleto" },
      { type: "expense", category: "Equipe", description: "Montagem e desmontagem", amount: 9_600, emDias: -61, isPaid: true, forma: "Transferência" },
    ],
  },
  {
    event: {
      name: "15 anos da Antonella",
      type: "debutante",
      emDias: -34,
      location: "Espaço Meridiano — São Paulo, SP",
      clientName: "Família Bianchi",
      clientPhone: "(11) 90011-2233",
      budget: 68_000,
      status: "completed",
      notes: `Festa de debutante, 160 convidados, pista em destaque. ${DEMO_MARKER}`,
    },
    transacoes: [
      { type: "income", category: "Sinal", description: "Sinal do contrato", amount: 34_000, emDias: -95, isPaid: true, forma: "PIX" },
      { type: "income", category: "Parcela", description: "Parcela final", amount: 34_000, emDias: -32, isPaid: true, forma: "Transferência" },
      { type: "expense", category: "Flores", description: "Arranjos e pista", amount: 11_200, emDias: -36, isPaid: true, forma: "PIX" },
      { type: "expense", category: "Locação", description: "Painéis e lounge", amount: 8_400, emDias: -35, isPaid: true, forma: "Boleto" },
    ],
  },
  {
    event: {
      name: "Confraternização Vitrine Digital",
      type: "corporate",
      emDias: -18,
      location: "Rooftop Alcântara — São Paulo, SP",
      clientName: "Vitrine Digital Ltda",
      clientPhone: "(11) 90012-3344",
      budget: 43_500,
      status: "completed",
      notes: `Confraternização de fim de ciclo, 90 pessoas, clima informal. ${DEMO_MARKER}`,
    },
    transacoes: [
      { type: "income", category: "Parcela", description: "Pagamento integral", amount: 43_500, emDias: -20, isPaid: true, forma: "Transferência" },
      { type: "expense", category: "Locação", description: "Mobiliário e iluminação", amount: 14_800, emDias: -19, isPaid: true, forma: "Boleto" },
      { type: "expense", category: "Equipe", description: "Montagem", amount: 4_200, emDias: -18, isPaid: true, forma: "Transferência" },
    ],
  },

  // ── O QUE PEDE ATENÇÃO AGORA ──────────────────────────────────────────
  {
    event: {
      name: "Corporativo Nexo — Convenção Anual",
      type: "corporate",
      emDias: 6,
      location: "Centro de Convenções Ibirapuera — São Paulo, SP",
      clientName: "Nexo Tecnologia S.A.",
      clientPhone: "(11) 90013-4455",
      budget: 96_000,
      status: "confirmed",
      notes: `Convenção de 400 pessoas, palco central e três salas paralelas. ${DEMO_MARKER}`,
    },
    // Daqui a seis dias com compra atrasada: é o evento que faz o painel de
    // atenção ter o que mostrar, e a urgência é REAL, não decorativa.
    transacoes: [
      { type: "income", category: "Sinal", description: "Sinal do contrato", amount: 48_000, emDias: -45, isPaid: true, forma: "PIX" },
      { type: "income", category: "Parcela", description: "Saldo na entrega", amount: 48_000, emDias: 8, isPaid: false },
      { type: "expense", category: "Locação", description: "Estrutura de palco", amount: 22_000, emDias: -3, isPaid: true, forma: "Boleto" },
    ],
    compras: [
      { name: "Tecido para backdrop do palco", category: "Têxtil", quantity: 60, unit: "m", supplier: "Linhos do Vale", unitPrice: 38.0, isPurchased: false, prazoEmDias: -4 },
      { name: "Vasos altos para o foyer", category: "Decoração", quantity: 24, unit: "un", supplier: "Casa das Velas", unitPrice: 42.0, isPurchased: true, prazoEmDias: -8 },
      { name: "Placas de sinalização das salas", category: "Papelaria", quantity: 12, unit: "un", supplier: "Ateliê Folha", unitPrice: 31.0, isPurchased: false, prazoEmDias: 2 },
    ],
    checklist: [
      { name: "Confirmar horário de montagem com o centro de convenções", isChecked: true },
      { name: "Fechar o backdrop do palco", isChecked: false },
      { name: "Escalar equipe de montagem noturna", isChecked: false },
    ],
  },
  {
    event: {
      name: "Casamento Sofia & Tomás",
      type: "wedding",
      emDias: 21,
      location: "Quinta do Olival — Itu, SP",
      clientName: "Sofia Andrade e Tomás Ferraz",
      clientPhone: "(11) 90014-5566",
      budget: 118_000,
      status: "confirmed",
      notes: `Casamento no campo, 120 convidados, cerimônia sob as oliveiras. ${DEMO_MARKER}`,
    },
    // Recebimento VENCIDO: é o que faz o Financeiro ter uma cobrança real
    // para o Assistente encontrar quando perguntarem "o que precisa de mim".
    transacoes: [
      { type: "income", category: "Sinal", description: "Sinal do contrato", amount: 47_200, emDias: -70, isPaid: true, forma: "PIX" },
      { type: "income", category: "Parcela", description: "Segunda parcela", amount: 35_400, emDias: -9, isPaid: false },
      { type: "expense", category: "Flores", description: "Adiantamento floricultura", amount: 9_800, emDias: -12, isPaid: true, forma: "PIX" },
    ],
    compras: [
      { name: "Velas pilar para a cerimônia", category: "Decoração", quantity: 90, unit: "un", supplier: "Casa das Velas", unitPrice: 12.9, isPurchased: true, prazoEmDias: -2 },
      { name: "Toalhas de linho cru", category: "Têxtil", quantity: 14, unit: "un", supplier: "Linhos do Vale", unitPrice: 96.0, isPurchased: false, prazoEmDias: 10 },
    ],
    checklist: [
      { name: "Aprovar paleta final com a noiva", isChecked: true },
      { name: "Visita técnica na Quinta do Olival", isChecked: false },
    ],
  },

  // ── EM PLANEJAMENTO ───────────────────────────────────────────────────
  {
    event: {
      name: "Bodas de Prata — Célia & Amaro",
      type: "other",
      emDias: 38,
      location: "Casa Rara — São Paulo, SP",
      clientName: "Célia e Amaro Nogueira",
      clientPhone: "(11) 90015-6677",
      budget: 52_000,
      status: "confirmed",
      notes: `Jantar de bodas, 70 convidados, clima intimista. ${DEMO_MARKER}`,
    },
    transacoes: [
      { type: "income", category: "Sinal", description: "Sinal do contrato", amount: 20_800, emDias: -14, isPaid: true, forma: "PIX" },
      { type: "income", category: "Parcela", description: "Saldo antes do evento", amount: 31_200, emDias: 31, isPaid: false },
    ],
  },
  {
    event: {
      name: "Aniversário de 50 anos — Beatriz",
      type: "birthday",
      emDias: 47,
      location: "Residência particular — Alphaville, SP",
      clientName: "Beatriz Camargo",
      clientPhone: "(11) 90020-1122",
      budget: 38_500,
      status: "planning",
      notes: `Jantar em casa, 60 convidados, decoração em tons de terracota. ${DEMO_MARKER}`,
    },
    transacoes: [
      { type: "income", category: "Sinal", description: "Sinal do contrato", amount: 15_400, emDias: -6, isPaid: true, forma: "PIX" },
    ],
  },
  {
    event: {
      name: "Lançamento Coleção Aurora — Marca Lume",
      type: "corporate",
      emDias: 55,
      location: "Galeria Vão — São Paulo, SP",
      clientName: "Lume Cosméticos",
      clientPhone: "(11) 90021-2233",
      budget: 74_000,
      status: "planning",
      notes: `Lançamento de coleção, 150 convidados, cenografia de marca. ${DEMO_MARKER}`,
    },
    transacoes: [
      { type: "income", category: "Sinal", description: "Sinal do contrato", amount: 29_600, emDias: -2, isPaid: false },
    ],
  },
  {
    event: {
      name: "Casamento Júlia & Enzo",
      type: "wedding",
      emDias: 78,
      location: "Fazenda Aurora — Itu, SP",
      clientName: "Júlia Peixoto e Enzo Barreto",
      clientPhone: "(11) 90022-3344",
      budget: 165_000,
      status: "planning",
      notes: `Casamento de verão, 200 convidados, cerimônia à beira do lago. ${DEMO_MARKER}`,
    },
    transacoes: [
      { type: "income", category: "Sinal", description: "Sinal do contrato", amount: 66_000, emDias: 5, isPaid: false },
    ],
  },
  {
    event: {
      name: "15 anos da Manuela",
      type: "debutante",
      emDias: 96,
      location: "Espaço Meridiano — São Paulo, SP",
      clientName: "Família Restivo",
      clientPhone: "(11) 90023-4455",
      budget: 71_000,
      status: "planning",
      notes: `Festa de debutante, 180 convidados, pista com passarela. ${DEMO_MARKER}`,
    },
    transacoes: [],
  },
  {
    event: {
      name: "Batizado do Bento",
      type: "baptism",
      emDias: 30,
      location: "Capela Santa Clara — São Paulo, SP",
      clientName: "Família Moretti",
      clientPhone: "(11) 90024-5566",
      budget: 18_900,
      status: "confirmed",
      notes: `Batizado e almoço em família, 45 convidados. ${DEMO_MARKER}`,
    },
    transacoes: [
      { type: "income", category: "Parcela", description: "Pagamento integral", amount: 18_900, emDias: -4, isPaid: true, forma: "Transferência" },
      { type: "expense", category: "Flores", description: "Arranjos da capela", amount: 3_200, emDias: 12, isPaid: false },
    ],
  },
  {
    event: {
      name: "Casamento Rafaela & Ian",
      type: "wedding",
      emDias: -5,
      location: "Quinta do Olival — Itu, SP",
      clientName: "Rafaela Duarte e Ian Correia",
      clientPhone: "(11) 90025-6677",
      budget: 128_000,
      status: "in_progress",
      // Recém-realizado e ainda em fechamento: é o estado em que uma
      // decoradora passa a semana seguinte a todo evento, e nenhuma tela
      // mostrava isso.
      notes: `Realizado no fim de semana. Fechando acertos com fornecedores. ${DEMO_MARKER}`,
    },
    transacoes: [
      { type: "income", category: "Sinal", description: "Sinal do contrato", amount: 51_200, emDias: -120, isPaid: true, forma: "PIX" },
      { type: "income", category: "Parcela", description: "Parcela final", amount: 76_800, emDias: -7, isPaid: true, forma: "Transferência" },
      { type: "expense", category: "Equipe", description: "Desmontagem", amount: 5_400, emDias: 3, isPaid: false },
    ],
  },
];

/**
 * Quantos eventos a empresa demo tem ao todo.
 *
 * O portfólio mais o evento principal. Exportado para o teste de coerência
 * poder cobrar o número sem recontar à mão — e para o roteiro da live poder
 * citá-lo sem chutar.
 */
export const TOTAL_DE_EVENTOS_DEMO = PORTFOLIO_DEMO.length + 1;

/** As datas em ISO, resolvidas contra hoje. */
export function dataDoEvento(e: EventoDoPortfolio): string {
  return dataEmDias(e.event.emDias);
}
