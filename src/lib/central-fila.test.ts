import { describe, expect, it } from "vitest";
import {
  ordenarFila,
  rotuloDaConfianca,
  ROTULO_DA_CATEGORIA,
  ROTULO_DO_DEPARTAMENTO,
  type ItemDaFila,
  type Prioridade,
} from "./central-fila";

function item(
  _id: string,
  over: {
    criadoEm?: number;
    prioridade?: Prioridade;
    escalada?: boolean;
    expirada?: boolean;
  } = {},
): ItemDaFila {
  return {
    _id,
    criadoEm: over.criadoEm ?? 1000,
    expirada: over.expirada,
    conversa: {
      prioridade: over.prioridade ?? "normal",
      escaladaParaCeo: over.escalada ?? false,
      departamento: "comercial",
    },
  };
}

const ids = (itens: ItemDaFila[]) => itens.map((i) => i._id);

describe("ordem da fila do Matheus", () => {
  it("escalada para o CEO vem primeiro", () => {
    const fila = ordenarFila([item("a"), item("b", { escalada: true })]);
    expect(ids(fila)).toEqual(["b", "a"]);
  });

  it("escalada vence até prioridade urgente não escalada", () => {
    // Escalar é uma decisão explícita de que aquilo precisa DELE. Prioridade
    // alta é uma classificação da IA. A decisão humana ganha.
    const fila = ordenarFila([
      item("urgente", { prioridade: "urgente" }),
      item("escalada", { escalada: true, prioridade: "baixa" }),
    ]);
    expect(ids(fila)).toEqual(["escalada", "urgente"]);
  });

  it("entre não escaladas, a prioridade manda", () => {
    const fila = ordenarFila([
      item("normal", { prioridade: "normal" }),
      item("urgente", { prioridade: "urgente" }),
      item("baixa", { prioridade: "baixa" }),
      item("alta", { prioridade: "alta" }),
    ]);
    expect(ids(fila)).toEqual(["urgente", "alta", "normal", "baixa"]);
  });

  it("empatada a prioridade, quem esperou mais vem antes", () => {
    const fila = ordenarFila([
      item("nova", { criadoEm: 5000 }),
      item("antiga", { criadoEm: 1000 }),
    ]);
    expect(ids(fila)).toEqual(["antiga", "nova"]);
  });

  it("expirada vai para o fim, mesmo escalada e urgente", () => {
    // Decidir uma proposta que o canal já não aceita é trabalho jogado fora.
    const fila = ordenarFila([
      item("expirada", { expirada: true, escalada: true, prioridade: "urgente" }),
      item("viva", { prioridade: "baixa" }),
    ]);
    expect(ids(fila)).toEqual(["viva", "expirada"]);
  });

  it("não altera a lista original", () => {
    const original = [item("a", { prioridade: "baixa" }), item("b", { prioridade: "urgente" })];
    ordenarFila(original);
    expect(ids(original)).toEqual(["a", "b"]);
  });

  it("item sem conversa não quebra a ordenação", () => {
    const orfao: ItemDaFila = { _id: "orfao", criadoEm: 1, conversa: null };
    expect(() => ordenarFila([orfao, item("a")])).not.toThrow();
  });

  it("lista vazia devolve lista vazia", () => {
    expect(ordenarFila([])).toEqual([]);
  });
});

describe("confiança da IA na tela", () => {
  it("alta confiança é sinalizada como confiável", () => {
    expect(rotuloDaConfianca(0.95).texto).toBe("IA confiante");
  });

  it("no limiar de escalonamento, a IA já não é apresentada como confiável", () => {
    expect(rotuloDaConfianca(0.6).texto).toBe("IA razoável");
    expect(rotuloDaConfianca(0.59).texto).toBe("IA insegura");
  });

  it("confiança zero é insegura, não silenciosa", () => {
    expect(rotuloDaConfianca(0).texto).toBe("IA insegura");
  });
});

describe("rótulos", () => {
  it("todo departamento tem rótulo em português", () => {
    for (const chave of ["triagem", "comercial", "suporte", "financeiro", "ouvidoria"] as const) {
      expect(ROTULO_DO_DEPARTAMENTO[chave]).toBeTruthy();
    }
  });

  it("toda categoria da Central tem rótulo", () => {
    const categorias = [
      "novo_interessado",
      "demonstracao",
      "follow_up",
      "trial",
      "conversao",
      "duvida",
      "onboarding",
      "problema",
      "cobranca",
      "reclamacao",
      "sugestao",
      "bug",
      "funcionalidade",
      "elogio",
      "outro",
    ];
    for (const categoria of categorias) {
      expect(ROTULO_DA_CATEGORIA[categoria], categoria).toBeTruthy();
    }
  });
});
