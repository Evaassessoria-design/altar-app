import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// A TELA FALA DO TRABALHO DELA, NÃO DA ARQUITETURA
//
// Ela compra flores. Não "lança no livro-caixa", não "vincula transação", não
// "sincroniza". O vocabulário da tela era o do banco de dados, e o pior era o
// aviso: "fora do financeiro" acusa a decoradora de não ter feito um passo
// que ninguém explicou que existia.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A fonte sem comentário nenhum — inclusive os blocos `{/* … *\/}` do JSX.
 *
 * Aqui a explicação fala justamente das palavras que o código NÃO deve mais
 * mostrar ("fora do livro"), e filtrar só por linha deixaria passar o miolo
 * de um bloco, acusando a própria explicação. Já aconteceu três vezes neste
 * repositório; desta vez o filtro tira o bloco inteiro.
 */
const semComentarios = (p: string) =>
  readFileSync(p, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

/**
 * O corpo de uma função, do `{` que abre ao `}` que fecha.
 *
 * Antes isto era `slice(i, i + 700)`, e a janela fixa media o tamanho do
 * código em vez do que ele faz: acrescentar oito linhas a `aplicarDecisao`
 * empurrou `transactionId: undefined` para fora da janela e o teste passou a
 * acusar uma regressão que não existia. Um guarda que quebra quando a função
 * cresce ensina a mexer no teste — que é justamente o que ele deveria impedir.
 *
 * Conta chaves. Não entende string nem regex com chave solta dentro, e não
 * precisa: estas são funções de servidor, sem JSX.
 */
function corpoDaFuncao(fonte: string, assinatura: string): string {
  const inicio = fonte.indexOf(assinatura);
  if (inicio < 0) throw new Error(`não achei "${assinatura}" — a função foi renomeada?`);
  const abre = fonte.indexOf("{", inicio);
  let profundidade = 0;
  for (let i = abre; i < fonte.length; i++) {
    if (fonte[i] === "{") profundidade++;
    else if (fonte[i] === "}" && --profundidade === 0) return fonte.slice(inicio, i + 1);
  }
  throw new Error(`"${assinatura}" não fecha — a fonte está truncada?`);
}

const COMPRAS = semComentarios("src/pages/app/compras/page.tsx");
const PAINEL = semComentarios("src/pages/app/compras/_components/painel-de-compras.tsx");
const DECISAO = semComentarios("src/components/compras/decisao-da-despesa.tsx");
const PURCHASES = semComentarios("convex/purchases.ts");

describe("o vocabulário é o dela", () => {
  it("nenhum TEXTO da tela fala de entidade do banco", () => {
    // Olha o que ela LÊ, não os identificadores: `item.transactionId` é nome
    // de campo e ninguém o vê. O que não pode aparecer é a palavra do sistema
    // dentro de uma frase em português.
    // Só FRASES: um literal sem espaço é identificador ("foraDoLivro" é a
    // chave do filtro), e identificador ninguém lê.
    const textos = (fonte: string) =>
      [...fonte.matchAll(/"([^"\n]{8,})"|`([^`\n]{8,})`/g)]
        .map((m) => (m[1] ?? m[2]).toLowerCase())
        .filter((t) => t.includes(" "));

    for (const [nome, fonte] of [
      ["Compras", COMPRAS],
      ["Painel", PAINEL],
      ["Decisão", DECISAO],
    ] as const) {
      for (const texto of textos(fonte)) {
        for (const tecnico of ["transaction", "sincroniz", "fora do livro", "livro-caixa", "lançamento"]) {
          expect(texto, `${nome} mostra "${tecnico}" em "${texto}"`).not.toContain(tecnico);
        }
      }
    }
  });

  it("e 'fora do financeiro' virou 'custo não registrado'", () => {
    expect(PAINEL).toContain("custo não registrado");
    expect(PAINEL).not.toContain("fora do financeiro");
  });

  it("a ação diz o que ela faz: registrar o custo", () => {
    expect(COMPRAS).toContain("registrar custo");
    expect(COMPRAS).toContain("custo registrado");
    expect(COMPRAS).not.toContain("Lançar no financeiro");
    expect(COMPRAS).not.toContain("lançar no financeiro");
  });
});

describe("o momento 'comprei'", () => {
  it("oferece registrar o custo no mesmo gesto", () => {
    expect(COMPRAS).toContain('label: "Registrar custo"');
    expect(COMPRAS).toContain("handleLancarCusto(id)");
  });

  it("mas SÓ quando a aquisição virou compra e há preço", () => {
    // Necessidade, cotação e aprovado não põem dinheiro no livro. Item sem
    // preço não tem custo a registrar. E o que já tem custo não repete.
    expect(COMPRAS).toMatch(
      /status === "comprado" && !!item\.unitPrice && !item\.transactionId/,
    );
  });

  it("e nada é criado sozinho — a oferta é um toque, não um efeito colateral", () => {
    const i = COMPRAS.indexOf("const handleSetStatus");
    const corpo = COMPRAS.slice(i, COMPRAS.indexOf("const handleToggle", i));
    expect(corpo).not.toContain("await registerCost");
    expect(corpo).toContain("action:");
  });
});

describe("a decisão sobre o dinheiro", () => {
  it("é do servidor, não da tela — a tela só reage ao pedido", () => {
    // Se a regra morasse na tela, uma chamada direta pelo navegador cancelaria
    // a compra e deixaria a despesa órfã sem ninguém decidir nada.
    expect(PURCHASES).toContain("DECISAO_NECESSARIA");
    expect(PURCHASES).toContain("exigirDecisaoSobreADespesa");
    expect(COMPRAS).toContain('d.code !== "DECISAO_NECESSARIA"');
  });

  it("'manter' desvincula em vez de apagar", () => {
    const corpo = corpoDaFuncao(PURCHASES, "async function aplicarDecisao");
    expect(corpo).toMatch(/if \(decisao === "remover"\)/);
    expect(corpo).toContain("transactionId: undefined");
  });

  it("'remover' leva os comprovantes, com safeDeleteFile", () => {
    const corpo = corpoDaFuncao(PURCHASES, "async function aplicarDecisao");
    expect(corpo).toContain("safeDeleteFile");
    expect(corpo).toContain("lancamento.comprovantes");
  });

  it("e 'manter' grava a procedência ANTES de soltar o vínculo", () => {
    // A despesa sobrevive à compra; sem isto ela vira uma linha órfã no livro
    // que ninguém sabe, meses depois, se ainda vale. Dentro do `else` de
    // propósito: em "remover" não sobra despesa para lembrar de nada.
    const corpo = corpoDaFuncao(PURCHASES, "async function aplicarDecisao");
    expect(corpo).toContain("origemCompra");
    const origem = corpo.indexOf("origemCompra");
    const solta = corpo.indexOf("transactionId: undefined");
    expect(origem, "soltou o vínculo antes de guardar de onde veio").toBeLessThan(solta);
  });

  it("e a procedência NÃO dirige comportamento: nada a lê para decidir", () => {
    // `origemCompra` é memória, como `assemblyItems.compositionId`. Se alguma
    // condição passar a depender dela, a despesa volta a carregar vínculo com
    // outro nome — e a compra cancelada volta a calar a margem do evento.
    for (const fonte of [PURCHASES, semComentarios("convex/lib/custoDoEvento.ts")]) {
      expect(fonte).not.toMatch(/if\s*\([^)]*origemCompra/);
    }
  });

  it("e o diálogo nomeia o que se perde", () => {
    expect(DECISAO).toContain("pendente.valor");
    expect(DECISAO).toMatch(/já está paga/);
    expect(DECISAO).toMatch(/comprovante/);
    expect(DECISAO).toMatch(/Não há como desfazer/);
  });
});

describe("a sincronização não encosta no pagamento", () => {
  it("os campos que a compra dita são só os operacionais", () => {
    const i = PURCHASES.indexOf("function camposDaCompra");
    const corpo = PURCHASES.slice(i, PURCHASES.indexOf("}", PURCHASES.indexOf("return {", i)) + 1);
    for (const doPagamento of ["isPaid", "paidAt", "paymentMethod", "comprovantes", "notes"]) {
      expect(corpo, `a compra sobrescreve ${doPagamento}`).not.toContain(doPagamento);
    }
  });

  it("e a despesa nasce em aberto, sempre", () => {
    expect(PURCHASES).toMatch(/isPaid: false,/);
    expect(PURCHASES, "recebido ainda vira pago").not.toContain('isPaid: status === "recebido"');
  });

  it("a sincronização nunca cria lançamento", () => {
    const i = PURCHASES.indexOf("async function sincronizarLancamento");
    const corpo = PURCHASES.slice(i, i + 800);
    expect(corpo).toContain("if (!item.transactionId) return false;");
    expect(corpo, "a sincronização insere").not.toContain("ctx.db.insert");
  });
});

describe("mobile — auditoria estática", () => {
  it("as duas escolhas do diálogo ocupam a largura toda, empilhadas", () => {
    // São duas decisões de peso, não um sim/não: lado a lado num telefone de
    // 320px viram dois alvos apertados com consequências opostas.
    expect((DECISAO.match(/w-full cursor-pointer/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(DECISAO).toContain("space-y-2");
  });

  it("cada escolha explica a consequência embaixo, em vez de só um rótulo", () => {
    expect((DECISAO.match(/text-xs text-muted-foreground/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("nome longo de compra quebra em vez de estourar", () => {
    expect(DECISAO).toContain("break-words");
  });

  it("a oferta de registrar o custo é um toque no aviso, não um alvo novo na lista", () => {
    // A lista de Compras é usada em pé, no atacadão. Mais um link de 9px na
    // linha seria mais um alvo para errar.
    expect(COMPRAS).toContain("toast.success(`Item marcado como");
  });
});
