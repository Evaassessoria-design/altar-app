import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIENCIAS,
  AUDIENCIA_PADRAO,
  opcaoDaAudiencia,
} from "./audiencia-do-caderno.ts";
import { itemVisibleTo, resolveAreasForAudience, type Audience } from "./briefing-areas.ts";

// ═════════════════════════════════════════════════════════════════════════════
// TRÊS CADERNOS, UM EVENTO
//
// A regra de audiência existia inteira e funcionava: `itemVisibleTo` filtra os
// itens de montagem e `resolveAreasForAudience` filtra os campos do briefing.
// O PDF já a respeitava.
//
// O que não existia era o SELETOR. A tela chamava o gerador com
// `audience: "equipe"` fixo, então a decoradora classificava um item como
// "cliente" esperando um documento para a cliente — e recebia o da equipe,
// sempre, sem nada indicando por quê.
//
// Estes testes prendem as três coisas que podem dar errado agora: o padrão
// mudar sem querer, um rótulo técnico vazar para a tela, e os três documentos
// se sobrescreverem na pasta de downloads.
// ═════════════════════════════════════════════════════════════════════════════

describe("o vocabulário da audiência", () => {
  it("cobre exatamente as audiências do domínio — nem mais, nem menos", () => {
    // Nenhum enum inventado: a lista vem de `Audience`, em briefing-areas.ts.
    const doDominio: Audience[] = ["interno", "cliente", "equipe"];
    expect(AUDIENCIAS.map((a) => a.valor).sort()).toEqual([...doDominio].sort());
  });

  it("o padrão é o documento que a tela já gerava", () => {
    // Trava contra regressão silenciosa: mudar o padrão mudaria, sem aviso, o
    // caderno que a decoradora imprime há meses.
    expect(AUDIENCIA_PADRAO).toBe("equipe");
    expect(AUDIENCIAS[0].valor).toBe(AUDIENCIA_PADRAO);
  });

  it("nenhum rótulo é o valor de banco cru", () => {
    // A distinção que importa: "Uso interno" é português e está certo;
    // "interno" sozinho como opção de menu seria o valor do banco vazando.
    // Por isso o teste compara o rótulo INTEIRO com o valor, em vez de
    // proibir a palavra — proibir "interno" proibiria escrever em português.
    for (const a of AUDIENCIAS) {
      expect(a.rotulo.trim().toLowerCase()).not.toBe(a.valor);
      expect(a.rotulo.length).toBeGreaterThan(a.valor.length);
      expect(a.detalhe.length).toBeGreaterThan(0);
    }
  });

  it("nenhum rótulo carrega vocabulário de programador", () => {
    for (const a of AUDIENCIAS) {
      const visivel = `${a.rotulo} ${a.detalhe}`;
      expect(visivel).not.toMatch(/\b(audience|visibility|slug|enum|flag|null)\b/i);
    }
  });

  it("cada audiência tem sufixo próprio — três PDFs não se sobrescrevem", () => {
    const sufixos = AUDIENCIAS.map((a) => a.sufixo);
    expect(new Set(sufixos).size).toBe(AUDIENCIAS.length);
    for (const s of sufixos) expect(s).toMatch(/^[a-z]+$/);
  });

  it("valor desconhecido cai no padrão, não em undefined", () => {
    // Um caderno da equipe impresso por engano é melhor do que um botão que
    // não faz nada.
    for (const lixo of [undefined, null, "", "cheff", "EQUIPE"]) {
      expect(opcaoDaAudiencia(lixo).valor).toBe(AUDIENCIA_PADRAO);
    }
    expect(opcaoDaAudiencia("cliente").valor).toBe("cliente");
  });
});

describe("o que cada caderno pode conter", () => {
  // A regra é ANINHADA, e é o que torna o documento da cliente seguro:
  // um item marcado como interno não escapa para ela por nenhum caminho.
  it("o caderno da cliente só mostra o que foi contratado", () => {
    expect(itemVisibleTo("cliente", "cliente")).toBe(true);
    expect(itemVisibleTo("equipe", "cliente")).toBe(false);
    expect(itemVisibleTo("interno", "cliente")).toBe(false);
  });

  it("o caderno da equipe mostra o dela e o da cliente, nunca o interno", () => {
    expect(itemVisibleTo("cliente", "equipe")).toBe(true);
    expect(itemVisibleTo("equipe", "equipe")).toBe(true);
    expect(itemVisibleTo("interno", "equipe")).toBe(false);
  });

  it("o interno vê tudo", () => {
    for (const v of ["interno", "equipe", "cliente"]) {
      expect(itemVisibleTo(v, "interno")).toBe(true);
    }
  });

  it("visibilidade desconhecida é tratada como INTERNA", () => {
    // O padrão seguro: na dúvida, o item não vaza para a cliente.
    expect(itemVisibleTo("qualquer-coisa", "cliente")).toBe(false);
    expect(itemVisibleTo("qualquer-coisa", "interno")).toBe(true);
  });

  it("o briefing da cliente não carrega o campo interno", () => {
    const briefing = {
      guestCount: "180",
      insuranceInfo: "Apólice 123 — R$ 50.000",
      venueContact: "Fazenda Aurora — Renata",
    };
    const texto = (audiencia: Audience) =>
      JSON.stringify(resolveAreasForAudience(briefing, audiencia));

    // `insuranceInfo` é INTERNAL_ONLY; `venueContact` é TEAM_ONLY.
    expect(texto("cliente")).not.toContain("Apólice");
    expect(texto("cliente")).not.toContain("Renata");
    expect(texto("equipe")).toContain("Renata");
    expect(texto("equipe")).not.toContain("Apólice");
    expect(texto("interno")).toContain("Apólice");

    // O que é de todos aparece nos três.
    for (const a of ["interno", "cliente", "equipe"] as Audience[]) {
      expect(texto(a)).toContain("180");
    }
  });
});

describe("a tela pergunta em vez de decidir", () => {
  const tela = readFileSync("src/pages/app/events/[id]/briefing/page.tsx", "utf-8");

  it("não chama o gerador com audiência fixa", () => {
    // O defeito exato que isto tranca.
    expect(tela).not.toMatch(/audience:\s*"(equipe|cliente|interno)"/);
  });

  it("oferece as três audiências, vindas da lista única", () => {
    expect(tela).toContain("AUDIENCIAS.map");
    expect(tela).toContain("Para quem é este caderno?");
  });

  it("o nome do arquivo carrega a audiência", () => {
    const gerador = readFileSync("src/lib/generate-assembly-pdf.ts", "utf-8");
    expect(gerador).toContain("opcaoDaAudiencia(audience).sufixo");
  });
});
