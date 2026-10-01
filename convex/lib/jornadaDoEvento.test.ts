import { describe, expect, it } from "vitest";
import {
  ETAPAS_DO_PROJETO,
  jornadaDoEvento,
  operacaoDoEvento,
  resumoDaJornada,
  TETO_DE_ATENCAO,
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


describe("o resumo que abre a página", () => {
  const base = {
    atencaoDaSaude: [] as string[],
    reservasComDeficit: 0,
    retornoPorConferir: false,
  };

  it("antes do evento: fase PROJETO, próximo passo é 'você está aqui'", () => {
    const r = resumoDaJornada({
      ...base, jornada: jornadaDoEvento(nada), operacao: operacaoDoEvento(op()), aconteceu: false,
    });
    expect(r).toMatchObject({ fase: "projeto", proximoPasso: { rotulo: "Briefing", rota: "briefing" } });
  });

  it("depois do evento: fase OPERAÇÃO, mesmo com projeto em aberto", () => {
    const operacao = operacaoDoEvento(op({ hoje: "2026-10-12", reservas: [{ saiu: 8, voltou: 8 }] }));
    const r = resumoDaJornada({ ...base, jornada: jornadaDoEvento(nada), operacao, aconteceu: true, retornoPorConferir: true });
    expect(r.fase).toBe("operacao");
    expect(r.proximoPasso?.rotulo).toBe("Conferência de retorno");
    expect(r.atencao[0]).toBe("Acervo voltou e o retorno ainda não foi conferido");
  });

  it("o aviso da jornada não é cortado pelo teto, e nada se repete", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => `aviso ${i}`);
    const r = resumoDaJornada({
      ...base, jornada: jornadaDoEvento(nada), operacao: operacaoDoEvento(op()), aconteceu: false,
      atencaoDaSaude: [...muitos, "aviso 1"], reservasComDeficit: 2,
    });
    expect(r.atencao).toHaveLength(TETO_DE_ATENCAO);
    // Desde 30/09 o déficit entra pelo veredito (que decide o "Em risco"),
    // com a mesma notícia em palavras de risco — e continua em primeiro.
    expect(r.atencao[0]).toBe("Falta peça do acervo em 2 reservas");
    expect(r.veredito.nivel).toBe("risco");
    expect(new Set(r.atencao).size).toBe(r.atencao.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O REFINO DE 30/09 — o próximo passo leva ao lugar certo, e a Saúde diz em
// palavras se o evento está saudável
// ─────────────────────────────────────────────────────────────────────────────

describe("o próximo passo da operação leva aonde a etapa se resolve", () => {
  const base = { atencaoDaSaude: [] as string[], reservasComDeficit: 0, retornoPorConferir: false };

  it("separação vai para os itens de montagem — não para o acervo (o defeito de antes)", () => {
    const operacao = operacaoDoEvento(op({ itensDeMontagem: [{}, {}] }));
    const r = resumoDaJornada({ ...base, jornada: jornadaDoEvento(tudo), operacao, aconteceu: false });
    expect(r).toMatchObject({ fase: "operacao", proximoPasso: { rotulo: "Separação", rota: "briefing" } });
  });

  it("depois do evento, a conferência de retorno vai para o acervo", () => {
    const operacao = operacaoDoEvento(op({ hoje: "2026-10-12", reservas: [{ saiu: 8, voltou: 8 }] }));
    const r = resumoDaJornada({ ...base, jornada: jornadaDoEvento(tudo), operacao, aconteceu: true });
    expect(r.proximoPasso).toMatchObject({ rotulo: "Conferência de retorno", rota: "acervo" });
  });

  it("a faixa e a Saúde usam a MESMA rota: ela mora na etapa", () => {
    const etapas = operacaoDoEvento(op()).etapas;
    expect(Object.fromEntries(etapas.map((e) => [e.chave, e.rota]))).toEqual({
      separacao: "briefing", carregamento: "briefing", conferencia: "briefing",
      montagem: undefined, evento: undefined, desmontagem: undefined,
      retorno: "acervo", conferenciaDeRetorno: "acervo", limpezaReparo: "acervo", disponivel: "acervo",
    });
  });

  it("projeto feito, sem itens, evento no futuro: o passo é esperar — nunca 'Evento: ainda não aconteceu'", () => {
    const r = resumoDaJornada({
      ...base, jornada: jornadaDoEvento(tudo), operacao: operacaoDoEvento(op()), aconteceu: false, diasParaOEvento: 12,
    });
    expect(r.proximoPasso).toEqual({ rotulo: "Aguardar o evento", detalhe: "Faltam 12 dias. Projeto e preparação em dia." });
    expect(r.proximoPasso?.rota).toBeUndefined();
  });
});

describe("o veredito — 'esse evento está saudável?' e por quê", () => {
  const base = { atencaoDaSaude: [] as string[], reservasComDeficit: 0, retornoPorConferir: false };
  const resumo = (over: Partial<Parameters<typeof resumoDaJornada>[0]> = {}) =>
    resumoDaJornada({
      ...base, jornada: jornadaDoEvento(tudo), operacao: operacaoDoEvento(op()), aconteceu: false, ...over,
    });

  it("tudo feito, longe da data: EM DIA, dizendo o próximo passo", () => {
    const r = resumo({ diasParaOEvento: 60 });
    expect(r.veredito).toMatchObject({ nivel: "em_dia", titulo: "Em dia" });
    expect(r.veredito.porque).toMatch(/^Nada bloqueando/);
  });

  it("contrato sem anexar a 5 dias: EM RISCO, com o número de dias", () => {
    const j = jornadaDoEvento({ ...tudo, contrato: { anexado: false, pendencias: 0 } });
    const r = resumo({ jornada: j, diasParaOEvento: 5 });
    expect(r.veredito.nivel).toBe("risco");
    expect(r.veredito.porque).toBe("Contrato em aberto a 5 dias do evento — contrato não anexado");
  });

  it("a mesma falta a 20 dias é ATENÇÃO; a 90 dias não muda o veredito", () => {
    const j = jornadaDoEvento({ ...tudo, contrato: { anexado: false, pendencias: 0 } });
    expect(resumo({ jornada: j, diasParaOEvento: 20 }).veredito.nivel).toBe("atencao");
    expect(resumo({ jornada: j, diasParaOEvento: 90 }).veredito.nivel).toBe("em_dia");
  });

  it("no dia do evento a frase não diz '0 dias'", () => {
    const j = jornadaDoEvento({ ...tudo, fornecedores: [{ status: "orcado" }] });
    const r = resumo({ jornada: j, diasParaOEvento: 0 });
    expect(r.veredito.porque).toBe("Fornecedores em aberto no dia do evento — 0 de 1 fechados");
  });

  it("déficit de acervo antes do evento é RISCO, a qualquer distância da data", () => {
    const r = resumo({ diasParaOEvento: 120, reservasComDeficit: 1 });
    expect(r.veredito).toMatchObject({ nivel: "risco", porque: "Falta peça do acervo em 1 reserva" });
  });

  it("nenhuma peça reservada perto da data NÃO é risco — muito evento não usa acervo", () => {
    const j = jornadaDoEvento({ ...tudo, acervo: { reservas: 0, comDeficit: 0 } });
    expect(resumo({ jornada: j, diasParaOEvento: 3 }).veredito.nivel).toBe("em_dia");
  });

  it("aviso de cadastro da Saúde longe da data fica na lista, mas não muda o veredito", () => {
    const r = resumo({ diasParaOEvento: 90, atencaoDaSaude: ["Fornecedor sem alinhamento: Flora"] });
    expect(r.veredito.nivel).toBe("em_dia");
    expect(r.atencao).toEqual(["Fornecedor sem alinhamento: Flora"]);
  });

  it("depois do evento: peça que não voltou é RISCO e entra na lista (o defeito de antes: sumia)", () => {
    const operacao = operacaoDoEvento(op({ hoje: "2026-10-14", reservas: [{ saiu: 24, voltou: 20 }] }));
    const r = resumo({ operacao, aconteceu: true, diasParaOEvento: -4, pecasForaSemVoltar: 4 });
    expect(r.veredito).toMatchObject({ nivel: "risco", porque: "4 peças do acervo ainda não voltaram" });
    expect(r.atencao).toContain("4 peças do acervo ainda não voltaram");
  });

  it("retorno por conferir é ATENÇÃO", () => {
    const operacao = operacaoDoEvento(op({ hoje: "2026-10-12", reservas: [{ saiu: 8, voltou: 8 }] }));
    const r = resumo({ operacao, aconteceu: true, diasParaOEvento: -2, retornoPorConferir: true });
    expect(r.veredito).toMatchObject({
      nivel: "atencao", porque: "Acervo voltou e o retorno ainda não foi conferido",
    });
  });

  it("evento cancelado: veredito próprio — e as peças na rua ainda pedem atenção", () => {
    expect(resumo({ cancelado: true, diasParaOEvento: 3 }).veredito.nivel).toBe("cancelado");
    const comPecaFora = resumo({ cancelado: true, pecasForaSemVoltar: 2 });
    expect(comPecaFora.veredito).toMatchObject({ nivel: "atencao", porque: "2 peças do acervo ainda não voltaram" });
  });

  it("o veredito não repete o aviso da Saúde que diz a mesma coisa", () => {
    const j = jornadaDoEvento({ ...tudo, contrato: { anexado: false, pendencias: 0 } });
    const r = resumo({ jornada: j, diasParaOEvento: 4, atencaoDaSaude: ["Contrato ainda não anexado", "Outro"] });
    expect(r.atencao).toEqual(["Contrato em aberto a 4 dias do evento — contrato não anexado", "Outro"]);
  });

  it("data ilegível: nada é afirmado sobre prazo", () => {
    const j = jornadaDoEvento({ ...tudo, contrato: { anexado: false, pendencias: 0 } });
    expect(resumo({ jornada: j, diasParaOEvento: null }).veredito.nivel).toBe("em_dia");
  });
});
