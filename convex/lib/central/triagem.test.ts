import { describe, expect, it } from "vitest";
import {
  CATEGORIAS,
  CATEGORIAS_DE_OUVIDORIA,
  CONFIANCA_MINIMA,
  decidirEscalonamento,
  departamentoDaCategoria,
  ehCategoriaDeOuvidoria,
  houveDivergencia,
  prazoEmDias,
  resolverTriagem,
  trabalhoSugerido,
  type Categoria,
} from "./triagem";

describe("roteamento por categoria", () => {
  it("toda categoria tem departamento — nenhuma cai no vazio", () => {
    for (const categoria of CATEGORIAS) {
      expect(departamentoDaCategoria(categoria)).toBeTruthy();
    }
  });

  it.each([
    ["novo_interessado", "comercial"],
    ["demonstracao", "comercial"],
    ["follow_up", "comercial"],
    ["trial", "comercial"],
    ["conversao", "comercial"],
    ["duvida", "suporte"],
    ["onboarding", "suporte"],
    ["problema", "suporte"],
    ["cobranca", "financeiro"],
    ["reclamacao", "ouvidoria"],
    ["sugestao", "ouvidoria"],
    ["bug", "ouvidoria"],
    ["funcionalidade", "ouvidoria"],
  ])("%s vai para %s", (categoria, departamento) => {
    expect(departamentoDaCategoria(categoria as Categoria)).toBe(departamento);
  });

  it("categoria desconhecida fica em triagem, não escolhe departamento no chute", () => {
    const r = resolverTriagem({ categoria: "assunto_que_nao_existe" });
    expect(r.categoria).toBe("outro");
    expect(r.departamento).toBe("triagem");
  });

  it("prioridade ausente é normal — nenhum registro precisa de backfill", () => {
    expect(resolverTriagem({ categoria: "duvida" }).prioridade).toBe("normal");
  });

  it("prioridade inválida também cai em normal", () => {
    expect(resolverTriagem({ categoria: "duvida", prioridade: "altíssima" }).prioridade).toBe(
      "normal",
    );
  });
});

describe("ouvidoria alimenta produto", () => {
  it.each(CATEGORIAS_DE_OUVIDORIA)("%s é sinal de ouvidoria", (categoria) => {
    expect(ehCategoriaDeOuvidoria(categoria)).toBe(true);
    expect(departamentoDaCategoria(categoria)).toBe("ouvidoria");
  });

  it("categoria de ouvidoria NÃO vira tarefa — vira sinal", () => {
    for (const categoria of CATEGORIAS_DE_OUVIDORIA) {
      expect(trabalhoSugerido(categoria)).toBeNull();
    }
  });

  it("duvida e problema viram tarefa de suporte", () => {
    expect(trabalhoSugerido("duvida")).toBe("suporte");
    expect(trabalhoSugerido("problema")).toBe("suporte");
  });

  it("demonstracao vira tarefa de demonstração", () => {
    expect(trabalhoSugerido("demonstracao")).toBe("demonstracao");
  });

  it("cobranca vira CONTATO de cobrança — nunca movimentação", () => {
    expect(trabalhoSugerido("cobranca")).toBe("contato_cobranca");
  });
});

describe("escalonamento para o CEO", () => {
  it("prioridade urgente sempre sobe", () => {
    expect(decidirEscalonamento("duvida", "urgente", 0.99).escalar).toBe(true);
  });

  it("toda cobrança sobe — a decisão financeira é sempre humana", () => {
    const r = decidirEscalonamento("cobranca", "baixa", 0.99);
    expect(r.escalar).toBe(true);
    expect(r.motivo).toContain("cobrança");
  });

  it("fechamento de assinatura sobe", () => {
    expect(decidirEscalonamento("conversao", "normal", 0.99).escalar).toBe(true);
  });

  it("reclamação grave sobe; reclamação normal não", () => {
    expect(decidirEscalonamento("reclamacao", "alta", 0.9).escalar).toBe(true);
    expect(decidirEscalonamento("reclamacao", "normal", 0.9).escalar).toBe(false);
  });

  it("assinante com problema sobe; interessado com problema não", () => {
    expect(
      decidirEscalonamento("problema", "normal", 0.9, { tipoDeContato: "assinante" }).escalar,
    ).toBe(true);
    expect(
      decidirEscalonamento("problema", "normal", 0.9, { tipoDeContato: "interessado" }).escalar,
    ).toBe(false);
  });

  it("IA sem confiança sobe em vez de arquivar no departamento errado", () => {
    const r = decidirEscalonamento("duvida", "normal", CONFIANCA_MINIMA - 0.01);
    expect(r.escalar).toBe(true);
    expect(r.motivo).toContain("confiança");
  });

  it("no limiar exato a IA ainda decide sozinha", () => {
    expect(decidirEscalonamento("duvida", "normal", CONFIANCA_MINIMA).escalar).toBe(false);
  });

  it("confiança ausente não é tratada como baixa", () => {
    expect(decidirEscalonamento("duvida", "normal", undefined).escalar).toBe(false);
  });

  it("conversa já escalada continua escalada", () => {
    const r = decidirEscalonamento("duvida", "baixa", 0.99, { jaEscalada: true });
    expect(r.escalar).toBe(true);
  });

  it("dúvida simples de interessado não incomoda o CEO", () => {
    expect(decidirEscalonamento("duvida", "normal", 0.95).escalar).toBe(false);
  });

  it("o motivo é sempre específico quando escala", () => {
    const casos = [
      decidirEscalonamento("duvida", "urgente", 0.9),
      decidirEscalonamento("cobranca", "normal", 0.9),
      decidirEscalonamento("conversao", "normal", 0.9),
    ];
    for (const caso of casos) {
      expect(caso.motivo).toBeTruthy();
      expect(caso.motivo!.length).toBeGreaterThan(5);
    }
  });
});

describe("prazo da tarefa", () => {
  it("urgente vence hoje e baixa vence na semana", () => {
    expect(prazoEmDias("urgente")).toBe(0);
    expect(prazoEmDias("alta")).toBe(1);
    expect(prazoEmDias("normal")).toBe(3);
    expect(prazoEmDias("baixa")).toBe(7);
  });
});

describe("divergência entre a IA e o humano", () => {
  const proposto = { categoria: "duvida", departamento: "suporte", prioridade: "normal" };

  it("estado idêntico não é divergência", () => {
    expect(houveDivergencia(proposto, { ...proposto })).toBe(false);
  });

  it("humano trocou a categoria", () => {
    expect(houveDivergencia(proposto, { ...proposto, categoria: "problema" })).toBe(true);
  });

  it("humano trocou o departamento", () => {
    expect(houveDivergencia(proposto, { ...proposto, departamento: "comercial" })).toBe(true);
  });

  it("humano trocou a prioridade", () => {
    expect(houveDivergencia(proposto, { ...proposto, prioridade: "alta" })).toBe(true);
  });

  it("campo ausente no estado não conta como divergência", () => {
    expect(houveDivergencia(proposto, {})).toBe(false);
  });
});
