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

describe("os outros formulários com o mesmo defeito", () => {
  it("Novo/Editar evento só fecha quando gravou, e mostra o erro de quem não trata", () => {
    const d = readFileSync("src/pages/app/events/_components/event-form-dialog.tsx", "utf-8");
    expect(d).toContain("if (ok === false) return;");
    expect(d).toMatch(/catch \(e\) \{[\s\S]{0,300}toast\.error[\s\S]{0,200}return;/);
    const lista = readFileSync("src/pages/app/events/page.tsx", "utf-8");
    expect(lista.match(/return false;/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("compra e membro da equipe também", () => {
    const compras = readFileSync("src/pages/app/compras/page.tsx", "utf-8");
    expect(compras).toContain("if ((await onSubmit(values, supplierId, responsibleId)) === false) return;");
    expect(compras).not.toMatch(/if \(!numeros\) return;/);
    const equipe = readFileSync("src/pages/app/equipe/page.tsx", "utf-8");
    expect(equipe).toContain("if ((await onSubmit(values)) === false) return;");
  });
});
