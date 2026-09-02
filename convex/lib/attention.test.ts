import { describe, expect, it } from "vitest";
import {
  JANELA_ATENCAO_DIAS,
  JANELA_URGENTE_DIAS,
  diasEntre,
  montarAtencao,
  motivosDeAtencao,
  type EntradaAtencao,
} from "./attention";

const base = (over: Partial<EntradaAtencao> = {}): EntradaAtencao => ({
  eventId: "ev1",
  nome: "Marina & Gabriel",
  data: "2026-10-10",
  diasAte: 10,
  checklistPendentes: 0,
  comprasPendentes: 0,
  comprasAtrasadas: 0,
  fornecedoresAguardando: 0,
  equipeEscalada: 3,
  acoesDeFornecedor: [],
  ...over,
});

describe("diasEntre", () => {
  it("conta dias inteiros", () => {
    expect(diasEntre("2026-09-01", "2026-09-10")).toBe(9);
    expect(diasEntre("2026-09-10", "2026-09-10")).toBe(0);
  });

  it("evento que ja passou da negativo", () => {
    expect(diasEntre("2026-09-10", "2026-09-01")).toBe(-9);
  });

  it("aceita data ISO completa", () => {
    expect(diasEntre("2026-09-01T23:00:00.000Z", "2026-09-02T01:00:00.000Z")).toBe(1);
  });
});

describe("nenhum evento aparece sem motivo", () => {
  it("evento sem pendencia nenhuma NAO entra no painel", () => {
    expect(motivosDeAtencao(base())).toEqual([]);
    expect(montarAtencao([base()])).toEqual([]);
  });

  it("lista vazia devolve painel vazio", () => {
    expect(montarAtencao([])).toEqual([]);
  });
});

describe("a proximidade e o que transforma pendencia em urgencia", () => {
  it("compra pendente para evento DISTANTE nao gera atencao", () => {
    // Oito meses e o estado normal do trabalho, nao um problema.
    const m = motivosDeAtencao(base({ diasAte: 240, comprasPendentes: 5 }));
    expect(m).toEqual([]);
  });

  it("a MESMA compra pendente com o evento perto gera atencao", () => {
    const m = motivosDeAtencao(base({ diasAte: 5, comprasPendentes: 5 }));
    expect(m.map((x) => x.texto)).toContain("5 itens de compra pendentes");
  });

  it("o limite da janela e inclusivo", () => {
    expect(
      motivosDeAtencao(base({ diasAte: JANELA_ATENCAO_DIAS, comprasPendentes: 1 })),
    ).toHaveLength(1);
    expect(
      motivosDeAtencao(base({ diasAte: JANELA_ATENCAO_DIAS + 1, comprasPendentes: 1 })),
    ).toHaveLength(0);
  });

  it("evento que ja passou nao gera pendencia de preparacao", () => {
    expect(motivosDeAtencao(base({ diasAte: -3, comprasPendentes: 4 }))).toEqual([]);
  });
});

describe("motivos que valem independente da data", () => {
  it("compra ATRASADA aparece mesmo com o evento distante", () => {
    // A data limite foi definida pela propria decoradora e ja passou.
    const m = motivosDeAtencao(base({ diasAte: 300, comprasAtrasadas: 2 }));
    expect(m).toHaveLength(1);
    expect(m[0].texto).toBe("2 compras atrasadas");
    expect(m[0].destino).toBe("/compras");
  });

  it("acao escrita a mao aparece com o nome do fornecedor", () => {
    const m = motivosDeAtencao(
      base({ diasAte: 300, acoesDeFornecedor: [{ fornecedor: "Doce Arte", texto: "Confirmar sabor" }] }),
    );
    expect(m[0].texto).toBe("Confirmar sabor · Doce Arte");
    expect(m[0].destino).toBe("/eventos/ev1/fornecedores");
  });
});

describe("comprado e ainda nao recebido", () => {
  it("NAO aparece com o evento longe — prazo de entrega e normal", () => {
    const m = motivosDeAtencao(base({ diasAte: 20, comprasAguardandoEntrega: 3 }));
    expect(m.map((x) => x.texto)).not.toContain("3 compras ainda não recebidas");
  });

  it("aparece dentro da janela urgente, apontando para /compras", () => {
    const m = motivosDeAtencao(base({ diasAte: 5, comprasAguardandoEntrega: 3 }));
    const motivo = m.find((x) => x.texto.includes("não recebidas"));
    expect(motivo?.texto).toBe("3 compras ainda não recebidas");
    expect(motivo?.destino).toBe("/compras");
  });

  it("uma so usa o singular", () => {
    const m = motivosDeAtencao(base({ diasAte: 2, comprasAguardandoEntrega: 1 }));
    expect(m.map((x) => x.texto)).toContain("1 compra ainda não recebida");
  });

  it("leitura ANTIGA sem o campo nao inventa motivo nenhum", () => {
    // O campo e aditivo: consulta que ainda nao o envia continua funcionando,
    // e o painel simplesmente nao mostra este motivo.
    expect(motivosDeAtencao(base({ diasAte: 2 }))).toEqual([]);
  });

  it("aguardar entrega NAO promove o evento sozinho — e aviso, nao atraso", () => {
    expect(montarAtencao([base({ diasAte: 20, comprasAguardandoEntrega: 5 })])).toEqual([]);
  });
});

describe("equipe", () => {
  it("falta de equipe so pesa quando o evento esta realmente perto", () => {
    expect(motivosDeAtencao(base({ diasAte: 20, equipeEscalada: 0 }))).toEqual([]);
    const perto = motivosDeAtencao(base({ diasAte: JANELA_URGENTE_DIAS, equipeEscalada: 0 }));
    expect(perto.map((m) => m.texto)).toContain("Ninguém escalado para a montagem");
  });
});

describe("singular e plural", () => {
  it("usa singular para um item", () => {
    const m = motivosDeAtencao(base({ diasAte: 5, comprasPendentes: 1, checklistPendentes: 1 }));
    expect(m.map((x) => x.texto)).toEqual([
      "1 item de compra pendente",
      "1 item do carregamento a conferir",
    ]);
  });
});

describe("ordenacao do painel", () => {
  it("urgentes primeiro, depois por proximidade", () => {
    const painel = montarAtencao([
      base({ eventId: "distante", diasAte: 25, comprasPendentes: 1 }),
      base({ eventId: "urgente", diasAte: 3, comprasPendentes: 1 }),
      base({ eventId: "medio", diasAte: 15, comprasPendentes: 1 }),
    ]);
    expect(painel.map((e) => e.eventId)).toEqual(["urgente", "medio", "distante"]);
    expect(painel[0].nivel).toBe("urgente");
    expect(painel[1].nivel).toBe("atencao");
  });

  it("compra atrasada torna o evento urgente mesmo estando longe", () => {
    const painel = montarAtencao([base({ diasAte: 200, comprasAtrasadas: 1 })]);
    expect(painel[0].nivel).toBe("urgente");
  });
});

describe("nao existe score", () => {
  it("o resultado nao carrega nota, percentual nem peso", () => {
    // Um "78% saudavel" parece informacao e nao e: ninguem sabe o que fazer
    // para mudar. Cada motivo aqui e uma frase verificavel com um destino.
    const [evento] = montarAtencao([base({ diasAte: 5, comprasPendentes: 2 })]);
    const chaves = Object.keys(evento);
    expect(chaves.some((k) => /score|nota|percent|saude|peso/i.test(k))).toBe(false);
    for (const m of evento.motivos) {
      expect(m.texto.length).toBeGreaterThan(0);
      expect(m.destino.startsWith("/")).toBe(true);
    }
  });
});
