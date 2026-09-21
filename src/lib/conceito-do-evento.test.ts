import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  conceitoDoEvento,
  linhaDoConceito,
  type ConceitoDoEvento,
} from "./conceito-do-evento.ts";
import { BRIEFING_AREAS } from "./briefing-areas.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O CONCEITO VEM DO QUE JÁ EXISTE — E SÓ DELE
//
// A tela do Projeto Visual é virada para a noiva. `getBriefing` devolve a
// linha inteira do briefing, com contato do espaço, seguro e pagamento
// dentro. A fronteira mora na TRANSFORMAÇÃO, como em `paraOCliente`.
// ═════════════════════════════════════════════════════════════════════════════

const FONTE = readFileSync("src/lib/conceito-do-evento.ts", "utf-8");
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("os três campos existem no briefing e são da cliente", () => {
  const campos = BRIEFING_AREAS.flatMap((a) => a.groups.flatMap((g) => g.fields));

  it.each(["decorStyle", "colorPalette", "atmosphereDescription"])(
    "%s é um campo real do briefing",
    (key) => {
      expect(campos.find((c) => c.key === key), "campo inventado").toBeDefined();
    },
  );

  it.each(["decorStyle", "colorPalette", "atmosphereDescription"])(
    "%s pode aparecer para a CLIENTE",
    (key) => {
      // Se um deles virasse TEAM_ONLY amanhã, este teste quebra antes de a
      // decoradora virar o celular para a noiva com campo interno na tela.
      const campo = campos.find((c) => c.key === key)!;
      expect(campo.visibility).toContain("cliente");
    },
  );
});

describe("o conceito é construído campo a campo", () => {
  it("lê os três", () => {
    expect(
      conceitoDoEvento({
        decorStyle: "Jardim contemporâneo",
        colorPalette: "Verde oliva e branco",
        atmosphereDescription: "Luz de fim de tarde, mesas longas.",
      }),
    ).toEqual({
      estilo: "Jardim contemporâneo",
      paleta: "Verde oliva e branco",
      atmosfera: "Luz de fim de tarde, mesas longas.",
    });
  });

  it("campo vazio simplesmente não existe no resultado", () => {
    const c = conceitoDoEvento({ decorStyle: "Clássico", colorPalette: "   " })!;
    expect(c.estilo).toBe("Clássico");
    expect(c.paleta).toBeUndefined();
    expect(c.atmosfera).toBeUndefined();
  });

  it("todos vazios devolve null — a seção inteira some", () => {
    expect(conceitoDoEvento({})).toBeNull();
    expect(conceitoDoEvento({ decorStyle: "", colorPalette: "  ", atmosphereDescription: "" })).toBeNull();
  });

  it("briefing ausente devolve null, sem quebrar", () => {
    // Evento novo não tem briefing nenhum; `getBriefing` devolve `null`.
    expect(conceitoDoEvento(null)).toBeNull();
    expect(conceitoDoEvento(undefined)).toBeNull();
  });

  it("um campo só já basta para a seção existir", () => {
    expect(conceitoDoEvento({ atmosphereDescription: "Intimista." })).toEqual({
      estilo: undefined,
      paleta: undefined,
      atmosfera: "Intimista.",
    });
  });
});

describe("nenhum campo interno atravessa", () => {
  it("campo TEAM_ONLY passado junto é IGNORADO", () => {
    const comLixo = {
      decorStyle: "Rústico",
      venueContact: "João do sítio — (14) 99999-0000",
      insuranceInfo: "Apólice 123",
      setupTime: "08:00",
      paymentTerms: "50% na assinatura",
    } as unknown as { decorStyle?: string };

    const c = conceitoDoEvento(comLixo)!;
    expect(Object.keys(c).sort()).toEqual(["atmosfera", "estilo", "paleta"]);
    expect(JSON.stringify(c)).not.toContain("99999");
    expect(JSON.stringify(c)).not.toContain("Apólice");
  });

  it("e o módulo não ESPALHA o briefing — é a regra, não o acaso", () => {
    // Com `...briefing`, o teste acima passaria e o próximo campo interno
    // acrescentado ao schema entraria sozinho.
    expect(CODIGO).not.toMatch(/\.\.\.\s*briefing/);
  });

  it("referenceImages fica de fora de propósito", () => {
    // Caixa de URLs anterior à Galeria. Trazê-la criaria um segundo lugar
    // para guardar referência.
    expect(CODIGO).not.toContain("referenceImages");
  });

  it("nada de IA, nada de reescrever o texto dela", () => {
    for (const proibido of ["fetch(", "openai", "summar", "gerar", "traduz"]) {
      expect(CODIGO.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
  });

  it("a paleta continua TEXTO — nenhuma cor é inferida", () => {
    // "verde oliva" viraria um hex inventado, apresentado como decisão dela.
    expect(CODIGO).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(CODIGO).not.toMatch(/\brgb\(/);
    const c = conceitoDoEvento({ colorPalette: "Verde oliva e branco" })!;
    expect(c.paleta).toBe("Verde oliva e branco");
  });
});

describe("a linha curta do conceito", () => {
  const linha = (c: ConceitoDoEvento) => linhaDoConceito(c);

  it("junta estilo e paleta", () => {
    expect(linha({ estilo: "Jardim", paleta: "Verde e branco" })).toBe(
      "Jardim  ·  Verde e branco",
    );
  });

  it("com um só, não sobra separador pendurado", () => {
    expect(linha({ estilo: "Jardim" })).toBe("Jardim");
    expect(linha({ paleta: "Verde" })).toBe("Verde");
  });

  it("sem nenhum, não existe linha", () => {
    expect(linha({})).toBeUndefined();
    expect(linha({ atmosfera: "Só a atmosfera" })).toBeUndefined();
  });
});
