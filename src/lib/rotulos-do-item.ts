import type { ItensDoBloco } from "./briefing-areas.ts";
import { ROTULO_DA_ORIGEM, type OrigemDoItem } from "@/convex/lib/itemDoBriefing.ts";

/** Origem com as palavras de cada bloco: na iluminação, "de onde vem a luz". */
export function rotuloDaOrigem(origem: OrigemDoItem, tipo?: ItensDoBloco["tipo"]): string {
  if (tipo !== "iluminacao") return ROTULO_DA_ORIGEM[origem];
  return {
    acervo: "Incluída na decoração (acervo)",
    locadora: "Incluída na decoração (locadora)",
    cliente: "Fornecedor externo da cliente",
    espaco: "Disponível no espaço",
    a_definir: "A definir",
  }[origem];
}

