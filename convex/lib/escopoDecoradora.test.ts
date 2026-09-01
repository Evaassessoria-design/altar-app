import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_DA_DECORACAO,
  CATEGORIAS_DO_EVENTO,
  ehContextoDoEvento,
  ehEscopoDaDecoradora,
  fornecedoresDaDecoradora,
  labelDaCategoria,
} from "./escopoDecoradora";
import { motivosDeAtencao, type EntradaAtencao } from "./attention";
import { foraDoEscopoDaDecoradora } from "./financeScope";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — o ALTAR é o sistema da DECORADORA.
//
// O Dashboard chegou a mostrar, como pendência dela:
//   "Confirmar menu final após degustação · Buffet Terra Nova"
//   "Fechar carta de drinks autorais · Bar Alquimia"
//   "Provar os 8 sabores · Doces da Vila"
//   "Renegociar valor do gerador extra · Som & Luz Meridiano"
//
// Nenhuma dessas tarefas é dela. São do cliente com os fornecedores que o
// cliente contratou. A decoradora cadastra esses fornecedores para alinhar
// horário de montagem, ponto de energia e layout — e só.
// ─────────────────────────────────────────────────────────────────────────────

describe("o que é da operação da decoradora", () => {
  it.each(CATEGORIAS_DA_DECORACAO.map((c) => [c.label, c.slug]))(
    "%s está no escopo",
    (_label, slug) => {
      expect(ehEscopoDaDecoradora(slug)).toBe(true);
    },
  );

  it.each(CATEGORIAS_DO_EVENTO.map((c) => [c.label, c.slug]))(
    "%s é contexto do evento, não escopo dela",
    (_label, slug) => {
      expect(ehEscopoDaDecoradora(slug)).toBe(false);
      expect(ehContextoDoEvento(slug)).toBe(true);
    },
  );

  it("reconhece o que a pessoa digita à mão, com acento e maiúscula", () => {
    for (const escrito of ["Buffet", "BUFFET", "Espaço", "espaco", "Doces e bolo", "DJ", "Fotografia"]) {
      expect(ehEscopoDaDecoradora(escrito), escrito).toBe(false);
    }
  });

  it("o demo já usa maiúscula e acento — e continua no escopo", () => {
    // `category` é texto livre: o demo tem "Flores" e "Mobiliário" ao lado de
    // "buffet" minúsculo.
    for (const escrito of ["Flores", "Mobiliário", "Têxtil", "Decoração", "Mesa posta"]) {
      expect(ehEscopoDaDecoradora(escrito), escrito).toBe(true);
    }
  });

  it("categoria desconhecida ENTRA no escopo — sair exige reconhecimento", () => {
    // Quem digita "Cenografia" ou "Neon" está falando da própria operação.
    // Excluir por omissão silenciaria o trabalho de quem usa outra palavra.
    for (const inventada of ["Cenografia", "Neon", "Paisagismo", "Marcenaria", ""]) {
      expect(ehEscopoDaDecoradora(inventada), inventada).toBe(true);
    }
    expect(ehEscopoDaDecoradora(undefined)).toBe(true);
  });

  it("o seletor oferece a operação da decoradora, que antes não existia", () => {
    const slugs = CATEGORIAS_DA_DECORACAO.map((c) => c.slug);
    for (const essencial of ["flores", "mobiliario", "iluminacao_decorativa", "transporte"]) {
      expect(slugs).toContain(essencial);
    }
  });

  it("iluminação DECORATIVA e som do evento não se confundem", () => {
    expect(ehEscopoDaDecoradora("iluminacao_decorativa")).toBe(true);
    expect(ehEscopoDaDecoradora("som_ilum")).toBe(false);
    expect(labelDaCategoria("som_ilum")).toContain("evento");
  });
});

describe("o Dashboard não mostra tarefa de fornecedor do cliente", () => {
  const base = (acoes: EntradaAtencao["acoesDeFornecedor"]): EntradaAtencao => ({
    eventId: "ev1",
    nome: "Evento",
    data: "2026-10-10",
    diasAte: 20,
    checklistPendentes: 0,
    comprasPendentes: 0,
    comprasAtrasadas: 0,
    fornecedoresAguardando: 0,
    equipeEscalada: 3,
    acoesDeFornecedor: acoes,
  });

  it.each([
    ["Confirmar menu final após degustação", "Buffet Terra Nova", "buffet"],
    ["Fechar carta de drinks autorais", "Bar Alquimia", "bar"],
    ["Provar os 8 sabores em 28/09", "Doces da Vila", "doces"],
    ["Renegociar valor do gerador extra", "Som & Luz Meridiano", "som_ilum"],
    ["Enviar cronograma do cerimonial", "Assessoria Bela", "assessoria"],
    ["Confirmar taxa de rolha", "Fazenda Vista Verde", "local"],
  ])("%s não vira atenção da decoradora", (texto, fornecedor, categoria) => {
    const motivos = motivosDeAtencao(base([{ fornecedor, texto, categoria }]));
    expect(motivos).toEqual([]);
  });

  it.each([
    ["Definir data da prévia do arranjo", "Flores de Aurora", "Flores"],
    ["Confirmar disponibilidade das cadeiras", "Mobiliário Bela Casa", "Mobiliário"],
    ["Aprovar layout da mesa principal", "Ateliê Folha", "personalizacao"],
    ["Conferir mobiliário do lounge", "Locadora Sul", "locacao_pecas"],
  ])("%s CONTINUA aparecendo", (texto, fornecedor, categoria) => {
    const motivos = motivosDeAtencao(base([{ fornecedor, texto, categoria }]));
    expect(motivos).toHaveLength(1);
    expect(motivos[0].texto).toBe(`${texto} · ${fornecedor}`);
  });

  it("ação sem categoria continua aparecendo — não sumimos com o trabalho", () => {
    const motivos = motivosDeAtencao(base([{ fornecedor: "Parceiro", texto: "Confirmar peça" }]));
    expect(motivos).toHaveLength(1);
  });

  it("misturando os dois, sobra só o que é dela", () => {
    const motivos = motivosDeAtencao(
      base([
        { fornecedor: "Buffet Terra Nova", texto: "Confirmar menu", categoria: "buffet" },
        { fornecedor: "Flores de Aurora", texto: "Definir prévia do arranjo", categoria: "Flores" },
        { fornecedor: "Bar Alquimia", texto: "Fechar drinks", categoria: "bar" },
      ]),
    );
    expect(motivos.map((m) => m.texto)).toEqual([
      "Definir prévia do arranjo · Flores de Aurora",
    ]);
  });

  it("o resto da atenção não foi afetado", () => {
    // Compras, carregamento e equipe continuam valendo como antes.
    const motivos = motivosDeAtencao({
      ...base([]),
      comprasAtrasadas: 2,
      comprasPendentes: 3,
      checklistPendentes: 4,
      equipeEscalada: 0,
      diasAte: 5,
    });
    const textos = motivos.map((m) => m.texto);
    expect(textos).toContain("2 compras atrasadas");
    expect(textos).toContain("3 itens de compra pendentes");
    expect(textos).toContain("4 itens do carregamento a conferir");
    expect(textos).toContain("Ninguém escalado para a montagem");
  });
});

describe("fornecedoresDaDecoradora", () => {
  it("separa a operação dela do contexto do evento", () => {
    const lista = [
      { companyName: "Flores de Aurora", category: "Flores" },
      { companyName: "Buffet Terra Nova", category: "buffet" },
      { companyName: "Mobiliário Bela Casa", category: "Mobiliário" },
      { companyName: "Bar Alquimia", category: "bar" },
      { companyName: "Sem categoria", category: undefined },
    ];
    expect(fornecedoresDaDecoradora(lista).map((f) => f.companyName)).toEqual([
      "Flores de Aurora",
      "Mobiliário Bela Casa",
      "Sem categoria",
    ]);
  });
});

describe("financeiro e Dashboard usam a MESMA regra", () => {
  it("o que é contexto do evento é o mesmo dos dois lados", () => {
    // Duas listas do mesmo conceito divergiriam na primeira semana — uma
    // ganharia "doces", a outra não, e o painel discordaria do financeiro.
    for (const categoria of [
      "buffet",
      "bar",
      "local",
      "assessoria",
      "doces",
      "som_ilum",
      "Flores",
      "Mobiliário",
      "Cenografia",
      undefined,
    ]) {
      expect(foraDoEscopoDaDecoradora(categoria), String(categoria)).toBe(
        ehContextoDoEvento(categoria),
      );
    }
  });
});
