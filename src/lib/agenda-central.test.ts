import { describe, expect, it } from "vitest";
import {
  diaCivil,
  montarAgenda,
  ROTULO_DA_OPERACAO,
  type EventoDaAgenda,
  type ReservaDaAgenda,
} from "./agenda-central.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A AGENDA É DERIVADA — e não pode inventar operação nenhuma.
//
// Cada linha destes testes protege uma decisão: sem horário não vira 00:00,
// evento sem briefing não desaparece, retirada não vira uma linha por peça, e
// "não voltou" só é afirmado quando algo saiu.
// ─────────────────────────────────────────────────────────────────────────────

const evento = (over: Partial<EventoDaAgenda> = {}): EventoDaAgenda => ({
  _id: "ev1",
  nome: "Casamento Marina & Gabriel",
  data: "2026-10-10",
  local: "Espaço Villa",
  tipo: "wedding",
  status: "confirmed",
  equipe: [],
  ...over,
});

const nomes = (dias: ReturnType<typeof montarAgenda>) =>
  dias.flatMap((d) => d.operacoes.map((o) => o.tipo));

describe("agenda vazia", () => {
  it("sem evento nenhum, nenhum dia", () => {
    expect(montarAgenda([], [], "2026-10-01", "2026-10-31")).toEqual([]);
  });

  it("evento fora do recorte não aparece", () => {
    const dias = montarAgenda([evento({ data: "2026-12-01" })], [], "2026-10-01", "2026-10-31");
    expect(dias).toEqual([]);
  });
});

describe("um evento vira as atividades que o briefing sustenta", () => {
  it("quatro horários viram quatro operações, na ordem do dia", () => {
    const dias = montarAgenda(
      [
        evento({
          setupTime: "08:00",
          ceremonyTime: "16:00",
          receptionTime: "18:30",
          teardownTime: "23:00",
        }),
      ],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias).toHaveLength(1);
    expect(nomes(dias)).toEqual(["montagem", "cerimonia", "recepcao", "desmontagem"]);
  });

  it("horário parcial gera só o que existe", () => {
    const dias = montarAgenda([evento({ setupTime: "07:00" })], [], "2026-10-01", "2026-10-31");
    expect(nomes(dias)).toEqual(["montagem"]);
  });

  it("evento SEM briefing não some — vira a linha do próprio evento", () => {
    // Esconder o evento por falta de briefing esconderia justamente o que a
    // decoradora abriu a tela para ver.
    const dias = montarAgenda([evento()], [], "2026-10-01", "2026-10-31");
    expect(nomes(dias)).toEqual(["evento"]);
    expect(dias[0].operacoes[0].horario).toBeNull();
  });

  it("horário inválido é ignorado, não vira 00:00", () => {
    const dias = montarAgenda(
      [evento({ setupTime: "banana", ceremonyTime: "16:00" })],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(nomes(dias)).toEqual(["cerimonia"]);
  });

  it("leva local e equipe para cada operação", () => {
    const dias = montarAgenda(
      [evento({ setupTime: "08:00", equipe: [{ nome: "Ana", horario: "07:30" }] })],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    const op = dias[0].operacoes[0];
    expect(op.local).toBe("Espaço Villa");
    expect(op.equipe).toEqual([{ nome: "Ana", horario: "07:30" }]);
  });
});

describe("ordenação cronológica", () => {
  it("ordena por data e depois por horário", () => {
    const dias = montarAgenda(
      [
        evento({ _id: "b", data: "2026-10-12", setupTime: "09:00" }),
        evento({ _id: "a", data: "2026-10-10", setupTime: "14:00", ceremonyTime: "08:00" }),
      ],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias.map((d) => d.data)).toEqual(["2026-10-10", "2026-10-12"]);
    expect(dias[0].operacoes.map((o) => o.horario)).toEqual(["08:00", "14:00"]);
  });

  it("sem horário vai para o FIM do dia, não para as 00:00", () => {
    // 00:00 fingiria uma precisão que ninguém informou.
    const dias = montarAgenda(
      [
        evento({ _id: "a", setupTime: "08:00" }),
        evento({ _id: "b", nome: "Sem briefing" }),
      ],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias[0].operacoes.map((o) => o.tipo)).toEqual(["montagem", "evento"]);
  });
});

describe("retirada e devolução do acervo", () => {
  const reserva = (over: Partial<ReservaDaAgenda> = {}): ReservaDaAgenda => ({
    eventoId: "ev1",
    inicio: "2026-10-09",
    fim: "2026-10-11",
    quantidade: 20,
    ...over,
  });

  it("gera retirada no início e devolução no fim da janela", () => {
    const dias = montarAgenda([evento()], [reserva()], "2026-10-01", "2026-10-31");
    const tipos = nomes(dias);
    expect(tipos).toContain("retirada");
    expect(tipos).toContain("devolucao");
  });

  it("vinte peças no mesmo dia são UMA ida ao galpão, não vinte linhas", () => {
    const dias = montarAgenda(
      [evento()],
      [reserva({ quantidade: 12 }), reserva({ quantidade: 8 })],
      "2026-10-01",
      "2026-10-31",
    );
    const retiradas = dias.flatMap((d) => d.operacoes).filter((o) => o.tipo === "retirada");
    expect(retiradas).toHaveLength(1);
    expect(retiradas[0].pecas).toBe(20);
  });

  it("avisa quando saiu e não voltou", () => {
    const dias = montarAgenda(
      [evento()],
      [reserva({ saiu: 20, voltou: 14 })],
      "2026-10-01",
      "2026-10-31",
    );
    const dev = dias.flatMap((d) => d.operacoes).find((o) => o.tipo === "devolucao");
    expect(dev?.alerta).toBe("6 peça(s) ainda não voltaram");
  });

  it("NÃO afirma que falta voltar quando nada saiu", () => {
    // Sem saída registrada o sistema não sabe se a peça foi ao evento.
    const dias = montarAgenda([evento()], [reserva()], "2026-10-01", "2026-10-31");
    const dev = dias.flatMap((d) => d.operacoes).find((o) => o.tipo === "devolucao");
    expect(dev?.alerta).toBeNull();
  });

  it("tudo que saiu voltou: sem alerta", () => {
    const dias = montarAgenda(
      [evento()],
      [reserva({ saiu: 20, voltou: 20 })],
      "2026-10-01",
      "2026-10-31",
    );
    const dev = dias.flatMap((d) => d.operacoes).find((o) => o.tipo === "devolucao");
    expect(dev?.alerta).toBeNull();
  });

  it("retirada fora do recorte não aparece — a tela fica fiel ao filtro", () => {
    // A janela cobre a véspera; pedindo só o dia 10, a retirada do dia 9 sai.
    const dias = montarAgenda([evento()], [reserva()], "2026-10-10", "2026-10-10");
    expect(nomes(dias)).not.toContain("retirada");
  });

  it("reserva de OUTRO evento não entra neste", () => {
    const dias = montarAgenda(
      [evento({ _id: "ev1" })],
      [reserva({ eventoId: "ev2" })],
      "2026-10-01",
      "2026-10-31",
    );
    expect(nomes(dias)).not.toContain("retirada");
  });
});

describe("conflito de equipe — só o que os dados sustentam", () => {
  it("mesma pessoa em dois eventos no mesmo dia", () => {
    const dias = montarAgenda(
      [
        evento({ _id: "a", setupTime: "08:00", equipe: [{ nome: "Ana" }, { nome: "Bia" }] }),
        evento({ _id: "b", nome: "Outro", setupTime: "09:00", equipe: [{ nome: "Ana" }] }),
      ],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias[0].equipeEmConflito).toEqual(["Ana"]);
  });

  it("mesma pessoa em dias diferentes NÃO é conflito", () => {
    const dias = montarAgenda(
      [
        evento({ _id: "a", data: "2026-10-10", setupTime: "08:00", equipe: [{ nome: "Ana" }] }),
        evento({ _id: "b", data: "2026-10-11", setupTime: "08:00", equipe: [{ nome: "Ana" }] }),
      ],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias.every((d) => d.equipeEmConflito.length === 0)).toBe(true);
  });

  it("um evento só nunca gera conflito", () => {
    const dias = montarAgenda(
      [evento({ setupTime: "08:00", equipe: [{ nome: "Ana" }] })],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias[0].equipeEmConflito).toEqual([]);
  });

  it("dois eventos no mesmo dia sem pessoa repetida: sem conflito", () => {
    const dias = montarAgenda(
      [
        evento({ _id: "a", setupTime: "08:00", equipe: [{ nome: "Ana" }] }),
        evento({ _id: "b", nome: "Outro", setupTime: "09:00", equipe: [{ nome: "Bia" }] }),
      ],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias[0].equipeEmConflito).toEqual([]);
  });
});

describe("events.date tem DUAS formas válidas — as duas valem pelo dia civil", () => {
  // ── TRAVA DE REGRESSÃO ────────────────────────────────────────────────────
  // `"2026-10-10T18:00" <= "2026-10-10"` é FALSE: a forma com hora é mais
  // longa e ordena depois do limite superior do intervalo. Sem normalizar, o
  // evento de HOJE cadastrado pelo formulário sumia da agenda — o mesmo
  // defeito que lib/dataDoDia.ts documenta ter apagado o evento do dia no
  // Dashboard.

  it("a) evento em YYYY-MM-DD aparece", () => {
    const dias = montarAgenda(
      [evento({ data: "2026-10-10", setupTime: "08:00" })],
      [],
      "2026-10-10",
      "2026-10-10",
    );
    expect(dias).toHaveLength(1);
    expect(dias[0].data).toBe("2026-10-10");
  });

  it("b) evento em YYYY-MM-DDTHH:mm também aparece", () => {
    const dias = montarAgenda(
      [evento({ data: "2026-10-10T18:00", setupTime: "08:00" })],
      [],
      "2026-10-10",
      "2026-10-10",
    );
    expect(dias).toHaveLength(1);
    // Agrupado pelo DIA, não pela string com hora.
    expect(dias[0].data).toBe("2026-10-10");
  });

  it("c) evento de HOJE com hora entra no filtro de um dia só", () => {
    // O caso exato que sumia: `de` e `ate` valem o mesmo dia.
    const hoje = "2026-09-09";
    const dias = montarAgenda(
      [evento({ data: `${hoje}T19:00`, setupTime: "14:00" })],
      [],
      hoje,
      hoje,
    );
    expect(dias).toHaveLength(1);
    expect(dias[0].data).toBe(hoje);
  });

  it("d) evento no ÚLTIMO dia do intervalo, com hora, não é cortado", () => {
    const dias = montarAgenda(
      [evento({ data: "2026-10-31T23:30", setupTime: "20:00" })],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias.map((d) => d.data)).toEqual(["2026-10-31"]);
  });

  it("e) mesmo dia em formas diferentes agrupa num cartão só", () => {
    // Antes, "2026-10-10" e "2026-10-10T18:00" viravam DOIS dias na tela.
    const dias = montarAgenda(
      [
        evento({ _id: "a", data: "2026-10-10", setupTime: "08:00" }),
        evento({ _id: "b", nome: "Outro", data: "2026-10-10T18:00", setupTime: "09:00" }),
      ],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias).toHaveLength(1);
    expect(dias[0].operacoes).toHaveLength(2);
  });

  it("f) evento com hora FORA do intervalo continua de fora", () => {
    // A correção não pode virar um passe livre: o recorte tem que seguir valendo.
    const dias = montarAgenda(
      [evento({ data: "2026-11-01T10:00", setupTime: "08:00" })],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias).toEqual([]);
  });

  it("g) conflito de equipe funciona com as duas formas no mesmo dia", () => {
    // `equipeEmConflito` compara a data do evento com a chave do dia. Sem
    // normalizar as duas pontas, o conflito nunca seria detectado.
    const dias = montarAgenda(
      [
        evento({ _id: "a", data: "2026-10-10", setupTime: "08:00", equipe: [{ nome: "Ana" }] }),
        evento({
          _id: "b",
          nome: "Outro",
          data: "2026-10-10T18:00",
          setupTime: "09:00",
          equipe: [{ nome: "Ana" }],
        }),
      ],
      [],
      "2026-10-01",
      "2026-10-31",
    );
    expect(dias[0].equipeEmConflito).toEqual(["Ana"]);
  });

  it("h) evento SEM briefing e COM hora não some", () => {
    // A linha de fallback também nasce da data normalizada.
    const dias = montarAgenda(
      [evento({ data: "2026-10-10T18:00" })],
      [],
      "2026-10-10",
      "2026-10-10",
    );
    expect(nomes(dias)).toEqual(["evento"]);
    expect(dias[0].data).toBe("2026-10-10");
  });

  it("diaCivil corta a hora e deixa o dia intacto", () => {
    expect(diaCivil("2026-10-10T18:00")).toBe("2026-10-10");
    expect(diaCivil("2026-10-10")).toBe("2026-10-10");
  });
});

describe("a derivação não inventa nada", () => {
  it("todo tipo produzido tem rótulo declarado", () => {
    const dias = montarAgenda(
      [evento({ setupTime: "08:00", ceremonyTime: "16:00" })],
      [{ eventoId: "ev1", inicio: "2026-10-09", fim: "2026-10-11", quantidade: 5 }],
      "2026-10-01",
      "2026-10-31",
    );
    for (const tipo of nomes(dias)) {
      expect(ROTULO_DA_OPERACAO[tipo]).toBeTruthy();
    }
  });

  it("chaves são únicas — a lista do React não colide", () => {
    const dias = montarAgenda(
      [
        evento({ _id: "a", setupTime: "08:00", teardownTime: "23:00" }),
        evento({ _id: "b", nome: "Outro", setupTime: "09:00" }),
      ],
      [{ eventoId: "a", inicio: "2026-10-10", fim: "2026-10-10", quantidade: 5 }],
      "2026-10-01",
      "2026-10-31",
    );
    const chaves = dias.flatMap((d) => d.operacoes.map((o) => o.chave));
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
