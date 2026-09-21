import { describe, expect, it } from "vitest";
import {
  ROTULO_DO_STATUS,
  STATUS_DA_PROPOSTA,
  estaVencida,
  faltaParaEnviar,
  investimentoTotal,
  paraOCliente,
  type PropostaArmazenada,
} from "./propostaComercial";

// ═════════════════════════════════════════════════════════════════════════════
// A FRONTEIRA ENTRE O QUE ELA CALCULA E O QUE A CLIENTE LÊ
//
// O ALTAR já tinha UM documento de dinheiro: o Orçamento, que é INTERNO —
// custo, lucro, margem, tabela de custos. Faltava o que ELA manda.
//
// A regra de ouro: a fronteira mora na TRANSFORMAÇÃO, não na renderização.
// `paraOCliente` constrói um objeto NOVO campo a campo. É a diferença entre
// "a tela não mostra o custo" e "o custo não existe no objeto que sai daqui":
// a primeira quebra quando alguém acrescenta um campo, a segunda não.
// ═════════════════════════════════════════════════════════════════════════════

const ESTUDIO = { nome: "Ateliê Eva", contato: "(11) 90000-0000" };

const base: PropostaArmazenada = {
  titulo: "Proposta — Marina & Gabriel",
  apresentacao: "Um casamento de fim de tarde na Fazenda Aurora.",
  clienteNome: "Marina Duarte e Gabriel Rocha",
  eventoTipo: "Casamento",
  eventoData: "2026-10-10",
  eventoLocal: "Fazenda Aurora",
  eventoConvidados: 180,
  itens: [
    { descricao: "Projeto floral da cerimônia", valor: 38_000 },
    { descricao: "Decoração do salão", detalhe: "18 mesas", valor: 96_500 },
  ],
  condicoesPagamento: "30% na assinatura, saldo em 3 parcelas",
  validadeAte: "2026-07-30",
  observacoes: "Montagem na véspera.",
};

describe("o investimento é derivado, nunca gravado", () => {
  it("soma os itens", () => {
    expect(investimentoTotal(base.itens)).toBe(134_500);
  });

  it("sem itens, é zero — não é 'não sei'", () => {
    expect(investimentoTotal([])).toBe(0);
  });

  it("soma ao centavo, sem sobra de ponto flutuante", () => {
    expect(
      investimentoTotal([
        { descricao: "a", valor: 0.1 },
        { descricao: "b", valor: 0.2 },
      ]),
    ).toBe(0.3);
  });

  it("um item podre não vira 'R$ NaN' na frente da cliente", () => {
    expect(
      investimentoTotal([
        { descricao: "a", valor: 38_000 },
        { descricao: "podre", valor: NaN },
      ]),
    ).toBe(38_000);
  });
});

describe("vencida é DERIVADO, não um status gravado", () => {
  // Um status "expirada" no banco envelheceria sozinho e exigiria alguém
  // varrendo propostas todo dia para mantê-lo verdadeiro.
  it("passou da validade e ainda não foi decidida", () => {
    expect(estaVencida("2026-07-30", "enviada", "2026-09-21")).toBe(true);
  });

  it("no dia da validade ainda vale", () => {
    expect(estaVencida("2026-09-21", "enviada", "2026-09-21")).toBe(false);
  });

  it("decidida não vence depois", () => {
    // Uma proposta aceita não "expira" porque o prazo passou.
    expect(estaVencida("2026-07-30", "aceita", "2026-09-21")).toBe(false);
    expect(estaVencida("2026-07-30", "recusada", "2026-09-21")).toBe(false);
  });

  it("sem validade, nunca vence", () => {
    expect(estaVencida(undefined, "enviada", "2026-09-21")).toBe(false);
    expect(estaVencida("", "enviada", "2026-09-21")).toBe(false);
  });

  it("data corrompida não vira vencida", () => {
    // Afirmar vencimento a partir de lixo é pior do que não afirmar nada.
    expect(estaVencida("ontem", "enviada", "2026-09-21")).toBe(false);
    expect(estaVencida("30/07/2026", "enviada", "2026-09-21")).toBe(false);
  });

  it("rascunho com validade vencida também é vencido", () => {
    expect(estaVencida("2026-07-30", "rascunho", "2026-09-21")).toBe(true);
  });
});

describe("o que a cliente recebe", () => {
  const doc = paraOCliente(base, ESTUDIO);

  it("leva escopo, investimento, condições e validade", () => {
    expect(doc.titulo).toBe("Proposta — Marina & Gabriel");
    expect(doc.cliente).toBe("Marina Duarte e Gabriel Rocha");
    expect(doc.itens).toHaveLength(2);
    expect(doc.investimento).toBe(134_500);
    expect(doc.condicoesPagamento).toMatch(/30%/);
    expect(doc.validadeAte).toBe("2026-07-30");
    expect(doc.estudio.nome).toBe("Ateliê Eva");
  });

  it("campo em branco não vira string vazia no documento", () => {
    // "Observações:" seguido de nada é pior do que não ter a seção.
    const d = paraOCliente({ ...base, observacoes: "   ", apresentacao: "" }, ESTUDIO);
    expect(d.observacoes).toBeUndefined();
    expect(d.apresentacao).toBeUndefined();
  });

  it("convidados corrompido não aparece", () => {
    const d = paraOCliente({ ...base, eventoConvidados: NaN }, ESTUDIO);
    expect(d.evento?.convidados).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTE DE VAZAMENTO COMERCIAL
//
// Este é o teste que a rodada inteira existe para ter. Ele roda sobre a
// TRANSFORMAÇÃO REAL — a mesma função que o PDF e a pré-visualização usam —
// e não sobre uma cópia fictícia do objeto.
// ═════════════════════════════════════════════════════════════════════════════

/** Tudo o que NUNCA pode chegar à cliente. */
const PROIBIDOS = [
  "custo",
  "cost",
  "margem",
  "margin",
  "lucro",
  "profit",
  "fornecedor",
  "supplier",
  "notaInterna",
  "internalNote",
  "comissao",
  "comissão",
  "interno",
  "userId",
  "_id",
  "_creationTime",
  "leadId",
  "eventId",
  "status",
  "versaoEnviada",
  "decididaPor",
  "motivoDaRecusa",
  "unitPrice",
  "custoReferencia",
];

/** Todas as chaves de um objeto, em qualquer profundidade. */
function chavesProfundas(valor: unknown, acumulado: string[] = []): string[] {
  if (Array.isArray(valor)) {
    for (const v of valor) chavesProfundas(v, acumulado);
    return acumulado;
  }
  if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) {
      acumulado.push(k);
      chavesProfundas(v, acumulado);
    }
  }
  return acumulado;
}

describe("NADA de interno atravessa a fronteira", () => {
  /**
   * Uma proposta com TODO campo interno que o schema tem — e mais alguns que
   * ele não tem, fingindo ser o futuro. Se `paraOCliente` espalhasse o
   * registro, tudo isto sairia no documento.
   */
  const contaminada = {
    ...base,
    // Campos reais do registro:
    userId: "users|123",
    _id: "proposals|abc",
    _creationTime: 1,
    leadId: "leads|1",
    eventId: "events|1",
    status: "enviada",
    versaoEnviada: { enviadaEm: "2026-07-01", investimento: 1, itens: [] },
    decididaPor: "Eva",
    motivoDaRecusa: "achou caro",
    // O futuro, fingindo ser acrescentado ao schema amanhã:
    custoInterno: 87_300,
    margemPercentual: 37.4,
    lucroPrevisto: 47_200,
    fornecedorPreferido: "Flores de Aurora",
    notaInterna: "cobrar adiantado, cliente atrasou da última vez",
    comissao: 5,
    itens: [
      {
        descricao: "Projeto floral da cerimônia",
        valor: 38_000,
        // Contaminação na LINHA, que é onde é mais fácil escapar:
        custo: 22_000,
        margem: 42,
        supplierId: "suppliers|9",
        notaInterna: "negociar com a Aurora",
      },
    ],
  } as unknown as PropostaArmazenada;

  const doc = paraOCliente(contaminada, ESTUDIO);
  const chaves = chavesProfundas(doc);
  const serializado = JSON.stringify(doc);

  it.each(PROIBIDOS)("a chave %s não existe no documento", (proibida) => {
    const encontradas = chaves.filter(
      (k) => k.toLowerCase() === proibida.toLowerCase(),
    );
    expect(encontradas, `chave interna vazou: ${proibida}`).toEqual([]);
  });

  it("nenhum VALOR interno aparece, nem por outro nome", () => {
    // A chave pode mudar; o número é o que denuncia. 87.300 é o custo,
    // 47.200 o lucro, 37,4 a margem.
    for (const valor of ["87300", "47200", "37.4", "22000"]) {
      expect(serializado, `valor interno vazou: ${valor}`).not.toContain(valor);
    }
  });

  it("nenhum TEXTO interno aparece", () => {
    for (const texto of [
      "cobrar adiantado",
      "negociar com a Aurora",
      "achou caro",
      "Flores de Aurora",
    ]) {
      expect(serializado, `texto interno vazou: ${texto}`).not.toContain(texto);
    }
  });

  it("o item só carrega descrição, detalhe e valor", () => {
    // Reconstruir a linha é o que impede uma anotação futura de escapar.
    for (const item of doc.itens) {
      expect(Object.keys(item).sort()).toEqual(["descricao", "detalhe", "valor"]);
    }
  });

  it("o documento inteiro tem uma lista fechada de campos", () => {
    // Trava ao contrário: acrescentar um campo ao documento da cliente passa a
    // exigir uma decisão explícita aqui.
    expect(Object.keys(doc).sort()).toEqual(
      [
        "apresentacao",
        "cliente",
        "condicoesPagamento",
        "estudio",
        "evento",
        "investimento",
        "itens",
        "observacoes",
        "titulo",
        "validadeAte",
      ].sort(),
    );
  });

  it("o investimento é o dos itens — não um total interno qualquer", () => {
    expect(doc.investimento).toBe(38_000);
  });
});

describe("o que falta para enviar", () => {
  it("proposta sem item não vai para a cliente", () => {
    const falta = faltaParaEnviar({ ...base, itens: [] });
    expect(falta.join(" ")).toMatch(/escopo/i);
  });

  it("item sem descrição é apontado", () => {
    const falta = faltaParaEnviar({
      ...base,
      itens: [{ descricao: "  ", valor: 100 }],
    });
    expect(falta.join(" ")).toMatch(/descrição/i);
  });

  it("sem título e sem cliente, as duas faltas aparecem", () => {
    const falta = faltaParaEnviar({ ...base, titulo: "", clienteNome: "" });
    expect(falta).toHaveLength(2);
  });

  it("proposta completa não tem falta nenhuma", () => {
    expect(faltaParaEnviar(base)).toEqual([]);
  });

  it("as frases são em português, sem vocabulário técnico", () => {
    const falta = faltaParaEnviar({ ...base, titulo: "", itens: [] });
    for (const f of falta) {
      expect(f).not.toMatch(/null|undefined|required|invalid|field/i);
    }
  });
});

describe("os estados são só quatro, e nenhum acontece sozinho", () => {
  it("rascunho, enviada, aceita, recusada", () => {
    expect([...STATUS_DA_PROPOSTA]).toEqual(["rascunho", "enviada", "aceita", "recusada"]);
  });

  it("todos têm rótulo humano", () => {
    for (const s of STATUS_DA_PROPOSTA) {
      expect(ROTULO_DO_STATUS[s]).toBeTruthy();
      expect(ROTULO_DO_STATUS[s]).not.toMatch(/_/);
    }
  });

  it("'expirada' NÃO é um status", () => {
    // Ele envelheceria sozinho no banco. Vencimento é derivado.
    expect(STATUS_DA_PROPOSTA).not.toContain("expirada" as never);
  });
});
