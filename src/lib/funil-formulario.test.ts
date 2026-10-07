import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// O formulário de lead só fecha quando gravou. Antes fechava sempre: um erro
// do servidor ou um orçamento não reconhecido apagava o que a decoradora
// tinha acabado de digitar.
const funil = readFileSync("src/pages/app/funil/page.tsx", "utf-8");

describe("formulário de lead preserva o que foi digitado", () => {
  it("só limpa e fecha depois de gravar", () => {
    expect(funil).toContain("if (!(await onSubmit(values, responsibleId))) return;");
    expect(funil).toContain("onSubmit: (values: LeadFormValues, responsibleId?: string) => Promise<boolean>;");
  });

  it("criar e editar dizem se gravaram — orçamento inválido e erro do servidor devolvem false", () => {
    for (const h of ["handleCreate", "handleEdit"]) {
      const i = funil.indexOf(`const ${h} = async`);
      const corpo = funil.slice(i, funil.indexOf("\n  };", i));
      expect(corpo).toContain("Promise<boolean>");
      expect(corpo.match(/return false;/g)?.length).toBeGreaterThanOrEqual(2);
      expect(corpo).toContain("return true;");
    }
  });
});
