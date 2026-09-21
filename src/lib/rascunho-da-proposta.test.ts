import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { propostaMudou, type PropostaNaTela, type PropostaSalva } from "./rascunho-da-proposta.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O DOCUMENTO QUE ELA APROVA TEM DE SER O DOCUMENTO QUE ELA ESCREVEU
//
// A prévia e o PDF saem de `comoOClienteVe`, que reflete o que está SALVO — é
// assim de propósito: a fronteira de audiência mora no servidor.
//
// A tela conferia se havia alteração pendente comparando só o INVESTIMENTO.
// Então bastava editar TEXTO para o aviso calar: ela reescrevia a apresentação
// inteira, clicava em "Ver como a cliente vê", lia o texto ANTIGO, achava bom,
// baixava o PDF e mandava o antigo. Os valores batiam, nada avisava.
// ═════════════════════════════════════════════════════════════════════════════

const SALVA: PropostaSalva = {
  titulo: "Casamento Marina & Gabriel",
  apresentacao: "O conceito do dia.",
  condicoesPagamento: "30% na assinatura.",
  validadeAte: "2026-10-30",
  observacoes: "Valores sujeitos a confirmação.",
  itens: [
    { descricao: "Projeto floral", detalhe: "Cerimônia", valor: 38000 },
    { descricao: "Iluminação", valor: 25500 },
  ],
};

const NA_TELA: PropostaNaTela = {
  titulo: "Casamento Marina & Gabriel",
  apresentacao: "O conceito do dia.",
  condicoesPagamento: "30% na assinatura.",
  validadeAte: "2026-10-30",
  observacoes: "Valores sujeitos a confirmação.",
  itens: [
    { descricao: "Projeto floral", detalhe: "Cerimônia", valor: 38000 },
    { descricao: "Iluminação", detalhe: "", valor: 25500 },
  ],
};

describe("proposta aberta e não tocada", () => {
  it("não é alteração pendente", () => {
    expect(propostaMudou(SALVA, NA_TELA)).toBe(false);
  });

  it("campo ausente no banco e vazio na tela são a mesma coisa", () => {
    // Se fossem diferentes, TODA proposta recém-aberta pareceria alterada — e
    // um aviso que aparece sempre não avisa nada.
    const semTextos: PropostaSalva = { titulo: "T", itens: [] };
    expect(
      propostaMudou(semTextos, {
        titulo: "T",
        apresentacao: "",
        condicoesPagamento: "",
        validadeAte: "",
        observacoes: "",
        itens: [],
      }),
    ).toBe(false);
  });

  it("espaço em volta não conta como edição", () => {
    expect(propostaMudou(SALVA, { ...NA_TELA, titulo: "  Casamento Marina & Gabriel  " })).toBe(
      false,
    );
  });
});

describe("cada campo do documento acusa a edição — nenhum passa batido", () => {
  // O defeito foi um campo esquecido. A cobrança é campo a campo, de
  // propósito: acrescentar um campo à proposta e não acrescentar aqui faz o
  // aviso voltar a ser cego para ele.
  it.each([
    ["titulo", { titulo: "Outro título" }],
    ["apresentacao", { apresentacao: "Reescrevi tudo." }],
    ["condicoesPagamento", { condicoesPagamento: "50% na assinatura." }],
    ["validadeAte", { validadeAte: "2026-11-15" }],
    ["observacoes", { observacoes: "Outra observação." }],
  ] as const)("mexer em %s é alteração pendente", (_campo, patch) => {
    expect(propostaMudou(SALVA, { ...NA_TELA, ...patch })).toBe(true);
  });

  it("mexer só na DESCRIÇÃO de um item conta — o total não muda", () => {
    const itens = [{ descricao: "Projeto floral completo", detalhe: "Cerimônia", valor: 38000 }, NA_TELA.itens[1]];
    expect(propostaMudou(SALVA, { ...NA_TELA, itens })).toBe(true);
  });

  it("mexer só no DETALHE de um item conta", () => {
    const itens = [{ ...NA_TELA.itens[0], detalhe: "Cerimônia e recepção" }, NA_TELA.itens[1]];
    expect(propostaMudou(SALVA, { ...NA_TELA, itens })).toBe(true);
  });

  it("trocar dois valores mantendo o total conta", () => {
    // O caso que a comparação por total nunca pegaria: 38.000 + 25.500 continua
    // 63.500, e a cliente receberia outra distribuição de preço.
    const itens = [
      { ...NA_TELA.itens[0], valor: 40000 },
      { ...NA_TELA.itens[1], valor: 23500 },
    ];
    expect(propostaMudou(SALVA, { ...NA_TELA, itens })).toBe(true);
  });

  it("acrescentar e remover item contam", () => {
    expect(propostaMudou(SALVA, { ...NA_TELA, itens: [NA_TELA.itens[0]] })).toBe(true);
    expect(
      propostaMudou(SALVA, {
        ...NA_TELA,
        itens: [...NA_TELA.itens, { descricao: "Extra", detalhe: "", valor: 100 }],
      }),
    ).toBe(true);
  });

  it("valor ilegível conta como alteração — não como 'igual ao salvo'", () => {
    // Senão a tela geraria o PDF com o número antigo enquanto o campo na frente
    // dela mostra outra coisa.
    const itens = [{ ...NA_TELA.itens[0], valor: null }, NA_TELA.itens[1]];
    expect(propostaMudou(SALVA, { ...NA_TELA, itens })).toBe(true);
  });

  it("diferença abaixo de um centavo não conta", () => {
    const itens = [{ ...NA_TELA.itens[0], valor: 38000.001 }, NA_TELA.itens[1]];
    expect(propostaMudou(SALVA, { ...NA_TELA, itens })).toBe(false);
  });
});

describe("a tela usa a regra, e avisa antes do clique", () => {
  const TELA = readFileSync("src/pages/app/propostas/[id]/page.tsx", "utf-8");

  it("não compara mais só o investimento", () => {
    expect(TELA).toContain("propostaMudou");
    expect(TELA).not.toMatch(/clienteVe\.investimento\s*\)?\s*!==/);
  });

  it("o aviso aparece na tela, não só no toast depois do clique", () => {
    // Descobrir que o botão não funciona é pior do que ler antes por que ele
    // não vai funcionar.
    expect(TELA).toMatch(/\{naoSalvo && \(/);
    expect(TELA).toMatch(/última versão salva/);
  });
});
