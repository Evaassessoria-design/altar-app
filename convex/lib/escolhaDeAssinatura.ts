// ─────────────────────────────────────────────────────────────────────────────
// QUAL ASSINATURA SUSTENTA O ACESSO DESTE CLIENTE
//
// Módulo PURO: nenhuma dependência do Convex, nenhuma chamada de rede. Recebe
// as assinaturas do cliente já lidas do Asaas, com as cobranças de cada uma, e
// devolve QUAL delas prova que o cliente está pagando.
//
// ── O CASO REAL QUE OBRIGOU ISTO A EXISTIR ──────────────────────────────────
// Uma cliente ficou com DUAS assinaturas ACTIVE no mesmo cliente do Asaas:
//
//   sub_d6v66o4btfs5it63  criada 31/08  CREDIT_CARD  cobrança CONFIRMED  ← paga
//   sub_lmil9bi1p0jhaw9e  criada 01/09  UNDEFINED    OVERDUE + PENDING   ← fantasma
//
// O ALTAR tinha a SEGUNDA gravada. A escolha anterior era:
//
//   if (idGravado) {
//     const atual = await get(`/subscriptions/${idGravado}`);
//     if (atual?.status === "ACTIVE") return atual;   // ← devolvia a fantasma
//   }
//   // só chegava aqui se o id gravado NÃO estivesse ativo
//
// Como a fantasma estava ACTIVE, a função devolvia ela, o reconciliador olhava
// as cobranças dela, não achava nenhuma paga e concluía "sem assinatura paga".
// Todo dia. A assinatura que recebeu os R$ 119,90 nunca era consultada, e uma
// cliente adimplente ficou presa no paywall.
//
// ── A REGRA ─────────────────────────────────────────────────────────────────
// DINHEIRO É A PROVA. Entre assinaturas ativas, vence a que tem cobrança PAGA.
// "Estar ACTIVE" no Asaas não prova nada: criar uma assinatura já a deixa
// ACTIVE, mesmo que ninguém nunca pague.
//
// O id gravado no ALTAR só desempata — nunca decide sozinho, porque foi
// justamente ele que estava errado.
// ─────────────────────────────────────────────────────────────────────────────

/** Cobranças que JÁ FORAM PAGAS — provam que a assinatura está em dia. */
export const STATUS_PAGO = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

/** Cobranças que ainda podem ser pagas — levam o cliente de volta ao pagamento. */
export const STATUS_EM_ABERTO = ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"];

export type AssinaturaAsaas = {
  id: string;
  status?: string;
  dateCreated?: string;
  paymentLink?: string | null;
};

export type CobrancaAsaas = {
  id: string;
  status?: string;
  invoiceUrl?: string | null;
  dateCreated?: string;
};

/** Uma assinatura do cliente junto das cobranças dela. */
export type CandidataDeAssinatura = {
  assinatura: AssinaturaAsaas;
  cobrancas: CobrancaAsaas[];
};

/** Esta assinatura tem alguma cobrança comprovadamente paga? */
export function temCobrancaPaga(cobrancas: CobrancaAsaas[]): boolean {
  return cobrancas.some((c) => STATUS_PAGO.includes(c.status ?? ""));
}

/** Alguma cobrança venceu e não foi paga? É dinheiro faltando AGORA. */
export function temCobrancaEmAtraso(cobrancas: CobrancaAsaas[]): boolean {
  return cobrancas.some((c) => c.status === "OVERDUE");
}

/**
 * A assinatura está EM DIA a ponto de liberar acesso por conta própria?
 *
 * ── POR QUE "TEM ALGUMA COBRANÇA PAGA" NÃO BASTA ────────────────────────────
 * A conferência diária lista as contas que TÊM cliente no Asaas e ainda não
 * constam como ativas — e `overdue` está entre elas. A regra anterior era
 * "existe alguma cobrança paga entre as últimas 20?". Considere:
 *
 *   jan…jun  CONFIRMED     ← o cliente pagou seis meses
 *   julho    OVERDUE       ← parou de pagar
 *
 * O webhook marca `overdue`, a tolerância se esgota e o acesso é bloqueado —
 * corretamente. Aí a conferência roda, encontra a cobrança CONFIRMED de junho
 * entre as últimas 20 e REATIVA a conta. No dia seguinte, de novo. Um cliente
 * inadimplente voltaria a ter acesso para sempre, todo dia, pela própria rede
 * de segurança que existe para o caso oposto.
 *
 * A regra é conservadora de propósito: havendo cobrança vencida em aberto, a
 * conferência não concede nada. Ela só ATIVA quem está comprovadamente em dia;
 * bloquear continua sendo exclusividade dos avisos do Asaas.
 *
 * Quem paga em atraso não fica de fora: a cobrança sai de OVERDUE e vira
 * RECEIVED/CONFIRMED no próprio Asaas, e aí a conta volta a estar em dia.
 */
export function assinaturaEmDia(cobrancas: CobrancaAsaas[]): boolean {
  return temCobrancaPaga(cobrancas) && !temCobrancaEmAtraso(cobrancas);
}

/** Ordem estável: a mais antiga primeiro. Sem data, vai para o fim. */
function maisAntigaPrimeiro(a: AssinaturaAsaas, b: AssinaturaAsaas): number {
  const da = a.dateCreated ?? "9999-12-31";
  const db = b.dateCreated ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  // Empate de data (duas criadas no mesmo dia): o id desempata, para a escolha
  // não depender da ordem em que o Asaas devolveu a lista.
  return a.id < b.id ? -1 : 1;
}

/**
 * A assinatura que sustenta o acesso, entre as candidatas ATIVAS.
 *
 * @param candidatas assinaturas ATIVAS do cliente, com as cobranças de cada uma.
 * @param idGravado  o que o ALTAR tem gravado. Só desempata; nunca decide.
 *
 * @returns a assinatura escolhida, ou `null` quando não há nenhuma ativa.
 */
export function escolherAssinatura(
  candidatas: CandidataDeAssinatura[],
  idGravado?: string,
): AssinaturaAsaas | null {
  const ativas = candidatas.filter((c) => c.assinatura.status === "ACTIVE");
  if (ativas.length === 0) return null;
  if (ativas.length === 1) return ativas[0].assinatura;

  // ── 1. As que PROVAM pagamento ────────────────────────────────────────────
  const pagas = ativas.filter((c) => temCobrancaPaga(c.cobrancas));

  if (pagas.length > 0) {
    // O id gravado só vale se ele TAMBÉM prova pagamento. Isso mantém o
    // vínculo estável quando já está certo, sem deixá-lo vencer quando está
    // errado — que era o bug.
    const gravadaEPaga = pagas.find((c) => c.assinatura.id === idGravado);
    if (gravadaEPaga) return gravadaEPaga.assinatura;

    return pagas.map((c) => c.assinatura).sort(maisAntigaPrimeiro)[0];
  }

  // ── 2. Nenhuma provou pagamento ───────────────────────────────────────────
  // Não há como escolher pela verdade do dinheiro. Preserva o vínculo atual
  // (não inventa mudança) e, na falta dele, a mais antiga — determinístico.
  const gravada = ativas.find((c) => c.assinatura.id === idGravado);
  if (gravada) return gravada.assinatura;

  return ativas.map((c) => c.assinatura).sort(maisAntigaPrimeiro)[0];
}

/**
 * As assinaturas ativas que NÃO foram escolhidas.
 *
 * É o material do alerta administrativo: mais de uma assinatura ativa no mesmo
 * cliente significa risco de cobrança dupla e precisa de olho humano.
 */
export function assinaturasDescartadas(
  candidatas: CandidataDeAssinatura[],
  escolhida: AssinaturaAsaas | null,
): AssinaturaAsaas[] {
  if (!escolhida) return [];
  return candidatas
    .filter((c) => c.assinatura.status === "ACTIVE" && c.assinatura.id !== escolhida.id)
    .map((c) => c.assinatura);
}
