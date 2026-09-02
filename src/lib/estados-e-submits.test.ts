import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — "CARREGANDO" NÃO É "VAZIO", E BOTÃO NÃO DISPARA DUAS VEZES
//
// Dois erros que não estão no código hoje e não podem voltar:
//
//  · mostrar "Nenhum item" enquanto a consulta ainda está vindo. No Convex uma
//    query em andamento é `undefined`, e `(x ?? []).length === 0` transforma
//    isso num "está vazio" que é mentira — pior num 4G de galpão, onde a
//    espera é longa o bastante para a pessoa acreditar e ir embora.
//
//  · botão de criar que aceita dois toques. Numa rede lenta o primeiro toque
//    não dá retorno visível, e a pessoa toca de novo.
// ─────────────────────────────────────────────────────────────────────────────

const TELAS = execSync(
  "find src/pages src/components -name '*.tsx' -not -name '*.test.tsx'",
  { encoding: "utf-8" },
).trim().split("\n").filter(Boolean);

const codigoDe = (f: string) =>
  readFileSync(f, "utf-8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

describe("carregando nunca é exibido como vazio", () => {
  it("ninguém decide 'está vazio' a partir de um `?? []`", () => {
    // `(x ?? []).length === 0` é verdadeiro tanto para vazio quanto para
    // "ainda não chegou" — e as duas coisas pedem telas diferentes.
    const infratores = TELAS.filter((f) =>
      /\?\?\s*\[\]\s*\)\s*\.length\s*===\s*0/.test(codigoDe(f)),
    );
    expect(infratores).toEqual([]);
  });

  it("ninguém junta `!lista` com `lista.length === 0` na mesma condição", () => {
    // `!x` é verdadeiro enquanto a consulta está vindo. Somado a
    // `x.length === 0`, "carregando" e "vazio" viram a mesma tela — e a mensagem
    // que aparece é sempre a de vazio. Foi o que o sino fazia: quem abria num
    // 4G lento lia "Você está em dia!" antes de a lista chegar.
    const infratores = TELAS.filter((f) =>
      /!(\w+)\s*\|\|\s*\1\.length === 0/.test(codigoDe(f)),
    );
    expect(infratores).toEqual([]);
  });

  it("o sino distingue os dois estados", () => {
    const c = codigoDe("src/components/notification-center.tsx");
    expect(c).toContain("notifications === undefined");
  });
});

describe("botão de ação não dispara duas vezes", () => {
  it("todo <Button type=\"submit\"> tem disabled", () => {
    const infratores: string[] = [];
    for (const f of TELAS) {
      for (const m of codigoDe(f).matchAll(/<Button\b[^>]*type="submit"[^>]*>/gs)) {
        if (!m[0].includes("disabled")) infratores.push(`${f}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(infratores).toEqual([]);
  });

  it("o botão que grava na biblioteca trava enquanto grava", () => {
    // A mutation faz `insert`, não upsert: dois toques criavam DUAS
    // composições iguais na biblioteca central.
    const c = codigoDe("src/pages/app/events/[id]/ficha-tecnica/_components/receita-dialog.tsx");
    expect(c).toContain("salvandoNaBiblioteca");
    expect(c).toMatch(/disabled=\{salvandoNaBiblioteca\}/);
  });

  it("o envio de arquivo trava por ref, não só por estado", () => {
    expect(codigoDe("src/hooks/use-upload.ts")).toContain("emCurso.current");
  });
});

describe("o botão volta quando dá erro", () => {
  it.each([
    "src/hooks/use-upload.ts",
    "src/pages/app/events/[id]/ficha-tecnica/_components/receita-dialog.tsx",
    "src/components/ajuste-de-acervo-dialog.tsx",
  ])("%s desliga o estado de envio em finally", (arquivo) => {
    // Sem `finally`, uma falha deixaria o botão desabilitado para sempre e a
    // pessoa teria de recarregar a página para tentar de novo.
    expect(codigoDe(arquivo)).toMatch(/finally/);
  });
});
