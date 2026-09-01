import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_STATUSES,
  aguardandoSeparacao,
  effectiveAssemblyStatus,
  foraDoGalpao,
  ordemDoStatus,
  resumirCarregamento,
} from "./assemblyStatus";

describe("compatibilidade com o dado antigo", () => {
  it("item sem o campo e PENDENTE — nenhum backfill necessario", () => {
    expect(effectiveAssemblyStatus({})).toBe("pendente");
    expect(aguardandoSeparacao({})).toBe(true);
  });

  it("valor inesperado no banco nao quebra a leitura", () => {
    expect(effectiveAssemblyStatus({ operationalStatus: "lixo" })).toBe("pendente");
  });

  it("`checkOnAssembly` nao participa deste modulo", () => {
    // Sao eixos diferentes: um e preferencia de impressao no PDF, o outro e o
    // ponto do trajeto. Misturar os dois quebraria a ficha de montagem.
    const item = { operationalStatus: "carregado", checkOnAssembly: false };
    expect(effectiveAssemblyStatus(item)).toBe("carregado");
  });
});

describe("trajeto do item", () => {
  it("segue a ordem fisica: galpao -> caminhao -> local -> volta", () => {
    expect(ASSEMBLY_STATUSES).toEqual([
      "pendente", "separado", "carregado", "conferido", "retornou",
    ]);
    expect(ordemDoStatus("pendente")).toBeLessThan(ordemDoStatus("separado"));
    expect(ordemDoStatus("carregado")).toBeLessThan(ordemDoStatus("retornou"));
  });

  it("fora do galpao e o que saiu e ainda nao voltou", () => {
    expect(foraDoGalpao({ operationalStatus: "carregado" })).toBe(true);
    expect(foraDoGalpao({ operationalStatus: "conferido" })).toBe(true);
    expect(foraDoGalpao({ operationalStatus: "separado" })).toBe(false);
    expect(foraDoGalpao({ operationalStatus: "retornou" })).toBe(false);
    expect(foraDoGalpao({})).toBe(false);
  });
});

describe("resumo do carregamento", () => {
  it("conta por situacao, misturando itens antigos e novos", () => {
    const r = resumirCarregamento([
      {},
      { operationalStatus: "separado" },
      { operationalStatus: "carregado" },
      { operationalStatus: "carregado" },
      { operationalStatus: "retornou" },
    ]);
    expect(r.total).toBe(5);
    expect(r.porStatus.pendente).toBe(1);
    expect(r.porStatus.carregado).toBe(2);
    expect(r.pendentes).toBe(1);
    expect(r.foraDoGalpao).toBe(2);
  });

  it("lista vazia devolve zeros, nao NaN", () => {
    const r = resumirCarregamento([]);
    expect(r.total).toBe(0);
    expect(r.foraDoGalpao).toBe(0);
    for (const s of ASSEMBLY_STATUSES) expect(r.porStatus[s]).toBe(0);
  });

  it("NAO conta quantidade retornada — isso e inventario, fora desta rodada", () => {
    // "Retornou 19 de 20" exigiria um segundo numero por item e um conceito de
    // perda. Aqui o item retornou ou nao retornou.
    const r = resumirCarregamento([{ operationalStatus: "retornou" }]) as Record<string, unknown>;
    expect(r.quantidadeRetornada).toBeUndefined();
    expect(r.perdas).toBeUndefined();
  });
});
