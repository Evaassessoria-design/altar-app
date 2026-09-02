import {
  effectivePurchaseStatus,
  isPendingStatus,
  type PurchaseStatus,
} from "./purchaseStatus";
import { foraDoLivro, valorDaCompra } from "./custoDoEvento";

// ─────────────────────────────────────────────────────────────────────────────
// PANORAMA DE COMPRAS — a lista transversal, fora do evento.
//
// A tela de Compras é organizada POR EVENTO: cada evento é uma seção, com as
// suas compras dentro. Isso responde "o que falta neste casamento?" e é a
// pergunta certa quando se está planejando UM evento.
//
// Não é a pergunta de segunda-feira de manhã. Aí a pergunta é outra:
// "o que eu preciso resolver ESTA SEMANA, em todos os eventos?" — e para
// respondê-la a decoradora tinha de abrir evento por evento e somar de cabeça.
// Uma compra atrasada de um evento distante ficava escondida atrás de um
// acordeão fechado.
//
// Este módulo é a regra dessa segunda leitura. Puro: sem Convex, sem React.
//
// ── O QUE ESTE MÓDULO SE RECUSA A FAZER ─────────────────────────────────────
//
//  · NÃO inventa prazo. Item sem `dueDate` nunca é "atrasado" nem "urgente" —
//    vai para o balde `semPrazo`, que é a verdade: ninguém decidiu quando.
//  · NÃO conta cancelado. Item cancelado saiu da operação; contá-lo como
//    pendente é o bug que hoje existe em `dashboard.getStats`
//    (`!i.isPurchased` trata cancelado como "falta comprar").
//  · NÃO transforma "comprado" em "resolvido". Comprado e não recebido é um
//    estado operacional próprio: o dinheiro saiu, a caixa não chegou.
// ─────────────────────────────────────────────────────────────────────────────

export type CompraNoPanorama = {
  status?: string;
  isPurchased: boolean;
  dueDate?: string;
  unitPrice?: number;
  quantity?: number;
  transactionId?: unknown;
};

/** Em que ponto do calendário esta compra está. */
export type FaixaDePrazo = "atrasado" | "hoje" | "proximos7" | "depois" | "semPrazo";

export const ROTULO_DA_FAIXA: Record<FaixaDePrazo, string> = {
  atrasado: "Atrasadas",
  hoje: "Para hoje",
  proximos7: "Próximos 7 dias",
  depois: "Mais adiante",
  semPrazo: "Sem prazo definido",
};

/** Ordem em que as faixas aparecem: o que aperta primeiro. */
export const ORDEM_DAS_FAIXAS: readonly FaixaDePrazo[] = [
  "atrasado",
  "hoje",
  "proximos7",
  "depois",
  "semPrazo",
] as const;

/**
 * Distância em dias entre duas datas "AAAA-MM-DD".
 *
 * Ancorada em T12:00:00Z, a mesma convenção de `lib/attention.ts` e de
 * `src/lib/event-date.ts`: sem isso, fuso negativo joga a data para o dia
 * anterior e "hoje" vira "atrasado".
 */
export function diasAte(hojeISO: string, alvoISO: string): number {
  const a = new Date(`${hojeISO}T12:00:00Z`).getTime();
  const b = new Date(`${alvoISO}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Faixa de prazo de UMA compra.
 *
 * Só compras que ainda exigem ação entram numa faixa de calendário. Comprado,
 * recebido e cancelado não têm prazo a cobrar — devolvem `semPrazo` para não
 * poluírem a leitura de urgência (a contagem deles vive no resumo).
 */
export function faixaDePrazo(item: CompraNoPanorama, hojeISO: string): FaixaDePrazo {
  if (!isPendingStatus(effectivePurchaseStatus(item))) return "semPrazo";
  if (!item.dueDate) return "semPrazo";
  const dias = diasAte(hojeISO, item.dueDate);
  if (dias < 0) return "atrasado";
  if (dias === 0) return "hoje";
  if (dias <= 7) return "proximos7";
  return "depois";
}

/**
 * A compra tem dinheiro definido e ainda não virou lançamento no livro.
 *
 * A regra NÃO é reescrita aqui: delega para `foraDoLivro` (lib/custoDoEvento),
 * a mesma que decide se a margem do evento pode ser calculada. Só traduz o
 * `status` do item para o `cancelada` que aquele módulo espera.
 */
export function estaForaDoLivro(item: CompraNoPanorama): boolean {
  return foraDoLivro({
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    cancelada: effectivePurchaseStatus(item) === "cancelado",
    transactionId: item.transactionId as string | undefined,
  });
}

/** Comprada, com dinheiro saindo, e ainda não chegou. */
export function aguardandoEntrega(item: CompraNoPanorama): boolean {
  return effectivePurchaseStatus(item) === "comprado";
}

export type ResumoDoPanorama = {
  /** Itens que ainda exigem alguma ação de compra (exclui cancelado). */
  pendentes: number;
  atrasadas: number;
  paraHoje: number;
  proximos7: number;
  semPrazo: number;
  aguardandoEntrega: number;
  recebidas: number;
  canceladas: number;
  /** Dinheiro já comprometido nas pendentes (só onde há preço). */
  valorPendente: number;
  /** Compras com preço que ainda não entraram no livro-caixa. */
  foraDoLivro: number;
  valorForaDoLivro: number;
};

const VAZIO: ResumoDoPanorama = {
  pendentes: 0,
  atrasadas: 0,
  paraHoje: 0,
  proximos7: 0,
  semPrazo: 0,
  aguardandoEntrega: 0,
  recebidas: 0,
  canceladas: 0,
  valorPendente: 0,
  foraDoLivro: 0,
  valorForaDoLivro: 0,
};

/** Contagens do panorama. Lista vazia devolve tudo em zero, nunca `null`. */
export function resumirPanorama(
  itens: readonly CompraNoPanorama[],
  hojeISO: string,
): ResumoDoPanorama {
  const r: ResumoDoPanorama = { ...VAZIO };

  for (const item of itens) {
    const status = effectivePurchaseStatus(item);

    if (status === "cancelado") {
      r.canceladas += 1;
      continue; // cancelado não é pendência de ninguém
    }
    if (status === "recebido") r.recebidas += 1;
    if (aguardandoEntrega(item)) r.aguardandoEntrega += 1;

    if (estaForaDoLivro(item)) {
      r.foraDoLivro += 1;
      r.valorForaDoLivro += valorDaCompra(item);
    }

    if (!isPendingStatus(status)) continue;

    r.pendentes += 1;
    r.valorPendente += valorDaCompra(item);

    switch (faixaDePrazo(item, hojeISO)) {
      case "atrasado":
        r.atrasadas += 1;
        break;
      case "hoje":
        r.paraHoje += 1;
        break;
      case "proximos7":
        r.proximos7 += 1;
        break;
      case "semPrazo":
        r.semPrazo += 1;
        break;
      default:
        break;
    }
  }

  return r;
}

/**
 * Ordena a lista como quem vai executar: o que vence antes vem antes; sem
 * prazo vai para o fim (não é urgente, mas também não some da tela).
 */
export function ordenarPorUrgencia<T extends CompraNoPanorama & { name?: string }>(
  itens: readonly T[],
): T[] {
  const peso = (i: T) => (i.dueDate ? 0 : 1);
  return [...itens].sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTROS DA TELA
// A regra de cada filtro mora aqui, não no componente: é o que permite testá-la
// sem navegador e garante que a contagem do cabeçalho e a lista concordem.
// ─────────────────────────────────────────────────────────────────────────────

export type FiltroDeSituacao =
  | "pendentes"
  | "atrasadas"
  | "aguardando"
  | "foraDoLivro"
  | "todas";

export const ROTULO_DO_FILTRO: Record<FiltroDeSituacao, string> = {
  pendentes: "A resolver",
  atrasadas: "Atrasadas",
  aguardando: "Aguardando entrega",
  foraDoLivro: "Fora do financeiro",
  todas: "Todas",
};

/**
 * Aplica situação, fornecedor e evento.
 *
 * `todas` inclui canceladas — é o único filtro que as mostra, e de propósito:
 * a decoradora precisa poder revisar o que cancelou sem que isso apareça
 * misturado ao que tem de fazer.
 */
export function filtrarPanorama<
  T extends CompraNoPanorama & { supplier?: string; eventId?: string },
>(
  itens: readonly T[],
  hojeISO: string,
  filtros: { situacao?: FiltroDeSituacao; fornecedor?: string; eventId?: string },
): T[] {
  const situacao = filtros.situacao ?? "pendentes";
  const fornecedor = filtros.fornecedor?.trim().toLowerCase();

  return itens.filter((item) => {
    if (filtros.eventId && item.eventId !== filtros.eventId) return false;
    if (fornecedor && (item.supplier ?? "").trim().toLowerCase() !== fornecedor) return false;

    const status = effectivePurchaseStatus(item);
    switch (situacao) {
      case "todas":
        return true;
      case "pendentes":
        return isPendingStatus(status);
      case "atrasadas":
        return faixaDePrazo(item, hojeISO) === "atrasado";
      case "aguardando":
        return aguardandoEntrega(item);
      case "foraDoLivro":
        return estaForaDoLivro(item);
      default:
        return true;
    }
  });
}

/** Fornecedores presentes na lista, ordenados, sem repetição e sem vazios. */
export function fornecedoresDaLista(
  itens: readonly { supplier?: string }[],
): string[] {
  const nomes = new Set<string>();
  for (const i of itens) {
    const nome = i.supplier?.trim();
    if (nome) nomes.add(nome);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export type { PurchaseStatus };
