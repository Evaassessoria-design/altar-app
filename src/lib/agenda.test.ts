import { describe, expect, it } from "vitest";
import { buildAgenda, parseTime } from "./agenda";

// ─────────────────────────────────────────────────────────────────────────────
// A agenda consolida dados REAIS do evento. Estes testes garantem duas coisas:
//
//  1. nada é inventado — sem horário na origem, não aparece item;
//  2. o agrupamento por horário funciona, que foi o pedido explícito
//     ("evite repetir 09:30 várias vezes").
// ─────────────────────────────────────────────────────────────────────────────

describe("parseTime — entende o que a decoradora escreveu", () => {
  it.each([
    ["09:30", "09:30"],
    ["9:30", "09:30"],
    ["09h30", "09:30"],
    ["9h30", "09:30"],
    ["16h", "16:00"],
    ["8h", "08:00"],
    ["23:59", "23:59"],
    ["16", "16:00"],
    ["  09:30  ", "09:30"],
  ])("lê %s como %s", (entrada, esperado) => {
    expect(parseTime(entrada)).toBe(esperado);
  });

  it("descarta o que não dá para entender com segurança", () => {
    // Um horário mal interpretado entra na ordem errada e engana. Melhor não
    // mostrar — o texto original continua visível no briefing.
    for (const ruim of ["", "  ", "de manhã", "a combinar", "12 mesas", "25:00", "9:99"]) {
      expect(parseTime(ruim), `"${ruim}" não deveria virar horário`).toBeNull();
    }
  });

  it("aceita ausência sem quebrar", () => {
    expect(parseTime(undefined)).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
});

describe("buildAgenda — o dia do evento", () => {
  it("monta a linha do tempo em ordem cronológica", () => {
    const agenda = buildAgenda({
      briefing: {
        setupTime: "08:00",
        ceremonyTime: "16:00",
        receptionTime: "18:00",
        teardownTime: "23:00",
      },
      team: [],
      suppliers: [],
    });

    expect(agenda.onTheDay.map((e) => `${e.time} ${e.title}`)).toEqual([
      "08:00 Montagem",
      "16:00 Cerimônia",
      "18:00 Recepção",
      "23:00 Desmontagem",
    ]);
  });

  it("ordena mesmo quando o briefing foi preenchido fora de ordem", () => {
    const agenda = buildAgenda({
      briefing: { teardownTime: "23h", setupTime: "8h", ceremonyTime: "16h" },
      team: [],
      suppliers: [],
    });
    expect(agenda.onTheDay.map((e) => e.time)).toEqual(["08:00", "16:00", "23:00"]);
  });

  it("AGRUPA as pessoas escaladas no mesmo horário", () => {
    // O pedido explícito: um "09:30" só, com as três pessoas embaixo.
    const agenda = buildAgenda({
      briefing: null,
      team: [
        { scheduledTime: "09:30", member: { name: "Marina", role: "Montagem" } },
        { scheduledTime: "09:30", member: { name: "João", role: "Florista" } },
        { scheduledTime: "09:30", member: { name: "Carlos", role: "Produção" } },
      ],
      suppliers: [],
    });

    expect(agenda.onTheDay).toHaveLength(1);
    expect(agenda.onTheDay[0]).toMatchObject({
      time: "09:30",
      title: "Chegada da equipe",
      origin: "equipe",
    });
    expect(agenda.onTheDay[0].people?.map((p) => p.name)).toEqual(["Carlos", "João", "Marina"]);
  });

  it("separa horários diferentes da equipe", () => {
    const agenda = buildAgenda({
      briefing: null,
      team: [
        { scheduledTime: "09:30", member: { name: "Marina", role: "Montagem" } },
        { scheduledTime: "14:00", member: { name: "Carlos", role: "Produção" } },
      ],
      suppliers: [],
    });
    expect(agenda.onTheDay).toHaveLength(2);
    expect(agenda.onTheDay.map((e) => e.time)).toEqual(["09:30", "14:00"]);
  });

  it("intercala equipe e briefing na ordem certa", () => {
    const agenda = buildAgenda({
      briefing: { setupTime: "08:00", ceremonyTime: "16:00" },
      team: [{ scheduledTime: "09:30", member: { name: "Marina" } }],
      suppliers: [],
    });
    expect(agenda.onTheDay.map((e) => `${e.time} ${e.title}`)).toEqual([
      "08:00 Montagem",
      "09:30 Chegada da equipe",
      "16:00 Cerimônia",
    ]);
  });

  it("no mesmo horário, montagem vem antes da chegada da equipe", () => {
    const agenda = buildAgenda({
      briefing: { setupTime: "08:00" },
      team: [{ scheduledTime: "08:00", member: { name: "Marina" } }],
      suppliers: [],
    });
    expect(agenda.onTheDay.map((e) => e.title)).toEqual(["Montagem", "Chegada da equipe"]);
  });

  it("ignora quem está escalado sem horário definido", () => {
    // A pessoa continua aparecendo na seção Equipe do Evento; só não entra na
    // linha do tempo, porque não há onde colocá-la.
    const agenda = buildAgenda({
      briefing: null,
      team: [
        { scheduledTime: undefined, member: { name: "Sem horário" } },
        { scheduledTime: "10:00", member: { name: "Com horário" } },
      ],
      suppliers: [],
    });
    expect(agenda.onTheDay).toHaveLength(1);
    expect(agenda.onTheDay[0].people?.[0].name).toBe("Com horário");
  });

  it("preserva a origem de cada item", () => {
    const agenda = buildAgenda({
      briefing: { setupTime: "08:00" },
      team: [{ scheduledTime: "09:00", member: { name: "Marina" } }],
      suppliers: [],
    });
    expect(agenda.onTheDay[0].origin).toBe("briefing");
    expect(agenda.onTheDay[1].origin).toBe("equipe");
  });
});

describe("buildAgenda — antes do evento", () => {
  it("reúne os alinhamentos de todos os fornecedores, por data", () => {
    const agenda = buildAgenda({
      briefing: null,
      team: [],
      suppliers: [
        {
          companyName: "Buffet Silva",
          alignments: [
            { date: "2026-11-20", note: "Degustação" },
            { date: "2026-10-05", note: "Primeira reunião" },
          ],
        },
        {
          companyName: "Flores & Cia",
          alignments: [{ date: "2026-11-01", note: "Aprovação do arranjo", by: "Eva" }],
        },
      ],
    });

    expect(agenda.before.map((a) => `${a.date} ${a.supplierName}`)).toEqual([
      "2026-10-05 Buffet Silva",
      "2026-11-01 Flores & Cia",
      "2026-11-20 Buffet Silva",
    ]);
    expect(agenda.before[1].by).toBe("Eva");
  });

  it("fica vazio quando não há alinhamento — a área nem aparece", () => {
    const agenda = buildAgenda({
      briefing: { setupTime: "08:00" },
      team: [],
      suppliers: [{ companyName: "Sem alinhamento" }],
    });
    expect(agenda.before).toEqual([]);
    expect(agenda.isEmpty).toBe(false); // tem o dia do evento
  });

  it("descarta alinhamento sem data", () => {
    const agenda = buildAgenda({
      briefing: null,
      team: [],
      suppliers: [{ companyName: "X", alignments: [{ date: "", note: "sem data" }] }],
    });
    expect(agenda.before).toEqual([]);
  });
});

describe("buildAgenda — estado vazio e ausências", () => {
  it("marca isEmpty quando não há absolutamente nada", () => {
    const agenda = buildAgenda({ briefing: null, team: [], suppliers: [] });
    expect(agenda.isEmpty).toBe(true);
    expect(agenda.onTheDay).toEqual([]);
    expect(agenda.before).toEqual([]);
  });

  it("aguenta tudo indefinido (telas ainda carregando)", () => {
    const agenda = buildAgenda({ briefing: undefined, team: undefined, suppliers: undefined });
    expect(agenda.isEmpty).toBe(true);
  });

  it("um briefing com horários ilegíveis é o mesmo que vazio", () => {
    const agenda = buildAgenda({
      briefing: { setupTime: "a combinar", ceremonyTime: "de tarde" },
      team: [],
      suppliers: [],
    });
    expect(agenda.isEmpty).toBe(true);
  });

  it("NÃO inventa nada: sem dado de entrada, nenhum item de saída", () => {
    // Trava contra a tentação de "preencher" a agenda com exemplos.
    const agenda = buildAgenda({ briefing: {}, team: [], suppliers: [] });
    expect(agenda.onTheDay).toHaveLength(0);
    expect(agenda.before).toHaveLength(0);
  });
});
