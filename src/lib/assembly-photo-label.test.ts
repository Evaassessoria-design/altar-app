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

// Desde 13/10 a escolha da foto mora em `fotoDoItem` (decoration-project.ts),
// a MESMA do Projeto Visual, e o caderno a usa na montagem
// (`caderno/montar-caderno.ts`). O gerador só desenha e rotula. Os testes de
// `caderno/caderno.test.ts` conferem o resultado no PDF gerado.
const PDF = readFileSync("src/lib/generate-assembly-pdf.ts", "utf-8");
const ESCOLHA = readFileSync("src/lib/decoration-project.ts", "utf-8");
const MONTAGEM = readFileSync("src/lib/caderno/montar-caderno.ts", "utf-8");

describe("qual foto entra no Caderno de Montagem", () => {
  it("a foto CONTRATADA tem precedência sobre a referência", () => {
    expect(ESCOLHA).toContain("url: contratada ?? referencia,");
    expect(MONTAGEM).toContain("const foto = fotoDoItem(i);");
    // A ordem antiga (referência primeiro) não pode voltar, em lugar nenhum.
    for (const f of [PDF, ESCOLHA, MONTAGEM]) {
      expect(f).not.toContain("item.referencePhotoUrl ?? item.contractedPhotoUrl");
    }
  });

  it("só é tratada como referência quando NÃO há foto contratada", () => {
    expect(ESCOLHA).toContain("ehReferencia: !usouContratada && !!referencia,");
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
    expect(PDF).toMatch(/it\.ehReferencia \? "REFERÊNCIA VISUAL" : "CONTRATADO"/);
  });

  it("o espaço reservado no bloco inclui o rótulo", () => {
    // Sem isso o rótulo invadiria o item seguinte ou a quebra de página.
    expect(PDF).toContain("thumb ? THUMB_MM * 0.8 + 3.4 : 0");
  });
});

describe("o documento continua funcionando sem foto", () => {
  it("miniatura é opcional em todo o fluxo", () => {
    expect(PDF).toContain("const thumb = it.fotoUrl ? imagens.get(it.fotoUrl) : null;");
    // Sem foto, o texto não recua e o bloco não reserva altura de imagem.
    expect(PDF).toContain("let tx = MARGIN;");
    expect(PDF).toContain("Math.max(hTexto, thumb ? THUMB_MM * 0.8 + 3.4 : 0)");
  });

  it("o PDF não explode em páginas: miniatura tem tamanho fixo e há quebra", () => {
    expect(PDF).toContain("const THUMB_MM = 22;");
    expect(PDF).toContain("p.garantir(h);");
    // A proporção original é respeitada — nada de imagem esticada.
    expect(PDF).toContain("const caixa = caixaProporcional(img, w, h);");
  });
});
