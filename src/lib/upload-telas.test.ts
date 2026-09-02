import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — ANEXAR ARQUIVO ACONTECE EM UM LUGAR SÓ
//
// Os três passos (pedir URL → POST → ler o storageId) estavam copiados em sete
// telas, e as cópias já tinham divergido: algumas conferiam `res.ok`, outras
// não. A que não conferia seguia com um `storageId` indefinido, e o erro
// aparecia depois — longe da causa, parecendo problema do formulário.
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

describe("nenhuma tela repete os três passos", () => {
  it("ninguém faz POST cru para a URL de upload", () => {
    const infratores = TELAS.filter((f) => {
      const c = codigoDe(f);
      return /await generateUpload\w*\(\)/.test(c) && !c.includes("useEnvioDeArquivo");
    });
    expect(infratores).toEqual([]);
  });

  it("ninguém lê storageId da resposta por conta própria", () => {
    const infratores = TELAS.filter((f) =>
      /storageId \} = \(await res\.json\(\)\)/.test(codigoDe(f)),
    );
    expect(infratores).toEqual([]);
  });

  it("as telas que anexam arquivo usam o hook compartilhado", () => {
    const esperadas = [
      "src/pages/app/events/[id]/fotos/page.tsx",
      "src/pages/app/events/[id]/planta/page.tsx",
      "src/pages/app/events/[id]/page.tsx",
      "src/pages/app/events/[id]/fornecedores/page.tsx",
      "src/pages/app/events/[id]/_components/event-documents.tsx",
      "src/pages/app/events/[id]/_components/assembly-items-section.tsx",
      "src/pages/app/funil/_components/lead-documents.tsx",
    ];
    const semHook = esperadas.filter((f) => !codigoDe(f).includes("useEnvioDeArquivo"));
    expect(semHook).toEqual([]);
  });
});

describe("o hook fecha os buracos que as cópias tinham", () => {
  const HOOK = codigoDe("src/hooks/use-upload.ts");

  it("confere res.ok antes de acreditar na resposta", () => {
    expect(HOOK).toContain("res.ok");
  });

  it("recusa storageId ausente em vez de repassá-lo", () => {
    expect(HOOK).toMatch(/if \(!storageId\)/);
  });

  it("valida o arquivo antes de gastar rede", () => {
    expect(HOOK).toContain("validarArquivo");
  });

  it("trava clique repetido com REF, não só com estado", () => {
    // Estado do React só muda no próximo render: dois toques rápidos passariam
    // os dois pela checagem e o arquivo subiria duas vezes.
    expect(HOOK).toContain("emCurso.current");
    expect(HOOK).toMatch(/useRef\(false\)/);
  });

  it("devolve o botão mesmo quando falha", () => {
    expect(HOOK).toMatch(/finally \{[\s\S]{0,120}setEnviando\(false\)/);
  });
});

describe("câmera não fecha a porta da galeria", () => {
  const GALERIA = codigoDe("src/pages/app/events/[id]/fotos/page.tsx");

  it("existe um caminho com câmera", () => {
    expect(GALERIA).toContain('capture="environment"');
  });

  it("e o input SEM capture continua existindo", () => {
    // `capture` no mesmo input SUBSTITUI o seletor de arquivos pela câmera na
    // maioria dos navegadores de celular. Um input só significaria perder a
    // galeria — exatamente o que não pode acontecer.
    // Cada input isolado ATE o seu proprio fechamento — sem isso o trecho de
    // um pega o comentario e os atributos do seguinte, e a trava passa a ler
    // texto em vez de codigo.
    const inputs = [...GALERIA.matchAll(/<input\b[\s\S]*?\/>/g)]
      .map((m) => m[0])
      .filter((b) => b.includes('type="file"'));
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(inputs.filter((b) => b.includes("capture"))).toHaveLength(1);
    expect(inputs.filter((b) => !b.includes("capture")).length).toBeGreaterThanOrEqual(1);
  });
});

describe("sucesso não é anunciado quando nada subiu", () => {
  it("a galeria conta os envios que deram certo", () => {
    const c = codigoDe("src/pages/app/events/[id]/fotos/page.tsx");
    // Antes o "N fotos adicionadas!" saía sempre, mesmo com todas falhando.
    expect(c).toMatch(/if \(enviadas > 0\)/);
    expect(c).toContain("enviadas++");
  });
});
