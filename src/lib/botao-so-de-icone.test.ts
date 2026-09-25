import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arquivosDeTela } from "../vitest.arquivos";

// ═════════════════════════════════════════════════════════════════════════════
// BOTÃO SÓ DE ÍCONE PRECISA DE NOME
//
// ── QUEM ISTO AFETA ─────────────────────────────────────────────────────────
// Um botão com um ícone de lixeira e nada mais é lido por um leitor de tela
// como "botão". Só isso. Quem usa leitor de tela fica com uma fila de botões
// idênticos e sem nome, numa tela que apaga coisas.
//
// Não é um caso raro nem hipotético: é a barra de ações de qualquer linha de
// lista deste produto.
//
// ── POR QUE UM TESTE, E NÃO UMA REVISÃO ─────────────────────────────────────
// Porque o defeito nasce de novo a cada componente. Revisão pega uma vez;
// trava pega sempre — inclusive no botão que alguém acrescentar às onze da
// noite, na véspera da apresentação.
//
// ── O QUE CONTA COMO NOME ───────────────────────────────────────────────────
// `aria-label`, `aria-labelledby` ou `title`. Texto visível dentro do botão
// também serve, e é melhor: o nome fica para todo mundo, não só para quem usa
// leitor de tela.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Onde a tag de abertura termina.
 *
 * ── POR QUE NÃO SE PROCURA O PRIMEIRO `>` ───────────────────────────────────
 * Porque `onClick={() => algo()}` tem um `>` dentro. Um regex ingênuo corta a
 * tag no meio da arrow function, e todo atributo escrito DEPOIS dela — como o
 * `aria-label` — some da leitura.
 *
 * Foi assim que a primeira versão acusou `checklist/page.tsx`, que tem
 * `aria-label={`Editar ${item.name}`}` logo abaixo do `onClick`. A trava
 * acusava um arquivo correto de exatamente o defeito que ele não tem.
 *
 * Aqui o escaneamento pula o que estiver entre chaves.
 */
function fimDaAbertura(fonte: string, inicio: number): number {
  let profundidade = 0;
  for (let i = inicio; i < fonte.length; i++) {
    const c = fonte[i];
    if (c === "{") profundidade++;
    else if (c === "}") profundidade--;
    else if (c === ">" && profundidade === 0) return i;
  }
  return -1;
}

function botoesDe(fonte: string): { abertura: string; conteudo: string }[] {
  const achados: { abertura: string; conteudo: string }[] = [];

  for (const tag of ["Button", "button"] as const) {
    const abre = new RegExp(`<${tag}(?=[\\s>])`, "g");
    let m: RegExpExecArray | null;
    while ((m = abre.exec(fonte)) !== null) {
      const fim = fimDaAbertura(fonte, m.index);
      if (fim === -1) continue;
      // Auto-fechada (`<Button ... />`) não tem conteúdo para rotular.
      if (fonte[fim - 1] === "/") continue;
      const fecha = fonte.indexOf(`</${tag}>`, fim);
      if (fecha === -1) continue;
      achados.push({
        abertura: fonte.slice(m.index, fim + 1),
        conteudo: fonte.slice(fim + 1, fecha),
      });
    }
  }
  return achados;
}

/**
 * Sobrou texto para alguém ler depois de tirar as marcas?
 *
 * ── O FALSO POSITIVO QUE ISTO CORRIGE ───────────────────────────────────────
 * A primeira versão descartava TODA expressão `{...}`, e acusou dezenove
 * arquivos por causa do padrão mais comum do produto:
 *
 *     <Button type="submit">{salvando ? "Salvando…" : "Salvar"}</Button>
 *
 * Esse botão tem nome — o nome só está dentro de uma expressão. Uma trava que
 * acusa dezenove arquivos corretos não é rigorosa: é ruído, e ensina a
 * ignorá-la.
 *
 * A regra certa é mais fina, e é sobre o que a expressão RENDERIZA:
 *
 *   `{salvando ? "Salvando…" : "Salvar"}`   → texto (tem literal)
 *   `{item.label}`                          → texto (é um valor, e vira nome)
 *   `{expanded ? <ChevronUp/> : <ChevronDown/>}` → NÃO (renderiza elementos)
 *
 * Ou seja: uma expressão só deixa de contar quando tem JSX dentro e nenhum
 * literal de string. Um `{icone}` solto escaparia da trava por esta regra — é
 * um falso NEGATIVO conhecido, e é o lado certo de errar: uma trava que acusa
 * dezenove arquivos corretos vira ruído, e ruído ensina a ignorá-la.
 */
function temTextoVisivel(conteudo: string): boolean {
  const semTags = conteudo.replace(/<[^>]*>/g, " ");
  const comExpressoes = semTags.replace(/\{[^{}]*\}/g, (expr) => {
    const temLiteral = /["'`][^"'`]*\S[^"'`]*["'`]/.test(expr);
    const temJsx = expr.includes("<");
    return temLiteral || !temJsx ? " texto " : " ";
  });
  return comExpressoes.replace(/\s+/g, " ").trim().length > 0;
}

function temNome(abertura: string): boolean {
  return (
    abertura.includes("aria-label") ||
    abertura.includes("aria-labelledby") ||
    abertura.includes("title=")
  );
}

/**
 * Componentes que envolvem o botão e fornecem o nome por fora.
 *
 * `DropdownMenuTrigger`, `SheetTrigger` e afins às vezes recebem o rótulo do
 * componente pai. Ficam de fora porque o teste não tem como ver esse pai, e um
 * falso positivo aqui ensina a ignorar a trava.
 */
const ENVOLVIDOS = ["Trigger", "SidebarTrigger"];

describe("todo botão só de ícone tem nome", () => {
  const telas = arquivosDeTela().filter(
    // `components/ui/*` é o shadcn, copiado de fora e atualizado por cima. O
    // que este produto escreve mora nas telas e nos componentes próprios.
    (a) => !a.includes("/components/ui/"),
  );

  it("há telas para conferir", () => {
    expect(telas.length).toBeGreaterThan(50);
  });

  it.each(telas)("%s", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    const semNome = botoesDe(fonte)
      .filter((b) => !temTextoVisivel(b.conteudo))
      .filter((b) => !temNome(b.abertura))
      .filter((b) => !ENVOLVIDOS.some((e) => b.abertura.includes(e)))
      // Botão vazio de verdade (sem ícone nem texto) é outro problema, e não
      // é este. Sem conteúdo nenhum não há o que rotular.
      .filter((b) => b.conteudo.trim().length > 0);

    expect(
      semNome.map((b) => b.abertura),
      `${arquivo}: botão só de ícone sem aria-label`,
    ).toEqual([]);
  });
});
