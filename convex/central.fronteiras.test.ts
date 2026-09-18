import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORIAS, DEPARTAMENTOS, PRIORIDADES, TIPOS_DE_TRABALHO } from "./lib/central/triagem";
import { NIVEIS } from "./lib/central/autonomia";
import { CANAIS, TIPOS_DE_MENSAGEM } from "./lib/channels/tipos";
import { VERTICAIS } from "./lib/central/vertical";

// ═════════════════════════════════════════════════════════════════════════════
// AS FRONTEIRAS DA CENTRAL, CONFERIDAS POR LEITURA DO CÓDIGO
//
// Todas as travas aqui existem contra o ESQUECIMENTO — o modo real como estes
// defeitos nascem: alguém acrescenta uma função nova, com boa intenção, e
// cruza uma linha que ninguém escreveu em lugar nenhum.
// ═════════════════════════════════════════════════════════════════════════════

/** Módulos de backend da Central. */
const MODULOS_DA_CENTRAL = [
  "communications",
  "communicationsGateway",
  "communicationsIa",
  "communicationsOutbox",
  "communicationsTriage",
  "adminApprovals",
  "adminWorkItems",
  "customerVoice",
  "officeCentralHttp",
];

const LIBS_DA_CENTRAL = [
  "lib/adminGuard",
  "lib/central/autonomia",
  "lib/central/prazos",
  "lib/central/telefone",
  "lib/central/triagem",
  "lib/central/validadores",
  "lib/central/vertical",
  "lib/channels/registro",
  "lib/channels/tipos",
  "lib/channels/whatsapp",
];

function fonte(modulo: string): string {
  return readFileSync(`convex/${modulo}.ts`, "utf-8");
}

/** Só o código: comentários explicam as fronteiras e citam os nomes proibidos. */
function semComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────

describe("o Financeiro da Central nunca movimenta dinheiro", () => {
  // A Central CLASSIFICA assunto de cobrança e abre tarefa de contato. Ela não
  // cria cobrança, não altera assinatura, não conversa com o Asaas e não toca
  // em `transactions`. O risco real não é malícia: é alguém "ajudar" ligando a
  // cobrança ao fluxo automático.
  // Padrões, não palavras soltas: "financeiro" também é o nome de um
  // DEPARTAMENTO da Central, e proibir a palavra proibiria o departamento.
  // O que não pode existir é REFERÊNCIA ao módulo ou à tabela.
  const PROIBIDOS: [RegExp, string][] = [
    [/asaas/i, "qualquer coisa do Asaas"],
    [/(internal|api)\.financeiro/, "o módulo financeiro"],
    [/from "\.\.?\/?financeiro"/, "importar o módulo financeiro"],
    [/"transactions"/, "a tabela transactions"],
    [/subscriptionStatus/, "o estado da assinatura"],
    [/createCheckoutSession/, "o checkout"],
    [/asaasCustomerId|asaasSubscriptionId/, "identificadores de cobrança"],
  ];

  it.each([...MODULOS_DA_CENTRAL, ...LIBS_DA_CENTRAL])(
    "%s não referencia nada do caminho do dinheiro",
    (modulo) => {
      const codigo = semComentarios(fonte(modulo));
      for (const [padrao, descricao] of PROIBIDOS) {
        expect(
          padrao.test(codigo),
          `${modulo} referencia ${descricao}. A Central classifica cobrança; nunca a executa.`,
        ).toBe(false);
      }
    },
  );

  it("o departamento financeiro EXISTE — o que não existe é a movimentação", () => {
    // Contraprova da trava acima: proibir a palavra teria proibido o
    // departamento, e um teste que passa por acidente não protege nada.
    expect(fonte("lib/central/triagem")).toContain('"financeiro"');
    expect(fonte("lib/central/triagem")).toContain('cobranca: "financeiro"');
  });
});

describe("a Central não toca no funil das decoradoras", () => {
  // `leads` são os clientes DA DECORADORA (a noiva, o aniversariante) e vivem
  // isolados por `userId`. A Central fala com quem procura o ALTAR:
  // `landingLeads`, `users` e `adminContacts`. Cruzar essa linha vazaria dado
  // de cliente final para dentro da operação do SaaS.
  it.each([...MODULOS_DA_CENTRAL, ...LIBS_DA_CENTRAL])(
    "%s não consulta a tabela `leads`",
    (modulo) => {
      const codigo = semComentarios(fonte(modulo));
      expect(codigo).not.toContain('query("leads")');
      expect(codigo).not.toContain('"leads"');
      expect(codigo).not.toContain("convertedEventId");
    },
  );

  it.each([...MODULOS_DA_CENTRAL, ...LIBS_DA_CENTRAL])(
    "%s não consulta eventos, acervo nem ficha técnica",
    (modulo) => {
      const codigo = semComentarios(fonte(modulo));
      for (const tabela of [
        '"events"',
        '"collectionItems"',
        '"assemblyItems"',
        '"purchaseItems"',
        '"budgetItems"',
        '"briefings"',
      ]) {
        expect(codigo.includes(tabela), `${modulo} consulta ${tabela}`).toBe(false);
      }
    },
  );
});

describe("existe UMA única porta de saída", () => {
  it("só o outbox monta requisição de envio", () => {
    const outros = MODULOS_DA_CENTRAL.filter((m) => m !== "communicationsOutbox");
    for (const modulo of outros) {
      const codigo = semComentarios(fonte(modulo));
      expect(codigo.includes("prepararEnvio"), `${modulo} monta envio`).toBe(false);
    }
    expect(fonte("communicationsOutbox")).toContain("prepararEnvio");
  });

  it("só o outbox chama fetch", () => {
    const outros = MODULOS_DA_CENTRAL.filter((m) => m !== "communicationsOutbox");
    for (const modulo of outros) {
      const codigo = semComentarios(fonte(modulo));
      expect(/\bfetch\s*\(/.test(codigo), `${modulo} chama fetch`).toBe(false);
    }
  });

  it("o outbox consulta o portão ANTES de qualquer fetch", () => {
    const codigo = fonte("communicationsOutbox");
    const portao = codigo.indexOf("avaliarPortaoDeSaida");
    const envio = codigo.search(/\bawait fetch\s*\(/);
    expect(portao).toBeGreaterThan(-1);
    expect(envio).toBeGreaterThan(portao);
  });

  it("a triagem por IA não envia nada", () => {
    const codigo = semComentarios(fonte("communicationsIa"));
    expect(/\bfetch\s*\(/.test(codigo)).toBe(false);
    expect(codigo).not.toContain("prepararEnvio");
    expect(codigo).not.toContain("executarAprovacao");
  });
});

describe("WhatsApp é canal, não domínio", () => {
  // Nenhuma tabela, índice, query ou mutation carrega o nome do canal. Fora do
  // adaptador, do registro, das rotas e das variáveis de ambiente, "whatsapp"
  // só aparece como VALOR do campo `channel`.
  const PERMITIDOS = ["lib/channels/whatsapp", "lib/channels/registro"];

  it.each(MODULOS_DA_CENTRAL.filter((m) => !PERMITIDOS.includes(m)))(
    "%s não declara nada chamado whatsapp",
    (modulo) => {
      const codigo = semComentarios(fonte(modulo));
      // Aceitos: o literal do canal, a env do provedor e a rota.
      const restante = codigo
        .replace(/"whatsapp"/g, "")
        .replace(/ALTAR_WHATSAPP_\w+/g, "")
        .replace(/\/channels\/whatsapp\/webhook/g, "")
        // `landingLeads.whatsappE164` e seu índice herdam o nome do campo
        // `whatsapp` que JÁ existia naquela tabela, criada pela landing page
        // muito antes da Central. Renomeá-lo seria mexer numa tabela de
        // captação por questão de estilo.
        .replace(/whatsappE164/g, "")
        .replace(/by_whatsapp_e164/g, "");
      expect(/whatsapp/i.test(restante), `${modulo} tem "whatsapp" fora de valor/env/rota`).toBe(
        false,
      );
    },
  );

  it("nenhuma tabela do schema se chama pelo canal", () => {
    const schema = readFileSync("convex/schema.ts", "utf-8");
    const tabelas = [...schema.matchAll(/^ {2}(\w+): defineTable\(/gm)].map((m) => m[1]);
    for (const tabela of tabelas) {
      expect(/whatsapp|instagram|telegram/i.test(tabela), `tabela ${tabela}`).toBe(false);
    }
  });

  it("o adaptador é o único lugar que conhece a Graph API", () => {
    for (const modulo of [...MODULOS_DA_CENTRAL, ...LIBS_DA_CENTRAL]) {
      if (modulo === "lib/channels/whatsapp") continue;
      expect(fonte(modulo).includes("graph.facebook.com"), modulo).toBe(false);
    }
  });

  it("acrescentar um canal é um arquivo e uma linha", () => {
    const registro = fonte("lib/channels/registro");
    expect(registro).toContain("FABRICAS");
    // O gateway resolve o adaptador pelo nome vindo da rota e nunca compara
    // com um canal específico — não há `if (canal === "...")` nenhum nele.
    const gateway = semComentarios(fonte("communicationsGateway"));
    expect(gateway).toContain("adaptadorDe");
    expect(/canal\s*[=!]==\s*"/.test(gateway)).toBe(false);
  });
});

describe("os validadores não divergem das regras", () => {
  // O Convex exige literais estáticos no validador, então as listas existem
  // duas vezes: como regra (lib/central/*) e como validador. Divergência
  // silenciosa entre as duas é exatamente o defeito que este bloco impede.
  const validadores = fonte("lib/central/validadores");

  function literaisDe(nome: string): string[] {
    const i = validadores.indexOf(`export const ${nome} =`);
    expect(i, `validador ${nome} não existe`).toBeGreaterThan(-1);
    const fim = validadores.indexOf("\nexport const", i + 1);
    const trecho = validadores.slice(i, fim === -1 ? undefined : fim);
    return [...trecho.matchAll(/v\.literal\("([^"]+)"\)/g)].map((m) => m[1]);
  }

  it.each([
    ["verticalValidator", VERTICAIS],
    ["channelValidator", CANAIS],
    ["departamentoValidator", DEPARTAMENTOS],
    ["categoriaValidator", CATEGORIAS],
    ["prioridadeValidator", PRIORIDADES],
    ["tipoDeMensagemValidator", TIPOS_DE_MENSAGEM],
    ["tipoDeTrabalhoValidator", TIPOS_DE_TRABALHO],
    ["nivelDeAutonomiaValidator", NIVEIS],
  ] as [string, readonly string[]][])("%s espelha a regra", (nome, regra) => {
    expect(literaisDe(nome).sort()).toEqual([...regra].sort());
  });

  it("o schema não declara união da Central fora do módulo de validadores", () => {
    const schema = readFileSync("convex/schema.ts", "utf-8");
    // A Central inteira usa os validadores importados; declarar uma união
    // solta aqui reabriria a porta da divergência.
    expect(schema).toContain('from "./lib/central/validadores"');
  });
});

describe("cobertura da auditoria", () => {
  it("todo módulo novo da Central está listado nestas travas", () => {
    // Um arquivo `communications*` ou `admin*` que nasça sem entrar na lista
    // passaria por fora de TODAS as verificações acima.
    const arquivos = readdirSync("convex")
      .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
      .map((f) => f.replace(/\.ts$/, ""));

    const daCentral = arquivos.filter(
      (f) =>
        f.startsWith("communications") ||
        f.startsWith("adminApprovals") ||
        f.startsWith("adminWorkItems") ||
        f.startsWith("customerVoice") ||
        f.startsWith("officeCentral"),
    );

    expect(daCentral.sort()).toEqual([...MODULOS_DA_CENTRAL].sort());
  });
});
