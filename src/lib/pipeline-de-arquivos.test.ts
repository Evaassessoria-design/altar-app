import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// A VERSÃO LEVE MORA EM UM LUGAR SÓ
//
// `useEnvioDeArquivo` é compartilhado por OITO telas — galeria, documentos do
// evento, documentos do lead, planta, item de montagem, logo do fornecedor e
// logo da empresa. A rodada da versão leve mexeu no fluxo da galeria; estes
// testes provam que não vazou para as outras.
//
// Documento não vira JPEG. Contrato não ganha miniatura. Logo não sobe duas
// vezes.
// ═════════════════════════════════════════════════════════════════════════════

const semComentarios = (p: string) =>
  readFileSync(p, "utf-8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

const CONSUMIDORES = [
  "src/pages/app/funil/_components/lead-documents.tsx",
  "src/pages/app/events/[id]/_components/assembly-items-section.tsx",
  "src/pages/app/events/[id]/_components/event-documents.tsx",
  "src/pages/app/events/[id]/page.tsx",
  "src/pages/app/events/[id]/planta/page.tsx",
  "src/pages/app/events/[id]/fornecedores/page.tsx",
  "src/pages/app/configuracoes/page.tsx",
];

describe("a versão leve não vazou para os outros uploads", () => {
  it.each(CONSUMIDORES)("%s não gera preview", (arquivo) => {
    const fonte = semComentarios(arquivo);
    expect(fonte, "esta tela passou a gerar versão leve sem querer").not.toContain(
      "gerarPreview",
    );
    expect(fonte).not.toContain("previewStorageId");
  });

  it("só a Galeria gera — e é a única que adotou", () => {
    const galeria = semComentarios("src/pages/app/events/[id]/fotos/page.tsx");
    expect(galeria).toContain("gerarPreview(file)");
  });
});

describe("o hook compartilhado continua igual", () => {
  const HOOK = semComentarios("src/hooks/use-upload.ts");

  it("não conhece imagem, preview nem canvas", () => {
    for (const proibido of ["gerarPreview", "canvas", "createImageBitmap", "preview"]) {
      expect(HOOK, `o hook virou específico de imagem: ${proibido}`).not.toContain(proibido);
    }
  });

  it("continua validando tamanho antes de gastar rede", () => {
    expect(HOOK).toContain("validarArquivo(arquivo");
    const i = HOOK.indexOf("validarArquivo(arquivo");
    const j = HOOK.indexOf("gerarUrlDeUpload()");
    expect(i, "a validação passou a acontecer depois do upload").toBeLessThan(j);
  });

  it("e continua com a trava de clique repetido", () => {
    // Ref, não estado: estado do React só muda no próximo render, e dois
    // toques rápidos passariam os dois pela checagem.
    expect(HOOK).toContain("emCurso.current");
    expect(HOOK).toContain("useRef");
  });

  it("o tipo MIME enviado continua sendo o do arquivo", () => {
    expect(HOOK).toContain('arquivo.type || "application/octet-stream"');
  });
});

describe("cada tela mantém o próprio teto e os próprios tipos", () => {
  it("documento continua documento", () => {
    for (const p of [
      "src/pages/app/funil/_components/lead-documents.tsx",
      "src/pages/app/events/[id]/_components/event-documents.tsx",
      "src/pages/app/events/[id]/page.tsx",
    ]) {
      expect(semComentarios(p)).toContain('tipo: "documento"');
    }
  });

  it("e imagem continua imagem, com o filtro de tipo", () => {
    for (const p of [
      "src/pages/app/events/[id]/_components/assembly-items-section.tsx",
      "src/pages/app/events/[id]/planta/page.tsx",
      "src/pages/app/events/[id]/fornecedores/page.tsx",
      "src/pages/app/configuracoes/page.tsx",
    ]) {
      const fonte = semComentarios(p);
      expect(fonte).toContain('tipo: "imagem"');
      expect(fonte).toContain('aceitos: ["image/"]');
    }
  });
});

describe("a exclusão de arquivo passa pela regra única", () => {
  it("nenhum `ctx.storage.delete` solto sobrou nas exclusões de linha", () => {
    // `lib/cascade.ts` escreveu a regra e exportou `safeDeleteFile` "porque a
    // regra vale fora da cascata também". Três arquivos não a seguiam, e o
    // Convex LANÇA ao apagar arquivo inexistente — abortando a mutation e
    // deixando a linha no banco.
    for (const p of ["convex/gallery.ts", "convex/assemblyItems.ts", "convex/contracts.ts"]) {
      const fonte = semComentarios(p);
      expect(fonte, `${p} apaga arquivo sem proteção`).not.toContain("ctx.storage.delete");
      expect(fonte).toContain("safeDeleteFile");
    }
  });

  it("e a linha é apagada DEPOIS dos arquivos, nunca antes", () => {
    // Apagar a linha primeiro e falhar no arquivo deixaria órfão sem dono
    // conhecido — ninguém saberia mais que aquele arquivo existiu.
    const gallery = semComentarios("convex/gallery.ts");
    const i = gallery.indexOf("safeDeleteFile(ctx, photo.storageId)");
    const j = gallery.indexOf("ctx.db.delete(args.id)");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});
