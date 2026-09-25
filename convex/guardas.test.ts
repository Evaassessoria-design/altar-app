import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// TODA PORTA TEM PORTEIRO
//
// ── POR QUE ESTA TRAVA É DIFERENTE DAS OUTRAS ───────────────────────────────
// O repositório tem dezenas de testes de isolamento, e todos têm o mesmo
// limite: cobrem a função que alguém LEMBROU de cobrir. A função nova, escrita
// numa terça-feira corrida, não tem teste de isolamento justamente porque
// ninguém pensou nela.
//
// Este teste não sabe o que as funções fazem. Ele enumera TODAS as `query`,
// `mutation` e `action` públicas do backend e exige que cada uma chame um
// guarda — ou esteja numa lista de exceções com o motivo escrito.
//
// ── O QUE CONTA COMO GUARDA ─────────────────────────────────────────────────
// Qualquer uma das funções de `lib/identity.ts`, `lib/adminGuard.ts`,
// `lib/accessGuard.ts` e `lib/platformGuard.ts`. Todas resolvem a identidade
// da SESSÃO — nenhuma aceita `userId` vindo do navegador, que é a regra 2 do
// CLAUDE.md.
//
// ── POR QUE `internal*` FICA DE FORA ────────────────────────────────────────
// `internalQuery`, `internalMutation` e `internalAction` não são alcançáveis
// pelo navegador. Elas são chamadas por outras funções do backend, que já
// passaram pelo guarda, e o `userId` delas vem de um registro do banco, não de
// um argumento do cliente.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Todo helper que RESOLVE A IDENTIDADE DA SESSÃO.
 *
 * A lista é o conjunto exportado por `lib/identity.ts`, `lib/adminGuard.ts`,
 * `lib/accessGuard.ts` e `lib/platformGuard.ts`. Nenhum deles aceita `userId`
 * vindo do navegador — todos partem de `ctx.auth`, que é a regra 2 do
 * CLAUDE.md.
 *
 * Há um teste abaixo cobrando que esta lista não fique para trás quando um
 * guarda novo nascer: uma lista desatualizada faria a trava reprovar código
 * correto, e a reação natural seria afrouxá-la.
 */
const GUARDAS = [
  "getOptionalUser",
  "requireUser",
  "getOwnedEvent",
  "requireEventOwner",
  "getOwnedLead",
  "requireLeadOwner",
  "requireTeamMember",
  "requireEventPhoto",
  "getOptionalIdentity",
  "requireIdentity",
  "syncAuthenticatedUser",
  "requireEventSupplier",
  "requirePlatformOwner",
  "ehPlatformOwner",
  "requireAdmin",
  "requireActiveAccess",
  "requireActiveAccessAction",
];

/**
 * As funções que são públicas DE PROPÓSITO, com o motivo.
 *
 * Toda entrada aqui é uma decisão de produto, não um esquecimento. Acrescentar
 * uma linha é o momento de alguém perguntar "por quê?".
 */
const SEM_GUARDA: Readonly<Record<string, string>> = {
  "landingLeads.submit":
    "o formulário da landing é de visitante — é o único jeito de alguém pedir demonstração",
  "landingLeads.jaExiste":
    "a landing confere duplicidade antes de gravar; não devolve dado de ninguém",
  "auth.signIn": "autenticação",
  "auth.signOut": "autenticação",
};

type Funcao = { arquivo: string; nome: string; corpo: string; tipo: string; guardada: boolean };

/**
 * Os HELPERS LOCAIS de posse de cada arquivo.
 *
 * ── POR QUE A TRAVA SEGUE UMA INDIREÇÃO ─────────────────────────────────────
 * A primeira versão só procurava os guardas pelo nome, e acusou sete funções
 * que estão corretas: `propostas.update` chama `minhaProposta`,
 * `leadDocuments.list` chama `getOwnedLead`, `escritorio.souDono` chama
 * `ehPlatformOwner`. Todos resolvem a sessão e conferem a posse — só que com
 * nome próprio, que é como o repositório escreve.
 *
 * Manter uma lista desses nomes à mão envelheceria no primeiro helper novo, e
 * o modo de falha seria o pior possível: o teste passaria calado sobre a
 * função que ninguém conferiu.
 *
 * Então a trava resolve UM nível: se o corpo chama uma função declarada no
 * mesmo arquivo, e o corpo DELA tem guarda, está guardada.
 */
function helpersGuardadosDe(fonte: string): string[] {
  const guardados: string[] = [];
  const re = /(?:async\s+)?function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*async\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    const nome = m[1] ?? m[2];
    // Até a próxima declaração de topo, o que basta para um helper.
    const fim = fonte.indexOf("\nexport ", m.index);
    const corpo = fonte.slice(m.index, fim === -1 ? m.index + 2000 : fim);
    if (GUARDAS.some((g) => corpo.includes(g))) guardados.push(nome);
  }
  return guardados;
}

function funcoesPublicas(): Funcao[] {
  const achadas: Funcao[] = [];
  for (const arquivo of readdirSync("convex")) {
    if (!arquivo.endsWith(".ts")) continue;
    if (arquivo.includes(".test.")) continue;
    if (arquivo === "schema.ts" || arquivo === "auth.ts" || arquivo === "http.ts") continue;

    const fonte = readFileSync(`convex/${arquivo}`, "utf-8");
    const modulo = arquivo.replace(/\.ts$/, "");
    const locais = helpersGuardadosDe(fonte);

    // `export const nome = query({` — e só os três tipos PÚBLICOS. Um
    // `(?<!al)` não serviria porque `internalQuery` termina em `Query`: a
    // âncora é o `= ` imediatamente antes do tipo.
    const re = /export const (\w+)\s*=\s*(query|mutation|action)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte)) !== null) {
      const proxima = fonte.indexOf("\nexport ", m.index + 1);
      const corpo = fonte.slice(m.index, proxima === -1 ? undefined : proxima);
      achadas.push({
        arquivo,
        nome: `${modulo}.${m[1]}`,
        tipo: m[2],
        corpo,
        guardada:
          GUARDAS.some((g) => corpo.includes(g)) ||
          locais.some((h) => new RegExp(`\\b${h}\\s*\\(`).test(corpo)),
      });
    }
  }
  return achadas;
}

const FUNCOES = funcoesPublicas();

describe("toda função pública do backend tem guarda", () => {
  it("a lista de guardas não ficou para trás", () => {
    // ── POR QUE ESTE TESTE EXISTE ─────────────────────────────────────────
    // `GUARDAS` é uma lista escrita à mão, e lista escrita à mão envelhece. O
    // modo de falha é traiçoeiro: um guarda novo não entra na lista, a trava
    // reprova código correto, e a reação natural de quem está com pressa é
    // afrouxar a trava em vez de atualizar a lista.
    //
    // Aqui os arquivos de guarda são lidos e comparados. Se nascer um guarda,
    // este teste falha PRIMEIRO, e falha com a instrução certa.
    const exportados = ["identity", "platformGuard", "adminGuard", "accessGuard"].flatMap(
      (arquivo) =>
        [
          ...readFileSync(`convex/lib/${arquivo}.ts`, "utf-8").matchAll(
            /^export async function (\w+)/gm,
          ),
        ].map((m) => m[1]),
    );

    // Nem todo export destes arquivos é guarda: `resolveTrialForNewUser`
    // calcula prazo. O que a trava cobra é o contrário — que nenhum nome da
    // lista tenha SUMIDO, e que os que começam com `require` estejam todos lá.
    for (const nome of exportados) {
      if (!nome.startsWith("require")) continue;
      expect(GUARDAS, `${nome} é um guarda e não está em GUARDAS`).toContain(nome);
    }
    for (const nome of GUARDAS) {
      expect(exportados, `${nome} não existe mais — tire de GUARDAS`).toContain(nome);
    }
  });

  it("o varredor achou o backend inteiro", () => {
    // Se o regex quebrar, o teste passaria calado sobre zero funções — que é
    // o pior resultado possível para uma trava.
    expect(FUNCOES.length).toBeGreaterThan(150);
  });

  it.each(FUNCOES.map((f) => [f.nome, f] as const))("%s", (nome, f) => {
    if (nome in SEM_GUARDA) {
      // A exceção precisa continuar sendo verdade: se alguém acrescentar um
      // guarda aqui depois, a linha da lista vira mentira e deve sair.
      expect(
        f.guardada,
        `${nome} está na lista de exceções mas GANHOU um guarda — tire-a da lista`,
      ).toBe(false);
      return;
    }

    expect(
      f.guardada,
      `${nome} (${f.tipo} em ${f.arquivo}) não chama nenhum guarda de identidade, ` +
        `nem helper guardado do próprio arquivo. ` +
        `Se for pública de propósito, declare em SEM_GUARDA com o motivo.`,
    ).toBe(true);
  });
});

describe("nenhuma função pública aceita userId do navegador", () => {
  // ── A REGRA 2 DO CLAUDE.md ────────────────────────────────────────────────
  // Id vindo do navegador não é prova de posse. Aceitar `userId` como ARGUMENTO
  // de uma função pública é entregar a chave: quem souber o id de outra conta
  // passa a operar como ela.
  //
  // Funções que recebem `v.id("users")` por outro motivo legítimo — apontar um
  // responsável, vincular um interessado a uma conta — usam nomes próprios
  // (`responsavelUserId`, `contaUserId`), e é por isso que a trava é sobre o
  // nome exato `userId`.
  //
  // ── A EXCEÇÃO ADMINISTRATIVA ──────────────────────────────────────────────
  // `admin.setUserAccess` e irmãs recebem `userId` porque o administrador está
  // agindo SOBRE uma assinante nomeada — mudar o papel dela, conceder acesso,
  // apagar a conta. Aí o id não é prova de posse de quem chama: é o alvo, e
  // quem autoriza é o `requireAdmin`.
  //
  // A distinção que importa: numa função da decoradora, `userId` como argumento
  // seria a própria identidade vindo do navegador — e quem souber o id de outra
  // conta passaria a operar como ela.
  // `api.admin.isAdmin` cobre as ACTIONS: elas não têm `QueryCtx` e não podem
  // chamar `requireAdmin` direto, então conferem por consulta. É o mesmo
  // portão, por outro caminho.
  const DA_DECORADORA = FUNCOES.filter(
    (f) => !f.corpo.includes("requireAdmin") && !f.corpo.includes("api.admin.isAdmin"),
  );

  it("existem funções da decoradora para conferir", () => {
    expect(DA_DECORADORA.length).toBeGreaterThan(100);
  });

  it.each(DA_DECORADORA.map((f) => [f.nome, f] as const))("%s", (nome, f) => {
    const args = f.corpo.slice(f.corpo.indexOf("args:"), f.corpo.indexOf("handler"));
    expect(args, `${nome} aceita userId como argumento`).not.toMatch(
      /\buserId\s*:\s*v\.(optional\()?id\("users"\)/,
    );
  });
});

describe("as funções da campanha são todas administrativas", () => {
  // O outro lado da regra 5: `landingLeads` são decoradoras interessadas no
  // ALTAR, e o painel delas é operação da ALTAR. Uma assinante nunca pode ver
  // a lista de concorrentes dela.
  const DA_CAMPANHA = FUNCOES.filter((f) =>
    ["campanhaRascunhos", "comercialBriefing", "mensageria"].includes(
      f.arquivo.replace(/\.ts$/, ""),
    ),
  );

  it("existem funções de campanha para conferir", () => {
    expect(DA_CAMPANHA.length).toBeGreaterThan(5);
  });

  it.each(DA_CAMPANHA.map((f) => [f.nome, f] as const))("%s exige administrador", (nome, f) => {
    expect(f.corpo, `${nome} não exige requireAdmin`).toContain("requireAdmin");
  });
});
