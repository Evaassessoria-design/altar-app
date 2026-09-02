import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { entregarPdf } from "./pdf-delivery.ts";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — ENTREGA DE PDF EM UM LUGAR SÓ
//
// `doc.save()` do jsPDF dispara um `<a download>`. Em WebView de iOS esse
// atributo é ignorado: o botão não faz nada, sem erro visível. Se cada gerador
// chamar `save()` por conta própria, o dia em que o ALTAR virar aplicativo são
// cinco (ou seis, ou oito) arquivos para caçar.
//
// Então a regra é: quem desenha PDF NÃO entrega PDF. Entrega é do
// pdf-delivery.ts, e só dele.
// ─────────────────────────────────────────────────────────────────────────────

/** Todos os geradores de PDF do app, descobertos — não uma lista à mão. */
const GERADORES = readdirSync("src/lib")
  .filter((f) => f.startsWith("generate-") && f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .filter((f) => f.includes("pdf"));

/**
 * A fonte SEM linhas de comentário.
 *
 * Os cabeçalhos destes arquivos explicam justamente o que `doc.save()` faz de
 * errado no aplicativo — e um guarda que lê a prosa acusaria o comentário como
 * se fosse código. Já aconteceu neste projeto mais de uma vez.
 */
function codigoDe(arquivo: string): string {
  return readFileSync(`src/lib/${arquivo}`, "utf-8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("entrega de PDF centralizada", () => {
  it("encontra os geradores de PDF do app (a lista não pode estar vazia)", () => {
    // Se um dia a varredura parar de achar arquivo nenhum, as travas abaixo
    // passariam por vacuidade — e não seria trava nenhuma.
    expect(GERADORES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(GERADORES)("%s não chama doc.save() direto", (arquivo) => {
    expect(codigoDe(arquivo)).not.toMatch(/\.save\s*\(/);
  });

  it.each(GERADORES)("%s entrega pelo pdf-delivery", (arquivo) => {
    const codigo = codigoDe(arquivo);
    expect(codigo).toContain("entregarPdf");
    expect(codigo).toContain("pdf-delivery");
  });

  it("entregarPdf repassa nome e documento para o jsPDF (comportamento de hoje)", () => {
    const save = vi.fn();
    // Só o contrato usado por entregarPdf interessa aqui.
    entregarPdf({ save } as unknown as Parameters<typeof entregarPdf>[0], "ficha.pdf");
    expect(save).toHaveBeenCalledWith("ficha.pdf");
    expect(save).toHaveBeenCalledTimes(1);
  });
});
