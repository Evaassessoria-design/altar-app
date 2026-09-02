// ─────────────────────────────────────────────────────────────────────────────
// "PRECISAM DA SUA ATENÇÃO"
//
// Responde a pergunta que a decoradora faz ao abrir o sistema de manhã: quais
// eventos exigem alguma coisa de mim hoje?
//
// ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
// Não existe nota, score, percentual de saúde nem semáforo calculado por peso
// arbitrário. Um número como "78% saudável" parece informação e não é: ninguém
// consegue dizer o que fazer para mudá-lo.
//
// Aqui cada motivo de atenção é uma FRASE VERIFICÁVEL, ligada a um dado real e
// a uma tela onde resolver. Se a decoradora discordar de um motivo, ela
// consegue apontar exatamente qual dado o gerou.
//
// ── O QUE É PENDÊNCIA DA DECORADORA ─────────────────────────────────────────
// O ALTAR é o sistema da EMPRESA DE DECORAÇÃO. "Confirmar menu final após
// degustação · Buffet Terra Nova" chegou a aparecer aqui como pendência dela —
// e não é: é assunto do cliente com o buffet. A decoradora cadastra esses
// fornecedores para alinhar horário de montagem, energia e layout, mas as
// tarefas internas deles nunca foram trabalho dela.
//
// O filtro é `ehEscopoDaDecoradora` (lib/escopoDecoradora.ts), a MESMA regra
// que o financeiro usa. Uma lista só, dois consumidores — duas listas
// divergiriam na primeira semana.
//
// ── A REGRA DE OURO DO PRAZO ────────────────────────────────────────────────
// Pendência só vira ATENÇÃO quando o evento está próximo. Uma compra pendente
// para um casamento daqui a oito meses não é problema — é o estado normal do
// trabalho. A proximidade é o que transforma pendência em urgência.
// ─────────────────────────────────────────────────────────────────────────────

/** Dias a partir dos quais uma pendência do evento passa a pedir atenção. */
export const JANELA_ATENCAO_DIAS = 30;

/** Abaixo disso o evento é tratado como iminente: qualquer pendência pesa mais. */
export const JANELA_URGENTE_DIAS = 7;

/**
 * Por quantos dias DEPOIS do evento ainda perguntamos por peça que não voltou.
 *
 * Existe porque o painel só olha para a frente, e "não voltou" é uma pergunta
 * que só nasce depois. Sem um limite, um evento de 2024 com uma peça mal
 * conferida ficaria pendurado no painel para sempre.
 */
export const JANELA_RETORNO_DIAS = 30;

export type NivelAtencao = "urgente" | "atencao";

export type MotivoAtencao = {
  /** Frase pronta, verificável, no vocabulário da operação. */
  texto: string;
  /** Para onde ir para resolver. Caminho relativo dentro do app. */
  destino: string;
};

export type EventoComAtencao = {
  eventId: string;
  nome: string;
  data: string;
  diasAte: number;
  nivel: NivelAtencao;
  motivos: MotivoAtencao[];
};

import { ehEscopoDaDecoradora } from "./escopoDecoradora";

export type EntradaAtencao = {
  eventId: string;
  nome: string;
  data: string;
  /** Dias inteiros até o evento. Negativo = já passou. */
  diasAte: number;
  checklistPendentes: number;
  comprasPendentes: number;
  comprasAtrasadas: number;
  /**
   * Compradas e ainda NÃO recebidas. O dinheiro saiu, a caixa não chegou.
   *
   * Ausente nas leituras antigas (campo aditivo): sem ele, o motivo
   * simplesmente não aparece — nunca um número inventado.
   */
  comprasAguardandoEntrega?: number;
  fornecedoresAguardando: number;
  equipeEscalada: number;
  /**
   * Ações escritas à mão, com o fornecedor de origem e a CATEGORIA dele.
   *
   * A categoria não é enfeite: é ela que decide se a ação é da decoradora ou
   * do fornecedor do cliente. Sem esse campo, o filtro teria de acontecer na
   * consulta — e a próxima consulta a esquecer dele traria o buffet de volta.
   */
  acoesDeFornecedor: { fornecedor: string; texto: string; categoria?: string }[];
  /**
   * Peças que a Ficha pediu e o acervo não cobre, somadas.
   *
   * É um número CALCULADO a partir de reserva e janela — não é "não sei".
   * Material reutilizável SEM item de acervo vinculado não entra aqui de
   * propósito: ausência de informação não é pendência, e pintar de vermelho o
   * que ninguém cadastrou ensinaria a decoradora a ignorar o painel.
   */
  acervoDeficit?: number;
  /**
   * Peças que saíram, não voltaram, e cuja janela operacional JÁ TERMINOU.
   *
   * Durante a janela não é pendência nenhuma: a peça está no evento, que é
   * onde ela deve estar. Depois do fim da janela vira pergunta real — e ainda
   * assim é só uma pergunta: o sistema nunca converte isso em perda sozinho.
   */
  acervoNaoRetornado?: number;
};

/** Dias inteiros entre duas datas "AAAA-MM-DD". */
export function diasEntre(deISO: string, ateISO: string): number {
  const de = Date.parse(`${deISO.slice(0, 10)}T12:00:00Z`);
  const ate = Date.parse(`${ateISO.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(de) || Number.isNaN(ate)) return Number.NaN;
  return Math.round((ate - de) / 86_400_000);
}

function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${muitos}`;
}

/**
 * Motivos de atenção de UM evento.
 *
 * Devolve lista vazia quando não há nada a dizer — e é isso que tira o evento
 * do painel. Nenhum evento aparece "só para preencher".
 */
export function motivosDeAtencao(e: EntradaAtencao): MotivoAtencao[] {
  const motivos: MotivoAtencao[] = [];
  const base = `/eventos/${e.eventId}`;

  // Atraso é o único motivo que vale INDEPENDENTE da proximidade: a data
  // limite foi definida pela própria decoradora e já passou.
  if (e.comprasAtrasadas > 0) {
    motivos.push({
      texto: `${plural(e.comprasAtrasadas, "compra atrasada", "compras atrasadas")}`,
      destino: "/compras",
    });
  }

  // Peça que saiu e não voltou DEPOIS do fim da janela vale independente da
  // proximidade — o evento já passou, e é justamente por isso que a pergunta
  // existe. Fica acima do corte de janela abaixo, que descarta evento passado.
  if ((e.acervoNaoRetornado ?? 0) > 0) {
    motivos.push({
      texto: `${plural(e.acervoNaoRetornado!, "peça do acervo não voltou", "peças do acervo não voltaram")}`,
      destino: `${base}/acervo`,
    });
  }

  // Ação escrita à mão também vale sempre: alguém registrou que precisa fazer.
  // Mas só a da OPERAÇÃO DELA. A degustação do buffet e a carta de drinks do
  // bar são tarefas de quem o cliente contratou, não da decoradora.
  for (const a of e.acoesDeFornecedor) {
    if (!ehEscopoDaDecoradora(a.categoria)) continue;
    motivos.push({ texto: `${a.texto} · ${a.fornecedor}`, destino: `${base}/fornecedores` });
  }

  // Daqui para baixo, só quando o evento está dentro da janela.
  if (e.diasAte > JANELA_ATENCAO_DIAS || e.diasAte < 0) return motivos;

  if (e.comprasPendentes > 0) {
    motivos.push({
      texto: `${plural(e.comprasPendentes, "item de compra pendente", "itens de compra pendentes")}`,
      destino: "/compras",
    });
  }
  if (e.checklistPendentes > 0) {
    motivos.push({
      texto: `${plural(e.checklistPendentes, "item do carregamento a conferir", "itens do carregamento a conferir")}`,
      destino: `${base}/checklist/pre`,
    });
  }
  if (e.fornecedoresAguardando > 0) {
    motivos.push({
      texto: `${plural(e.fornecedoresAguardando, "fornecedor sem confirmação", "fornecedores sem confirmação")}`,
      destino: `${base}/fornecedores`,
    });
  }
  // ── O QUE FOI COMPRADO E NÃO CHEGOU ──────────────────────────────────────
  // Estado que nenhuma tela mostrava: o item foi pago e continua com o
  // fornecedor. Enquanto o evento está longe isso é normal — a entrega tem
  // prazo. Perto do evento vira risco operacional real, porque não há mais
  // tempo de cobrar, trocar ou improvisar.
  //
  // Por isso só entra na janela urgente, e NÃO torna o evento urgente por si:
  // é um aviso, não um atraso. Quem define atraso é a data limite que a
  // decoradora gravou.
  if ((e.comprasAguardandoEntrega ?? 0) > 0 && e.diasAte <= JANELA_URGENTE_DIAS) {
    motivos.push({
      texto: `${plural(e.comprasAguardandoEntrega!, "compra ainda não recebida", "compras ainda não recebidas")}`,
      destino: "/compras",
    });
  }

  // Déficit de acervo: a Ficha pede mais do que existe livre na janela. Só
  // aparece com o evento dentro da janela de atenção — faltar peça para daqui
  // a três meses ainda dá tempo de resolver comprando ou alugando, e avisar
  // cedo demais é o que transforma painel em ruído.
  if ((e.acervoDeficit ?? 0) > 0) {
    motivos.push({
      texto: `${plural(e.acervoDeficit!, "peça do acervo em falta", "peças do acervo em falta")}`,
      destino: `${base}/acervo`,
    });
  }

  // Falta de equipe só é problema quando o evento está realmente perto.
  if (e.equipeEscalada === 0 && e.diasAte <= JANELA_URGENTE_DIAS) {
    motivos.push({ texto: "Ninguém escalado para a montagem", destino: base });
  }

  return motivos;
}

/**
 * Monta o painel: só os eventos que têm motivo, do mais próximo ao mais
 * distante.
 *
 * `urgente` é uma classificação explicável — evento em até 7 dias com alguma
 * pendência, ou compra atrasada — e não um peso calculado.
 */
export function montarAtencao(eventos: readonly EntradaAtencao[]): EventoComAtencao[] {
  return eventos
    .map((e) => {
      const motivos = motivosDeAtencao(e);
      const urgente =
        e.comprasAtrasadas > 0 || (e.diasAte >= 0 && e.diasAte <= JANELA_URGENTE_DIAS);
      return {
        eventId: e.eventId,
        nome: e.nome,
        data: e.data,
        diasAte: e.diasAte,
        nivel: (urgente ? "urgente" : "atencao") as NivelAtencao,
        motivos,
      };
    })
    .filter((e) => e.motivos.length > 0)
    .sort((a, b) => {
      if (a.nivel !== b.nivel) return a.nivel === "urgente" ? -1 : 1;
      return a.diasAte - b.diasAte;
    });
}
