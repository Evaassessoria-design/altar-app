import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arquivosDeTela } from "../vitest.arquivos.ts";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — "CARREGANDO" NÃO É "VAZIO", E BOTÃO NÃO DISPARA DUAS VEZES
//
// Dois erros que não estão no código hoje e não podem voltar:
//
//  · mostrar "Nenhum item" enquanto a consulta ainda está vindo. No Convex uma
//    query em andamento é `undefined`, e `(x ?? []).length === 0` transforma
//    isso num "está vazio" que é mentira — pior num 4G de galpão, onde a
//    espera é longa o bastante para a pessoa acreditar e ir embora.
//
//  · botão de criar que aceita dois toques. Numa rede lenta o primeiro toque
//    não dá retorno visível, e a pessoa toca de novo.
// ─────────────────────────────────────────────────────────────────────────────

const TELAS = arquivosDeTela();

const codigoDe = (f: string) =>
  readFileSync(f, "utf-8")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

describe("carregando nunca é exibido como vazio", () => {
  it("ninguém decide 'está vazio' a partir de um `?? []`", () => {
    // `(x ?? []).length === 0` é verdadeiro tanto para vazio quanto para
    // "ainda não chegou" — e as duas coisas pedem telas diferentes.
    const infratores = TELAS.filter((f) =>
      /\?\?\s*\[\]\s*\)\s*\.length\s*===\s*0/.test(codigoDe(f)),
    );
    expect(infratores).toEqual([]);
  });

  it("ninguém junta `!lista` com `lista.length === 0` na mesma condição", () => {
    // `!x` é verdadeiro enquanto a consulta está vindo. Somado a
    // `x.length === 0`, "carregando" e "vazio" viram a mesma tela — e a mensagem
    // que aparece é sempre a de vazio. Foi o que o sino fazia: quem abria num
    // 4G lento lia "Você está em dia!" antes de a lista chegar.
    const infratores = TELAS.filter((f) =>
      /!(\w+)\s*\|\|\s*\1\.length === 0/.test(codigoDe(f)),
    );
    expect(infratores).toEqual([]);
  });

  it("o sino distingue os dois estados", () => {
    const c = codigoDe("src/components/notification-center.tsx");
    expect(c).toContain("notifications === undefined");
  });
});

describe("botão de ação não dispara duas vezes", () => {
  it("todo <Button type=\"submit\"> tem disabled", () => {
    const infratores: string[] = [];
    for (const f of TELAS) {
      for (const m of codigoDe(f).matchAll(/<Button\b[^>]*type="submit"[^>]*>/gs)) {
        if (!m[0].includes("disabled")) infratores.push(`${f}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(infratores).toEqual([]);
  });

  it("o botão que grava na biblioteca trava enquanto grava", () => {
    // Dois toques mandavam a mesma receita duas vezes. Hoje o servidor também
    // recusa a segunda (ver a trava da biblioteca, mais abaixo), mas o botão
    // continua sendo a primeira defesa — e a única que evita o recado de erro.
    const c = codigoDe("src/pages/app/events/[id]/ficha-tecnica/_components/receita-dialog.tsx");
    expect(c).toContain("salvandoNaBiblioteca");
    // A condição pode crescer (gravar a ficha antes também trava o botão); o
    // que não pode é o estado sumir do `disabled`.
    expect(c).toMatch(/disabled=\{[^}]*salvandoNaBiblioteca[^}]*\}/);
    expect(c).toContain("if (salvandoNaBiblioteca) return;");
  });

  it("o envio de arquivo trava por ref, não só por estado", () => {
    expect(codigoDe("src/hooks/use-upload.ts")).toContain("emCurso.current");
  });
});

describe("o botão volta quando dá erro", () => {
  it.each([
    "src/hooks/use-upload.ts",
    "src/pages/app/events/[id]/ficha-tecnica/_components/receita-dialog.tsx",
    "src/components/ajuste-de-acervo-dialog.tsx",
  ])("%s desliga o estado de envio em finally", (arquivo) => {
    // Sem `finally`, uma falha deixaria o botão desabilitado para sempre e a
    // pessoa teria de recarregar a página para tentar de novo.
    expect(codigoDe(arquivo)).toMatch(/finally/);
  });
});

describe("erro não leva junto o que a pessoa digitou", () => {
  it("nenhum formulário fecha o editor no `finally`", () => {
    // Fechar no `finally` fecha TAMBÉM quando deu erro: o texto some e o aviso
    // aparece num editor que já não existe, sem nada para tentar de novo.
    const infratores = TELAS.filter((f) => {
      const c = codigoDe(f);
      return [...c.matchAll(/finally \{[^}]*\}/gs)].some((m) =>
        /onClose\(\)|setOpen\(false\)|setEditing\w*\(null\)|setCriando\(false\)/.test(m[0]),
      );
    });
    expect(infratores).toEqual([]);
  });

  it("a legenda da foto só fecha depois de salvar", () => {
    const c = codigoDe("src/pages/app/events/[id]/fotos/page.tsx");
    const i = c.indexOf("const handleSaveCaption");
    const corpo = c.slice(i, i + 700);
    // O fechamento vem ANTES do catch, ou seja, dentro do caminho de sucesso.
    expect(corpo.indexOf("setEditingCaption(null)")).toBeLessThan(corpo.indexOf("} catch"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — "SALVAR NA BIBLIOTECA" GUARDA O QUE ESTÁ NA TELA
//
// O defeito: o botão chamava `salvarNaBiblioteca`, e essa mutation copia
// `item.receita` — a versão GRAVADA. Quem editava as quantidades e clicava em
// "Salvar na biblioteca" antes de "Salvar ficha" mandava a receita ANTIGA para
// a biblioteca, e lia "Receita salva na biblioteca" como confirmação.
//
// O botão também só aparecia quando já existia receita gravada, então a
// receita recém-digitada — justamente a que vale guardar — exigia salvar,
// fechar e reabrir antes.
// ─────────────────────────────────────────────────────────────────────────────

describe("a biblioteca recebe o que está na tela", () => {
  const RECEITA = "src/pages/app/events/[id]/ficha-tecnica/_components/receita-dialog.tsx";
  const fonte = readFileSync(RECEITA, "utf-8");

  it("grava a ficha ANTES de mandar para a biblioteca", () => {
    const bloco = fonte.slice(
      fonte.indexOf("const enviarParaBiblioteca"),
      fonte.indexOf("salvarNaBiblioteca({ id: itemId"),
    );
    expect(bloco, "manda sem gravar").toContain("await gravarFicha()");
  });

  it("o botão aparece pelo que está digitado, não pelo que já foi gravado", () => {
    expect(fonte).toContain("linhas.some((l) => l.nome.trim())");
    expect(fonte).not.toContain("(item?.receita?.length ?? 0) > 0 && (");
  });

  it("pergunta antes de escrever por cima de uma receita da biblioteca", () => {
    // A biblioteca não tem lixeira: substituir em silêncio apagaria a receita
    // de um evento anterior com o mesmo apelido.
    const bloco = fonte.slice(
      fonte.indexOf("const enviarParaBiblioteca"),
      fonte.indexOf("setSalvandoNaBiblioteca(true)"),
    );
    expect(bloco).toContain("window.confirm");
    expect(bloco).toContain("normalizeName");
  });

  it("e o servidor recusa a colisão mesmo se a tela não perguntar", () => {
    // A pergunta é conveniência. A trava é do servidor.
    const backend = readFileSync("convex/fichaTecnica.ts", "utf-8");
    const bloco = backend.slice(
      backend.indexOf("export const salvarNaBiblioteca"),
      backend.indexOf("\nexport ", backend.indexOf("export const salvarNaBiblioteca") + 1),
    );
    expect(bloco).toContain('withIndex("by_user_search"');
    expect(bloco).toContain("JA_EXISTE");
    expect(bloco).toContain("if (!args.substituirExistente)");
  });
});
