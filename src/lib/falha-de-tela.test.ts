import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ehFalhaDeCarregamentoDeTela } from "./falha-de-tela.ts";

describe("falha de carregamento de tela", () => {
  it.each([
    ["Chrome", "Failed to fetch dynamically imported module: https://app/assets/page-abc.js"],
    ["Firefox", "error loading dynamically imported module"],
    ["Safari", "Importing a module script failed."],
    ["variação", "Failed to load module script: unexpected MIME type"],
  ])("%s é reconhecido", (_nav, mensagem) => {
    expect(ehFalhaDeCarregamentoDeTela(new Error(mensagem))).toBe(true);
  });

  it("ChunkLoadError pelo nome também conta", () => {
    const e = new Error("qualquer coisa");
    e.name = "ChunkLoadError";
    expect(ehFalhaDeCarregamentoDeTela(e)).toBe(true);
  });

  it("erro comum do código NÃO é confundido com chunk", () => {
    // Se fosse, o app mandaria recarregar em vez de mostrar o erro de verdade.
    expect(ehFalhaDeCarregamentoDeTela(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(ehFalhaDeCarregamentoDeTela(new Error("Evento não encontrado"))).toBe(false);
  });

  it.each([[null], [undefined], [""], [42], [{}]])("valor estranho (%s) não quebra", (v) => {
    expect(ehFalhaDeCarregamentoDeTela(v)).toBe(false);
  });

  it("a detecção não depende de maiúsculas", () => {
    expect(ehFalhaDeCarregamentoDeTela(new Error("FAILED TO FETCH DYNAMICALLY IMPORTED MODULE"))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O NOME DA VARIÁVEL DE AMBIENTE NÃO É ASSUNTO DA DECORADORA
//
// Sem chave de IA configurada, a tela dizia à cliente:
//
//   "Verifique se a chave de IA (ALTAR_AI_API_KEY) está configurada no Convex."
//
// Ela não tem acesso ao Convex, não sabe o que é uma variável de ambiente e
// não pode fazer nada com essa frase. Numa demonstração é pior ainda: é a
// única mensagem em toda a reunião que parece um defeito.
//
// A regra do repositório já existia ("nenhuma mensagem de erro técnica exposta
// a quem usa" — README §6); estas três telas não a cumpriam.
//
// A Central é a EXCEÇÃO DELIBERADA e não entra na lista: ela é operada pelo
// administrador do SaaS, que é justamente quem mexe nas variáveis. Lá, nomear
// a variável é ajuda, não vazamento.
// ═════════════════════════════════════════════════════════════════════════════

const TELAS_DA_DECORADORA = [
  "src/pages/app/events/[id]/_components/contract-import-dialog.tsx",
  "src/pages/app/events/[id]/_components/layout-analysis-dialog.tsx",
  "src/pages/app/events/[id]/planta/page.tsx",
  "src/pages/app/compras/page.tsx",
  "src/pages/app/financeiro/page.tsx",
  "src/pages/app/acervo/page.tsx",
];

/** Vocabulário que só existe para quem opera o deployment. */
const VOCABULARIO_DE_OPERADOR = [
  /ALTAR_[A-Z_]+/,
  /variáveis de ambiente/i,
  /\bno Convex\b/,
  /ConvexError/,
  /process\.env/,
];

describe("a tela da decoradora não fala de variável de ambiente", () => {
  it.each(TELAS_DA_DECORADORA)("%s não expõe vocabulário de operador", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    // Só o que a pessoa LÊ: texto entre aspas dentro de JSX e de strings.
    const textos = fonte.match(/"[^"\n]{20,200}"/g) ?? [];
    const jsx = fonte.match(/>\s*[A-ZÀ-Ú][^<>{}\n]{20,200}</g) ?? [];

    for (const trecho of [...textos, ...jsx]) {
      for (const padrao of VOCABULARIO_DE_OPERADOR) {
        expect(
          padrao.test(trecho),
          `${arquivo}: texto visível cita ${padrao}.\nTrecho: ${trecho.trim()}`,
        ).toBe(false);
      }
    }
  });
});
