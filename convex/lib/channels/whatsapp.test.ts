import { describe, expect, it } from "vitest";
import {
  assinar,
  cabecalhoDeAssinatura,
  comparaEmTempoConstante,
  criarAdaptadorWhatsapp,
  modoAtual,
  normalizarPayloadMeta,
  verificarAssinaturaMeta,
} from "./whatsapp";
import { adaptadorDe, canaisDisponiveis } from "./registro";

const SEGREDO = "segredo-de-teste-nao-e-credencial-real";

/** Payload no formato exato da Meta Cloud API. O mock usa o MESMO formato. */
function payloadMeta(over: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "conta",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "PHONE_ID_FAKE" },
              contacts: [{ wa_id: "5511999998888", profile: { name: "Helena" } }],
              messages: [
                {
                  from: "5511999998888",
                  id: "wamid.ABC123",
                  timestamp: "1789000000",
                  type: "text",
                  text: { body: "Oi! Queria conhecer o ALTAR" },
                  ...over,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("modo do canal", () => {
  it("sem nenhuma configuração o canal fica DESCONFIGURADO — porta fechada", () => {
    expect(modoAtual({})).toBe("desconfigurado");
  });

  it("segredo de produção presente ativa meta_cloud", () => {
    expect(modoAtual({ ALTAR_WHATSAPP_APP_SECRET: SEGREDO })).toBe("meta_cloud");
  });

  it("provider mock SEM token continua desconfigurado", () => {
    expect(modoAtual({ ALTAR_WHATSAPP_PROVIDER: "mock" })).toBe("desconfigurado");
  });

  it("provider mock COM token ativa o modo de simulação", () => {
    expect(
      modoAtual({ ALTAR_WHATSAPP_PROVIDER: "mock", ALTAR_CENTRAL_MOCK_TOKEN: "t" }),
    ).toBe("mock");
  });

  it("mock tem precedência sobre segredo — dev nunca fala com a Meta por engano", () => {
    expect(
      modoAtual({
        ALTAR_WHATSAPP_PROVIDER: "mock",
        ALTAR_CENTRAL_MOCK_TOKEN: "t",
        ALTAR_WHATSAPP_APP_SECRET: SEGREDO,
      }),
    ).toBe("mock");
  });
});

describe("comparação em tempo constante", () => {
  it("iguais casam", () => {
    expect(comparaEmTempoConstante("abc", "abc")).toBe(true);
  });

  it("diferentes não casam", () => {
    expect(comparaEmTempoConstante("abc", "abd")).toBe(false);
  });

  it("tamanhos diferentes não casam", () => {
    expect(comparaEmTempoConstante("abc", "abcd")).toBe(false);
    expect(comparaEmTempoConstante("", "a")).toBe(false);
  });
});

describe("assinatura HMAC-SHA256", () => {
  it("assinatura válida é aceita", async () => {
    const corpo = JSON.stringify(payloadMeta());
    const hex = await assinar(corpo, SEGREDO);
    const r = await verificarAssinaturaMeta(corpo, cabecalhoDeAssinatura(hex), SEGREDO);
    expect(r.ok).toBe(true);
  });

  it("corpo adulterado derruba a assinatura", async () => {
    const corpo = JSON.stringify(payloadMeta());
    const hex = await assinar(corpo, SEGREDO);
    const adulterado = corpo.replace("Helena", "Invasor");
    const r = await verificarAssinaturaMeta(adulterado, cabecalhoDeAssinatura(hex), SEGREDO);
    expect(r.ok).toBe(false);
  });

  it("segredo errado derruba a assinatura", async () => {
    const corpo = JSON.stringify(payloadMeta());
    const hex = await assinar(corpo, "outro-segredo");
    const r = await verificarAssinaturaMeta(corpo, cabecalhoDeAssinatura(hex), SEGREDO);
    expect(r.ok).toBe(false);
  });

  it("requisição SEM assinatura é recusada", async () => {
    const r = await verificarAssinaturaMeta("{}", null, SEGREDO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("sem assinatura");
  });

  it.each(["sha1=abc", "abc", "sha256=", "=abc"])(
    "formato %j de assinatura é recusado",
    async (cabecalho) => {
      const r = await verificarAssinaturaMeta("{}", cabecalho, SEGREDO);
      expect(r.ok).toBe(false);
    },
  );

  it("assinatura em maiúsculas é aceita — hex não tem caixa", async () => {
    const corpo = "{}";
    const hex = await assinar(corpo, SEGREDO);
    const r = await verificarAssinaturaMeta(corpo, `sha256=${hex.toUpperCase()}`, SEGREDO);
    expect(r.ok).toBe(true);
  });
});

describe("normalização do payload da Meta", () => {
  it("extrai a mensagem com telefone em E.164", () => {
    const [m] = normalizarPayloadMeta(payloadMeta());
    expect(m.canal).toBe("whatsapp");
    expect(m.externalMessageId).toBe("wamid.ABC123");
    expect(m.externalContactId).toBe("+5511999998888");
    expect(m.displayName).toBe("Helena");
    expect(m.direcao).toBe("entrada");
    expect(m.tipo).toBe("texto");
    expect(m.texto).toBe("Oi! Queria conhecer o ALTAR");
  });

  it("timestamp da Meta vem em SEGUNDOS e vira milissegundos", () => {
    const [m] = normalizarPayloadMeta(payloadMeta());
    expect(m.enviadaEm).toBe(1_789_000_000_000);
  });

  it("legenda de imagem vira texto da mensagem", () => {
    const [m] = normalizarPayloadMeta(
      payloadMeta({
        type: "image",
        text: undefined,
        image: { mime_type: "image/jpeg", caption: "Olha o salão" },
      }),
    );
    expect(m.tipo).toBe("imagem");
    expect(m.texto).toBe("Olha o salão");
    expect(m.mediaMime).toBe("image/jpeg");
  });

  it("resposta de botão vira texto", () => {
    const [m] = normalizarPayloadMeta(
      payloadMeta({
        type: "interactive",
        text: undefined,
        interactive: { button_reply: { id: "b1", title: "Quero uma demonstração" } },
      }),
    );
    expect(m.texto).toBe("Quero uma demonstração");
  });

  it("áudio sem texto continua sendo mensagem válida", () => {
    const [m] = normalizarPayloadMeta(
      payloadMeta({ type: "audio", text: undefined, audio: { mime_type: "audio/ogg" } }),
    );
    expect(m.tipo).toBe("audio");
    expect(m.texto).toBeUndefined();
  });

  it.each([
    [null as unknown, "nulo"],
    [{}, "vazio"],
    [{ entry: "nao-e-lista" }, "entry inválido"],
    [{ entry: [{ changes: [{ value: {} }] }] }, "sem messages"],
    [{ entry: [{}] }, "sem changes"],
  ])("payload %s não lança — devolve lista vazia", (corpo, _motivo) => {
    expect(() => normalizarPayloadMeta(corpo)).not.toThrow();
    expect(normalizarPayloadMeta(corpo)).toEqual([]);
  });

  it("mensagem com telefone irreconhecível é descartada, não inventada", () => {
    const corpo = payloadMeta();
    corpo.entry[0].changes[0].value.messages[0].from = "abc";
    expect(normalizarPayloadMeta(corpo)).toEqual([]);
  });

  it("status de entrega (sem messages) não vira mensagem", () => {
    expect(
      normalizarPayloadMeta({
        entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "delivered" }] } }] }],
      }),
    ).toEqual([]);
  });
});

describe("adaptador", () => {
  it("verificarEntrada recusa quando o canal não está configurado", async () => {
    const a = criarAdaptadorWhatsapp({});
    expect(a.configurado()).toBe(false);
    const r = await a.verificarEntrada("{}", new Headers());
    expect(r.ok).toBe(false);
  });

  it("modo mock exige o token local", async () => {
    const env = { ALTAR_WHATSAPP_PROVIDER: "mock", ALTAR_CENTRAL_MOCK_TOKEN: "token-dev" };
    const a = criarAdaptadorWhatsapp(env);
    expect(a.configurado()).toBe(true);

    const semToken = await a.verificarEntrada("{}", new Headers());
    expect(semToken.ok).toBe(false);

    const errado = await a.verificarEntrada(
      "{}",
      new Headers({ "X-Altar-Mock-Token": "outro" }),
    );
    expect(errado.ok).toBe(false);

    const certo = await a.verificarEntrada(
      "{}",
      new Headers({ "X-Altar-Mock-Token": "token-dev" }),
    );
    expect(certo.ok).toBe(true);
  });

  it("modo produção exige HMAC — token de mock não abre a porta", async () => {
    const a = criarAdaptadorWhatsapp({ ALTAR_WHATSAPP_APP_SECRET: SEGREDO });
    const r = await a.verificarEntrada(
      "{}",
      new Headers({ "X-Altar-Mock-Token": "token-dev" }),
    );
    expect(r.ok).toBe(false);
  });

  it("handshake da Meta devolve o desafio só com o token certo", () => {
    const a = criarAdaptadorWhatsapp({
      ALTAR_WHATSAPP_APP_SECRET: SEGREDO,
      ALTAR_WHATSAPP_VERIFY_TOKEN: "verificador",
    });
    const url = (token: string) =>
      new URL(
        `https://x/y?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=123`,
      );
    expect(a.desafioDeVerificacao(url("verificador"))).toBe("123");
    expect(a.desafioDeVerificacao(url("errado"))).toBeNull();
  });

  it("sem token de verificação configurado não há handshake", () => {
    const a = criarAdaptadorWhatsapp({ ALTAR_WHATSAPP_APP_SECRET: SEGREDO });
    expect(
      a.desafioDeVerificacao(
        new URL("https://x/y?hub.mode=subscribe&hub.verify_token=t&hub.challenge=123"),
      ),
    ).toBeNull();
  });

  it("chave de deduplicação é estável e carrega o canal", () => {
    const a = criarAdaptadorWhatsapp({});
    const [m] = normalizarPayloadMeta(payloadMeta());
    expect(a.chaveDeDeduplicacao(m)).toBe("whatsapp:wamid.ABC123");
  });

  it("prepararEnvio monta a chamada da Graph API sem executá-la", () => {
    const a = criarAdaptadorWhatsapp({
      ALTAR_WHATSAPP_PHONE_ID: "123",
      ALTAR_WHATSAPP_TOKEN: "tok",
    });
    const req = a.prepararEnvio("+5511999998888", "Olá");
    expect(req.url).toContain("/123/messages");
    expect(req.metodo).toBe("POST");
    expect(JSON.parse(req.corpo).to).toBe("5511999998888");
  });
});

describe("registro de canais", () => {
  it("whatsapp resolve para um adaptador", () => {
    expect(adaptadorDe("whatsapp", {})).not.toBeNull();
  });

  it("canal inexistente devolve null em vez de lançar", () => {
    expect(adaptadorDe("pombo-correio", {})).toBeNull();
  });

  it("canal previsto mas sem adaptador ainda devolve null", () => {
    expect(adaptadorDe("instagram", {})).toBeNull();
  });

  it("whatsapp é o canal disponível do BLOCO 1", () => {
    expect(canaisDisponiveis()).toEqual(["whatsapp"]);
  });
});
