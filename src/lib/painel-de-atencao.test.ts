import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// O PAINEL DA MANHÃ NÃO PODE SE CONTRADIZER
//
// "Precisam da sua atenção" tem três fontes: eventos, oportunidades do funil e
// dinheiro vencido. O estado vazio olhava para UMA delas.
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// Com o funil pedindo follow-up e nenhum evento na janela, o cartão mostrava
//
//     "3 oportunidades precisam de você"
//     ✓ Nada pedindo atenção agora
//
// as duas coisas, uma embaixo da outra. A linha do dinheiro, acrescentada
// depois, cairia na mesma armadilha — por isso as três consultas vivem no
// componente pai.
// ═════════════════════════════════════════════════════════════════════════════

const FONTE = readFileSync("src/components/attention-board.tsx", "utf-8");

describe("o estado vazio conhece as três fontes", () => {
  it("as três consultas ficam no componente pai", () => {
    const pai = FONTE.slice(FONTE.indexOf("export function AttentionBoard"));
    for (const consulta of [
      "api.dashboard.getAttentionBoard",
      "api.funil.getFollowUp",
      "api.financeiro.getVencidos",
    ]) {
      expect(pai, `${consulta} não está no pai`).toContain(consulta);
    }
  });

  it("nenhuma linha busca os próprios dados", () => {
    // Consulta dentro da linha é o que escondia a informação do pai — e foi
    // isso que produziu a contradição.
    for (const linha of ["function LinhaDoFunil", "function LinhaDoDinheiro"]) {
      const bloco = FONTE.slice(FONTE.indexOf(linha), FONTE.indexOf("return (", FONTE.indexOf(linha)));
      expect(bloco, `${linha} consulta por conta própria`).not.toContain("useQuery");
    }
  });

  it("o vazio exige silêncio das três", () => {
    expect(FONTE).toContain("eventos.length === 0 && !vencido?.temAlgo && (funil?.total ?? 0) === 0");
  });

  it("consulta carregando NÃO conta como 'nada a dizer'", () => {
    // `undefined` é silêncio, não resposta: tratá-lo como vazio faria o
    // "Nada pedindo atenção agora" piscar antes dos alertas aparecerem.
    expect(FONTE).toMatch(/!vencido\?\.temAlgo/);
    expect(FONTE).toMatch(/\(funil\?\.total \?\? 0\) === 0/);
  });

  it("o subtítulo não promete só eventos", () => {
    // Ele dizia "Eventos próximos com alguma pendência registrada" enquanto o
    // cartão já mostrava funil — e agora dinheiro.
    expect(FONTE).not.toContain("Eventos próximos com alguma pendência registrada");
    const subtitulo = FONTE.slice(FONTE.indexOf("Precisam da sua atenção"));
    expect(subtitulo).toMatch(/oportunidades e dinheiro/);
  });
});

describe("a linha do dinheiro é descritiva, não cobrança", () => {
  it("leva ao Financeiro", () => {
    const bloco = FONTE.slice(FONTE.indexOf("function LinhaDoDinheiro"));
    expect(bloco.slice(0, bloco.indexOf("}\n"))).toBeTruthy();
    expect(FONTE).toContain('to="/financeiro"');
  });

  it("não usa vocabulário de cobrança", () => {
    // O ALTAR não sabe se houve acordo, adiamento ou pagamento por fora.
    const bloco = FONTE.slice(
      FONTE.indexOf("function LinhaDoDinheiro"),
      FONTE.indexOf("export function AttentionBoard"),
    );
    const visivel = bloco.replace(/\/\/[^\n]*/g, " ");
    expect(visivel).not.toMatch(/inadimpl|caloteir|cobran|devedor/i);
  });

  it("o valor aparece sem centavos — o painel é para decidir", () => {
    expect(FONTE).toContain("maximumFractionDigits: 0");
  });
});
