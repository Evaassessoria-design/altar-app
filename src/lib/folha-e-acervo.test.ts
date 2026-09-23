import { describe, expect, it } from "vitest";
import {
  montarPecasDoAcervo,
  montarFolhaDeCarregamento,
  resumoDoRetorno,
  type ItemDeCarregamento,
} from "./loading-sheet.ts";

// ═════════════════════════════════════════════════════════════════════════════
// A FOLHA RESPONDE AS TRÊS PERGUNTAS
//
// "o que precisa ir" · "o que realmente saiu" · "o que voltou"
//
// A primeira sempre esteve na folha, vinda de `assemblyItems`. As outras duas
// estavam gravadas em `collectionReservations.saiu` e `.voltou` — e viviam
// noutra tela, que quem está no galpão com a prancheta não vai abrir.
//
// Os dois blocos continuam SEPARADOS de propósito: o item é o que se MONTA
// ("Arranjo baixo ×20") e a peça é o que SAI DO GALPÃO ("Vaso âmbar ×60"), que
// é do que aqueles vinte arranjos são feitos. Fundir produziria contagem dupla
// e uma prancheta em que ninguém sabe o que conferir.
// ═════════════════════════════════════════════════════════════════════════════

const item = (over: Partial<ItemDeCarregamento> = {}): ItemDeCarregamento => ({
  _id: "i1",
  area: "furniture",
  name: "Arranjo baixo branco",
  ...over,
});

describe("as peças do acervo", () => {
  it("o que falta voltar é DERIVADO de saiu menos voltou", () => {
    const r = montarPecasDoAcervo([
      { _id: "r1", nome: "Vaso âmbar", quantidade: 60, saiu: 60, voltou: 58 },
    ]);
    expect(r.linhas[0].faltaVoltar).toBe(2);
    expect(r.faltamVoltar).toBe(1);
  });

  it("peça que NUNCA saiu não está pendente de retorno", () => {
    // Está pendente de SAÍDA, que é outra coisa — e marcar "falta voltar 60"
    // numa peça que ainda está na prateleira mandaria alguém procurar o que
    // nunca saiu do lugar.
    const r = montarPecasDoAcervo([{ _id: "r1", nome: "Castiçal", quantidade: 60 }]);
    expect(r.linhas[0].faltaVoltar).toBe(0);
    expect(r.faltamVoltar).toBe(0);
  });

  it("voltou mais do que saiu não vira número negativo", () => {
    const r = montarPecasDoAcervo([
      { _id: "r1", nome: "Vaso", quantidade: 10, saiu: 5, voltou: 8 },
    ]);
    expect(r.linhas[0].faltaVoltar).toBe(0);
  });

  it("reserva cuja peça sumiu do acervo é descartada", () => {
    // Linha sem nome na prancheta não ajuda ninguém a conferir.
    const r = montarPecasDoAcervo([
      { _id: "r1", nome: "", quantidade: 10 },
      { _id: "r2", nome: "   ", quantidade: 5 },
      null,
      undefined,
      { _id: "r3", nome: "Vaso âmbar", quantidade: 20 },
    ]);
    expect(r.linhas.map((l) => l.nome)).toEqual(["Vaso âmbar"]);
  });

  it("evento sem acervo produz lista vazia, não erro", () => {
    expect(montarPecasDoAcervo([])).toEqual({ linhas: [], faltamVoltar: 0 });
  });
});

describe("o resumo do retorno conta as duas listas", () => {
  const folhaCom = (itens: ItemDeCarregamento[]) => montarFolhaDeCarregamento(itens);

  it("soma itens de montagem e peças do acervo", () => {
    const folha = folhaCom([item({ operationalStatus: "carregado" })]);
    expect(resumoDoRetorno(folha, 0)).toBe("1 item saiu e ainda não voltou");
    expect(resumoDoRetorno(folha, 2)).toBe("3 itens saíram e ainda não voltaram");
  });

  it("nada pendente continua em silêncio", () => {
    // Inventar "0 itens em aberto" só ocuparia espaço numa folha que se lê em
    // pé, com a mão suja.
    const folha = folhaCom([item({ operationalStatus: "retornou" })]);
    expect(resumoDoRetorno(folha, 0)).toBeNull();
  });

  it("só o acervo pendente já produz o aviso", () => {
    const folha = folhaCom([item({ operationalStatus: "retornou" })]);
    expect(resumoDoRetorno(folha, 1)).toBe("1 item saiu e ainda não voltou");
  });

  it("chamado sem o segundo argumento, o comportamento é o de antes", () => {
    const folha = folhaCom([item({ operationalStatus: "carregado" })]);
    expect(resumoDoRetorno(folha)).toBe("1 item saiu e ainda não voltou");
  });
});

describe("os dois blocos não se misturam", () => {
  it("peça do acervo não entra na lista de itens de montagem", () => {
    const folha = montarFolhaDeCarregamento([item()]);
    const total = folha.ambientes.reduce((n, a) => n + a.itens.length, 0);
    expect(total).toBe(1);
    // O acervo é outro parâmetro, outra função e outra lista.
    expect(JSON.stringify(folha)).not.toContain("Vaso");
  });

  it("referência e não incluso continuam fora da folha", () => {
    // A regra de sempre (`ehObrigacaoDeMontagem`): mandar a equipe procurar no
    // galpão um objeto que nunca existiu é fazer alguém perder a manhã.
    const folha = montarFolhaDeCarregamento([
      item({ _id: "a", projectScope: "referencia" }),
      item({ _id: "b", projectScope: "nao_incluso" }),
      item({ _id: "c" }),
    ]);
    const nomes = folha.ambientes.flatMap((a) => a.itens.map((i) => i._id));
    expect(nomes).toEqual(["c"]);
  });
});
