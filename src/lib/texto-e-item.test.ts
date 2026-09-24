import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { BRIEFING_AREAS, areaByKey, areaTemTextoAntigo } from "./briefing-areas.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O TEXTO E O ITEM CONVIVEM — E A TELA DIZ QUAL DOS DOIS O PRODUTO USA
//
// O convite "criar itens a partir do briefing" é idempotente: depois que
// "Cadeira Dior" virou item, ele para de oferecer. Correto — e cria um estado
// que ninguém comentava.
//
// "Quantidade de Cadeiras: 120" continua escrito. Ela ajusta o ITEM para 130, e
// o campo segue dizendo 120, para sempre. O Caderno sai com 130, a Folha sai
// com 130, o PDF dos noivos sai com 130 — e o relatório interno sai com 120.
//
// Apagar o texto seria errado: é anotação dela, e pode conter o que o item não
// comporta. O certo é DIZER que é anotação.
// ═════════════════════════════════════════════════════════════════════════════

const mobiliario = areaByKey("furniture")!;
const gerais = areaByKey("general")!;

describe("areaTemTextoAntigo", () => {
  it("acusa quando há qualquer campo da área preenchido", () => {
    expect(areaTemTextoAntigo(mobiliario, { guestChairType: "Cadeira Dior" })).toBe(true);
  });

  it("não acusa por campo de OUTRA área", () => {
    expect(areaTemTextoAntigo(mobiliario, { flowerTypes: "Rosa branca" })).toBe(false);
  });

  it("espaço em branco não é texto", () => {
    expect(areaTemTextoAntigo(mobiliario, { guestChairType: "   " })).toBe(false);
  });

  it("briefing ausente não quebra", () => {
    expect(areaTemTextoAntigo(mobiliario, null)).toBe(false);
    expect(areaTemTextoAntigo(mobiliario, undefined)).toBe(false);
    expect(areaTemTextoAntigo(mobiliario, {})).toBe(false);
  });

  it("área que NÃO aceita itens nunca acusa — não há contradição possível", () => {
    // "Informações Gerais" não tem lista de itens ao lado. Avisar ali que o
    // texto é anotação seria mentira: ele é o dado.
    expect(gerais.supportsItems).toBe(false);
    expect(areaTemTextoAntigo(gerais, { theme: "Jardim de inverno" })).toBe(false);
  });
});

describe("a tela mostra um aviso OU o outro, nunca os dois", () => {
  const TELA = readFileSync("src/pages/app/events/[id]/briefing/page.tsx", "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("{/*"))
    .join("\n");

  it("o lembrete de anotação exige que NÃO haja nada a converter", () => {
    // Os dois juntos seriam contraditórios: "converta isto" e "isto é só
    // anotação" na mesma tela, sobre o mesmo campo.
    expect(TELA).toContain("convertiveis.length === 0");
  });

  it("e exige que a área já tenha item", () => {
    expect(TELA).toContain("itensDaArea.length > 0");
  });

  it("nenhum dos dois avisos apaga campo nenhum", () => {
    // O texto é dela. Nunca houve, e não pode passar a haver, um caminho que
    // limpe o briefing em nome da "migração".
    expect(TELA).not.toContain("upsertBriefing({ eventId, guestChairType: null");
    expect(TELA).not.toContain("limparCamposAntigos");
  });
});

describe("partnerName: a porta foi fechada", () => {
  const FUNIL = readFileSync("convex/funil.ts", "utf-8");
  const SCHEMA = readFileSync("convex/schema.ts", "utf-8");

  it("as mutations não aceitam mais o campo órfão", () => {
    // Era gravável pela API e não era lido por nada. Um campo assim é pior que
    // ausência: a próxima pessoa liga um formulário nele e passa uma semana
    // procurando por que o dado não aparece.
    expect(FUNIL).not.toContain("partnerName");
  });

  it("o campo continua no schema, e o comentário diz por quê", () => {
    // Removê-lo invalidaria qualquer documento que já o tivesse gravado, e
    // este ambiente não tem como conferir a base.
    expect(SCHEMA).toContain("partnerName");
    expect(SCHEMA).toContain("LEGADO");
  });

  it("nenhuma tela passou a usá-lo", () => {
    // `--exclude=*.test.*`: este arquivo CITA o campo para proibi-lo, e sem a
    // exclusão a trava acusaria a si mesma. É a quinta vez que uma leitura de
    // fonte neste repositório tropeça no próprio texto.
    const achados = execSync(
      "grep -rl partnerName src --exclude=*.test.ts --exclude=*.test.tsx || true",
      { encoding: "utf-8" },
    ).trim();
    expect(achados).toBe("");
  });
});
