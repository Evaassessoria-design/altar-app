import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// REFERÊNCIA ESTÉTICA NÃO É ITEM CONTRATADO.
//
// `assemblyItems` já guardava DUAS fotos com papéis distintos —
// `contractedPhotoStorageId` (o que foi aprovado) e `referencePhotoStorageId`
// (inspiração). O Caderno de Montagem preferia a REFERÊNCIA e não dizia qual
// era qual. Numa ficha que a equipe leva para o galpão, isso faz montar a
// inspiração em vez do contratado.
// ─────────────────────────────────────────────────────────────────────────────

const PDF = readFileSync("src/lib/generate-assembly-pdf.ts", "utf-8");

describe("qual foto entra no Caderno de Montagem", () => {
  it("a foto CONTRATADA tem precedência sobre a referência", () => {
    expect(PDF).toContain("const thumbUrl = contratada ?? referencia;");
    // A ordem antiga (referência primeiro) não pode voltar.
    expect(PDF).not.toContain("item.referencePhotoUrl ?? item.contractedPhotoUrl");
  });

  it("só é tratada como referência quando NÃO há foto contratada", () => {
    expect(PDF).toContain("const thumbEhReferencia = !contratada && !!referencia;");
  });
});

describe("rotulagem honesta", () => {
  it("referência é marcada como REFERÊNCIA VISUAL", () => {
    expect(PDF).toContain('"REFERÊNCIA VISUAL"');
  });

  it("foto aprovada é marcada como CONTRATADO", () => {
    expect(PDF).toContain('"CONTRATADO"');
  });

  it("o rótulo é escolhido pelo papel da foto, não fixo", () => {
    expect(PDF).toMatch(/thumbEhReferencia \? "REFERÊNCIA VISUAL" : "CONTRATADO"/);
  });

  it("o espaço reservado no bloco inclui o rótulo", () => {
    // Sem isso o rótulo invadiria o item seguinte ou a quebra de página.
    expect(PDF).toContain("thumb ? THUMB_MM + 7.4 : 0");
  });
});

describe("o documento continua funcionando sem foto", () => {
  it("miniatura é opcional em todo o fluxo", () => {
    expect(PDF).toContain("const thumb = thumbUrl ? await loadThumbnail(thumbUrl, 320) : null;");
    // Sem foto, o texto recua e o bloco não reserva altura de imagem.
    expect(PDF).toContain("const textX = MARGIN + (thumb ? THUMB_MM + 5 : 8);");
    expect(PDF).toContain("let alturaThumb = 0;");
  });

  it("o PDF não explode em páginas: miniatura tem tamanho fixo e há quebra", () => {
    expect(PDF).toContain("const THUMB_MM = 22;");
    expect(PDF).toContain("addPageIfNeeded(doc, y, blockH + 4)");
    // A proporção original é respeitada — nada de imagem esticada.
    expect(PDF).toContain("const ratio = thumb.h / thumb.w;");
  });
});
