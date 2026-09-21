import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prazoDoEvento } from "./prazo-do-evento.ts";

// ═════════════════════════════════════════════════════════════════════════════
// "EM -3 DIAS"
//
// O painel "Precisam da sua atenção" mostra evento que JÁ ACONTECEU — é dele
// que nasce a pergunta "a peça voltou?". A etiqueta era `em ${dias} dias`, e
// com `diasAte` negativo escrevia "em -3 dias", justamente no alerta mais
// valioso do produto: o casamento de sábado cujas peças ninguém conferiu.
// ═════════════════════════════════════════════════════════════════════════════

describe("o evento que já passou", () => {
  it("nunca escreve número negativo", () => {
    for (const dias of [-1, -2, -3, -15, -30]) {
      expect(prazoDoEvento(dias).texto, `dias=${dias}`).not.toMatch(/-/);
    }
  });

  it.each([
    [-1, "foi ontem"],
    [-2, "há 2 dias"],
    [-3, "há 3 dias"],
    [-30, "há 30 dias"],
  ])("%s → %s", (dias, esperado) => {
    expect(prazoDoEvento(dias).texto).toBe(esperado);
  });

  it("é lido como PASSADO, não como 'atenção'", () => {
    // A cor vinha de `nivel`, que só é urgente para evento nos próximos 7
    // dias — então o casamento de sábado saía no mesmo âmbar de um que ainda
    // vai acontecer. Passado não é atenção: é cobrança.
    expect(prazoDoEvento(-3).tom).toBe("passado");
    expect(prazoDoEvento(-1).tom).toBe("passado");
  });
});

describe("o evento que ainda vem", () => {
  it.each([
    [0, "é hoje"],
    [1, "amanhã"],
    [2, "em 2 dias"],
    [45, "em 45 dias"],
  ])("%s → %s", (dias, esperado) => {
    expect(prazoDoEvento(dias).texto).toBe(esperado);
  });

  it("singular e plural", () => {
    // "em 1 dias" é o tipo de detalhe que faz a tela parecer amadora.
    expect(prazoDoEvento(1).texto).toBe("amanhã");
    expect(prazoDoEvento(2).texto).toBe("em 2 dias");
    expect(prazoDoEvento(-1).texto).toBe("foi ontem");
    expect(prazoDoEvento(-2).texto).toBe("há 2 dias");
  });

  it("até sete dias é PRÓXIMO; depois disso é distante", () => {
    // Mesmo corte de `JANELA_URGENTE_DIAS` em convex/lib/attention.ts.
    expect(prazoDoEvento(7).tom).toBe("proximo");
    expect(prazoDoEvento(8).tom).toBe("distante");
  });

  it("hoje tem tom próprio — é o único dia em que não dá para adiar", () => {
    expect(prazoDoEvento(0).tom).toBe("hoje");
  });
});

describe("data que o sistema não entende", () => {
  it("NaN vira 'sem data', não 'em NaN dias'", () => {
    // `diasEntre` devolve NaN para data corrompida. A tela não afirma o que
    // não sabe.
    expect(prazoDoEvento(NaN).texto).toBe("sem data");
    expect(prazoDoEvento(Infinity).texto).toBe("sem data");
  });
});

describe("o painel usa esta regra", () => {
  it("não sobrou conta de dias dentro do componente", () => {
    const fonte = readFileSync("src/components/attention-board.tsx", "utf-8");
    expect(fonte).toContain("prazoDoEvento(");
    expect(fonte).not.toMatch(/`em \$\{[^}]*\} dias`/);
  });
});
