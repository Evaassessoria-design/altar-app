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
  "lib/central/busca",
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

// ─────────────────────────────────────────────────────────────────────────────
// A MESA DE OPERAÇÃO (a tela) obedece às mesmas fronteiras
//
// O BLOCO 2 tirou a Central de dentro do Painel Admin e deu a ela uma rota
// própria, com caixa de entrada, fila, tarefas e Ouvidoria. Uma tela nova é
// exatamente onde a fronteira volta a ser cruzada sem querer: basta alguém
// achar útil "mostrar também os leads do evento".
// ─────────────────────────────────────────────────────────────────────────────

describe("a tela da Central não alcança o outro lado da linha", () => {
  const DIRETORIO = "src/pages/app/central";

  function telasDaCentral(): string[] {
    const arquivos: string[] = [];
    const visitar = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const caminho = `${dir}/${entrada.name}`;
        if (entrada.isDirectory()) visitar(caminho);
        else if (entrada.name.endsWith(".tsx") || entrada.name.endsWith(".ts")) {
          arquivos.push(caminho);
        }
      }
    };
    visitar(DIRETORIO);
    return arquivos;
  }

  it("existe tela e ela está coberta por estas travas", () => {
    expect(telasDaCentral().length).toBeGreaterThan(0);
  });

  it.each(telasDaCentral())("%s não consulta o funil das decoradoras", (arquivo) => {
    const codigo = semComentarios(readFileSync(arquivo, "utf-8"));
    for (const proibido of ["api.funil", "api.events", "api.financeiro", "api.purchases"]) {
      expect(codigo.includes(proibido), `${arquivo} usa ${proibido}`).toBe(false);
    }
  });

  it.each(telasDaCentral())("%s não toca no caminho do dinheiro", (arquivo) => {
    const codigo = semComentarios(readFileSync(arquivo, "utf-8"));
    for (const padrao of [/api\.asaas/, /subscriptionStatus/, /createCheckoutSession/]) {
      expect(padrao.test(codigo), `${arquivo} referencia cobrança`).toBe(false);
    }
  });

  it.each(telasDaCentral())("%s não conhece a porta de saída", (arquivo) => {
    const codigo = semComentarios(readFileSync(arquivo, "utf-8"));
    // Enviar não é uma ação da tela: o que existe é APROVAR, e quem decide se
    // sai é o outbox, atrás do portão.
    for (const proibido of ["communicationsOutbox", "prepararEnvio", "executarAprovacao"]) {
      expect(codigo.includes(proibido), `${arquivo} fala em envio`).toBe(false);
    }
  });

  it("a rota é declarada como exceção de menu — nunca some do mapa", () => {
    const navegacao = readFileSync("src/lib/navigation.ts", "utf-8");
    const app = readFileSync("src/App.tsx", "utf-8");
    expect(app).toContain('path="/central"');
    expect(navegacao).toContain('"/central"');
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

// ═════════════════════════════════════════════════════════════════════════════
// A CONSULTA QUE A HOMOLOGAÇÃO USA NÃO PODE VIRAR UMA PORTA
//
// `conversasPorIdentidade` existe para o script de homologação descobrir o que
// o gateway acabou de criar. Ela recebe TELEFONES e devolve conversas — que é
// exatamente a forma de um vazamento, se um dia escorregar para `query`.
//
// Três coisas a mantêm inofensiva, e as três são verificadas aqui:
//   · é `internalQuery` — inalcançável pelo navegador;
//   · não escreve nada;
//   · devolve identificadores, não conteúdo: nenhum texto de mensagem e
//     nenhum dado do contato saem por ela.
// ═════════════════════════════════════════════════════════════════════════════

describe("a consulta de apoio à homologação", () => {
  const fonte = readFileSync("convex/communications.ts", "utf-8");
  const bloco = (() => {
    const inicio = fonte.indexOf("export const conversasPorIdentidade");
    expect(inicio, "conversasPorIdentidade sumiu").toBeGreaterThan(-1);
    // Fecha no `});` da própria definição, na coluna zero. Cortar no próximo
    // `export const` arrastaria os helpers não exportados que vêm no meio — e
    // um deles escreve, o que faria este teste falhar por vizinhança.
    const fim = fonte.indexOf("\n});", inicio);
    return fonte.slice(inicio, fim === -1 ? undefined : fim + 4);
  })();

  it("é interna — o navegador não a alcança", () => {
    expect(bloco).toContain("internalQuery");
    expect(bloco).not.toMatch(/=\s*query\(/);
  });

  it("não escreve nada", () => {
    for (const escrita of ["ctx.db.insert", "ctx.db.patch", "ctx.db.replace", "ctx.db.delete"]) {
      expect(bloco, escrita).not.toContain(escrita);
    }
    expect(bloco).not.toContain("ctx.scheduler");
  });

  it("devolve identificador, nunca conteúdo", () => {
    // O que ela pode devolver está escrito aqui. Acrescentar um campo de
    // conteúdo — texto da mensagem, nome ou telefone do contato — quebra.
    const permitidos = [
      "externalId",
      "encontrada",
      "conversationId",
      "vertical",
      "messageId",
      "jaTriada",
    ];
    const retorno = bloco.slice(bloco.indexOf("encontrados.push({", bloco.indexOf("encontrada: true")));
    const campos = [...retorno.matchAll(/^\s{8}(\w+)[,:]/gm)].map((m) => m[1]);
    for (const campo of campos) {
      expect(permitidos, `campo novo no retorno: ${campo}`).toContain(campo);
    }

    for (const proibido of ["texto", "corpo", "displayName", "telefone", "body"]) {
      expect(bloco, proibido).not.toMatch(new RegExp(`${proibido}\\s*:`));
    }
  });

  it("não toca em `leads` — a fronteira da Central continua de pé", () => {
    expect(bloco).not.toContain('query("leads")');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O PAINEL DA CENTRAL CONTA — E DIZ QUANDO NÃO CONSEGUE CONTAR
//
// Os cartões ("Conversas abertas", "Não lidas", "Novos contatos 24h") saem de
// duas varreduras com teto: mil conversas e duzentos contatos. Enquanto a
// Central couber nelas, o teto não muda nada.
//
// No dia em que não couber, os cartões passariam a mostrar um número MENOR que
// o real, com a mesma cara de certeza. "Conversas abertas: 1000" seria uma
// afirmação que a consulta não pode sustentar — e quem opera a Central tomaria
// decisão de fila sobre um número truncado.
//
// É a regra de sempre do repositório: a tela não afirma o que não sabe.
// ═════════════════════════════════════════════════════════════════════════════

describe("o painel não afirma um número que não conseguiu contar", () => {
  const FONTE = readFileSync("convex/communications.ts", "utf-8");
  const painel = FONTE.slice(
    FONTE.indexOf("export async function montarPainel"),
    FONTE.indexOf("export const painel = query"),
  );

  it("os tetos das varreduras são nomeados, não números soltos", () => {
    expect(painel).toContain("take(LIMITE_DE_CONVERSAS_DO_PAINEL)");
    expect(painel).toContain("take(LIMITE_DE_CONTATOS_DO_PAINEL)");
  });

  it("a resposta declara quando a contagem parou no teto", () => {
    expect(painel).toContain("amostraParcial:");
    expect(painel).toContain("conversas.length >= LIMITE_DE_CONVERSAS_DO_PAINEL");
    expect(painel).toContain("contatosRecentes.length >= LIMITE_DE_CONTATOS_DO_PAINEL");
  });

  it("a tela mostra o aviso — o campo sozinho não protege ninguém", () => {
    const tela = readFileSync(
      "src/pages/app/central/_components/painel-da-central.tsx",
      "utf-8",
    );
    expect(tela).toContain("painel.amostraParcial &&");
    expect(tela).toMatch(/Há mais/i);
  });

  it("e o aviso NÃO leva nome, telefone nem conteúdo para a ponte do 3D", () => {
    // A ponte entrega este mesmo payload. Um booleano de contagem é a única
    // coisa que entrou; a disciplina de não carregar dado pessoal continua.
    const retorno = painel.slice(painel.lastIndexOf("  return {"));
    for (const proibido of ["displayName", "telefone", "texto", "body", "email"]) {
      expect(retorno, proibido).not.toMatch(new RegExp(`${proibido}\\s*:`));
    }
  });
});
