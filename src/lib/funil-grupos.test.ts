import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  desfecho,
  etapaAoCriarNoGrupo,
  etapaAoSoltarNoGrupo,
  GRUPOS,
  grupoDaEtapa,
  visaoDaUrl,
  type Etapa,
} from "./funil-grupos.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O FUNIL EM QUATRO GRUPOS É UMA VISÃO — E NÃO PODE PERDER LEAD
//
// O risco de agrupar é silencioso: uma etapa sem grupo some do quadro, e o
// lead continua no banco sem aparecer em lugar nenhum. Este arquivo lê as
// etapas do SCHEMA, não de uma lista redigitada aqui.
// ─────────────────────────────────────────────────────────────────────────────

/** As etapas que o schema aceita, lidas do validador `leadStage`. */
function etapasDoSchema(): string[] {
  const fonte = readFileSync("convex/schema.ts", "utf-8");
  const i = fonte.indexOf("const leadStage");
  const fim = fonte.indexOf(");", i);
  return [...fonte.slice(i, fim).matchAll(/v\.literal\("([a-z_]+)"\)/g)].map((m) => m[1]);
}

describe("toda etapa tem exatamente um grupo", () => {
  const etapas = etapasDoSchema();

  it("o schema tem as sete etapas que a tela conhece", () => {
    expect(etapas).toHaveLength(7);
  });

  it.each(etapas)("%s cai em um grupo, e um só", (etapa) => {
    const donos = GRUPOS.filter((g) => g.etapas.includes(etapa as Etapa));
    expect(donos).toHaveLength(1);
    expect(grupoDaEtapa(etapa as Etapa)).toBe(donos[0]);
  });

  it("nenhum grupo cita etapa que o schema não tem", () => {
    for (const g of GRUPOS) for (const e of g.etapas) expect(etapas).toContain(e);
  });
});

describe("desfecho não se mistura com oportunidade ativa", () => {
  it("ganho e perdido moram só em Fechamento, que não é ativo", () => {
    expect(grupoDaEtapa("contracted").id).toBe("fechamento");
    expect(grupoDaEtapa("discarded").id).toBe("fechamento");
    expect(grupoDaEtapa("contracted").ativo).toBe(false);
  });

  it("os grupos ativos não contêm nenhum desfecho", () => {
    for (const g of GRUPOS.filter((x) => x.ativo)) {
      for (const e of g.etapas) expect(desfecho(e)).toBeNull();
    }
  });

  it("negociação é oportunidade ativa, não fechamento", () => {
    expect(grupoDaEtapa("negotiating").id).toBe("proposta");
  });

  it("ganho e perdido são desfechos distintos", () => {
    expect(desfecho("contracted")).toBe("ganho");
    expect(desfecho("discarded")).toBe("perdido");
  });
});

describe("a visão agrupada não escolhe etapa por conta própria", () => {
  it("soltar na coluna de grupo com UMA etapa vai para ela", () => {
    expect(etapaAoSoltarNoGrupo(grupoDaEtapa("contact"))).toBe("contact");
  });

  it.each(["atendimento", "proposta", "fechamento"] as const)(
    "soltar na coluna %s é ambíguo — não move",
    (id) => {
      const g = GRUPOS.find((x) => x.id === id)!;
      expect(g.etapas.length).toBeGreaterThan(1);
      expect(etapaAoSoltarNoGrupo(g)).toBeNull();
    },
  );

  it("criar pelo grupo começa na primeira etapa, e nunca num desfecho", () => {
    expect(etapaAoCriarNoGrupo(grupoDaEtapa("meeting"))).toBe("contacted");
    expect(etapaAoCriarNoGrupo(grupoDaEtapa("negotiating"))).toBe("quote_sent");
    expect(etapaAoCriarNoGrupo(grupoDaEtapa("contracted"))).toBeNull();
  });
});

describe("a visão vem da URL", () => {
  it("ausente ou desconhecida = grupos; 'etapas' = as sete", () => {
    expect(visaoDaUrl(null)).toBe("grupos");
    expect(visaoDaUrl("qualquer")).toBe("grupos");
    expect(visaoDaUrl("etapas")).toBe("etapas");
  });
});
