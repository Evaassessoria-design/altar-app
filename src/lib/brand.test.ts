import { describe, expect, it } from "vitest";
import {
  ASSINATURA_ALTAR,
  COR_PADRAO_ALTAR,
  contrastRatio,
  parseHexColor,
  readableTextOn,
  resolveBrandColor,
  resolveIdentidade,
  temContrasteSuficiente,
} from "./brand";

describe("cor inválida nunca quebra um documento", () => {
  it.each([undefined, null, "", "  ", "azul", "#12", "#GGGGGG", "rgb(1,2,3)"])(
    "%s cai no padrão do ALTAR",
    (valor) => {
      expect(resolveBrandColor(valor as string)).toEqual(parseHexColor(COR_PADRAO_ALTAR));
    },
  );

  it("aceita as formas usuais de hex", () => {
    expect(parseHexColor("#FF0000")).toEqual([255, 0, 0]);
    expect(parseHexColor("FF0000")).toEqual([255, 0, 0]);
    expect(parseHexColor("#f00")).toEqual([255, 0, 0]);
    expect(parseHexColor("  #00ff00  ")).toEqual([0, 255, 0]);
  });
});

describe("contraste é medido, não presumido", () => {
  it("fundo escuro recebe texto branco", () => {
    expect(readableTextOn([20, 20, 20])).toEqual([255, 255, 255]);
  });

  it("fundo CLARO recebe texto escuro — o caso que quebraria a leitura", () => {
    // Uma empresa com marca amarela ou bege receberia texto branco ilegível
    // se a cor do texto fosse fixa.
    expect(readableTextOn([255, 235, 120])).toEqual([26, 26, 26]);
    expect(readableTextOn([245, 240, 230])).toEqual([26, 26, 26]);
  });

  it("a escolha SEMPRE atinge o mínimo de 3:1 da WCAG", () => {
    // Varre o espectro: nenhuma cor pode produzir cabeçalho ilegível.
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const fundo: [number, number, number] = [r, g, b];
          const texto = readableTextOn(fundo);
          expect(
            temContrasteSuficiente(fundo, texto),
            `cor ${r},${g},${b} produziria cabeçalho ilegível`,
          ).toBe(true);
        }
      }
    }
  });

  it("a razão de contraste é simétrica e tem os extremos certos", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
  });

  it("a cor padrão do ALTAR é legível com o texto escolhido", () => {
    const cor = resolveBrandColor(undefined);
    expect(temContrasteSuficiente(cor, readableTextOn(cor))).toBe(true);
  });
});

describe("identidade funciona com cadastro vazio", () => {
  it("sem nada preenchido, ainda produz documento válido", () => {
    const id = resolveIdentidade(null);
    expect(id.nome).toBe("Minha empresa");
    expect(id.contato).toBe("");
    expect(id.usaCorPropria).toBe(false);
    expect(id.cor).toEqual(parseHexColor(COR_PADRAO_ALTAR));
  });

  it("usa studioName quando existe, senão o nome da pessoa", () => {
    expect(resolveIdentidade({ studioName: "Aurora Decorações", name: "Eva" }).nome)
      .toBe("Aurora Decorações");
    expect(resolveIdentidade({ name: "Eva" }).nome).toBe("Eva");
    expect(resolveIdentidade({ studioName: "   ", name: "Eva" }).nome).toBe("Eva");
  });

  it("a linha de contato só traz o que existe — nada de travessão vazio", () => {
    const id = resolveIdentidade({ phone: "(11) 90000-0000", instagram: "@aurora" });
    expect(id.contato).toBe("(11) 90000-0000  ·  @aurora");
    expect(id.contato).not.toContain("—");
  });

  it("cor de apoio ausente vira a cor principal", () => {
    const id = resolveIdentidade({ brandColor: "#123456" });
    expect(id.corApoio).toEqual(id.cor);
  });

  it("marca o uso de cor própria só quando ela é válida", () => {
    expect(resolveIdentidade({ brandColor: "#123456" }).usaCorPropria).toBe(true);
    expect(resolveIdentidade({ brandColor: "roxo" }).usaCorPropria).toBe(false);
  });

  it("o texto sobre a cor acompanha a cor escolhida pela empresa", () => {
    const clara = resolveIdentidade({ brandColor: "#FFF3C4" });
    expect(clara.textoSobreCor).toEqual([26, 26, 26]);
    const escura = resolveIdentidade({ brandColor: "#1B3A2F" });
    expect(escura.textoSobreCor).toEqual([255, 255, 255]);
  });
});

describe("assinatura do ALTAR", () => {
  it("é discreta e não substitui a empresa", () => {
    expect(ASSINATURA_ALTAR).toBe("Gerado por ALTAR");
  });
});
