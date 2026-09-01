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
// ── A REGRA DE OURO DO PRAZO ────────────────────────────────────────────────
// Pendência só vira ATENÇÃO quando o evento está próximo. Uma compra pendente
// para um casamento daqui a oito meses não é problema — é o estado normal do
// trabalho. A proximidade é o que transforma pendência em urgência.
// ─────────────────────────────────────────────────────────────────────────────

/** Dias a partir dos quais uma pendência do evento passa a pedir atenção. */
export const JANELA_ATENCAO_DIAS = 30;

/** Abaixo disso o evento é tratado como iminente: qualquer pendência pesa mais. */
export const JANELA_URGENTE_DIAS = 7;

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

export type EntradaAtencao = {
  eventId: string;
  nome: string;
  data: string;
  /** Dias inteiros até o evento. Negativo = já passou. */
  diasAte: number;
  checklistPendentes: number;
  comprasPendentes: number;
  comprasAtrasadas: number;
  fornecedoresAguardando: number;
  equipeEscalada: number;
  /** Ações escritas à mão pela decoradora, com o fornecedor de origem. */
  acoesDeFornecedor: { fornecedor: string; texto: string }[];
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

  // Ação escrita à mão também vale sempre: alguém registrou que precisa fazer.
  for (const a of e.acoesDeFornecedor) {
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
