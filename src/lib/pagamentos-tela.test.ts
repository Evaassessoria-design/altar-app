import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// A TELA DOS PAGAMENTOS DO CLIENTE — O QUE NÃO PODE VOLTAR
//
// Lê a fonte, no padrão de `upload-telas.test.ts`. As regras de dinheiro têm
// teste próprio (`convex/lib/pagamentosDoEvento.test.ts`); aqui se trava o
// que é decisão de TELA: de onde vem o "hoje", qual número aparece onde, e
// como o envio não se repete.
// ─────────────────────────────────────────────────────────────────────────────

const fonte = readFileSync("src/pages/app/events/[id]/_components/pagamentos-da-cliente.tsx", "utf-8")
  .split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join("\n");

describe("a aba é só da cliente", () => {
  it("rota própria no evento, com a seção inteira", () => {
    expect(readFileSync("src/App.tsx", "utf-8")).toContain('path="/eventos/:id/pagamentos"');
    expect(readFileSync("src/pages/app/events/[id]/pagamentos/page.tsx", "utf-8")).toContain(
      "<PagamentosDaCliente eventId={eventId} />",
    );
  });

  it("a página do evento mostra só o cartão compacto, com atalho para a aba", () => {
    const evento = readFileSync("src/pages/app/events/[id]/page.tsx", "utf-8");
    expect(evento).toContain("<CartaoPagamentosDaCliente");
    expect(evento).not.toContain("<PagamentosDaCliente ");
    expect(fonte).toContain("to={`/eventos/${eventId}/pagamentos`}");
  });

  it("o servidor devolve só RECEITAS do evento — nada de despesa, fornecedor ou custo", () => {
    const financeiro = readFileSync("convex/financeiro.ts", "utf-8");
    const i = financeiro.indexOf("export const pagamentosDoEvento");
    const corpo = financeiro.slice(i, financeiro.indexOf("\n});", i));
    expect(corpo).toContain('t.type === "income"');
    expect(corpo).not.toMatch(/purchase|supplier|expense|subscription/i);
  });

  it("os comprovantes aparecem com link, não só a contagem", () => {
    expect(fonte).toContain("api.financeiro.comprovantesDoLancamento");
    expect(fonte).toContain('href={c.url}');
  });
});

describe("os três números não se confundem", () => {
  it("valor contratado ausente aparece como 'Não definido'", () => {
    expect(fonte).toContain('resumo.contratadoCentavos === null ? "Não definido"');
  });

  it("o orçamento estimado só aparece como nota, dizendo que não é contratado", () => {
    expect(fonte).toContain("não conta como contratado");
    // e nunca entra no cálculo do resumo
    expect(fonte).toContain("resumirPagamentos(dados.valorContratado, dados.parcelas, hoje)");
    expect(fonte).not.toMatch(/resumirPagamentos\([^)]*orcamento/);
  });
});

describe("atraso no fuso do negócio", () => {
  it("o 'hoje' é o do fuso do negócio que o servidor informa — nem aparelho, nem UTC", () => {
    expect(fonte.match(/const hoje = dataDoDiaNoFuso\(new Date\(\), dados\.fuso\);/g)).toHaveLength(2);
    expect(fonte).not.toContain("hojeDateKey");
    expect(fonte).toContain("parcelaAtrasada(p, hoje)");
  });

  it("o Dashboard usa a mesma regra", () => {
    const financeiro = readFileSync("convex/financeiro.ts", "utf-8");
    expect(financeiro).toContain("const hoje = dataDoDiaNoFuso(new Date(), user.timezone);");
  });
});

describe("acima do saldo", () => {
  it("a tela não manda aumentar a parcela", () => {
    expect(fonte).toContain("Registre no máximo o saldo.");
    expect(fonte).not.toMatch(/corrija primeiro o valor da parcela/);
  });
});

describe("a lista do Financeiro protege a parcela com recebimentos", () => {
  const lista = readFileSync("src/pages/app/financeiro/page.tsx", "utf-8");

  it("excluir fica desativado pela MESMA regra do servidor", () => {
    expect(lista).toMatch(/aria-label=\{`Excluir \$\{tx\.description\}`\}[\s\S]{0,200}disabled=\{usaRecebimentos\(tx\)\}/);
    const servidor = readFileSync("convex/financeiro.ts", "utf-8");
    expect(servidor).toContain("Esta parcela tem recebimentos registrados e não pode ser excluída.");
  });

  it("a linha explica e aponta para Pagamentos da cliente", () => {
    expect(lista).toContain("Tem recebimentos registrados: não pode ser excluída.");
    expect(lista).toContain("to={`/eventos/${tx.eventId}/pagamentos`}");
    expect(lista).toContain("aria-describedby={usaRecebimentos(tx) ? `protegida-${tx._id}` : undefined}");
  });
});

describe("o diálogo do Financeiro leva aos pagamentos do evento", () => {
  it("diz que a parcela é controlada pelos recebimentos e tem o atalho", () => {
    const dialogo = readFileSync("src/components/financeiro/recebimento-dialog.tsx", "utf-8");
    expect(dialogo).toContain("Controlada pelos recebimentos.");
    expect(dialogo).toContain("to={`/eventos/${lancamento.eventId}/pagamentos`}");
  });
});

describe("o envio não se repete", () => {
  it("cada formulário tem UMA chave, gerada ao abrir", () => {
    expect(fonte.match(/useMemo\(novaChave, \[\]\)/g)).toHaveLength(2);
  });

  it("recebimento, anulação e planejamento travam por ref", () => {
    expect(fonte.match(/if \(emCurso\.current/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("o comprovante já subido não sobe de novo na nova tentativa", () => {
    expect(fonte).toContain("if (arquivo && !comprovanteSubido.current)");
  });
});

describe("celular", () => {
  it("um diálogo por vez — nada empilhado", () => {
    expect(fonte).toContain("const [aberto, setAberto] = useState<Aberto>(null);");
    for (const tipo of ["receber", "anular", "contratado", "planejar"]) {
      expect(fonte).toContain(`aberto?.tipo === "${tipo}"`);
    }
  });

  it("resumo em duas colunas, parcelas em cards — sem tabela", () => {
    expect(fonte).toContain("grid grid-cols-2 sm:grid-cols-3");
    expect(fonte).not.toContain("<table");
  });

  it("'Registrar recebimento' está na parcela e no resumo", () => {
    expect(fonte.match(/Registrar recebimento/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
