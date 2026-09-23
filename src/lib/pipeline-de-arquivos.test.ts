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
      // Ver `upload-telas.test.ts`: a foto do item passou a nascer na Galeria,
      // e quem envia é o seletor. O teto e o filtro de tipo vieram junto.
      "src/components/projeto/seletor-de-foto.tsx",
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
      // A Galeria não chama mais `safeDeleteFile` DIRETO: desde que a foto
      // pode ser reaproveitada em outro evento, apagar exige antes perguntar
      // se mais alguém aponta para o arquivo. As duas regras andam juntas em
      // `apagarFotoDaGaleria`, e é por lá que ela passa.
      expect(fonte).toMatch(/safeDeleteFile|apagarFotoDaGaleria/);
    }
  });

  it("e a linha é apagada DEPOIS dos arquivos, nunca antes", () => {
    // Apagar a linha primeiro e falhar no arquivo deixaria órfão sem dono
    // conhecido — ninguém saberia mais que aquele arquivo existiu.
    //
    // A ordem mudou de endereço junto com a regra: quem apaga foto da Galeria
    // agora é `apagarFotoDaGaleria`, em lib/cascade.ts, e os DOIS caminhos (a
    // mutation e a cascata do evento) passam por ela.
    const cascade = semComentarios("convex/lib/cascade.ts");
    const fn = cascade.slice(cascade.indexOf("export async function apagarFotoDaGaleria"));
    const i = fn.indexOf("safeDeleteFile(ctx, photo.storageId)");
    const j = fn.indexOf("ctx.db.delete(photo._id)");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it("o arquivo compartilhado por outra linha NÃO é apagado", () => {
    // A regra que nasceu com o acervo: a foto de 2024 reaproveitada em 2026
    // tem duas linhas e um arquivo só. Apagar a de 2024 quebraria a de 2026 em
    // silêncio, e a decoradora só descobriria na frente da cliente.
    const cascade = semComentarios("convex/lib/cascade.ts");
    const fn = cascade.slice(cascade.indexOf("export async function apagarFotoDaGaleria"));
    const pergunta = fn.indexOf("arquivoAindaEmUso");
    const apaga = fn.indexOf("safeDeleteFile");
    expect(pergunta, "ninguém pergunta se o arquivo ainda é usado").toBeGreaterThan(-1);
    expect(apaga, "apaga antes de perguntar").toBeGreaterThan(pergunta);
  });

  it("a pergunta é feita DENTRO da conta, nunca fora dela", () => {
    // O storage do Convex não é escopado por usuário. Varrer por `storageId`
    // sem o `userId` deixaria uma conta descobrir que outra referencia o mesmo
    // arquivo — e ainda faria a exclusão de uma depender da outra.
    const cascade = semComentarios("convex/lib/cascade.ts");
    const fn = cascade.slice(cascade.indexOf("export async function arquivoAindaEmUso"));
    expect(fn).toContain('withIndex("by_user_storage"');
    expect(fn).toContain('q.eq("userId", userId)');
  });

  it("a Galeria e a cascata do evento usam a MESMA função", () => {
    // Duas implementações da mesma regra divergem, e a que divergir vai ser a
    // que apaga a foto do evento que ainda está acontecendo.
    expect(semComentarios("convex/gallery.ts")).toContain("apagarFotoDaGaleria(ctx, photo)");
    expect(semComentarios("convex/lib/cascade.ts")).toContain("apagarFotoDaGaleria(ctx, photo)");
  });
});
