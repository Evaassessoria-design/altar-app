import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CATEGORIAS_COM_META,
  ERRO_CATEGORIA_OBRIGATORIA,
  ICONE_PADRAO,
  iconeDaCategoria,
  PLACEHOLDER_CATEGORIA,
  templateDaCategoria,
} from "./supplier-metadata";
import {
  CATEGORIAS_DA_DECORACAO,
  CATEGORIAS_DO_EVENTO,
  ehEscopoDaDecoradora,
  TODAS_AS_CATEGORIAS,
} from "@/convex/lib/escopoDecoradora.ts";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — uma fonte só para categorias de fornecedor.
//
// A tela de fornecedores do evento mantinha a PRÓPRIA lista, com ícone e
// roteiro operacional: a terceira cópia do mesmo conceito. E aquela lista tinha
// só fornecedores do CLIENTE — assessoria, local, buffet, bar, doces, som. A
// decoradora não conseguia cadastrar o fornecedor de flores ali senão como
// "Personalizado". Pior: a categoria nascia "assessoria".
// ─────────────────────────────────────────────────────────────────────────────

const TELA_EVENTO = readFileSync(
  "src/pages/app/events/[id]/fornecedores/page.tsx",
  "utf-8",
);
const TELA_CATALOGO = readFileSync("src/pages/app/fornecedores/page.tsx", "utf-8");

describe("existe UMA fonte conceitual de categorias", () => {
  it("a lista enriquecida é DERIVADA da central, não escrita à mão", () => {
    expect(CATEGORIAS_COM_META.map((c) => c.slug)).toEqual(
      TODAS_AS_CATEGORIAS.map((c) => c.slug),
    );
    expect(CATEGORIAS_COM_META.map((c) => c.label)).toEqual(
      TODAS_AS_CATEGORIAS.map((c) => c.label),
    );
  });

  it("nenhuma tela declara lista própria de categorias", () => {
    for (const [nome, fonte] of [
      ["evento", TELA_EVENTO],
      ["catálogo", TELA_CATALOGO],
    ] as const) {
      expect(fonte, nome).not.toMatch(/const CATEGORIES:\s*CategoryConfig\[\]/);
      expect(fonte, nome).not.toContain('slug: "buffet"');
      // Vale importar direto da central OU pelos dois módulos que só a
      // reexportam/enriquecem — o que não vale é declarar lista própria.
      expect(fonte, nome).toMatch(
        /from "@\/convex\/lib\/escopoDecoradora\.ts"|from "@\/lib\/supplier-(metadata|categories)\.ts"/,
      );
    }
  });

  it("supplier-categories é só uma ponte para a central", () => {
    // Se este arquivo voltasse a declarar categorias, o teste acima passaria
    // e a duplicação estaria de volta por outra porta.
    const ponte = readFileSync("src/lib/supplier-categories.ts", "utf-8");
    expect(ponte).toContain('from "@/convex/lib/escopoDecoradora.ts"');
    expect(ponte).not.toMatch(/slug:\s*"/);
  });

  it("uma categoria nova aparece sem editar mais nenhum arquivo", () => {
    // Sem metadado, ela ainda funciona: ícone padrão e roteiro vazio.
    expect(iconeDaCategoria("categoria_que_nao_existe")).toBe(ICONE_PADRAO);
    expect(templateDaCategoria("categoria_que_nao_existe")).toEqual([]);
    expect(iconeDaCategoria(undefined)).toBe(ICONE_PADRAO);
  });

  it("toda categoria central tem ícone concreto — nunca undefined", () => {
    // Um `icon: undefined` já derrubou a barra lateral inteira antes.
    for (const c of CATEGORIAS_COM_META) {
      expect(c.icone, c.slug).toBeTruthy();
      expect(Array.isArray(c.template), c.slug).toBe(true);
    }
  });

  it("os roteiros operacionais foram preservados", () => {
    // A migração não podia perder o conteúdo que a decoradora já usa.
    expect(templateDaCategoria("buffet").length).toBeGreaterThan(10);
    expect(templateDaCategoria("buffet").map((t) => t.label)).toContain("Pontos de energia");
    expect(templateDaCategoria("som_ilum").map((t) => t.label)).toContain("Gerador");
  });
});

describe("a decoradora finalmente cadastra a operação dela", () => {
  it("as categorias da decoração estão disponíveis na tela do evento", () => {
    const slugs = CATEGORIAS_COM_META.map((c) => c.slug);
    for (const essencial of ["flores", "mobiliario", "iluminacao_decorativa", "transporte"]) {
      expect(slugs).toContain(essencial);
    }
  });

  it("os dois grupos aparecem separados no seletor", () => {
    expect(TELA_EVENTO).toContain('optgroup label="Da sua operação"');
    expect(TELA_EVENTO).toContain('optgroup label="Do evento (contexto)"');
  });
});

describe("fornecedor não nasce como Assessoria", () => {
  it("o padrão foi removido do código", () => {
    expect(TELA_EVENTO).not.toContain('?? "assessoria"');
    expect(TELA_EVENTO).toContain('initial?.category ?? presetCategory ?? ""');
  });

  it("o campo começa vazio, com o placeholder pedido", () => {
    expect(PLACEHOLDER_CATEGORIA).toBe("Selecione a categoria");
    expect(TELA_EVENTO).toContain('<option value="">{PLACEHOLDER_CATEGORIA}</option>');
  });

  it("salvar sem categoria é recusado ANTES de gravar", () => {
    const submit = TELA_EVENTO.slice(TELA_EVENTO.indexOf("const submit = async"));
    const guarda = submit.indexOf("if (!finalCategory)");
    const grava = submit.indexOf("await onSubmit(");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(grava);
  });

  it("o erro aparece NO CAMPO, não só num aviso flutuante", () => {
    expect(TELA_EVENTO).toContain("setErroCategoria(true)");
    expect(TELA_EVENTO).toContain('id="fornecedor-categoria-erro"');
    expect(TELA_EVENTO).toContain("aria-invalid={erroCategoria}");
    expect(TELA_EVENTO).toContain("border-destructive");
    expect(ERRO_CATEGORIA_OBRIGATORIA).toContain("categoria");
  });

  it("fornecedor EXISTENTE continua abrindo com a categoria salva", () => {
    // `initial?.category` vem primeiro na cascata: editar não perde o dado,
    // nem para uma categoria que saiu da lista (vira "Personalizado…").
    expect(TELA_EVENTO).toContain('initial?.category ?? presetCategory ?? ""');
    expect(TELA_EVENTO).toContain("initialCategory ? (isKnown ? initialCategory : \"outro\") : \"\"");
  });

  it('"Assessoria" continua existindo — como contexto, não como padrão', () => {
    expect(CATEGORIAS_DO_EVENTO.map((c) => c.slug)).toContain("assessoria");
    expect(CATEGORIAS_DA_DECORACAO.map((c) => c.slug)).not.toContain("assessoria");
    expect(ehEscopoDaDecoradora("assessoria")).toBe(false);
  });
});
