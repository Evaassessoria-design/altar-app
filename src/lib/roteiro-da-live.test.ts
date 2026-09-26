import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ═════════════════════════════════════════════════════════════════════════════
// O ROTEIRO DA LIVE, CONFERIDO CONTRA O CÓDIGO
//
// ── O DEFEITO QUE FEZ ESTE ARQUIVO EXISTIR ──────────────────────────────────
// O bloco 7 do roteiro mandava abrir `/escritorio` para mostrar a IA. Essa
// tela é o painel do NEGÓCIO ALTAR e é guardada por `requirePlatformOwner`:
// com a conta de demonstração, ao vivo, ela mostraria uma recusa de acesso no
// lugar do produto — justamente no bloco que existe para mostrar a IA
// funcionando. A tela certa é `/assistente`.
//
// O erro ficou meses num documento que ninguém tinha como conferir, porque
// documento não roda. Agora roda.
//
// ── O QUE ESTE ARQUIVO GUARDA ───────────────────────────────────────────────
// Três costuras entre o que o roteiro AFIRMA e o que o código FAZ:
//
//   1. toda rota citada como "abrir" existe em `App.tsx`;
//   2. nenhuma tela da lista de proibidas aparece como tela a abrir;
//   3. toda pergunta que o roteiro chama de "homologada" está de fato na
//      lista homologada do backend, com a mesma redação.
//
// Não prova que a live vai dar certo. Prova que o roteiro não manda fazer
// nada que o produto recusa.
// ═════════════════════════════════════════════════════════════════════════════

const ler = (caminho: string) => readFileSync(caminho, "utf-8");

const APP = ler("src/App.tsx");
const ROTEIRO = ler("docs/live-altar-2026-10-06.md");
const CURTO = ler("docs/live-06-10/roteiro-curto.md");
const PERGUNTAS = ler("docs/live-06-10/perguntas-assistente.md");
const HOMOLOGACAO = ler("convex/assistente.homologacao.test.ts");

/** As rotas declaradas em `App.tsx`, com `:id` trocado por um curinga. */
const ROTAS = [...APP.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1]);

function rotaExiste(caminho: string): boolean {
  return ROTAS.some((r) => {
    const padrao = r
      .split("/")
      .map((p) => (p.startsWith(":") ? "[^/]+" : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/");
    return new RegExp(`^${padrao}$`).test(caminho);
  });
}

/**
 * As rotas que um documento manda ABRIR.
 *
 * Só conta o que está entre crases e começa com barra. Texto solto sobre uma
 * tela não é instrução de abrir, e contá-lo daria falso positivo em toda
 * menção de passagem.
 */
function rotasCitadas(documento: string): string[] {
  const cruas = [...documento.matchAll(/`(\/[a-z0-9:/_-]+)`/g)].map((m) => m[1]);
  return [...new Set(cruas)];
}

/**
 * As telas que o roteiro proíbe.
 *
 * `/escritorio` está aqui por acidente de arquitetura, não por segredo: é o
 * painel do negócio ALTAR, e a conta que apresenta não é dona da plataforma.
 */
const PROIBIDAS = ["/central", "/admin", "/escritorio"];

describe("toda tela do roteiro existe", () => {
  it.each([
    ["o roteiro completo", ROTEIRO],
    ["o roteiro curto", CURTO],
    ["as perguntas do Assistente", PERGUNTAS],
  ])("%s não cita rota inexistente", (_nome, documento) => {
    const inexistentes = rotasCitadas(documento).filter((r) => !rotaExiste(r));
    expect(inexistentes, `rotas que não existem em App.tsx: ${inexistentes.join(", ")}`).toEqual([]);
  });

  it("as onze telas da ordem de apresentação existem, na ordem", () => {
    // ── POR QUE A ORDEM IMPORTA ───────────────────────────────────────────
    // As abas são abertas antes da transmissão, nesta sequência. Se uma rota
    // sumir do produto e continuar na lista, a aba abre em branco no meio da
    // apresentação.
    const bloco = ROTEIRO.slice(
      ROTEIRO.indexOf("## 5. Telas demonstradas"),
      ROTEIRO.indexOf("## 6."),
    );
    const ordem = [...bloco.matchAll(/^\d+\.\s+`([^`]+)`/gm)].map((m) => m[1]);
    expect(ordem.length, "a lista de telas encolheu").toBe(11);
    for (const rota of ordem) expect(rotaExiste(rota), rota).toBe(true);
  });
});

describe("o roteiro não manda abrir o que ele mesmo proíbe", () => {
  it.each(PROIBIDAS)("%s não aparece na ordem de apresentação", (proibida) => {
    const bloco = ROTEIRO.slice(
      ROTEIRO.indexOf("## 5. Telas demonstradas"),
      ROTEIRO.indexOf("## 6."),
    );
    expect(bloco, `${proibida} está na lista de telas a abrir`).not.toContain(`\`${proibida}\``);
  });

  it.each(PROIBIDAS)("%s não aparece na tabela de blocos do roteiro curto", (proibida) => {
    // A tabela é o que fica aberto ao lado durante a apresentação. Uma tela
    // proibida citada ali seria lida como instrução.
    const tabela = CURTO.slice(CURTO.indexOf("## A ordem"), CURTO.indexOf("## Os cinco momentos"));
    expect(tabela, `${proibida} está na tabela de blocos`).not.toContain(proibida);
  });

  it("as três continuam nomeadas na lista do que NÃO abrir", () => {
    // Tirá-las da tabela e esquecer de listá-las seria trocar um erro por
    // outro: o roteiro deixaria de avisar.
    const naoAbrir = CURTO.slice(CURTO.indexOf("## O que NÃO abrir"));
    for (const proibida of PROIBIDAS) {
      expect(naoAbrir, `${proibida} sumiu do aviso`).toContain(proibida);
    }
  });

  it("o bloco da IA aponta para /assistente", () => {
    const bloco = ROTEIRO.slice(ROTEIRO.indexOf("### Bloco 7"), ROTEIRO.indexOf("### Bloco 8"));
    expect(bloco).toContain("`/assistente`");
  });
});

describe("as perguntas chamadas de homologadas são as homologadas", () => {
  /**
   * As perguntas que o documento apresenta como verificadas.
   *
   * São as linhas de citação (`> ### ...`) e as células da tabela de reservas.
   * Uma frase solta no meio do texto não é uma promessa de homologação.
   */
  const citadas = [
    ...[...PERGUNTAS.matchAll(/^> ### (.+)$/gm)].map((m) => m[1].trim()),
    ...[...PERGUNTAS.matchAll(/^\| ([A-ZÀ-Ú][^|]*\?) \| \w/gm)].map((m) => m[1].trim()),
    ...[...PERGUNTAS.matchAll(/^\| ([A-ZÀ-Ú][^|]*\.) \| \w/gm)].map((m) => m[1].trim()),
  ];

  it("o documento realmente cita perguntas — senão esta trava não guarda nada", () => {
    expect(citadas.length).toBeGreaterThanOrEqual(7);
  });

  it.each(citadas)("«%s» está em assistente.homologacao.test.ts", (pergunta) => {
    // ── POR QUE COMPARAR O TEXTO EXATO ────────────────────────────────────
    // O roteador é determinístico e lê palavras. "Como estão minhas
    // oportunidades?" é homologada; "Quais oportunidades estão paradas há mais
    // tempo?" nunca foi testada e pode cair em outro agente. Uma reescrita bem
    // intencionada do documento trocaria uma pela outra sem ninguém notar.
    expect(HOMOLOGACAO, `${pergunta} não está na lista homologada`).toContain(`"${pergunta}"`);
  });

  it("os pedidos apresentados como PROIBIDOS são os que o backend recusa", () => {
    const bloco = PERGUNTAS.slice(PERGUNTAS.indexOf("Porque a resposta é uma recusa"));
    const vermelhos = [...bloco.matchAll(/^- \*([^*]+)\* →/gm)].map((m) => m[1].trim());
    expect(vermelhos.length).toBeGreaterThanOrEqual(3);
    for (const pedido of vermelhos) {
      expect(HOMOLOGACAO, `${pedido} não consta como recusado`).toContain(`"${pedido}"`);
    }
  });
});
