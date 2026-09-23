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
    // Olha o CÓDIGO, não os comentários: o comentário da tela explica o que a
    // Galeria faz ao excluir, e citar o nome não é chamar a função.
    for (const proibido of ["savePhoto", "deletePhoto", "generateUploadUrl"]) {
      expect(CODIGO, `a tela chama ${proibido}`).not.toContain(proibido);
    }
  });

  it("consultas FIXAS e nomeadas, nenhuma por ambiente", () => {
    // Uma consulta por ambiente seria N+1: dez ambientes, dez assinaturas
    // reativas para desenhar a mesma tela.
    //
    // Contar chamadas era proxy frágil — o número sobe por motivo legítimo e
    // o teste vira obstáculo. O que importa é QUAIS consultas existem: uma
    // lista fixa, cada uma uma vez. Acrescentar consulta passa por aqui, e é
    // para passar por aqui.
    const chamadas = [...TELA.matchAll(/useQuery\(\s*(api\.[\w.]+)/g)].map((m) => m[1]);
    expect(chamadas.sort()).toEqual([
      "api.assemblyItems.listByEvent",
      "api.briefing.getBriefing",
      "api.events.get",
      // As flores e materiais do projeto. Consulta PRÓPRIA, e não um recorte
      // de `fichaTecnica.getFicha`: aquela carrega custo estimado, margem,
      // cobertura e compras vinculadas, e esta é a tela que ela vira para a
      // noiva. A fronteira mora na transformação, nunca na renderização.
      "api.fichaTecnica.materiaisParaOProjeto",
      "api.gallery.listPhotos",
      "api.layoutRenders.listByEvent",
    ]);
    // Cada uma UMA vez: repetição é o primeiro sintoma de consulta dentro de
    // laço.
    expect(new Set(chamadas).size).toBe(chamadas.length);
  });

  it("as flores chegam pela consulta da CLIENTE, nunca pela ficha consolidada", () => {
    // `getFicha` devolve `custoEstimado`, `margemPercentual`, `cobertura` e
    // `comprasVinculadas`. Esta é a tela que a decoradora vira para a noiva:
    // trocar a consulta por aquela mandaria a margem da empresa pela rede e
    // deixaria a proteção dependendo de ninguém escrever `...linha` na tela.
    expect(CODIGO, "a tela do projeto passou a ler a ficha consolidada").not.toContain(
      "fichaTecnica.getFicha",
    );
    expect(CODIGO).toContain("fichaTecnica.materiaisParaOProjeto");
  });

  it("e a seção não imprime quantidade — número de compra não é promessa", () => {
    // "185 hastes" carrega a margem de segurança (flor quebra no transporte).
    // Impresso para a cliente, vira compromisso sobre um número que existe
    // para proteger a execução.
    const i = CODIGO.indexOf("Flores e materiais");
    expect(i, "a seção de flores sumiu da tela").toBeGreaterThan(-1);
    const secao = CODIGO.slice(i, CODIGO.indexOf("</section>", i));
    for (const proibido of ["quantidade", "necessario", "custo", "margem"]) {
      expect(secao.toLowerCase(), `a seção mostra ${proibido} para a cliente`).not.toContain(
        proibido,
      );
    }
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
  it("não escolhe foto de capa — só respeita a que ELA escolheu", () => {
    // "A primeira foto" como capa é uma regra inventada em silêncio. Agora
    // existe como escolher (na Galeria), e a tela continua sem escolher: ela
    // LÊ `coverPhotoId` e procura essa foto pelo id.
    expect(CODIGO).not.toMatch(/(fotos|referencias|contratadas|execucao)\s*\[0\]/);
    expect(CODIGO).toContain("event.coverPhotoId");
    expect(CODIGO).toContain("f._id === event.coverPhotoId");
  });

  it("e sem capa escolhida a abertura continua tipográfica", () => {
    // Nenhum `<img` de capa fora da condição: sem foto, nenhum espaço vazio
    // pedindo imagem.
    expect(CODIGO).toMatch(/\{\(capa \|\| capaPendente\) && \(/);
    expect(CODIGO).toContain("Projeto visual");
    // O espaço reservado vale só ENQUANTO as fotos não chegaram. Um ponteiro
    // que sobreviveu a uma foto apagada não pode virar caixa cinza eterna.
    expect(CODIGO).toContain("fotos === undefined");
  });

  it("o texto da capa nunca fica POR CIMA da foto", () => {
    // Texto sobre foto depende do que a foto tem embaixo — céu claro, vestido
    // branco. `brand.ts` já registra a lição: fundo claro com texto claro é
    // pior do que não personalizar. Aqui não há contraste a medir porque não
    // há sobreposição.
    const bloco = CODIGO.slice(CODIGO.indexOf("{capa?.url &&"), CODIGO.indexOf("</header>"));
    for (const proibido of ["absolute", "gradient", "inset-0"]) {
      expect(bloco, `a capa sobrepõe texto: ${proibido}`).not.toContain(proibido);
    }
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

describe("o conceito vem do Questionário, e some quando não existe", () => {
  it("a tela não lê campo do briefing por conta própria", () => {
    // A linha do briefing traz contato do espaço, seguro e pagamento. Quem
    // escolhe os três campos do conceito é `conceito-do-evento.ts`.
    expect(CODIGO).toContain("conceitoDoEvento(briefing)");
    for (const interno of ["decorStyle", "colorPalette", "atmosphereDescription", "venueContact"]) {
      expect(CODIGO, `a tela lê ${interno} direto`).not.toContain(interno);
    }
  });

  it("seção inteira desaparece quando não há conceito", () => {
    expect(CODIGO).toMatch(/\{conceito && \(/);
  });

  it("e nenhuma cor é inferida da paleta", () => {
    const i = CODIGO.indexOf("{conceito && (");
    const bloco = CODIGO.slice(i, i + 900);
    expect(bloco).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(bloco).not.toContain("backgroundColor");
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
      expect(CODIGO).not.toContain(proibido);
    }
  });
});
