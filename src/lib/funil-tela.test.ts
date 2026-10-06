import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// O CARD E O QUADRO DO FUNIL — O QUE NÃO PODE VOLTAR
//
// O rodapé do card tinha até cinco ações numa linha, e "Documentos" saía
// pela borda direita. O quadro tinha sete colunas, e no celular era arrastar
// de lado coluna por coluna. Estas travas leem a fonte, no mesmo padrão de
// `upload-telas.test.ts`: o que se trava é a decisão, não o pixel.
// ─────────────────────────────────────────────────────────────────────────────

const codigo = readFileSync("src/pages/app/funil/page.tsx", "utf-8")
  .split("\n")
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

const trecho = (inicio: string, fim: string) => {
  const i = codigo.indexOf(inicio);
  return codigo.slice(i, codigo.indexOf(fim, i + inicio.length));
};

const CARD = trecho("function LeadCard({", "\nfunction Coluna(");
const ABERTO = trecho("function LeadAberto({", "\nfunction LeadCard(");

describe("nada sai do card", () => {
  it("o card corta o que passar da borda e aceita encolher", () => {
    expect(CARD).toMatch(/className=\{cn\(\s*"min-w-0 overflow-hidden/);
  });

  it("o rodapé tem duas ações, cada uma com a sua metade", () => {
    expect(CARD).toContain('grid grid-cols-2 gap-2 pt-2 border-t border-border');
    expect(CARD).toContain("Abrir lead");
    expect(CARD).toContain("Documentos");
  });

  it("textos do rodapé truncam em vez de empurrar", () => {
    expect(CARD).toContain('<span className="truncate">Abrir lead</span>');
    expect(CARD).toContain('<span className="truncate">Documentos</span>');
  });
});

describe("as ações que saíram do card estão no lead aberto", () => {
  it.each([
    ["registrar contato", "api.funil.registrarContato"],
    ["criar proposta", "api.propostas.create"],
    ["abrir proposta", "/propostas/${proposta.ultima._id}"],
    ["avançar etapa", "onMoveStage(lead, nextStage.id)"],
    ["criar evento", "Criar Evento"],
    ["documentos", "onDocumentos"],
    ["editar", "onEdit(lead)"],
    ["excluir", "onDelete(lead)"],
  ])("%s", (_r, marca) => {
    expect(ABERTO).toContain(marca);
  });

  it("o card continua com editar e excluir à mão", () => {
    expect(CARD).toContain("aria-label={`Editar ${lead.clientName}`}");
    expect(CARD).toContain("aria-label={`Excluir ${lead.clientName}`}");
  });
});

describe("o quadro em quatro grupos", () => {
  it("a visão inicial é a resumida, e as sete etapas seguem a um toque", () => {
    expect(codigo).toContain('visaoDaUrl(searchParams.get("visao"))');
    expect(codigo).toContain("Ver todas as etapas");
  });

  it("na visão agrupada, cada card diz a etapa real", () => {
    expect(codigo).toContain('mostrarEtapa={visao === "grupos"}');
  });

  it("soltar na coluna de grupo usa a regra que não escolhe etapa sozinha", () => {
    expect(codigo).toContain("etapaAoSoltar: etapaAoSoltarNoGrupo(g)");
    expect(codigo).toMatch(/if \(coluna\.etapaAoSoltar\)/);
  });

  it("o total de Fechamento não soma o valor dos perdidos", () => {
    const resumo = trecho("const resumoDoFechamento", "\n  };");
    expect(resumo).toContain('desfecho(l.stage) === "ganho"');
    expect(resumo).toMatch(/const valor = g\.reduce/);
    expect(codigo).toContain('resumo={c.grupo?.id === "fechamento" ? resumoDoFechamento(c.leads) : undefined}');
  });

  it("fechamento mostra ganhos e perdidos em listas separadas", () => {
    const fechamento = trecho("const conteudoDoFechamento", "\n  };");
    expect(fechamento).toContain('desfecho(l.stage) === "ganho"');
    expect(fechamento).toContain('desfecho(l.stage) === "perdido"');
  });
});

describe("celular", () => {
  it("escolhe a coluna em vez de arrastar o quadro de lado", () => {
    expect(codigo).toContain('aria-label="Coluna exibida"');
    // Os quatro grupos cabem inteiros: grade, não fileira que rola.
    expect(codigo).toContain('visao === "grupos" ? "grid grid-cols-2 gap-2" : "flex gap-2 w-max"');
    expect(codigo).toContain("oculta={c.id !== colunaVisivel}");
    expect(codigo).toContain('oculta ? "hidden md:flex" : "flex"');
  });

  it("os alvos de toque têm ao menos 36 px", () => {
    // Editar e excluir mediam 30 px no celular — menos que um dedo.
    expect(CARD.match(/size-9 md:size-8 inline-flex/g)).toHaveLength(2);
    // h-9 = 36 px; os botões do lead aberto sobem para h-10 no celular.
    expect(CARD).toContain("h-9 px-2");
    // Letra de 12 px no rodapé: com 14 px, "Documentos" virava "Documen…"
    // na coluna de 260 px do quadro completo.
    expect(CARD).toContain("h-9 px-2 gap-1 text-xs");
    expect(ABERTO).toContain("h-10 sm:h-9");
  });
});
