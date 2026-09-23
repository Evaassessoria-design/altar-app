import type { BriefingFields } from "./briefing-areas.ts";

// ─────────────────────────────────────────────────────────────────────────────
// "Criar itens a partir do briefing" — apenas SUGERE.
//
// Função pura, sem efeito colateral: transforma campos de texto que já existem
// no briefing em rascunhos de itens estruturados. Quem cria de fato é a
// decoradora, depois de revisar na UI (SUGERIR → MOSTRAR → REVISAR →
// CONFIRMAR → CRIAR). Nada é gravado aqui.
//
// ── POR QUE ISTO É A PONTE, E NÃO UMA MIGRAÇÃO ──────────────────────────────
// O briefing tem campos de texto para as mesmas coisas que `assemblyItems`
// representa de verdade: "Tipo das Cadeiras: Dior" e "Quantidade: 120" de um
// lado, e do outro um item com nome, quantidade, unidade, fornecedor, foto e
// escopo. Só o item estruturado alimenta o Caderno, a Folha de Carregamento, a
// Ficha Técnica, o Projeto Visual e as Compras — o campo de texto alimenta só
// o relatório interno do evento.
//
// Quem preenchia o texto e não a lista fazia metade do trabalho e recebia
// metade do produto, sem nada na tela dizendo isso.
//
// A correção NÃO é apagar os campos antigos nem convertê-los às escondidas.
// Nenhum evento existente pode perder uma letra, e "Cadeira Tiffany dourada
// com assento de linho" não vira quantidade sozinho. É um convite explícito,
// revisável, que ela aceita item a item.
//
// ── E POR QUE ELE PRECISA SER IDEMPOTENTE ───────────────────────────────────
// Sem isso, abrir o convite duas vezes criava a segunda "Cadeira Dior" — e a
// Folha de Carregamento passava a pedir 240 cadeiras. `suggestAssemblyItems`
// recebe o que JÁ existe e não sugere de novo o que já foi criado. É a mesma
// garantia que `fichaTecnica.gerarCompras` e `acervo.reservarDaFicha` já dão,
// pelas mesmas razões.
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

/**
 * "Rosa branca, eucalipto; oliveira" → ["Rosa branca", "eucalipto", "oliveira"].
 *
 * Vírgula, ponto-e-vírgula, barra e quebra de linha — as quatro formas que
 * aparecem de verdade quando alguém lista flores num campo de texto. " e " NÃO
 * entra: "boca-de-leão e astromélia" é seguro, mas "erva de são joão" viraria
 * duas flores que não existem.
 */
function listaDeTexto(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;/\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    // Um nome de trinta letras não é nome de flor: é uma frase inteira que
    // alguém escreveu no campo, e virar item faria o Caderno ilegível.
    .filter((p) => p.length <= 40);
}

/** Primeira letra maiúscula, resto como ela escreveu. */
function comoNome(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** O que basta saber de um item já cadastrado para não sugeri-lo de novo. */
export type ItemJaExistente = { area: string; name: string };

/** Mesma chave dos dois lados: área + nome sem acento, sem caixa, sem sobra. */
function chaveDoItem(area: string, name: string): string {
  return `${area}::${name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")}`;
}

export function suggestAssemblyItems(
  briefing: Partial<BriefingFields> | null | undefined,
  /**
   * Os itens que o evento JÁ tem.
   *
   * Ausente = nenhum, que é o comportamento de antes. Presente, o convite
   * deixa de oferecer o que ela já criou — abrir duas vezes não pode produzir
   * uma segunda "Cadeira Dior" e fazer a Folha de Carregamento pedir 240
   * cadeiras.
   */
  jaExistentes?: readonly ItemJaExistente[],
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

  // ── FLORES: UMA LINHA POR FLOR ─────────────────────────────────────────
  // "Rosa branca, eucalipto, oliveira, astromélia" num campo de texto é o
  // pedido da floricultura escrito em prosa. Quebrado em itens, cada flor
  // passa a poder ter foto, fornecedor, ambiente e — pela Ficha Técnica —
  // receita e compra. Em texto, nada disso existe.
  //
  // Sem QUANTIDADE de propósito: o briefing não diz quantas hastes, e chutar
  // um número aqui produziria uma compra errada com aparência de certa. Ela
  // preenche na revisão, ou deixa a Ficha Técnica responder.
  for (const flor of listaDeTexto(briefing.flowerTypes)) {
    out.push({
      ...base,
      area: "flowers",
      name: comoNome(flor),
      supplierName: clean(briefing.flowerSupplier),
      origem: "flowerTypes",
    });
  }

  // Peças florais nomeadas. `bouquetStyle` vira "Buquê" e não "Buquê da
  // noiva": nem todo evento tem noiva, e um 15 anos tem a debutante.
  for (const [campo, nome] of [
    ["bouquetStyle", "Buquê"],
    ["boutonniere", "Lapela"],
    ["corsage", "Corsage"],
  ] as const) {
    const valor = clean(briefing[campo]);
    if (!valor) continue;
    out.push({
      ...base,
      area: "flowers",
      name: nome,
      model: valor,
      quantity: 1,
      unit: "un",
      supplierName: clean(briefing.flowerSupplier),
      origem: campo,
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

  // ── O QUE ELA JÁ CRIOU NÃO É OFERECIDO DE NOVO ──────────────────────────
  // E duas sugestões idênticas dentro da MESMA rodada também não passam: o
  // campo "Tipo das Cadeiras" com "Cadeira Dior" e um `flowerTypes` que
  // repetisse o mesmo nome produziriam duas linhas iguais na revisão.
  const vistos = new Set((jaExistentes ?? []).map((i) => chaveDoItem(i.area, i.name)));
  return out.filter((s) => {
    const chave = chaveDoItem(s.area, s.name);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}
