import type { Doc } from "@/convex/_generated/dataModel.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// FONTE ÚNICA DE VERDADE das áreas do Briefing.
//
// Antes desta refatoração a definição existia duplicada em dois lugares — a UI
// (briefing/page.tsx) e o PDF (generate-event-pdf.ts) — e já tinha divergido:
// `insuranceInfo` não aparecia em nenhum dos dois (campo órfão no banco) e
// `referenceImages` sumia do PDF. Agora UI, PDF do evento e Caderno de Montagem
// consomem este módulo.
//
// REGRA: nenhuma chave de campo muda. A reorganização é de APRESENTAÇÃO — o
// schema de `briefings` continua exatamente como está e nenhum dado se move.
// ─────────────────────────────────────────────────────────────────────────────

export type BriefingDoc = Doc<"briefings">;
export type BriefingFields = Omit<
  BriefingDoc,
  "_id" | "_creationTime" | "eventId" | "userId"
>;
export type BriefingFieldKey = keyof BriefingFields;

/** Audiências dos relatórios. Hoje só "equipe" tem PDF; as outras já são filtráveis. */
export type Audience = "interno" | "cliente" | "equipe";

const ALL: Audience[] = ["interno", "cliente", "equipe"];
const TEAM_ONLY: Audience[] = ["interno", "equipe"];
const INTERNAL_ONLY: Audience[] = ["interno"];

export type BriefingField = {
  key: BriefingFieldKey;
  label: string;
  type?: "text" | "textarea";
  /** Quem pode ver. Financeiro e jurídico ficam restritos a "interno". */
  visibility: Audience[];
};

export type BriefingGroup = {
  /** Subtítulo dentro da área (ex.: "Conceito do Evento"). */
  label?: string;
  fields: BriefingField[];
};

export type BriefingArea = {
  key: string;
  label: string;
  emoji: string;
  /** Área aceita itens físicos estruturados (assemblyItems). */
  supportsItems: boolean;
  groups: BriefingGroup[];
};

export const BRIEFING_AREAS: BriefingArea[] = [
  {
    key: "general",
    label: "Informações Gerais",
    emoji: "📋",
    supportsItems: false,
    groups: [
      {
        fields: [
          { key: "guestCount", label: "Número de Convidados", visibility: ALL },
          { key: "theme", label: "Tema do Evento", visibility: ALL },
          { key: "venueContact", label: "Contato do Espaço", visibility: TEAM_ONLY },
          { key: "venueRules", label: "Regras do Espaço", type: "textarea", visibility: ALL },
        ],
      },
      {
        label: "Conceito do Evento",
        fields: [
          { key: "colorPalette", label: "Paleta de Cores", visibility: ALL },
          { key: "decorStyle", label: "Estilo da Decoração", visibility: ALL },
          { key: "atmosphereDescription", label: "Atmosfera", type: "textarea", visibility: ALL },
          { key: "referenceImages", label: "Imagens de Referência (URLs)", visibility: ALL },
        ],
      },
      {
        label: "Operação",
        fields: [
          { key: "setupTime", label: "Horário de Montagem", visibility: TEAM_ONLY },
          { key: "teardownTime", label: "Horário de Desmontagem", visibility: TEAM_ONLY },
          { key: "parkingInfo", label: "Estacionamento", visibility: TEAM_ONLY },
          { key: "accessibilityNeeds", label: "Necessidades de Acessibilidade", visibility: ALL },
          { key: "emergencyContact", label: "Contato de Emergência", visibility: TEAM_ONLY },
          // Recuperado: existia no banco mas não aparecia em lugar nenhum.
          { key: "insuranceInfo", label: "Seguro / Apólice", visibility: INTERNAL_ONLY },
        ],
      },
      {
        label: "Observações",
        fields: [
          { key: "restrictions", label: "Restrições / Limitações", type: "textarea", visibility: ALL },
          { key: "vendorContacts", label: "Contatos dos Fornecedores", type: "textarea", visibility: TEAM_ONLY },
          { key: "generalNotes", label: "Notas Gerais", type: "textarea", visibility: ALL },
          { key: "otherNotes", label: "Outras Observações", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "ceremony",
    label: "Cerimônia",
    emoji: "💒",
    supportsItems: true,
    groups: [
      {
        fields: [
          { key: "ceremonyTime", label: "Horário da Cerimônia", visibility: ALL },
          { key: "ceremony_arch", label: "Arco da Cerimônia", visibility: ALL },
          { key: "aisle_decor", label: "Decoração do Corredor", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "party",
    label: "Festa",
    emoji: "🎉",
    supportsItems: true,
    groups: [
      {
        fields: [
          { key: "receptionTime", label: "Horário da Recepção", visibility: ALL },
          { key: "tableClothColor", label: "Cor da Toalha de Mesa", visibility: ALL },
          { key: "napkinStyle", label: "Estilo do Guardanapo", visibility: ALL },
          { key: "centerpiece", label: "Arranjo Central", visibility: ALL },
          { key: "drinkService", label: "Serviço de Bebidas", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "furniture",
    label: "Mobiliário",
    emoji: "🪑",
    supportsItems: true,
    groups: [
      {
        fields: [
          { key: "guestTableType", label: "Tipo das Mesas dos Convidados", visibility: ALL },
          { key: "guestTableCount", label: "Quantidade de Mesas", visibility: ALL },
          { key: "guestChairType", label: "Tipo das Cadeiras", visibility: ALL },
          { key: "guestChairCount", label: "Quantidade de Cadeiras", visibility: ALL },
          { key: "sweetTableIncluded", label: "Mesa de Doces? (Sim/Não)", visibility: ALL },
          { key: "sweetTableStyle", label: "Estilo da Mesa de Doces", visibility: ALL },
          { key: "loungeIncluded", label: "Lounge? (Sim/Não)", visibility: ALL },
          { key: "loungeDescription", label: "Descrição do Lounge", type: "textarea", visibility: ALL },
          { key: "signTable", label: "Mesa de Assinar / Welcome Table", visibility: ALL },
          { key: "furnitureSupplier", label: "Fornecedor de Móveis", visibility: TEAM_ONLY },
          { key: "furnitureNotes", label: "Observações", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "flowers",
    label: "Flores",
    emoji: "🌸",
    supportsItems: true,
    groups: [
      {
        fields: [
          { key: "flowerTypes", label: "Tipos de Flores", visibility: ALL },
          { key: "flowerColors", label: "Cores das Flores", visibility: ALL },
          { key: "bouquetStyle", label: "Estilo do Buquê", visibility: ALL },
          { key: "boutonniere", label: "Boutonnière / Lapela", visibility: ALL },
          { key: "corsage", label: "Corsage", visibility: ALL },
          { key: "flowerSupplier", label: "Fornecedor de Flores", visibility: TEAM_ONLY },
          // Financeiro: nunca sai em relatório de equipe ou de cliente.
          { key: "flowerBudget", label: "Orçamento de Flores (R$)", visibility: INTERNAL_ONLY },
          { key: "flowersNotes", label: "Observações sobre Flores", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "cake",
    label: "Bolo e Doces",
    emoji: "🎂",
    supportsItems: true,
    groups: [
      {
        fields: [
          { key: "cakeSupplier", label: "Fornecedor do Bolo", visibility: TEAM_ONLY },
          { key: "cakeFlavor", label: "Sabor do Bolo", visibility: ALL },
          { key: "cakeLayers", label: "Andares / Camadas", visibility: ALL },
          { key: "cakeDesign", label: "Design / Decoração do Bolo", visibility: ALL },
          { key: "sweetsIncluded", label: "Inclui Docinhos? (Sim/Não)", visibility: ALL },
          { key: "sweetsDescription", label: "Descrição dos Docinhos", visibility: ALL },
          { key: "cakeNotes", label: "Observações", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "lighting",
    label: "Iluminação",
    emoji: "💡",
    supportsItems: true,
    groups: [
      {
        fields: [
          { key: "lightingType", label: "Tipo de Iluminação", visibility: ALL },
          { key: "lightingEffects", label: "Efeitos de Iluminação", visibility: ALL },
          { key: "uplighting", label: "Uplighting (cor/intensidade)", visibility: ALL },
          { key: "stringLights", label: "Cordões de Luz?", visibility: ALL },
          { key: "candleUse", label: "Uso de Velas?", visibility: ALL },
          { key: "lightingSupplier", label: "Fornecedor de Iluminação", visibility: TEAM_ONLY },
          { key: "lightingNotes", label: "Observações", type: "textarea", visibility: ALL },
        ],
      },
    ],
  },
  {
    key: "custom",
    label: "Personalização / Itens Especiais",
    emoji: "✨",
    supportsItems: true,
    groups: [
      {
        fields: [
          { key: "specialRequests", label: "Pedidos Especiais", type: "textarea", visibility: ALL },
          // Movido de "Bolo e Doces": lembrancinha é personalização. A CHAVE do
          // campo não mudou — nenhum dado existente foi tocado.
          { key: "weddingFavors", label: "Lembranças para Convidados", visibility: ALL },
        ],
      },
    ],
  },
];

// ── Visibilidade ─────────────────────────────────────────────────────────────

/**
 * Hierarquia da visibilidade de um ITEM de montagem:
 *  · "interno" → só relatório interno;
 *  · "equipe"  → equipe e interno (padrão dos itens de montagem);
 *  · "cliente" → todo mundo (se é seguro para o cliente, é seguro para todos).
 */
const ITEM_VISIBILITY: Record<string, Audience[]> = {
  interno: ["interno"],
  equipe: ["interno", "equipe"],
  cliente: ["interno", "cliente", "equipe"],
};

export function itemVisibleTo(itemVisibility: string, audience: Audience): boolean {
  return (ITEM_VISIBILITY[itemVisibility] ?? ["interno"]).includes(audience);
}

export function fieldVisibleTo(field: BriefingField, audience: Audience): boolean {
  return field.visibility.includes(audience);
}

// ── Consultas usadas por UI e relatórios ─────────────────────────────────────

export function allBriefingFields(): BriefingField[] {
  return BRIEFING_AREAS.flatMap((a) => a.groups.flatMap((g) => g.fields));
}

export function areaByKey(key: string): BriefingArea | undefined {
  return BRIEFING_AREAS.find((a) => a.key === key);
}

export type ResolvedField = { label: string; value: string };
export type ResolvedGroup = { label?: string; fields: ResolvedField[] };
export type ResolvedArea = { key: string; label: string; groups: ResolvedGroup[] };

/**
 * Aplica as duas regras absolutas do relatório condicional:
 *  1. campo vazio (ou fora da audiência) NÃO aparece;
 *  2. grupo/área sem nenhum campo restante NÃO aparece.
 * Devolve apenas o que deve ser impresso.
 */
export function resolveAreasForAudience(
  briefing: Partial<BriefingFields> | null | undefined,
  audience: Audience,
): ResolvedArea[] {
  if (!briefing) return [];

  const areas: ResolvedArea[] = [];
  for (const area of BRIEFING_AREAS) {
    const groups: ResolvedGroup[] = [];

    for (const group of area.groups) {
      const fields: ResolvedField[] = [];
      for (const field of group.fields) {
        if (!fieldVisibleTo(field, audience)) continue;
        const raw = briefing[field.key];
        const value = typeof raw === "string" ? raw.trim() : "";
        if (!value) continue;
        fields.push({ label: field.label, value });
      }
      if (fields.length > 0) groups.push({ label: group.label, fields });
    }

    if (groups.length > 0) areas.push({ key: area.key, label: area.label, groups });
  }
  return areas;
}
