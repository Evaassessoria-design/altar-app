import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — TEXTO LIVRE NÃO MORA EM CAMPO DE UMA LINHA
//
// "Observações" do lead era um `<Input>`. Texto longo corre para o lado, some
// do campo de visão, e não dá para reler o que se escreveu — num campo que
// existe justamente para escrever à mão no meio de um atendimento.
//
// A regra: rótulo "Observação(ões)" ou "Notas" → AutoTextarea, que cresce para
// baixo até um teto e depois rola.
//
// Isto NÃO vale para "Descrição" de lançamento financeiro ou de item de
// orçamento: apesar do nome, são títulos de uma linha ("Honorários de
// decoração"). Campo curto continua `<Input>` de propósito.
// ─────────────────────────────────────────────────────────────────────────────

const TELAS = execSync(
  "find src/pages src/components -name '*.tsx' -not -name '*.test.tsx'",
  { encoding: "utf-8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

function codigoDe(arquivo: string): string {
  return readFileSync(arquivo, "utf-8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("campos de texto livre", () => {
  it("a varredura encontra telas", () => {
    expect(TELAS.length).toBeGreaterThan(50);
  });

  it("rótulo Observação/Observações nunca é seguido de <Input>", () => {
    const infratores = TELAS.filter((f) =>
      /<Label[^>]*>\s*Observaç(ão|ões)\s*<\/Label>\s*<Input[\s>]/.test(codigoDe(f)),
    );
    expect(infratores).toEqual([]);
  });

  it("campo com placeholder de notas nunca é <Input>", () => {
    const infratores = TELAS.filter((f) =>
      /<Input[^>]*placeholder="Notas/i.test(codigoDe(f)),
    );
    expect(infratores).toEqual([]);
  });

  it("o AutoTextarea é o componente compartilhado — não há cópia local", () => {
    // Uma segunda implementação de auto-resize dividiria o comportamento em
    // dois, e só uma delas receberia a próxima correção.
    const copias = TELAS.filter((f) => /style\.height\s*=\s*[`"']?\$?\{?scrollHeight/.test(codigoDe(f)));
    expect(copias).toEqual([]);
  });

  it("as telas de texto livre importam o componente compartilhado", () => {
    const esperadas = [
      "src/pages/app/funil/page.tsx",
      "src/pages/app/compras/page.tsx",
      "src/pages/app/equipe/page.tsx",
      "src/pages/app/financeiro/page.tsx",
      "src/pages/app/fornecedores/page.tsx",
      "src/pages/app/events/_components/event-form-dialog.tsx",
      "src/pages/app/events/[id]/checklist/page.tsx",
      "src/pages/app/events/[id]/orcamento/page.tsx",
    ];
    const semImport = esperadas.filter((f) => !codigoDe(f).includes("auto-textarea"));
    expect(semImport).toEqual([]);
  });
});
