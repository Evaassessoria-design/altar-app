import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRIEFING_AREAS,
  allBriefingFields,
  blocosDaArea,
  blocosDeMobiliario,
  resolveAreasForAudience,
} from "./briefing-areas.ts";
import { montarConferenciaDeMobiliario } from "./conferencia-de-mobiliario.ts";
import { montarFolhaDeCarregamento } from "./loading-sheet.ts";
import { ehObrigacaoDeMontagem } from "./decoration-project.ts";
import { equipeCarrega } from "@/convex/lib/itemDoBriefing.ts";
import { montarCaderno, type FontesDoCaderno, type ItemDoCaderno } from "./caderno/montar-caderno.ts";

// ═════════════════════════════════════════════════════════════════════════════
// O BRIEFING REORGANIZADO (14/10)
//
// O que estes testes prendem: nenhum dado antigo some, nenhuma peça é contada
// duas vezes, o que está em avaliação não vira obrigação, o caminhão leva só
// o que sai do galpão — e o caderno da equipe continua sem dinheiro.
// ═════════════════════════════════════════════════════════════════════════════

const SCHEMA = readFileSync("convex/schema.ts", "utf-8");
const BRIEFING_TS = readFileSync("convex/briefing.ts", "utf-8");

function chavesDoSchema(): string[] {
  const i = SCHEMA.indexOf("const briefingFields = {");
  const bloco = SCHEMA.slice(i, SCHEMA.indexOf("} as const;", i));
  return [...bloco.matchAll(/^\s+(\w+): v\.optional\(v\.string\(\)\)/gm)].map((m) => m[1]);
}

describe("nenhum campo do briefing se perde", () => {
  it("toda chave do schema aparece na tela exatamente uma vez", () => {
    const naTela = allBriefingFields().map((f) => f.key as string);
    const doSchema = chavesDoSchema();
    expect(doSchema.length).toBe(83);
    expect([...naTela].sort()).toEqual([...doSchema].sort());
    expect(new Set(naTela).size).toBe(naTela.length);
  });

  it("o validador e a lista de chaves aceitas pela IA conhecem os mesmos campos", () => {
    for (const chave of chavesDoSchema()) {
      expect(BRIEFING_TS, chave).toMatch(new RegExp(`\\b${chave}: v\\.optional\\(v\\.string\\(\\)\\)`));
      expect(BRIEFING_TS, chave).toContain(`"${chave}"`);
    }
  });

  it("as abas são as mesmas, na mesma ordem, com as mesmas chaves", () => {
    expect(BRIEFING_AREAS.map((a) => a.key)).toEqual([
      "general", "ceremony", "party", "furniture", "flowers", "cake", "lighting", "custom",
    ]);
  });

  it("briefing antigo, só com campos antigos, continua aparecendo nos relatórios", () => {
    const antigo = {
      ceremony_arch: "Arco de eucalipto",
      aisle_decor: "Velas no corredor",
      centerpiece: "Arranjo baixo branco",
      drinkService: "Open bar",
      cakeFlavor: "Nozes",
      lightingType: "Quente",
      furnitureNotes: "mobiliário: Cadeiras (x120)",
      flowerBudget: "R$ 9.000",
    };
    const texto = JSON.stringify(resolveAreasForAudience(antigo, "equipe"));
    for (const v of ["Arco de eucalipto", "Velas no corredor", "Arranjo baixo branco", "Open bar", "Nozes", "Quente", "Cadeiras (x120)"]) {
      expect(texto).toContain(v);
    }
    // O orçamento de flores continua interno.
    expect(texto).not.toContain("9.000");
  });

  it("resposta curta sai pelo rótulo, não pelo valor de banco", () => {
    const r = JSON.stringify(resolveAreasForAudience({ kidsCorner: "a_definir", electricianNeeded: "a_confirmar" }, "cliente"));
    expect(r).toContain("A definir");
    expect(r).toContain("A confirmar");
    expect(r).not.toContain("a_definir");
  });

  it("cada bloco de itens tem chave única no evento inteiro", () => {
    const todos = BRIEFING_AREAS.flatMap((a) => blocosDaArea(a).map((b) => b.bloco));
    expect(new Set(todos).size).toBe(todos.length);
  });
});

let n = 0;
const item = (p: Partial<ItemDoCaderno> & { name: string }): ItemDoCaderno =>
  ({ _id: `i${++n}`, area: "party", visibility: "equipe", includeInAssemblyReport: true, checkOnAssembly: false, ...p }) as ItemDoCaderno;

describe("conferência de mobiliário: uma leitura, não um cadastro", () => {
  const itens = [
    item({ name: "Cadeiras", area: "ceremony", bloco: "assentos", quantity: 200, ambiente: "Cerimônia", reaproveitamento: { ambiente: "Salão", horario: "20h", responsavel: "Diego" } }),
    item({ name: "Mesas redondas", bloco: "mesas", quantity: 20 }),
    item({ name: "Móvel do bar", bloco: "bar", quantity: 1 }),
    item({ name: "Aparador", area: "furniture", quantity: 2 }), // cadastrado antes dos blocos
    item({ name: "Arranjo de mesa", bloco: "mesas", quantity: 20, area: "party" }),
    item({ name: "Genuflexório", area: "ceremony", bloco: "altar", quantity: 1 }), // não é bloco de mobiliário
    item({ name: "Lounge descartado", bloco: "convivencia", quantity: 1, situacao: "nao_se_aplica" }),
  ];
  const c = montarConferenciaDeMobiliario(itens);

  it("junta os móveis de todas as abas e só eles", () => {
    const nomes = c.grupos.flatMap((g) => g.itens.map((i) => i.name)).sort();
    expect(nomes).toEqual(["Aparador", "Arranjo de mesa", "Cadeiras", "Mesas redondas", "Móvel do bar"]);
    expect(blocosDeMobiliario().has("altar")).toBe(false);
  });

  it("a peça reaproveitada é contada UMA vez", () => {
    expect(c.pecas).toBe(200 + 20 + 1 + 2 + 20);
    expect(c.reaproveitados).toBe(1);
  });

  it("não cria segundo cadastro: o mesmo objeto do item aparece", () => {
    const cadeiras = c.grupos.flatMap((g) => g.itens).find((i) => i.name === "Cadeiras");
    expect(cadeiras).toBe(itens[0]);
  });
});

describe("situação, origem e caminhão", () => {
  it("em avaliação e não se aplica não são obrigação de montagem", () => {
    expect(ehObrigacaoDeMontagem({ situacao: "em_avaliacao" })).toBe(false);
    expect(ehObrigacaoDeMontagem({ situacao: "nao_se_aplica" })).toBe(false);
    expect(ehObrigacaoDeMontagem({ situacao: "aprovado" })).toBe(true);
    expect(ehObrigacaoDeMontagem({ situacao: "a_definir" })).toBe(true);
    expect(ehObrigacaoDeMontagem({})).toBe(true);
  });

  it("o caminhão leva o acervo e o sem-origem; espaço, cliente e locadora chegam no local", () => {
    expect(equipeCarrega({})).toBe(true);
    expect(equipeCarrega({ origem: "acervo" })).toBe(true);
    expect(equipeCarrega({ origem: "a_definir" })).toBe(true);
    for (const o of ["espaco", "cliente", "locadora"]) expect(equipeCarrega({ origem: o })).toBe(false);
  });

  it("a Folha de Carregamento separa o que não vai no caminhão e não perde nada", () => {
    const folha = montarFolhaDeCarregamento([
      { _id: "a", area: "party", name: "Cadeiras do acervo", quantity: 100, origem: "acervo" },
      { _id: "b", area: "party", name: "Mesas do espaço", quantity: 20, origem: "espaco" },
      { _id: "c", area: "custom", name: "Monograma", situacao: "em_avaliacao" },
      { _id: "d", area: "party", name: "Antigo sem origem", quantity: 3 },
    ]);
    const noCaminhao = folha.ambientes.flatMap((a) => a.itens.map((i) => i.name)).sort();
    expect(noCaminhao).toEqual(["Antigo sem origem", "Cadeiras do acervo"]);
    expect(folha.chegamNoLocal).toEqual([{ nome: "Mesas do espaço", quantidade: "20", origem: "Do espaço" }]);
  });
});

describe("o caderno com o briefing novo", () => {
  const fontes = (): FontesDoCaderno => ({
    evento: { name: "Casamento Teste", type: "wedding", date: "2026-11-21", location: "Fazenda" },
    briefing: {
      kidsCorner: "sim",
      kidsCornerResponsible: "Bruna",
      electricConnector: "som_e_luz",
      electricianNeeded: "a_confirmar",
      electricNotes: "Pagar R$ 500 ao eletricista na véspera. Tomada 220V no palco.",
      cakeDeliveryResponsible: "Confeitaria Doce",
    },
    itens: [
      item({ name: "Cadeiras", area: "ceremony", bloco: "assentos", quantity: 200, ambiente: "Cerimônia", visibility: "cliente", reaproveitamento: { ambiente: "Salão", horario: "20h", responsavel: "Diego" } }),
      item({ name: "Mesas do espaço", bloco: "mesas", quantity: 20, origem: "espaco", ambiente: "Salão" }),
      item({ name: "Monograma neon", area: "custom", bloco: "identidade", situacao: "em_avaliacao", visibility: "cliente" }),
      item({ name: "Genuflexório", area: "ceremony", bloco: "altar", quantity: 1, ambiente: "Altar", medidas: "60 x 40 cm", responsavelMontagem: "Diego", corAcabamento: "madeira clara" }),
    ],
    fotos: [],
  });

  it("equipe: reaproveitamento como transferência, sem repetir quantidade", () => {
    const c = montarCaderno(fontes(), "equipe");
    const linhasDeCadeiras = c.carga.flatMap((g) => g.linhas).filter((l) => l.nome === "Cadeiras");
    expect(linhasDeCadeiras).toHaveLength(1);
    expect(linhasDeCadeiras[0].quantidade).toBe("200");
    const naFicha = c.fichas.flatMap((f) => f.itens).find((i) => i.nome === "Cadeiras");
    expect(naFicha?.operacional?.join(" ")).toContain("Depois vai para Salão (20h) — transfere: Diego");
    expect(naFicha?.quantidade).toBeUndefined();
  });

  it("equipe: o que vem do espaço sai do caminhão e entra em 'chega no local'", () => {
    const c = montarCaderno(fontes(), "equipe");
    expect(c.carga.flatMap((g) => g.linhas).some((l) => l.nome === "Mesas do espaço")).toBe(false);
    expect(c.chegaNoLocal).toEqual([{ nome: "Mesas do espaço", quantidade: "20", detalhe: "Do espaço · Salão" }]);
  });

  it("em avaliação: fora da montagem, avisado à equipe, perguntado ao cliente", () => {
    const e = montarCaderno(fontes(), "equipe");
    expect(e.carga.flatMap((g) => g.linhas).some((l) => l.nome === "Monograma neon")).toBe(false);
    expect(e.atencao.naoLevarSemConfirmar).toContain("Monograma neon (em avaliação)");
    const c = montarCaderno(fontes(), "cliente");
    expect(c.pendencias.join(" ")).toContain("Decidir sobre os itens em avaliação (Monograma neon)");
  });

  it("conexão elétrica: as duas versões dizem quem conecta; a nota interna só para a equipe, sem dinheiro", () => {
    const e = montarCaderno(fontes(), "equipe");
    const c = montarCaderno(fontes(), "cliente");
    expect(e.conexaoEletrica).toContainEqual({ rotulo: "Quem conecta", valor: "Empresa de som e luz" });
    expect(c.conexaoEletrica).toContainEqual({ rotulo: "Precisa de eletricista?", valor: "A confirmar" });
    const notaEquipe = e.conexaoEletrica.find((l) => l.rotulo === "Observações da conexão");
    expect(notaEquipe?.valor).toBe("Tomada 220V no palco.");
    expect(JSON.stringify(e)).not.toContain("R$");
    expect(JSON.stringify(c)).not.toContain("Tomada 220V");
  });

  it("equipe: prazos e responsáveis do briefing, medidas e quem monta na ficha", () => {
    const e = montarCaderno(fontes(), "equipe");
    expect(e.prazosEResponsaveis).toContainEqual({ rotulo: "Cantinho das crianças — monta", valor: "Bruna" });
    expect(e.prazosEResponsaveis).toContainEqual({ rotulo: "Entrega do bolo e dos doces", valor: "Confeitaria Doce" });
    const gen = e.fichas.flatMap((f) => f.itens).find((i) => i.nome === "Genuflexório");
    expect(gen?.operacional).toEqual(expect.arrayContaining(["Medidas: 60 x 40 cm", "Monta: Diego"]));
    expect(gen?.detalhe).toBe("madeira clara");
  });

  it("cliente: item marcado para o cliente aparece; o da equipe não", () => {
    const c = montarCaderno(fontes(), "cliente");
    const nomes = c.incluido.flatMap((g) => g.linhas.map((l) => l.nome));
    expect(nomes).toContain("Cadeiras");
    expect(nomes).not.toContain("Genuflexório");
    expect(c.prazosEResponsaveis).toEqual([]);
    expect(c.chegaNoLocal).toEqual([]);
  });
});
