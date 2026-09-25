import { describe, expect, it } from "vitest";
import {
  chamadasDoFrontend,
  compararSincronia,
  funcoesNoCodigo,
  funcoesPublicadas,
  relatorio,
} from "./comparar.mjs";

// ═════════════════════════════════════════════════════════════════════════════
// O CÓDIGO E O DEPLOYMENT DIZEM A MESMA COISA?
//
// ── O DEFEITO REAL QUE ORIGINOU ESTE ARQUIVO ────────────────────────────────
// Numa homologação visual com o cliente na frente, `/escritorio` quebrou:
//
//     Could not find public function for 'escritorio:souDono'
//
// A função estava no código, exportada, pública, no `api.d.ts`. Typecheck
// verde, 5.100 testes verdes, CI verde. O DEV é que rodava versão antiga —
// faltavam 51 funções, de sete módulos.
//
// Nenhum teste pegava, e não podia: teste roda contra CÓDIGO. A distância
// entre o código e o que está publicado é um lugar onde nenhuma suíte olha.
//
// A armadilha: `npx convex codegen` imprime "Uploading functions to Convex..."
// e não publica — sobe para analisar tipos e descarta. Quem publica é
// `npx convex dev --once`.
// ═════════════════════════════════════════════════════════════════════════════

const arq = (arquivo, fonte) => ({ arquivo, fonte });

describe("o que o código declara", () => {
  it("acha query, mutation e action públicas", () => {
    expect(
      funcoesNoCodigo([
        arq("escritorio.ts", "export const souDono = query({\nexport const panorama = query({"),
        arq("admin.ts", "export const setUserAccess = mutation({"),
        arq("asaas.ts", "export const reconcileSubscription = action({"),
      ]),
    ).toEqual([
      "admin.js:setUserAccess",
      "asaas.js:reconcileSubscription",
      "escritorio.js:souDono",
      "escritorio.js:panorama",
    ].sort());
  });

  it("IGNORA as internas — elas não aparecem no spec", () => {
    // `internalQuery` e irmãs não são alcançáveis pelo navegador e o
    // `function-spec` não as lista. Incluí-las produziria um "faltando"
    // permanente — e aviso que nunca some ensina a ignorar a saída inteira.
    expect(
      funcoesNoCodigo([
        arq(
          "assistente.ts",
          "export const delegar = mutation({\nexport const marcarRodando = internalMutation({\nexport const obterParaEnvio = internalQuery({",
        ),
      ]),
    ).toEqual(["assistente.js:delegar"]);
  });

  it("arquivo sem função pública não inventa nada", () => {
    expect(funcoesNoCodigo([arq("lib.ts", "export function puro() {}")])).toEqual([]);
  });
});

describe("o que a tela chama", () => {
  it("acha as chamadas api.modulo.funcao", () => {
    expect(
      chamadasDoFrontend([
        arq("page.tsx", "useQuery(api.escritorio.souDono)\nuseQuery(api.escritorio.panorama)"),
        arq("outra.tsx", "useMutation(api.campanhaRascunhos.preparar)"),
      ]),
    ).toEqual([
      "campanhaRascunhos.js:preparar",
      "escritorio.js:panorama",
      "escritorio.js:souDono",
    ]);
  });

  it("não confunde `api` com outra palavra terminada em api", () => {
    expect(chamadasDoFrontend([arq("x.tsx", "terapia.escritorio.souDono")])).toEqual([]);
  });
});

describe("o que o deployment respondeu", () => {
  it("ignora rota HTTP, que não tem identificador", () => {
    expect(
      funcoesPublicadas({
        functions: [
          { identifier: "admin.js:isAdmin", visibility: { kind: "public" } },
          { functionType: "HttpAction", method: "GET", path: "/.well-known/x" },
        ],
      }),
    ).toEqual(["admin.js:isAdmin"]);
  });

  it("ignora as INTERNAS — e não ignorá-las produziu um relatório errado", () => {
    // ── O DEFEITO QUE ESTE TESTE GUARDA ───────────────────────────────────
    // A primeira versão contava internas como publicadas. Num deployment
    // perfeitamente em dia, a ferramenta anunciou "50 publicadas que não
    // existem mais no código": ela comparava as PÚBLICAS do código contra
    // públicas E internas do deployment, e a diferença eram exatamente as 50
    // internas.
    //
    // Resíduo falso é pior do que nenhum aviso — quem lê aprende que aquela
    // linha não significa nada.
    expect(
      funcoesPublicadas({
        functions: [
          { identifier: "admin.js:isAdmin", visibility: { kind: "public" } },
          { identifier: "users.js:getBillingRef", visibility: { kind: "internal" } },
        ],
      }),
    ).toEqual(["admin.js:isAdmin"]);
  });

  it("sem `visibility`, considera pública — na dúvida, não acusa falta", () => {
    expect(funcoesPublicadas({ functions: [{ identifier: "a.js:um" }] })).toEqual(["a.js:um"]);
  });

  it("spec vazio ou malformado não quebra", () => {
    expect(funcoesPublicadas({})).toEqual([]);
    expect(funcoesPublicadas(null)).toEqual([]);
  });
});

describe("o veredicto", () => {
  it("em dia quando o deployment tem tudo", () => {
    const r = compararSincronia({
      codigo: ["a.js:um", "b.js:dois"],
      publicadas: ["a.js:um", "b.js:dois"],
      chamadas: ["a.js:um"],
    });
    expect(r.emDia).toBe(true);
    expect(r.chamadasQuebradas).toEqual([]);
  });

  it("o caso real: a tela chama o que não está publicado", () => {
    const r = compararSincronia({
      codigo: ["escritorio.js:souDono", "escritorio.js:panorama"],
      publicadas: ["admin.js:isAdmin"],
      chamadas: ["escritorio.js:souDono", "escritorio.js:panorama"],
    });
    expect(r.emDia).toBe(false);
    // A ordem acompanha a das chamadas recebidas, não é reordenada: em uso
    // real elas já chegam ordenadas de `chamadasDoFrontend`, e preservar a
    // ordem de quem chamou mantém o relatório previsível.
    expect(r.chamadasQuebradas).toEqual(["escritorio.js:souDono", "escritorio.js:panorama"]);
  });

  it("função do código sem chamador é AVISO, não falha", () => {
    // Ela não estraga a experiência de ninguém hoje. Tratar como falha faria
    // a ferramenta reprovar um deployment que funciona.
    const r = compararSincronia({
      codigo: ["a.js:um", "b.js:sem_chamador"],
      publicadas: ["a.js:um"],
      chamadas: ["a.js:um"],
    });
    expect(r.chamadasQuebradas, "nada que a tela use está faltando").toEqual([]);
    expect(r.faltandoNoDeployment).toEqual(["b.js:sem_chamador"]);
    expect(r.emDia, "ainda assim o deployment está atrás do código").toBe(false);
  });

  it("publicada que sumiu do código NÃO é erro", () => {
    // Resíduo de deploy anterior: não quebra tela nenhuma e some no próximo
    // `convex dev`. Gritar sobre o inofensivo é como se ensina a ignorar o
    // grito.
    const r = compararSincronia({
      codigo: ["a.js:um"],
      publicadas: ["a.js:um", "velha.js:removida"],
      chamadas: ["a.js:um"],
    });
    expect(r.emDia).toBe(true);
    expect(r.sobrandoNoDeployment).toEqual(["velha.js:removida"]);
  });
});

describe("o relatório", () => {
  it("quando quebra, diz O QUE fazer — e desfaz a armadilha do codegen", () => {
    const r = compararSincronia({
      codigo: ["escritorio.js:souDono"],
      publicadas: [],
      chamadas: ["escritorio.js:souDono"],
    });
    const texto = relatorio(r, "https://healthy-pika-907.convex.cloud");
    expect(texto).toContain("escritorio.js:souDono");
    expect(texto).toContain("npx convex dev --once");
    // A linha que impede a próxima pessoa de cair no mesmo buraco.
    expect(texto).toMatch(/codegen.*NÃO publica/i);
  });

  it("quando está em dia, não enche de texto", () => {
    const r = compararSincronia({ codigo: ["a.js:um"], publicadas: ["a.js:um"], chamadas: [] });
    const texto = relatorio(r, "https://healthy-pika-907.convex.cloud");
    expect(texto).toContain("em dia");
    expect(texto).not.toContain("npx convex dev --once");
  });
});
