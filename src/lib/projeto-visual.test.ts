import { describe, expect, it } from "vitest";
import {
  ambienteTemConteudo,
  montarProjetoVisual,
  papelDaFoto,
  totalDeImagens,
  type FotoDoProjeto,
} from "./projeto-visual.ts";
import { chaveDoAmbiente, type GrupoDeAmbiente } from "./decoration-project.ts";

// ═════════════════════════════════════════════════════════════════════════════
// AS FOTOS ENCONTRANDO OS ITENS
//
// A galeria guarda setenta imagens de um casamento, cada uma com `ambiente`,
// `projectScope` e `category`. Nenhuma delas chegava ao Projeto de Decoração:
// a tela só mostrava as duas fotos presas ao item de montagem. A decoradora
// classificava as referências da mesa do bolo e depois não as via no lugar
// onde ela pensa a mesa do bolo.
//
// ── A JUNÇÃO É PELO RÓTULO ──────────────────────────────────────────────────
// Não há id ligando foto e item, e inventar um exigiria cadastro de ambiente.
// O que existe é o rótulo: "Cerimônia" de um lado e "cerimônia" do outro são o
// mesmo lugar para quem está olhando. Normaliza para COMPARAR; nunca reescreve
// o que ela digitou.
// ═════════════════════════════════════════════════════════════════════════════

type Item = { _id: string; area: string };

// A `key` sai de `chaveDoAmbiente`, exatamente como `agruparPorAmbiente` faz.
// Montar grupo à mão com uma chave inventada (`"cake"`) mascararia a junção:
// o teste passaria e a tela real continuaria com dois blocos.
const grupo = (_area: string, label: string, itens: Item[] = []): GrupoDeAmbiente<Item> => ({
  key: chaveDoAmbiente(label), label, itens,
});

const foto = (p: Partial<FotoDoProjeto> & { _id: string }): FotoDoProjeto => ({
  url: `https://x/${p._id}`,
  category: "antes",
  ...p,
});

describe("o papel da foto no projeto", () => {
  it("referência é inspiração; contratado é decisão", () => {
    expect(papelDaFoto({ category: "antes", projectScope: "referencia" })).toBe("referencia");
    expect(papelDaFoto({ category: "antes", projectScope: "incluso" })).toBe("contratado");
  });

  it("o que ficou de fora não vira nenhum dos dois", () => {
    expect(papelDaFoto({ category: "antes", projectScope: "nao_incluso" })).toBe("fora_do_escopo");
  });

  it("sem classificação NÃO é promovida a referência", () => {
    // O padrão de uma foto recém-enviada viraria decisão estética sem ninguém
    // dizer — e a tela mostraria inspiração que ninguém escolheu.
    expect(papelDaFoto({ category: "antes" })).toBe("sem_classificacao");
  });

  it.each(["montagem", "evento", "desmontagem"])(
    "foto de %s é EXECUÇÃO, mesmo classificada antes",
    (category) => {
      // A fase manda mais que o escopo: a foto foi feita depois da decisão,
      // então ela registra o que aconteceu — não o que se queria.
      expect(papelDaFoto({ category, projectScope: "referencia" })).toBe("execucao");
      expect(papelDaFoto({ category, projectScope: "incluso" })).toBe("execucao");
    },
  );
});

describe("as três grafias são o mesmo ambiente", () => {
  it("acento, caixa e espaço não criam blocos diferentes", () => {
    const chaves = ["Mesa do Bolo", " mesa do bolo ", "MESA DO BOLO"].map(chaveDoAmbiente);
    expect(new Set(chaves).size).toBe(1);
  });

  it("mas ambientes de verdade continuam separados", () => {
    expect(chaveDoAmbiente("Mesa do bolo")).not.toBe(chaveDoAmbiente("Mesa dos convidados"));
  });

  it("vazio e ausente não viram chave", () => {
    expect(chaveDoAmbiente("")).toBe("");
    expect(chaveDoAmbiente("   ")).toBe("");
    expect(chaveDoAmbiente(undefined)).toBe("");
  });
});

describe("a junção entre itens e fotos", () => {
  it("a foto cai no ambiente do item, mesmo com grafia diferente", () => {
    const projeto = montarProjetoVisual(
      [grupo("cake", "Mesa do bolo", [{ _id: "i1", area: "cake" }])],
      [foto({ _id: "f1", ambiente: " MESA DO BOLO ", projectScope: "referencia" })],
    );
    expect(projeto.ambientes).toHaveLength(1);
    expect(projeto.ambientes[0].itens).toHaveLength(1);
    expect(projeto.ambientes[0].referencias.map((f) => f._id)).toEqual(["f1"]);
  });

  it("os três papéis ficam em prateleiras separadas", () => {
    const projeto = montarProjetoVisual(
      [grupo("cake", "Mesa do bolo")],
      [
        foto({ _id: "insp", ambiente: "Mesa do bolo", projectScope: "referencia" }),
        foto({ _id: "contr", ambiente: "Mesa do bolo", projectScope: "incluso" }),
        foto({ _id: "final", ambiente: "Mesa do bolo", category: "evento" }),
        foto({ _id: "fora", ambiente: "Mesa do bolo", projectScope: "nao_incluso" }),
        foto({ _id: "nada", ambiente: "Mesa do bolo" }),
      ],
    );
    const a = projeto.ambientes[0];
    expect(a.referencias.map((f) => f._id)).toEqual(["insp"]);
    expect(a.contratadas.map((f) => f._id)).toEqual(["contr"]);
    expect(a.execucao.map((f) => f._id)).toEqual(["final"]);
    expect(a.foraDoEscopo.map((f) => f._id)).toEqual(["fora"]);
    expect(a.semClassificacao.map((f) => f._id)).toEqual(["nada"]);
  });

  it("ambiente que só tem foto aparece — e com o texto que ela digitou", () => {
    // Ela pode ter classificado fotos de um ambiente que ainda não tem item de
    // montagem. Esconder isso seria perder o trabalho dela.
    const projeto = montarProjetoVisual(
      [grupo("cake", "Mesa do bolo")],
      [foto({ _id: "f1", ambiente: "Ilha gastronômica", projectScope: "referencia" })],
    );
    const rotulos = projeto.ambientes.map((a) => a.label);
    expect(rotulos).toContain("Ilha gastronômica");
    // O rótulo é o ORIGINAL, não a chave normalizada.
    expect(rotulos).not.toContain("ilha gastronomica");
  });

  it("o ambiente novo vem DEPOIS dos que têm item, sem reordenar os conhecidos", () => {
    const projeto = montarProjetoVisual(
      [
        grupo("ceremony", "Cerimônia", [{ _id: "i1", area: "ceremony" }]),
        grupo("cake", "Mesa do bolo", [{ _id: "i2", area: "cake" }]),
      ],
      [foto({ _id: "f1", ambiente: "Bar", projectScope: "referencia" })],
    );
    expect(projeto.ambientes.map((a) => a.label)).toEqual(["Cerimônia", "Mesa do bolo", "Bar"]);
  });

  it("ambiente sem item e sem foto não vira bloco vazio", () => {
    const projeto = montarProjetoVisual([grupo("cake", "Mesa do bolo")], []);
    expect(projeto.ambientes).toEqual([]);
  });

  it("foto sem ambiente vira referência do evento, não desaparece", () => {
    // É o estado natural de quem acabou de subir vinte imagens. Escondê-las
    // faria a decoradora achar que sumiram.
    const projeto = montarProjetoVisual(
      [],
      [
        foto({ _id: "f1", projectScope: "referencia" }),
        foto({ _id: "f2", ambiente: "   " }),
      ],
    );
    expect(projeto.ambientes).toEqual([]);
    expect(projeto.semAmbiente.referencias.map((f) => f._id)).toEqual(["f1"]);
    expect(projeto.semAmbiente.semClassificacao.map((f) => f._id)).toEqual(["f2"]);
    expect(ambienteTemConteudo(projeto.semAmbiente)).toBe(true);
  });
});

describe("os estados que a tela precisa distinguir", () => {
  it("evento sem nada", () => {
    const projeto = montarProjetoVisual([], []);
    expect(projeto.ambientes).toEqual([]);
    expect(ambienteTemConteudo(projeto.semAmbiente)).toBe(false);
    expect(totalDeImagens(projeto)).toBe(0);
  });

  it("evento só com fotos finais — nada de inspiração para mostrar", () => {
    const projeto = montarProjetoVisual(
      [grupo("cake", "Mesa do bolo")],
      [foto({ _id: "f1", ambiente: "Mesa do bolo", category: "evento" })],
    );
    const a = projeto.ambientes[0];
    expect(a.execucao).toHaveLength(1);
    expect(a.referencias).toEqual([]);
    expect(a.contratadas).toEqual([]);
  });

  it("conta as imagens todas — a tela avisa antes de pesar", () => {
    const projeto = montarProjetoVisual(
      [grupo("cake", "Mesa do bolo")],
      Array.from({ length: 20 }, (_, i) =>
        foto({ _id: `f${i}`, ambiente: i < 12 ? "Mesa do bolo" : undefined }),
      ),
    );
    expect(totalDeImagens(projeto)).toBe(20);
  });
});
