import {
  alcancou,
  definicaoDoEstagio,
  estagioDe,
  type EstagioDoInteressado,
  type InteressadoNoFunil,
} from "./campanha";
import type { TipoDeMensagem } from "./mensagensDaCampanha";

// ─────────────────────────────────────────────────────────────────────────────
// A PRÓXIMA MELHOR AÇÃO — UMA POR PESSOA, E NENHUMA EXECUTADA
//
// ── O QUE ESTE MÓDULO RESOLVE ───────────────────────────────────────────────
// Com trinta interessados, "quem eu abordo agora?" ainda cabe na cabeça. Com
// trezentos, não cabe — e o que acontece na prática é que se aborda quem está
// no topo da lista, que é quem chegou por último. Quem espera há duas semanas
// fica esperando para sempre.
//
// A regra aqui olha cada pessoa e responde UMA coisa: o que fazer com ela
// agora. Uma só, porque uma lista de três sugestões por pessoa é a mesma
// paralisia com mais texto.
//
// ── A REGRA NUNCA EXECUTA ───────────────────────────────────────────────────
// Devolve intenção. Quem prepara o rascunho é outro módulo, quem aprova é uma
// pessoa e quem envia é a mesma pessoa, fora do ALTAR. Não há caminho daqui
// até uma mensagem saindo.
//
// ── O QUE ELA NÃO SABE, ELA NÃO AFIRMA ──────────────────────────────────────
// Vários fatos são OPCIONAIS aqui — `undefined` significa "ninguém mediu",
// nunca "é zero". Um trial sem data de fim não vira "trial vencendo"; ele vira
// silêncio sobre esse ponto. É a mesma regra que a tela segue: enquanto não se
// sabe, não se afirma.
// ─────────────────────────────────────────────────────────────────────────────

/** O que se sabe sobre esta pessoa no momento da decisão. */
export type FatosDoInteressado = InteressadoNoFunil & {
  /** Existe telefone ou e-mail gravado? Sem canal, nenhuma mensagem faz sentido. */
  temCanal: boolean;
  /**
   * Dias desde que o convite foi enviado. `undefined` = não há registro.
   *
   * Sem esta data a pessoa NÃO entra na fila de follow-up. Entrar com uma data
   * inventada colocaria quem foi convidado ontem no mesmo balde de quem foi
   * convidado há duas semanas.
   */
  diasDesdeOConvite?: number;
  /** Dias até a campanha. Negativo depois dela. `undefined` = campanha desconhecida. */
  diasAteACampanha?: number;
  /** A conta de teste tem algum evento? `undefined` = não foi consultado. */
  eventosNaConta?: number;
  /** Dias até o fim do teste. Negativo = já venceu. `undefined` = sem prazo conhecido. */
  diasAteOFimDoTeste?: number;
};

export type UrgenciaDaAcao = "agora" | "esta_semana" | "quando_der" | "nenhuma";

export type ProximaAcao = {
  /**
   * O modelo a preparar, ou `null` quando a ação não é mandar mensagem.
   *
   * `null` com urgência "nenhuma" significa "não faça nada com esta pessoa" —
   * que é uma resposta legítima e a mais importante de todas: é ela que impede
   * o sistema de inventar trabalho para parecer útil.
   */
  mensagem: TipoDeMensagem | null;
  /** O que fazer, em imperativo curto. */
  acao: string;
  /** Por que esta pessoa, agora. Sempre sobre dado gravado. */
  motivo: string;
  urgencia: UrgenciaDaAcao;
  /**
   * Isto precisa de uma pessoa decidindo, não de um rascunho.
   *
   * Negociação, pedido de desconto, reclamação e ambiguidade caem aqui — e vão
   * para a fila "Precisa de você" em vez de virar mensagem preparada.
   */
  precisaDeHumano?: boolean;
};

/**
 * Depois de quantos dias sem resposta o follow-up faz sentido.
 *
 * Dois é o número da campanha: antes disso a pessoa ainda não leu, depois de
 * uma semana o assunto esfriou. Não é uma constante universal — é a janela
 * desta live, e está escrita aqui para poder ser discutida.
 */
export const DIAS_PARA_FOLLOW_UP = 2;

/** Depois disto, insistir vira incômodo. Para de sugerir e não inventa nada. */
export const DIAS_PARA_DESISTIR_DO_FOLLOW_UP = 14;

/** A partir daqui o teste está acabando e alguém precisa falar com ela. */
export const DIAS_DE_TESTE_PARA_ALERTAR = 5;

const NADA_A_FAZER: ProximaAcao = {
  mensagem: null,
  acao: "Nada agora",
  motivo: "Não há nada pendente com esta pessoa.",
  urgencia: "nenhuma",
};

/**
 * O que fazer com esta pessoa agora.
 *
 * As regras são lidas na ordem em que estão escritas, e a primeira que casa
 * vence. A ordem NÃO é arbitrária: os estados terminais vêm primeiro para que
 * ninguém proponha abordar comercialmente quem já é cliente ou já disse não.
 */
export function proximaAcao(f: FatosDoInteressado): ProximaAcao {
  const estagio = estagioDe(f);

  // ── Terminais: sair da campanha de aquisição ─────────────────────────────
  if (estagio === "convertido") {
    return {
      mensagem: null,
      acao: "Tirar da campanha",
      // Continuar abordando quem já assinou é o erro que faz o cliente novo
      // receber convite para conhecer o produto que ele acabou de comprar.
      motivo: "Já é cliente. Aquisição não fala mais com ela.",
      urgencia: "nenhuma",
    };
  }
  if (estagio === "descartado") {
    return {
      mensagem: null,
      acao: "Não abordar",
      motivo: "Disse que não tem interesse.",
      urgencia: "nenhuma",
    };
  }

  // ── Sem canal, nenhuma mensagem sai — e a pessoa não some da lista ───────
  if (!f.temCanal) {
    return {
      mensagem: null,
      acao: "Achar um contato",
      motivo: "Não há telefone nem e-mail gravado. Sem canal, nenhuma mensagem sai daqui.",
      urgencia: "quando_der",
      // É um buraco de cadastro, e buraco de cadastro é decisão de gente:
      // procurar no Instagram, perguntar a quem indicou, ou descartar.
      precisaDeHumano: true,
    };
  }

  // ── Testando: a pergunta deixa de ser comercial e vira de ativação ───────
  if (estagio === "testando") {
    // `undefined` = ninguém consultou. Não vira "zero eventos": afirmar que a
    // conta está vazia sem ter olhado mandaria a pessoa receber ajuda de
    // onboarding que ela não pediu e talvez não precise.
    if (f.eventosNaConta === 0) {
      return {
        mensagem: null,
        acao: "Ajudar a começar",
        motivo: "Está testando e ainda não criou nenhum evento. É aqui que um teste morre.",
        urgencia: "agora",
        precisaDeHumano: true,
      };
    }
    if (f.diasAteOFimDoTeste !== undefined && f.diasAteOFimDoTeste <= DIAS_DE_TESTE_PARA_ALERTAR) {
      return {
        mensagem: null,
        acao: "Falar sobre assinar",
        motivo:
          f.diasAteOFimDoTeste < 0
            ? "O teste já venceu."
            : `O teste acaba em ${f.diasAteOFimDoTeste} ${f.diasAteOFimDoTeste === 1 ? "dia" : "dias"}.`,
        urgencia: "agora",
        precisaDeHumano: true,
      };
    }
    return {
      mensagem: null,
      acao: "Acompanhar",
      motivo:
        f.eventosNaConta !== undefined
          ? `Está testando, com ${f.eventosNaConta} ${f.eventosNaConta === 1 ? "evento" : "eventos"} na conta.`
          : "Está testando o ALTAR.",
      urgencia: "quando_der",
    };
  }

  // ── Depois da live ───────────────────────────────────────────────────────
  if (estagio === "participou") {
    return {
      mensagem: "convite_trial",
      acao: "Convidar para testar",
      motivo: "Participou da apresentação e ainda não começou a testar.",
      urgencia: "agora",
    };
  }
  if (estagio === "nao_participou") {
    return {
      mensagem: "faltou_a_live",
      acao: "Oferecer uma demonstração",
      motivo: "Confirmou presença e não conseguiu vir.",
      urgencia: "esta_semana",
    };
  }
  if (estagio === "demonstracao") {
    return {
      mensagem: "convite_trial",
      acao: "Convidar para testar",
      motivo: "Já viu o ALTAR numa conversa individual.",
      urgencia: "esta_semana",
    };
  }

  // ── Confirmado: não abordar comercialmente ───────────────────────────────
  if (estagio === "confirmou") {
    // A live ainda não aconteceu: ela já disse sim, e insistir agora só serve
    // para desconfirmar. A única mensagem devida é lembrete, e lembrete tem
    // hora — não é "próxima ação", é calendário.
    if (f.diasAteACampanha !== undefined && f.diasAteACampanha > 1) {
      return {
        mensagem: null,
        acao: "Nada até a véspera",
        motivo: `Confirmou presença. Faltam ${f.diasAteACampanha} dias.`,
        urgencia: "nenhuma",
      };
    }
    if (f.diasAteACampanha === 1) {
      return {
        mensagem: "lembrete_24h",
        acao: "Mandar o lembrete da véspera",
        motivo: "A apresentação é amanhã.",
        urgencia: "agora",
      };
    }
    if (f.diasAteACampanha === 0) {
      return {
        mensagem: "lembrete_30min",
        acao: "Mandar o lembrete do dia",
        motivo: "A apresentação é hoje.",
        urgencia: "agora",
      };
    }
    if (f.diasAteACampanha !== undefined && f.diasAteACampanha < 0) {
      return {
        mensagem: null,
        acao: "Marcar se participou",
        // Ninguém disse se ela veio, e o sistema não tem como saber. Fingir
        // que participou infla a taxa de comparecimento; fingir que faltou a
        // derruba. A saída é pedir a informação a quem a tem.
        motivo: "A apresentação já aconteceu e ninguém marcou se ela esteve lá.",
        urgencia: "agora",
        precisaDeHumano: true,
      };
    }
    return {
      mensagem: null,
      acao: "Nada agora",
      motivo: "Confirmou presença.",
      urgencia: "nenhuma",
    };
  }

  // ── Respondeu ou demonstrou interesse, e falta o e-mail ──────────────────
  if (estagio === "respondeu" || estagio === "interessado") {
    return {
      mensagem: "pedido_de_email",
      acao: "Pedir o e-mail e confirmar a vaga",
      motivo: "Deu retorno e ainda não está na lista de confirmados.",
      urgencia: "agora",
    };
  }

  // ── Convidado, sem resposta ──────────────────────────────────────────────
  if (alcancou(f, "convidado") && !alcancou(f, "respondeu")) {
    if (f.diasDesdeOConvite === undefined) {
      return {
        mensagem: null,
        acao: "Conferir se o convite saiu",
        // Está marcado como convidado e não há data — registro anterior ao
        // carimbo, ou etapa movida à mão. Um follow-up por cima disso pode
        // ser a segunda mensagem em dez minutos.
        motivo: "Está como convidado, mas não há registro de quando o convite saiu.",
        urgencia: "quando_der",
        precisaDeHumano: true,
      };
    }
    if (f.diasDesdeOConvite > DIAS_PARA_DESISTIR_DO_FOLLOW_UP) {
      return {
        mensagem: null,
        acao: "Parar de insistir",
        motivo: `Convidada há ${f.diasDesdeOConvite} dias, sem resposta. Insistir mais vira incômodo.`,
        urgencia: "nenhuma",
      };
    }
    if (f.diasDesdeOConvite >= DIAS_PARA_FOLLOW_UP) {
      return {
        mensagem: "follow_up_sem_resposta",
        acao: "Mandar um follow-up",
        motivo: `Convidada há ${f.diasDesdeOConvite} dias e ainda não respondeu.`,
        urgencia: "esta_semana",
      };
    }
    return {
      mensagem: null,
      acao: "Esperar",
      motivo:
        f.diasDesdeOConvite === 0
          ? "Convidada hoje. Dar tempo de ler."
          : `Convidada há ${f.diasDesdeOConvite} ${f.diasDesdeOConvite === 1 ? "dia" : "dias"}.`,
      urgencia: "nenhuma",
    };
  }

  // ── Ainda não foi convidada ──────────────────────────────────────────────
  if (estagio === "novo" || estagio === "contato_preparado") {
    const preparado = estagio === "contato_preparado";
    return {
      mensagem: "convite",
      acao: preparado ? "Revisar e enviar o convite" : "Preparar o convite",
      motivo: preparado
        ? "A mensagem já está escrita e ninguém enviou."
        : "Chegou e ninguém falou com ela ainda.",
      urgencia: "agora",
    };
  }

  return NADA_A_FAZER;
}

/**
 * A ordem em que as pessoas devem ser atendidas.
 *
 * Urgência primeiro; dentro dela, quem espera há mais tempo. "Quem espera há
 * mais tempo" é o critério que impede a lista de atender sempre quem chegou
 * por último — que é o que acontece quando a ordem é a do cadastro.
 */
const PESO_DA_URGENCIA: Record<UrgenciaDaAcao, number> = {
  agora: 0,
  esta_semana: 1,
  quando_der: 2,
  nenhuma: 3,
};

export function ordenarPorPrioridade<T extends { acao: ProximaAcao; esperandoHaDias?: number }>(
  itens: readonly T[],
): T[] {
  return itens.slice().sort((a, b) => {
    const peso = PESO_DA_URGENCIA[a.acao.urgencia] - PESO_DA_URGENCIA[b.acao.urgencia];
    if (peso !== 0) return peso;
    return (b.esperandoHaDias ?? 0) - (a.esperandoHaDias ?? 0);
  });
}

/** O rótulo do estágio, para a tela não repetir o mapa em três lugares. */
export function rotuloDoEstagio(estagio: EstagioDoInteressado): string {
  return definicaoDoEstagio(estagio).rotulo;
}
