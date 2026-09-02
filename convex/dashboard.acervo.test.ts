import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { motivosDeAtencao, montarAtencao, JANELA_RETORNO_DIAS } from "./lib/attention";
import type { EntradaAtencao } from "./lib/attention";

// ─────────────────────────────────────────────────────────────────────────────
// ATENÇÃO OPERACIONAL — sinais do Acervo no painel
//
// A regra mais importante aqui é a que NÃO foi implementada: acervo "não
// informado" não é pendência. Pintar de vermelho o que ninguém cadastrou
// ensina a decoradora a ignorar o painel — e um painel ignorado é pior que um
// painel vazio.
// ─────────────────────────────────────────────────────────────────────────────

const base: EntradaAtencao = {
  eventId: "e1", nome: "Marina & Gabriel", data: "2026-10-10", diasAte: 10,
  checklistPendentes: 0, comprasPendentes: 0, comprasAtrasadas: 0,
  fornecedoresAguardando: 0, equipeEscalada: 1, acoesDeFornecedor: [],
};

const textos = (e: Partial<EntradaAtencao>) =>
  motivosDeAtencao({ ...base, ...e }).map((m) => m.texto);

describe("déficit de acervo", () => {
  it("aparece em evento dentro da janela de atenção", () => {
    expect(textos({ diasAte: 10, acervoDeficit: 12 })).toContain("12 peças do acervo em falta");
  });

  it("NÃO aparece em evento distante — ainda dá tempo de resolver", () => {
    // Avisar cedo demais é o que transforma painel em ruído.
    expect(textos({ diasAte: 120, acervoDeficit: 12 })).toEqual([]);
  });

  it("déficit zero não vira motivo", () => {
    expect(textos({ diasAte: 5, acervoDeficit: 0 })).toEqual([]);
  });

  it("ausência do campo não inventa pendência", () => {
    // Leitura antiga, sem o campo: silêncio, nunca um número chutado.
    expect(textos({ diasAte: 5 })).toEqual([]);
  });

  it("singular e plural saem certos", () => {
    expect(textos({ acervoDeficit: 1 })).toContain("1 peça do acervo em falta");
  });
});

describe("peça que não voltou", () => {
  it("aparece DEPOIS do evento, quando a janela já terminou", () => {
    // O corte de janela do painel descarta evento passado; este motivo tem de
    // ficar acima dele, senão nunca apareceria.
    expect(textos({ diasAte: -3, acervoNaoRetornado: 2 })).toContain(
      "2 peças do acervo não voltaram",
    );
  });

  it("não some quando o evento é distante", () => {
    expect(textos({ diasAte: 200, acervoNaoRetornado: 1 })).toContain(
      "1 peça do acervo não voltou",
    );
  });

  it("zero não vira motivo", () => {
    expect(textos({ diasAte: -3, acervoNaoRetornado: 0 })).toEqual([]);
  });

  it("evento passado sem nada pendente sai do painel", () => {
    expect(montarAtencao([{ ...base, diasAte: -5 }])).toEqual([]);
  });

  it("evento passado com peça pendente NÃO é urgente — é pergunta, não incêndio", () => {
    const [r] = montarAtencao([{ ...base, diasAte: -5, acervoNaoRetornado: 2 }]);
    expect(r.nivel).toBe("atencao");
  });

  it("o destino leva para o acervo DO EVENTO, não para o catálogo", () => {
    const m = motivosDeAtencao({ ...base, diasAte: -3, acervoNaoRetornado: 2 });
    expect(m[0].destino).toBe("/eventos/e1/acervo");
  });
});

describe("o que deliberadamente NÃO vira alerta", () => {
  it("acervo não informado não tem sequer campo para virar pendência", () => {
    // Material reutilizável sem item de acervo vinculado não gera reserva, e
    // por isso não entra em `acervoDeficit`. A regra é estrutural, não um `if`.
    const fonte = readFileSync("convex/lib/attention.ts", "utf-8");
    const codigo = fonte
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
    expect(codigo).not.toMatch(/naoInformado|semAcervo|acervoDesconhecido/);
  });

  it("a janela de retorno é limitada — evento de 2024 não fica pendurado", () => {
    expect(JANELA_RETORNO_DIAS).toBeGreaterThan(0);
    expect(JANELA_RETORNO_DIAS).toBeLessThanOrEqual(90);
  });
});

describe("a regra não foi duplicada no frontend", () => {
  it("o dashboard só ENTREGA números; quem decide é lib/attention.ts", () => {
    const fonte = readFileSync("convex/dashboard.ts", "utf-8");
    expect(fonte).toContain("montarAtencao");
    // Nenhum limiar de dias decidido na consulta.
    expect(fonte).not.toMatch(/acervoDeficit\s*>\s*0\s*&&/);
  });

  it("a tela do painel não recalcula acervo", () => {
    const tela = readFileSync("src/components/attention-board.tsx", "utf-8");
    expect(tela).not.toContain("acervoDeficit");
    expect(tela).not.toContain("faltaVoltar");
  });
});
