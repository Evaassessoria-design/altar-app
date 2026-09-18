import { describe, expect, it } from "vitest";
import {
  aprovacaoExpirou,
  diaCivil,
  diaCivilEmDias,
  estaSemResposta,
  fimDaJanela,
  janelaAberta,
  JANELA_RESPOSTA_MS,
  trabalhoVenceHoje,
  trabalhoVencido,
} from "./prazos";

const AGORA = Date.parse("2026-09-18T12:00:00Z");
const HORA = 3_600_000;

describe("janela de resposta do canal", () => {
  it("dura 24 horas a partir da última mensagem recebida", () => {
    expect(JANELA_RESPOSTA_MS).toBe(24 * HORA);
    expect(fimDaJanela(AGORA)).toBe(AGORA + 24 * HORA);
  });

  it("aberta dentro do prazo, fechada depois", () => {
    expect(janelaAberta(AGORA + HORA, AGORA)).toBe(true);
    expect(janelaAberta(AGORA - 1, AGORA)).toBe(false);
  });

  it("janela ausente é tratada como aberta — canal sem janela", () => {
    expect(janelaAberta(undefined, AGORA)).toBe(true);
    expect(janelaAberta(null, AGORA)).toBe(true);
  });
});

describe("conversa sem resposta", () => {
  const base = {
    ultimaMensagemEm: AGORA - 25 * HORA,
    ultimaMensagemDirecao: "entrada",
    status: "aberta",
  };

  it("cliente esperando há mais de 24h é pendência", () => {
    expect(estaSemResposta(base, AGORA)).toBe(true);
  });

  it("cliente esperando há 2h ainda não é pendência", () => {
    expect(estaSemResposta({ ...base, ultimaMensagemEm: AGORA - 2 * HORA }, AGORA)).toBe(false);
  });

  it("se a ALTAR já respondeu, a espera é do cliente e não conta", () => {
    expect(estaSemResposta({ ...base, ultimaMensagemDirecao: "saida" }, AGORA)).toBe(false);
  });

  it.each(["resolvida", "arquivada"])("conversa %s não cobra resposta", (status) => {
    expect(estaSemResposta({ ...base, status }, AGORA)).toBe(false);
  });

  it("o limite de horas é ajustável", () => {
    expect(estaSemResposta({ ...base, ultimaMensagemEm: AGORA - 3 * HORA }, AGORA, 2)).toBe(true);
  });
});

describe("expiração de aprovação", () => {
  it("aprovação pendente além do TTL expira", () => {
    expect(
      aprovacaoExpirou({ status: "pendente", criadoEm: AGORA - 25 * HORA }, AGORA),
    ).toBe(true);
  });

  it("aprovação pendente recente não expira", () => {
    expect(aprovacaoExpirou({ status: "pendente", criadoEm: AGORA - HORA }, AGORA)).toBe(false);
  });

  it("aprovação já decidida nunca é marcada como expirada", () => {
    expect(
      aprovacaoExpirou({ status: "aprovada", criadoEm: AGORA - 100 * HORA }, AGORA),
    ).toBe(false);
  });

  it("expiraEm explícito tem precedência sobre o TTL padrão", () => {
    expect(
      aprovacaoExpirou(
        { status: "pendente", criadoEm: AGORA - HORA, expiraEm: AGORA - 1 },
        AGORA,
      ),
    ).toBe(true);
  });
});

describe("dia civil", () => {
  it("converte instante para AAAA-MM-DD", () => {
    expect(diaCivil(AGORA)).toBe("2026-09-18");
  });

  it("soma dias sem passar por fuso", () => {
    expect(diaCivilEmDias(AGORA, 0)).toBe("2026-09-18");
    expect(diaCivilEmDias(AGORA, 3)).toBe("2026-09-21");
    expect(diaCivilEmDias(AGORA, 30)).toBe("2026-10-18");
  });
});

describe("vencimento de tarefa", () => {
  const hoje = "2026-09-18";

  it("prazo no passado está vencido", () => {
    expect(trabalhoVencido({ status: "aberto", venceEm: "2026-09-17" }, hoje)).toBe(true);
  });

  it("prazo de hoje NÃO está vencido — vence hoje", () => {
    expect(trabalhoVencido({ status: "aberto", venceEm: hoje }, hoje)).toBe(false);
    expect(trabalhoVenceHoje({ status: "aberto", venceEm: hoje }, hoje)).toBe(true);
  });

  it("prazo futuro não está vencido", () => {
    expect(trabalhoVencido({ status: "aberto", venceEm: "2026-09-19" }, hoje)).toBe(false);
  });

  it.each(["concluido", "cancelado"])("tarefa %s não cobra prazo", (status) => {
    expect(trabalhoVencido({ status, venceEm: "2020-01-01" }, hoje)).toBe(false);
    expect(trabalhoVenceHoje({ status, venceEm: hoje }, hoje)).toBe(false);
  });

  it("tarefa sem prazo nunca vence", () => {
    expect(trabalhoVencido({ status: "aberto" }, hoje)).toBe(false);
    expect(trabalhoVencido({ status: "aberto", venceEm: null }, hoje)).toBe(false);
  });
});
