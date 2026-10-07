// ─────────────────────────────────────────────────────────────────────────────
// RECORTES DA LISTA DE EVENTOS, VINDOS DA URL
//
// Os atalhos do Dashboard abrem /eventos já no recorte do número clicado. O
// recorte mora na URL (e não num estado da tela) para o voltar do navegador e
// o link copiado levarem ao mesmo lugar. Valor desconhecido = lista inteira:
// um link velho ou digitado errado não pode esconder eventos sem dizer.
// ─────────────────────────────────────────────────────────────────────────────

export type FiltroDeEventos = "all" | "upcoming" | "completed" | "cancelled";

export const STATUS_DE_EVENTO = ["planning", "confirmed", "in_progress", "completed", "cancelled"] as const;
export type StatusDeEvento = (typeof STATUS_DE_EVENTO)[number];

const ROTULO_DO_STATUS: Record<StatusDeEvento, string> = {
  planning: "Planejamento",
  confirmed: "Confirmado",
  in_progress: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export type RecorteDeEventos =
  | { tipo: "nenhum"; filtro: FiltroDeEventos }
  | { tipo: "status"; filtro: "all"; status: StatusDeEvento }
  | { tipo: "mes"; filtro: "all"; mes: string }
  | { tipo: "checklist"; filtro: "upcoming" };

export function lerRecorteDeEventos(params: URLSearchParams): RecorteDeEventos {
  if (params.get("recorte") === "checklist") return { tipo: "checklist", filtro: "upcoming" };
  const status = params.get("status");
  if (status && (STATUS_DE_EVENTO as readonly string[]).includes(status)) {
    return { tipo: "status", filtro: "all", status: status as StatusDeEvento };
  }
  const mes = params.get("mes");
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { tipo: "mes", filtro: "all", mes };
  const filtro = params.get("filtro");
  if (filtro === "upcoming" || filtro === "completed" || filtro === "cancelled") {
    return { tipo: "nenhum", filtro };
  }
  return { tipo: "nenhum", filtro: "all" };
}

/** "outubro de 2026" a partir de "2026-10". */
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A frase do aviso no topo da lista. `null` fora de um recorte do Dashboard. */
export function descreverRecorte(r: RecorteDeEventos): string | null {
  switch (r.tipo) {
    case "status":
      return `Eventos com status ${ROTULO_DO_STATUS[r.status]}`;
    case "mes":
      return `Eventos com data em ${nomeDoMes(r.mes)}, de qualquer status`;
    case "checklist":
      return "Checklist pendente nos eventos dos próximos 30 dias";
    default:
      return null;
  }
}
