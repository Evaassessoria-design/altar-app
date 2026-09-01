import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA: controle de operação não pode sumir no celular.
//
// A situação da compra nasceu dentro de `hidden sm:block`. No desktop parecia
// pronta; num telefone o controle simplesmente não existia — e o celular é
// justamente onde a decoradora opera, no galpão e no dia da montagem.
//
// O teste lê as telas operacionais e falha se um controle interativo estiver
// escondido abaixo de `sm`. Esconder DECORAÇÃO (um rótulo redundante, um
// ícone) continua permitido; esconder um `<select>`, `<button>` ou `<input>`
// não.
// ─────────────────────────────────────────────────────────────────────────────

const TELAS_OPERACIONAIS = [
  "src/pages/app/compras/page.tsx",
  "src/pages/app/events/[id]/_components/assembly-items-section.tsx",
  "src/pages/app/events/[id]/checklist/page.tsx",
  "src/components/attention-board.tsx",
];

/** Blocos `hidden sm:*` / `hidden md:*` e o que vem logo dentro deles. */
function blocosEscondidosNoCelular(fonte: string): string[] {
  const blocos: string[] = [];
  const re = /className=\{?["'`][^"'`]*\bhidden\s+(?:sm|md|lg):(?:block|flex|inline|inline-flex|grid)\b[^"'`]*["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    // Olha os ~400 caracteres seguintes: o conteúdo imediato do elemento.
    blocos.push(fonte.slice(m.index, m.index + 400));
  }
  return blocos;
}

describe("telas operacionais funcionam no celular", () => {
  it.each(TELAS_OPERACIONAIS)("%s não esconde controle interativo abaixo de sm", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    for (const bloco of blocosEscondidosNoCelular(fonte)) {
      const temControle = /<(select|button|input|textarea|StatusPill|StatusSelect)\b/.test(bloco);
      expect(
        temControle,
        `${arquivo}: um controle interativo está dentro de um bloco escondido no celular.\n` +
          `Trecho: ${bloco.slice(0, 160)}`,
      ).toBe(false);
    }
  });

  it("o teste realmente detecta o padrão que procura", () => {
    // Contraprova: sem isto, um regex quebrado faria o teste passar sempre.
    const exemploRuim = '<div className="hidden sm:block"><select value={x}></select></div>';
    const blocos = blocosEscondidosNoCelular(exemploRuim);
    expect(blocos).toHaveLength(1);
    expect(/<select\b/.test(blocos[0])).toBe(true);
  });
});
