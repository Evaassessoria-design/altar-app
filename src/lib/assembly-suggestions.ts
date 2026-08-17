import type { BriefingFields } from "./briefing-areas.ts";

// ─────────────────────────────────────────────────────────────────────────────
// "Criar itens a partir do briefing" — apenas SUGERE.
//
// Função pura, sem efeito colateral: transforma campos de texto que já existem
// no briefing em rascunhos de itens estruturados. Quem cria de fato é a
// decoradora, depois de revisar na UI (SUGERIR → MOSTRAR → REVISAR →
// CONFIRMAR → CRIAR). Nada é gravado aqui.
// ─────────────────────────────────────────────────────────────────────────────

export type SuggestedItem = {
  area: string;
  name: string;
  model?: string;
  quantity?: number;
  unit?: string;
  supplierName?: string;
  ambiente?: string;
  notes?: string;
  includeInAssemblyReport: boolean;
  checkOnAssembly: boolean;
  visibility: "interno" | "cliente" | "equipe";
  /** Campos do briefing que originaram a sugestão (mostrado na revisão). */
  origem: string;
};

const clean = (v?: string) => v?.trim() || undefined;

/** "180", "180 cadeiras", "cerca de 180" → 180. Sem número → undefined. */
function parseCount(raw?: string): number | undefined {
  if (!raw) return undefined;
  const match = raw.replace(/\./g, "").match(/\d+/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** "Sim", "sim ", "SIM" → true. Qualquer outra coisa → false. */
function isYes(raw?: string): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "sim" || v === "s" || v === "yes";
}

const base = {
  includeInAssemblyReport: true,
  checkOnAssembly: true,
  visibility: "equipe" as const,
};

export function suggestAssemblyItems(
  briefing: Partial<BriefingFields> | null | undefined,
): SuggestedItem[] {
  if (!briefing) return [];
  const out: SuggestedItem[] = [];

  // Cadeiras — o caso clássico: "Cadeira Tiffany" + "180".
  const chairType = clean(briefing.guestChairType);
  const chairCount = parseCount(briefing.guestChairCount);
  if (chairType || chairCount) {
    out.push({
      ...base,
      area: "furniture",
      name: chairType ?? "Cadeiras",
      model: chairType,
      quantity: chairCount,
      unit: "un",
      supplierName: clean(briefing.furnitureSupplier),
      origem: "guestChairType + guestChairCount",
    });
  }

  // Mesas dos convidados.
  const tableType = clean(briefing.guestTableType);
  const tableCount = parseCount(briefing.guestTableCount);
  if (tableType || tableCount) {
    out.push({
      ...base,
      area: "furniture",
      name: tableType ?? "Mesas dos convidados",
      model: tableType,
      quantity: tableCount,
      unit: "un",
      supplierName: clean(briefing.furnitureSupplier),
      origem: "guestTableType + guestTableCount",
    });
  }

  // Mesa de doces — só se marcada como incluída.
  if (isYes(briefing.sweetTableIncluded)) {
    out.push({
      ...base,
      area: "cake",
      name: "Mesa de doces",
      model: clean(briefing.sweetTableStyle),
      quantity: 1,
      unit: "un",
      origem: "sweetTableIncluded + sweetTableStyle",
    });
  }

  // Lounge — só se marcado como incluído.
  if (isYes(briefing.loungeIncluded)) {
    out.push({
      ...base,
      area: "furniture",
      name: "Lounge",
      quantity: 1,
      unit: "un",
      notes: clean(briefing.loungeDescription),
      supplierName: clean(briefing.furnitureSupplier),
      origem: "loungeIncluded + loungeDescription",
    });
  }

  // Mesa de assinar / welcome table.
  const sign = clean(briefing.signTable);
  if (sign) {
    out.push({
      ...base,
      area: "furniture",
      name: "Mesa de assinar / Welcome table",
      model: sign,
      quantity: 1,
      unit: "un",
      supplierName: clean(briefing.furnitureSupplier),
      origem: "signTable",
    });
  }

  // Arranjo central — quantidade acompanha o nº de mesas quando conhecido.
  const centerpiece = clean(briefing.centerpiece);
  if (centerpiece) {
    out.push({
      ...base,
      area: "flowers",
      name: "Arranjo central",
      model: centerpiece,
      quantity: tableCount,
      unit: "un",
      supplierName: clean(briefing.flowerSupplier),
      origem: "centerpiece" + (tableCount ? " + guestTableCount" : ""),
    });
  }

  // Arco da cerimônia.
  const arch = clean(briefing.ceremony_arch);
  if (arch) {
    out.push({
      ...base,
      area: "ceremony",
      name: "Arco da cerimônia",
      model: arch,
      quantity: 1,
      unit: "un",
      supplierName: clean(briefing.flowerSupplier),
      origem: "ceremony_arch",
    });
  }

  // Iluminação — uma linha por tipo declarado.
  const lightingType = clean(briefing.lightingType);
  if (lightingType) {
    out.push({
      ...base,
      area: "lighting",
      name: lightingType,
      model: clean(briefing.lightingEffects),
      unit: "un",
      supplierName: clean(briefing.lightingSupplier),
      origem: "lightingType + lightingEffects",
    });
  }

  return out;
}
