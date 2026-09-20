// ─────────────────────────────────────────────────────────────────────────────
// O QUE A TELA FAZ COM UMA CONTA BLOQUEADA
//
// Isto é APENAS apresentação e navegação. Não decide acesso: a decisão já veio
// do backend (`convex/lib/access.ts` → `access.blocked`). Aqui só se traduz
// essa decisão em "o que a pessoa consegue abrir e o que ela lê na tela".
//
// ── A CONTRADIÇÃO QUE ISTO RESOLVE ──────────────────────────────────────────
// O servidor bloqueia DEZ entradas, e só elas: criar evento, converter lead,
// seis geradores de URL de upload e as ações de IA. `accessGuard.ts` diz, em
// comentário, exatamente por quê:
//
//   "NÃO aplicada a leituras nem à edição do que a pessoa já tem. Quem está
//    bloqueada continua enxergando e ajustando seus próprios dados. Isso é
//    deliberado: trancar o acesso aos próprios dados seria hostil, atrapalharia
//    a exportação em PDF de um evento já pago e criaria problema de LGPD."
//
// A tela fazia o oposto: `SubscriptionGuard` mandava TODAS as rotas para o
// paywall, deixando só `/configuracoes`. Na prática o aplicativo fechava, e a
// decoradora perdia o acesso aos próprios dados e ao PDF de um evento que ela
// já tinha pago.
//
// Não há regra comercial nova aqui. Há a tela passando a obedecer à regra que
// o backend já declarava.
//
// ── O QUE CONTINUA BLOQUEADO ────────────────────────────────────────────────
// Tudo o que custa dinheiro ou entrega valor novo. E continua bloqueado NO
// SERVIDOR, que é onde vale: `requireActiveAccess` não foi afrouxado em nenhum
// ponto. Uma conta vencida que tente criar um evento recebe a recusa do
// backend, com a mensagem que `accessGuard` já escreve.
//
// ── POR QUE UM AVISO PERMANENTE, E NÃO UM REDIRECIONAMENTO ──────────────────
// O redirecionamento respondia "você não pode entrar". A resposta correta é
// "você pode ver o que é seu, e para voltar a criar, regularize". O aviso não
// se fecha: some quando a conta volta, não quando a pessoa clica.
// ─────────────────────────────────────────────────────────────────────────────

/** O que o backend devolve em `users.getSubscriptionStatus`.access. */
export type DecisaoDeAcesso =
  | {
      blocked?: boolean;
      reason?: "trial_expired" | "subscription_cancelled" | "payment_overdue";
      overdueDaysLeft?: number;
    }
  | null
  | undefined;

export type AvisoDeBloqueio = {
  /** A conta está bloqueada para criar. */
  bloqueada: boolean;
  /** Título curto, na língua de quem usa. */
  titulo: string;
  /** O que ela AINDA pode fazer — a parte que o aviso antigo não dizia. */
  descricao: string;
  /** Texto do botão. */
  acao: string;
};

/**
 * Rotas que uma conta bloqueada alcança mesmo assim.
 *
 * Hoje são TODAS: nenhuma rota do aplicativo cria nada só por ser aberta, e o
 * que cria está guardado no servidor. A função existe para que o dia em que
 * aparecer uma rota que escreve ao abrir, a exceção tenha onde morar — e um
 * teste que a exija.
 */
export function podeAbrirRota(_rota: string, _bloqueada: boolean): boolean {
  return true;
}

const AVISOS: Record<string, Omit<AvisoDeBloqueio, "bloqueada">> = {
  trial_expired: {
    titulo: "Seu período de teste terminou",
    descricao:
      "Seus eventos, fotos e lançamentos continuam aqui e você pode consultar " +
      "e baixar tudo. Para criar eventos novos e enviar arquivos, assine.",
    acao: "Ver planos",
  },
  subscription_cancelled: {
    titulo: "Sua assinatura está cancelada",
    descricao:
      "Nada foi apagado: seus eventos e documentos continuam disponíveis para " +
      "consulta e download. Reative para voltar a criar.",
    acao: "Reativar assinatura",
  },
  payment_overdue: {
    titulo: "Seu pagamento está em atraso",
    descricao:
      "Você continua com acesso ao que já cadastrou. Para criar eventos novos " +
      "e enviar arquivos, regularize o pagamento.",
    acao: "Regularizar",
  },
};

const PADRAO: Omit<AvisoDeBloqueio, "bloqueada"> = {
  titulo: "Assinatura necessária para criar",
  descricao:
    "Seus dados continuam disponíveis para consulta e download. Assine para " +
    "voltar a criar eventos e enviar arquivos.",
  acao: "Ver planos",
};

/**
 * O aviso a exibir, se houver.
 *
 * Conta liberada devolve `bloqueada: false` — e o chamador não desenha nada.
 * Nunca devolve texto vazio: um aviso sem explicação faz a pessoa procurar o
 * problema no lugar errado.
 */
export function avisoDeBloqueio(acesso: DecisaoDeAcesso): AvisoDeBloqueio {
  if (!acesso?.blocked) {
    return { bloqueada: false, titulo: "", descricao: "", acao: "" };
  }
  const aviso = (acesso.reason && AVISOS[acesso.reason]) || PADRAO;
  return { bloqueada: true, ...aviso };
}

/**
 * Aviso de inadimplência AINDA dentro da tolerância.
 *
 * Não é bloqueio: a conta funciona inteira. Mas avisar antes de fechar é o que
 * separa "o sistema parou" de "eu fui avisada três dias antes" — e é o dado
 * que `resolveAccess` já calcula (`overdueDaysLeft`) e ninguém exibia.
 *
 * `null` quando não se aplica, para o chamador não desenhar nada.
 */
export function avisoDeTolerancia(acesso: DecisaoDeAcesso): string | null {
  if (!acesso || acesso.blocked) return null;
  const dias = acesso.overdueDaysLeft;
  if (typeof dias !== "number" || dias <= 0) return null;
  return dias === 1
    ? "Seu pagamento está em atraso. Você tem 1 dia para regularizar antes que a criação de eventos seja bloqueada."
    : `Seu pagamento está em atraso. Você tem ${dias} dias para regularizar antes que a criação de eventos seja bloqueada.`;
}
