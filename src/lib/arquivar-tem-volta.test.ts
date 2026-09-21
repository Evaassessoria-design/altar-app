import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// ARQUIVAR NÃO PODE SER PORTA DE UMA MÃO SÓ
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// A tela do Acervo só sabia arquivar. A lista pedia `listItems` SEM
// `incluirArquivados`, então o item arquivado sumia da tela — e não havia
// filtro nem botão para trazê-lo de volta.
//
// O botão de arquivar fica encostado em "Ajustar estoque", que é a ação mais
// frequente daquela tela, usada em pé no galpão. Um toque errado fazia 58
// vasos sumirem do acervo, de toda reserva nova e da própria lista. O único
// caminho de recuperação era o painel do Convex — quer dizer: ligar para o
// Matheus.
//
// O servidor SEMPRE aceitou `archived: false`. E a própria tela já tinha o
// estilo do item arquivado escrito (`opacity-60`), num ramo que nunca
// renderizava: a intenção estava lá, faltava o caminho.
//
// ── A REGRA ─────────────────────────────────────────────────────────────────
// Onde há arquivar, há desarquivar — e há como VER o que foi arquivado. Vale
// para o catálogo de materiais, a biblioteca de composições, o catálogo de
// fornecedores e o acervo, que eram três acertos e um esquecimento.
// ═════════════════════════════════════════════════════════════════════════════

const ler = (f: string) => readFileSync(f, "utf-8");

/** Toda superfície onde a decoradora arquiva alguma coisa. */
const ARQUIVAM = [
  ["acervo", "src/pages/app/acervo/page.tsx"],
  ["catálogo (material)", "src/components/catalogo/material-dialog.tsx"],
  ["catálogo (composição)", "src/components/catalogo/composicao-dialog.tsx"],
  ["fornecedores", "src/pages/app/fornecedores/page.tsx"],
] as const;

describe("toda tela que arquiva também desarquiva", () => {
  it.each(ARQUIVAM)("%s oferece o caminho de volta", (_nome, arquivo) => {
    const fonte = ler(arquivo);
    // O gesto é o mesmo botão alternando, não uma tela nova: o estado atual do
    // registro decide o que ele faz.
    expect(fonte).toMatch(/Reativar|Trazer de volta|desarquiv/i);
  });
});

describe("o acervo, que era o esquecimento", () => {
  const ACERVO = ler("src/pages/app/acervo/page.tsx");

  it("pede os arquivados quando ela marca o filtro", () => {
    expect(ACERVO).toMatch(/listItems,\s*\{\s*incluirArquivados: verArquivados\s*\}/);
  });

  it("o filtro fica FORA do bloco da lista", () => {
    // Quem arquivou a última peça cai no estado vazio — e é exatamente essa
    // pessoa que precisa achar o caminho de volta. Um filtro que mora junto da
    // busca some justamente quando é necessário.
    const filtro = ACERVO.indexOf("Ver arquivados");
    const lista = ACERVO.indexOf("{itens === undefined ? (");
    expect(filtro).toBeGreaterThan(-1);
    expect(filtro, "o filtro está dentro do bloco da lista").toBeLessThan(lista);
  });

  it("o botão alterna, e o rótulo acessível acompanha", () => {
    expect(ACERVO).toMatch(/item\.archived \? `Reativar \$\{item\.nome\}`/);
    expect(ACERVO).toContain("ArchiveRestore");
  });

  it("a pergunta de arquivar diz onde encontrar o que sumiu", () => {
    // "Sai das reservas novas" era verdade e não bastava: não dizia que dava
    // para voltar, nem por onde.
    const i = ACERVO.indexOf("Arquivar \"${nome}\"");
    expect(i).toBeGreaterThan(-1);
    expect(ACERVO.slice(i, i + 300)).toMatch(/Ver arquivados/);
  });

  it("e desarquivar NÃO pergunta — não há perda a confirmar", () => {
    // Confirmação para tudo ensina a clicar em "sim" sem ler.
    const i = ACERVO.indexOf("const handleArquivar");
    const corpo = ACERVO.slice(i, i + 1400);
    expect(corpo).toMatch(/!arquivado &&\s*!window\.confirm/);
  });
});
