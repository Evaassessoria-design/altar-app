import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// QUEM BAIXA O ORIGINAL, E POR QUÊ
//
// Três superfícies desenham foto em miniatura e NENHUMA precisa do arquivo de
// 15 MB. Uma quarta — o visualizador em tela cheia — precisa, e é a única.
//
// A regra de qual URL usar é UMA função (`urlDeExibicao`). Três cópias dela
// divergiriam: uma tela passaria a usar a versão leve e outra continuaria
// baixando o original, sem ninguém notar até a conta de banda.
// ═════════════════════════════════════════════════════════════════════════════

const semComentarios = (p: string) =>
  readFileSync(p, "utf-8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

const GALERIA = semComentarios("src/pages/app/events/[id]/fotos/page.tsx");
const PROJETO = semComentarios("src/pages/app/events/[id]/projeto/page.tsx");
const PRATELEIRA = semComentarios("src/components/projeto/prateleira-de-fotos.tsx");
// A quarta: escolher uma foto da Galeria para um item de montagem. Nasceu
// depois desta trava e entra nela no mesmo gesto — uma grade de trinta
// miniaturas baixando trinta originais é o defeito que esta suíte existe para
// impedir, e a tela é usada no galpão, no 4G.
const ESCOLHER = semComentarios("src/components/montagem/escolher-da-galeria.tsx");

describe("as superfícies de miniatura usam a versão leve", () => {
  it.each([
    ["a grade da Galeria", () => GALERIA],
    ["o Projeto Visual", () => PROJETO],
    ["a prateleira", () => PRATELEIRA],
    ["o seletor de foto do item", () => ESCOLHER],
  ])("%s passa por `urlDeExibicao`", (_nome, fonte) => {
    expect(fonte()).toContain("urlDeExibicao");
    expect(fonte()).toContain("@/lib/imagem-reduzida.ts");
  });

  it("a grade não desenha `photo.url` direto", () => {
    // Era o defeito: quadrado de 138 px baixando o arquivo inteiro.
    expect(GALERIA).not.toContain("src={photo.url");
  });

  it("a prateleira não desenha `foto.url` direto", () => {
    expect(PRATELEIRA).not.toContain("src={foto.url");
  });

  it("a capa do projeto também prefere a versão leve", () => {
    expect(PROJETO).toContain("urlDeExibicao(capa)");
  });
});

describe("a capa continua tendo UM ponteiro só", () => {
  it("nenhum segundo campo de capa foi criado", () => {
    const schema = readFileSync("convex/schema.ts", "utf-8");
    // Conta DECLARAÇÃO de campo, não menção ao nome. A versão anterior contava
    // qualquer ocorrência, e passou a acusar quando um comentário de outra
    // tabela citou `events.coverPhotoId` como precedente do ponteiro de foto —
    // que é exatamente a documentação que este repositório quer. O que o teste
    // protege é a existência de um SEGUNDO ponteiro de capa, e é isso que ele
    // mede agora.
    expect((schema.match(/coverPhotoId\s*:/g) ?? []).length).toBe(1);
    for (const inventado of ["coverPreviewId", "coverStorageId", "coverPhotoStorageId"]) {
      expect(schema, `nasceu um segundo ponteiro: ${inventado}`).not.toContain(inventado);
    }
  });

  it("o projeto resolve a capa pela foto, e a foto escolhe o arquivo", () => {
    expect(PROJETO).toContain("f._id === event.coverPhotoId");
    expect(PROJETO).toContain("urlDeExibicao(capa)");
  });
});

describe("o visualizador em tela cheia é a exceção, e é deliberada", () => {
  it("ele usa o ORIGINAL", () => {
    // Uma imagem por vez, ampliada com intenção: é onde o arquivo inteiro se
    // justifica. Trocar por versão leve aqui seria degradar o que ela abriu
    // para olhar de perto.
    expect(GALERIA).toContain("src={lightboxPhoto.url");
  });

  it("e o download entrega o arquivo que ela enviou", () => {
    expect(GALERIA).toContain("href={lightboxPhoto.url");
    expect(GALERIA).toContain("download={lightboxPhoto.filename}");
  });
});

describe("o envio nunca depende da versão leve", () => {
  it("o original sobe PRIMEIRO, e sozinho", () => {
    const i = GALERIA.indexOf("const r = await enviar(file)");
    const j = GALERIA.indexOf("gerarPreview(file)");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it("falha ao gerar ou ao enviar a versão leve não impede a foto", () => {
    // Nenhum `return` nem `continue` entre a geração e o `savePhoto`: o que
    // acontecer com o preview não pode abortar o envio da foto.
    const bloco = GALERIA.slice(
      GALERIA.indexOf("gerarPreview(file)"),
      GALERIA.indexOf("await savePhoto({"),
    );
    expect(bloco).not.toContain("return");
    expect(bloco).not.toContain("continue");
    expect(bloco).not.toContain("throw");
  });

  it("e o `savePhoto` recebe `undefined` quando não houve versão leve", () => {
    expect(GALERIA).toMatch(/let previewStorageId: Id<"_storage"> \| undefined;/);
    expect(GALERIA).toContain("previewStorageId,");
  });
});
