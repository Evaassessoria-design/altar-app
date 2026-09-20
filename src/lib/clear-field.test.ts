import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// AS TELAS PEDEM A LIMPEZA DO JEITO QUE CHEGA
//
// `undefined` é descartado na serialização do Convex (provado em
// convex/limparCampos.test.ts). Uma tela que manda `undefined` para apagar um
// campo mostra "atualizado!" e não apaga nada.
//
// Estes guardas existem porque o erro é invisível: o código parece certo, o
// TypeScript aceita, o teste de unidade passa — e o campo continua lá.
// ─────────────────────────────────────────────────────────────────────────────

const ler = (caminho: string) => readFileSync(caminho, "utf-8");

const PROJETO = ler("src/pages/app/events/[id]/projeto/page.tsx");
const MONTAGEM = ler("src/pages/app/events/[id]/_components/assembly-items-section.tsx");
const COMPRAS = ler("src/pages/app/compras/page.tsx");
const FUNIL = ler("src/pages/app/funil/page.tsx");

describe("Projeto de decoração", () => {
  it('"Sem classificação" envia null, não undefined', () => {
    expect(PROJETO).toContain('projectScope: scope === "" ? null : scope');
    expect(PROJETO).not.toContain('scope === "" ? undefined');
  });
});

describe("Item de montagem", () => {
  it("apagar a quantidade envia null", () => {
    expect(MONTAGEM).toContain("quantity: v ? Number(v) : null");
    expect(MONTAGEM).not.toContain("quantity: v ? Number(v) : undefined");
  });
});

describe("Compras — o formulário de edição é substituição", () => {
  const edicao = COMPRAS.slice(COMPRAS.indexOf("const handleEdit"));

  it.each([
    ["category", "values.category || null"],
    ["unit", "values.unit || null"],
    ["supplier", "values.supplier || null"],
    ["notes", "values.notes || null"],
    ["responsible", "values.responsible || null"],
    ["dueDate", "values.dueDate || null"],
  ])("esvaziar %s apaga o valor", (_campo, trecho) => {
    expect(edicao).toContain(trecho);
  });

  it("esvaziar quantidade e preço também apaga", () => {
    // Os dois deixaram de ser `parseFloat` no lugar — "1.500,00" virava 1.5
    // (ver src/lib/valor-digitado.ts) — e passaram por um leitor comum. O que
    // NÃO pode mudar é o fim da linha: campo vazio vira `null`, e não
    // `undefined`, que o Convex descarta no transporte.
    expect(edicao).toContain("quantity: numeros.quantity ?? null");
    expect(edicao).toContain("unitPrice: numeros.unitPrice ?? null");
    const leitor = COMPRAS.slice(COMPRAS.indexOf("const numerosDaCompra"));
    expect(leitor).toContain("values.quantity ? valorDigitado(values.quantity) : undefined");
    expect(leitor).toContain("values.unitPrice ? valorDigitado(values.unitPrice) : undefined");
  });

  it("nenhum campo da edição continua mandando undefined", () => {
    const chamada = edicao.slice(edicao.indexOf("updatePurchase({"), edicao.indexOf("});"));
    expect(chamada).not.toContain("undefined");
  });

  it("o cadastro de item novo NÃO precisou mudar", () => {
    // Não existe valor anterior para apagar: `undefined` ali é correto e a
    // troca por `null` só faria o servidor gravar uma limpeza inútil.
    const criacao = COMPRAS.slice(COMPRAS.indexOf("const handleAdd"), COMPRAS.indexOf("const handleEdit"));
    expect(criacao).toContain("undefined");
  });
});

describe("Funil — edição de lead", () => {
  const edicao = FUNIL.slice(FUNIL.indexOf("const handleEdit"));

  it.each([
    ["eventType", "values.eventType || null"],
    ["eventDate", "values.eventDate || null"],
    ["clientPhone", "values.clientPhone || null"],
    ["notes", "values.notes || null"],
  ])("esvaziar %s apaga o valor", (_campo, trecho) => {
    expect(edicao).toContain(trecho);
  });

  it("esvaziar o orçamento apaga o valor", () => {
    // `orcamentoDoLead` devolve `null` para campo vazio e a string "erro" para
    // o que não dá para ler — o que não pode é o campo vazio virar
    // `undefined`, que o Convex descarta no transporte.
    expect(edicao).toContain("budget,");
    const leitor = FUNIL.slice(FUNIL.indexOf("const orcamentoDoLead"));
    expect(leitor).toContain('if (!texto?.trim()) return null;');
  });

  it("nenhum campo da edição continua mandando undefined", () => {
    const chamada = edicao.slice(edicao.indexOf("updateLead({"), edicao.indexOf("});"));
    expect(chamada).not.toContain("undefined");
  });
});
