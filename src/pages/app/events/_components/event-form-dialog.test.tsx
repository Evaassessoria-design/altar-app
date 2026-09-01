import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventFormDialog from "./event-form-dialog";
import { ERRO_TIPO_OBRIGATORIO, PLACEHOLDER_TIPO_DE_EVENTO } from "@/lib/event-types.ts";

// ─────────────────────────────────────────────────────────────────────────────
// O FORMULÁRIO DE EVENTO, RENDERIZADO DE VERDADE.
//
// O campo "Tipo" abria com "Casamento" selecionado. Quem cadastrava o 15 anos
// da Helena e não reparava salvava o evento como casamento — dado errado
// gravado em silêncio.
//
// Aqui não conferimos o código-fonte: abrimos o formulário, tentamos salvar e
// olhamos a tela. É a única forma de provar que o erro APARECE, em vez de o
// envio falhar sem explicação.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Radix usa APIs de ponteiro que o jsdom não implementa. Sem estes stubs o
 * seletor não abre — e o teste falharia por limitação do ambiente, não por
 * defeito do produto.
 */
function prepararRadix() {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
}

function abrir(defaultValues?: Parameters<typeof EventFormDialog>[0]["defaultValues"]) {
  prepararRadix();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <EventFormDialog
      open
      onClose={() => {}}
      onSubmit={onSubmit}
      title="Novo Evento"
      defaultValues={defaultValues}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

/** Preenche tudo MENOS o tipo, para isolar o campo em teste. */
async function preencherOResto(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Nome do Evento/i), "15 anos da Helena");
  await user.type(screen.getByLabelText(/^Data/i), "2026-11-20T18:00");
  await user.type(screen.getByLabelText(/Local/i), "Espaço Jardim");
  await user.type(screen.getByLabelText(/Nome do Cliente/i), "Helena Souza");
}

const salvar = () => screen.getByRole("button", { name: /salvar|criar|cadastrar/i });

describe("o tipo de evento não nasce escolhido", () => {
  it("um evento novo NÃO vem com Casamento", () => {
    abrir();
    const campo = screen.getByLabelText(/Tipo/i);
    expect(campo).toHaveTextContent(PLACEHOLDER_TIPO_DE_EVENTO);
    expect(campo).not.toHaveTextContent("Casamento");
  });

  it("o placeholder pedido aparece no campo", () => {
    abrir();
    expect(screen.getByText(PLACEHOLDER_TIPO_DE_EVENTO)).toBeInTheDocument();
  });
});

describe("salvar sem tipo é recusado, e o usuário vê o motivo", () => {
  it("não chama o salvamento e mostra o erro NO CAMPO", async () => {
    const { onSubmit, user } = abrir();
    await preencherOResto(user);
    await user.click(salvar());

    await waitFor(() => {
      expect(screen.getByText(ERRO_TIPO_OBRIGATORIO)).toBeInTheDocument();
    });
    // A falha silenciosa era o risco: recusar o envio sem dizer nada.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Tipo/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("o erro é anunciado por leitor de tela junto do campo", async () => {
    const { user } = abrir();
    await preencherOResto(user);
    await user.click(salvar());

    await waitFor(() => {
      const campo = screen.getByLabelText(/Tipo/i);
      const id = campo.getAttribute("aria-describedby");
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)).toHaveTextContent(ERRO_TIPO_OBRIGATORIO);
    });
  });
});

describe("escolher um tipo continua funcionando", () => {
  it.each([
    ["Casamento", "wedding"],
    ["Aniversário", "birthday"],
    ["Corporativo", "corporate"],
  ])("selecionar %s salva o evento", async (rotulo, valor) => {
    const { onSubmit, user } = abrir();
    await preencherOResto(user);

    await user.click(screen.getByLabelText(/Tipo/i));
    await user.click(await screen.findByRole("option", { name: rotulo }));
    await user.click(salvar());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      type: valor,
      name: "15 anos da Helena",
    });
    expect(screen.queryByText(ERRO_TIPO_OBRIGATORIO)).not.toBeInTheDocument();
  });

  it("escolher o tipo APAGA o erro que estava na tela", async () => {
    const { user } = abrir();
    await preencherOResto(user);
    await user.click(salvar());
    await waitFor(() => expect(screen.getByText(ERRO_TIPO_OBRIGATORIO)).toBeInTheDocument());

    await user.click(screen.getByLabelText(/Tipo/i));
    await user.click(await screen.findByRole("option", { name: "Debutante" }));

    await waitFor(() =>
      expect(screen.queryByText(ERRO_TIPO_OBRIGATORIO)).not.toBeInTheDocument(),
    );
  });
});

describe("evento que já existe não é afetado", () => {
  it("abre com o tipo que já estava salvo", () => {
    abrir({ name: "Casamento Ana e Pedro", type: "wedding" });
    expect(screen.getByLabelText(/Tipo/i)).toHaveTextContent("Casamento");
  });

  it("um tipo diferente de casamento também é preservado", () => {
    abrir({ name: "Confra Acme", type: "corporate" });
    const campo = screen.getByLabelText(/Tipo/i);
    expect(campo).toHaveTextContent("Corporativo");
    expect(campo).not.toHaveTextContent(PLACEHOLDER_TIPO_DE_EVENTO);
  });
});
