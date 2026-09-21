import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { motivoDaListaVazia } from "./lista-vazia.ts";

// ═════════════════════════════════════════════════════════════════════════════
// "VOCÊ NÃO TEM NADA" DITO A QUEM TEM 200 LANÇAMENTOS
//
// Financeiro, Orçamento e Compras tratavam "não há nada" e "o filtro escondeu
// tudo" como o mesmo estado. No Orçamento a contradição ficava na MESMA tela:
// a aba "Todos" exibia o número 12 logo acima de "Nenhum item ainda".
// ═════════════════════════════════════════════════════════════════════════════

describe("o motivo de uma lista vazia", () => {
  it("não há motivo quando há o que mostrar", () => {
    expect(motivoDaListaVazia(12, 12)).toBeNull();
    expect(motivoDaListaVazia(12, 1)).toBeNull();
  });

  it("conta nova: é hora de convidar", () => {
    expect(motivoDaListaVazia(0, 0)).toBe("sem_dados");
  });

  it("tem dados e o recorte não devolveu nada: é o filtro", () => {
    expect(motivoDaListaVazia(200, 0)).toBe("filtro");
    expect(motivoDaListaVazia(1, 0)).toBe("filtro");
  });
});

describe("as três telas param de afirmar o que sabem ser falso", () => {
  const TELAS = [
    ["src/pages/app/financeiro/page.tsx", "Financeiro"],
    ["src/pages/app/events/[id]/orcamento/page.tsx", "Orçamento"],
    ["src/pages/app/compras/page.tsx", "Compras"],
  ] as const;

  it.each(TELAS)("%s usa a regra única", (arquivo) => {
    expect(readFileSync(arquivo, "utf-8")).toContain("motivoDaListaVazia");
  });

  it.each(TELAS)("%s oferece limpar o filtro em vez de mandar cadastrar", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    // Sem a saída, o estado é um beco: a tela diz que o recorte está vazio e
    // não dá o caminho de volta para o que ela realmente tem.
    expect(fonte).toMatch(/filtro/);
    expect(fonte).toMatch(/Ver tod|Limpar filtro/i);
  });
});
