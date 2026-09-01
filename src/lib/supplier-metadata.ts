import { Building2, Cake, Handshake, Lightbulb, MapPin, UtensilsCrossed, Wine } from "lucide-react";
import { TODAS_AS_CATEGORIAS } from "@/convex/lib/escopoDecoradora.ts";

// ─────────────────────────────────────────────────────────────────────────────
// METADADOS VISUAIS DAS CATEGORIAS DE FORNECEDOR
//
// ── O PROBLEMA QUE ISTO RESOLVE ─────────────────────────────────────────────
// A tela de fornecedores do evento mantinha a PRÓPRIA lista de categorias, com
// ícone e roteiro operacional. Era a terceira cópia do mesmo conceito. Pior:
// aquela lista tinha só fornecedores do CLIENTE — assessoria, local, buffet,
// bar, doces, som. A decoradora não conseguia cadastrar o fornecedor de flores
// ali senão como "Personalizado".
//
// ── A REGRA ─────────────────────────────────────────────────────────────────
// A lista CONCEITUAL vive num lugar só: convex/lib/escopoDecoradora.ts. Aqui
// ficam apenas ENFEITES opcionais — ícone e roteiro — indexados por slug.
//
// Acrescentar uma categoria lá faz ela aparecer em TODAS as telas na hora, com
// ícone padrão e sem roteiro. Nada quebra por falta de metadado, e ninguém
// precisa lembrar de editar três arquivos.
// ─────────────────────────────────────────────────────────────────────────────

export const PLACEHOLDER_CATEGORIA = "Selecione a categoria";
export const ERRO_CATEGORIA_OBRIGATORIA = "Escolha a categoria do fornecedor";

export type ItemDeRoteiro = { label: string; group: string };

export type CategoriaComMeta = {
  slug: string;
  label: string;
  icone: React.ComponentType<{ className?: string }>;
  /** Roteiro operacional sugerido. Vazio quando não há — nunca indefinido. */
  template: ItemDeRoteiro[];
};

/** Ícone de quem ainda não tem um próprio. Nunca `undefined`. */
export const ICONE_PADRAO = Building2;

/**
 * Enfeites por slug. Opcional por construção: `Partial` deixa explícito que
 * faltar aqui é normal, e os acessos abaixo sempre devolvem um valor usável.
 */
const META: Partial<Record<string, { icone: CategoriaComMeta["icone"]; template: ItemDeRoteiro[] }>> = {
  assessoria: {
    icone: Handshake,
    template: [
      { label: "Reuniões importantes", group: "operacional" },
      { label: "Horários de alinhamento", group: "operacional" },
    ],
  },
  local: {
    icone: MapPin,
    template: [
      { label: "Endereço", group: "operacional" },
      { label: "Horário de acesso / montagem", group: "operacional" },
      { label: "Horário de desmontagem", group: "operacional" },
      { label: "Restrições do local", group: "operacional" },
      { label: "Acesso carga / descarga", group: "operacional" },
      { label: "Obs. para a decoração", group: "operacional" },
    ],
  },
  buffet: {
    icone: UtensilsCrossed,
    template: [
      { label: "Qtd. de convidados", group: "operacao" },
      { label: "Metragem da ilha de frios", group: "operacao" },
      { label: "Metragem da mesa de jantar", group: "operacao" },
      { label: "Outras mesas (metragem)", group: "operacao" },
      { label: "Qtd. de mesas", group: "operacao" },
      { label: "Aparadores / estruturas", group: "operacao" },
      { label: "Pontos de energia", group: "operacao" },
      { label: "Pontos de água", group: "operacao" },
      { label: "Obs. de montagem", group: "operacao" },
      { label: "Quantidade de lugares", group: "mesa_posta" },
      { label: "Pratos (qtd + modelos)", group: "mesa_posta" },
      { label: "Talheres (qtd + modelos)", group: "mesa_posta" },
      { label: "Taças (qtd + modelos)", group: "mesa_posta" },
      { label: "Guardanapos (qtd | cor | tecido | modelo)", group: "mesa_posta" },
      { label: "Porta-guardanapos (qtd + modelo)", group: "mesa_posta" },
      { label: "Sousplats (qtd + modelo/material)", group: "mesa_posta" },
      { label: "Obs. da composição da mesa", group: "mesa_posta" },
    ],
  },
  bar: {
    icone: Wine,
    template: [
      { label: "Qtd. de convidados", group: "operacional" },
      { label: "Tipo de bar", group: "operacional" },
      { label: "Metragem do balcão", group: "operacional" },
      { label: "Qtd. de módulos", group: "operacional" },
      { label: "Estrutura necessária", group: "operacional" },
      { label: "Pontos de energia", group: "operacional" },
      { label: "Pontos de água", group: "operacional" },
      { label: "Localização prevista", group: "operacional" },
      { label: "Obs. de montagem", group: "operacional" },
    ],
  },
  doces: {
    icone: Cake,
    template: [
      { label: "Qtd. total de doces", group: "operacional" },
      { label: "Tipos de doces", group: "operacional" },
      { label: "Qtd. por tipo", group: "operacional" },
      { label: "Doces com forminha", group: "operacional" },
      { label: "Modelos de forminha", group: "operacional" },
      { label: "Qtd. por modelo de forminha", group: "operacional" },
      { label: "Doces expostos na mesa", group: "operacional" },
      { label: "Doces lembrança", group: "operacional" },
      { label: "Bandejas / suportes", group: "operacional" },
      { label: "Refrigeração", group: "operacional" },
      { label: "Obs. de montagem e exposição", group: "operacional" },
    ],
  },
  som_ilum: {
    icone: Lightbulb,
    template: [
      { label: "Tipo de serviço", group: "operacional" },
      { label: "Metragem da estrutura", group: "operacional" },
      { label: "Treliça (necessidade)", group: "operacional" },
      { label: "Treliça (qtd / metragem)", group: "operacional" },
      { label: "Estruturas utilizadas", group: "operacional" },
      { label: "Pórticos / estruturas especiais", group: "operacional" },
      { label: "Posição das estruturas", group: "operacional" },
      { label: "Pontos de energia", group: "operacional" },
      { label: "Qtd. de pontos de energia", group: "operacional" },
      { label: "Gerador", group: "operacional" },
      { label: "Equipamentos c/ ocupação física", group: "operacional" },
      { label: "Área técnica", group: "operacional" },
      { label: "Obs. de montagem", group: "operacional" },
      { label: "Obs. de desmontagem", group: "operacional" },
    ],
  },};

/** Ícone da categoria — sempre concreto. */
export function iconeDaCategoria(slug: string | undefined): CategoriaComMeta["icone"] {
  if (!slug) return ICONE_PADRAO;
  return META[slug]?.icone ?? ICONE_PADRAO;
}

/** Roteiro operacional sugerido. Categoria sem roteiro devolve lista vazia. */
export function templateDaCategoria(slug: string | undefined): ItemDeRoteiro[] {
  if (!slug) return [];
  return META[slug]?.template ?? [];
}

/**
 * A lista central, enriquecida. DERIVADA — nunca escrita à mão.
 *
 * É isto que garante a fonte única: se a categoria não estiver em
 * escopoDecoradora.ts, ela não existe aqui.
 */
export const CATEGORIAS_COM_META: readonly CategoriaComMeta[] = TODAS_AS_CATEGORIAS.map((c) => ({
  slug: c.slug,
  label: c.label,
  icone: iconeDaCategoria(c.slug),
  template: templateDaCategoria(c.slug),
}));
