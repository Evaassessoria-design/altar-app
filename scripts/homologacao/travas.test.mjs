import { describe, expect, it } from "vitest";
import {
  DEV_ESPERADO,
  PROD_PROIBIDA,
  avaliarAlvo,
  avaliarAmbiente,
  avaliarEnvioExterno,
  avaliarProvider,
  avaliarToken,
  montarPayload,
} from "./travas.mjs";
import { CENARIOS, e164De, wamidDe } from "./cenarios.mjs";

// ═════════════════════════════════════════════════════════════════════════════
// AS TRAVAS DA HOMOLOGAÇÃO
//
// Este script cria oito conversas num deployment. Errar o alvo significa
// escrever dados fictícios no banco de clientes reais — e não existe desfazer.
//
// As travas existiam no script de shell e ninguém conseguia testá-las: estavam
// misturadas com `curl`, `read -p` e chamadas ao CLI. Agora são funções puras,
// e o que se segue tenta quebrá-las.
// ═════════════════════════════════════════════════════════════════════════════

/** Ambiente que passa em tudo — a base a partir da qual se estraga um campo. */
const AMBIENTE_BOM = {
  CONVEX_DEPLOYMENT: DEV_ESPERADO,
  ALTAR_WHATSAPP_PROVIDER: "mock",
  ALTAR_CENTRAL_MOCK_TOKEN: "token-de-teste",
  ALTAR_CENTRAL_ENVIO_HABILITADO: undefined,
};

describe("a trava de produção", () => {
  it("recusa o nome nu de produção", () => {
    const r = avaliarAlvo({ deployment: PROD_PROIBIDA });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/PRODUÇÃO/);
  });

  it("recusa produção dentro de uma URL completa", () => {
    // O defeito que isto tranca: comparar por igualdade deixaria passar a
    // forma que o CLI de fato imprime.
    for (const alvo of [
      `https://${PROD_PROIBIDA}.convex.cloud`,
      `https://${PROD_PROIBIDA}.convex.site/`,
      `prod:${PROD_PROIBIDA}`,
      `  ${PROD_PROIBIDA}  `,
    ]) {
      expect(avaliarAlvo({ deployment: alvo }).ok, alvo).toBe(false);
    }
  });

  it("recusa produção mesmo vinda pelo caminho do self-hosted", () => {
    // `CONVEX_SELF_HOSTED_URL` tem precedência — e por isso é por ali que
    // produção entraria sem ser vista.
    const r = avaliarAlvo({
      selfHostedUrl: `https://${PROD_PROIBIDA}.convex.cloud`,
      deployment: DEV_ESPERADO,
    });
    expect(r.ok).toBe(false);
  });

  it("recusa quando não há alvo nenhum", () => {
    // Pior que o alvo errado é o alvo implícito: sem deployment selecionado, o
    // CLI usaria o último que alguém escolheu.
    for (const vazio of [{}, { deployment: "" }, { deployment: "   " }]) {
      expect(avaliarAlvo(vazio).ok).toBe(false);
    }
  });

  it("aceita o DEV e o reconhece como o esperado", () => {
    const r = avaliarAlvo({ deployment: DEV_ESPERADO });
    expect(r.ok).toBe(true);
    expect(r.ehDevEsperado).toBe(true);
    expect(r.alvo).toBe(DEV_ESPERADO);
  });

  it("aceita um backend local, mas avisa que não é o DEV", () => {
    const r = avaliarAlvo({ selfHostedUrl: "http://127.0.0.1:3210" });
    expect(r.ok).toBe(true);
    expect(r.ehDevEsperado).toBe(false);
  });
});

describe("a trava do envio externo", () => {
  it("recusa exatamente o valor que abre a porta", () => {
    expect(avaliarEnvioExterno("true").ok).toBe(false);
    expect(avaliarEnvioExterno(" true ").ok).toBe(false);
  });

  it("qualquer outro valor é DESLIGADO — inclusive os que parecem ligados", () => {
    // Mesma regra do portão no servidor: só a string "true" liga. "TRUE", "1"
    // e "yes" NÃO ligam nada, então bloquear a homologação por causa deles
    // seria inventar um perigo que não existe.
    for (const valor of [undefined, null, "", "false", "TRUE", "1", "yes", "sim"]) {
      expect(avaliarEnvioExterno(valor).ok, String(valor)).toBe(true);
    }
  });
});

describe("a trava do provedor", () => {
  it("só aceita mock", () => {
    expect(avaliarProvider("mock").ok).toBe(true);
    expect(avaliarProvider(" mock ").ok).toBe(true);
  });

  it("recusa o provedor real e a ausência", () => {
    for (const valor of ["meta", "cloud_api", "", undefined, "Mock"]) {
      expect(avaliarProvider(valor).ok, String(valor)).toBe(false);
    }
  });

  it("a recusa diz o valor encontrado, para não caçar às cegas", () => {
    expect(avaliarProvider("meta").motivo).toContain("meta");
    expect(avaliarProvider(undefined).motivo).toContain("ausente");
  });
});

describe("a trava do token", () => {
  it("exige token vindo do ambiente", () => {
    for (const vazio of [undefined, null, "", "   "]) {
      expect(avaliarToken(vazio).ok, String(vazio)).toBe(false);
    }
    expect(avaliarToken("abc").ok).toBe(true);
  });

  it("nenhum arquivo do repositório carrega o token", async () => {
    // A razão de o token vir do ambiente: versionado, ele entrega a qualquer
    // pessoa com o repositório a capacidade de injetar mensagem no ambiente.
    const { readFileSync, readdirSync } = await import("node:fs");
    const arquivos = readdirSync("scripts/homologacao")
      .filter((f) => f.endsWith(".mjs"))
      .map((f) => readFileSync(`scripts/homologacao/${f}`, "utf-8"));
    arquivos.push(readFileSync("scripts/homologacao-central.sh", "utf-8"));
    arquivos.push(readFileSync("scripts/homologacao-central.ps1", "utf-8"));

    for (const fonte of arquivos) {
      // O nome da variável pode aparecer; um valor atribuído a ela, não.
      expect(fonte).not.toMatch(/ALTAR_CENTRAL_MOCK_TOKEN\s*=\s*["'][^"']+["']/);
    }
  });
});

describe("todas as travas juntas", () => {
  it("o ambiente completo passa", () => {
    const r = avaliarAmbiente(AMBIENTE_BOM);
    expect(r.ok).toBe(true);
    expect(r.alvo).toBe(DEV_ESPERADO);
  });

  it("produção é recusada ANTES de qualquer outra coisa", () => {
    // A ordem é a regra: quem aponta para produção não precisa saber que o
    // token também está faltando. E parar cedo evita gastar uma chamada de
    // CLI contra o deployment errado.
    const r = avaliarAmbiente({
      CONVEX_DEPLOYMENT: PROD_PROIBIDA,
      ALTAR_WHATSAPP_PROVIDER: "meta",
      ALTAR_CENTRAL_ENVIO_HABILITADO: "true",
      ALTAR_CENTRAL_MOCK_TOKEN: "",
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/PRODUÇÃO/);
  });

  it("basta uma trava falhar para o conjunto recusar", () => {
    const quebras = [
      { ALTAR_CENTRAL_ENVIO_HABILITADO: "true" },
      { ALTAR_WHATSAPP_PROVIDER: "meta" },
      { ALTAR_CENTRAL_MOCK_TOKEN: "" },
      { CONVEX_DEPLOYMENT: "" },
    ];
    for (const quebra of quebras) {
      const r = avaliarAmbiente({ ...AMBIENTE_BOM, ...quebra });
      expect(r.ok, JSON.stringify(quebra)).toBe(false);
      expect(r.motivo.length).toBeGreaterThan(0);
    }
  });

  it("toda recusa explica como resolver", () => {
    // Uma trava que só diz "não" manda a pessoa adivinhar — e adivinhar, aqui,
    // é mexer em variável de deployment.
    const r = avaliarAmbiente({ ...AMBIENTE_BOM, ALTAR_CENTRAL_MOCK_TOKEN: "" });
    expect(r.comoResolver).toBeTruthy();
  });
});

describe("os oito cenários", () => {
  it("são oito, e cobrem os cinco departamentos", () => {
    expect(CENARIOS).toHaveLength(8);
    const departamentos = new Set(CENARIOS.map((c) => c.triagem.departamento));
    expect([...departamentos].sort()).toEqual([
      "comercial",
      "financeiro",
      "ouvidoria",
      "suporte",
    ]);
  });

  it("cobrem as quatro prioridades e uma escalada ao CEO", () => {
    const prioridades = new Set(CENARIOS.map((c) => c.triagem.prioridade));
    expect([...prioridades].sort()).toEqual(["alta", "baixa", "normal", "urgente"]);

    const escaladas = CENARIOS.filter((c) => c.triagem.escalar === true);
    expect(escaladas).toHaveLength(1);
    expect(escaladas[0].triagem.motivoDoEscalonamento).toBeTruthy();
  });

  it("nenhum telefone é plausivelmente real", () => {
    // Convenção do repositório (ver `convex/lib/demoData.ts`): o bloco
    // 9000X-XXXX é inventado e não alcança ninguém.
    for (const c of CENARIOS) {
      expect(c.telefone, c.nome).toMatch(/^55\d{2}9000\d{5}$/);
    }
  });

  it("identificadores de mensagem são únicos e fixos", () => {
    // Fixos = idempotência. Únicos = oito conversas, não uma.
    const ids = CENARIOS.map(wamidDe);
    expect(new Set(ids).size).toBe(8);
    for (const id of ids) expect(id.startsWith("wamid.HOMOLOG.")).toBe(true);

    const telefones = CENARIOS.map((c) => c.telefone);
    expect(new Set(telefones).size).toBe(8);
  });

  it("só a Ouvidoria carrega sinal de produto", () => {
    // Regra da triagem real: a Ouvidoria só registra quando a CATEGORIA da
    // conversa é de ouvidoria. Um sinal pendurado em outro departamento seria
    // descartado em silêncio, e o cenário pareceria quebrado sem motivo.
    for (const c of CENARIOS) {
      if (c.triagem.sinalDeProduto) {
        expect(c.triagem.departamento, c.nome).toBe("ouvidoria");
      }
    }
  });

  it("o cenário financeiro classifica, e não movimenta", () => {
    // A fronteira que a Central não cruza: ela nomeia o assunto e orienta.
    // Nada aqui pode sugerir criar cobrança, estorno ou alteração de plano.
    const financeiro = CENARIOS.find((c) => c.triagem.departamento === "financeiro");
    expect(financeiro.triagem.categoria).toBe("cobranca");
    expect(financeiro.triagem.respostaSugerida).not.toMatch(
      /estorn|cancel(o|ar) (a )?assinatura|gerar (boleto|cobrança)|reembols/i,
    );
  });
});

describe("o corpo enviado ao gateway", () => {
  const cenario = CENARIOS[0];

  it("tem o formato que o adaptador do WhatsApp espera", () => {
    const payload = montarPayload(cenario, Date.parse("2026-09-20T12:00:00Z"));
    const valor = payload.entry[0].changes[0].value;
    expect(valor.contacts[0].wa_id).toBe(cenario.telefone);
    expect(valor.contacts[0].profile.name).toBe(cenario.nome);
    expect(valor.messages[0].id).toBe(wamidDe(cenario));
    expect(valor.messages[0].type).toBe("text");
    expect(valor.messages[0].text.body).toBe(cenario.texto);
  });

  it("o horário vai em SEGUNDOS, não milissegundos", () => {
    // Mandar milissegundos põe a conversa no ano 57000 e a caixa de entrada,
    // ordenada por recência, fica permanentemente encabeçada por ela.
    const agora = Date.parse("2026-09-20T12:00:00Z");
    const ts = Number(montarPayload(cenario, agora).entry[0].changes[0].value.messages[0].timestamp);
    expect(ts).toBe(Math.floor(agora / 1000) - cenario.minutosAtras * 60);
    expect(new Date(ts * 1000).getUTCFullYear()).toBe(2026);
  });

  it("o mesmo cenário produz sempre o mesmo identificador", () => {
    const a = montarPayload(cenario, 1_000_000);
    const b = montarPayload(cenario, 9_000_000);
    expect(a.entry[0].changes[0].value.messages[0].id).toBe(
      b.entry[0].changes[0].value.messages[0].id,
    );
  });

  it("o telefone em E.164 casa com o que a identidade guarda", () => {
    expect(e164De(cenario)).toBe(`+${cenario.telefone}`);
  });
});
