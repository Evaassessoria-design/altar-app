import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FORMAS_DE_PAGAMENTO,
  MIMES_DE_COMPROVANTE,
  TIPOS_DE_COMPROVANTE,
  contagemDeComprovantes,
  pagoSemComprovante,
  temComprovante,
} from "./comprovante-financeiro.ts";

// ═════════════════════════════════════════════════════════════════════════════
// "QUAIS PAGAMENTOS EU JÁ DEI BAIXA E AINDA NÃO TÊM COMPROVANTE?"
//
// É a pergunta que o pedido das decoradoras esconde. Anexar comprovante e dar
// baixa são eixos separados — e é justamente a separação que cria a pergunta.
// ═════════════════════════════════════════════════════════════════════════════

const semComentarios = (p: string) =>
  readFileSync(p, "utf-8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

const TELA = semComentarios("src/pages/app/financeiro/page.tsx");
const DIALOGO = semComentarios("src/components/financeiro/recebimento-dialog.tsx");

const receita = (over: Partial<Parameters<typeof pagoSemComprovante>[0]> = {}) => ({
  type: "income",
  isPaid: true,
  ...over,
});

describe("pago sem comprovante", () => {
  it("receita paga e sem anexo é o alvo", () => {
    expect(pagoSemComprovante(receita())).toBe(true);
    expect(pagoSemComprovante(receita({ comprovantes: [] }))).toBe(true);
  });

  it("com anexo, sai da lista", () => {
    expect(pagoSemComprovante(receita({ comprovantes: [{ storageId: "a" }] }))).toBe(false);
  });

  it("pendente NÃO é cobrança de comprovante", () => {
    // Ninguém tem comprovante de dinheiro que ainda não entrou.
    expect(pagoSemComprovante(receita({ isPaid: false }))).toBe(false);
  });

  it("DESPESA paga e sem anexo também é alvo", () => {
    // Era o contrário aqui, com a justificativa de que o produto não anexava
    // em despesa. Passou a anexar — o clipe está em toda linha, o diálogo
    // troca "Recebido" por "Pago" e a mutation nunca olhou o tipo. Só o filtro
    // não tinha sabido, e afirmava um número menor do que o trabalho real.
    //
    // Nota de fornecedor pago é justamente o documento que a contabilidade
    // cobra. Deixá-lo fora da lista era esconder a metade que mais dói.
    expect(pagoSemComprovante({ type: "expense", isPaid: true })).toBe(true);
  });

  it("despesa com anexo sai da lista, como a receita", () => {
    expect(
      pagoSemComprovante({ type: "expense", isPaid: true, comprovantes: [{ storageId: "s1" }] }),
    ).toBe(false);
  });

  it("despesa NÃO paga continua fora — não há prova de pagamento que não houve", () => {
    // O limite que sobrou, e é o certo: cobrar comprovante de parcela futura
    // viraria ruído sobre o livro inteiro.
    expect(pagoSemComprovante({ type: "expense", isPaid: false })).toBe(false);
  });
});

describe("os rótulos não mentem", () => {
  it("contagem só existe quando há o que contar", () => {
    expect(contagemDeComprovantes(0)).toBeNull();
    expect(contagemDeComprovantes(-1)).toBeNull();
    expect(contagemDeComprovantes(1)).toBe("1 comprovante");
    expect(contagemDeComprovantes(3)).toBe("3 comprovantes");
  });

  it("temComprovante lida com ausente, vazio e cheio", () => {
    expect(temComprovante({ type: "income", isPaid: true })).toBe(false);
    expect(temComprovante({ type: "income", isPaid: true, comprovantes: [] })).toBe(false);
    expect(temComprovante({ type: "income", isPaid: true, comprovantes: [{ storageId: "a" }] })).toBe(true);
  });
});

describe("forma de pagamento é sugestão, não lista fechada", () => {
  it("as comuns estão lá", () => {
    expect(FORMAS_DE_PAGAMENTO).toContain("PIX");
    expect(FORMAS_DE_PAGAMENTO).toContain("Boleto");
  });

  it("e o campo é TEXTO — `datalist`, nunca `select`", () => {
    // A leitura de contrato por IA já produz este campo como texto livre;
    // fechar aqui deixaria de fora "permuta", que em decoração acontece.
    expect(DIALOGO).toContain('list="formas-de-pagamento"');
    expect(DIALOGO).toContain("<datalist");
    expect(DIALOGO).not.toMatch(/<select[\s\S]{0,200}forma/i);
  });
});

describe("a tela separa evidência de decisão", () => {
  it("o diálogo tem DUAS ações distintas", () => {
    expect(DIALOGO).toContain("registrarPagamento");
    expect(DIALOGO).toContain("anexarComprovante");
  });

  it("anexar não chama nada que mexa em `isPaid`", () => {
    const bloco = DIALOGO.slice(
      DIALOGO.indexOf("const anexarArquivo"),
      DIALOGO.indexOf("const removerArquivo"),
    );
    expect(bloco).not.toContain("isPaid");
    expect(bloco).not.toContain("registrarPagamento");
    expect(bloco).not.toContain("togglePaid");
  });

  it("e a tela diz, em português, que anexar não dá baixa", () => {
    // A frase é montada com o verbo do TIPO — "recebido" na receita, "pago"
    // na despesa —, e por isso o teste olha a construção, não o literal.
    expect(DIALOGO).toMatch(/não marca como\{" "\}/);
    expect(DIALOGO).toContain("{VERBO.toLowerCase()}");
  });

  it("e o vocabulário muda com o tipo, no MESMO componente", () => {
    // Duplicar a tela para trocar duas palavras faria as duas divergirem na
    // primeira correção. Ninguém diz "recebi" de uma compra de flores.
    expect(DIALOGO).toContain('lancamento.type === "expense"');
    expect(DIALOGO).toMatch(/const VERBO = despesa \? "Pago" : "Recebido"/);
    expect(DIALOGO).toContain("{VERBO} em");
  });
});

describe("o filtro responde a pergunta", () => {
  it("existe e usa a MESMA regra do módulo", () => {
    expect(TELA).toContain("pagoSemComprovante");
    expect(TELA).toContain('"sem_comprovante"');
  });

  it("a contagem olha o livro inteiro, não o recorte aberto", () => {
    // Contar sobre `filtered` faria o número mudar conforme o filtro — e
    // deixar de responder a pergunta.
    expect(TELA).toMatch(/const semComprovante = \(transactions \?\? \[\]\)\.filter\(pagoSemComprovante\)/);
  });

  it("e o botão some quando não há nada a cobrar", () => {
    expect(TELA).toContain('if (f === "sem_comprovante" && semComprovante === 0) return null;');
  });
});

describe("envio reutiliza o pipeline existente", () => {
  it("usa o hook compartilhado, não um upload próprio", () => {
    expect(DIALOGO).toContain("useEnvioDeArquivo");
    expect(DIALOGO).toContain("api.financeiro.generateUploadUrl");
    // Nada de `fetch` cru nem de segundo caminho de upload.
    expect(DIALOGO).not.toContain("fetch(");
  });

  it("aceita PDF e imagem, e o `accept` deixa o iPhone oferecer a câmera", () => {
    expect(TIPOS_DE_COMPROVANTE).toContain("application/pdf");
    expect(TIPOS_DE_COMPROVANTE).toContain("image/*");
    expect(MIMES_DE_COMPROVANTE).toEqual(["application/pdf", "image/"]);
    expect(DIALOGO).toContain("accept={TIPOS_DE_COMPROVANTE}");
  });

  it("e a validação de tamanho continua sendo a do repositório", () => {
    expect(DIALOGO).toContain('tipo: "documento"');
    expect(DIALOGO).toContain("aceitos: MIMES_DE_COMPROVANTE");
  });
});

describe("o backend não abriu porta nova", () => {
  const FIN = semComentarios("convex/financeiro.ts");

  it("não existe mutation genérica de apagar arquivo por id", () => {
    // Uma `deleteStorageId` exposta ao cliente apagaria arquivo de qualquer
    // conta: o Convex não escopa storage por usuário.
    expect(FIN).not.toMatch(/export const (deleteStorageId|apagarArquivo|removerArquivo)\b/);
  });

  it("a remoção confere que o arquivo é DESTE lançamento antes de apagar", () => {
    expect(FIN).toContain("atuais.some((c) => c.storageId === args.storageId)");
  });

  it("e nenhum `ctx.storage.delete` solto entrou no Financeiro", () => {
    expect(FIN).not.toContain("ctx.storage.delete");
    expect(FIN).toContain("safeDeleteFile");
  });
});

describe("os outros uploads do ALTAR não mudaram", () => {
  it.each([
    "src/pages/app/events/[id]/fotos/page.tsx",
    "src/pages/app/events/[id]/_components/event-documents.tsx",
    "src/pages/app/funil/_components/lead-documents.tsx",
    "src/pages/app/events/[id]/planta/page.tsx",
    "src/pages/app/configuracoes/page.tsx",
  ])("%s não conhece comprovante", (arquivo) => {
    const fonte = semComentarios(arquivo);
    expect(fonte).not.toContain("anexarComprovante");
    expect(fonte).not.toContain("comprovante-financeiro");
  });

  it("e o hook compartilhado continua sem saber o que é financeiro", () => {
    const hook = semComentarios("src/hooks/use-upload.ts");
    expect(hook).not.toContain("comprovante");
    expect(hook).not.toContain("financeiro");
  });
});

describe("mobile — auditoria estática", () => {
  it("o diálogo rola em vez de estourar a tela", () => {
    // 320px de largura por ~568 de altura: pagamento + lista de anexos passa
    // da tela, e sem rolagem o botão de salvar fica inalcançável.
    expect(DIALOGO).toContain("max-h-[90dvh]");
    expect(DIALOGO).toContain("overflow-y-auto");
  });

  it("os campos empilham no telefone e abrem em duas colunas depois", () => {
    expect(DIALOGO).toContain("grid-cols-1 gap-3 sm:grid-cols-2");
  });

  it("nome de arquivo longo não empurra os botões para fora", () => {
    expect(DIALOGO).toContain("min-w-0 flex-1 truncate");
    expect((DIALOGO.match(/flex-shrink-0/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("descrição longa do lançamento quebra em vez de estourar", () => {
    expect(DIALOGO).toContain('className="break-words"');
  });

  it("os três botões de cada comprovante têm nome acessível", () => {
    // Só ícone, sem nome, o leitor de tela anuncia "botão, botão, botão".
    for (const rotulo of ["Visualizar ${c.filename}", "Baixar ${c.filename}", "Remover ${c.filename}"]) {
      expect(DIALOGO).toContain(rotulo);
    }
  });

  it("e os alvos de toque têm pelo menos 32px", () => {
    expect((DIALOGO.match(/size-8/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(DIALOGO).toContain("min-h-10");
  });
});
