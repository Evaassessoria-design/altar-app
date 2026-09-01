import { describe, expect, it } from "vitest";
import {
  PURCHASE_STATUSES,
  effectivePurchaseStatus,
  isOverdue,
  isPendingStatus,
  isPurchasedForStatus,
} from "./purchaseStatus";

describe("compatibilidade com o dado antigo", () => {
  // Nenhum item cadastrado antes desta mudança tem `status`. Todos precisam
  // continuar exibindo uma situação verdadeira, sem backfill.
  it("item antigo NÃO comprado é lido como necessidade", () => {
    expect(effectivePurchaseStatus({ isPurchased: false })).toBe("necessidade");
  });

  it("item antigo JÁ comprado é lido como comprado", () => {
    expect(effectivePurchaseStatus({ isPurchased: true })).toBe("comprado");
  });

  it("status gravado tem precedência sobre o booleano", () => {
    expect(effectivePurchaseStatus({ isPurchased: true, status: "recebido" })).toBe("recebido");
    expect(effectivePurchaseStatus({ isPurchased: false, status: "cotacao" })).toBe("cotacao");
  });

  it("status inválido no banco não quebra a leitura", () => {
    // Defesa contra dado inesperado: cai no comportamento antigo.
    expect(effectivePurchaseStatus({ isPurchased: true, status: "lixo" })).toBe("comprado");
  });
});

describe("status operacional NÃO é status de pagamento", () => {
  it("comprado e recebido marcam isPurchased", () => {
    expect(isPurchasedForStatus("comprado")).toBe(true);
    expect(isPurchasedForStatus("recebido")).toBe(true);
  });

  it("as etapas anteriores NÃO marcam isPurchased", () => {
    for (const s of ["necessidade", "cotacao", "aprovado"] as const) {
      expect(isPurchasedForStatus(s)).toBe(false);
    }
  });

  it("CANCELADO não conta como comprado", () => {
    // Cancelar tira o item da lista de compras; não significa que foi adquirido.
    expect(isPurchasedForStatus("cancelado")).toBe(false);
  });

  it("o módulo não conhece pagamento — isso é do financeiro", () => {
    const exportados = Object.keys({
      PURCHASE_STATUSES,
      effectivePurchaseStatus,
      isPurchasedForStatus,
      isPendingStatus,
      isOverdue,
    });
    expect(exportados.some((e) => /paid|pago|payment/i.test(e))).toBe(false);
  });
});

describe("pendência", () => {
  it("necessidade, cotação e aprovado ainda exigem ação", () => {
    for (const s of ["necessidade", "cotacao", "aprovado"] as const) {
      expect(isPendingStatus(s)).toBe(true);
    }
  });

  it("comprado, recebido e cancelado não exigem mais ação de compra", () => {
    for (const s of ["comprado", "recebido", "cancelado"] as const) {
      expect(isPendingStatus(s)).toBe(false);
    }
  });
});

describe("atraso — só quando há data real", () => {
  const HOJE = "2026-09-10";

  it("sem data limite NUNCA há atraso", () => {
    // Preferimos não dizer nada a inventar urgência que ninguém definiu.
    expect(isOverdue({ isPurchased: false }, HOJE)).toBe(false);
  });

  it("data no passado com item pendente é atraso", () => {
    expect(isOverdue({ isPurchased: false, dueDate: "2026-09-01" }, HOJE)).toBe(true);
  });

  it("data de hoje ainda NÃO é atraso", () => {
    expect(isOverdue({ isPurchased: false, dueDate: HOJE }, HOJE)).toBe(false);
  });

  it("data no futuro não é atraso", () => {
    expect(isOverdue({ isPurchased: false, dueDate: "2026-12-01" }, HOJE)).toBe(false);
  });

  it("item já comprado não fica atrasado, mesmo com data vencida", () => {
    expect(isOverdue({ isPurchased: true, dueDate: "2026-01-01" }, HOJE)).toBe(false);
  });

  it("item cancelado não fica atrasado", () => {
    expect(
      isOverdue({ isPurchased: false, status: "cancelado", dueDate: "2026-01-01" }, HOJE),
    ).toBe(false);
  });
});

describe("lista de situações", () => {
  it("segue a ordem do fluxo real de aquisição", () => {
    expect(PURCHASE_STATUSES).toEqual([
      "necessidade",
      "cotacao",
      "aprovado",
      "comprado",
      "recebido",
      "cancelado",
    ]);
  });
});
