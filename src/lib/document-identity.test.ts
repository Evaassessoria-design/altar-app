import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { resolveIdentidade } from "./brand";

/**
 * Arquivos de código (sem testes) sob src/ que mencionam um termo.
 *
 * ── POR QUE NÃO `path.join` ────────────────────────────────────────────────
 * `join` usa o separador do SISTEMA: no Windows devolve `src\lib\brand.ts`,
 * no Linux `src/lib/brand.ts`. Como estes caminhos são COMPARADOS como texto
 * logo abaixo, o teste passava no Linux e falhava no Windows — um teste que só
 * funcionava na máquina de quem o escreveu. O caminho aqui é um identificador,
 * não um caminho de sistema de arquivos, então a barra é sempre `/`.
 */
function arquivosQueLeem(termo: string): string[] {
  const achados: string[] = [];
  const percorrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = `${dir}/${nome}`;
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
  // Este bloco travava o CONTORNO que existia enquanto o evento não tinha um
  // campo próprio de responsável: o telefone era achado casando
  // `member.name === health.responsible`. O campo agora existe
  // (`events.responsibleId`, ver convex/lib/responsavel.ts), então o que
  // precisa ser travado mudou — a garantia é a mesma, o meio é outro.
  it("nome e telefone saem juntos, do MESMO registro", () => {
    const tela = readFileSync("src/pages/app/events/[id]/briefing/page.tsx", "utf-8");
    // Os dois vêm resolvidos do servidor, do mesmo vínculo.
    expect(tela).toContain("health?.responsiblePhone");
    expect(PDF).toContain("data.responsiblePhone");
  });

  it("o telefone NÃO é mais achado casando nome", () => {
    // Casar por nome errava com duas pessoas chamadas "Camila" e falhava
    // sempre que o responsável era uma anotação livre — o documento saía com
    // o nome de uma e o telefone de outra.
    const tela = readFileSync("src/pages/app/events/[id]/briefing/page.tsx", "utf-8");
    expect(tela).not.toContain("a.member?.name === health?.responsible");
    expect(tela).not.toContain("LACUNA CONHECIDA");
  });

  it("o evento tem um campo próprio de responsável", () => {
    const schema = readFileSync("convex/schema.ts", "utf-8");
    const i = schema.indexOf("events: defineTable({");
    const corpo = schema.slice(i, schema.indexOf("leads: defineTable({", i));
    expect(corpo).toContain('responsibleId: v.optional(v.id("teamMembers"))');
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

  it("a varredura devolve caminhos iguais em qualquer sistema", () => {
    // Trava de portabilidade: com `path.join`, este mesmo teste passava no
    // Linux e falhava no Windows. Um caminho com `\` aqui é o defeito voltando.
    for (const caminho of arquivosQueLeem("brandColor")) {
      expect(caminho, `${caminho} usa separador do Windows`).not.toContain("\\");
      expect(caminho.startsWith("src/")).toBe(true);
    }
  });
});
