import { describe, expect, it } from "vitest";
import {
  TAMANHO_MAXIMO_DOCUMENTO,
  TAMANHO_MAXIMO_IMAGEM,
  tamanhoEmMB,
  tetoDoTipo,
  validarArquivo,
} from "./upload.ts";
import {
  TAMANHO_MAXIMO_MB,
  motivoParaRecusarArquivo,
} from "@/convex/lib/tiposDeDocumento.ts";

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

  it("documento tem teto próprio, MAIOR que o de foto", () => {
    // A ordem é essa mesmo, e não por descuido: orçamento de fornecedor pesa
    // mais que foto de celular. Foto tem teto menor porque o navegador ainda
    // precisa desenhá-la; documento só é guardado e baixado.
    expect(tetoDoTipo("documento")).toBe(TAMANHO_MAXIMO_DOCUMENTO);
    expect(TAMANHO_MAXIMO_DOCUMENTO).toBeGreaterThan(TAMANHO_MAXIMO_IMAGEM);
  });

  it("o teto de foto NÃO foi arrastado junto com o de documento", () => {
    // Guarda contra "subiram tudo para 50" numa próxima rodada.
    expect(TAMANHO_MAXIMO_IMAGEM).toBe(15 * MB);
    expect(validarArquivo(arq({ size: 20 * MB }), { tipo: "imagem" }).ok).toBe(false);
    expect(validarArquivo(arq({ size: 50 * MB }), { tipo: "imagem" }).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTOS ATÉ 50 MB
//
// A faixa que a operação real usa: orçamento de fornecedor entre 30 e 36 MB.
// Antes o teto era 10 MB e esses arquivos simplesmente não entravam.
// ─────────────────────────────────────────────────────────────────────────────
describe("documento — teto de 50 MB", () => {
  const doc = (size: number) => ({ name: "orcamento.pdf", type: "application/pdf", size });

  it("o teto é exatamente 50 MB", () => {
    expect(TAMANHO_MAXIMO_DOCUMENTO).toBe(50 * MB);
  });

  it.each([1, 35, 36, 49, 50])("%i MB é aceito", (mb) => {
    expect(validarArquivo(doc(mb * MB), { tipo: "documento" }).ok).toBe(true);
  });

  it("um byte acima de 50 MB é recusado", () => {
    expect(validarArquivo(doc(50 * MB + 1), { tipo: "documento" }).ok).toBe(false);
  });

  it("60 MB é recusado e a mensagem diz o limite real", () => {
    const r = validarArquivo(doc(60 * MB), { tipo: "documento" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("50,0 MB");
      expect(r.motivo).toContain("60,0 MB");
      expect(r.motivo).toContain("orcamento.pdf");
    }
  });

  it("tipo inválido continua recusado, mesmo dentro do tamanho", () => {
    const r = validarArquivo(
      { name: "clipe.mp4", type: "video/mp4", size: 35 * MB },
      { tipo: "documento", aceitos: ["application/pdf"] },
    );
    expect(r.ok).toBe(false);
  });

  it("documento vazio continua recusado", () => {
    expect(validarArquivo(doc(0), { tipo: "documento" }).ok).toBe(false);
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

// ─────────────────────────────────────────────────────────────────────────────
// AS DUAS CAMADAS PRECISAM CONCORDAR
//
// A tela de documentos do lead valida DUAS vezes: `motivoParaRecusarArquivo`
// (antes de gastar a URL de upload) e depois o hook, que chama
// `validarArquivo`. Se os tetos divergirem, o menor vence calado e a mensagem
// mostrada cita um limite que não é o que está sendo aplicado — foi exatamente
// o que acontecia com 20 MB de um lado e 10 MB do outro.
// ─────────────────────────────────────────────────────────────────────────────
describe("acordo entre as duas camadas de validação", () => {
  it("o teto do pré-check é o mesmo do hook de envio", () => {
    expect(TAMANHO_MAXIMO_MB * MB).toBe(TAMANHO_MAXIMO_DOCUMENTO);
  });

  it.each([35, 36, 49, 50])("%i MB passa nas DUAS camadas", (mb) => {
    const arquivo = { name: "orcamento.pdf", type: "application/pdf", size: mb * MB };
    expect(motivoParaRecusarArquivo(arquivo)).toBeNull();
    expect(validarArquivo(arquivo, { tipo: "documento" }).ok).toBe(true);
  });

  it("acima de 50 MB as duas camadas recusam", () => {
    const arquivo = { name: "pesado.pdf", type: "application/pdf", size: 51 * MB };
    expect(motivoParaRecusarArquivo(arquivo)).toBe("Arquivo maior que 50 MB.");
    expect(validarArquivo(arquivo, { tipo: "documento" }).ok).toBe(false);
  });
});
