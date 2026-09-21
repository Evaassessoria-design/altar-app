import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// A TELA ONDE SE VÊ O CASAMENTO
//
// A lacuna que esta rodada atacou, escrita no relatório anterior:
//
//   "O ALTAR organiza o evento, mas ainda não existe uma tela onde a
//    decoradora abre o casamento e consegue VER como ele deve ficar."
//
// A correção NÃO foi uma tela nova. O "Projeto de decoração" já era a visão
// por ambiente — faltavam nele as FOTOS. Criar um "Projeto Visual" ao lado
// seria a armadilha que este repositório já pagou duas vezes: cinco mapas de
// tipo de evento, três nomes para composição. Duas telas para o mesmo
// conceito divergem na primeira semana.
// ═════════════════════════════════════════════════════════════════════════════

const TELA = readFileSync("src/pages/app/events/[id]/projeto/page.tsx", "utf-8");

/**
 * O código sem os comentários.
 *
 * Aqui a explicação fala justamente do que o código NÃO faz — "não escolhe
 * capa", "não marca coordenada" — e procurar a palavra no arquivo inteiro
 * acusaria a própria explicação. É a mesma armadilha que o teste de audiência
 * dos PDFs já pagou com a palavra "margem".
 */
const CODIGO = TELA.split("\n")
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");
const PRATELEIRA = readFileSync("src/components/projeto/prateleira-de-fotos.tsx", "utf-8");
const EVENTO = readFileSync("src/pages/app/events/[id]/page.tsx", "utf-8");
const ROTAS = readFileSync("src/App.tsx", "utf-8");

describe("não nasceu tela nova", () => {
  it("a rota continua sendo uma só", () => {
    expect((ROTAS.match(/\/eventos\/:id\/projeto/g) ?? []).length).toBe(1);
    expect(ROTAS).not.toContain("projeto-visual");
  });

  it("e a entrada no evento continua sendo um botão só", () => {
    expect((EVENTO.match(/\$\{id\}\/projeto`/g) ?? []).length).toBe(1);
  });

  it("o nome que a usuária lê é 'Projeto visual'", () => {
    expect(EVENTO).toContain("Projeto visual");
    expect(EVENTO).not.toContain("Projeto de decoração");
  });
});

describe("a tela LÊ a galeria, não guarda imagem", () => {
  it("consome as fotos da galeria e a planta que já existem", () => {
    expect(TELA).toContain("api.gallery.listPhotos");
    expect(TELA).toContain("api.layoutRenders.listByEvent");
    expect(TELA).toContain("api.assemblyItems.listByEvent");
  });

  it("não sobe nem apaga foto — a Galeria é a biblioteca", () => {
    for (const proibido of ["savePhoto", "deletePhoto", "generateUploadUrl"]) {
      expect(TELA, `a tela chama ${proibido}`).not.toContain(proibido);
    }
  });

  it("quatro consultas fixas, nenhuma por ambiente", () => {
    // Uma consulta por ambiente seria N+1: dez ambientes, dez assinaturas
    // reativas para desenhar a mesma tela.
    expect((TELA.match(/useQuery\(/g) ?? []).length).toBe(4);
  });
});

describe("inspiração, decisão e resultado nunca dividem a mesma fileira", () => {
  it("cada prateleira diz o que é ANTES das imagens", () => {
    for (const rotulo of ['titulo="Inspiração"', 'titulo="Contratado"', 'titulo="Como ficou"']) {
      expect(TELA, `falta a prateleira ${rotulo}`).toContain(rotulo);
    }
    expect(TELA).toContain('titulo="Ficou de fora"');
  });

  it("a prateleira recusa a si mesma quando não há foto", () => {
    // Um título "Inspiração" sobre o nada é pior do que a ausência do bloco.
    expect(PRATELEIRA).toMatch(/if \(fotos\.length === 0\) return null;/);
  });

  it("a inspiração diz que não é obrigação de montagem", () => {
    expect(TELA).toMatch(/não é obrigação de montagem/i);
  });
});

describe("a tela não inventa o que não sabe", () => {
  it("não escolhe foto de capa", () => {
    // "A primeira foto" como capa é uma regra inventada em silêncio, e a capa
    // de um casamento é decisão dela. Enquanto não houver como ESCOLHER, a
    // tela não escolhe.
    // O que não pode existir é o ACESSO — `[0]` sobre uma lista de fotos.
    expect(CODIGO).not.toMatch(/(fotos|referencias|contratadas|execucao)\s*\[0\]/);
  });

  it("mostra a planta, e não deixa marcar posição nela", () => {
    expect(TELA).toContain("planta?.outputUrl");
    for (const proibido of ["onDrag", "onMouseDown", "draggable", "onPointerDown"]) {
      expect(CODIGO, `a planta virou editor: ${proibido}`).not.toContain(proibido);
    }
  });

  it("a foto sem ambiente aparece como referência do evento, e não some", () => {
    expect(TELA).toContain("semAmbiente");
    expect(TELA).toContain("Referências do evento");
  });
});

describe("imagem é o risco desta tela", () => {
  it("toda foto carrega preguiçosa", () => {
    const imgs = PRATELEIRA.match(/<img\b[\s\S]*?\/>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) expect(img).toContain('loading="lazy"');
    // A planta também: é a maior imagem da tela.
    expect(TELA.slice(TELA.indexOf("planta?.outputUrl"))).toContain('loading="lazy"');
  });

  it("cada prateleira tem teto, e diz quantas ficaram de fora", () => {
    // Setenta fotos desenhadas de uma vez são setenta ORIGINAIS baixados — o
    // ALTAR ainda não gera miniatura no envio.
    expect(PRATELEIRA).toMatch(/const LIMITE = \d+;/);
    expect(PRATELEIRA).toContain("na Galeria");
  });

  it("e a tela avisa quando o evento tem muita foto", () => {
    expect(TELA).toMatch(/totalFotos > \d+/);
  });
});

describe("o estado vazio ensina os dois caminhos", () => {
  it("não manda para lugar nenhum inexistente", () => {
    const i = TELA.indexOf("O projeto ainda não tem nada");
    const bloco = TELA.slice(i, i + 1400);
    expect(bloco).toContain("Enviar referências");
    expect(bloco).toContain("Abrir o Questionário");
    // `galeria` é `/eventos/:id/fotos`, declarado uma vez no topo da tela.
    expect(bloco).toContain("{galeria}");
    expect(bloco).toContain("/briefing");
    expect(TELA).toMatch(/const galeria = `\/eventos\/\$\{id\}\/fotos`;/);
  });

  it("e só aparece quando não há NEM foto NEM item", () => {
    // Um evento com vinte referências e nenhum item de montagem tem muito o
    // que mostrar — o vazio de antes olhava só os itens.
    expect(TELA).toMatch(/const vazio = totalItens === 0 && totalFotos === 0;/);
  });
});

describe("o caminho até a Galeria é direto, e continua sendo só um caminho", () => {
  const GALERIA = readFileSync("src/pages/app/events/[id]/fotos/page.tsx", "utf-8");

  it("o bloco do ambiente leva à galeria JÁ filtrada nele", () => {
    // "+12 na Galeria" que abre setenta fotos faz a decoradora procurar o que
    // a tela acabou de mostrar organizado.
    expect(TELA).toContain("galeriaDo(ambiente.label)");
    expect(TELA).toMatch(/\?ambiente=\$\{encodeURIComponent\(ambiente\)\}/);
  });

  it("e o filtro é o MESMO do servidor, não um recorte da página carregada", () => {
    // Filtrar a lista já baixada faria a contagem mentir assim que houvesse
    // teto de paginação. A galeria manda `ambiente` na consulta.
    expect(GALERIA).toContain("ambiente: ambienteFiltro");
    expect(GALERIA).toContain('searchParams.get("ambiente")');
  });

  it("o servidor compara pela chave canônica, não por toLowerCase", () => {
    const g = readFileSync("convex/gallery.ts", "utf-8");
    expect(g).toContain("chaveDoAmbiente(p.ambiente) === alvo");
    expect(g).not.toContain('(p.ambiente ?? "").trim().toLowerCase()');
  });

  it("a tela DIZ quantas fotos ainda não se classificaram", () => {
    expect(TELA).toContain("const semClassificacao =");
    // Inclui as que já têm ambiente: situada não é classificada.
    expect(TELA).toMatch(/projeto\.ambientes\.reduce\(\(n, a\) => n \+ a\.semClassificacao\.length, 0\)/);
  });

  it("foto com ambiente e sem classificação NÃO fica invisível", () => {
    // Era o defeito: caía no bloco certo e não era desenhada em prateleira
    // nenhuma, e o bloco podia aparecer vazio.
    const i = TELA.indexOf('titulo="Ficou de fora"');
    expect(TELA.slice(i)).toContain('titulo="Ainda sem classificação"');
    expect(TELA).toContain("fotos={ambiente.semClassificacao}");
  });

  it("e mesmo assim a tela continua sem editar foto", () => {
    // O convite leva para a Galeria. Não existe segundo sistema de
    // classificação, nem upload, nem exclusão daqui.
    for (const proibido of [
      "updatePhoto",
      "savePhoto",
      "deletePhoto",
      "generateUploadUrl",
      "setScopeValue",
    ]) {
      expect(TELA).not.toContain(proibido);
    }
  });
});
