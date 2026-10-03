import { describe, expect, it } from "vitest";
import { linhasDoItem, type ItemNaTela } from "./acervo-na-tela.ts";

// ═════════════════════════════════════════════════════════════════════════════
// "28 PRONTAS" — E QUATRO DELAS ESTAVAM NA FAZENDA
//
// B7 da auditoria de 30/09: a lista do acervo mostrava `condicoes.pronto` como
// número de destaque. Ele conta peça PRONTA que está FORA, num evento que não
// devolveu. A decoradora lia 28, ia carregar o caminhão e encontrava 24.
//
// O backend já sabia a diferença desde a rodada do PC da Eva
// (`lib/logisticaDoAcervo.ts`). Nenhuma tela lia.
// ═════════════════════════════════════════════════════════════════════════════

const un = (u: string) => (u === "unidade" ? "un" : u);
const dia = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

/** Castiçal dourado: 40 no total, 4 fora num evento, 2 para limpar, 1 em reparo. */
function castical(sobrescrever: Partial<ItemNaTela> = {}): ItemNaTela {
  return {
    unidade: "unidade",
    quantidadeTotal: 40,
    condicoes: {
      pronto: 32, limpeza: 2, reparo: 1, indisponivel: 0, conferencia: 0, foraDeUso: 3,
    },
    logistica: {
      noGalpao: 36, fora: 4, prontasNoGalpao: 28, reservadoAFrente: 30, eventosAFrente: 3,
    },
    pico: { deficit: 0, pico: 30, dia: null },
    ...sobrescrever,
  };
}

const textos = (i: ItemNaTela) => linhasDoItem(i, un, dia).map((l) => l.texto);
const porChave = (i: ItemNaTela, chave: string) =>
  linhasDoItem(i, un, dia).find((l) => l.chave === chave);

describe("o número de destaque é o que pode ir para o caminhão", () => {
  it("diz `prontasNoGalpao`, não `condicoes.pronto`", () => {
    const i = castical();
    // 32 estão prontas; 28 estão prontas E no galpão. A tela dizia 32.
    expect(porChave(i, "prontas")?.texto).toBe("28 un prontas no galpão");
    expect(textos(i).join(" ")).not.toContain("32");
  });

  it("e aparece mesmo quando é ZERO — é o que impede uma promessa errada", () => {
    const i = castical({
      logistica: { noGalpao: 0, fora: 40, prontasNoGalpao: 0, reservadoAFrente: 40, eventosAFrente: 2 },
    });
    expect(porChave(i, "prontas")?.texto).toBe("0 un prontas no galpão");
  });

  it("o destaque é o primeiro, sempre", () => {
    expect(linhasDoItem(castical(), un, dia)[0]?.chave).toBe("prontas");
  });
});

describe("os dois eixos convivem sem se somar", () => {
  it("lugar e condição têm rótulos próprios na linha de atenção", () => {
    expect(porChave(castical(), "atencao")?.texto).toBe("4 fora · 2 para limpar · 1 em reparo");
  });

  it("nenhuma linha apresenta um TOTAL que misture os dois", () => {
    // 4 fora + 2 limpar + 1 reparo = 7, e esse 7 não significa nada.
    const juntos = textos(castical()).join(" ");
    expect(juntos).not.toMatch(/\b7\b/);
  });

  it("item inteiro e no galpão não ganha linha de atenção", () => {
    const i = castical({
      condicoes: { pronto: 40, limpeza: 0, reparo: 0, indisponivel: 0, conferencia: 0, foraDeUso: 0 },
      logistica: { noGalpao: 40, fora: 0, prontasNoGalpao: 40, reservadoAFrente: 0, eventosAFrente: 0 },
    });
    expect(porChave(i, "atencao")).toBeUndefined();
    // E sobra uma linha só: nada a avisar é nada escrito.
    expect(linhasDoItem(i, un, dia)).toHaveLength(1);
  });

  it("peça fora, mas toda pronta, ainda avisa que está fora", () => {
    const i = castical({
      condicoes: { pronto: 40, limpeza: 0, reparo: 0, indisponivel: 0, conferencia: 0, foraDeUso: 0 },
      logistica: { noGalpao: 34, fora: 6, prontasNoGalpao: 34, reservadoAFrente: 6, eventosAFrente: 1 },
    });
    expect(porChave(i, "atencao")?.texto).toBe("6 fora");
  });

  it("em conferência aparece — é «voltou, ninguém olhou ainda»", () => {
    const i = castical({
      condicoes: { pronto: 36, limpeza: 0, reparo: 0, indisponivel: 0, conferencia: 4, foraDeUso: 4 },
      logistica: { noGalpao: 40, fora: 0, prontasNoGalpao: 36, reservadoAFrente: 0, eventosAFrente: 0 },
    });
    expect(porChave(i, "atencao")?.texto).toBe("4 em conferência");
  });
});

describe("o déficit vence a contagem de reservas", () => {
  it("quando falta peça num dia, é ISSO que a terceira linha diz", () => {
    const i = castical({ pico: { deficit: 6, pico: 46, dia: "2026-10-12" } });
    expect(porChave(i, "deficit")?.texto).toBe(
      "Faltam 6 un em 12/10 — 46 prometidas, 40 no acervo, 3 fora de uso",
    );
    // E a contagem de reservas NÃO aparece também: seria a quarta linha, e a
    // quarta ninguém lê.
    expect(porChave(i, "reservado")).toBeUndefined();
  });

  it("sem déficit, mostra o que está prometido adiante", () => {
    expect(porChave(castical(), "reservado")?.texto).toBe("30 un reservadas em 3 eventos");
  });

  it("um evento só não vira «1 eventos»", () => {
    const i = castical({
      logistica: { noGalpao: 36, fora: 4, prontasNoGalpao: 28, reservadoAFrente: 10, eventosAFrente: 1 },
    });
    expect(porChave(i, "reservado")?.texto).toBe("10 un reservadas em 1 evento");
  });

  it("nada prometido e nada faltando: nenhuma terceira linha", () => {
    const i = castical({
      logistica: { noGalpao: 36, fora: 4, prontasNoGalpao: 28, reservadoAFrente: 0, eventosAFrente: 0 },
    });
    expect(porChave(i, "reservado")).toBeUndefined();
    expect(porChave(i, "deficit")).toBeUndefined();
  });

  it("déficit sem dia não é afirmado — a tela não diz o que não sabe", () => {
    const i = castical({ pico: { deficit: 6, pico: 46, dia: null } });
    expect(porChave(i, "deficit")).toBeUndefined();
  });
});

describe("no máximo três linhas, em pé no galpão", () => {
  it("o pior caso continua cabendo", () => {
    const i = castical({
      condicoes: { pronto: 20, limpeza: 5, reparo: 4, indisponivel: 3, conferencia: 2, foraDeUso: 14 },
      pico: { deficit: 6, pico: 46, dia: "2026-10-12" },
    });
    expect(linhasDoItem(i, un, dia)).toHaveLength(3);
  });
});
