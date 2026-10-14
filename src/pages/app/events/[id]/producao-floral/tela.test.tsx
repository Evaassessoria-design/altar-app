import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// A TELA DA PRODUÇÃO FLORAL, RENDERIZADA
//
// As contas estão travadas em convex/producaoFloral.test.ts. Aqui se prova o
// que só a tela mostra:
//
//  · "2 maços no total, distribuídos entre os 20 arranjos" aparece com essas
//    palavras — e NÃO aparece uma divisão por arranjo que ninguém pediu;
//  · "Foto da flor" e "Referência do arranjo" são nomeadas separadamente;
//  · foto que pode não ser da cor pedida sai com a ressalva;
//  · nenhum valor financeiro chega ao DOM;
//  · a opção "Incluir fotos das flores" existe com esse nome.
//
// Sem backend: as consultas são substituídas, como em jornada-e-galpao.test.tsx.
// ─────────────────────────────────────────────────────────────────────────────

const FICHA = {
  evento: {
    _id: "e1",
    nome: "Marina & Gabriel",
    data: "2026-12-12",
    local: "Fazenda Santa Clara",
    cliente: "Marina",
    responsavel: "Camila",
  },
  composicoes: [
    {
      _id: "i1",
      nome: "Arranjo baixo",
      area: "tables",
      ambiente: "Mesa dos convidados",
      quantidade: 20,
      ordem: 0,
      instrucoes: { altura: "Até 30 cm", horario: "Entregar às 14h" },
      materiais: [
        {
          nome: "Rosa",
          variedade: "Avalanche",
          cor: "branca",
          origem: "natural",
          quantidade: {
            porArranjo: 5, total: 100, unidade: "haste", unidades: 20, distribuido: false,
          },
        },
        {
          nome: "Eucalipto",
          cor: "verde",
          quantidade: {
            porArranjo: null, total: 2, unidade: "maco", unidades: 20, distribuido: true,
          },
        },
      ],
      orientacoes: [{ nome: "Folhagem do jardim", notes: "o que estiver bonito" }],
      referenciaUrl: "https://arquivo/arranjo.jpg",
    },
  ],
  avisos: [
    {
      composicaoId: "i1", composicao: "Arranjo baixo", ambiente: "Mesa dos convidados",
      cuidados: "Hortênsia murcha em 2 h", horario: "Entregar às 14h",
    },
  ],
  checklist: [
    {
      composicaoId: "i1", composicao: "Arranjo baixo", ambiente: "Mesa dos convidados",
      unidades: 20, materiais: 2, comAviso: true,
    },
  ],
  resumo: [
    { chave: "id:m1|haste", nome: "Rosa", unidade: "haste", total: 100, cor: "branca", origem: "natural", origens: [] },
    { chave: "id:m2|maco", nome: "Eucalipto", unidade: "maco", total: 2, cor: "verde", origem: null, origens: [] },
  ],
  flores: [
    {
      nome: "Rosa", variedade: "Avalanche", cor: "branca", origem: "natural",
      total: 100, unidade: "haste", fotoUrl: "https://arquivo/rosa.jpg", fotoIlustrativa: true,
    },
    {
      nome: "Eucalipto", variedade: null, cor: "verde", origem: null,
      total: 2, unidade: "maco", fotoUrl: null, fotoIlustrativa: false,
    },
  ],
  foraDoProjeto: 1,
  semReceita: 1,
  geradoEm: "2026-10-09T17:30:00.000Z",
};

const EVENTO = { _id: "e1", name: "Marina & Gabriel", date: "2026-12-12" };

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: (ref: unknown) => {
    const nome = String((ref as { _name?: string })?._name ?? ref);
    if (nome.includes("fichaDoFlorista")) return FICHA;
    if (nome.includes("events.get")) return EVENTO;
    if (nome.includes("listByEvent")) return [{ _id: "i1", name: "Arranjo baixo", quantity: 20, receita: [] }];
    if (nome.includes("materials.list")) return [];
    return null;
  },
}));
vi.mock("@/convex/_generated/api.js", () => ({
  api: new Proxy(
    {},
    {
      get: (_t, modulo) =>
        new Proxy({}, { get: (_u, fn) => ({ _name: `${String(modulo)}.${String(fn)}` }) }),
    },
  ),
}));

import ProducaoFloralPage from "./page.tsx";

const abrir = () =>
  render(
    <MemoryRouter initialEntries={["/eventos/e1/producao-floral"]}>
      <Routes>
        <Route path="/eventos/:id/producao-floral" element={<ProducaoFloralPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("tela da produção floral", () => {
  it("distingue quantidade por arranjo de total distribuído, com palavras", () => {
    abrir();
    expect(screen.getByText(/5 haste por arranjo · 100 haste no total/)).toBeTruthy();
    // "maço" com cedilha: o slug gravado é "maco", e quem traduz para palavra é
    // `abreviarUnidade` — a MESMA da ficha técnica.
    expect(screen.getByText(/2 maço no total distribuídos entre os 20 arranjos/)).toBeTruthy();
    // A divisão que ninguém pediu: 2 ÷ 20 não pode aparecer em lugar nenhum.
    expect(screen.queryByText(/0,1 maço/)).toBeNull();
  });

  it("nomeia as duas fotos separadamente e ressalva a cor", () => {
    abrir();
    // Duas ocorrências legítimas: o título da seção e a opção do PDF.
    expect(screen.getAllByText(/Fotos das flores/i).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(/Não é a referência do arranjo/i),
    ).toBeTruthy();
    expect(screen.getByText(/pode não ser a cor pedida/i)).toBeTruthy();
  });

  it("oferece incluir fotos das flores, com esse nome", () => {
    abrir();
    expect(screen.getByText("Incluir fotos das flores")).toBeTruthy();
    expect(screen.getByText("Incluir referências dos arranjos")).toBeTruthy();
  });

  it("mostra orientação sem quantidade como orientação", () => {
    abrir();
    expect(screen.getByText(/Orientações \(sem quantidade\)/i)).toBeTruthy();
    expect(screen.getByText(/Folhagem do jardim/)).toBeTruthy();
  });

  it("destaca cuidados e horários e diz o que ficou de fora", () => {
    abrir();
    expect(screen.getByText(/Cuidados e horários/i)).toBeTruthy();
    expect(screen.getByText(/Hortênsia murcha em 2 h/)).toBeTruthy();
    expect(screen.getByText(/ainda não tem/i)).toBeTruthy();
  });

  it("avisa que o resumo não compra, não movimenta estoque e não reserva acervo", () => {
    abrir();
    expect(
      screen.getByText(/Nada aqui cria compra, mexe em estoque ou reserva acervo/i),
    ).toBeTruthy();
  });

  it("não desenha valor financeiro nenhum", () => {
    const { container } = abrir();
    const texto = container.textContent ?? "";
    expect(texto).not.toMatch(/R\$/);
    expect(texto).not.toMatch(/custo/i);
    expect(texto).not.toMatch(/margem/i);
  });
});
