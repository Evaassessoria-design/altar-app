import { describe, expect, it } from "vitest";
import {
  avaliarPortaoDeSaida,
  envioExternoHabilitado,
  NIVEIS,
  NIVEL_PADRAO,
  podeEnviarSemAprovacao,
  resolverNivel,
  rotuloDoEnvio,
  STATUS_APROVADOS,
  type EstadoDoPortao,
} from "./autonomia";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA CENTRAL DA FASE 1: nenhuma mensagem externa sai sem aprovação humana.
//
// As quatro travas são testadas INDEPENDENTEMENTE: cada uma sozinha barra a
// saída. Derrubar a Fase 1 por acidente exigiria derrubar as quatro ao mesmo
// tempo, e cada uma tem teste próprio que quebraria.
// ─────────────────────────────────────────────────────────────────────────────

const AGORA = Date.parse("2026-09-18T12:00:00Z");

/** Estado em que TUDO está liberado — a base para isolar uma trava por vez. */
function liberado(over: Partial<EstadoDoPortao> = {}): EstadoDoPortao {
  return {
    statusDaAprovacao: "aprovada",
    decididoPorUserId: "user_matheus",
    envioHabilitadoBruto: "true",
    janelaRespostaAte: AGORA + 3_600_000,
    agora: AGORA,
    ...over,
  };
}

describe("nível de autonomia", () => {
  it.each(NIVEIS)("FASE 1: nível %s NÃO envia sem aprovação", (nivel) => {
    expect(podeEnviarSemAprovacao(nivel)).toBe(false);
  });

  it("nível ausente cai no padrão restritivo", () => {
    expect(resolverNivel(undefined)).toBe(NIVEL_PADRAO);
    expect(resolverNivel("")).toBe(NIVEL_PADRAO);
    expect(resolverNivel("autônomo total")).toBe(NIVEL_PADRAO);
  });

  it("nível válido é respeitado no armazenamento", () => {
    expect(resolverNivel("envio_assistido")).toBe("envio_assistido");
  });
});

describe("env de envio externo", () => {
  it('só a string exata "true" habilita', () => {
    expect(envioExternoHabilitado("true")).toBe(true);
    expect(envioExternoHabilitado(" true ")).toBe(true);
  });

  it.each(["false", "1", "sim", "TRUE", "True", "yes", "", undefined, null])(
    "%j NÃO habilita",
    (valor) => {
      expect(envioExternoHabilitado(valor as string | undefined | null)).toBe(false);
    },
  );

  it("o painel mostra o estado sem ambiguidade", () => {
    expect(rotuloDoEnvio(undefined)).toBe("desligado");
    expect(rotuloDoEnvio("true")).toBe("ligado");
  });
});

describe("portão de saída — as quatro travas", () => {
  it("com tudo liberado, a saída passa", () => {
    expect(avaliarPortaoDeSaida(liberado())).toEqual({ liberado: true });
  });

  it.each(["pendente", "recusada", "expirada", "falhou", "executada"])(
    "TRAVA 1 — status %j não sai",
    (status) => {
      const v = avaliarPortaoDeSaida(liberado({ statusDaAprovacao: status }));
      expect(v.liberado).toBe(false);
      expect(v).toMatchObject({ codigo: "nao_aprovada" });
    },
  );

  it.each(STATUS_APROVADOS)("status %j é decisão favorável", (status) => {
    expect(avaliarPortaoDeSaida(liberado({ statusDaAprovacao: status })).liberado).toBe(true);
  });

  it.each([undefined, null, ""])("TRAVA 2 — sem autor (%j) não sai", (autor) => {
    const v = avaliarPortaoDeSaida(liberado({ decididoPorUserId: autor as string | null }));
    expect(v.liberado).toBe(false);
    expect(v).toMatchObject({ codigo: "sem_autor" });
  });

  it("TRAVA 3 — env desligada não sai, mesmo com aprovação do Matheus", () => {
    const v = avaliarPortaoDeSaida(liberado({ envioHabilitadoBruto: "false" }));
    expect(v.liberado).toBe(false);
    expect(v).toMatchObject({ codigo: "envio_desabilitado" });
  });

  it("TRAVA 3 — env ausente é o padrão da Fase 1 e não sai", () => {
    const v = avaliarPortaoDeSaida(liberado({ envioHabilitadoBruto: undefined }));
    expect(v.liberado).toBe(false);
    expect(v).toMatchObject({ codigo: "envio_desabilitado" });
  });

  it("TRAVA 4 — janela do canal expirada não sai", () => {
    const v = avaliarPortaoDeSaida(liberado({ janelaRespostaAte: AGORA - 1 }));
    expect(v.liberado).toBe(false);
    expect(v).toMatchObject({ codigo: "janela_expirada" });
  });

  it("janela ausente não bloqueia — canal sem janela é canal sem janela", () => {
    expect(avaliarPortaoDeSaida(liberado({ janelaRespostaAte: undefined })).liberado).toBe(true);
  });

  it("no instante exato do fim da janela ainda passa", () => {
    expect(avaliarPortaoDeSaida(liberado({ janelaRespostaAte: AGORA })).liberado).toBe(true);
  });

  it("cada trava sozinha é suficiente para barrar", () => {
    const sozinhas: Partial<EstadoDoPortao>[] = [
      { statusDaAprovacao: "pendente" },
      { decididoPorUserId: undefined },
      { envioHabilitadoBruto: "false" },
      { janelaRespostaAte: AGORA - 1 },
    ];
    for (const trava of sozinhas) {
      expect(avaliarPortaoDeSaida(liberado(trava)).liberado).toBe(false);
    }
  });

  it("o bloqueio sempre explica o motivo para quem está na tela", () => {
    const v = avaliarPortaoDeSaida(liberado({ envioHabilitadoBruto: undefined }));
    expect(v.liberado).toBe(false);
    if (!v.liberado) expect(v.motivo).toContain("ALTAR_CENTRAL_ENVIO_HABILITADO");
  });
});
