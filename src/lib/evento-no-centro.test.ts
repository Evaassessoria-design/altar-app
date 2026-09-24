import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { paginasInternasDoEvento } from "../vitest.arquivos.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O EVENTO É O CENTRO — E TODA TELA DELE DIZ DE QUAL EVENTO SE TRATA
//
// A decoradora trabalha com vários eventos ao mesmo tempo, frequentemente em
// abas diferentes. Uma tela de evento que não diz QUAL evento é uma tela em
// que ela pode lançar a compra no casamento errado.
//
// ── O QUE ISTO TRANCA ───────────────────────────────────────────────────────
// Duas telas destoavam:
//  · Fornecedores voltava por "Voltar ao evento" — não dizia qual;
//  · Planta voltava por uma seta sozinha, sem texto e sem rótulo acessível,
//    num alvo de toque do tamanho do ícone.
//
// Todas as outras já voltavam pelo NOME do evento, e é o padrão.
// ═════════════════════════════════════════════════════════════════════════════

const TELAS_DO_EVENTO = paginasInternasDoEvento();

const ler = (caminho: string) => readFileSync(caminho, "utf-8");

/**
 * Só o que a tela DESENHA.
 *
 * Tira os comentários de bloco (`/* … *\/` e `{/* … *\/}`) e os de linha: o
 * comentário que explica um defeito cita a frase defeituosa de propósito, e é
 * justamente ela que não pode sumir junto com a correção.
 */
const codigoDe = (caminho: string) =>
  ler(caminho)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

describe("toda tela dentro de um evento volta para ele", () => {
  it("existem telas para conferir", () => {
    // Se o `find` mudar de forma, o teste vira um passa-tudo silencioso.
    expect(TELAS_DO_EVENTO.length).toBeGreaterThanOrEqual(8);
  });

  it.each(TELAS_DO_EVENTO)("%s tem o caminho de volta", (arquivo) => {
    expect(ler(arquivo)).toMatch(/to=\{`\/eventos\/\$\{id\}`\}/);
  });

  it.each(TELAS_DO_EVENTO)("%s diz de qual evento se trata", (arquivo) => {
    // Ou no link de volta, ou no cabeçalho logo abaixo dele — as duas formas
    // existem no produto. O que não pode é a tela não dizer em lugar nenhum.
    const fonte = ler(arquivo);
    expect(fonte, `${arquivo}: nenhuma menção ao nome do evento`).toMatch(
      /\{event\??\.name/,
    );
  });

  it("nenhuma volta genérica: 'voltar ao evento' não diz qual", () => {
    for (const arquivo of TELAS_DO_EVENTO) {
      expect(codigoDe(arquivo), arquivo).not.toMatch(/Voltar ao evento/i);
    }
  });
});

describe("link só de ícone tem nome para quem não o vê", () => {
  it("a volta da Planta é rotulada", () => {
    const fonte = ler("src/pages/app/events/[id]/planta/page.tsx");
    const bloco = fonte.slice(
      fonte.indexOf("to={`/eventos/${id}`}"),
      fonte.indexOf("</Link>", fonte.indexOf("to={`/eventos/${id}`}")),
    );
    expect(bloco).toContain("aria-label=");
    // E o alvo de toque cresce sem mexer no espaçamento em volta.
    expect(bloco).toMatch(/-m-2 p-2|p-2\.5|min-h-9/);
  });
});
