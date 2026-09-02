import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  carimboDeAtualizacao,
  comCarimbo,
  descreverUltimaAtualizacao,
  diasDesdeAtualizacao,
  ultimaAtualizacao,
} from "./ultimaAtualizacao";

const AGORA = new Date("2026-09-02T10:00:00.000Z");
const emDias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();

describe("carimbo", () => {
  it("grava a data em ISO", () => {
    expect(carimboDeAtualizacao(AGORA)).toEqual({ updatedAt: "2026-09-02T10:00:00.000Z" });
  });

  it("`comCarimbo` preserva os campos e acrescenta a data", () => {
    expect(comCarimbo({ name: "Rosas", isPurchased: true }, AGORA)).toEqual({
      name: "Rosas",
      isPurchased: true,
      updatedAt: "2026-09-02T10:00:00.000Z",
    });
  });

  it("`comCarimbo` não altera o objeto recebido", () => {
    const campos = { name: "Rosas" };
    comCarimbo(campos, AGORA);
    expect(campos).toEqual({ name: "Rosas" });
  });

  it("um `updatedAt` já presente nos campos é substituído pelo carimbo novo", () => {
    const r = comCarimbo({ updatedAt: "2020-01-01T00:00:00.000Z" }, AGORA);
    expect(r.updatedAt).toBe("2026-09-02T10:00:00.000Z");
  });
});

describe("qual data vale", () => {
  it("`updatedAt` gravado ganha da criação", () => {
    expect(
      ultimaAtualizacao({ updatedAt: emDias(1), _creationTime: AGORA.getTime() - 86_400_000 * 90 }),
    ).toBe(emDias(1));
  });

  it("registro ANTIGO, sem `updatedAt`, cai na criação — que é verdade", () => {
    const criado = Date.UTC(2026, 0, 15, 12);
    expect(ultimaAtualizacao({ _creationTime: criado })).toBe(new Date(criado).toISOString());
  });

  it("`updatedAt` corrompido não derruba a leitura", () => {
    const criado = Date.UTC(2026, 0, 15, 12);
    expect(ultimaAtualizacao({ updatedAt: "ontem de tarde", _creationTime: criado })).toBe(
      new Date(criado).toISOString(),
    );
  });

  it("sem nenhuma das duas, devolve null — nada é inventado", () => {
    expect(ultimaAtualizacao({})).toBeNull();
    expect(ultimaAtualizacao({ updatedAt: "   " })).toBeNull();
  });
});

describe("dias desde a atualização", () => {
  it("conta dias inteiros", () => {
    expect(diasDesdeAtualizacao({ updatedAt: emDias(0) }, AGORA)).toBe(0);
    expect(diasDesdeAtualizacao({ updatedAt: emDias(5) }, AGORA)).toBe(5);
  });

  it("data no FUTURO (relógio adiantado) vira 'hoje', não um número negativo", () => {
    expect(diasDesdeAtualizacao({ updatedAt: emDias(-3) }, AGORA)).toBe(0);
  });

  it("sem data devolve null", () => {
    expect(diasDesdeAtualizacao({}, AGORA)).toBeNull();
  });
});

describe("frase da tela", () => {
  it.each([
    [0, "hoje"],
    [1, "ontem"],
    [5, "há 5 dias"],
    [59, "há 59 dias"],
    [60, "há 2 meses"],
    [400, "há 13 meses"],
    [900, "há 2 anos"],
  ])("%i dias → %s", (dias, esperado) => {
    expect(descreverUltimaAtualizacao({ updatedAt: emDias(dias) }, AGORA)).toBe(esperado);
  });

  it("sem data não escreve 'nunca atualizado' — devolve null", () => {
    // "Nunca atualizado" seria falso para todo registro anterior ao campo.
    expect(descreverUltimaAtualizacao({}, AGORA)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A LINHA QUE NÃO PODE SER CRUZADA
// ─────────────────────────────────────────────────────────────────────────────
describe("mexer no registro NÃO é falar com o cliente", () => {
  it("a regra de follow-up do funil não lê `updatedAt`", () => {
    // Se lesse, arrumar um acento no nome da noiva tiraria o lead da lista de
    // quem precisa de atenção — e a decoradora perderia a venda achando que
    // tinha acabado de conversar.
    const fonte = readFileSync("convex/lib/leadFollowUp.ts", "utf-8");
    expect(fonte).not.toContain("updatedAt");
    expect(fonte).toContain("lastInteraction");
  });

  it("o quadro de atenção também não lê `updatedAt`", () => {
    const fonte = readFileSync("convex/lib/attention.ts", "utf-8");
    expect(fonte).not.toContain("updatedAt");
  });
});

describe("editar o lead não mexe em `lastInteraction`", () => {
  it("o formulário do funil não tem o campo — então nunca o envia", () => {
    // Nome, observação, responsável, estágio: nada disso é conversa com a
    // cliente. Se o formulário mandasse `lastInteraction`, editar um acento
    // zeraria o relógio do follow-up.
    const tela = readFileSync("src/pages/app/funil/page.tsx", "utf-8");
    const i = tela.indexOf("const leadSchema = z.object({");
    expect(i).toBeGreaterThan(-1);
    expect(tela.slice(i, tela.indexOf("});", i))).not.toContain("lastInteraction");
  });

  it("nenhuma tela do funil grava `lastInteraction` de carona", () => {
    const tela = readFileSync("src/pages/app/funil/page.tsx", "utf-8");
    expect(tela).not.toMatch(/lastInteraction:\s*[^)]/);
  });

  it("o carimbo e a data da conversa são campos DIFERENTES no schema", () => {
    const schema = readFileSync("convex/schema.ts", "utf-8");
    const i = schema.indexOf("leads: defineTable({");
    const corpo = schema.slice(i, schema.indexOf("briefings: defineTable({", i));
    expect(corpo).toContain("lastInteraction");
    expect(corpo).toContain("updatedAt");
  });
});

describe("as mutations carimbam de verdade", () => {
  it.each([
    ["convex/events.ts", ["export const update ="]],
    ["convex/funil.ts", ["export const updateLead ="]],
    ["convex/purchases.ts", ["export const updatePurchase =", "export const setPurchaseStatus ="]],
  ])("%s carimba nas mutations de edição", (arquivo, funcoes) => {
    const fonte = readFileSync(arquivo, "utf-8");
    for (const fn of funcoes) {
      const i = fonte.indexOf(fn);
      expect(i, `${arquivo}: ${fn} não existe mais`).toBeGreaterThan(-1);
      const corpo = fonte.slice(i, fonte.indexOf("\nexport ", i + 1));
      expect(corpo, `${arquivo}: ${fn} altera o registro sem carimbar`).toContain("comCarimbo");
    }
  });

  it("nenhuma mutation monta a data à mão em vez de usar o helper", () => {
    // Foi assim que `assemblyItems` e `layoutRenders` acabaram com formatos
    // ligeiramente diferentes para a mesma ideia.
    for (const arquivo of ["convex/events.ts", "convex/funil.ts", "convex/purchases.ts"]) {
      const fonte = readFileSync(arquivo, "utf-8");
      expect(fonte, `${arquivo} monta updatedAt à mão`).not.toMatch(
        /updatedAt:\s*new Date\(\)\.toISOString\(\)/,
      );
    }
  });
});
