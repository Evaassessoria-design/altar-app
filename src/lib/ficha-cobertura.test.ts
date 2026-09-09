import { describe, expect, it } from "vitest";
import { resumoVisivel, type CoberturaLida } from "./ficha-cobertura.ts";
import type { SituacaoDaCobertura } from "@/convex/lib/fichaTecnica.ts";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA DE REGRESSÃO — A LINHA DA FICHA NÃO PODE MENTIR
//
// Dois defeitos reais, os dois na mesma linha da tela:
//
//   1. "Providenciado" mostrava só `comprado`. 14 vasos reservados do acervo e
//      0 comprados apareciam como zero — o acervo, que é o diferencial do
//      produto, invisível na tela que existe para mostrá-lo.
//
//   2. `faltam` vale o ALVO INTEIRO quando não há acervo vinculado. Exibi-lo
//      num material reutilizável diria "faltam 20 vasos" para quem talvez
//      tenha 40 no galpão.
// ─────────────────────────────────────────────────────────────────────────────

const cobertura = (over: Partial<CoberturaLida> = {}): CoberturaLida => ({
  necessario: 20,
  alvo: 20,
  providenciado: 0,
  doAcervo: null,
  faltam: 20,
  situacao: "sem_providencia",
  ...over,
});

describe("providenciado inclui o acervo, não só a compra", () => {
  it("14 do acervo e 0 comprados aparecem como 14 providenciados", () => {
    // O caso que o defeito escondia: sem compra nenhuma, a tela mostrava 0.
    const r = resumoVisivel(
      cobertura({ doAcervo: 14, providenciado: 14, faltam: 6, situacao: "parcial" }),
      20,
    );
    expect(r.providenciado).toBe(14);
    expect(r.mostrarProvidenciado).toBe(true);
  });

  it("aparece mesmo sem compra alguma — cobertura só do acervo", () => {
    const r = resumoVisivel(
      cobertura({ doAcervo: 20, providenciado: 20, faltam: 0, situacao: "coberto" }),
      20,
    );
    expect(r.mostrarProvidenciado).toBe(true);
    expect(r.mostrarFaltam).toBe(false);
  });

  it("soma compra e acervo, como o backend calcula", () => {
    const r = resumoVisivel(
      cobertura({ doAcervo: 8, providenciado: 18, faltam: 2, situacao: "parcial" }),
      20,
    );
    expect(r.providenciado).toBe(18);
    expect(r.doAcervo).toBe(8);
    expect(r.mostrarOrigemAcervo).toBe(true);
  });

  it("sem nada providenciado, a linha não mostra o número zero", () => {
    expect(resumoVisivel(cobertura(), 20).mostrarProvidenciado).toBe(false);
  });

  it("acervo informado como zero NÃO vira origem — zero não é providência", () => {
    const r = resumoVisivel(cobertura({ doAcervo: 0, providenciado: 0 }), 20);
    expect(r.doAcervo).toBe(0);
    expect(r.mostrarOrigemAcervo).toBe(false);
  });
});

describe("FALTAM só aparece quando é verdade", () => {
  it("acervo_nao_informado NUNCA mostra faltam", () => {
    // `faltam` aqui vale o alvo inteiro (20 de 20). Exibir mandaria comprar
    // de novo o que talvez já esteja no galpão.
    const r = resumoVisivel(
      cobertura({ faltam: 20, situacao: "acervo_nao_informado" }),
      20,
    );
    expect(r.mostrarFaltam).toBe(false);
    expect(r.acervoDesconhecido).toBe(true);
  });

  it("sem_vinculo também não mostra faltam — existe compra parecida", () => {
    const r = resumoVisivel(cobertura({ faltam: 20, situacao: "sem_vinculo" }), 20);
    expect(r.mostrarFaltam).toBe(false);
    expect(r.acervoDesconhecido).toBe(false);
  });

  it("parcial mostra faltam — existe providência e ela não alcança", () => {
    const r = resumoVisivel(
      cobertura({ doAcervo: 14, providenciado: 14, faltam: 6, situacao: "parcial" }),
      20,
    );
    expect(r.mostrarFaltam).toBe(true);
    expect(r.faltam).toBe(6);
  });

  it("sem_providencia mostra faltam — consumível sem compra é falta de verdade", () => {
    const r = resumoVisivel(cobertura({ situacao: "sem_providencia" }), 20);
    expect(r.mostrarFaltam).toBe(true);
    expect(r.faltam).toBe(20);
  });

  it("coberto não mostra faltam", () => {
    const r = resumoVisivel(
      cobertura({ providenciado: 20, faltam: 0, situacao: "coberto" }),
      20,
    );
    expect(r.mostrarFaltam).toBe(false);
  });

  it("CONTRAPROVA: a regra depende da situação, não do número", () => {
    // Mesmo `faltam`, situações diferentes, decisões diferentes. É isso que
    // impede a tela de transformar "não sei" em "falta".
    const faltam = 20;
    const decisao = (situacao: SituacaoDaCobertura) =>
      resumoVisivel(cobertura({ faltam, situacao }), 20).mostrarFaltam;

    expect(decisao("sem_providencia")).toBe(true);
    expect(decisao("parcial")).toBe(true);
    expect(decisao("acervo_nao_informado")).toBe(false);
    expect(decisao("sem_vinculo")).toBe(false);
  });
});

describe("sugerido só aparece quando difere do necessário", () => {
  it("com margem, mostra o alvo maior", () => {
    const r = resumoVisivel(cobertura({ alvo: 22 }), 22);
    expect(r.mostrarSugerido).toBe(true);
    expect(r.sugerido).toBe(22);
  });

  it("sem margem, não repete o mesmo número sob dois rótulos", () => {
    expect(resumoVisivel(cobertura(), 20).mostrarSugerido).toBe(false);
  });
});

describe("a apresentação NÃO recalcula nada", () => {
  it("devolve exatamente os números que o backend entregou", () => {
    // Se esta trava cair, alguém começou a fazer conta na tela — e um dia a
    // tela mostrará 185 onde o PDF mostra 180.
    const c = cobertura({
      necessario: 185,
      alvo: 204,
      doAcervo: 40,
      providenciado: 190,
      faltam: 14,
      situacao: "parcial",
    });
    const r = resumoVisivel(c, 204);

    expect(r.necessario).toBe(185);
    expect(r.sugerido).toBe(204);
    expect(r.providenciado).toBe(190);
    expect(r.doAcervo).toBe(40);
    expect(r.faltam).toBe(14);
  });
});
