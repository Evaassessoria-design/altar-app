import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// ESCOLHER A CAPA ACONTECE NA GALERIA
//
// É onde ela olha foto por foto — o único momento em que dá para decidir qual
// abre o evento. O Projeto Visual continua sendo LEITURA: se a escolha
// morasse lá, a tela que ela vira para a cliente viraria editor.
// ═════════════════════════════════════════════════════════════════════════════

const GALERIA = readFileSync("src/pages/app/events/[id]/fotos/page.tsx", "utf-8");
const CODIGO = GALERIA.split("\n")
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

describe("as quatro operações existem", () => {
  it("definir e trocar usam a mesma ação", () => {
    expect(CODIGO).toContain("Usar como capa");
    expect(CODIGO).toContain("definirCapa(editingCaption)");
  });

  it("remover existe, e manda `null` — não `undefined`", () => {
    // `undefined` some no transporte do Convex: a capa ficaria e a tela diria
    // "removida". É a convenção de lib/limparCampos.ts.
    expect(CODIGO).toContain("Remover capa");
    expect(CODIGO).toContain("definirCapa(null)");
    expect(CODIGO).toMatch(/coverPhotoId:\s*photoId/);
  });

  it("dá para ver QUAL é a capa sem abrir foto por foto", () => {
    expect(CODIGO).toContain("capaAtual === photo._id");
  });

  it("a capa sai do evento, não de um estado local", () => {
    // Estado local mentiria depois de um F5 e divergiria entre abas.
    expect(CODIGO).toContain("event?.coverPhotoId");
  });
});

describe("a Galeria não virou editor de projeto", () => {
  it("nenhum item de montagem é tocado aqui", () => {
    for (const proibido of ["assemblyItems", "layoutRenders", "agruparPorAmbiente"]) {
      expect(CODIGO, `a Galeria mexe em ${proibido}`).not.toContain(proibido);
    }
  });

  it("a única escrita em `events` é a capa", () => {
    const chamadas = [...CODIGO.matchAll(/atualizarEvento\(\{([\s\S]{0,120}?)\}\)/g)].map(
      (m) => m[1],
    );
    expect(chamadas.length).toBeGreaterThan(0);
    for (const args of chamadas) {
      expect(args).toContain("coverPhotoId");
      for (const outro of ["name:", "date:", "status:", "budget:", "clientName:"]) {
        expect(args, `a Galeria edita ${outro}`).not.toContain(outro);
      }
    }
  });

  it("a capa é ação imediata, fora do Salvar da legenda", () => {
    // Um "Salvar" que grava em duas tabelas deixa metade salva quando a outra
    // metade falha.
    const i = CODIGO.indexOf("handleSaveCaption");
    const corpo = CODIGO.slice(i, CODIGO.indexOf("}", i + 400));
    expect(corpo).not.toContain("coverPhotoId");
  });
});
