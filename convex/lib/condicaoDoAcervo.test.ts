import { describe, expect, it } from "vitest";
import { condicoesDoItem, moverCondicao, pecasForaDeUso } from "./condicaoDoAcervo";
import { disponibilidadeNaJanela } from "./acervo";

// ─────────────────────────────────────────────────────────────────────────────
// A CONDIÇÃO DO ACERVO — "pronto" é derivado, e nada cria ou some com peça
// ─────────────────────────────────────────────────────────────────────────────

const mesa = { quantidadeTotal: 40, emLimpeza: 4, emManutencao: 2 };

describe("condicoesDoItem", () => {
  it("pronto = total menos o que está fora de uso — nunca gravado", () => {
    expect(condicoesDoItem(mesa)).toEqual({
      pronto: 34, limpeza: 4, reparo: 2, indisponivel: 0, conferencia: 0, foraDeUso: 6,
    });
  });

  it("ausente é zero, e item sem condição nenhuma está todo pronto", () => {
    expect(condicoesDoItem({ quantidadeTotal: 12 })).toMatchObject({ pronto: 12, foraDeUso: 0 });
  });

  it("dado corrompido (condições > total) não produz pronto negativo", () => {
    expect(condicoesDoItem({ quantidadeTotal: 3, emLimpeza: 5 }).pronto).toBe(0);
  });
});

describe("moverCondicao", () => {
  it("pronto → reparo: o total não muda, o pronto cai", () => {
    const r = moverCondicao({ item: mesa, de: "pronto", para: "reparo", quantidade: 1, unidade: "un" });
    expect(r).toMatchObject({ ok: true, delta: 0, quantidadeDepois: 40, patch: { emManutencao: 3 } });
    if (r.ok) expect(r.depois.pronto).toBe(33);
  });

  it("lavada volta a pronta — e o campo zerado volta a AUSENTE", () => {
    const r = moverCondicao({ item: mesa, de: "limpeza", para: "pronto", quantidade: 4, unidade: "un" });
    expect(r.ok && r.patch).toEqual({ emLimpeza: undefined });
    if (r.ok) expect(r.depois.pronto).toBe(38);
  });

  it("sem conserto: baixa tira do total E da condição de origem", () => {
    const r = moverCondicao({ item: mesa, de: "reparo", para: "baixa", quantidade: 2, unidade: "un" });
    expect(r).toMatchObject({ ok: true, delta: -2, quantidadeDepois: 38 });
    if (r.ok) expect(r.depois).toMatchObject({ reparo: 0, pronto: 34 });
  });

  it("não move mais do que existe na condição de origem", () => {
    expect(moverCondicao({ item: mesa, de: "reparo", para: "pronto", quantidade: 3, unidade: "un" }).ok).toBe(false);
    expect(moverCondicao({ item: mesa, de: "pronto", para: "limpeza", quantidade: 35, unidade: "un" }).ok).toBe(false);
    expect(moverCondicao({ item: mesa, de: "indisponivel", para: "pronto", quantidade: 1, unidade: "un" }).ok).toBe(false);
  });

  it("recusa mover para a mesma condição, zero, negativo, NaN e fração de peça", () => {
    expect(moverCondicao({ item: mesa, de: "limpeza", para: "limpeza", quantidade: 1, unidade: "un" }).ok).toBe(false);
    for (const quantidade of [0, -1, Number.NaN, 0.5]) {
      expect(moverCondicao({ item: mesa, de: "pronto", para: "limpeza", quantidade, unidade: "un" }).ok).toBe(false);
    }
  });

  it("metro aceita fração — tecido que precisa lavar", () => {
    const tecido = { quantidadeTotal: 30 };
    expect(moverCondicao({ item: tecido, de: "pronto", para: "limpeza", quantidade: 2.5, unidade: "m" }).ok).toBe(true);
  });
});

describe("a disponibilidade enxerga TODAS as condições", () => {
  const sabado = { inicio: "2026-10-16", fim: "2026-10-18" };

  it("peça para lavar, em reparo, indisponível ou em conferência não vai ao evento", () => {
    const item = { quantidadeTotal: 40, emLimpeza: 4, emManutencao: 2, indisponivel: 1, emConferencia: 3 };
    const d = disponibilidadeNaJanela(40, [], sabado, "sabado", pecasForaDeUso(item));
    expect(d.disponivel).toBe(30);
  });

  it("dois eventos disputando: o que está fora de uso sai da conta dos dois", () => {
    const item = { quantidadeTotal: 20, emManutencao: 4 };
    const outro = { _id: "r", eventId: "outro", quantidade: 10, inicio: "2026-10-17", fim: "2026-10-19" };
    const d = disponibilidadeNaJanela(20, [outro], sabado, "sabado", pecasForaDeUso(item));
    expect(d).toMatchObject({ reservadoPorOutros: 10, disponivel: 6 });
  });
});
