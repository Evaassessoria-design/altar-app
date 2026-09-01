import { describe, expect, it } from "vitest";
import { convexToJson, jsonToConvex } from "convex/values";
import { readFileSync } from "node:fs";
import { limparCampos } from "./lib/limparCampos";

// ─────────────────────────────────────────────────────────────────────────────
// LIMPAR UM CAMPO OPCIONAL
//
// Bug encontrado na auditoria do MASTER #3: apagar um campo não apagava nada.
// A tela mandava `undefined`, a serialização do Convex descartava a chave, o
// handler não via o campo — e o toast dizia "atualizado!".
//
// Estes testes prendem as três pontas: a causa raiz (transporte), a tradução
// (handler) e as telas que fazem o pedido.
// ─────────────────────────────────────────────────────────────────────────────

const HANDLERS = {
  "assemblyItems.ts": readFileSync(new URL("./assemblyItems.ts", import.meta.url), "utf8"),
  "purchases.ts": readFileSync(new URL("./purchases.ts", import.meta.url), "utf8"),
  "funil.ts": readFileSync(new URL("./funil.ts", import.meta.url), "utf8"),
};

describe("a causa raiz: o que sobrevive ao transporte", () => {
  it("`undefined` é DESCARTADO — por isso o campo nunca era limpo", () => {
    const enviado = convexToJson({ id: "abc", quantity: undefined });
    expect(enviado).toEqual({ id: "abc" });
    expect(Object.keys(jsonToConvex(enviado) as object)).toEqual(["id"]);
  });

  it("`null` sobrevive — é o único sinal de limpeza que chega ao servidor", () => {
    const enviado = convexToJson({ id: "abc", quantity: null });
    const recebido = jsonToConvex(enviado) as Record<string, unknown>;
    expect(Object.keys(recebido).sort()).toEqual(["id", "quantity"]);
    expect(recebido.quantity).toBeNull();
  });
});

describe("limparCampos", () => {
  it("traduz `null` para `undefined`, que é o que o patch remove", () => {
    expect(limparCampos({ quantity: null, unit: "un" })).toEqual({
      quantity: undefined,
      unit: "un",
    });
  });

  it("mantém a chave presente — sem ela o patch não removeria nada", () => {
    expect(Object.keys(limparCampos({ quantity: null }))).toEqual(["quantity"]);
  });

  it("não inventa campo: chave ausente continua ausente", () => {
    expect(Object.keys(limparCampos({ unit: "un" }))).toEqual(["unit"]);
  });

  it("preserva zero e string vazia — não são pedidos de limpeza", () => {
    expect(limparCampos({ quantity: 0, unit: "", notes: false })).toEqual({
      quantity: 0,
      unit: "",
      notes: false,
    });
  });
});

describe("os handlers aplicam a tradução — não só a declaram", () => {
  it.each([
    ["assemblyItems.ts", "...limparCampos(fields),"],
    ["purchases.ts", "const limpos = limparCampos(fields);"],
    ["funil.ts", "await ctx.db.patch(id, limparCampos(fields));"],
  ])("%s passa o patch por limparCampos", (arquivo, trecho) => {
    const fonte = HANDLERS[arquivo as keyof typeof HANDLERS];
    expect(fonte).toContain('from "./lib/limparCampos"');
    expect(fonte).toContain(trecho);
  });

  it("purchases não escapa da limpeza no ramo que reajusta isPurchased", () => {
    // Havia dois caminhos de patch. Se um deles usasse `fields` cru, apagar um
    // campo funcionaria ou não dependendo de a situação ter mudado junto.
    expect(HANDLERS["purchases.ts"]).toContain("{ ...limpos, isPurchased:");
    expect(HANDLERS["purchases.ts"]).not.toContain("{ ...fields, isPurchased:");
  });
});

describe("os validadores aceitam o pedido de limpeza", () => {
  it("assemblyItems aceita limpar a classificação e a quantidade", () => {
    const fonte = HANDLERS["assemblyItems.ts"];
    expect(fonte).toContain("quantity: v.optional(v.union(v.number(), v.null()))");
    // "Sem classificação" precisa ser um valor enviável, não uma ausência.
    expect(fonte).toContain('v.literal("nao_incluso"),');
    expect(fonte).toMatch(/projectScope: v\.optional\(\s*v\.union\([\s\S]{0,400}?v\.null\(\)/);
  });

  it("compras aceita limpar todo campo que o formulário de edição esvazia", () => {
    const fonte = HANDLERS["purchases.ts"];
    for (const campo of [
      "category",
      "quantity",
      "unit",
      "supplier",
      "unitPrice",
      "notes",
      "responsible",
      "dueDate",
    ]) {
      expect(fonte).toMatch(
        new RegExp(`${campo}: v\\.optional\\(v\\.union\\(v\\.\\w+\\(\\), v\\.null\\(\\)\\)\\)`),
      );
    }
  });

  it("funil aceita limpar orçamento, data e contato do lead", () => {
    const fonte = HANDLERS["funil.ts"];
    for (const campo of ["budget", "eventDate", "clientPhone", "eventType", "notes"]) {
      expect(fonte).toMatch(
        new RegExp(`${campo}: v\\.optional\\(v\\.union\\(v\\.\\w+\\(\\), v\\.null\\(\\)\\)\\)`),
      );
    }
  });

  it("o nome do item continua obrigatório de verdade — limpar não é opção", () => {
    // Um item de compra sem nome é uma linha fantasma na lista.
    expect(HANDLERS["purchases.ts"]).toContain("name: v.optional(v.string()),");
  });
});
