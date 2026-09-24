import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// `api.d.ts` LISTA TODO MÓDULO DO BACKEND — SEM PRECISAR DE DEPLOYMENT
//
// ── O DEFEITO QUE ISTO TRAVA ────────────────────────────────────────────────
// `npx convex codegen` recusa rodar sem um deployment configurado. Em várias
// rodadas não havia nenhum, e `api.d.ts` foi mantido à mão. Funcionou para o
// que se estava mexendo e falhou no que ninguém olhava: NOVE módulos de `lib/`
// ficaram de fora do arquivo sem que nada acusasse.
//
// E nada acusaria mesmo. `api.d.ts` é uma DECLARAÇÃO: módulo ausente não
// quebra typecheck, não quebra build, não quebra teste. Ele só não existe para
// quem chama por `api.*` — e o erro aparece em tempo de execução, na tela, no
// dia em que alguém precisar justamente dele.
//
// ── POR QUE ESTE TESTE E NÃO "rode o codegen no CI" ─────────────────────────
// Porque o CI também não tem deployment, e pedir um seria trocar uma trava de
// código por uma credencial. A conta que o codegen faz é simples o bastante
// para refazer aqui: todo arquivo `.ts` de `convex/` vira uma entrada, menos
// cinco que ele nunca inclui.
//
// Não substitui o codegen — ele também gera assinatura de função, e isso só o
// deployment sabe. Substitui a única parte que dava para perder em silêncio.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Os cinco arquivos de `convex/` que NÃO viram entrada em `api.d.ts`.
 *
 * Cada um por um motivo diferente, e nenhum por acaso:
 *   schema         é o schema, consumido por `dataModel.d.ts`
 *   auth.config    configuração do provedor, lida pelo runtime
 *   convex.config  declaração de componentes, lida na build do backend
 *   test.setup     só existe para os testes enxergarem os módulos
 *   test.auth      sessão falsa dos testes; nunca sobe para deployment nenhum
 *
 * Se algum dia o codegen passar a incluir um destes, este teste quebra — e é
 * o que se quer: a lista é uma afirmação sobre o gerador, não um silenciador.
 */
const FORA_DO_CONTRATO = new Set([
  "schema",
  "auth.config",
  "convex.config",
  "test.setup",
  "test.auth",
]);

/** Todo módulo do backend, no formato que `api.d.ts` usa: "lib/dinheiro". */
function modulosDoBackend(): string[] {
  return readdirSync("convex", { recursive: true, encoding: "utf-8" })
    .filter((p) => p.endsWith(".ts"))
    .map((p) => p.replaceAll("\\", "/"))
    .filter((p) => !p.startsWith("_generated/"))
    .filter((p) => !p.endsWith(".test.ts"))
    .map((p) => p.slice(0, -".ts".length))
    .filter((m) => !FORA_DO_CONTRATO.has(m))
    .sort();
}

/** O que `api.d.ts` declara, lido dos imports que o codegen escreve. */
function modulosDeclarados(): string[] {
  const fonte = readFileSync("convex/_generated/api.d.ts", "utf-8");
  return [...fonte.matchAll(/^import type \* as \w+ from "\.\.\/(.+)\.js";$/gm)]
    .map((m) => m[1])
    .sort();
}

describe("o contrato gerado cobre o backend inteiro", () => {
  const noDisco = modulosDoBackend();
  const declarados = modulosDeclarados();

  it("existe backend para conferir — senão este teste passaria vazio", () => {
    expect(noDisco.length).toBeGreaterThan(50);
  });

  it("nenhum módulo do backend ficou de fora do api.d.ts", () => {
    const faltando = noDisco.filter((m) => !declarados.includes(m));
    // A mensagem é o teste: quem quebrar isto precisa saber o que rodar.
    expect(
      faltando.length === 0
        ? "nenhum"
        : `faltam em api.d.ts (rode 'npx convex codegen'): ${faltando.join(", ")}`,
    ).toBe("nenhum");
  });

  it("api.d.ts não declara módulo que não existe mais", () => {
    // O outro sentido da trava: arquivo apagado ou renomeado deixa uma entrada
    // órfã, e o cliente Convex passa a prometer algo que o backend não tem.
    const orfaos = declarados.filter((m) => !noDisco.includes(m));
    expect(
      orfaos.length === 0
        ? "nenhum"
        : `declarados sem arquivo (rode 'npx convex codegen'): ${orfaos.join(", ")}`,
    ).toBe("nenhum");
  });

  it("cada módulo declarado aparece também no mapa `fullApi`", () => {
    // O import sozinho não expõe nada: é a entrada em `fullApi` que faz o
    // módulo existir para `api.*`. Já houve edição à mão que acrescentou uma
    // e esqueceu a outra.
    const fonte = readFileSync("convex/_generated/api.d.ts", "utf-8");
    const semMapa = declarados.filter((m) => {
      const chave = m.includes("/") ? `"${m}":` : `${m}:`;
      return !fonte.includes(chave);
    });
    expect(semMapa).toEqual([]);
  });
});
