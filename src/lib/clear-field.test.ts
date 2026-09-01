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
    ["quantity", "values.quantity ? parseFloat(values.quantity) : null"],
    ["unitPrice", "values.unitPrice ? parseFloat(values.unitPrice) : null"],
  ])("esvaziar %s apaga o valor", (_campo, trecho) => {
    expect(edicao).toContain(trecho);
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
    ["budget", "values.budget ? parseFloat(values.budget) : null"],
    ["eventType", "values.eventType || null"],
    ["eventDate", "values.eventDate || null"],
    ["clientPhone", "values.clientPhone || null"],
    ["notes", "values.notes || null"],
  ])("esvaziar %s apaga o valor", (_campo, trecho) => {
    expect(edicao).toContain(trecho);
  });

  it("nenhum campo da edição continua mandando undefined", () => {
    const chamada = edicao.slice(edicao.indexOf("updateLead({"), edicao.indexOf("});"));
    expect(chamada).not.toContain("undefined");
  });
});
