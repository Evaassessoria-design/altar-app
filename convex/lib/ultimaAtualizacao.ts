// ─────────────────────────────────────────────────────────────────────────────
// QUANDO ISTO FOI MEXIDO PELA ÚLTIMA VEZ
//
// O Convex dá `_creationTime` de graça, e nada mais. Um evento criado em
// janeiro e revisado ontem parecia, para qualquer leitura do sistema, um
// registro de janeiro. A decoradora não tinha como responder "faz quanto
// tempo que eu não olho isto?" — nem no funil, onde a pergunta é o trabalho.
//
// ── O QUE `updatedAt` É, E O QUE ELE NÃO É ──────────────────────────────────
//
// É: a última vez que ALGUÉM MEXEU no registro dentro do ALTAR.
//
// NÃO é contato com o cliente. `leads.lastInteraction` continua sendo a data
// da última conversa, e continua sendo a única coisa que sustenta a frase
// "este lead está parado". Corrigir o telefone de um lead não é falar com a
// noiva, e se `updatedAt` alimentasse a regra de follow-up bastaria arrumar um
// acento para o lead sumir da lista de quem precisa de atenção.
// Há um teste dedicado a isso em lib/leadFollowUp.test.ts.
//
// ── COMPATIBILIDADE ─────────────────────────────────────────────────────────
// O campo é opcional e não houve backfill: todo registro anterior cai em
// `_creationTime`, que é verdade — é a última data que o sistema conhece
// sobre ele. Nenhuma data é inventada.
// ─────────────────────────────────────────────────────────────────────────────

export type RegistroComHistorico = {
  updatedAt?: string;
  /** Milissegundos, como o Convex entrega. */
  _creationTime?: number;
};

/** Carimbo a gravar num patch. Separado para o horário poder ser fixado em teste. */
export function carimboDeAtualizacao(agora: Date = new Date()): { updatedAt: string } {
  return { updatedAt: agora.toISOString() };
}

/**
 * Acrescenta o carimbo aos campos de um patch.
 *
 * Existe para o carimbo ser UMA linha em cada mutation em vez de uma data
 * montada à mão em cada uma — foi assim que `assemblyItems` e `layoutRenders`
 * acabaram com formatos ligeiramente diferentes.
 */
export function comCarimbo<T extends object>(
  campos: T,
  agora: Date = new Date(),
): T & { updatedAt: string } {
  return { ...campos, ...carimboDeAtualizacao(agora) };
}

/**
 * Momento da última mexida, em ISO, ou `null` quando não dá para saber.
 *
 * Ordem: `updatedAt` gravado → `_creationTime` do Convex → `null`. Um
 * `updatedAt` corrompido (texto que não é data) NÃO derruba a leitura: cai
 * para a criação.
 */
export function ultimaAtualizacao(registro: RegistroComHistorico): string | null {
  const gravado = registro.updatedAt?.trim();
  if (gravado && !Number.isNaN(Date.parse(gravado))) return gravado;
  if (typeof registro._creationTime === "number" && Number.isFinite(registro._creationTime)) {
    return new Date(registro._creationTime).toISOString();
  }
  return null;
}

/** Dias inteiros desde a última mexida. `null` quando não dá para saber. */
export function diasDesdeAtualizacao(
  registro: RegistroComHistorico,
  agora: Date = new Date(),
): number | null {
  const iso = ultimaAtualizacao(registro);
  if (!iso) return null;
  const quando = Date.parse(iso);
  if (Number.isNaN(quando)) return null;
  const dias = Math.floor((agora.getTime() - quando) / 86_400_000);
  // Relógio do cliente adiantado produz "atualizado daqui a 2 dias". Nesse
  // caso a resposta honesta é "hoje", não uma data no futuro.
  return dias < 0 ? 0 : dias;
}

/**
 * Frase curta para a tela: "hoje", "ontem", "há 5 dias", "há 2 meses".
 *
 * Devolve `null` quando não há data — e quem chama não desenha nada, em vez
 * de escrever "nunca atualizado", que seria falso para todo registro antigo.
 *
 * Acima de 60 dias para de contar dias: "há 3 meses" é o que a pessoa pensa,
 * e "há 97 dias" exige conta de cabeça.
 */
export function descreverUltimaAtualizacao(
  registro: RegistroComHistorico,
  agora: Date = new Date(),
): string | null {
  const dias = diasDesdeAtualizacao(registro, agora);
  if (dias === null) return null;
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 60) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses < 24) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}
