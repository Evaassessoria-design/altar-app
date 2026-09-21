import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// O QUE APAGA PERGUNTA ANTES
//
// O ALTAR já confirmava em quase toda parte: excluir evento, excluir
// fornecedor do evento, excluir item de orçamento, excluir documento do lead,
// arquivar material, arquivar item de acervo, liberar reserva.
//
// Faltava uma — e era a que custava mais.
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// "Excluir item" no Caderno de Montagem: um clique, sem pergunta. Levava junto
//   · a RECEITA, de que a Ficha Técnica depende;
//   · a foto de REFERÊNCIA e a do CONTRATADO, que saem do storage e não voltam.
//
// As duas fotos são a prova do que foi combinado com a cliente. E o botão fica
// dentro do Questionário, onde a decoradora trabalha depressa, com o cartão do
// item aberto.
//
// ── O QUE ESTE TESTE NÃO EXIGE ──────────────────────────────────────────────
// Confirmação para o que é REVERSÍVEL e visível. Arquivar um fornecedor é um
// campo de data que a própria tela desfaz com o filtro "ver arquivados";
// pedir confirmação ali é atrito sem ganho. A regra é sobre PERDA, não sobre
// gravidade aparente.
// ═════════════════════════════════════════════════════════════════════════════

const ler = (caminho: string) => readFileSync(caminho, "utf-8");

/**
 * Telas da decoradora onde um clique APAGA dado que não volta.
 *
 * Cada entrada é [arquivo, mutation]. Quando uma tela nova chamar uma mutation
 * que apaga, ela entra aqui — e o teste exige a pergunta.
 */
const APAGAM_DE_VERDADE: readonly (readonly [string, string])[] = [
  ["src/pages/app/events/[id]/_components/assembly-items-section.tsx", "assemblyItems.remove"],
  ["src/pages/app/events/[id]/page.tsx", "events.remove"],
  ["src/pages/app/events/page.tsx", "events.remove"],
  ["src/pages/app/events/[id]/fornecedores/page.tsx", "suppliers.remove"],
  ["src/pages/app/events/[id]/orcamento/page.tsx", "orcamento.deleteItem"],
  ["src/pages/app/funil/_components/lead-documents.tsx", "leadDocuments.remove"],
  ["src/pages/app/events/[id]/acervo/page.tsx", "acervo.liberarReserva"],
  // Apaga o lançamento de despesa que a compra gerou no Financeiro. A compra
  // fica; o dinheiro sai do livro — e não há lixeira.
  ["src/pages/app/compras/page.tsx", "purchases.unregisterCost"],
];

describe("nenhuma exclusão acontece sem pergunta", () => {
  it.each(APAGAM_DE_VERDADE)("%s confirma antes de %s", (arquivo) => {
    const fonte = ler(arquivo);
    const pergunta = /window\.confirm|<AlertDialog/.test(fonte);
    expect(pergunta, `${arquivo}: apaga sem perguntar`).toBe(true);
  });
});

describe("a exclusão do item de montagem diz o que se perde", () => {
  const fonte = ler("src/pages/app/events/[id]/_components/assembly-items-section.tsx");

  it("pergunta antes, e não depois de chamar a mutation", () => {
    const trecho = fonte.slice(
      fonte.indexOf("Excluir item") - 1600,
      fonte.indexOf("Excluir item"),
    );
    const confirma = trecho.lastIndexOf("window.confirm");
    const chama = trecho.lastIndexOf("onRemove(");
    expect(confirma, "sem confirmação").toBeGreaterThan(-1);
    expect(confirma, "confirma DEPOIS de apagar").toBeLessThan(chama);
  });

  it("avisa da receita e das fotos — não de 'este registro'", () => {
    // Um aviso genérico não deixa ninguém decidir. Quem vai perder a foto do
    // contratado precisa ler "as fotos anexadas".
    expect(fonte).toMatch(/receita da ficha técnica/i);
    expect(fonte).toMatch(/fotos anexadas/i);
    expect(fonte).toMatch(/desfazer/i);
  });

  it("não promete perda que não vai acontecer", () => {
    // Item sem receita e sem foto não pode ler "você perde as fotos". O aviso
    // é montado a partir do que o item TEM.
    expect(fonte).toContain("const perdas = [");
    expect(fonte).toContain(".filter(Boolean)");
  });

  it("o nome do item aparece no aviso", () => {
    // "Excluir item?" com três itens abertos na tela não diz qual.
    const trecho = fonte.slice(fonte.indexOf("const aviso ="), fonte.indexOf("if (!window.confirm"));
    expect(trecho).toContain("${item.name}");
  });
});

describe("arquivar não é apagar — e não precisa de pergunta", () => {
  it("arquivar fornecedor continua sendo um clique", () => {
    // Trava ao contrário: se alguém acrescentar confirmação aqui "por
    // simetria", está pondo atrito numa ação que a própria tela desfaz.
    const fonte = ler("src/pages/app/fornecedores/page.tsx");
    expect(fonte).toContain("setArchived");
    // A tela mostra os arquivados, que é o que torna a ação reversível à vista.
    expect(fonte).toMatch(/verArquivados|includeArchived/);
  });

  it("e a mutation de arquivar realmente não apaga nada", () => {
    const backend = ler("convex/supplierCatalog.ts");
    const bloco = backend.slice(
      backend.indexOf("export const setArchived"),
      backend.indexOf("\n});", backend.indexOf("export const setArchived")),
    );
    expect(bloco).not.toContain("ctx.db.delete");
    expect(bloco).not.toContain("ctx.storage.delete");
  });
});
