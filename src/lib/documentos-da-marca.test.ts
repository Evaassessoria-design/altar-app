import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// SEIS DOCUMENTOS, UMA MARCA — E ELA É A DELA
//
// `brand.ts` declara a regra desde que nasceu:
//
//     "O protagonismo é da empresa; o ALTAR assina discretamente no rodapé."
//
// Quatro documentos obedeciam. Dois faziam o contrário, e eram justamente os
// dois INTERNOS — os únicos que só ela vê:
//
//   · o RELATÓRIO DO EVENTO abria com uma faixa de 28mm escrita
//     "ALTAR — Plataforma para Decoradores de Eventos", em negrito de 18pt, e
//     não mostrava o nome do estúdio em lugar nenhum;
//   · o ORÇAMENTO aceitava um `studioName` solto, e a tela mandava
//     `currentUser.name` — o nome da PESSOA. Uma empresa chamada "Aurora
//     Decorações" imprimia "Eva" no topo do documento de custo.
//
// Nenhum dos dois tinha a cor da empresa, a linha de contato ou a assinatura
// do ALTAR no rodapé.
//
// ── O QUE ESTE TESTE NÃO EXIGE ──────────────────────────────────────────────
// Que os seis tenham o mesmo MIOLO. Uma folha de carregamento não se parece
// com uma proposta, e não deve. O que se cobra é a moldura: quem assina o
// documento, e para quem ele é.
// ═════════════════════════════════════════════════════════════════════════════

const ler = (f: string) => readFileSync(f, "utf-8");

/** Os seis documentos que o ALTAR gera, e para quem cada um é. */
const DOCUMENTOS = [
  ["generate-event-pdf.ts", "Relatório do evento", "interno"],
  ["generate-orcamento-pdf.ts", "Orçamento", "interno"],
  ["generate-proposta-pdf.ts", "Proposta comercial", "cliente"],
  ["generate-ficha-tecnica-pdf.ts", "Ficha técnica", "equipe"],
  ["generate-assembly-pdf.ts", "Caderno de montagem", "equipe"],
  ["generate-loading-pdf.ts", "Folha de carregamento", "equipe"],
] as const;

describe("todo documento é assinado pela EMPRESA, não pelo ALTAR", () => {
  it.each(DOCUMENTOS)("%s (%s) resolve a identidade da empresa", (arquivo) => {
    expect(ler(`src/lib/${arquivo}`)).toContain("resolveIdentidade");
  });

  it.each(DOCUMENTOS)("%s não escreve ALTAR como se fosse o autor", (arquivo) => {
    const fonte = ler(`src/lib/${arquivo}`)
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");

    // `ASSINATURA_ALTAR` é a assinatura discreta do rodapé e é permitida —
    // é exatamente o lugar onde o ALTAR pode aparecer. O que não pode é o
    // nome no cabeçalho, no lugar do nome dela.
    const semAssinatura = fonte.replace(/ASSINATURA_ALTAR/g, "");
    expect(semAssinatura, `${arquivo}: "ALTAR" fora do rodapé`).not.toMatch(
      /"[^"]*\bALTAR\b[^"]*"/,
    );
  });

  it.each(DOCUMENTOS)("%s assina o ALTAR no rodapé, e só lá", (arquivo) => {
    const fonte = ler(`src/lib/${arquivo}`);
    // Direto, ou pelo rodapé compartilhado — que é quem o escreve.
    const assina =
      fonte.includes("ASSINATURA_ALTAR") || fonte.includes("rodapeEmTodasAsPaginas");
    expect(assina, `${arquivo}: o ALTAR não assina em lugar nenhum`).toBe(true);
  });
});

describe("os dois documentos INTERNOS se anunciam", () => {
  const INTERNOS = DOCUMENTOS.filter(([, , a]) => a === "interno");

  it.each(INTERNOS)("%s declara a audiência no cabeçalho E no rodapé", (arquivo) => {
    const fonte = ler(`src/lib/${arquivo}`);
    expect((fonte.match(/audiencia: "interno"/g) ?? []).length).toBe(2);
  });

  it.each(INTERNOS)("%s diz interno no nome do arquivo", (arquivo) => {
    // É o que aparece na lista de downloads na hora de anexar no WhatsApp.
    expect(ler(`src/lib/${arquivo}`)).toMatch(/-interno-/);
  });
});

describe("o documento da CLIENTE não carrega carimbo de sistema", () => {
  it("a proposta não se anuncia interna — ela não é", () => {
    const PROPOSTA = ler("src/lib/generate-proposta-pdf.ts");
    expect(PROPOSTA).not.toMatch(/USO INTERNO/);
    expect(PROPOSTA).not.toContain('audiencia: "interno"');
  });
});

describe("a moldura compartilhada existe em um lugar só", () => {
  const MARCA = ler("src/lib/pdf-marca.ts");

  it("cabeçalho e rodapé moram juntos", () => {
    expect(MARCA).toContain("export function cabecalhoDaEmpresa");
    expect(MARCA).toContain("export function rodapeEmTodasAsPaginas");
  });

  it("a empresa vem ANTES do tipo de documento", () => {
    // A ordem é o que faz o papel parecer dela. Invertê-la é o defeito que
    // este módulo existe para não deixar voltar.
    const corpo = MARCA.slice(MARCA.indexOf("export function cabecalhoDaEmpresa"));
    const nome = corpo.indexOf("identidade.nome");
    const titulo = corpo.indexOf("doc.text(linha");
    expect(nome).toBeGreaterThan(-1);
    expect(nome, "o tipo do documento vem antes do nome da empresa").toBeLessThan(titulo);
  });

  it("o rodapé numera as páginas — folha solta precisa saber onde estava", () => {
    expect(MARCA).toMatch(/\$\{p\}\/\$\{paginas\}/);
  });
});
