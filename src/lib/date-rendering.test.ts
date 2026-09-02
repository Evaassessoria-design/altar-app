import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — NENHUMA TELA FORMATA DATA NA MÃO
//
// O Painel Admin caiu inteiro em produção porque uma célula chamava
// `format(new Date(campo))` direto. `format()` LANÇA em data inválida, e uma
// exceção dentro do render derruba tudo até o ErrorBoundary.
//
// A regra vale para o app inteiro, não só para a tela que caiu:
//
//   · carimbo de tempo (epoch ms, ISO) → safe-date.ts
//   · data de evento / vencimento      → event-date.ts (ancora ao meio-dia)
//
// Ambos devolvem "—" no lugar de lançar. Os módulos de PDF ficam de fora: lá o
// `format(new Date())` é a data de HOJE, gerada na hora, que nunca é inválida.
// ─────────────────────────────────────────────────────────────────────────────

/** Telas e componentes — o que roda dentro do React. */
const TELAS = execSync(
  "find src/pages src/components -name '*.tsx' -not -name '*.test.tsx'",
  { encoding: "utf-8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

/** O arquivo sem comentários: a prosa aqui em cima cita os padrões proibidos. */
function codigoDe(arquivo: string): string {
  return readFileSync(arquivo, "utf-8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("formatação de data nas telas", () => {
  it("a varredura encontra telas (senão a trava não trava nada)", () => {
    expect(TELAS.length).toBeGreaterThan(50);
  });

  it("nenhuma tela chama format(new Date(<campo>)) — só safe-date/event-date", () => {
    const infratores = TELAS.filter((f) =>
      // `format(new Date(), ...)` sem argumento é a data de hoje: sempre válida.
      /format\(\s*new Date\([^)]/.test(codigoDe(f)),
    );
    expect(infratores).toEqual([]);
  });

  it("nenhuma tela concatena hora numa data para depois parsear", () => {
    // Foi exatamente isto que quebrou: nextEventDate + "T12:00:00" virava
    // "2026-10-10T18:00T12:00:00" quando o valor já tinha hora.
    const infratores = TELAS.filter((f) => {
      const c = codigoDe(f);
      return /new Date\(\s*[`"']?\$?\{?[\w.]+\s*\+?\s*[`"']T\d{2}:\d{2}/.test(c);
    });
    expect(infratores).toEqual([]);
  });

  it("nenhuma tela mostra data por toLocaleDateString direto", () => {
    // Não lança, mas escreve "Invalid Date" na cara da pessoa.
    const infratores = TELAS.filter((f) =>
      /new Date\([^)]*\)\.toLocale(Date|Time)String/.test(codigoDe(f)),
    );
    expect(infratores).toEqual([]);
  });
});
