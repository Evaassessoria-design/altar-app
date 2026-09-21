import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  dimensoesReduzidas,
  gerarPreview,
  urlDeExibicao,
  nomeDoPreview,
  valeAPena,
  LADO_MAIOR_PREVIEW,
} from "./imagem-reduzida.ts";

// ═════════════════════════════════════════════════════════════════════════════
// A VERSÃO LEVE NUNCA PODE CUSTAR A FOTO DELA
//
// O teto de envio é 15 MB e nada reduzia nada: a grade da Galeria desenhava um
// quadrado de 138 px baixando o original inteiro. A correção é ADITIVA — se a
// geração falhar por qualquer motivo, a foto é salva exatamente como antes.
// ═════════════════════════════════════════════════════════════════════════════

const FONTE = readFileSync("src/lib/imagem-reduzida.ts", "utf-8");
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("a proporção é preservada", () => {
  it("paisagem encolhe pelo lado maior", () => {
    expect(dimensoesReduzidas(4000, 3000)).toEqual({ largura: 1400, altura: 1050 });
  });

  it("retrato também — e NÃO vira paisagem", () => {
    const d = dimensoesReduzidas(3000, 4000);
    expect(d).toEqual({ largura: 1050, altura: 1400 });
    expect(d.altura).toBeGreaterThan(d.largura);
  });

  it("quadrada continua quadrada", () => {
    expect(dimensoesReduzidas(2000, 2000)).toEqual({ largura: 1400, altura: 1400 });
  });

  it("panorâmica extrema não some", () => {
    // 6000×400: o lado menor arredondaria para 0 sem o piso de 1 px.
    const d = dimensoesReduzidas(6000, 400);
    expect(d.largura).toBe(1400);
    expect(d.altura).toBeGreaterThanOrEqual(1);
  });

  it("imagem MENOR que o teto não é ampliada", () => {
    // Esticar produziria arquivo maior e borrado.
    expect(dimensoesReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
  });

  it("dimensão impossível devolve zero em vez de inventar", () => {
    for (const [w, h] of [[0, 100], [100, 0], [-5, 10], [NaN, 100], [Infinity, 100]]) {
      expect(dimensoesReduzidas(w, h)).toEqual({ largura: 0, altura: 0 });
    }
  });
});

describe("dois arquivos só quando compensa", () => {
  it("15 MB virando 250 KB compensa", () => {
    expect(valeAPena(15_000_000, 250_000)).toBe(true);
  });

  it("300 KB virando 250 KB NÃO compensa", () => {
    // Dobra storage e upload para economizar quase nada de banda.
    expect(valeAPena(300_000, 250_000)).toBe(false);
  });

  it("preview maior que o original nunca compensa", () => {
    expect(valeAPena(100_000, 400_000)).toBe(false);
  });

  it("número podre não vira decisão", () => {
    expect(valeAPena(NaN, 100)).toBe(false);
    expect(valeAPena(100, NaN)).toBe(false);
    expect(valeAPena(0, 0)).toBe(false);
  });
});

describe("qual URL a tela desenha", () => {
  it("foto NOVA usa a versão leve", () => {
    expect(urlDeExibicao({ url: "orig.jpg", previewUrl: "leve.jpg" })).toBe("leve.jpg");
  });

  it("foto ANTIGA cai no original — é o fallback, e por isso não há backfill", () => {
    expect(urlDeExibicao({ url: "orig.jpg", previewUrl: null })).toBe("orig.jpg");
    expect(urlDeExibicao({ url: "orig.jpg" })).toBe("orig.jpg");
  });

  it("sem nenhuma das duas, devolve null e a tela decide o que mostrar", () => {
    expect(urlDeExibicao({ url: null, previewUrl: null })).toBeNull();
    expect(urlDeExibicao({})).toBeNull();
  });
});

describe("a geração falha em silêncio, nunca derruba o envio", () => {
  it("arquivo que não é imagem devolve null", async () => {
    const pdf = new File(["x"], "contrato.pdf", { type: "application/pdf" });
    await expect(gerarPreview(pdf)).resolves.toBeNull();
  });

  it("sem `createImageBitmap` no ambiente, devolve null em vez de explodir", async () => {
    // É o caso do HEIC no Android e de qualquer navegador que não decodifique
    // o formato: a foto sobe igual, sem versão leve.
    const heic = new File(["x"], "IMG_0001.HEIC", { type: "image/heic" });
    await expect(gerarPreview(heic)).resolves.toBeNull();
  });

  it("nenhum caminho lança — `gerarPreview` inteiro vive num try", () => {
    expect(CODIGO).toMatch(/export async function gerarPreview[\s\S]{0,200}try \{/);
    expect(CODIGO).toContain("catch {");
  });
});

describe("o original é intocável", () => {
  it("o módulo não apaga nem reenvia o original", () => {
    // Ele recebe o `File` e devolve um NOVO `File`. Não conhece storage, não
    // conhece mutation, não tem como trocar o que já foi guardado.
    for (const proibido of ["storage", "deletePhoto", "savePhoto", "useMutation", "fetch("]) {
      expect(CODIGO, `o módulo mexe no que já foi guardado: ${proibido}`).not.toContain(
        proibido,
      );
    }
  });

  it("e devolve um arquivo NOVO, sem reescrever o que recebeu", () => {
    // `new File(...)`: o `File` de entrada é imutável e sai intacto.
    expect(CODIGO).toMatch(/return new File\(\[blob\]/);
  });

  it("a orientação do EXIF é respeitada — senão o retrato sai deitado", () => {
    // O canvas ignora o EXIF que o `<img>` respeita: sem isto a versão leve
    // sairia girada enquanto o original aparece certo.
    expect(CODIGO).toContain('imageOrientation: "from-image"');
  });

  it("JPEG sobre fundo branco — PNG transparente não vira mancha preta", () => {
    expect(CODIGO).toContain('ctx.fillStyle = "#ffffff"');
    expect(CODIGO).toContain('"image/jpeg"');
  });

  it("o nome diz que é derivado, e não colide com o original", () => {
    expect(nomeDoPreview("IMG_0001.HEIC")).toBe("IMG_0001.preview.jpg");
    expect(nomeDoPreview("mesa do bolo.jpeg")).toBe("mesa do bolo.preview.jpg");
    expect(nomeDoPreview("sem-extensao")).toBe("sem-extensao.preview.jpg");
    expect(nomeDoPreview(".jpg")).toBe("foto.preview.jpg");
  });

  it("um tamanho, e é o que a maior superfície pede", () => {
    // A capa no computador ocupa 720 px; em DPR 2 são 1440. 1400 é o mesmo
    // número que o Caderno já usa para a planta.
    expect(LADO_MAIOR_PREVIEW).toBe(1400);
  });
});
