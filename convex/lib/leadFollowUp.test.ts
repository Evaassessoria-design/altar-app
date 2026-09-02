import { describe, expect, it } from "vitest";
import {
  diasSemContato,
  estaAtivo,
  estaParado,
  ESTAGIOS_FINAIS,
  prazoDoEstagio,
  resumirFollowUp,
  semProximaAcao,
  type LeadParaAcompanhar,
} from "./leadFollowUp";

const HOJE = "2026-09-20";
const DIA = 86_400_000;

/** Um lead com criação recente, para isolar o efeito de `lastInteraction`. */
function lead(over: Partial<LeadParaAcompanhar> = {}): LeadParaAcompanhar {
  return {
    _id: "l1",
    clientName: "Helena",
    stage: "negotiating",
    _creationTime: Date.parse(`${HOJE}T12:00:00Z`),
    ...over,
  };
}

describe("estágios finais nunca cobram follow-up", () => {
  it.each(ESTAGIOS_FINAIS)("%s não está ativo", (stage) => {
    expect(estaAtivo({ stage })).toBe(false);
  });

  it.each(["contracted", "discarded"])(
    "%s sem próxima ação e parado há meses continua em silêncio",
    (stage) => {
      const antigo = lead({
        stage,
        nextAction: undefined,
        lastInteraction: "2026-01-01",
      });
      expect(semProximaAcao(antigo)).toBe(false);
      expect(estaParado(antigo, HOJE)).toBe(false);
    },
  );

  it.each(["contact", "contacted", "meeting", "quote_sent", "negotiating"])(
    "%s continua ativo",
    (stage) => {
      expect(estaAtivo({ stage })).toBe(true);
    },
  );
});

describe("sem próxima ação", () => {
  it("lead ativo sem próxima ação é sinalizado", () => {
    expect(semProximaAcao(lead({ nextAction: undefined }))).toBe(true);
  });

  it.each(["", "   ", "\n"])("próxima ação em branco (%j) não conta", (vazio) => {
    expect(semProximaAcao(lead({ nextAction: vazio }))).toBe(true);
  });

  it("com próxima ação escrita, some do alerta", () => {
    expect(semProximaAcao(lead({ nextAction: "Ligar quinta" }))).toBe(false);
  });

  it("vale INDEPENDENTE de quando foi a última conversa", () => {
    // É falha de processo, não de tempo: conversamos ontem e mesmo assim
    // ninguém decidiu o próximo passo.
    const ontem = lead({ nextAction: undefined, lastInteraction: "2026-09-19" });
    expect(semProximaAcao(ontem)).toBe(true);
    expect(estaParado(ontem, HOJE)).toBe(false);
  });
});

describe("lead parado — o prazo é do estágio", () => {
  it.each([
    ["contact", 2],
    ["contacted", 5],
    ["meeting", 7],
    ["quote_sent", 5],
    ["negotiating", 7],
  ])("%s tolera %i dias", (stage, prazo) => {
    expect(prazoDoEstagio(stage)).toBe(prazo);
  });

  it("estágio desconhecido cai no prazo mais tolerante", () => {
    expect(prazoDoEstagio("estagio_inventado")).toBe(7);
  });

  it("contato novo esfria em 2 dias; negociação aguenta 6", () => {
    // Mesmo silêncio, urgências diferentes — é o ponto da regra por estágio.
    const silencio = { lastInteraction: "2026-09-16" }; // 4 dias
    expect(estaParado(lead({ stage: "contact", ...silencio }), HOJE)).toBe(true);
    expect(estaParado(lead({ stage: "negotiating", ...silencio }), HOJE)).toBe(false);
  });

  it("no dia exato do prazo já conta como parado", () => {
    expect(estaParado(lead({ stage: "quote_sent", lastInteraction: "2026-09-15" }), HOJE)).toBe(true);
    expect(estaParado(lead({ stage: "quote_sent", lastInteraction: "2026-09-16" }), HOJE)).toBe(false);
  });

  it("ter próxima ação NÃO impede de estar parado", () => {
    // Anotar "ligar" e não ligar por três semanas continua sendo abandono.
    const anotado = lead({ nextAction: "Ligar", lastInteraction: "2026-08-20" });
    expect(semProximaAcao(anotado)).toBe(false);
    expect(estaParado(anotado, HOJE)).toBe(true);
  });
});

describe("sem lastInteraction, a criação vale como último sinal", () => {
  it("lead criado hoje não está parado", () => {
    expect(diasSemContato(lead(), HOJE)).toBe(0);
    expect(estaParado(lead(), HOJE)).toBe(false);
  });

  it("lead cadastrado há 30 dias e nunca tocado está parado", () => {
    const esquecido = lead({
      _creationTime: Date.parse(`${HOJE}T12:00:00Z`) - 30 * DIA,
    });
    expect(diasSemContato(esquecido, HOJE)).toBe(30);
    expect(estaParado(esquecido, HOJE)).toBe(true);
  });

  it("lastInteraction tem precedência sobre a criação", () => {
    const conversado = lead({
      _creationTime: Date.parse(`${HOJE}T12:00:00Z`) - 60 * DIA,
      lastInteraction: HOJE,
    });
    expect(diasSemContato(conversado, HOJE)).toBe(0);
    expect(estaParado(conversado, HOJE)).toBe(false);
  });
});

describe("datas não deslizam de dia", () => {
  it("a conta é feita ancorada, não em meia-noite UTC", () => {
    // O bug de "dia anterior" já apareceu duas vezes neste produto.
    expect(diasSemContato(lead({ lastInteraction: "2026-09-19" }), "2026-09-20")).toBe(1);
    expect(diasSemContato(lead({ lastInteraction: "2026-09-20" }), "2026-09-20")).toBe(0);
  });

  it("data futura não vira dias negativos", () => {
    expect(diasSemContato(lead({ lastInteraction: "2026-09-25" }), HOJE)).toBe(0);
  });

  it("data inválida degrada para zero em vez de NaN", () => {
    expect(diasSemContato(lead({ lastInteraction: "nao-e-data" }), HOJE)).toBe(0);
  });
});

describe("resumo para o Dashboard", () => {
  const leads: LeadParaAcompanhar[] = [
    lead({ _id: "a", stage: "contact", nextAction: undefined, lastInteraction: HOJE }),
    lead({ _id: "b", stage: "negotiating", nextAction: "Ligar", lastInteraction: "2026-08-01" }),
    lead({ _id: "c", stage: "quote_sent", nextAction: undefined, lastInteraction: "2026-08-01" }),
    lead({ _id: "d", stage: "meeting", nextAction: "Enviar planta", lastInteraction: HOJE }),
    lead({ _id: "e", stage: "contracted", nextAction: undefined, lastInteraction: "2026-01-01" }),
  ];

  it("separa as duas listas", () => {
    const r = resumirFollowUp(leads, HOJE);
    expect(r.semAcao.map((l) => l._id)).toEqual(["a", "c"]);
    expect(r.parados.map((l) => l._id)).toEqual(["b", "c"]);
  });

  it("conta OPORTUNIDADES, não motivos", () => {
    // "c" está nas duas listas e conta uma vez: o Dashboard fala de leads.
    expect(resumirFollowUp(leads, HOJE).total).toBe(3);
  });

  it("o lead fechado fica de fora das duas", () => {
    const r = resumirFollowUp(leads, HOJE);
    expect([...r.semAcao, ...r.parados].map((l) => l._id)).not.toContain("e");
  });

  it("funil saudável não gera alerta nenhum", () => {
    const r = resumirFollowUp(
      [lead({ nextAction: "Ligar quinta", lastInteraction: HOJE })],
      HOJE,
    );
    expect(r.total).toBe(0);
    expect(r.semAcao).toEqual([]);
    expect(r.parados).toEqual([]);
  });
});
