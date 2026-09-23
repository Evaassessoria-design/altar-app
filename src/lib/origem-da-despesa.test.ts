import { describe, expect, it } from "vitest";
import { detalheDaOrigem, origemDaDespesa } from "./origem-da-despesa.ts";

// A despesa que sobreviveu à compra precisa dizer isso na tela. Sem este
// texto, `origemCompra` seria dado que entra no banco e nunca é lido — e o
// buraco que ela existe para fechar continuaria aberto para quem usa.

const origem = (over: Partial<NonNullable<Parameters<typeof origemDaDespesa>[0]>["origemCompra"]> = {}) => ({
  nome: "Rosas brancas",
  desfecho: "cancelada" as const,
  em: "2026-09-23",
  ...over,
});

describe("origemDaDespesa", () => {
  it("cala quando a despesa não veio de compra desfeita", () => {
    // É o caso de quase todo lançamento: avulso, do contrato, ou de compra
    // viva e ainda vinculada.
    expect(origemDaDespesa({ description: "Sinal do contrato" })).toBeNull();
  });

  it("diz que a compra foi cancelada", () => {
    expect(
      origemDaDespesa({ description: "Rosas brancas — Flora Bela", origemCompra: origem() }),
    ).toBe("de compra cancelada");
  });

  it("e que foi excluída, quando foi", () => {
    expect(
      origemDaDespesa({
        description: "Rosas brancas — Flora Bela",
        origemCompra: origem({ desfecho: "excluida" }),
      }),
    ).toBe("de compra excluída");
  });

  it("não ecoa o nome que já está na descrição", () => {
    // A descrição NASCE do nome da compra. Repetir seria a linha dizendo a
    // mesma coisa duas vezes em 320px de largura.
    const frase = origemDaDespesa({
      description: "Rosas brancas — Flora Bela",
      origemCompra: origem(),
    })!;
    expect(frase).not.toContain("Rosas brancas");
  });

  it("ignora acento e caixa ao decidir se é eco", () => {
    const frase = origemDaDespesa({
      description: "CADEIRAS DOURADAS — Móveis SP",
      origemCompra: origem({ nome: "Cadeiras douradas" }),
    })!;
    expect(frase, "achou que 'CADEIRAS' e 'Cadeiras' são coisas diferentes").toBe(
      "de compra cancelada",
    );
  });

  it("mas mostra o nome quando ela reescreveu a descrição", () => {
    // O caso que torna o campo útil: sem o nome, "Ajuste de outubro · R$ 400"
    // não diz nada sobre o que aquilo foi.
    expect(
      origemDaDespesa({ description: "Ajuste de outubro", origemCompra: origem() }),
    ).toBe("de compra cancelada: Rosas brancas");
  });

  it("aguenta descrição ausente sem quebrar", () => {
    expect(origemDaDespesa({ origemCompra: origem() })).toBe(
      "de compra cancelada: Rosas brancas",
    );
  });

  it("nome em branco não vira dois-pontos pendurado", () => {
    expect(origemDaDespesa({ description: "Ajuste", origemCompra: origem({ nome: "   " }) })).toBe(
      "de compra cancelada",
    );
  });
});

describe("detalheDaOrigem", () => {
  const dia = (iso: string) => iso.split("-").reverse().join("/");

  it("cala quando não há origem", () => {
    expect(detalheDaOrigem({ description: "Sinal" }, dia)).toBeNull();
  });

  it("diz o nome, o desfecho, a data e o que foi preservado", () => {
    expect(detalheDaOrigem({ description: "Ajuste", origemCompra: origem() }, dia)).toBe(
      'Nasceu da compra "Rosas brancas", cancelada em 23/09/2026. O custo foi mantido no financeiro.',
    );
  });

  it("nunca promete vínculo — a palavra 'vinculada' não aparece", () => {
    // O ponto da rodada: proveniência NÃO é vínculo. Um texto que sugira
    // ligação viva faria a decoradora procurar na tela de Compras um item
    // que pode nem existir mais.
    const frase = detalheDaOrigem(
      { description: "Ajuste", origemCompra: origem({ desfecho: "excluida" }) },
      dia,
    )!;
    expect(frase.toLowerCase()).not.toContain("vincul");
    expect(frase).toContain("excluída");
  });

  it("nome vazio degrada para 'uma compra' em vez de aspas vazias", () => {
    expect(
      detalheDaOrigem({ description: "Ajuste", origemCompra: origem({ nome: "" }) }, dia),
    ).toContain('"uma compra"');
  });
});
