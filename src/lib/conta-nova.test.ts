import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// O PRIMEIRO DIA NÃO É UM DIA TRANQUILO — É UM DIA VAZIO
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// O painel "Precisam da sua atenção" trata como o MESMO estado duas situações
// opostas, porque as duas produzem zero:
//
//   · a decoradora entrou hoje e não cadastrou nada;
//   · ela usa o ALTAR há meses e está tudo em dia.
//
// E dizia a segunda frase nas duas, com um ✓ verde:
//
//     ✓ Nada pedindo atenção agora
//       Nenhum evento próximo com pendência, nenhuma oportunidade parada e
//       nada vencido no Financeiro.
//
// No primeiro dia isso é tranquilizar sobre coisa nenhuma. Pior: CONTRADIZ o
// aviso de primeiros passos, que está logo acima, na mesma tela, no mesmo
// instante, pedindo para criar o primeiro evento. Uma parte da tela diz "está
// tudo certo" e a outra diz "falta fazer" — e quem chegou hoje não tem como
// saber qual das duas acreditar.
//
// É a mesma família do "você não tem nada" dito a quem tem 200 lançamentos,
// pelo avesso: ali a tela negava o que existia; aqui ela afirma calma onde só
// existe vazio.
// ═════════════════════════════════════════════════════════════════════════════

const PAINEL = readFileSync("src/components/attention-board.tsx", "utf-8");
const DASHBOARD = readFileSync("src/pages/app/dashboard/page.tsx", "utf-8");

describe("o painel distingue conta nova de conta em dia", () => {
  it("recebe o total de eventos do pai, sem consulta nova", () => {
    // `getDashboardStats` já é consultado pela tela. Uma consulta própria aqui
    // seria uma assinatura reativa a mais para saber um número que já está na
    // mão.
    expect(PAINEL).toContain("totalDeEventos");
    expect(DASHBOARD).toContain("<AttentionBoard totalDeEventos={stats?.totalEvents} />");
  });

  it("conta sem nenhum evento não recebe o ✓ verde", () => {
    const i = PAINEL.indexOf("totalDeEventos === 0");
    expect(i, "o caso da conta nova não existe").toBeGreaterThan(-1);
    const bloco = PAINEL.slice(i, i + 900);
    expect(bloco).not.toContain("CheckCircle2");
    expect(bloco).toMatch(/primeiro evento/i);
  });

  it("e ganha o caminho para o próximo passo", () => {
    const i = PAINEL.indexOf("totalDeEventos === 0");
    expect(PAINEL.slice(i, i + 900)).toContain('to="/eventos"');
  });

  it("a conta em uso e em dia continua com a frase de sempre", () => {
    // A correção não podia apagar o estado calmo: ele é verdadeiro para quem
    // já trabalha no sistema, e é o que ela quer ler numa segunda-feira.
    expect(PAINEL).toContain("Nada pedindo atenção agora");
    expect(PAINEL).toContain("CheckCircle2");
  });

  it("enquanto o total não chega, o painel não afirma nem uma coisa nem outra", () => {
    // "A tela nunca afirma o que não sabe": `undefined` é silêncio, não zero.
    expect(PAINEL).toMatch(/vazio && totalDeEventos === undefined/);
  });
});
