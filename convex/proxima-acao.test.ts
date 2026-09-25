import { describe, expect, it } from "vitest";
import {
  DIAS_DE_TESTE_PARA_ALERTAR,
  DIAS_PARA_DESISTIR_DO_FOLLOW_UP,
  DIAS_PARA_FOLLOW_UP,
  ordenarPorPrioridade,
  proximaAcao,
  type FatosDoInteressado,
} from "./lib/proximaAcao";

// ═════════════════════════════════════════════════════════════════════════════
// A PRÓXIMA MELHOR AÇÃO
//
// Com trinta interessados, "quem eu abordo agora?" cabe na cabeça. Com
// trezentos, não — e o que acontece é que se aborda quem está no topo da
// lista, que é quem chegou por último. Quem espera há duas semanas fica
// esperando para sempre.
//
// Estes testes guardam três coisas: a regra não inventa trabalho, não afirma
// o que não sabe, e não aborda quem não deve ser abordado.
// ═════════════════════════════════════════════════════════════════════════════

const fatos = (over: Partial<FatosDoInteressado> = {}): FatosDoInteressado => ({
  temCanal: true,
  ...over,
});

describe("não aborda quem não deve ser abordado", () => {
  it("cliente sai da campanha de aquisição", () => {
    // Continuar abordando quem assinou faz o cliente novo receber convite para
    // conhecer o produto que ele acabou de comprar.
    const a = proximaAcao(fatos({ status: "convertido" }));
    expect(a.mensagem).toBeNull();
    expect(a.urgencia).toBe("nenhuma");
    expect(a.acao).toMatch(/tirar da campanha/i);
  });

  it("quem disse não fica em paz", () => {
    const a = proximaAcao(fatos({ status: "descartado" }));
    expect(a.mensagem).toBeNull();
    expect(a.urgencia).toBe("nenhuma");
  });

  it("os dois estados terminais vencem até a falta de canal", () => {
    // A ordem das regras importa: se "sem canal" viesse antes, o painel
    // mandaria procurar o telefone de um cliente que já assinou.
    expect(proximaAcao(fatos({ status: "convertido", temCanal: false })).acao).toMatch(
      /tirar da campanha/i,
    );
  });

  it("quem confirmou presença NÃO recebe abordagem comercial", () => {
    // Ela já disse sim. Insistir agora só serve para desconfirmar.
    const a = proximaAcao(fatos({ status: "confirmou", diasAteACampanha: 10 }));
    expect(a.mensagem).toBeNull();
    expect(a.urgencia).toBe("nenhuma");
  });
});

describe("o convite e o follow-up", () => {
  it("quem chegou e ninguém falou: preparar o convite", () => {
    const a = proximaAcao(fatos({ status: "novo" }));
    expect(a.mensagem).toBe("convite");
    expect(a.urgencia).toBe("agora");
  });

  it("convidada hoje: esperar, não insistir", () => {
    const a = proximaAcao(fatos({ status: "contatado", diasDesdeOConvite: 0 }));
    expect(a.mensagem).toBeNull();
    expect(a.acao).toMatch(/esperar/i);
  });

  it(`a partir de ${DIAS_PARA_FOLLOW_UP} dias sem resposta, follow-up`, () => {
    const antes = proximaAcao(
      fatos({ status: "contatado", diasDesdeOConvite: DIAS_PARA_FOLLOW_UP - 1 }),
    );
    expect(antes.mensagem).toBeNull();

    const depois = proximaAcao(
      fatos({ status: "contatado", diasDesdeOConvite: DIAS_PARA_FOLLOW_UP }),
    );
    expect(depois.mensagem).toBe("follow_up_sem_resposta");
    expect(depois.motivo).toContain(String(DIAS_PARA_FOLLOW_UP));
  });

  it("depois de duas semanas, PARA de insistir", () => {
    // Um sistema que sugere follow-up para sempre transforma campanha em
    // perseguição, e o número queimado não volta.
    const a = proximaAcao(
      fatos({ status: "contatado", diasDesdeOConvite: DIAS_PARA_DESISTIR_DO_FOLLOW_UP + 1 }),
    );
    expect(a.mensagem).toBeNull();
    expect(a.acao).toMatch(/parar de insistir/i);
  });

  it("convidada SEM data não vira follow-up às cegas", () => {
    // Está marcada como convidada e não há carimbo — registro antigo, ou etapa
    // movida à mão. Um follow-up por cima disso pode ser a segunda mensagem em
    // dez minutos.
    const a = proximaAcao(fatos({ status: "contatado" }));
    expect(a.mensagem).toBeNull();
    expect(a.precisaDeHumano).toBe(true);
    expect(a.motivo).toMatch(/não há registro de quando/i);
  });
});

describe("depois da apresentação", () => {
  it("participou: convidar para testar", () => {
    expect(proximaAcao(fatos({ status: "participou" })).mensagem).toBe("convite_trial");
  });

  it("não participou: oferecer demonstração, não cobrar ausência", () => {
    const a = proximaAcao(fatos({ status: "nao_participou" }));
    expect(a.mensagem).toBe("faltou_a_live");
    expect(a.motivo).not.toMatch(/faltou|não veio/i);
  });

  it("confirmou e a live já passou: alguém precisa dizer se ela veio", () => {
    // Fingir presença infla a taxa de comparecimento; fingir ausência a
    // derruba. A saída é pedir a informação a quem a tem.
    const a = proximaAcao(fatos({ status: "confirmou", diasAteACampanha: -1 }));
    expect(a.precisaDeHumano).toBe(true);
    expect(a.mensagem).toBeNull();
    expect(a.acao).toMatch(/marcar se participou/i);
  });

  it("os lembretes aparecem na véspera e no dia, nunca antes", () => {
    expect(proximaAcao(fatos({ status: "confirmou", diasAteACampanha: 2 })).mensagem).toBeNull();
    expect(proximaAcao(fatos({ status: "confirmou", diasAteACampanha: 1 })).mensagem).toBe(
      "lembrete_24h",
    );
    expect(proximaAcao(fatos({ status: "confirmou", diasAteACampanha: 0 })).mensagem).toBe(
      "lembrete_30min",
    );
  });
});

describe("o que a regra NÃO sabe, ela não afirma", () => {
  it("trial sem consulta à conta não vira 'conta vazia'", () => {
    // `undefined` é "ninguém mediu", nunca "é zero". Concluir vazio sem ter
    // olhado mandaria a pessoa receber ajuda de onboarding que ela não pediu.
    const a = proximaAcao(fatos({ status: "testando" }));
    expect(a.acao).toMatch(/acompanhar/i);
    expect(a.motivo).not.toMatch(/nenhum evento|não criou/i);
  });

  it("trial com conta vazia é o alerta mais urgente que existe", () => {
    // É aqui que a maior parte dos testes morre.
    const a = proximaAcao(fatos({ status: "testando", eventosNaConta: 0 }));
    expect(a.urgencia).toBe("agora");
    expect(a.precisaDeHumano).toBe(true);
    expect(a.acao).toMatch(/ajudar a começar/i);
  });

  it("trial com evento criado e prazo longe é só acompanhar", () => {
    const a = proximaAcao(
      fatos({ status: "testando", eventosNaConta: 3, diasAteOFimDoTeste: 20 }),
    );
    expect(a.urgencia).toBe("quando_der");
    expect(a.motivo).toContain("3");
  });

  it("trial perto do fim sobe para o comercial", () => {
    const a = proximaAcao(
      fatos({
        status: "testando",
        eventosNaConta: 2,
        diasAteOFimDoTeste: DIAS_DE_TESTE_PARA_ALERTAR,
      }),
    );
    expect(a.urgencia).toBe("agora");
    expect(a.precisaDeHumano).toBe(true);
  });

  it("trial vencido diz que venceu, sem número negativo na tela", () => {
    const a = proximaAcao(fatos({ status: "testando", eventosNaConta: 1, diasAteOFimDoTeste: -3 }));
    expect(a.motivo).toMatch(/já venceu/i);
    expect(a.motivo).not.toContain("-3");
  });

  it("sem canal, a ação é achar contato — e é decisão de gente", () => {
    const a = proximaAcao(fatos({ status: "novo", temCanal: false }));
    expect(a.mensagem).toBeNull();
    expect(a.precisaDeHumano).toBe(true);
  });
});

describe("a ordem da fila", () => {
  it("urgência primeiro; dentro dela, quem espera há mais tempo", () => {
    // Sem o segundo critério, a lista atende sempre quem chegou por último —
    // que é o que acontece quando a ordem é a do cadastro.
    const itens = [
      { id: "recente", acao: proximaAcao(fatos({ status: "novo" })), esperandoHaDias: 1 },
      { id: "antigo", acao: proximaAcao(fatos({ status: "novo" })), esperandoHaDias: 30 },
      {
        id: "sem_pressa",
        acao: proximaAcao(fatos({ status: "convertido" })),
        esperandoHaDias: 90,
      },
      {
        id: "semana",
        acao: proximaAcao(fatos({ status: "nao_participou" })),
        esperandoHaDias: 2,
      },
    ];
    expect(ordenarPorPrioridade(itens).map((i) => i.id)).toEqual([
      "antigo",
      "recente",
      "semana",
      "sem_pressa",
    ]);
  });

  it("lista vazia não quebra", () => {
    expect(ordenarPorPrioridade([])).toEqual([]);
  });
});
