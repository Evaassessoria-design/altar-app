import { describe, expect, it } from "vitest";
import { checklistProgress, sortChecklistItems } from "./checklist";

const item = (id: string, order: number, isChecked = false) => ({
  _id: id,
  name: id,
  order,
  isChecked,
});

describe("sortChecklistItems", () => {
  it("coloca os PENDENTES primeiro — é o que interessa a quem está conferindo", () => {
    const lista = [item("a", 0, true), item("b", 1), item("c", 2, true), item("d", 3)];
    expect(sortChecklistItems(lista).map((i) => i._id)).toEqual(["b", "d", "a", "c"]);
  });

  it("preserva a ordem de cadastro dentro de cada grupo", () => {
    const lista = [item("z", 5), item("a", 1), item("m", 3)];
    expect(sortChecklistItems(lista).map((i) => i._id)).toEqual(["a", "m", "z"]);
  });

  it("não altera o array recebido", () => {
    const lista = [item("a", 1, true), item("b", 0)];
    const copia = [...lista];
    sortChecklistItems(lista);
    expect(lista).toEqual(copia);
  });

  it("lista vazia não quebra", () => {
    expect(sortChecklistItems([])).toEqual([]);
  });
});

describe("checklistProgress", () => {
  it("conta o que existe, sem arredondar para cima", () => {
    const p = checklistProgress([item("a", 0, true), item("b", 1), item("c", 2)]);
    expect(p).toEqual({
      total: 3,
      concluidos: 1,
      pendentes: 2,
      percentual: 33,
      completo: false,
    });
  });

  it("lista vazia é 0%, nunca NaN", () => {
    // Divisão por zero aqui viraria "NaN%" na barra de progresso.
    const p = checklistProgress([]);
    expect(p.percentual).toBe(0);
    expect(Number.isNaN(p.percentual)).toBe(false);
    expect(p.completo).toBe(false);
  });

  it("tudo marcado é 100% e completo", () => {
    const p = checklistProgress([item("a", 0, true), item("b", 1, true)]);
    expect(p.percentual).toBe(100);
    expect(p.completo).toBe(true);
  });

  it("lista vazia NÃO conta como completa", () => {
    // Sem isto, um checklist recém-criado exibiria "Tudo conferido!".
    expect(checklistProgress([]).completo).toBe(false);
  });
});
