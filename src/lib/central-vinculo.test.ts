import { describe, expect, it } from "vitest";
import { estadoDoVinculo, termoBuscavel, validarSelecaoDeVinculo } from "./central-vinculo";

// ─────────────────────────────────────────────────────────────────────────────
// Dizer "esta conversa é desta pessoa" é uma afirmação forte. A tela só pode
// fazê-la quando há vínculo — e precisa dizer com todas as letras quando NÃO
// há, em vez de deixar o espaço vazio e a pessoa supor.
// ─────────────────────────────────────────────────────────────────────────────

describe("estado do vínculo", () => {
  it("sem contato, não afirma nada", () => {
    const estado = estadoDoVinculo(null);
    expect(estado.temVinculo).toBe(false);
    expect(estado.podeDesvincular).toBe(false);
  });

  it("contato solto é 'não identificado', e isso é um estado legítimo", () => {
    const estado = estadoDoVinculo({ tipo: "desconhecido" });
    expect(estado.temVinculo).toBe(false);
    expect(estado.rotulo).toBe("Não identificado");
    expect(estado.detalhe).toContain("ainda não foi reconhecido");
    expect(estado.podeDesvincular).toBe(false);
  });

  it("quando o vínculo foi desfeito, o texto explica por que está vazio", () => {
    const estado = estadoDoVinculo({ vinculoRemovidoEm: 1 });
    expect(estado.detalhe).toContain("desfeito");
  });

  it("interessado vinculado automaticamente diz COMO foi reconhecido", () => {
    const estado = estadoDoVinculo({ landingLeadId: "lead1", vinculoOrigem: "automatico" });
    expect(estado.rotulo).toBe("Interessado");
    expect(estado.detalhe).toContain("automaticamente");
    expect(estado.podeDesvincular).toBe(true);
    expect(estado.temInteressado).toBe(true);
    expect(estado.temAssinante).toBe(false);
  });

  it("vínculo humano é anunciado como decisão de alguém", () => {
    const estado = estadoDoVinculo({ userId: "user1", vinculoOrigem: "humano" });
    expect(estado.rotulo).toBe("Assinante");
    expect(estado.detalhe).toContain("pessoa da operação");
  });

  it("quem veio da landing e assinou mantém os dois lados", () => {
    const estado = estadoDoVinculo({ landingLeadId: "lead1", userId: "user1" });
    expect(estado.rotulo).toBe("Assinante (veio da landing)");
    expect(estado.temInteressado).toBe(true);
    expect(estado.temAssinante).toBe(true);
  });
});

describe("validação da escolha", () => {
  it("vincular a nada não é operação", () => {
    expect(validarSelecaoDeVinculo({})).toContain("Escolha");
    expect(validarSelecaoDeVinculo({ interessadoId: null, assinanteId: null })).not.toBeNull();
  });

  it("um dos dois lados basta", () => {
    expect(validarSelecaoDeVinculo({ interessadoId: "lead1" })).toBeNull();
    expect(validarSelecaoDeVinculo({ assinanteId: "user1" })).toBeNull();
  });
});

describe("termo de busca", () => {
  it("usa o mesmo piso do backend", () => {
    expect(termoBuscavel("h")).toBeNull();
    expect(termoBuscavel("  ")).toBeNull();
    expect(termoBuscavel(" helena ")).toBe("helena");
  });
});
