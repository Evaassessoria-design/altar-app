import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// TELA VAZIA PRECISA DIZER O PRÓXIMO PASSO — E TER COMO IR ATÉ ELE
//
// Uma decoradora que acabou de assinar encontra TODAS as telas vazias. É o
// estado normal dela na primeira semana, não uma exceção — e é onde ela decide
// se o produto faz sentido ou se precisa ligar para alguém.
//
// ── O DEFEITO QUE ISTO TRANCA ───────────────────────────────────────────────
// A Ficha Técnica, num evento novo, mostrava DUAS mensagens contraditórias:
//
//   "Nenhuma receita cadastrada ainda
//    Abra um item do Caderno de Montagem ABAIXO e diga do que ele é feito."
//
// e, logo abaixo:
//
//   "Este evento ainda não tem itens no Caderno de Montagem."
//
// Uma mandava abrir um item que a outra dizia não existir. Nenhuma das duas
// levava a lugar nenhum — e o Caderno de Montagem mora DENTRO do Questionário,
// em cada área, que não é um lugar que alguém adivinhe.
//
// O mesmo valia para o Projeto de Decoração: dizia de onde os itens vêm, sem
// dar o caminho.
//
// O teste lê o FONTE, como `posicionamento.test.ts` e `produto-generico.test.ts`.
// ═════════════════════════════════════════════════════════════════════════════

const ler = (caminho: string) => readFileSync(caminho, "utf-8");

/** O bloco `<Empty>…</Empty>` que contém um título. */
function blocosVazios(fonte: string): string[] {
  return [...fonte.matchAll(/<Empty>([\s\S]{0,2000}?)<\/Empty>/g)].map((m) => m[1]);
}

const FICHA = "src/pages/app/events/[id]/ficha-tecnica/page.tsx";
const PROJETO = "src/pages/app/events/[id]/projeto/page.tsx";

describe("a Ficha Técnica num evento SEM itens de montagem", () => {
  const fonte = ler(FICHA);

  it("separa 'sem itens' de 'sem receita' — são problemas diferentes", () => {
    // Um evento sem itens precisa cadastrar itens. Um evento com itens e sem
    // receita precisa abrir um item. Tratá-los como o mesmo estado foi o que
    // produziu as duas mensagens contraditórias.
    expect(fonte).toContain("const semItens =");
    expect(fonte).toMatch(/\{semItens \?/);
  });

  it("não manda mais abrir um item 'abaixo' quando não há item nenhum", () => {
    // A frase continua existindo — e está certa quando HÁ itens. O que não
    // pode é ela aparecer no caso em que a lista de baixo está vazia.
    const semItens = fonte.slice(fonte.indexOf("{semItens ?"), fonte.indexOf(") : !temFicha ?"));
    expect(semItens).not.toMatch(/abaixo/i);
    expect(semItens).toMatch(/Questionário/);
  });

  it("a lista de ambientes não renderiza quando não há item — nada de mensagem dupla", () => {
    expect(fonte).toContain("{!semItens && (!temFicha || aba ===");
    // E o texto solto que contradizia o estado vazio saiu.
    expect(fonte).not.toContain("Este evento ainda não tem itens no Caderno de Montagem.");
  });

  it("dá o caminho até onde os itens nascem", () => {
    expect(fonte).toMatch(/\/eventos\/\$\{id\}\/briefing/);
  });
});

describe("o Projeto de Decoração vazio leva ao Questionário", () => {
  const fonte = ler(PROJETO);

  it("tem botão, não só explicação", () => {
    const [bloco] = blocosVazios(fonte);
    expect(bloco).toContain("EmptyContent");
    expect(bloco).toMatch(/\/eventos\/\$\{id\}\/briefing/);
  });

  it("chama a tela pelo nome que aparece no menu do evento", () => {
    // "briefing" é o nome da ROTA; "Questionário" é o que está escrito no
    // cartão das Ações Rápidas. Mandar procurar por "briefing" é mandar
    // procurar uma palavra que não existe na tela.
    const [bloco] = blocosVazios(fonte);
    expect(bloco).toContain("Questionário");
    expect(bloco).not.toMatch(/no briefing/i);
  });
});

describe("toda tela vazia oferece a ação, não só o diagnóstico", () => {
  const TELAS_COM_ACAO_PROPRIA = [
    ["src/pages/app/acervo/page.tsx", "cadastrar a primeira peça"],
    ["src/pages/app/equipe/page.tsx", "adicionar o primeiro membro"],
    ["src/pages/app/events/[id]/acervo/page.tsx", "chegar à Ficha Técnica"],
    [PROJETO, "abrir o Questionário"],
  ] as const;

  it.each(TELAS_COM_ACAO_PROPRIA)("%s permite %s", (arquivo) => {
    const blocos = blocosVazios(ler(arquivo));
    expect(blocos.length, `${arquivo}: nenhum estado vazio encontrado`).toBeGreaterThan(0);
    for (const bloco of blocos) {
      expect(bloco, `${arquivo}: estado vazio sem ação`).toMatch(/EmptyContent/);
    }
  });

  it("nenhum estado vazio manda procurar uma tela pelo nome da rota", () => {
    // "abra o briefing", "vá em fichaTecnica", "veja em assemblyItems" — todos
    // mandam procurar uma palavra que não existe na interface.
    const TELAS = [
      FICHA,
      PROJETO,
      "src/pages/app/acervo/page.tsx",
      "src/pages/app/events/[id]/acervo/page.tsx",
      "src/pages/app/equipe/page.tsx",
    ];
    for (const arquivo of TELAS) {
      for (const bloco of blocosVazios(ler(arquivo))) {
        // Só o texto que a pessoa LÊ, entre as tags.
        const visivel = bloco.replace(/<[^>]*>/g, " ").replace(/\{[^}]*\}/g, " ");
        expect(visivel, `${arquivo}`).not.toMatch(
          /\b(assemblyItems|fichaTecnica|collectionItems|eventSuppliers|purchaseItems)\b/,
        );
      }
    }
  });
});
