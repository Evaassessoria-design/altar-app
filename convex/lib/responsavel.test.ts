import { describe, expect, it } from "vitest";
import {
  desvincularMembro,
  nomeDoResponsavel,
  resolverResponsavel,
  responsavelDoEvento,
  type MembroDaEquipe,
} from "./responsavel";

const CAMILA: MembroDaEquipe = { _id: "m1", name: "Camila", role: "Coordenação" };
const JOAO: MembroDaEquipe = { _id: "m2", name: "João", role: "Montagem" };
const EQUIPE = [CAMILA, JOAO];

describe("vínculo ganha de texto", () => {
  it("com vínculo, o nome vem da EQUIPE — renomear o membro atualiza tudo", () => {
    const r = resolverResponsavel({ responsibleId: "m1", responsible: "Camila (antiga)" }, EQUIPE);
    expect(r).toEqual({ nome: "Camila", origem: "equipe", membroId: "m1", papel: "Coordenação" });
  });

  it("sem vínculo, o texto livre É a resposta", () => {
    const r = resolverResponsavel({ responsible: "Zé do vaso" }, EQUIPE);
    expect(r).toEqual({ nome: "Zé do vaso", origem: "anotacao" });
  });

  it("membro sem função não inventa papel", () => {
    const r = resolverResponsavel({ responsibleId: "m3" }, [{ _id: "m3", name: "Ana" }]);
    expect(r).toEqual({ nome: "Ana", origem: "equipe", membroId: "m3", papel: undefined });
  });

  it("função só com espaços não vira papel", () => {
    const r = resolverResponsavel({ responsibleId: "m3" }, [{ _id: "m3", name: "Ana", role: "  " }]);
    expect(r?.papel).toBeUndefined();
  });
});

describe("sem resposta honesta é null", () => {
  it("registro vazio", () => {
    expect(resolverResponsavel({}, EQUIPE)).toBeNull();
  });

  it("texto só com espaços não é resposta", () => {
    expect(resolverResponsavel({ responsible: "   " }, EQUIPE)).toBeNull();
  });

  it("vínculo para membro APAGADO cai para a anotação", () => {
    const r = resolverResponsavel({ responsibleId: "sumiu", responsible: "Camila" }, EQUIPE);
    expect(r).toEqual({ nome: "Camila", origem: "anotacao" });
  });

  it("vínculo para membro apagado, SEM anotação, devolve null", () => {
    // Nada de "Não informado" tratado como se fosse gente.
    expect(resolverResponsavel({ responsibleId: "sumiu" }, EQUIPE)).toBeNull();
  });

  it("membro existente com nome em branco não é resposta", () => {
    expect(resolverResponsavel({ responsibleId: "m9" }, [{ _id: "m9", name: "  " }])).toBeNull();
  });

  it("`null` gravado no banco é tratado como ausente", () => {
    expect(resolverResponsavel({ responsibleId: null, responsible: null }, EQUIPE)).toBeNull();
  });

  it("nomeDoResponsavel devolve só o nome, ou null", () => {
    expect(nomeDoResponsavel({ responsibleId: "m2" }, EQUIPE)).toBe("João");
    expect(nomeDoResponsavel({}, EQUIPE)).toBeNull();
  });
});

describe("responsável do EVENTO", () => {
  it("escolha explícita ganha da equipe escalada", () => {
    const r = responsavelDoEvento({ responsibleId: "m2" }, EQUIPE);
    expect(r?.nome).toBe("João");
  });

  it("UMA pessoa escalada, sem escolha, é a responsável — não há ambiguidade", () => {
    const r = responsavelDoEvento({}, [CAMILA]);
    expect(r).toEqual({ nome: "Camila", origem: "equipe", membroId: "m1", papel: "Coordenação" });
  });

  it("DUAS ou mais, sem escolha, devolve null — o sistema não elege ninguém", () => {
    // O bug antigo: `team[0]` fazia da primeira adicionada "a responsável", e
    // mudar a ordem da equipe trocava o "Resp." do cartão sem ninguém pedir.
    expect(responsavelDoEvento({}, EQUIPE)).toBeNull();
  });

  it("mudar a ORDEM da equipe não muda a resposta", () => {
    expect(responsavelDoEvento({}, [JOAO, CAMILA])).toBeNull();
    expect(responsavelDoEvento({ responsibleId: "m1" }, [JOAO, CAMILA])?.nome).toBe("Camila");
  });

  it("evento sem ninguém escalado devolve null", () => {
    expect(responsavelDoEvento({}, [])).toBeNull();
  });

  it("anotação livre no evento vale mesmo com equipe ambígua", () => {
    const r = responsavelDoEvento({ responsible: "Eu mesma" }, EQUIPE);
    expect(r).toEqual({ nome: "Eu mesma", origem: "anotacao" });
  });
});

describe("excluir o membro não apaga a história", () => {
  it("o vínculo morre e o NOME vira anotação", () => {
    expect(desvincularMembro({ responsibleId: "m1" }, "Camila")).toEqual({
      responsibleId: undefined,
      responsible: "Camila",
    });
  });

  it("anotação existente NUNCA é sobrescrita — pode dizer mais que o nome", () => {
    expect(
      desvincularMembro({ responsibleId: "m1", responsible: "Camila — só a montagem" }, "Camila"),
    ).toEqual({ responsibleId: undefined });
  });

  it("registro sem vínculo não gera escrita nenhuma", () => {
    expect(desvincularMembro({ responsible: "Zé" }, "Camila")).toBeNull();
    expect(desvincularMembro({}, "Camila")).toBeNull();
  });

  it("membro com nome em branco só limpa o vínculo", () => {
    expect(desvincularMembro({ responsibleId: "m1" }, "   ")).toEqual({
      responsibleId: undefined,
    });
  });

  it("o resultado do desvínculo continua resolvendo para a mesma pessoa", () => {
    // É o ponto todo: depois de excluir a Camila da equipe, a compra ainda diz
    // que foi ela quem tocou.
    const registro = { responsibleId: "m1" as string | undefined, responsible: undefined as string | undefined };
    const patch = desvincularMembro(registro, "Camila")!;
    const depois = { ...registro, ...patch };
    expect(resolverResponsavel(depois, [])).toEqual({ nome: "Camila", origem: "anotacao" });
  });
});
