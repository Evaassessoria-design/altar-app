import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// A JORNADA E O GALPÃO, RENDERIZADOS — o que a pessoa vê e toca
//
// A regra está testada em convex/lib/jornadaDoEvento.test.ts. Aqui se prova a
// TELA: que toda etapa é um link aberto (a jornada orienta, não trava), que
// "você está aqui" e "próximo" aparecem onde devem, que o que o ALTAR não
// registra diz "sem registro", e que o galpão tem alvos de toque de celular
// e não deixa salvar o que o servidor recusaria.
// ─────────────────────────────────────────────────────────────────────────────

const mutacoes = vi.hoisted(() => ({ mover: vi.fn(), gerarUrl: vi.fn(), conferir: vi.fn() }));

vi.mock("convex/react", () => ({
  useMutation: (ref: unknown) => {
    const nome = String((ref as { _name?: string })?._name ?? ref);
    if (nome.includes("conferirRetorno")) return mutacoes.conferir;
    if (nome.includes("gerarUrl")) return mutacoes.gerarUrl;
    return mutacoes.mover;
  },
  useQuery: () => [{ _id: "m1", name: "João" }],
}));
vi.mock("@/convex/_generated/api.js", () => ({
  api: new Proxy({}, {
    get: (_t, modulo) => new Proxy({}, { get: (_u, fn) => ({ _name: `${String(modulo)}.${String(fn)}` }) }),
  }),
}));

import { JornadaDoProjeto } from "./jornada-do-projeto.tsx";
import { OperacaoDoEvento } from "./operacao-do-evento.tsx";
import { SaudeDoEvento } from "./saude-do-evento.tsx";
import { OcorrenciaDeAcervoDialog } from "@/components/ocorrencia-de-acervo-dialog.tsx";
import { ConferenciaDeRetorno } from "../acervo/_components/conferencia-de-retorno.tsx";
import { jornadaDoEvento, operacaoDoEvento } from "@/convex/lib/jornadaDoEvento.ts";

const naRota = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  mutacoes.mover.mockReset().mockResolvedValue({});
  mutacoes.conferir.mockReset().mockResolvedValue({ conferidas: 1, pecasForaDeUso: 2 });
  // Radix usa APIs de ponteiro que o jsdom não tem.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

// Um evento "fora da ordem": projeto visual pronto, contrato não anexado.
const jornada = jornadaDoEvento({
  briefing: { existe: true, temConvidados: true, temConceito: true },
  comercial: { itensDeReceita: 1, propostas: [{ status: "aceita" }] },
  contrato: { anexado: false, pendencias: 0 },
  inspiracoes: { referencias: 0 },
  fornecedores: [],
  ficha: { itens: 0, itensComMateriais: 0 },
  acervo: { reservas: 0, comDeficit: 0 },
  projeto: { apresentavel: true, prontos: 11, totalDeItens: 11 },
  croqui: { enviados: 0 },
  planta: { geradas: 0, gerando: false },
});

describe("Jornada do projeto", () => {
  it("as dez etapas são links ABERTOS, inclusive as adiantadas e as pendentes", () => {
    naRota(<JornadaDoProjeto eventId="e1" {...jornada} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(10);
    expect(links.map((l) => l.getAttribute("href"))).toContain("/eventos/e1/projeto");
    expect(links.map((l) => l.getAttribute("href"))).toContain("/eventos/e1#contrato");
    for (const l of links) expect(l).not.toHaveAttribute("aria-disabled");
  });

  it("'você está aqui' no contrato e 'próximo' nas inspirações — e o projeto adiantado aparece feito", () => {
    naRota(<JornadaDoProjeto eventId="e1" {...jornada} />);
    const aqui = screen.getByText("Você está aqui").closest("li")!;
    expect(within(aqui).getByText("Contrato")).toBeInTheDocument();
    const proximo = screen.getByText("Próximo").closest("li")!;
    expect(within(proximo).getByText("Inspirações")).toBeInTheDocument();
    const projeto = screen.getByText("Projeto visual").closest("li")!;
    expect(within(projeto).getByLabelText("concluído")).toBeInTheDocument();
  });

  it("cada linha tem altura de toque de celular", () => {
    naRota(<JornadaDoProjeto eventId="e1" {...jornada} />);
    for (const l of screen.getAllByRole("link")) expect(l.className).toMatch(/min-h-14/);
  });
});

describe("Operação", () => {
  it("montagem e desmontagem dizem 'sem registro' — não fingem que aconteceram", () => {
    const op = operacaoDoEvento({
      dataDoEvento: "2026-10-10", hoje: "2026-10-12", itensDeMontagem: [], reservas: [],
      pecasForaDeUsoNosItens: 0, pecasEnviadasNaConferencia: 0,
    });
    naRota(<OperacaoDoEvento eventId="e1" {...op} />);
    const montagem = screen.getByText("Montagem").closest("li")!;
    expect(within(montagem).getByText("sem registro")).toBeInTheDocument();
  });
});

describe("Saúde", () => {
  it("mostra fase, próximo passo com link, e atenção — o percentual continua lá", () => {
    naRota(
      <SaudeDoEvento
        eventId="e1"
        saude={{ percent: 72, status: "attention", checks: [{ key: "contrato", label: "Contrato anexado", ok: false }] }}
        fase="projeto"
        proximoPasso={{ rotulo: "Ficha técnica", detalhe: "2 de 5 itens com materiais", rota: "ficha-tecnica" }}
        atencao={["Fornecedor sem status"]}
      />,
    );
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("Projeto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ficha técnica/ })).toHaveAttribute("href", "/eventos/e1/ficha-tecnica");
    expect(screen.getByText("Fornecedor sem status")).toBeInTheDocument();
  });
});

describe("Ocorrência no galpão", () => {
  const poltrona = {
    _id: "i1" as never, nome: "Poltrona Siena", unidade: "un", quantidadeTotal: 23, emManutencao: 1,
  };

  it("registrar 'precisa de reparo' em três toques, com botões de celular", async () => {
    const user = userEvent.setup();
    render(<OcorrenciaDeAcervoDialog item={poltrona} onClose={() => {}} />);
    const registrar = screen.getByRole("button", { name: "Registrar ocorrência" });
    expect(registrar).toBeDisabled(); // sem destino, nada a salvar
    const reparo = screen.getByRole("button", { name: "Precisa de reparo" });
    expect(reparo.className).toMatch(/min-h-12/);
    await user.click(reparo);
    await user.type(screen.getByLabelText("O que aconteceu"), "Pé traseiro com folga");
    await user.click(registrar);
    expect(mutacoes.mover).toHaveBeenCalledWith(
      expect.objectContaining({ de: "pronto", para: "reparo", quantidade: 1, motivo: "Pé traseiro com folga" }),
    );
  });

  it("não deixa salvar o que o servidor recusaria — mais peças do que existem na condição", async () => {
    const user = userEvent.setup();
    render(<OcorrenciaDeAcervoDialog item={poltrona} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Precisa de reparo \(1\)/ })); // de: reparo
    await user.click(screen.getByRole("button", { name: "Pronto para uso" }));
    await user.click(screen.getByRole("button", { name: "Mais uma" }));
    expect(screen.getByText(/Só 1 estão/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar ocorrência" })).toBeDisabled();
  });
});

describe("Conferência de retorno", () => {
  const reservas = [{ _id: "r1" as never, saiu: 8, item: { nome: "Mesa Toscana", unidade: "un" } }];

  it("o exemplo da missão: 8 voltaram, 1 limpar, 1 reparo → 6/8 prontas, e vai numa chamada", async () => {
    const user = userEvent.setup();
    render(<ConferenciaDeRetorno eventId={"e1" as never} reservas={reservas} />);
    await user.click(screen.getByRole("button", { name: "Mais Precisa limpar" }));
    await user.click(screen.getByRole("button", { name: "Mais Precisa de reparo" }));
    expect(screen.getByText("6/8")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar conferência" }));
    expect(mutacoes.conferir).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "e1",
      linhas: [{ reservaId: "r1", voltou: 8, limpeza: 1, reparo: 1, indisponivel: 0 }],
    }));
  });

  it("não deixa voltar mais do que saiu", () => {
    render(<ConferenciaDeRetorno eventId={"e1" as never} reservas={reservas} />);
    expect(screen.getByRole("button", { name: "Mais Voltaram" })).toBeDisabled();
  });

  it("some quando tudo que saiu já foi conferido", () => {
    const { container } = render(
      <ConferenciaDeRetorno eventId={"e1" as never} reservas={[{ ...reservas[0], conferidoEm: 1 }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
