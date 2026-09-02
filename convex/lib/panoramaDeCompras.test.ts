import { describe, expect, it } from "vitest";
import {
  ORDEM_DAS_FAIXAS,
  ROTULO_DA_FAIXA,
  ROTULO_DO_FILTRO,
  aguardandoEntrega,
  diasAte,
  estaForaDoLivro,
  faixaDePrazo,
  filtrarPanorama,
  fornecedoresDaLista,
  ordenarPorUrgencia,
  resumirPanorama,
  type CompraNoPanorama,
} from "./panoramaDeCompras";

const HOJE = "2026-09-02";

/** Compra mínima. Sobrescreva só o que o teste está afirmando. */
const compra = (p: Partial<CompraNoPanorama & { name: string; supplier: string; eventId: string }> = {}) => ({
  name: "Item",
  isPurchased: false,
  ...p,
});

describe("diasAte — ancorado ao meio-dia", () => {
  it("o mesmo dia é zero", () => {
    expect(diasAte(HOJE, HOJE)).toBe(0);
  });

  it("amanhã é 1, ontem é -1", () => {
    expect(diasAte(HOJE, "2026-09-03")).toBe(1);
    expect(diasAte(HOJE, "2026-09-01")).toBe(-1);
  });

  it("atravessa o fim do mês sem errar", () => {
    expect(diasAte("2026-08-31", "2026-09-01")).toBe(1);
  });

  it("atravessa o horário de verão sem virar 0,96 dia", () => {
    // A âncora T12:00:00Z existe por isto: sem ela, um dia com mudança de fuso
    // tem 23 ou 25 horas e o arredondamento manda "hoje" para "atrasado".
    expect(diasAte("2026-10-17", "2026-10-18")).toBe(1);
    expect(diasAte("2026-02-14", "2026-02-15")).toBe(1);
  });
});

describe("faixa de prazo", () => {
  it("vencida ontem é atrasada", () => {
    expect(faixaDePrazo(compra({ dueDate: "2026-09-01" }), HOJE)).toBe("atrasado");
  });

  it("vence hoje é 'hoje' — não atrasada", () => {
    expect(faixaDePrazo(compra({ dueDate: HOJE }), HOJE)).toBe("hoje");
  });

  it("dentro de 7 dias, inclusive o sétimo", () => {
    expect(faixaDePrazo(compra({ dueDate: "2026-09-09" }), HOJE)).toBe("proximos7");
  });

  it("no oitavo dia já é 'mais adiante'", () => {
    expect(faixaDePrazo(compra({ dueDate: "2026-09-10" }), HOJE)).toBe("depois");
  });

  it("SEM data nunca é atrasada — ninguém definiu prazo", () => {
    expect(faixaDePrazo(compra({}), HOJE)).toBe("semPrazo");
  });

  it("comprada, recebida e cancelada não cobram prazo, mesmo vencidas", () => {
    for (const status of ["comprado", "recebido", "cancelado"]) {
      expect(
        faixaDePrazo(compra({ status, dueDate: "2020-01-01" }), HOJE),
        `${status} não deveria cobrar prazo`,
      ).toBe("semPrazo");
    }
  });

  it("item ANTIGO sem `status` deriva de isPurchased", () => {
    expect(faixaDePrazo({ isPurchased: false, dueDate: "2026-09-01" }, HOJE)).toBe("atrasado");
    expect(faixaDePrazo({ isPurchased: true, dueDate: "2026-09-01" }, HOJE)).toBe("semPrazo");
  });

  it("toda faixa tem rótulo e lugar na ordem", () => {
    for (const faixa of ORDEM_DAS_FAIXAS) {
      expect(ROTULO_DA_FAIXA[faixa]).toBeTruthy();
    }
    expect(new Set(ORDEM_DAS_FAIXAS).size).toBe(ORDEM_DAS_FAIXAS.length);
    expect(ORDEM_DAS_FAIXAS[0]).toBe("atrasado");
  });
});

describe("fora do livro-caixa", () => {
  it("compra com preço e sem lançamento está fora do livro", () => {
    expect(estaForaDoLivro(compra({ unitPrice: 10, quantity: 3 }))).toBe(true);
  });

  it("compra já lançada NÃO está fora", () => {
    expect(estaForaDoLivro(compra({ unitPrice: 10, transactionId: "tx1" }))).toBe(false);
  });

  it("compra sem preço não tem o que lançar", () => {
    expect(estaForaDoLivro(compra({}))).toBe(false);
    expect(estaForaDoLivro(compra({ quantity: 5 }))).toBe(false);
  });

  it("compra CANCELADA nunca está fora do livro — não é dinheiro que saiu", () => {
    expect(estaForaDoLivro(compra({ status: "cancelado", unitPrice: 500 }))).toBe(false);
  });
});

describe("aguardando entrega", () => {
  it("comprada é aguardando; recebida não é", () => {
    expect(aguardandoEntrega(compra({ status: "comprado" }))).toBe(true);
    expect(aguardandoEntrega(compra({ status: "recebido" }))).toBe(false);
  });

  it("item antigo marcado como comprado conta como aguardando", () => {
    expect(aguardandoEntrega({ isPurchased: true })).toBe(true);
  });
});

describe("resumo do panorama", () => {
  it("lista vazia devolve tudo em zero, nunca null", () => {
    const r = resumirPanorama([], HOJE);
    expect(r.pendentes).toBe(0);
    expect(r.valorPendente).toBe(0);
    expect(r.foraDoLivro).toBe(0);
  });

  it("conta cada faixa uma única vez", () => {
    const r = resumirPanorama(
      [
        compra({ dueDate: "2026-08-20" }), // atrasada
        compra({ dueDate: HOJE }), // hoje
        compra({ dueDate: "2026-09-05" }), // próximos 7
        compra({ dueDate: "2026-12-01" }), // depois
        compra({}), // sem prazo
      ],
      HOJE,
    );
    expect(r.pendentes).toBe(5);
    expect(r.atrasadas).toBe(1);
    expect(r.paraHoje).toBe(1);
    expect(r.proximos7).toBe(1);
    expect(r.semPrazo).toBe(1);
  });

  it("CANCELADA não entra em pendentes — o bug que existia no painel", () => {
    const r = resumirPanorama(
      [compra({ status: "cancelado", dueDate: "2020-01-01", unitPrice: 900 })],
      HOJE,
    );
    expect(r.pendentes).toBe(0);
    expect(r.atrasadas).toBe(0);
    expect(r.canceladas).toBe(1);
    expect(r.valorPendente).toBe(0);
    expect(r.foraDoLivro).toBe(0);
  });

  it("comprada conta como aguardando entrega, não como pendente", () => {
    const r = resumirPanorama([compra({ status: "comprado", unitPrice: 100 })], HOJE);
    expect(r.pendentes).toBe(0);
    expect(r.aguardandoEntrega).toBe(1);
  });

  it("recebida sai de tudo, menos da contagem de recebidas", () => {
    const r = resumirPanorama([compra({ status: "recebido", isPurchased: true })], HOJE);
    expect(r.pendentes).toBe(0);
    expect(r.aguardandoEntrega).toBe(0);
    expect(r.recebidas).toBe(1);
  });

  it("soma o dinheiro comprometido no que ainda falta resolver", () => {
    const r = resumirPanorama(
      [
        compra({ unitPrice: 12.5, quantity: 4 }), // 50
        compra({ unitPrice: 100 }), // 100 (sem quantidade = 1)
        compra({}), // sem preço não soma nada
      ],
      HOJE,
    );
    expect(r.valorPendente).toBe(150);
  });

  it("fora do livro soma valor e conta itens, incluindo os já comprados", () => {
    const r = resumirPanorama(
      [
        compra({ unitPrice: 200 }), // pendente, fora do livro
        compra({ status: "recebido", isPurchased: true, unitPrice: 300 }), // fora do livro também
        compra({ unitPrice: 50, transactionId: "tx" }), // já lançada
      ],
      HOJE,
    );
    expect(r.foraDoLivro).toBe(2);
    expect(r.valorForaDoLivro).toBe(500);
  });
});

describe("ordenação por urgência", () => {
  it("o que vence antes vem antes; sem prazo vai para o fim", () => {
    const itens = [
      compra({ name: "Sem prazo" }),
      compra({ name: "Depois", dueDate: "2026-10-01" }),
      compra({ name: "Já", dueDate: "2026-09-01" }),
    ];
    expect(ordenarPorUrgencia(itens).map((i) => i.name)).toEqual(["Já", "Depois", "Sem prazo"]);
  });

  it("mesmo prazo desempata por nome, em português", () => {
    const itens = [
      compra({ name: "Órquídeas", dueDate: HOJE }),
      compra({ name: "Arranjos", dueDate: HOJE }),
    ];
    expect(ordenarPorUrgencia(itens).map((i) => i.name)).toEqual(["Arranjos", "Órquídeas"]);
  });

  it("não altera o array recebido", () => {
    const itens = [compra({ name: "B" }), compra({ name: "A", dueDate: HOJE })];
    ordenarPorUrgencia(itens);
    expect(itens.map((i) => i.name)).toEqual(["B", "A"]);
  });
});

describe("filtros", () => {
  const lista = [
    compra({ name: "Atrasada", dueDate: "2026-08-01", supplier: "Flores SP", eventId: "e1" }),
    compra({ name: "Futura", dueDate: "2026-12-01", supplier: "Flores SP", eventId: "e1" }),
    compra({ name: "Comprada", status: "comprado", supplier: "Tecidos", eventId: "e2", unitPrice: 90 }),
    compra({ name: "Cancelada", status: "cancelado", supplier: "Tecidos", eventId: "e2" }),
    compra({ name: "Lançada", unitPrice: 10, transactionId: "tx", eventId: "e1" }),
  ];

  it("o padrão é 'a resolver' e exclui cancelada, comprada e lançada-recebida", () => {
    const r = filtrarPanorama(lista, HOJE, {});
    expect(r.map((i) => i.name)).toEqual(["Atrasada", "Futura", "Lançada"]);
  });

  it("'atrasadas' devolve só o que venceu e ainda exige ação", () => {
    expect(filtrarPanorama(lista, HOJE, { situacao: "atrasadas" }).map((i) => i.name)).toEqual([
      "Atrasada",
    ]);
  });

  it("'aguardando' devolve só o que foi comprado e não chegou", () => {
    expect(filtrarPanorama(lista, HOJE, { situacao: "aguardando" }).map((i) => i.name)).toEqual([
      "Comprada",
    ]);
  });

  it("'fora do financeiro' ignora cancelada e já lançada", () => {
    expect(filtrarPanorama(lista, HOJE, { situacao: "foraDoLivro" }).map((i) => i.name)).toEqual([
      "Comprada",
    ]);
  });

  it("'todas' é o ÚNICO filtro que mostra cancelada", () => {
    const nomes = filtrarPanorama(lista, HOJE, { situacao: "todas" }).map((i) => i.name);
    expect(nomes).toContain("Cancelada");
    expect(nomes).toHaveLength(lista.length);
  });

  it("fornecedor filtra sem depender de maiúsculas ou espaços", () => {
    const r = filtrarPanorama(lista, HOJE, { situacao: "todas", fornecedor: "  flores sp " });
    expect(r.map((i) => i.name)).toEqual(["Atrasada", "Futura"]);
  });

  it("evento e situação se combinam", () => {
    const r = filtrarPanorama(lista, HOJE, { situacao: "todas", eventId: "e2" });
    expect(r.map((i) => i.name)).toEqual(["Comprada", "Cancelada"]);
  });

  it("todo filtro tem rótulo em português", () => {
    for (const chave of Object.keys(ROTULO_DO_FILTRO)) {
      expect(ROTULO_DO_FILTRO[chave as keyof typeof ROTULO_DO_FILTRO]).toBeTruthy();
    }
  });
});

describe("fornecedores da lista", () => {
  it("sem repetição, sem vazios, em ordem", () => {
    expect(
      fornecedoresDaLista([
        { supplier: "Tecidos" },
        { supplier: "Flores SP" },
        { supplier: "  Tecidos " },
        { supplier: "   " },
        {},
      ]),
    ).toEqual(["Flores SP", "Tecidos"]);
  });

  it("lista sem fornecedor nenhum devolve vazio", () => {
    expect(fornecedoresDaLista([{}, {}])).toEqual([]);
  });
});
