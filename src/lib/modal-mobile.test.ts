import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — MODAL ALCANÇÁVEL NO CELULAR
//
// O modal é `fixed` e centrado por `translate-y-[-50%]`. Sem teto de altura,
// um formulário mais alto que a tela transborda para CIMA e para BAIXO ao
// mesmo tempo — e, por ser `fixed`, rolar a página atrás não traz nada de
// volta. O botão "Salvar" fica fisicamente inalcançável.
//
// Não é hipótese de tela pequena: com o teclado aberto num aparelho de 320 a
// 430px, quase todo formulário do ALTAR passa da altura disponível.
//
// O conserto é no primitivo, não em vinte telas: teto de altura mais rolagem
// interna. Vale para os 20 diálogos do sistema de uma vez.
// ─────────────────────────────────────────────────────────────────────────────

const DIALOG = readFileSync("src/components/ui/dialog.tsx", "utf-8");
/** Só o className do DialogContent — `{...props}` aparece antes, noutros componentes. */
const inicio = DIALOG.indexOf('data-slot="dialog-content"');
const conteudo = DIALOG.slice(inicio, DIALOG.indexOf("{...props}", inicio));

describe("DialogContent", () => {
  it("tem teto de altura preso ao tamanho da tela", () => {
    expect(conteudo).toMatch(/max-h-\[calc\(100[sd]vh/);
  });

  it("usa unidade de viewport que respeita a barra do navegador", () => {
    // `vh` no celular é a tela COM a barra recolhida — maior que o espaço real.
    // Um teto em `vh` continuaria deixando o rodapé do modal fora.
    expect(conteudo).not.toMatch(/max-h-\[calc\(100vh/);
  });

  it("rola por dentro quando o conteúdo passa do teto", () => {
    expect(conteudo).toContain("overflow-y-auto");
  });

  it("continua ocupando a largura disponível sem estourar", () => {
    expect(conteudo).toContain("max-w-[calc(100%-2rem)]");
  });

  it("e continua limitado no desktop — nada de modal de tela cheia", () => {
    expect(conteudo).toContain("sm:max-w-lg");
  });
});
