import { describe, expect, it } from "vitest";
import {
  agruparTarefas,
  buscaAtiva,
  contarFiltrosAtivos,
  descreverResultado,
  emOrdemCronologica,
  OPCOES_DE_CANAL,
  OPCOES_DE_STATUS,
  ROTULO_DO_CANAL,
  ROTULO_DO_STATUS,
  rotuloDaJanela,
} from "./central-inbox";

// ─────────────────────────────────────────────────────────────────────────────
// O que a caixa de entrada AFIRMA tem de ser verdade.
//
// Cada teste aqui corresponde a uma frase que aparece na tela e que, se
// estiver errada, muda a decisão de quem está lendo.
// ─────────────────────────────────────────────────────────────────────────────

describe("o resumo da lista nunca se passa pelo total", () => {
  it("enquanto houver próxima página, diz 'carregadas'", () => {
    const texto = descreverResultado({
      carregados: 25,
      temMais: true,
      ordenadoPor: "recencia",
      carregando: false,
    });
    expect(texto).toContain("25 carregadas");
    expect(texto).toContain("há mais");
  });

  it("quando acabou, aí sim é a contagem", () => {
    expect(
      descreverResultado({
        carregados: 3,
        temMais: false,
        ordenadoPor: "recencia",
        carregando: false,
      }),
    ).toContain("3 conversas");
  });

  it("uma conversa é 'conversa', não 'conversas'", () => {
    expect(
      descreverResultado({
        carregados: 1,
        temMais: false,
        ordenadoPor: "recencia",
        carregando: false,
      }),
    ).toContain("1 conversa ·");
  });

  it("com busca, avisa que a ordem é por relevância", () => {
    const texto = descreverResultado({
      carregados: 4,
      temMais: false,
      ordenadoPor: "relevancia",
      carregando: false,
    });
    expect(texto).toContain("relevância");
    expect(texto).not.toContain("recentes");
  });

  it("vazio com filtro diz que é dos filtros, não que não há nada", () => {
    expect(
      descreverResultado({
        carregados: 0,
        temMais: false,
        ordenadoPor: "recencia",
        carregando: false,
      }),
    ).toBe("Nenhuma conversa com estes filtros.");
  });
});

describe("busca ativa", () => {
  it("segue o mesmo piso do backend: duas letras", () => {
    expect(buscaAtiva("h")).toBe(false);
    expect(buscaAtiva(" he ")).toBe(true);
    expect(buscaAtiva(undefined)).toBe(false);
  });

  it("conta como filtro ativo", () => {
    expect(contarFiltrosAtivos({ busca: "helena" })).toBe(1);
    expect(contarFiltrosAtivos({ busca: "h" })).toBe(0);
    expect(
      contarFiltrosAtivos({ departamento: "comercial", status: "aberta", apenasEscaladas: true }),
    ).toBe(3);
    expect(contarFiltrosAtivos({})).toBe(0);
  });
});

describe("janela de resposta do canal", () => {
  const agora = Date.parse("2026-09-18T12:00:00Z");

  it("sem janela, não afirma nada", () => {
    expect(rotuloDaJanela(undefined, agora)).toBeNull();
    expect(rotuloDaJanela(null, agora)).toBeNull();
  });

  it("conta as horas que faltam", () => {
    expect(rotuloDaJanela(agora + 3 * 60 * 60 * 1000, agora)).toEqual({
      texto: "Janela fecha em 3h",
      encerrada: false,
    });
  });

  it("abaixo de uma hora, conta em minutos", () => {
    expect(rotuloDaJanela(agora + 20 * 60 * 1000, agora)?.texto).toBe("Janela fecha em 20 min");
  });

  it("passada a hora, diz que encerrou — não arredonda para 'agora'", () => {
    const passada = rotuloDaJanela(agora - 1, agora);
    expect(passada?.encerrada).toBe(true);
    expect(passada?.texto).toBe("Janela de resposta encerrada");
  });
});

describe("agrupamento de tarefas", () => {
  const base = { venceEm: "2026-09-18", vencido: false, venceHoje: false } as const;

  it("separa pelo que a manhã pergunta", () => {
    const grupos = agruparTarefas([
      { ...base, status: "aberto", vencido: true },
      { ...base, status: "em_andamento", venceHoje: true },
      { ...base, status: "aberto" },
      { ...base, status: "aberto", venceEm: undefined },
      { ...base, status: "concluido" },
      { ...base, status: "cancelado" },
    ]);

    expect(grupos.vencidas).toHaveLength(1);
    expect(grupos.hoje).toHaveLength(1);
    expect(grupos.proximas).toHaveLength(1);
    expect(grupos.semPrazo).toHaveLength(1);
    expect(grupos.concluidas).toHaveLength(1);
    expect(grupos.canceladas).toHaveLength(1);
  });

  it("tarefa concluída com data passada NÃO é vencida", () => {
    const grupos = agruparTarefas([{ ...base, status: "concluido", vencido: true }]);
    expect(grupos.vencidas).toHaveLength(0);
    expect(grupos.concluidas).toHaveLength(1);
  });
});

describe("mensagens", () => {
  it("a inversão para ordem cronológica acontece em um lugar só", () => {
    const ordenadas = emOrdemCronologica([
      { enviadaEm: 300, texto: "c" },
      { enviadaEm: 100, texto: "a" },
      { enviadaEm: 200, texto: "b" },
    ]);
    expect(ordenadas.map((m) => m.texto)).toEqual(["a", "b", "c"]);
  });

  it("não altera o array recebido", () => {
    const original = [{ enviadaEm: 2 }, { enviadaEm: 1 }];
    emOrdemCronologica(original);
    expect(original[0].enviadaEm).toBe(2);
  });
});

describe("rótulos", () => {
  it("todo status de conversa tem nome em português", () => {
    for (const opcao of OPCOES_DE_STATUS) {
      expect(ROTULO_DO_STATUS[opcao.valor]).toBeTruthy();
      expect(opcao.rotulo).not.toContain("_");
    }
  });

  it("canal é atributo — todos têm rótulo, nenhum vira seção", () => {
    expect(OPCOES_DE_CANAL.map((o) => o.valor)).toEqual([
      "whatsapp",
      "instagram",
      "email",
      "chat",
    ]);
    for (const opcao of OPCOES_DE_CANAL) {
      expect(ROTULO_DO_CANAL[opcao.valor]).toBeTruthy();
    }
  });
});
