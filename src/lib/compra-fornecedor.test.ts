import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — a compra reaproveita o fornecedor que já está cadastrado.
//
// `purchaseItems.supplierId` existia no schema desde a rodada operacional, mas
// NENHUMA tela o preenchia: a decoradora redigitava "Flores de Aurora" a cada
// compra, e o histórico daquele fornecedor nunca se juntava.
//
// A ligação não pode custar UX: comprar fita de cetim não justifica cadastrar
// fornecedor. Por isso o texto livre continua sendo caminho válido.
// ─────────────────────────────────────────────────────────────────────────────

const TELA = readFileSync("src/pages/app/compras/page.tsx", "utf-8");

describe("o vínculo com o catálogo existe de verdade", () => {
  it("a tela lê o catálogo central da empresa", () => {
    expect(TELA).toContain("api.supplierCatalog.list");
  });

  it("escolher do catálogo grava o id E preenche o nome", () => {
    expect(TELA).toContain("setSupplierId(id || undefined)");
    expect(TELA).toContain('setValue("supplier", achado.companyName');
  });

  it("o id chega às duas mutations", () => {
    const criar = TELA.slice(TELA.indexOf("const handleAdd"), TELA.indexOf("const handleEdit"));
    const editar = TELA.slice(TELA.indexOf("const handleEdit"));
    expect(criar).toContain("supplierId:");
    expect(editar).toContain("supplierId:");
  });

  it("editar um item vinculado NÃO perde o vínculo", () => {
    expect(TELA).toContain("defaultSupplierId={editing.supplierId}");
  });
});

describe("o texto livre continua valendo", () => {
  it("o campo de digitar não foi removido", () => {
    expect(TELA).toContain('id="compra-fornecedor"');
    expect(TELA).toContain('placeholder="Floricultura ABC"');
  });

  it("sem catálogo, o seletor nem aparece", () => {
    // Conta nova, catálogo vazio: a tela não pode ficar pior do que era.
    expect(TELA).toContain("catalogo && catalogo.length > 0 &&");
  });

  it("digitar por cima DESFAZ o vínculo", () => {
    // Guardar um id que não corresponde mais ao nome escrito seria pior do
    // que não ter vínculo nenhum: o histórico apontaria para outra empresa.
    expect(TELA).toContain("onChange: () => setSupplierId(undefined)");
  });
});

describe("compatibilidade com o que já está gravado", () => {
  it("`supplier` (texto) continua sendo enviado junto do id", () => {
    // O snapshot textual é o histórico do que valia quando a compra nasceu.
    // Compra antiga só tem ele, e continua legível.
    const criar = TELA.slice(TELA.indexOf("const handleAdd"), TELA.indexOf("const handleEdit"));
    expect(criar).toContain("supplier: values.supplier || undefined");
  });

  it("limpar o vínculo usa null, não undefined", () => {
    // `undefined` é descartado no transporte do Convex — o vínculo antigo
    // ficaria. Esse bug já custou caro neste produto.
    const editar = TELA.slice(TELA.indexOf("const handleEdit"));
    expect(editar).toContain("(supplierId ?? null)");
  });
});
