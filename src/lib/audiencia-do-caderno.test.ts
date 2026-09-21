import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIENCIAS,
  AUDIENCIA_PADRAO,
  campoDoItemVisivelPara,
  opcaoDaAudiencia,
} from "./audiencia-do-caderno.ts";
import { itemVisibleTo, resolveAreasForAudience, type Audience } from "./briefing-areas.ts";

// ═════════════════════════════════════════════════════════════════════════════
// TRÊS CADERNOS, UM EVENTO
//
// A regra de audiência existia inteira e funcionava: `itemVisibleTo` filtra os
// itens de montagem e `resolveAreasForAudience` filtra os campos do briefing.
// O PDF já a respeitava.
//
// O que não existia era o SELETOR. A tela chamava o gerador com
// `audience: "equipe"` fixo, então a decoradora classificava um item como
// "cliente" esperando um documento para a cliente — e recebia o da equipe,
// sempre, sem nada indicando por quê.
//
// Estes testes prendem as três coisas que podem dar errado agora: o padrão
// mudar sem querer, um rótulo técnico vazar para a tela, e os três documentos
// se sobrescreverem na pasta de downloads.
// ═════════════════════════════════════════════════════════════════════════════

describe("o vocabulário da audiência", () => {
  it("cobre exatamente as audiências do domínio — nem mais, nem menos", () => {
    // Nenhum enum inventado: a lista vem de `Audience`, em briefing-areas.ts.
    const doDominio: Audience[] = ["interno", "cliente", "equipe"];
    expect(AUDIENCIAS.map((a) => a.valor).sort()).toEqual([...doDominio].sort());
  });

  it("o padrão é o documento que a tela já gerava", () => {
    // Trava contra regressão silenciosa: mudar o padrão mudaria, sem aviso, o
    // caderno que a decoradora imprime há meses.
    expect(AUDIENCIA_PADRAO).toBe("equipe");
    expect(AUDIENCIAS[0].valor).toBe(AUDIENCIA_PADRAO);
  });

  it("nenhum rótulo é o valor de banco cru", () => {
    // A distinção que importa: "Uso interno" é português e está certo;
    // "interno" sozinho como opção de menu seria o valor do banco vazando.
    // Por isso o teste compara o rótulo INTEIRO com o valor, em vez de
    // proibir a palavra — proibir "interno" proibiria escrever em português.
    for (const a of AUDIENCIAS) {
      expect(a.rotulo.trim().toLowerCase()).not.toBe(a.valor);
      expect(a.rotulo.length).toBeGreaterThan(a.valor.length);
      expect(a.detalhe.length).toBeGreaterThan(0);
    }
  });

  it("nenhum rótulo carrega vocabulário de programador", () => {
    for (const a of AUDIENCIAS) {
      const visivel = `${a.rotulo} ${a.detalhe}`;
      expect(visivel).not.toMatch(/\b(audience|visibility|slug|enum|flag|null)\b/i);
    }
  });

  it("cada audiência tem sufixo próprio — três PDFs não se sobrescrevem", () => {
    const sufixos = AUDIENCIAS.map((a) => a.sufixo);
    expect(new Set(sufixos).size).toBe(AUDIENCIAS.length);
    for (const s of sufixos) expect(s).toMatch(/^[a-z]+$/);
  });

  it("valor desconhecido cai no padrão, não em undefined", () => {
    // Um caderno da equipe impresso por engano é melhor do que um botão que
    // não faz nada.
    for (const lixo of [undefined, null, "", "cheff", "EQUIPE"]) {
      expect(opcaoDaAudiencia(lixo).valor).toBe(AUDIENCIA_PADRAO);
    }
    expect(opcaoDaAudiencia("cliente").valor).toBe("cliente");
  });
});

describe("o que cada caderno pode conter", () => {
  // A regra é ANINHADA, e é o que torna o documento da cliente seguro:
  // um item marcado como interno não escapa para ela por nenhum caminho.
  it("o caderno da cliente só mostra o que foi contratado", () => {
    expect(itemVisibleTo("cliente", "cliente")).toBe(true);
    expect(itemVisibleTo("equipe", "cliente")).toBe(false);
    expect(itemVisibleTo("interno", "cliente")).toBe(false);
  });

  it("o caderno da equipe mostra o dela e o da cliente, nunca o interno", () => {
    expect(itemVisibleTo("cliente", "equipe")).toBe(true);
    expect(itemVisibleTo("equipe", "equipe")).toBe(true);
    expect(itemVisibleTo("interno", "equipe")).toBe(false);
  });

  it("o interno vê tudo", () => {
    for (const v of ["interno", "equipe", "cliente"]) {
      expect(itemVisibleTo(v, "interno")).toBe(true);
    }
  });

  it("visibilidade desconhecida é tratada como INTERNA", () => {
    // O padrão seguro: na dúvida, o item não vaza para a cliente.
    expect(itemVisibleTo("qualquer-coisa", "cliente")).toBe(false);
    expect(itemVisibleTo("qualquer-coisa", "interno")).toBe(true);
  });

  it("o briefing da cliente não carrega o campo interno", () => {
    const briefing = {
      guestCount: "180",
      insuranceInfo: "Apólice 123 — R$ 50.000",
      venueContact: "Fazenda Aurora — Renata",
    };
    const texto = (audiencia: Audience) =>
      JSON.stringify(resolveAreasForAudience(briefing, audiencia));

    // `insuranceInfo` é INTERNAL_ONLY; `venueContact` é TEAM_ONLY.
    expect(texto("cliente")).not.toContain("Apólice");
    expect(texto("cliente")).not.toContain("Renata");
    expect(texto("equipe")).toContain("Renata");
    expect(texto("equipe")).not.toContain("Apólice");
    expect(texto("interno")).toContain("Apólice");

    // O que é de todos aparece nos três.
    for (const a of ["interno", "cliente", "equipe"] as Audience[]) {
      expect(texto(a)).toContain("180");
    }
  });
});

describe("a tela pergunta em vez de decidir", () => {
  const tela = readFileSync("src/pages/app/events/[id]/briefing/page.tsx", "utf-8");

  it("não chama o gerador com audiência fixa", () => {
    // O defeito exato que isto tranca.
    expect(tela).not.toMatch(/audience:\s*"(equipe|cliente|interno)"/);
  });

  it("oferece as três audiências, vindas da lista única", () => {
    expect(tela).toContain("AUDIENCIAS.map");
    expect(tela).toContain("Para quem é este caderno?");
  });

  it("o nome do arquivo carrega a audiência", () => {
    const gerador = readFileSync("src/lib/generate-assembly-pdf.ts", "utf-8");
    expect(gerador).toContain("opcaoDaAudiencia(audience).sufixo");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O CADERNO DA CLIENTE NÃO LEVA O QUE NÃO É DELA
//
// `itemVisibleTo` decide se o ITEM aparece. Não basta: um item contratado
// aparece para a cliente e ia levando junto o FORNECEDOR — o contato comercial
// da decoradora — e a OBSERVAÇÃO, que é a nota que ela escreve para a própria
// equipe ("pedir 10 a mais, sempre chega peça quebrada").
//
// Enquanto o caderno só era gerado para a equipe, nada disso chegava à
// cliente. O seletor de audiência abriu a porta.
// ═════════════════════════════════════════════════════════════════════════════

describe("campo a campo, por audiência", () => {
  it("a cliente não lê o fornecedor", () => {
    expect(campoDoItemVisivelPara("supplierName", "cliente")).toBe(false);
  });

  it("a cliente não lê a observação interna", () => {
    expect(campoDoItemVisivelPara("notes", "cliente")).toBe(false);
  });

  it("a equipe lê os dois — é o trabalho dela", () => {
    // Trava ao contrário: esconder da equipe a observação de montagem e quem
    // entrega a peça é esconder justamente a instrução.
    expect(campoDoItemVisivelPara("supplierName", "equipe")).toBe(true);
    expect(campoDoItemVisivelPara("notes", "equipe")).toBe(true);
  });

  it("o uso interno lê tudo", () => {
    expect(campoDoItemVisivelPara("supplierName", "interno")).toBe(true);
    expect(campoDoItemVisivelPara("notes", "interno")).toBe(true);
  });
});

describe("o gerador do caderno obedece", () => {
  const fonte = readFileSync("src/lib/generate-assembly-pdf.ts", "utf-8");

  it("fornecedor e observação passam pela regra antes de entrar no PDF", () => {
    expect(fonte).toContain('campoDoItemVisivelPara("supplierName", audience)');
    expect(fonte).toContain('campoDoItemVisivelPara("notes", audience)');
  });

  it("nenhum valor em dinheiro entra no caderno, em audiência nenhuma", () => {
    // O caderno é documento de montagem. Preço na mão de quem monta é
    // vazamento comercial — a mesma regra da Folha de Carregamento e da Ficha.
    const semComentarios = fonte
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
    expect(semComentarios).not.toMatch(/custo|preco|preço|valorTotal|toLocaleString.*BRL/i);
  });
});

describe("o relatório completo do evento se anuncia como interno", () => {
  it("o nome do arquivo diz que é interno", () => {
    // Ele traz compras, valores, equipe e o briefing inteiro na audiência
    // "interno". Um arquivo chamado só "relatorio" é o que acaba anexado num
    // WhatsApp para a cliente.
    const fonte = readFileSync("src/lib/generate-event-pdf.ts", "utf-8");
    expect(fonte).toContain("altar-relatorio-interno-");
    expect(fonte).toContain('resolveAreasForAudience');
  });

  it("e o botão que o gera também", () => {
    const tela = readFileSync("src/pages/app/events/[id]/page.tsx", "utf-8");
    expect(tela).toMatch(/title="Baixar relatório interno/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TODO PDF DIZ PARA QUEM ELE É
//
// O produto gera cinco PDFs. Três são operacionais e não carregam dinheiro
// nenhum (Caderno, Ficha Técnica, Folha de Carregamento) — isso já é travado
// acima e nos comentários de cada gerador.
//
// Os outros DOIS carregam o resultado da decoradora, e os dois se pareciam com
// documento de cliente:
//
//  · o Relatório do evento (compras, valores, equipe, briefing interno);
//  · o **Orçamento**, que traz "Custo Orçado", "Lucro Real", "Margem Real", a
//    tabela inteira de custos e uma faixa "Resultado positivo: R$ X (margem
//    Y%)" — sob o timbre do estúdio, com o nome e o telefone da cliente logo
//    abaixo, e o arquivo chamado `altar-orcamento-<evento>.pdf`.
//
// Um clique e a cliente sabia exatamente quanto a decoradora ia ganhar.
// ═════════════════════════════════════════════════════════════════════════════

describe("o PDF que carrega margem se anuncia como interno", () => {
  const ORCAMENTO = readFileSync("src/lib/generate-orcamento-pdf.ts", "utf-8");

  it("ele de fato carrega margem e custo — é por isso que a regra existe", () => {
    // Trava ao contrário: se um dia o documento deixar de trazer resultado,
    // este teste avisa que a exigência de "interno" pode ser revista.
    expect(ORCAMENTO).toContain("Margem Real");
    expect(ORCAMENTO).toContain("Lucro Real");
    expect(ORCAMENTO).toContain("Custos e Despesas");
  });

  it("o nome do arquivo diz interno", () => {
    expect(ORCAMENTO).toContain("altar-orcamento-interno-");
  });

  it("o cabeçalho diz interno", () => {
    expect(ORCAMENTO).toMatch(/USO INTERNO/);
  });

  it("o rodapé repete em TODA página", () => {
    // Quem imprime e separa folha não vê a capa.
    const rodape = ORCAMENTO.slice(ORCAMENTO.indexOf("// Footer"));
    expect(rodape).toMatch(/USO INTERNO/);
  });

  it("o botão da tela não é um ícone mudo", () => {
    const tela = readFileSync("src/pages/app/events/[id]/orcamento/page.tsx", "utf-8");
    expect(tela).toMatch(/title="Baixar em PDF — documento interno/);
    expect(tela).toMatch(/PDF interno/);
  });

  it("o relatório do evento continua se anunciando", () => {
    const relatorio = readFileSync("src/lib/generate-event-pdf.ts", "utf-8");
    expect(relatorio).toContain("altar-relatorio-interno-");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O PDF QUE VAI PARA A CLIENTE E TEM DINHEIRO DENTRO
//
// A proposta é o ÚNICO documento do ALTAR que sai para fora com valor — e é
// justamente por isso que ela é o lugar mais perigoso do produto.
//
// A diferença em relação ao Orçamento não é de aviso, é de DESENHO: o Orçamento
// recebe o resumo interno inteiro e por isso precisa se anunciar "USO INTERNO"
// em todas as páginas; o gerador da proposta recebe `PropostaParaCliente`, que
// `paraOCliente` construiu campo a campo. Custo, margem e fornecedor não estão
// escondidos — não existem no objeto, e não existem no tipo.
//
// Estes testes travam as duas pontas: que o gerador continua recebendo SÓ o
// tipo da cliente, e que ninguém acrescentou ali um caminho de volta ao
// registro do banco.
// ═════════════════════════════════════════════════════════════════════════════

describe("o PDF da proposta recebe só o que a cliente pode ver", () => {
  const PROPOSTA = readFileSync("src/lib/generate-proposta-pdf.ts", "utf-8");

  it("a entrada é o tipo da cliente, não o registro do banco", () => {
    expect(PROPOSTA).toContain("PropostaParaCliente");
    // `Doc<"proposals">` traria o registro inteiro — com status, vínculos e
    // qualquer campo interno que o schema ganhe amanhã.
    expect(PROPOSTA).not.toMatch(/Doc<"proposals">/);
    expect(PROPOSTA).not.toMatch(/PropostaArmazenada/);
  });

  it("nenhum campo interno é LIDO pelo gerador", () => {
    // A trava é sobre LEITURA DE CAMPO, não sobre a palavra.
    //
    // Proibir a palavra "margem" já produziu um teste errado neste repositório
    // (na Ficha Técnica ela é a margem de SEGURANÇA, instrução de produção), e
    // aqui produziria outro: tanto o gerador quanto a pré-visualização FALAM
    // sobre custo e margem de propósito — para dizer à decoradora que eles não
    // estão ali. O que não pode existir é `.custo`, `.margem`, `.lucro`.
    expect(semComentarios(PROPOSTA)).not.toMatch(CAMPO_INTERNO);
    expect(PROPOSTA).not.toContain("budgetItems");
  });

  it("não se anuncia interno — porque não é, e dizer isso confundiria", () => {
    expect(PROPOSTA).not.toMatch(/USO INTERNO/);
    expect(PROPOSTA).toContain("proposta-");
    expect(PROPOSTA).not.toContain("altar-orcamento");
  });

  it("a tela que gera o PDF usa a consulta que passa pela fronteira", () => {
    const tela = readFileSync("src/pages/app/propostas/[id]/page.tsx", "utf-8");
    // `comoOClienteVe` é a única query que passa por `paraOCliente`. Montar o
    // documento a partir de `api.propostas.get` seria entregar o registro.
    expect(tela).toContain("api.propostas.comoOClienteVe");
    const geracao = tela.slice(tela.indexOf("generatePropostaPDF"));
    expect(geracao).not.toMatch(/proposta\.itens/);
  });

  it("a pré-visualização mostra o MESMO objeto que o PDF", () => {
    const visao = readFileSync(
      "src/pages/app/propostas/_components/visao-do-cliente.tsx",
      "utf-8",
    );
    // Se a tela tivesse o próprio tipo, ela poderia divergir do PDF sem que
    // nada quebrasse — e a decoradora aprovaria um documento que não é o que
    // vai ser enviado.
    expect(visao).toContain("PropostaParaCliente");
    expect(semComentarios(visao)).not.toMatch(CAMPO_INTERNO);
  });
});

/**
 * Leitura de um campo que a cliente não pode ver.
 *
 * `.custo`, `["margem"]`, `.supplierId` — o ACESSO, não a menção. Sem espaço
 * depois do ponto, de propósito: "É isto que sai no PDF. Custo, margem e
 * fornecedor não estão aqui" é frase, não leitura de campo, e foi exatamente
 * o que a primeira versão deste teste acusou por engano.
 */
const CAMPO_INTERNO =
  /[.[]"?(custo\w*|margem\w*|lucro\w*|comissao|notaInterna|supplierId|fornecedorPreferido)\b/i;

/** O código sem comentário: a explicação pode citar o que o código não faz. */
function semComentarios(fonte: string): string {
  return fonte
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("os três PDFs operacionais continuam sem dinheiro", () => {
  it.each([
    ["src/lib/generate-assembly-pdf.ts", "Caderno de Montagem"],
    ["src/lib/generate-ficha-tecnica-pdf.ts", "Ficha Técnica"],
    ["src/lib/generate-loading-pdf.ts", "Folha de Carregamento"],
  ])("%s (%s) não imprime valor", (arquivo) => {
    // Preço na mão de quem monta, do florista ou de quem carrega é vazamento
    // comercial — e nenhum dos três precisa do número para fazer o trabalho.
    //
    // "margem" NÃO entra nesta lista de propósito: na Ficha Técnica ela é a
    // margem de SEGURANÇA — comprar 10% de rosa a mais porque flor quebra no
    // transporte. É instrução de produção, não resultado financeiro, e
    // confundir as duas apagaria da ficha um número de que o florista precisa.
    const codigo = readFileSync(arquivo, "utf-8")
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
    expect(codigo).not.toMatch(
      /lucro|custoReferencia|unitPrice|valorTotal|style: "currency"|R\$/i,
    );
  });
});
