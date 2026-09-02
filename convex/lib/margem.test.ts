import { describe, expect, it } from "vitest";
import {
  MARGEM_MAXIMA,
  ROTULO_DA_SITUACAO,
  coberturaDaLinha,
  consolidarMateriais,
  margemValida,
  motivoDaAtencao,
  precisaDeAtencao,
  sugeridoOperacional,
  sugeridoParaProvidenciar,
} from "./fichaTecnica";
import { ehObrigacaoDeMontagem } from "./escopoDoProjeto";

const consolidar = (c: Parameters<typeof consolidarMateriais>[0]) =>
  consolidarMateriais(c, ehObrigacaoDeMontagem);

// ═══════════════════════════════════════════════════ MARGEM DE SEGURANÇA

describe("validação da margem", () => {
  it.each([
    [0, true],
    [5, true],
    [10, true],
    [12.5, true],
    [100, true],
    [-1, false],
    [101, false],
    [999, false],
    [NaN, false],
    [Infinity, false],
  ])("margem %s → válida: %s", (valor, esperado) => {
    expect(margemValida(valor)).toBe(esperado);
  });

  it("null e undefined são AUSENTES, não inválidos-zero", () => {
    expect(margemValida(null)).toBe(false);
    expect(margemValida(undefined)).toBe(false);
  });

  it("ZERO é margem configurada, não ausência — nada de truthiness", () => {
    // `if (margem)` transformaria 0 em "sem margem". São coisas diferentes:
    // "não configurei" e "configurei que não quero folga".
    expect(margemValida(0)).toBe(true);
    expect(sugeridoParaProvidenciar(100, 0)).toBe(100);
  });

  it("o teto existe para pegar erro de digitação", () => {
    expect(MARGEM_MAXIMA).toBe(100);
    expect(margemValida(MARGEM_MAXIMA)).toBe(true);
    expect(margemValida(MARGEM_MAXIMA + 0.1)).toBe(false);
  });
});

describe("sugerido = necessário + margem", () => {
  it.each([
    [100, 10, 110],
    [185, 10, 203.5],
    [12.5, 15, 14.375],
    [20, 0, 20],
    [100, 100, 200],
    [0, 10, 0],
  ])("%s com %s%% → %s", (necessario, margem, esperado) => {
    expect(sugeridoParaProvidenciar(necessario, margem)).toBe(esperado);
  });

  it("sem margem, o sugerido É o necessário — nunca null", () => {
    // "Providencie o que a receita pede" é uma resposta correta.
    expect(sugeridoParaProvidenciar(185, null)).toBe(185);
    expect(sugeridoParaProvidenciar(185, undefined)).toBe(185);
  });

  it("margem inválida é ignorada em vez de contaminar a conta", () => {
    expect(sugeridoParaProvidenciar(100, -50)).toBe(100);
    expect(sugeridoParaProvidenciar(100, 500)).toBe(100);
  });

  it("não acumula lixo de ponto flutuante", () => {
    expect(sugeridoParaProvidenciar(0.1, 10)).toBe(0.11);
  });
});

describe("arredondamento respeita a UNIDADE", () => {
  it("haste/un/maço/caixa/rolo arredondam para CIMA — não existe meia rosa", () => {
    // Para baixo comeria justamente a margem que ela pediu para ter.
    expect(sugeridoOperacional(110.25, "haste")).toBe(111);
    expect(sugeridoOperacional(20.01, "un")).toBe(21);
    expect(sugeridoOperacional(3.2, "maco")).toBe(4);
    expect(sugeridoOperacional(1.1, "caixa")).toBe(2);
  });

  it("metro/m²/kg/litro preservam o decimal — 2,5 m de tecido é real", () => {
    expect(sugeridoOperacional(14.375, "m")).toBe(14.375);
    expect(sugeridoOperacional(3.75, "kg")).toBe(3.75);
    expect(sugeridoOperacional(0.5, "l")).toBe(0.5);
    expect(sugeridoOperacional(12.25, "m2")).toBe(12.25);
  });

  it("valor já inteiro em unidade inteira não muda", () => {
    expect(sugeridoOperacional(110, "haste")).toBe(110);
  });

  it("unidade DESCONHECIDA não arredonda — na dúvida, preserva o decimal", () => {
    // "Não sei" é diferente de "indivisível". Arredondar o que não se conhece
    // inventa uma regra de negócio que ninguém validou. Só acontece com dado
    // corrompido: o schema aceita apenas a lista fechada de unidades.
    expect(sugeridoOperacional(110.25, "sei-la")).toBe(110.25);
  });
});

describe("margem no consolidado", () => {
  const comMargem = (margemPercentual?: number) => [
    {
      _id: "a", nome: "Mesas", area: "tables", quantidade: 20,
      receita: [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 5, margemPercentual }],
    },
  ];

  it("aplica a margem DEPOIS de somar todas as origens", () => {
    // Aplicar parcela a parcela e somar daria outro número por arredondamento.
    const linhas = consolidar([
      { _id: "a", nome: "A", area: "x", quantidade: 3, receita: [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 1, margemPercentual: 10 }] },
      { _id: "b", nome: "B", area: "x", quantidade: 3, receita: [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 1, margemPercentual: 10 }] },
    ]);
    expect(linhas[0].necessario).toBe(6);
    expect(linhas[0].sugerido).toBe(6.6);
    expect(linhas[0].sugeridoOperacional).toBe(7);
  });

  it("`necessario` NUNCA muda por causa da margem", () => {
    const semMargem = consolidar(comMargem())[0];
    const comDez = consolidar(comMargem(10))[0];
    expect(semMargem.necessario).toBe(100);
    expect(comDez.necessario).toBe(100); // a receita é a mesma
    expect(comDez.sugerido).toBe(110);
  });

  it("sem margem, sugerido = necessário", () => {
    const linha = consolidar(comMargem())[0];
    expect(linha.margemPercentual).toBeNull();
    expect(linha.sugerido).toBe(linha.necessario);
  });

  it("margens DIFERENTES entre origens não viram média inventada", () => {
    const linhas = consolidar([
      { _id: "a", nome: "A", area: "x", quantidade: 10, receita: [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 5, margemPercentual: 10 }] },
      { _id: "b", nome: "B", area: "x", quantidade: 10, receita: [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 5, margemPercentual: 20 }] },
    ]);
    expect(linhas[0].necessario).toBe(100);
    expect(linhas[0].margemPercentual).toBeNull(); // não afirma 15%
    expect(linhas[0].sugerido).toBe(100); // sem margem afirmável, sugere o necessário
  });

  it("margens IGUAIS entre origens continuam valendo", () => {
    const linhas = consolidar([
      { _id: "a", nome: "A", area: "x", quantidade: 10, receita: [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 5, margemPercentual: 10 }] },
      { _id: "b", nome: "B", area: "x", quantidade: 10, receita: [{ materialId: "m", nome: "Rosa", unidade: "haste", quantidade: 5, margemPercentual: 10 }] },
    ]);
    expect(linhas[0].margemPercentual).toBe(10);
    expect(linhas[0].sugerido).toBe(110);
  });

  it("margem inválida gravada no snapshot é ignorada", () => {
    expect(consolidar(comMargem(-5))[0].sugerido).toBe(100);
  });
});

// ═══════════════════════════════════════════════════ COBERTURA HONESTA

const linhaBase = { necessario: 185, sugerido: 203.5, tipo: "consumivel" as const };

describe("cobertura — o alvo é o SUGERIDO, não o necessário", () => {
  it("210 comprados cobrem os 203,5 sugeridos", () => {
    const c = coberturaDaLinha(linhaBase, [{ quantity: 210, cancelada: false }]);
    expect(c.alvo).toBe(203.5);
    expect(c.situacao).toBe("coberto");
    expect(c.faltam).toBe(0);
    expect(c.excedente).toBe(6.5);
  });

  it("120 comprados deixam 83,5 faltando", () => {
    const c = coberturaDaLinha(linhaBase, [{ quantity: 120, cancelada: false }]);
    expect(c.faltam).toBe(83.5);
    expect(c.situacao).toBe("parcial");
    expect(c.percentual).toBe(59);
  });

  it("duas compras válidas somam", () => {
    const c = coberturaDaLinha(linhaBase, [
      { quantity: 100, cancelada: false },
      { quantity: 110, cancelada: false },
    ]);
    expect(c.comprado).toBe(210);
    expect(c.situacao).toBe("coberto");
  });

  it("compra CANCELADA não cobre nada", () => {
    const c = coberturaDaLinha(linhaBase, [{ quantity: 300, cancelada: true }]);
    expect(c.comprado).toBe(0);
    expect(c.temCompra).toBe(false);
    expect(c.situacao).toBe("sem_providencia");
  });

  it("sem alvo, o percentual é null e não 0%", () => {
    expect(coberturaDaLinha({ necessario: 0, sugerido: 0 }, []).percentual).toBeNull();
  });
});

describe("ACERVO — o sistema admite que não sabe", () => {
  it("reutilizável sem compra NÃO diz 'faltam 20 vasos'", () => {
    // Sem módulo de acervo, dizer "faltam" mandaria comprar o que ela já tem.
    const c = coberturaDaLinha({ necessario: 20, sugerido: 20, tipo: "reutilizavel" }, []);
    expect(c.situacao).toBe("acervo_nao_informado");
    expect(ROTULO_DA_SITUACAO[c.situacao]).toBe("Disponibilidade do acervo não informada");
  });

  it("locação sem compra também não vira falta de compra", () => {
    const c = coberturaDaLinha({ necessario: 30, sugerido: 30, tipo: "locacao" }, []);
    expect(c.situacao).toBe("acervo_nao_informado");
  });

  it("CONSUMÍVEL sem compra é falta de verdade", () => {
    const c = coberturaDaLinha({ necessario: 185, sugerido: 185, tipo: "consumivel" }, []);
    expect(c.situacao).toBe("sem_providencia");
  });

  it("compra específica sem compra também é falta de verdade", () => {
    const c = coberturaDaLinha({ necessario: 5, sugerido: 5, tipo: "compra_especifica" }, []);
    expect(c.situacao).toBe("sem_providencia");
  });

  it("reutilizável COM compra volta a ter cobertura mensurável", () => {
    // Se ela comprou vasos para este evento, aí o número existe.
    const c = coberturaDaLinha({ necessario: 20, sugerido: 20, tipo: "reutilizavel" }, [
      { quantity: 20, cancelada: false },
    ]);
    expect(c.situacao).toBe("coberto");
  });

  it("acervo não informado NÃO é pendência", () => {
    // Cobrar dela uma resposta que o produto ainda não sabe perguntar seria
    // transformar limitação nossa em tarefa dela.
    const c = coberturaDaLinha({ necessario: 20, sugerido: 20, tipo: "reutilizavel" }, []);
    expect(precisaDeAtencao(c, false)).toBe(false);
    expect(motivoDaAtencao(c, false)).toBeNull();
  });
});

describe("COMPRA PARECIDA SEM VÍNCULO", () => {
  it("não afirma falta quando existe compra parecida", () => {
    // Seria mandar comprar de novo o que ela já comprou à mão.
    const c = coberturaDaLinha(linhaBase, [], { temSemelhanteSemVinculo: true });
    expect(c.situacao).toBe("sem_vinculo");
    expect(motivoDaAtencao(c, false)).toBe("Existe uma compra parecida sem vínculo");
  });

  it("mas TAMBÉM não soma a quantidade dela por heurística", () => {
    const c = coberturaDaLinha(linhaBase, [], { temSemelhanteSemVinculo: true });
    expect(c.comprado).toBe(0); // nome não é identidade
  });

  it("é pendência de verdade — precisa de uma decisão humana", () => {
    const c = coberturaDaLinha(linhaBase, [], { temSemelhanteSemVinculo: true });
    expect(precisaDeAtencao(c, false)).toBe(true);
  });
});

describe("DIVERGÊNCIA de necessidade", () => {
  it("detecta e diz os dois números", () => {
    const c = coberturaDaLinha(
      { necessario: 210, sugerido: 210 },
      [{ quantity: 200, cancelada: false, necessidadeTecnica: 185 }],
    );
    expect(c.necessidadeMudou).toBe(true);
    expect(c.necessidadeNaCompra).toBe(185);
    expect(motivoDaAtencao(c, false)).toBe("Necessidade mudou: 185 → 210");
  });

  it("necessidade igual não é divergência", () => {
    const c = coberturaDaLinha(
      { necessario: 185, sugerido: 203.5 },
      [{ quantity: 210, cancelada: false, necessidadeTecnica: 185 }],
    );
    expect(c.necessidadeMudou).toBe(false);
  });

  it("sem carimbo não afirma nem nega", () => {
    expect(coberturaDaLinha(linhaBase, [{ quantity: 210, cancelada: false }]).necessidadeMudou).toBeNull();
  });

  it("compra cancelada não dispara alarme de divergência", () => {
    const c = coberturaDaLinha(
      { necessario: 210, sugerido: 210 },
      [{ quantity: 185, cancelada: true, necessidadeTecnica: 185 }],
    );
    expect(c.necessidadeMudou).toBeNull();
  });
});

describe("ATENÇÃO — só o que é verdade verificável", () => {
  it("coberto e em dia não pede atenção", () => {
    const c = coberturaDaLinha(linhaBase, [{ quantity: 210, cancelada: false, necessidadeTecnica: 185 }]);
    expect(precisaDeAtencao(c, false)).toBe(false);
  });

  it("tipo ambíguo pede", () => {
    const c = coberturaDaLinha(linhaBase, [{ quantity: 210, cancelada: false }]);
    expect(precisaDeAtencao(c, true)).toBe(true);
  });

  it("a divergência tem prioridade sobre 'falta providenciar' na mensagem", () => {
    const c = coberturaDaLinha(
      { necessario: 210, sugerido: 210 },
      [{ quantity: 100, cancelada: false, necessidadeTecnica: 185 }],
    );
    expect(motivoDaAtencao(c, false)).toContain("Necessidade mudou");
  });

  it("toda situação tem rótulo em português, sem código interno", () => {
    for (const [chave, rotulo] of Object.entries(ROTULO_DA_SITUACAO)) {
      expect(rotulo).toBeTruthy();
      expect(rotulo, `${chave} vazou código interno`).not.toMatch(/_/);
    }
  });
});
