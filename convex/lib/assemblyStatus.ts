// ─────────────────────────────────────────────────────────────────────────────
// SITUAÇÃO OPERACIONAL DO ITEM DE MONTAGEM
//
// O caminho físico de um item de decoração, do galpão até a volta:
//
//   Pendente → Separado → Carregado → Conferido no local → Retornou
//
// ── POR QUE ISTO NÃO CONFLITA COM `checkOnAssembly` ─────────────────────────
// Investigado antes de acrescentar: `checkOnAssembly` NÃO é um estado do item.
// É uma preferência de IMPRESSÃO — marca quais itens ganham uma caixinha ☐ no
// PDF da ficha de montagem (ver src/lib/generate-assembly-pdf.ts, linha 256).
// Nada no código o lê como "já foi conferido".
//
// São eixos diferentes: um diz "isto precisa ser conferido no papel", o outro
// "em que ponto do trajeto este item está". Por isso o campo novo é somado, e
// `checkOnAssembly` continua exatamente como estava.
//
// ── O QUE ESTE MÓDULO DELIBERADAMENTE NÃO FAZ ───────────────────────────────
// Não conta quantidade retornada. "Retornou 19 de 20" exigiria um segundo
// número por item e um conceito de perda — isto é Inventário/Patrimônio, que
// está fora desta rodada. Aqui o item retornou ou não retornou.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSEMBLY_STATUSES = [
  "pendente",
  "separado",
  "carregado",
  "conferido",
  "retornou",
] as const;

export type AssemblyStatus = (typeof ASSEMBLY_STATUSES)[number];

export const ASSEMBLY_STATUS_LABEL: Record<AssemblyStatus, string> = {
  pendente: "Pendente",
  separado: "Separado",
  carregado: "Carregado",
  conferido: "Conferido no local",
  retornou: "Retornou",
};

/** Ordem no trajeto. Serve para mostrar progresso sem inventar percentual. */
export function ordemDoStatus(status: AssemblyStatus): number {
  return ASSEMBLY_STATUSES.indexOf(status);
}

type AssemblyLike = { operationalStatus?: string };

/**
 * Situação real do item.
 *
 * Ausente = "pendente". Todo item cadastrado antes deste campo continua
 * correto, sem backfill: nada foi separado ainda porque o conceito não existia.
 */
export function effectiveAssemblyStatus(item: AssemblyLike): AssemblyStatus {
  if (
    item.operationalStatus &&
    (ASSEMBLY_STATUSES as readonly string[]).includes(item.operationalStatus)
  ) {
    return item.operationalStatus as AssemblyStatus;
  }
  return "pendente";
}

/** Ainda não saiu do galpão. É o que a equipe precisa ver primeiro. */
export function aguardandoSeparacao(item: AssemblyLike): boolean {
  return effectiveAssemblyStatus(item) === "pendente";
}

/** Saiu e ainda não voltou — o que fica em aberto depois do evento. */
export function foraDoGalpao(item: AssemblyLike): boolean {
  const s = effectiveAssemblyStatus(item);
  return s === "carregado" || s === "conferido";
}

export type ResumoCarregamento = {
  total: number;
  porStatus: Record<AssemblyStatus, number>;
  pendentes: number;
  foraDoGalpao: number;
};

/** Contagem por situação. Números reais, sem percentual sintético. */
export function resumirCarregamento(itens: readonly AssemblyLike[]): ResumoCarregamento {
  const porStatus = Object.fromEntries(
    ASSEMBLY_STATUSES.map((s) => [s, 0]),
  ) as Record<AssemblyStatus, number>;

  for (const i of itens) porStatus[effectiveAssemblyStatus(i)] += 1;

  return {
    total: itens.length,
    porStatus,
    pendentes: porStatus.pendente,
    foraDoGalpao: porStatus.carregado + porStatus.conferido,
  };
}
