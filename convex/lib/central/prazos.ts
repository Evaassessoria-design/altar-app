// ─────────────────────────────────────────────────────────────────────────────
// PRAZOS DA CENTRAL — JANELA DO CANAL, PENDÊNCIA E VENCIMENTO
//
// Duas escalas de tempo convivem aqui, de propósito:
//
//   INSTANTE (epoch ms)  mensagens e a janela de resposta do canal. Uma janela
//                        de 24h é um intervalo real, não um dia do calendário.
//
//   DIA CIVIL ("AAAA-MM-DD")  vencimento de tarefa. "Ligar para a cliente até
//                        sexta" é um dia, não um instante — e a comparação
//                        textual mantém isso imune a fuso, o mesmo cuidado que
//                        convex/lib/dataDoDia.ts documenta.
//
// Misturar as duas foi o defeito que já apagou o evento do dia no Dashboard.
// Aqui elas nunca se encostam.
// ─────────────────────────────────────────────────────────────────────────────

const HORA_MS = 3_600_000;
const DIA_MS = 86_400_000;

/**
 * Janela em que o WhatsApp permite responder livremente, a contar da última
 * mensagem RECEBIDA. Fora dela só é possível falar por template aprovado —
 * assunto do BLOCO 4.
 */
export const JANELA_RESPOSTA_MS = 24 * HORA_MS;

/** Uma aprovação pendente perde a validade junto com a janela que a motivou. */
export const TTL_APROVACAO_MS = JANELA_RESPOSTA_MS;

/** Horas sem resposta a partir das quais a conversa vira pendência visível. */
export const HORAS_PARA_PENDENCIA = 24;

/** Fim da janela, a partir do instante da última mensagem recebida. */
export function fimDaJanela(ultimaEntradaEm: number): number {
  return ultimaEntradaEm + JANELA_RESPOSTA_MS;
}

export function janelaAberta(janelaRespostaAte: number | undefined | null, agora: number): boolean {
  if (janelaRespostaAte === undefined || janelaRespostaAte === null) return true;
  return agora <= janelaRespostaAte;
}

/**
 * A conversa está esperando a ALTAR há tempo demais?
 *
 * Só conta quando a última mensagem foi de ENTRADA: uma conversa em que a
 * ALTAR já respondeu e aguarda o cliente não é pendência nossa.
 */
export function estaSemResposta(
  conversa: { ultimaMensagemEm: number; ultimaMensagemDirecao: string; status: string },
  agora: number,
  horas: number = HORAS_PARA_PENDENCIA,
): boolean {
  if (conversa.ultimaMensagemDirecao !== "entrada") return false;
  if (conversa.status === "resolvida" || conversa.status === "arquivada") return false;
  return agora - conversa.ultimaMensagemEm >= horas * HORA_MS;
}

/** Aprovação parada além do TTL — o cliente já não está mais naquela conversa. */
export function aprovacaoExpirou(
  aprovacao: { status: string; criadoEm: number; expiraEm?: number | null },
  agora: number,
): boolean {
  if (aprovacao.status !== "pendente") return false;
  const limite = aprovacao.expiraEm ?? aprovacao.criadoEm + TTL_APROVACAO_MS;
  return agora > limite;
}

/** "AAAA-MM-DD" do instante, em UTC. Toda a base já grava assim. */
export function diaCivil(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/** Dia civil daqui a N dias. `dias = 0` é hoje. */
export function diaCivilEmDias(epochMs: number, dias: number): string {
  return diaCivil(epochMs + dias * DIA_MS);
}

/**
 * Tarefa vencida.
 *
 * Comparação TEXTUAL entre datas "AAAA-MM-DD" — sem `Date`, sem fuso, sem a
 * chance de um evento do próprio dia sumir da lista.
 */
export function trabalhoVencido(
  trabalho: { status: string; venceEm?: string | null },
  hoje: string,
): boolean {
  if (trabalho.status === "concluido" || trabalho.status === "cancelado") return false;
  if (!trabalho.venceEm) return false;
  return trabalho.venceEm < hoje;
}

/** Vence hoje — nem atrasado, nem futuro. */
export function trabalhoVenceHoje(
  trabalho: { status: string; venceEm?: string | null },
  hoje: string,
): boolean {
  if (trabalho.status === "concluido" || trabalho.status === "cancelado") return false;
  return trabalho.venceEm === hoje;
}
