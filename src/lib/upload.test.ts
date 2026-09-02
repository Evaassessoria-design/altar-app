import { describe, expect, it } from "vitest";
import {
  TAMANHO_MAXIMO_DOCUMENTO,
  TAMANHO_MAXIMO_IMAGEM,
  tamanhoEmMB,
  tetoDoTipo,
  validarArquivo,
} from "./upload.ts";

const MB = 1024 * 1024;
const arq = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "foto.jpg", type: "image/jpeg", size: 2 * MB, ...over,
});

describe("tamanho", () => {
  it("foto normal de celular passa", () => {
    expect(validarArquivo(arq({ size: 8 * MB }), { tipo: "imagem" }).ok).toBe(true);
  });

  it("foto gigante é recusada ANTES de gastar o 4G", () => {
    const r = validarArquivo(arq({ size: 90 * MB }), { tipo: "imagem" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("90,0 MB");
      expect(r.motivo).toContain("15,0 MB");
    }
  });

  it("exatamente no limite passa; um byte além, não", () => {
    expect(validarArquivo(arq({ size: TAMANHO_MAXIMO_IMAGEM }), { tipo: "imagem" }).ok).toBe(true);
    expect(validarArquivo(arq({ size: TAMANHO_MAXIMO_IMAGEM + 1 }), { tipo: "imagem" }).ok).toBe(false);
  });

  it("documento tem teto próprio, menor que o de foto", () => {
    expect(tetoDoTipo("documento")).toBe(TAMANHO_MAXIMO_DOCUMENTO);
    expect(TAMANHO_MAXIMO_DOCUMENTO).toBeLessThan(TAMANHO_MAXIMO_IMAGEM);
  });

  it("arquivo vazio é recusado", () => {
    expect(validarArquivo(arq({ size: 0 }), { tipo: "imagem" }).ok).toBe(false);
  });

  it("a mensagem diz o nome do arquivo — com vários selecionados isso importa", () => {
    const r = validarArquivo(arq({ name: "IMG_9021.HEIC", size: 90 * MB }), { tipo: "imagem" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("IMG_9021.HEIC");
  });
});

describe("tipo", () => {
  it("aceita por prefixo de família", () => {
    expect(validarArquivo(arq({ type: "image/png" }), { tipo: "imagem", aceitos: ["image/"] }).ok).toBe(true);
  });

  it("recusa família errada", () => {
    const r = validarArquivo(arq({ name: "video.mp4", type: "video/mp4" }), {
      tipo: "imagem", aceitos: ["image/"],
    });
    expect(r.ok).toBe(false);
  });

  it("aceita tipo exato quando pedido", () => {
    expect(validarArquivo(arq({ type: "application/pdf" }), {
      tipo: "documento", aceitos: ["application/pdf"],
    }).ok).toBe(true);
  });

  it("NÃO julga por extensão — o que vale é o tipo declarado", () => {
    // "contrato.pdf" que na verdade é imagem passa no filtro de imagem, e um
    // .jpg renomeado para .pdf NÃO engana a checagem de documento.
    expect(validarArquivo({ name: "contrato.pdf", type: "image/jpeg", size: MB }, {
      tipo: "imagem", aceitos: ["image/"],
    }).ok).toBe(true);
    expect(validarArquivo({ name: "foto.pdf", type: "image/jpeg", size: MB }, {
      tipo: "documento", aceitos: ["application/pdf"],
    }).ok).toBe(false);
  });

  it("sem tipo declarado passa — não se recusa trabalho por palpite do navegador", () => {
    // Alguns navegadores não sabem dizer o MIME. O backend continua sendo quem
    // decide o que vira registro.
    expect(validarArquivo(arq({ type: "" }), { tipo: "imagem", aceitos: ["image/"] }).ok).toBe(true);
  });

  it("sem lista de aceitos, o tipo não é barrado", () => {
    expect(validarArquivo(arq({ type: "application/zip" }), { tipo: "documento" }).ok).toBe(true);
  });

  it("maiúsculas no MIME não enganam", () => {
    expect(validarArquivo(arq({ type: "IMAGE/JPEG" }), { tipo: "imagem", aceitos: ["image/"] }).ok).toBe(true);
  });
});

describe("tamanhoEmMB", () => {
  it("usa vírgula, como se escreve em português", () => {
    expect(tamanhoEmMB(1.5 * MB)).toBe("1,5 MB");
  });
});
