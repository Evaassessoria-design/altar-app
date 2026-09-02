import { describe, expect, it } from "vitest";
import {
  ROTULO_DA_RESERVA,
  deficitDaReserva,
  disponibilidadeNaJanela,
  divergenciaDaSaida,
  faltaVoltar,
  janelaSugerida,
  janelaValida,
  janelasConflitam,
  quantidadeFisicaValida,
  retornoPossivel,
  situacaoDaReserva,
} from "./acervo";

const r = (
  _id: string, eventId: string, quantidade: number, inicio: string, fim: string,
) => ({ _id, eventId, quantidade, inicio, fim });

// ═══════════════════════════════════════════════════ JANELA OPERACIONAL

describe("janela sugerida", () => {
  it("véspera → dia seguinte, que é a operação real da decoração", () => {
    // Monta-se na véspera e recolhe-se no dia seguinte. `event.date` sozinho
    // deixaria passar o caso que dói: eventos em dias vizinhos disputando peça.
    expect(janelaSugerida("2026-10-10")).toEqual({ inicio: "2026-10-09", fim: "2026-10-11" });
  });

  it("atravessa a virada do mês", () => {
    expect(janelaSugerida("2026-11-01")).toEqual({ inicio: "2026-10-31", fim: "2026-11-02" });
  });

  it("atravessa a virada do ano", () => {
    expect(janelaSugerida("2027-01-01")).toEqual({ inicio: "2026-12-31", fim: "2027-01-02" });
  });

  it("data com HORA é cortada — a janela é de DIA", () => {
    expect(janelaSugerida("2026-10-10T18:00")).toEqual({ inicio: "2026-10-09", fim: "2026-10-11" });
  });

  it("TIMEZONE: 23h de Brasília não empurra a janela para o dia seguinte", () => {
    // A âncora é T12:00:00Z, o mesmo cuidado de lib/dataDoDia.ts. Se fosse
    // `new Date("2026-10-10")` cru, UTC-3 leria 09/10 e a janela sairia
    // deslocada um dia inteiro.
    expect(janelaSugerida("2026-10-10").inicio).toBe("2026-10-09");
    expect(janelaSugerida("2026-03-01")).toEqual({ inicio: "2026-02-28", fim: "2026-03-02" });
  });

  it("data corrompida devolve a própria data, sem inventar janela", () => {
    expect(janelaSugerida("ontem")).toEqual({ inicio: "ontem", fim: "ontem" });
  });
});

describe("janela válida", () => {
  it("aceita início antes do fim, e o mesmo dia", () => {
    expect(janelaValida({ inicio: "2026-10-09", fim: "2026-10-11" })).toBe(true);
    expect(janelaValida({ inicio: "2026-10-10", fim: "2026-10-10" })).toBe(true);
  });

  it("REJEITA janela invertida", () => {
    expect(janelaValida({ inicio: "2026-10-11", fim: "2026-10-09" })).toBe(false);
  });

  it("rejeita formato que não é dia civil", () => {
    expect(janelaValida({ inicio: "2026-10-10T18:00", fim: "2026-10-11" })).toBe(false);
    expect(janelaValida({ inicio: "", fim: "2026-10-11" })).toBe(false);
  });
});

describe("sobreposição — INCLUSIVA nas duas pontas", () => {
  const a = { inicio: "2026-10-10", fim: "2026-10-12" };

  it("10–12 e 13–14 NÃO conflitam", () => {
    expect(janelasConflitam(a, { inicio: "2026-10-13", fim: "2026-10-14" })).toBe(false);
  });

  it("10–12 e 12–14 CONFLITAM no dia 12", () => {
    // Decisão explícita: a peça não consegue desmontar num evento e montar no
    // outro no mesmo dia. Na dúvida entre avisar demais e deixar a decoradora
    // descobrir no galpão, avisamos.
    expect(janelasConflitam(a, { inicio: "2026-10-12", fim: "2026-10-14" })).toBe(true);
  });

  it("10–12 e 09–10 CONFLITAM no dia 10", () => {
    expect(janelasConflitam(a, { inicio: "2026-10-09", fim: "2026-10-10" })).toBe(true);
  });

  it("10–12 e 11–11 conflitam (contida)", () => {
    expect(janelasConflitam(a, { inicio: "2026-10-11", fim: "2026-10-11" })).toBe(true);
  });

  it("mesma data conflita", () => {
    const dia = { inicio: "2026-10-10", fim: "2026-10-10" };
    expect(janelasConflitam(dia, dia)).toBe(true);
  });

  it("09–09 e 10–12 NÃO conflitam — um dia de folga basta", () => {
    expect(janelasConflitam({ inicio: "2026-10-09", fim: "2026-10-09" }, a)).toBe(false);
  });

  it("é simétrica", () => {
    const b = { inicio: "2026-10-11", fim: "2026-10-20" };
    expect(janelasConflitam(a, b)).toBe(janelasConflitam(b, a));
  });
});

// ═══════════════════════════════════════════════════════ DISPONIBILIDADE

describe("disponibilidade — a pergunta central do MASTER", () => {
  const janela = { inicio: "2026-10-09", fim: "2026-10-11" };

  it("40 vasos, 15 comprometidos noutro evento na mesma janela → 25 disponíveis", () => {
    const d = disponibilidadeNaJanela(
      40, [r("r1", "evB", 15, "2026-10-10", "2026-10-12")], janela, "evA",
    );
    expect(d.total).toBe(40);
    expect(d.reservadoPorOutros).toBe(15);
    expect(d.disponivel).toBe(25);
  });

  it("reserva de outro evento FORA da janela não tira nada", () => {
    const d = disponibilidadeNaJanela(
      40, [r("r1", "evB", 30, "2026-11-01", "2026-11-03")], janela, "evA",
    );
    expect(d.disponivel).toBe(40);
    expect(d.conflitos).toEqual([]);
  });

  it("a PRÓPRIA reserva não conta contra o evento ao editar", () => {
    // Senão aumentar a reserva de 20 para 25 acusaria conflito com ela mesma.
    const d = disponibilidadeNaJanela(
      40, [r("r1", "evA", 20, "2026-10-09", "2026-10-11")], janela, "evA",
    );
    expect(d.reservadoPorOutros).toBe(0);
    expect(d.disponivel).toBe(40);
    expect(d.jaReservadoAqui).toBe(20);
  });

  it("TRÊS eventos disputando somam", () => {
    const d = disponibilidadeNaJanela(
      40,
      [
        r("r1", "evB", 10, "2026-10-10", "2026-10-11"),
        r("r2", "evC", 12, "2026-10-11", "2026-10-13"),
        r("r3", "evD", 5, "2026-12-01", "2026-12-02"), // longe, não conta
      ],
      janela, "evA",
    );
    expect(d.reservadoPorOutros).toBe(22);
    expect(d.disponivel).toBe(18);
    expect(d.conflitos).toHaveLength(2);
  });

  it("o conflito diz QUAL evento, QUAL janela e QUANTO", () => {
    const d = disponibilidadeNaJanela(
      40, [r("r1", "evB", 30, "2026-10-10", "2026-10-12")], janela, "evA",
    );
    expect(d.conflitos[0]).toEqual({
      reservaId: "r1", eventId: "evB", quantidade: 30,
      inicio: "2026-10-10", fim: "2026-10-12",
    });
  });

  it("comprometido além do total não vira disponível negativo", () => {
    const d = disponibilidadeNaJanela(
      40, [r("r1", "evB", 50, "2026-10-10", "2026-10-11")], janela, "evA",
    );
    expect(d.disponivel).toBe(0);
  });

  it("acervo zerado responde zero, não erro", () => {
    expect(disponibilidadeNaJanela(0, [], janela, "evA").disponivel).toBe(0);
  });

  it("sem evento atual, TODAS as reservas contam (visão geral do item)", () => {
    const d = disponibilidadeNaJanela(
      40, [r("r1", "evA", 20, "2026-10-10", "2026-10-11")], janela, null,
    );
    expect(d.reservadoPorOutros).toBe(20);
  });

  it("decimal não acumula lixo de ponto flutuante", () => {
    const d = disponibilidadeNaJanela(
      10,
      [r("r1", "evB", 0.1, "2026-10-10", "2026-10-10"),
       r("r2", "evC", 0.2, "2026-10-10", "2026-10-10")],
      janela, "evA",
    );
    expect(d.reservadoPorOutros).toBe(0.3);
  });
});

describe("O CASO DO ENUNCIADO — dois eventos, os mesmos 30 vasos", () => {
  it("40 no acervo, Marina reserva 20 e Ana quer 30 → conflito de 10", () => {
    const janelaAna = { inicio: "2026-10-10", fim: "2026-10-12" };
    const d = disponibilidadeNaJanela(
      40, [r("r1", "marina", 20, "2026-10-09", "2026-10-11")], janelaAna, "ana",
    );
    expect(d.disponivel).toBe(20);
    expect(deficitDaReserva(30, d.disponivel)).toBe(10);
  });

  it("as mesmas peças NÃO são contadas duas vezes", () => {
    // Sem a regra de janela, cada evento veria 40 e prometeria 50 no total.
    const janelaAna = { inicio: "2026-10-10", fim: "2026-10-12" };
    const d = disponibilidadeNaJanela(
      40, [r("r1", "marina", 20, "2026-10-09", "2026-10-11")], janelaAna, "ana",
    );
    expect(d.disponivel).not.toBe(40);
  });

  it("uma semana depois, as mesmas peças estão livres de novo", () => {
    const outraSemana = { inicio: "2026-10-17", fim: "2026-10-19" };
    const d = disponibilidadeNaJanela(
      40, [r("r1", "marina", 20, "2026-10-09", "2026-10-11")], outraSemana, "ana",
    );
    expect(d.disponivel).toBe(40);
  });
});

describe("déficit — informa, não bloqueia", () => {
  it("querer 30 com 25 disponíveis dá déficit de 5", () => {
    expect(deficitDaReserva(30, 25)).toBe(5);
  });

  it("querer menos que o disponível não é déficit", () => {
    expect(deficitDaReserva(20, 25)).toBe(0);
  });

  it("exatamente o disponível não é déficit", () => {
    expect(deficitDaReserva(25, 25)).toBe(0);
  });

  it("nunca devolve negativo — sobra não é déficit", () => {
    expect(deficitDaReserva(10, 40)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════ SAÍDA E RETORNO

describe("situação DERIVADA das quantidades", () => {
  it.each([
    [{ quantidade: 20 }, "planejada"],
    [{ quantidade: 20, saiu: 0 }, "planejada"],
    [{ quantidade: 20, saiu: 20 }, "fora"],
    [{ quantidade: 20, saiu: 20, voltou: 0 }, "fora"],
    [{ quantidade: 20, saiu: 20, voltou: 18 }, "retorno_parcial"],
    [{ quantidade: 20, saiu: 20, voltou: 20 }, "retornada"],
    [{ quantidade: 20, saiu: 19, voltou: 19 }, "retornada"],
  ])("%o → %s", (reserva, esperado) => {
    expect(situacaoDaReserva(reserva)).toBe(esperado);
  });

  it("não existe campo de status para divergir dos números", () => {
    // Corrigir "voltou" de 18 para 20 muda a situação sozinho.
    expect(situacaoDaReserva({ quantidade: 20, saiu: 20, voltou: 18 })).toBe("retorno_parcial");
    expect(situacaoDaReserva({ quantidade: 20, saiu: 20, voltou: 20 })).toBe("retornada");
  });

  it("todo rótulo é português da decoradora, sem código", () => {
    for (const rotulo of Object.values(ROTULO_DA_RESERVA)) {
      expect(rotulo).toBeTruthy();
      expect(rotulo).not.toMatch(/_|checkout|inventory|stock/i);
    }
  });
});

describe("falta voltar", () => {
  it("saiu 20, voltou 18 → faltam 2", () => {
    expect(faltaVoltar({ quantidade: 20, saiu: 20, voltou: 18 })).toBe(2);
  });

  it("nada saiu, nada falta", () => {
    expect(faltaVoltar({ quantidade: 20 })).toBe(0);
  });

  it("voltou tudo, nada falta", () => {
    expect(faltaVoltar({ quantidade: 20, saiu: 20, voltou: 20 })).toBe(0);
  });

  it("nunca negativo", () => {
    expect(faltaVoltar({ quantidade: 20, saiu: 18, voltou: 20 })).toBe(0);
  });
});

describe("divergência da saída — acontece e não é erro", () => {
  it("reservou 20 e a equipe pegou 22", () => {
    expect(divergenciaDaSaida({ quantidade: 20, saiu: 22 })).toBe(2);
  });

  it("reservou 20 e só 19 saíram", () => {
    expect(divergenciaDaSaida({ quantidade: 20, saiu: 19 })).toBe(-1);
  });

  it("sem saída registrada não há divergência a afirmar", () => {
    expect(divergenciaDaSaida({ quantidade: 20 })).toBe(0);
  });
});

describe("validação de quantidade física", () => {
  it("zero é válido — acervo pode estar zerado", () => {
    expect(quantidadeFisicaValida(0, "un")).toBe(true);
  });

  it.each([-1, -0.5, NaN, Infinity])("%s é inválido", (valor) => {
    expect(quantidadeFisicaValida(valor, "un")).toBe(false);
  });

  it("unidade INDIVISÍVEL não aceita fração — 2,5 vasos é erro de digitação", () => {
    expect(quantidadeFisicaValida(2.5, "un")).toBe(false);
    expect(quantidadeFisicaValida(2.5, "haste")).toBe(false);
    expect(quantidadeFisicaValida(20, "un")).toBe(true);
  });

  it("metro e quilo aceitam fração — tecido reutilizável existe", () => {
    expect(quantidadeFisicaValida(3.2, "m")).toBe(true);
    expect(quantidadeFisicaValida(0.5, "kg")).toBe(true);
  });
});

describe("retorno impossível é recusado", () => {
  it("voltar mais do que saiu é erro de conferência", () => {
    // Aceitar em silêncio produziria acervo fantasma.
    expect(retornoPossivel(20, 22)).toBe(false);
  });

  it("voltar o que saiu, ou menos, é possível", () => {
    expect(retornoPossivel(20, 20)).toBe(true);
    expect(retornoPossivel(20, 0)).toBe(true);
  });

  it("voltar sem ter saído é impossível", () => {
    expect(retornoPossivel(undefined, 5)).toBe(false);
    expect(retornoPossivel(0, 1)).toBe(false);
  });

  it("retorno negativo é recusado", () => {
    expect(retornoPossivel(20, -1)).toBe(false);
  });
});
