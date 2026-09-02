// ─────────────────────────────────────────────────────────────────────────────
// QUEM É O RESPONSÁVEL — regra única.
//
// "Responsável" existia em três formas incompatíveis no ALTAR:
//
//   · `purchaseItems.responsible` — texto livre ("Camila", "eu", "Zé do vaso");
//   · `leads.responsible`         — texto livre outra vez;
//   · o responsável do EVENTO     — que ninguém escolhia: era `team[0]`, o
//     PRIMEIRO membro escalado. Uma pessoa virava "a responsável" por ter sido
//     adicionada primeiro, e o cartão do evento afirmava isso com todas as
//     letras.
//
// Este módulo unifica as três em uma pergunta só: dado um registro e a equipe
// da empresa, QUEM é o responsável e COMO se sabe disso.
//
// ── AS TRÊS REGRAS ──────────────────────────────────────────────────────────
//
//  1. VÍNCULO GANHA DE TEXTO. Se o registro aponta para alguém da equipe, é
//     essa pessoa — e o nome vem da equipe, então renomear o membro atualiza
//     tudo de uma vez (era o motivo de o texto livre envelhecer).
//  2. TEXTO LIVRE CONTINUA VALENDO. Todo registro que existe hoje tem só o
//     texto, e ele não vira lixo: sem vínculo, o texto É a resposta. Nada de
//     backfill adivinhando qual "Camila" é qual.
//  3. SEM RESPOSTA É `null`. Vínculo apontando para membro apagado, texto em
//     branco, registro sem nada: devolve `null`. Nunca "Não informado" tratado
//     como se fosse gente, nunca o primeiro da lista.
// ─────────────────────────────────────────────────────────────────────────────

export type RegistroComResponsavel = {
  /** Vínculo com a equipe da empresa (`teamMembers`). */
  responsibleId?: string | null;
  /** Anotação livre — o que existia antes do vínculo. */
  responsible?: string | null;
};

export type MembroDaEquipe = { _id: string; name: string; role?: string };

/** De onde a resposta veio. A tela pode mostrar diferente; o dado é honesto. */
export type OrigemDoResponsavel = "equipe" | "anotacao";

export type Responsavel = {
  nome: string;
  origem: OrigemDoResponsavel;
  /** Presente só quando a origem é a equipe. */
  membroId?: string;
  /** Função cadastrada do membro, quando existe. */
  papel?: string;
};

/**
 * Responsável de UM registro, ou `null` quando não há resposta honesta.
 *
 * `membros` é a equipe da empresa. Um vínculo para membro que não está mais
 * lá NÃO é erro: cai para a anotação livre, que é justamente o histórico que
 * a exclusão do membro preserva (ver `desvincularMembro`).
 */
export function resolverResponsavel(
  registro: RegistroComResponsavel,
  membros: readonly MembroDaEquipe[],
): Responsavel | null {
  if (registro.responsibleId) {
    const membro = membros.find((m) => m._id === registro.responsibleId);
    if (membro && membro.name.trim()) {
      return {
        nome: membro.name.trim(),
        origem: "equipe",
        membroId: membro._id,
        papel: membro.role?.trim() || undefined,
      };
    }
  }

  const anotado = registro.responsible?.trim();
  if (anotado) return { nome: anotado, origem: "anotacao" };

  return null;
}

/** Só o nome, para telas que não precisam saber a origem. */
export function nomeDoResponsavel(
  registro: RegistroComResponsavel,
  membros: readonly MembroDaEquipe[],
): string | null {
  return resolverResponsavel(registro, membros)?.nome ?? null;
}

/**
 * Responsável do EVENTO, que tem uma regra a mais.
 *
 * Antes, o cartão do evento mostrava `team[0].name` — o primeiro membro
 * escalado — como "Resp.". Ninguém escolheu essa pessoa; ela só foi
 * adicionada primeiro, e trocar a ordem da equipe trocava o responsável do
 * evento sem que ninguém pedisse.
 *
 * Agora:
 *   · escolha explícita (`responsibleId`) → é ela;
 *   · anotação livre no evento            → é ela;
 *   · UMA única pessoa escalada           → é ela, porque não há ambiguidade;
 *   · duas ou mais, sem escolha           → `null`. O sistema não elege
 *     ninguém, e a tela pede que a decoradora escolha.
 */
export function responsavelDoEvento(
  evento: RegistroComResponsavel,
  equipeDoEvento: readonly MembroDaEquipe[],
): Responsavel | null {
  const direto = resolverResponsavel(evento, equipeDoEvento);
  if (direto) return direto;

  if (equipeDoEvento.length === 1 && equipeDoEvento[0].name.trim()) {
    return {
      nome: equipeDoEvento[0].name.trim(),
      origem: "equipe",
      membroId: equipeDoEvento[0]._id,
      papel: equipeDoEvento[0].role?.trim() || undefined,
    };
  }

  return null;
}

/**
 * O que gravar num registro quando o membro vinculado é excluído da equipe.
 *
 * Excluir alguém do cadastro não pode apagar a HISTÓRIA: a compra continua
 * tendo sido tocada pela Camila. Então o vínculo morre e o nome dela é
 * guardado como anotação — a mesma forma que todo registro antigo já usa.
 *
 * Anotação que já existia NUNCA é sobrescrita: ela pode dizer algo mais
 * específico do que o nome do membro ("Camila — só a montagem").
 *
 * Devolve `null` quando não há nada a mudar, para quem chama poder pular o
 * `patch` em vez de escrever à toa.
 */
export function desvincularMembro(
  registro: RegistroComResponsavel,
  nomeDoMembro: string,
): { responsibleId: undefined; responsible?: string } | null {
  if (!registro.responsibleId) return null;
  const jaAnotado = registro.responsible?.trim();
  if (jaAnotado) return { responsibleId: undefined };
  const nome = nomeDoMembro.trim();
  return nome ? { responsibleId: undefined, responsible: nome } : { responsibleId: undefined };
}
