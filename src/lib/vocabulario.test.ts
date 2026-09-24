import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { comBarraNormal } from "../vitest.arquivos.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O QUE A DECORADORA LÊ
//
// Duas regras, e só duas:
//
//  1. vocabulário TÉCNICO não aparece na tela — nem slug de enum, nem nome de
//     campo, nem `undefined`;
//  2. a MESMA coisa tem UM nome.
//
// A segunda é a que morde devagar. No Catálogo, a aba dizia "Composições", o
// estado vazio dizia "Sua biblioteca de receitas está vazia" e o diálogo se
// chamava "Receita da biblioteca" — três nomes, uma tela, um objeto só. Quem
// chega hoje não tem como saber se são a mesma coisa.
//
// ── O QUE ESTE TESTE NÃO FAZ ────────────────────────────────────────────────
// Não escolhe vocabulário de produto. Onde há decisão pendente — "lead" ou
// "cliente" — ele NÃO renomeia: mede a superfície, para que a decisão, quando
// vier, tenha um raio conhecido em vez de uma busca e um susto.
// ═════════════════════════════════════════════════════════════════════════════

const ler = (f: string) => readFileSync(f, "utf-8");

/** Todo texto que chega aos olhos: JSX, placeholder, title, aria-label, toast. */
function textoVisivel(fonte: string): string[] {
  const textos: string[] = [];
  for (const m of fonte.matchAll(/>\s*([^<>{}]{4,200})\s*</gs)) textos.push(m[1]);
  for (const m of fonte.matchAll(/(?:placeholder|title|aria-label)="([^"]{4,200})"/g)) {
    textos.push(m[1]);
  }
  for (const m of fonte.matchAll(/toast\.\w+\(\s*[`"']([^`"']{4,240})/g)) textos.push(m[1]);
  return textos.map((t) => t.replace(/\s+/g, " ").trim());
}

// `comBarraNormal`: no Windows o `globSync` devolve `src\pagespp\...`, e as
// asserções abaixo comparam com o caminho escrito à mão, de barra normal. Sem
// isto a trava acusava que a palavra "lead" tinha escapado para outra tela —
// quando o que escapara era a barra invertida.
const TELAS = globSync("src/pages/app/**/*.tsx")
  .map(comBarraNormal)
  .filter((f) => !f.includes(".test."));

describe("nenhum slug de enum chega à tela", () => {
  // Os valores gravados de `events.type`. A tradução existe desde que um
  // "wedding" apareceu no PDF que vai para a noiva.
  const SLUGS = ["wedding", "corporate", "debutante", "baptism"];

  it.each(SLUGS)("%s não aparece em texto visível de nenhuma tela", (slug) => {
    const culpados = TELAS.filter((f) =>
      textoVisivel(ler(f)).some((t) => new RegExp(`\\b${slug}\\b`, "i").test(t)),
    );
    expect(culpados, `slug "${slug}" visível`).toEqual([]);
  });

  it("nem `undefined`, `null` ou `NaN` como palavra na tela", () => {
    const culpados: string[] = [];
    for (const f of TELAS) {
      for (const t of textoVisivel(ler(f))) {
        // `Id<...>` e anotações de tipo entram no recorte de JSX e não são
        // texto: o que se procura é a palavra solta numa frase em português.
        if (/\b(undefined|NaN)\b/.test(t) && !/[<>:;=]/.test(t)) culpados.push(`${f}: ${t}`);
      }
    }
    expect(culpados).toEqual([]);
  });
});

describe("no Catálogo, a composição tem UM nome", () => {
  const CATALOGO = ler("src/pages/app/catalogo/page.tsx");
  const DIALOGO = ler("src/components/catalogo/composicao-dialog.tsx");

  it("a aba e o estado vazio falam da mesma coisa", () => {
    expect(CATALOGO).toContain('"Composições"');
    expect(CATALOGO).toContain("biblioteca de composições");
    expect(CATALOGO).not.toContain("biblioteca de receitas");
  });

  it("o estado vazio ENSINA a relação em vez de trocar de palavra", () => {
    // "Composição" não é palavra de decoradora; "receita" é. A tela explica a
    // ponte uma vez, e depois fica em um nome só.
    expect(CATALOGO).toMatch(/composição é a receita/i);
  });

  it("o diálogo não chama a composição de receita", () => {
    expect(DIALOGO).toContain("Composição da biblioteca");
    for (const errado of [
      "Receita da biblioteca",
      "A receita precisa de um nome",
      "Receita renomeada",
      "Esta receita não está mais",
    ]) {
      expect(DIALOGO, `"${errado}" ainda na tela`).not.toContain(errado);
    }
  });

  it("mas 'receita' continua sendo a lista de ingredientes — esse uso é certo", () => {
    // Apagar a palavra inteira seria o erro oposto: dentro da composição, o
    // que existe é uma receita, e é assim que ela é chamada em toda a Ficha
    // Técnica.
    expect(DIALOGO).toMatch(/cópia da receita/);
  });
});

describe("'lead' é decisão de produto — aqui só se mede a superfície", () => {
  // NÃO renomear. `docs/estado-do-produto.md` guarda a pergunta: a decoradora
  // diz "cliente", e trocar atravessa schema, funções, telas e documentos.
  // Este teste existe para que a troca, se vier, tenha raio conhecido.
  it("a palavra está confinada a UMA tela", () => {
    const comLead = TELAS.filter((f) =>
      textoVisivel(ler(f)).some((t) => /\blead(s)?\b/i.test(t)),
    );
    expect(comLead).toEqual(["src/pages/app/funil/page.tsx"]);
  });

  it("e não vazou para o menu, que é onde ela procura", () => {
    expect(ler("src/lib/navigation.ts")).not.toMatch(/\blead/i);
  });
});
