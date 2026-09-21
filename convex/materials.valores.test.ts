import { describe, expect, it, vi } from "vitest";

// Mesma substituição de sessão dos demais testes de banco — ver test.auth.ts.
vi.mock("./auth", () => {
  const usuarioDaSessao = async (ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string; email?: string } | null> };
  }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { _id: identity.subject, email: identity.email ?? "", name: "Pessoa" };
  };
  return {
    authComponent: {
      safeGetAuthUser: usuarioDaSessao,
      getAuthUser: usuarioDaSessao,
      registerRoutes: () => {},
      adapter: () => ({}),
    },
    createAuth: () => ({}),
  };
});

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { autenticarComo } from "./test.auth";
import type { MutationCtx } from "./_generated/server";

// ═════════════════════════════════════════════════════════════════════════════
// O CUSTO DE REFERÊNCIA NÃO SOME NEM APODRECE
//
// ── OS DOIS DEFEITOS, QUE SÃO O MESMO ───────────────────────────────────────
// NA TELA: o diálogo do material lia o campo com `Number(texto.replace(",", "."))`
// e devolvia `null` quando não entendia. Só que `null` ali significa "apague
// este campo". Digitar "1.500,00" — que é como se escreve dinheiro no Brasil —
// produzia "1.500.00", depois `NaN`, depois `null`, e o custo era APAGADO com
// um "Material atualizado." em verde por cima.
//
// NO SERVIDOR: a guarda era `args.custoReferencia < 0`. Toda comparação com
// `NaN` é falsa, então ela deixava passar exatamente o valor que estraga tudo
// — um custo `NaN` contamina cada soma que o inclua, e o número errado aparece
// depois, longe de onde foi digitado.
//
// A margem já estava protegida (`margemValida` testa finitude e faixa). O
// custo, que é o campo de dinheiro, não estava.
// ═════════════════════════════════════════════════════════════════════════════

async function decoradoraComMaterial() {
  const t = convexTest(schema, modules);
  const dona = await autenticarComo(t, {
    nome: "Aurora", email: "aurora@ex.com", role: "user", subject: "auth|aurora",
  });
  const { materialId } = await dona.mutation(api.materials.create, {
    nome: "Rosa Avalanche",
    unidade: "haste",
    custoReferencia: 4.5,
  });
  return { t, dona, materialId };
}

describe("o servidor recusa o custo que não pode ser gravado", () => {
  it("NaN não passa — e era o único que a guarda antiga deixava entrar", async () => {
    const { dona, materialId } = await decoradoraComMaterial();
    await expect(
      dona.mutation(api.materials.update, { id: materialId, custoReferencia: Number.NaN }),
    ).rejects.toThrow(/custo em reais/i);
  });

  it("infinito também não", async () => {
    const { dona, materialId } = await decoradoraComMaterial();
    await expect(
      dona.mutation(api.materials.update, {
        id: materialId, custoReferencia: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow();
  });

  it("negativo continua recusado, com a frase de sempre", async () => {
    const { dona, materialId } = await decoradoraComMaterial();
    await expect(
      dona.mutation(api.materials.update, { id: materialId, custoReferencia: -1 }),
    ).rejects.toThrow(/negativo/i);
  });

  it("e a criação recusa os mesmos valores", async () => {
    const { dona } = await decoradoraComMaterial();
    for (const custoReferencia of [Number.NaN, Number.POSITIVE_INFINITY, -0.01]) {
      await expect(
        dona.mutation(api.materials.create, {
          nome: `Material ${String(custoReferencia)}`, unidade: "un", custoReferencia,
        }),
      ).rejects.toThrow();
    }
  });

  it("o custo bom continua passando, e o campo continua limpável", async () => {
    const { t, dona, materialId } = await decoradoraComMaterial();

    await dona.mutation(api.materials.update, { id: materialId, custoReferencia: 0 });
    expect((await t.run((ctx: MutationCtx) => ctx.db.get(materialId)))!.custoReferencia).toBe(0);

    // `null` LIMPA — e essa é justamente a operação que a tela disparava sem
    // querer. Ela tem de continuar existindo, só que quando alguém pede.
    await dona.mutation(api.materials.update, { id: materialId, custoReferencia: null });
    expect(
      (await t.run((ctx: MutationCtx) => ctx.db.get(materialId)))!.custoReferencia,
    ).toBeUndefined();
  });

  it("a margem continua sendo percentual, não dinheiro", async () => {
    const { dona, materialId } = await decoradoraComMaterial();
    await expect(
      dona.mutation(api.materials.update, { id: materialId, margemPercentual: 1500 }),
    ).rejects.toThrow(/percentual/i);
  });
});

describe("a tela lê dinheiro do jeito que se escreve dinheiro", () => {
  const DIALOGO = readFileSync("src/components/catalogo/material-dialog.tsx", "utf-8");

  it("usa o leitor único de valores, não `Number(replace)`", () => {
    // `Number("1.500.00")` é NaN. O módulo existe porque esse mesmo erro já
    // apareceu em cinco telas.
    expect(DIALOGO).toContain("valorDigitado");
    expect(DIALOGO).not.toMatch(/Number\(\s*\w+\.trim\(\)\.replace/);
  });

  it("distingue APAGAR de NÃO ENTENDI — eram a mesma resposta", () => {
    expect(DIALOGO).toContain('"erro"');
    // E o erro vira recado, não gravação.
    expect(DIALOGO).toMatch(/Custo não reconhecido/);
  });

  it("não grava nada quando não entendeu", () => {
    const i = DIALOGO.indexOf("const salvar");
    const corpo = DIALOGO.slice(i, i + 2200);
    const recusa = corpo.indexOf('custoLido === "erro"');
    const grava = corpo.indexOf("atualizar({");
    expect(recusa).toBeGreaterThan(-1);
    expect(recusa, "recusa depois de gravar").toBeLessThan(grava);
  });
});
