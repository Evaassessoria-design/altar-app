import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveIdentidade } from "./brand";

/** Arquivos de código (sem testes) sob src/ que mencionam um termo. */
function arquivosQueLeem(termo: string): string[] {
  const achados: string[] = [];
  const percorrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        percorrer(caminho);
      } else if (/\.(ts|tsx)$/.test(nome) && !nome.endsWith(".test.ts")) {
        if (readFileSync(caminho, "utf-8").includes(termo)) achados.push(caminho);
      }
    }
  };
  percorrer("src");
  return achados.sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// O DOCUMENTO É DA DECORADORA — e precisa sair mesmo com cadastro vazio.
// ─────────────────────────────────────────────────────────────────────────────

const PDF = readFileSync("src/lib/generate-assembly-pdf.ts", "utf-8");

describe("o Caderno de Montagem funciona sem identidade nenhuma", () => {
  it("sem logo, sem cor e sem contato ainda produz cabeçalho válido", () => {
    const id = resolveIdentidade(undefined);
    expect(id.nome).toBe("Minha empresa");
    expect(id.cor).toHaveLength(3);
    expect(id.textoSobreCor).toHaveLength(3);
    expect(id.contato).toBe("");
  });

  it("a logo é opcional e o erro de imagem não derruba o documento", () => {
    // `addImage` lança para arquivo inválido; sem o try/catch o caderno
    // inteiro deixaria de ser gerado por causa de uma logo corrompida.
    const trecho = PDF.slice(PDF.indexOf("if (data.logoDataUrl)"), PDF.indexOf("doc.setTextColor(...identidade.textoSobreCor)"));
    expect(trecho).toContain("try {");
    expect(trecho).toContain("catch");
  });

  it("a logo NÃO é obrigatória no tipo de dados", () => {
    expect(PDF).toContain("logoDataUrl?: string | null;");
    expect(PDF).toContain("empresa?: EmpresaLike | null;");
  });
});

describe("protagonismo da empresa, assinatura discreta do ALTAR", () => {
  it("o cabeçalho usa o nome da EMPRESA, não o do ALTAR", () => {
    expect(PDF).toContain("doc.text(identidade.nome, textoX, 19)");
    // O texto fixo "ALTAR · Documento operacional" saiu do cabeçalho.
    expect(PDF).not.toContain('"ALTAR · Documento operacional da equipe"');
  });

  it("o ALTAR assina no RODAPÉ", () => {
    expect(PDF).toContain("ASSINATURA_ALTAR");
    const rodape = PDF.slice(PDF.indexOf("// ── Rodapé"));
    expect(rodape).toContain("identidade.nome");
    expect(rodape).toContain("ASSINATURA_ALTAR");
  });

  it("a cor do texto do cabeçalho é MEDIDA, nunca fixada em branco", () => {
    // Uma marca clara com texto branco fixo produziria cabeçalho ilegível.
    expect(PDF).toContain("doc.setTextColor(...identidade.textoSobreCor)");
    const cabecalho = PDF.slice(PDF.indexOf("// ── Cabeçalho"), PDF.indexOf("let y = HEADER_H"));
    expect(cabecalho).not.toContain("setTextColor(255, 255, 255)");
  });

  it("a cor da empresa alimenta títulos e destaques", () => {
    expect(PDF).toContain("doc.setFillColor(...identidade.cor)");
    expect(PDF).toContain("sectionHeader(doc,");
    expect(PDF).toMatch(/sectionHeader\([^)]*identidade\.cor\)/);
  });
});

describe("responsável operacional", () => {
  it("nome e telefone saem juntos, do MESMO registro", () => {
    // Casados pelo nome na tela: o documento nunca mostra o nome de uma pessoa
    // com o telefone de outra.
    const tela = readFileSync("src/pages/app/events/[id]/briefing/page.tsx", "utf-8");
    expect(tela).toContain("a.member?.name === health?.responsible");
    expect(PDF).toContain("data.responsiblePhone");
  });

  it("a lacuna do campo próprio está documentada, não improvisada", () => {
    const tela = readFileSync("src/pages/app/events/[id]/briefing/page.tsx", "utf-8");
    expect(tela).toContain("LACUNA CONHECIDA");
  });
});

describe("a interface do ALTAR não é personalizada por empresa", () => {
  it("a cor da marca só é lida por geradores de documento e pela prévia", () => {
    // White-label de tela não está no escopo: a cor alimenta o PDF, não o app.
    const arquivos = arquivosQueLeem("brandColor");
    // Só o módulo de identidade e a tela de Configurações (que mostra a
    // prévia). Nenhuma tela do app pinta a si mesma com a cor da empresa.
    expect(arquivos).toEqual([
      "src/lib/brand.ts",
      "src/pages/app/configuracoes/page.tsx",
    ]);
  });
});
