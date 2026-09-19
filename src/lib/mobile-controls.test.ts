import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA: controle de operação não pode sumir no celular.
//
// A situação da compra nasceu dentro de `hidden sm:block`. No desktop parecia
// pronta; num telefone o controle simplesmente não existia — e o celular é
// justamente onde a decoradora opera, no galpão e no dia da montagem.
//
// O teste lê as telas operacionais e falha se um controle interativo estiver
// escondido abaixo de `sm`. Esconder DECORAÇÃO (um rótulo redundante, um
// ícone) continua permitido; esconder um `<select>`, `<button>` ou `<input>`
// não.
// ─────────────────────────────────────────────────────────────────────────────

const TELAS_OPERACIONAIS = [
  "src/pages/app/compras/page.tsx",
  "src/pages/app/events/[id]/_components/assembly-items-section.tsx",
  "src/pages/app/events/[id]/checklist/page.tsx",
  "src/components/attention-board.tsx",
  "src/pages/app/events/[id]/projeto/page.tsx",
];

/** Blocos `hidden sm:*` / `hidden md:*` e o que vem logo dentro deles. */
function blocosEscondidosNoCelular(fonte: string): string[] {
  const blocos: string[] = [];
  const re = /className=\{?["'`][^"'`]*\bhidden\s+(?:sm|md|lg):(?:block|flex|inline|inline-flex|grid)\b[^"'`]*["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    // Olha os ~400 caracteres seguintes: o conteúdo imediato do elemento.
    blocos.push(fonte.slice(m.index, m.index + 400));
  }
  return blocos;
}

describe("telas operacionais funcionam no celular", () => {
  it.each(TELAS_OPERACIONAIS)("%s não esconde controle interativo abaixo de sm", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    for (const bloco of blocosEscondidosNoCelular(fonte)) {
      const temControle = /<(select|button|input|textarea|StatusPill|StatusSelect)\b/.test(bloco);
      expect(
        temControle,
        `${arquivo}: um controle interativo está dentro de um bloco escondido no celular.\n` +
          `Trecho: ${bloco.slice(0, 160)}`,
      ).toBe(false);
    }
  });

  it("o teste realmente detecta o padrão que procura", () => {
    // Contraprova: sem isto, um regex quebrado faria o teste passar sempre.
    const exemploRuim = '<div className="hidden sm:block"><select value={x}></select></div>';
    const blocos = blocosEscondidosNoCelular(exemploRuim);
    expect(blocos).toHaveLength(1);
    expect(/<select\b/.test(blocos[0])).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA: botão de texto também é botão.
//
// Um `<button>` sem fundo, só com `text-xs`, tem a altura da linha — 16px. No
// desktop é irrelevante, porque o mouse acerta 16px. No celular, que é onde a
// decoradora opera, 16px é metade do que um polegar alcança com segurança.
//
// Dois estavam assim quando este teste foi escrito, e os dois importam:
//   · "Liberar reserva" — APAGA a reserva do evento, sem desfazer;
//   · "Adicionar" da Equipe do Evento — o único caminho para escalar alguém.
//
// A regra: botão de texto em tela operacional carrega `min-h-9` (36px). O
// `sm:min-h-0` ao lado preserva a densidade do desktop — a correção é para o
// polegar, não um redesign.
// ─────────────────────────────────────────────────────────────────────────────

const TELAS_COM_BOTAO_DE_TEXTO = [
  "src/pages/app/events/[id]/acervo/page.tsx",
  "src/pages/app/events/[id]/page.tsx",
];

/** `className="..."` de cada `<button>` do arquivo. */
function classesDosBotoes(fonte: string): string[] {
  const classes: string[] = [];
  const re = /<button\b([\s\S]{0,700}?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    const cls = m[1].match(/className=\{?["'`]([^"'`]*)["'`]/);
    if (cls) classes.push(cls[1]);
  }
  return classes;
}

describe("botão de texto tem alvo de toque no celular", () => {
  it.each(TELAS_COM_BOTAO_DE_TEXTO)("%s dá altura aos botões sem fundo", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    for (const classe of classesDosBotoes(fonte)) {
      // Botão de texto: sem fundo próprio, só tipografia pequena e sublinhado.
      const ehBotaoDeTexto = classe.includes("text-xs") && classe.includes("hover:underline");
      if (!ehBotaoDeTexto) continue;
      expect(
        classe,
        `${arquivo}: botão de texto sem alvo de toque no celular.\nclassName: ${classe}`,
      ).toContain("min-h-9");
    }
  });

  it("o teste enxerga um botão de texto sem altura", () => {
    // Contraprova: um regex quebrado faria este teste passar sempre.
    const ruim = '<button className="text-xs text-primary hover:underline">Liberar</button>';
    const [classe] = classesDosBotoes(ruim);
    expect(classe).toBe("text-xs text-primary hover:underline");
    expect(classe).not.toContain("min-h-9");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA: liberar reserva apaga, então pergunta antes.
//
// Liberar devolve as peças ao acervo e APAGA a reserva do evento. Não há
// desfazer, e o botão fica encostado nos campos de "Saiu" e "Voltou", que são
// usados com pressa no dia da montagem. Arquivar um item do acervo já pedia
// confirmação; esta ação, que custa mais, não pedia nenhuma.
// ─────────────────────────────────────────────────────────────────────────────

describe("ação destrutiva do acervo pergunta antes", () => {
  it("liberar uma reserva pede confirmação", () => {
    const fonte = readFileSync("src/pages/app/events/[id]/acervo/page.tsx", "utf-8");
    const inicio = fonte.indexOf("Liberar a reserva de");
    expect(inicio, "a confirmação de liberar reserva sumiu").toBeGreaterThan(-1);

    // A confirmação tem de vir ANTES da mutation, não depois dela.
    const trecho = fonte.slice(Math.max(0, inicio - 600), inicio);
    expect(trecho).toContain("window.confirm");
  });
});
