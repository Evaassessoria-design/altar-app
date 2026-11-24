import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  avisoDosPrimeirosPassos,
  primeirosPassos,
  resumoDoProgresso,
} from "./primeiros-passos.ts";

// ═════════════════════════════════════════════════════════════════════════════
// OS PRIMEIROS PASSOS — três defeitos, três travas
//
// 1. "0 de 3 passos concluídos" aparecia enquanto as consultas carregavam.
// 2. O passo OPCIONAL entrava no denominador: quem fazia tudo o que era
//    exigido lia "2 de 3", 67%, e um botão de continuar — para sempre.
// 3. "Continuar configuração" reabria o modal de boas-vindas no passo UM, com
//    o nome do estúdio em branco por cima do que já estava salvo.
// 4. Com tudo pronto, o cartão ainda pedia um "Dispensar": um toque para sair
//    de uma tarefa já terminada, em TODA conta nova. Agora ele não aparece —
//    e nada foi gravado para isso, porque concluído é derivável.
// ═════════════════════════════════════════════════════════════════════════════

const carregado = { studioName: "Ateliê Eva", eventos: 1, equipe: 1 };

describe("enquanto o sistema não sabe, ele não afirma", () => {
  it("consulta de eventos ainda carregando devolve null", () => {
    expect(primeirosPassos({ ...carregado, eventos: undefined })).toBeNull();
  });

  it("consulta de equipe ainda carregando devolve null", () => {
    expect(primeirosPassos({ ...carregado, equipe: undefined })).toBeNull();
  });

  it("estúdio sem nome NÃO é carregamento — é um passo pendente", () => {
    // Perfil sem `studioName` é resposta legítima do backend. Tratá-la como
    // silêncio esconderia justamente o primeiro passo.
    const p = primeirosPassos({ studioName: null, eventos: 0, equipe: 0 });
    expect(p).not.toBeNull();
    expect(p!.passos.find((s) => s.id === "studio")!.feito).toBe(false);
  });
});

describe("o progresso conta o que é exigido", () => {
  it("estúdio e primeiro evento fecham a configuração, mesmo sem equipe", () => {
    const p = primeirosPassos({ studioName: "Ateliê", eventos: 1, equipe: 0 })!;
    expect(p.feitos).toBe(2);
    expect(p.exigidos).toBe(2);
    expect(p.percentual).toBe(100);
    expect(p.completo).toBe(true);
  });

  it("a equipe continua aparecendo, marcada como opcional", () => {
    const p = primeirosPassos({ studioName: "Ateliê", eventos: 1, equipe: 0 })!;
    const equipe = p.passos.find((s) => s.id === "team")!;
    expect(equipe.opcional).toBe(true);
    expect(equipe.feito).toBe(false);
    expect(p.passos).toHaveLength(3);
  });

  it("conta zerada: nada feito, nada afirmado a mais", () => {
    const p = primeirosPassos({ studioName: undefined, eventos: 0, equipe: 0 })!;
    expect(p.feitos).toBe(0);
    expect(p.percentual).toBe(0);
    expect(p.completo).toBe(false);
  });

  it("estúdio com nome em branco não conta como configurado", () => {
    const p = primeirosPassos({ studioName: "", eventos: 1, equipe: 1 })!;
    expect(p.passos.find((s) => s.id === "studio")!.feito).toBe(false);
    expect(p.completo).toBe(false);
  });
});

describe("cada passo leva ao lugar onde ele acontece", () => {
  it("nenhum passo aponta para o modal de boas-vindas", () => {
    const p = primeirosPassos({ studioName: undefined, eventos: 0, equipe: 0 })!;
    for (const passo of p.passos) {
      expect(passo.destino.startsWith("/"), `${passo.id}: destino não é rota`).toBe(true);
      expect(passo.acao.length).toBeGreaterThan(0);
    }
  });

  it("os destinos são rotas que o aplicativo declara", () => {
    const app = readFileSync("src/App.tsx", "utf-8");
    const p = primeirosPassos({ studioName: undefined, eventos: 0, equipe: 0 })!;
    for (const passo of p.passos) {
      expect(app, `${passo.destino} não existe`).toContain(`path="${passo.destino}"`);
    }
  });

  it("o próximo é o primeiro pendente, na ordem em que se faz", () => {
    expect(primeirosPassos({ studioName: undefined, eventos: 0, equipe: 0 })!.proximo!.id)
      .toBe("studio");
    expect(primeirosPassos({ studioName: "A", eventos: 0, equipe: 0 })!.proximo!.id)
      .toBe("event");
    expect(primeirosPassos({ studioName: "A", eventos: 2, equipe: 0 })!.proximo!.id)
      .toBe("team");
  });

  it("com tudo feito não há próximo passo a sugerir", () => {
    expect(primeirosPassos(carregado)!.proximo).toBeNull();
  });
});

describe("a frase de progresso", () => {
  it("conta só o que é exigido", () => {
    const p = primeirosPassos({ studioName: "A", eventos: 0, equipe: 0 })!;
    expect(resumoDoProgresso(p)).toBe("1 de 2 passos concluídos");
  });

  it("completo com opcional pendente não diz 'tudo pronto'", () => {
    // Dizer "tudo pronto" com a equipe vazia faria o passo opcional, que
    // continua na lista, parecer um erro da tela.
    const p = primeirosPassos({ studioName: "A", eventos: 1, equipe: 0 })!;
    expect(resumoDoProgresso(p)).toMatch(/essencial/i);
  });

  it("completo de verdade é curto", () => {
    expect(resumoDoProgresso(primeirosPassos(carregado)!)).toBe("Tudo pronto.");
  });

  it("nenhuma frase usa vocabulário técnico", () => {
    for (const sinais of [
      { studioName: undefined, eventos: 0, equipe: 0 },
      { studioName: "A", eventos: 0, equipe: 0 },
      { studioName: "A", eventos: 1, equipe: 0 },
      carregado,
    ]) {
      const texto = resumoDoProgresso(primeirosPassos(sinais)!);
      expect(texto).not.toMatch(/onboarding|studioName|null|undefined/i);
    }
  });
});

describe("avisoDosPrimeirosPassos — as quatro razões para não aparecer", () => {
  const faltandoEvento = { studioName: "Eva Decor", eventos: 0, equipe: 0 };
  const tudoPronto = { studioName: "Eva Decor", eventos: 1, equipe: 0 };

  it("desenha enquanto falta um passo exigido", () => {
    const r = avisoDosPrimeirosPassos(faltandoEvento, {
      onboardingCompleted: false,
      dispensado: false,
    });
    expect(r?.proximo?.id).toBe("event");
  });

  it("não desenha quando o essencial está pronto, mesmo sem equipe", () => {
    // O passo opcional em aberto NÃO segura o cartão na tela.
    expect(
      avisoDosPrimeirosPassos(tudoPronto, { onboardingCompleted: false, dispensado: false }),
    ).toBeNull();
  });

  it("não desenha para quem já dispensou — antes ou agora", () => {
    expect(
      avisoDosPrimeirosPassos(faltandoEvento, { onboardingCompleted: true, dispensado: false }),
    ).toBeNull();
    expect(
      avisoDosPrimeirosPassos(faltandoEvento, { onboardingCompleted: false, dispensado: true }),
    ).toBeNull();
  });

  it("não desenha enquanto o sistema não sabe", () => {
    expect(
      avisoDosPrimeirosPassos(
        { studioName: "Eva Decor", eventos: undefined, equipe: 0 },
        { onboardingCompleted: false, dispensado: false },
      ),
    ).toBeNull();
    // `onboardingCompleted` indefinido é usuário ainda carregando: não é
    // "false" e não autoriza desenhar por omissão... mas também não esconde
    // um cartão legítimo, porque o progresso é quem manda.
    expect(
      avisoDosPrimeirosPassos(faltandoEvento, {
        onboardingCompleted: undefined,
        dispensado: false,
      })?.proximo?.id,
    ).toBe("event");
  });

  it("apagar o único evento traz o cartão de volta — é a verdade", () => {
    // Consequência aceita de propósito de derivar em vez de gravar: quem apaga
    // o evento de teste da demonstração realmente não tem evento nenhum.
    expect(
      avisoDosPrimeirosPassos(
        { studioName: "Eva Decor", eventos: 0, equipe: 0 },
        { onboardingCompleted: false, dispensado: false },
      )?.proximo?.id,
    ).toBe("event");
  });

  it("nada é gravado para concluir: não existe mutation de carimbo", () => {
    const fonte = readFileSync("src/lib/primeiros-passos.ts", "utf-8");
    expect(fonte).not.toContain("useMutation");
    expect(fonte).not.toContain("api.");
  });
});

describe("o aviso não desenha o que não sabe", () => {
  const fonte = readFileSync("src/components/onboarding-banner.tsx", "utf-8");

  it("o componente sai calado enquanto a regra devolve null", () => {
    expect(fonte).toContain("if (!progresso) return null;");
  });

  it("nenhuma consulta é lida com `?? 0` — era daí que vinha o 0 de 3", () => {
    expect(fonte).not.toMatch(/\?\?\s*0\)\s*>\s*0/);
  });

  it("o botão não reabre mais o modal de boas-vindas", () => {
    expect(fonte).not.toContain("onOpenOnboarding");
    const dashboard = readFileSync("src/pages/app/dashboard/page.tsx", "utf-8");
    expect(dashboard).not.toContain("onOpenOnboarding");
  });

  it("com o essencial pronto, o cartão NÃO aparece — nem para ser dispensado", () => {
    // Esta regra substitui a anterior, e por isso o histórico fica escrito:
    //
    // antes, com tudo pronto, o cartão dizia "Configuração concluída" e o
    // botão virava "Dispensar". Isso já era melhor do que continuar oferecendo
    // "Abrir equipe" a quem trabalha sozinha (aviso que não sai ensina a
    // ignorar aquele pedaço da tela) — mas ainda cobrava um toque para sair de
    // uma tarefa que ela já tinha terminado.
    //
    // Agora quem decide é `avisoDosPrimeirosPassos`, e o componente não tem
    // regra: não há ramo de `completo` no desenho, e nenhum botão de dispensar
    // fora do X.
    expect(fonte).toContain("avisoDosPrimeirosPassos(");
    expect(fonte).not.toContain("progresso.completo");
    expect(fonte).not.toContain("Configuração concluída");
  });

  it("o X continua existindo enquanto AINDA falta algo — dispensar é decisão dela", () => {
    expect(fonte).toContain("completeOnboarding");
    expect(fonte).toContain('title="Dispensar"');
  });

  it("o modal continua existindo para a primeira entrada", () => {
    // A trava ao contrário: tirar o modal deixaria quem acabou de assinar
    // diante de um painel vazio, sem nome de estúdio e sem evento nenhum.
    const layout = readFileSync("src/pages/app/layout.tsx", "utf-8");
    expect(layout).toContain("OnboardingModal");
    expect(layout).toContain("setShowOnboarding(true)");
  });
});
