import { describe, expect, it } from "vitest";
import {
  escolherAssinatura,
  assinaturasDescartadas,
  assinaturaEmDia,
  temCobrancaEmAtraso,
  temCobrancaPaga,
  type CandidataDeAssinatura,
} from "./escolhaDeAssinatura";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — O CASO REGINA
//
// Duas assinaturas ACTIVE no mesmo cliente do Asaas. Só uma recebeu dinheiro.
// A escolha anterior devolvia a que estava gravada no ALTAR (a duplicada, que
// também estava ACTIVE), via que ela não tinha cobrança paga e concluía "sem
// assinatura paga" — todo dia, no cron. Uma cliente adimplente ficou presa no
// paywall.
//
// Os dados abaixo são os REAIS do incidente.
// ─────────────────────────────────────────────────────────────────────────────

/** A que recebeu os R$ 119,90 no cartão, criada primeiro. */
const PAGA: CandidataDeAssinatura = {
  assinatura: { id: "sub_d6v66o4btfs5it63", status: "ACTIVE", dateCreated: "2026-08-31" },
  cobrancas: [
    { id: "pay_sw2z1raw5n5z6ko4", status: "PENDING" },
    { id: "pay_9pluuywd01691c6b", status: "CONFIRMED" },
  ],
};

/** A duplicada, sem meio de pagamento. Nunca recebeu nada. */
const FANTASMA: CandidataDeAssinatura = {
  assinatura: { id: "sub_lmil9bi1p0jhaw9e", status: "ACTIVE", dateCreated: "2026-09-01" },
  cobrancas: [
    { id: "pay_j3ohjw0tjx4m4r5m", status: "PENDING" },
    { id: "pay_e08unnsnqbmxswm3", status: "OVERDUE" },
  ],
};

describe("duas assinaturas ativas — vence a que prova pagamento", () => {
  it("escolhe a PAGA mesmo com a fantasma gravada no ALTAR", () => {
    // Era exatamente este o estado: `asaasSubscriptionId` apontava para a
    // fantasma. É o bug que custou o acesso da cliente.
    const escolhida = escolherAssinatura([FANTASMA, PAGA], "sub_lmil9bi1p0jhaw9e");
    expect(escolhida?.id).toBe("sub_d6v66o4btfs5it63");
  });

  it("a ordem em que o Asaas devolve a lista não muda a escolha", () => {
    expect(escolherAssinatura([PAGA, FANTASMA], "sub_lmil9bi1p0jhaw9e")?.id).toBe(
      "sub_d6v66o4btfs5it63",
    );
    expect(escolherAssinatura([FANTASMA, PAGA], "sub_lmil9bi1p0jhaw9e")?.id).toBe(
      "sub_d6v66o4btfs5it63",
    );
  });

  it("sem id gravado, continua escolhendo a paga", () => {
    expect(escolherAssinatura([FANTASMA, PAGA])?.id).toBe("sub_d6v66o4btfs5it63");
  });

  it("com o vínculo JÁ correto, mantém o que está — não fica trocando à toa", () => {
    expect(escolherAssinatura([FANTASMA, PAGA], "sub_d6v66o4btfs5it63")?.id).toBe(
      "sub_d6v66o4btfs5it63",
    );
  });

  it("estar ACTIVE não é prova: a fantasma sozinha não vira escolha quando há paga", () => {
    const escolhida = escolherAssinatura([FANTASMA, PAGA], "sub_lmil9bi1p0jhaw9e");
    expect(escolhida?.id).not.toBe(FANTASMA.assinatura.id);
  });

  it("duas pagas: vence a mais antiga, de forma determinística", () => {
    const outraPaga: CandidataDeAssinatura = {
      assinatura: { id: "sub_zzz", status: "ACTIVE", dateCreated: "2026-09-05" },
      cobrancas: [{ id: "pay_x", status: "RECEIVED" }],
    };
    expect(escolherAssinatura([outraPaga, PAGA])?.id).toBe("sub_d6v66o4btfs5it63");
    expect(escolherAssinatura([PAGA, outraPaga])?.id).toBe("sub_d6v66o4btfs5it63");
  });

  it("mesma data de criação: o id desempata, sem depender da ordem da lista", () => {
    const a: CandidataDeAssinatura = {
      assinatura: { id: "sub_aaa", status: "ACTIVE", dateCreated: "2026-08-31" },
      cobrancas: [{ id: "p1", status: "CONFIRMED" }],
    };
    const b: CandidataDeAssinatura = {
      assinatura: { id: "sub_bbb", status: "ACTIVE", dateCreated: "2026-08-31" },
      cobrancas: [{ id: "p2", status: "CONFIRMED" }],
    };
    expect(escolherAssinatura([a, b])?.id).toBe(escolherAssinatura([b, a])?.id);
  });
});

describe("casos comuns continuam iguais", () => {
  it("uma assinatura ativa e paga é escolhida", () => {
    expect(escolherAssinatura([PAGA], "sub_d6v66o4btfs5it63")?.id).toBe("sub_d6v66o4btfs5it63");
  });

  it("uma assinatura ativa SEM pagamento ainda é escolhida — é a única que existe", () => {
    // Cliente que assinou e ainda não pagou: a assinatura existe e o checkout
    // precisa mandá-lo para a fatura dela, não criar outra.
    expect(escolherAssinatura([FANTASMA], "sub_lmil9bi1p0jhaw9e")?.id).toBe(
      "sub_lmil9bi1p0jhaw9e",
    );
  });

  it("nenhuma ativa devolve null", () => {
    const inativa: CandidataDeAssinatura = {
      assinatura: { id: "sub_morta", status: "INACTIVE", dateCreated: "2026-01-01" },
      cobrancas: [{ id: "p", status: "CONFIRMED" }],
    };
    expect(escolherAssinatura([inativa], "sub_morta")).toBeNull();
    expect(escolherAssinatura([])).toBeNull();
  });

  it("assinatura cancelada NÃO entra na escolha, mesmo tendo sido paga um dia", () => {
    const cancelada: CandidataDeAssinatura = {
      assinatura: { id: "sub_ex", status: "INACTIVE", dateCreated: "2026-01-01" },
      cobrancas: [{ id: "p", status: "CONFIRMED" }],
    };
    expect(escolherAssinatura([cancelada, FANTASMA])?.id).toBe("sub_lmil9bi1p0jhaw9e");
  });

  it("nenhuma paga: preserva o vínculo gravado em vez de inventar troca", () => {
    const outra: CandidataDeAssinatura = {
      assinatura: { id: "sub_nova", status: "ACTIVE", dateCreated: "2026-09-09" },
      cobrancas: [{ id: "p", status: "PENDING" }],
    };
    expect(escolherAssinatura([outra, FANTASMA], "sub_lmil9bi1p0jhaw9e")?.id).toBe(
      "sub_lmil9bi1p0jhaw9e",
    );
  });
});

describe("temCobrancaPaga reconhece as três formas de pagamento", () => {
  it.each(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])("%s conta como paga", (status) => {
    expect(temCobrancaPaga([{ id: "p", status }])).toBe(true);
  });

  it.each(["PENDING", "OVERDUE", "REFUNDED", "AWAITING_RISK_ANALYSIS", undefined])(
    "%s NÃO conta como paga",
    (status) => {
      expect(temCobrancaPaga([{ id: "p", status }])).toBe(false);
    },
  );

  it("lista vazia não é pagamento", () => {
    expect(temCobrancaPaga([])).toBe(false);
  });
});

describe("estar em dia ≠ ter pagado um dia", () => {
  // ── TRAVA DE REGRESSÃO ────────────────────────────────────────────────────
  // A conferência diária inclui as contas `overdue`. Com a regra antiga
  // ("existe alguma cobrança paga entre as últimas 20?"), um cliente que pagou
  // seis meses e parou seria REATIVADO todo dia pela cobrança antiga — a rede
  // de segurança desfazendo o bloqueio correto do aviso de atraso.

  const historicoDeQuemParouDePagar = [
    { id: "jan", status: "CONFIRMED" },
    { id: "fev", status: "CONFIRMED" },
    { id: "mar", status: "RECEIVED" },
    { id: "abr", status: "OVERDUE" },
  ];

  it("quem tem cobrança vencida em aberto NÃO está em dia, mesmo tendo pago antes", () => {
    expect(temCobrancaPaga(historicoDeQuemParouDePagar)).toBe(true);
    expect(temCobrancaEmAtraso(historicoDeQuemParouDePagar)).toBe(true);
    expect(assinaturaEmDia(historicoDeQuemParouDePagar)).toBe(false);
  });

  it("quem pagou e não deve nada está em dia", () => {
    expect(assinaturaEmDia(PAGA.cobrancas)).toBe(true);
  });

  it("quem nunca pagou não está em dia", () => {
    expect(assinaturaEmDia(FANTASMA.cobrancas)).toBe(false);
  });

  it("pagar o atraso volta a colocar em dia — o OVERDUE vira RECEIVED", () => {
    const regularizado = historicoDeQuemParouDePagar.map((c) =>
      c.status === "OVERDUE" ? { ...c, status: "RECEIVED" } : c,
    );
    expect(assinaturaEmDia(regularizado)).toBe(true);
  });

  it("cobrança PENDING (ainda no prazo) não impede estar em dia", () => {
    // É o estado normal de quem acabou de pagar: a próxima já foi gerada.
    expect(assinaturaEmDia([{ id: "p1", status: "CONFIRMED" }, { id: "p2", status: "PENDING" }])).toBe(
      true,
    );
  });
});

describe("as descartadas ficam visíveis — duplicata é problema, não detalhe", () => {
  it("aponta a fantasma como ativa não escolhida", () => {
    const escolhida = escolherAssinatura([FANTASMA, PAGA], "sub_lmil9bi1p0jhaw9e");
    const sobra = assinaturasDescartadas([FANTASMA, PAGA], escolhida);
    expect(sobra.map((a) => a.id)).toEqual(["sub_lmil9bi1p0jhaw9e"]);
  });

  it("com uma assinatura só, não há descarte", () => {
    expect(assinaturasDescartadas([PAGA], PAGA.assinatura)).toEqual([]);
  });
});
