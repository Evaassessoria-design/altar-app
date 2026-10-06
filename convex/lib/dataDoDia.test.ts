import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  dataDoDia,
  dataDoDiaNoFuso,
  fusoDoNegocio,
  FUSO_PADRAO_DO_NEGOCIO,
  dataEmDias,
  faixaDoMes,
  primeiroDiaDoMes,
  ultimoDiaDoMes,
} from "./dataDoDia";

const TARDE = new Date("2026-09-02T14:33:00.000Z");

describe("o defeito que este módulo impede", () => {
  it("um evento de HOJE conta como próximo", () => {
    // Com `new Date().toISOString()`, "2026-09-02" >= "2026-09-02T14:33:…" era
    // FALSE: o evento sumia do Dashboard no dia em que acontecia.
    expect("2026-09-02" >= dataDoDia(TARDE)).toBe(true);
    expect("2026-09-02" >= TARDE.toISOString()).toBe(false); // o comportamento antigo
  });

  it("um lançamento do dia 1º conta no mês", () => {
    expect("2026-09-01" >= primeiroDiaDoMes(TARDE)).toBe(true);
  });

  it("o de ontem continua de fora", () => {
    expect("2026-09-01" >= dataDoDia(TARDE)).toBe(false);
  });
});

describe("dataDoDia", () => {
  it("devolve sempre 10 caracteres", () => {
    expect(dataDoDia(TARDE)).toBe("2026-09-02");
    expect(dataDoDia(TARDE)).toHaveLength(10);
  });

  it("é estável ao longo do dia — meia-noite e quase meia-noite dão o mesmo", () => {
    expect(dataDoDia(new Date("2026-09-02T00:00:00.000Z"))).toBe("2026-09-02");
    expect(dataDoDia(new Date("2026-09-02T23:59:59.999Z"))).toBe("2026-09-02");
  });
});

describe("dataEmDias", () => {
  it("anda para frente e para trás", () => {
    expect(dataEmDias(30, TARDE)).toBe("2026-10-02");
    expect(dataEmDias(-1, TARDE)).toBe("2026-09-01");
    expect(dataEmDias(0, TARDE)).toBe("2026-09-02");
  });

  it("atravessa a virada do ano", () => {
    expect(dataEmDias(1, new Date("2026-12-31T20:00:00.000Z"))).toBe("2027-01-01");
  });
});

describe("mês", () => {
  it("primeiro e último dia", () => {
    expect(primeiroDiaDoMes(TARDE)).toBe("2026-09-01");
    expect(ultimoDiaDoMes(TARDE)).toBe("2026-09-30");
  });

  it("fevereiro bissexto", () => {
    expect(ultimoDiaDoMes(new Date("2028-02-10T12:00:00.000Z"))).toBe("2028-02-29");
  });

  it("fevereiro comum", () => {
    expect(ultimoDiaDoMes(new Date("2026-02-10T12:00:00.000Z"))).toBe("2026-02-28");
  });

  it("dezembro não vaza para janeiro", () => {
    expect(ultimoDiaDoMes(new Date("2026-12-05T12:00:00.000Z"))).toBe("2026-12-31");
  });

  it("faixaDoMes anda para trás sem errar o ano", () => {
    const f = faixaDoMes(-9, TARDE); // set/2026 - 9 = dez/2025
    expect(f.inicio).toBe("2025-12-01");
    expect(f.fim).toBe("2025-12-31");
  });

  it("a faixa cobre o mês inteiro, do dia 1 ao último", () => {
    const f = faixaDoMes(0, TARDE);
    expect("2026-09-01" >= f.inicio && "2026-09-01" <= f.fim).toBe(true);
    expect("2026-09-30" >= f.inicio && "2026-09-30" <= f.fim).toBe(true);
    expect("2026-10-01" <= f.fim).toBe(false);
  });
});

describe("nenhuma consulta volta a comparar dia com instante", () => {
  it.each(["convex/dashboard.ts", "convex/events.ts", "convex/health.ts"])(
    "%s não compara `date` com um ISO completo",
    (arquivo) => {
      const fonte = readFileSync(arquivo, "utf-8");
      // `new Date(...).toISOString()` sem cortar em 10 caracteres, comparado
      // com um campo `date`, é exatamente o defeito voltando.
      expect(fonte).not.toMatch(/const nowIso = .*toISOString\(\);/);
      expect(fonte).not.toMatch(/e\.date >= nowIso/);
      expect(fonte).not.toMatch(/date >= .*toISOString\(\)/);
    },
  );

  it("a data de hoje existe UMA vez no backend, não montada à mão em cada consulta", () => {
    // `${ano}-${mes}-${dia}` repetido em cada arquivo foi como o Dashboard e o
    // Financeiro acabaram discordando sobre onde um mês começa.
    for (const arquivo of [
      "convex/dashboard.ts",
      "convex/purchases.ts",
      "convex/health.ts",
      "convex/funil.ts",
    ]) {
      const fonte = readFileSync(arquivo, "utf-8");
      expect(fonte, `${arquivo} monta a data à mão`).not.toMatch(
        /getMonth\(\) \+ 1\)\.toString\(\)|String\(.*getMonth\(\) \+ 1\)\.padStart/,
      );
    }
  });

  it("o front também tem uma fonte só para 'hoje'", () => {
    for (const arquivo of [
      "src/pages/app/compras/page.tsx",
      "src/pages/app/compras/_components/painel-de-compras.tsx",
    ]) {
      const fonte = readFileSync(arquivo, "utf-8");
      expect(fonte).toContain("hojeDateKey");
      expect(fonte, `${arquivo} redeclara hojeISO`).not.toMatch(/function hojeISO/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// "HOJE" NO FUSO DO NEGÓCIO — PERTO DA MEIA-NOITE
// ─────────────────────────────────────────────────────────────────────────────

describe("dataDoDiaNoFuso — a virada do dia é a de Brasília, não a do UTC", () => {
  it.each([
    // instante UTC              dia em Brasília (UTC−3)
    ["2026-10-06T02:59:59Z", "2026-10-05"], // 23:59:59 do dia 5 em Brasília
    ["2026-10-06T03:00:00Z", "2026-10-06"], // 00:00:00 do dia 6 em Brasília
    ["2026-10-06T23:59:59Z", "2026-10-06"], // 20:59 em Brasília — UTC já "virou"? não
    ["2026-10-07T00:30:00Z", "2026-10-06"], // 21:30 em Brasília: UTC já é dia 7
    ["2026-10-07T02:59:00Z", "2026-10-06"], // 23:59 em Brasília
    ["2027-01-01T02:59:59Z", "2026-12-31"], // virada de ano
    ["2028-03-01T02:30:00Z", "2028-02-29"], // bissexto
  ])("%s → %s", (instante, dia) => {
    expect(dataDoDiaNoFuso(new Date(instante), "America/Sao_Paulo")).toBe(dia);
  });

  it("às 21h30 de Brasília, o UTC já diz amanhã — e o negócio não", () => {
    const agora = new Date("2026-10-07T00:30:00Z");
    expect(agora.toISOString().slice(0, 10)).toBe("2026-10-07");
    expect(dataDoDiaNoFuso(agora)).toBe("2026-10-06");
  });

  it("respeita o fuso escolhido pela conta", () => {
    // 01:30 UTC = 21:30 em Manaus (UTC−4) do dia anterior; 22:30 em Brasília.
    expect(dataDoDiaNoFuso(new Date("2026-10-07T01:30:00Z"), "America/Manaus")).toBe("2026-10-06");
    expect(dataDoDiaNoFuso(new Date("2026-10-07T03:30:00Z"), "America/Manaus")).toBe("2026-10-06");
    expect(dataDoDiaNoFuso(new Date("2026-10-07T04:00:00Z"), "America/Manaus")).toBe("2026-10-07");
  });

  it("fuso ausente ou inválido cai em America/Sao_Paulo", () => {
    expect(fusoDoNegocio(undefined)).toBe(FUSO_PADRAO_DO_NEGOCIO);
    expect(fusoDoNegocio("")).toBe(FUSO_PADRAO_DO_NEGOCIO);
    expect(fusoDoNegocio("Marte/Base")).toBe(FUSO_PADRAO_DO_NEGOCIO);
    expect(dataDoDiaNoFuso(new Date("2026-10-07T00:30:00Z"), "Marte/Base")).toBe("2026-10-06");
  });
});
