import { describe, expect, it } from "vitest";
import {
  ETAPAS_DO_PROJETO,
  jornadaDoEvento,
  operacaoDoEvento,
  type FatosDaJornada,
  type FatosDaOperacao,
} from "./jornadaDoEvento";

// ─────────────────────────────────────────────────────────────────────────────
// A JORNADA ORIENTA, NÃO TRAVA — e não afirma o que não sabe
// ─────────────────────────────────────────────────────────────────────────────

const nada: FatosDaJornada = {
  briefing: { existe: false, temConvidados: false, temConceito: false },
  comercial: { itensDeReceita: 0, propostas: [] },
  contrato: { anexado: false, pendencias: 0 },
  inspiracoes: { referencias: 0 },
  fornecedores: [],
  ficha: { itens: 0, itensComMateriais: 0 },
  acervo: { reservas: 0, comDeficit: 0 },
  projeto: { apresentavel: false, prontos: 0, totalDeItens: 11 },
  croqui: { enviados: 0 },
  planta: { geradas: 0, gerando: false },
};

const tudo: FatosDaJornada = {
  briefing: { existe: true, temConvidados: true, temConceito: true },
  comercial: { itensDeReceita: 3, propostas: [{ status: "aceita" }] },
  contrato: { anexado: true, pendencias: 0 },
  inspiracoes: { referencias: 4 },
  fornecedores: [{ status: "contratado" }, { status: "confirmado" }],
  ficha: { itens: 5, itensComMateriais: 5 },
  acervo: { reservas: 3, comDeficit: 0 },
  projeto: { apresentavel: true, prontos: 11, totalDeItens: 11 },
  croqui: { enviados: 1 },
  planta: { geradas: 1, gerando: false },
};

const status = (f: FatosDaJornada) =>
  Object.fromEntries(jornadaDoEvento(f).etapas.map((e) => [e.chave, e.status]));

describe("a jornada do projeto", () => {
  it("são dez etapas, na ordem recomendada, numeradas", () => {
    const j = jornadaDoEvento(nada);
    expect(j.etapas.map((e) => e.chave)).toEqual([...ETAPAS_DO_PROJETO]);
    expect(j.etapas.map((e) => e.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("evento vazio: 'você está aqui' é o briefing, o próximo é o comercial", () => {
    const j = jornadaDoEvento(nada);
    expect(j).toMatchObject({ atual: "briefing", proxima: "comercial", concluidas: 0 });
  });

  it("tudo feito: nenhum ponteiro e dez concluídas", () => {
    expect(jornadaDoEvento(tudo)).toMatchObject({ atual: null, proxima: null, concluidas: 10 });
  });

  it("fora da ordem: projeto visual pronto antes do contrato não é bloqueado nem apagado", () => {
    const f = { ...nada, briefing: tudo.briefing, projeto: tudo.projeto };
    const j = jornadaDoEvento(f);
    expect(status(f).projeto).toBe("concluido");
    // O ponteiro continua na primeira pendente da ORDEM — a etapa adiantada
    // aparece feita, sem obrigar ninguém a voltar.
    expect(j.atual).toBe("comercial");
  });

  it("só a planta tem dependência real — o resto é ordem recomendada", () => {
    const deps = jornadaDoEvento(nada).etapas.filter((e) => e.dependeDe);
    expect(deps.map((e) => [e.chave, e.dependeDe])).toEqual([["planta", "croqui"]]);
  });

  it("contrato diz 'anexado', nunca 'assinado' — e pendência da leitura deixa em andamento", () => {
    const anexado = jornadaDoEvento({ ...nada, contrato: { anexado: true, pendencias: 0 } })
      .etapas.find((e) => e.chave === "contrato")!;
    expect(anexado).toMatchObject({ status: "concluido", detalhe: "Contrato anexado" });
    expect(JSON.stringify(jornadaDoEvento(tudo))).not.toMatch(/assinad/i);
    const comPendencia = jornadaDoEvento({ ...nada, contrato: { anexado: true, pendencias: 2 } })
      .etapas.find((e) => e.chave === "contrato")!;
    expect(comPendencia.status).toBe("em_andamento");
  });

  it("comercial: orçamento sem proposta, proposta enviada, recusada e aceita", () => {
    const c = (comercial: FatosDaJornada["comercial"]) =>
      jornadaDoEvento({ ...nada, comercial }).etapas.find((e) => e.chave === "comercial")!;
    expect(c({ itensDeReceita: 2, propostas: [] }).detalhe).toMatch(/proposta ainda não criada/);
    expect(c({ itensDeReceita: 2, propostas: [{ status: "enviada", vencida: true }] }).detalhe).toMatch(/vencida/);
    expect(c({ itensDeReceita: 0, propostas: [{ status: "recusada" }] }).detalhe).toMatch(/recusada/);
    expect(c({ itensDeReceita: 0, propostas: [{ status: "recusada" }, { status: "aceita" }] }).status).toBe("concluido");
  });

  it("briefing pela metade diz o que falta", () => {
    const b = jornadaDoEvento({ ...nada, briefing: { existe: true, temConvidados: true, temConceito: false } })
      .etapas.find((e) => e.chave === "briefing")!;
    expect(b).toMatchObject({ status: "em_andamento", detalhe: "Falta: conceito" });
  });

  it("acervo com déficit está em andamento, não concluído", () => {
    expect(status({ ...nada, acervo: { reservas: 3, comDeficit: 1 } }).acervo).toBe("em_andamento");
  });

  it("fornecedor sem status não conta como fechado", () => {
    const f = jornadaDoEvento({ ...nada, fornecedores: [{ status: "contratado" }, {}] })
      .etapas.find((e) => e.chave === "fornecedores")!;
    expect(f).toMatchObject({ status: "em_andamento", detalhe: "1 de 2 fechados" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A OPERAÇÃO — o que o sistema não registra aparece como "sem registro"
// ─────────────────────────────────────────────────────────────────────────────

const op = (over: Partial<FatosDaOperacao> = {}): FatosDaOperacao => ({
  dataDoEvento: "2026-10-10",
  hoje: "2026-09-28",
  itensDeMontagem: [],
  reservas: [],
  pecasForaDeUsoNosItens: 0,
  pecasEnviadasNaConferencia: 0,
  ...over,
});

const etapa = (f: FatosDaOperacao, chave: string) =>
  operacaoDoEvento(f).etapas.find((e) => e.chave === chave)!;

describe("a operação do evento", () => {
  it("montagem e desmontagem são 'sem registro' — nunca deduzidas da data", () => {
    const depois = op({ hoje: "2026-10-12" });
    expect(etapa(depois, "montagem").status).toBe("sem_registro");
    expect(etapa(depois, "desmontagem").status).toBe("sem_registro");
    expect(etapa(depois, "evento").status).toBe("concluido");
  });

  it("separação e carregamento seguem o status dos itens de montagem", () => {
    const f = op({ itensDeMontagem: [{ operationalStatus: "carregado" }, { operationalStatus: "separado" }, {}] });
    expect(etapa(f, "separacao")).toMatchObject({ status: "em_andamento", detalhe: "2 de 3 itens" });
    expect(etapa(f, "carregamento")).toMatchObject({ status: "em_andamento", detalhe: "1 de 3 itens" });
    expect(operacaoDoEvento(f).atual).toBe("separacao");
  });

  it("retorno parcial fica em andamento; conferência pendente não some", () => {
    const f = op({
      hoje: "2026-10-12",
      reservas: [{ saiu: 8, voltou: 8 }, { saiu: 10, voltou: 7 }],
    });
    expect(etapa(f, "retorno").status).toBe("em_andamento");
    expect(etapa(f, "conferenciaDeRetorno").status).toBe("nao_iniciado");
    expect(etapa(f, "limpezaReparo").status).toBe("sem_registro");
  });

  it("depois da conferência: peças em reparo seguram o 'disponível de novo'", () => {
    const f = op({
      hoje: "2026-10-12",
      reservas: [{ saiu: 8, voltou: 8, conferidoEm: 1 }],
      pecasEnviadasNaConferencia: 2,
      pecasForaDeUsoNosItens: 2,
    });
    expect(etapa(f, "limpezaReparo").status).toBe("em_andamento");
    expect(etapa(f, "disponivel").status).toBe("nao_iniciado");
    const regularizado = { ...f, pecasForaDeUsoNosItens: 0 };
    expect(etapa(regularizado, "disponivel").status).toBe("concluido");
  });

  it("sem itens nem acervo: tudo 'sem registro' não prende o ponteiro", () => {
    const f = op();
    expect(operacaoDoEvento(f).atual).toBe("evento");
  });
});
