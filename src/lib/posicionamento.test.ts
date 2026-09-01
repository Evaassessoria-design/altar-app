import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ehPapelConhecido, opcoesDePapel, PAPEIS_DA_EQUIPE } from "./team-roles";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — o ALTAR é gestão para EMPRESAS DE DECORAÇÃO DE EVENTOS.
//
// Duas coisas o contradiziam:
//
//   · a landing dizia que o produto nasceu de "assessoria e gestão de
//     casamentos" e evoluiu "para empresas de eventos em geral" — deixando o
//     leitor com assessoria e casamento como a definição mais fresca;
//
//   · os papéis da equipe ofereciam Cerimonialista, Fotógrafo, Cozinheiro,
//     Garçom, Segurança e DJ. Essa é a equipe do buffet, da assessoria e do
//     cliente — não a de uma decoradora.
//
// Casamento CONTINUA podendo aparecer como exemplo de evento. O que não pode é
// aparecer como definição do produto.
// ─────────────────────────────────────────────────────────────────────────────

const LANDING = readFileSync("src/pages/Index.tsx", "utf-8");
const INDEX_HTML = readFileSync("index.html", "utf-8");

describe("a landing não se posiciona como sistema de assessoria", () => {
  it("não se descreve como assessoria nem wedding planner", () => {
    for (const termo of [/assessoria/i, /assessor\b/i, /wedding planner/i, /cerimonialista/i]) {
      expect(LANDING, `landing cita ${termo}`).not.toMatch(termo);
    }
  });

  it("declara para quem o produto é", () => {
    expect(LANDING).toContain("empresas de decoração de eventos");
  });
});

describe("a landing não se posiciona como exclusiva de casamento", () => {
  it("não define o produto como gestão de casamentos", () => {
    for (const termo of [/gest[ãa]o de casamentos/i, /sistema para casamentos/i, /para noivos/i]) {
      expect(LANDING, String(termo)).not.toMatch(termo);
    }
  });

  it("onde casamento aparece, aparece ao lado de outros eventos", () => {
    // A regra não é banir a palavra: é impedir que ela apareça sozinha, como
    // se fosse o único evento que o ALTAR atende.
    const trechos = LANDING.match(/[^.]*casamento[^.]*\./gi) ?? [];
    for (const trecho of trechos) {
      expect(
        /anivers|15 anos|bodas|formatura|corporat|infantil|batizado|debutante/i.test(trecho),
        `"${trecho.trim()}" cita casamento sem citar outro tipo de evento`,
      ).toBe(true);
    }
  });

  it("casamento CONTINUA podendo ser exemplo — o teste não o baniu", () => {
    // Contraprova da regra acima: se ela virasse "nenhuma menção", este teste
    // falharia, e é isso que garante que não exageramos.
    expect(LANDING.toLowerCase()).toContain("casamento");
  });

  it("o metadata da página fala de decoradores, não de casamento", () => {
    expect(INDEX_HTML).toContain("Gestão para Decoradores de Eventos");
    expect(INDEX_HTML.toLowerCase()).not.toMatch(/casamento|assessoria/);
  });
});

describe("os papéis da equipe são de uma decoradora", () => {
  it("não oferece a equipe do buffet, da assessoria nem do cliente", () => {
    for (const fora of [
      "Cerimonialista",
      "Fotógrafo",
      "Cozinheiro",
      "Garçom",
      "Segurança",
      "DJ",
    ]) {
      expect(
        PAPEIS_DA_EQUIPE.some((p) => p.toLowerCase().includes(fora.toLowerCase())),
        `${fora} não é função da equipe de uma decoradora`,
      ).toBe(false);
    }
  });

  it("oferece as funções que a operação dela tem", () => {
    for (const dentro of ["Coordenação", "Produção", "Montagem", "Desmontagem", "Florista"]) {
      expect(PAPEIS_DA_EQUIPE).toContain(dentro);
    }
  });

  it("as duas telas usam a MESMA lista", () => {
    // A lista existia duas vezes, com conteúdos diferentes: a mesma pessoa via
    // opções diferentes conforme a tela em que estava.
    for (const tela of ["src/components/onboarding-modal.tsx", "src/pages/app/equipe/page.tsx"]) {
      expect(readFileSync(tela, "utf-8"), tela).toContain('from "@/lib/team-roles.ts"');
    }
    expect(readFileSync("src/pages/app/equipe/page.tsx", "utf-8")).not.toContain('"Garçom/Garçonete"');
  });
});

describe("papel já gravado não é perdido", () => {
  it("um membro salvo com papel antigo continua com ele no seletor", () => {
    // `teamMembers.role` é texto livre. Sem isto, editar alguém salvo como
    // "DJ" abriria o seletor vazio e salvar trocaria o papel em silêncio.
    for (const antigo of ["Fotógrafo(a)", "DJ", "Garçom/Garçonete", "Cerimonialista"]) {
      const opcoes = opcoesDePapel(antigo);
      expect(opcoes[0], antigo).toBe(antigo);
      expect(opcoes).toHaveLength(PAPEIS_DA_EQUIPE.length + 1);
    }
  });

  it("papel conhecido não é duplicado na lista", () => {
    expect(opcoesDePapel("Florista")).toHaveLength(PAPEIS_DA_EQUIPE.length);
    expect(opcoesDePapel("Florista").filter((p) => p === "Florista")).toHaveLength(1);
  });

  it("cadastro NOVO não recebe as opções antigas", () => {
    for (const vazio of [undefined, null, "", "   "]) {
      expect(opcoesDePapel(vazio)).toEqual([...PAPEIS_DA_EQUIPE]);
    }
  });

  it("os papéis do demo continuam todos na lista", () => {
    // Marina & Gabriel usa estes. Nenhum pode ter ficado órfão.
    for (const papel of ["Apoio", "Coordenação", "Florista", "Montagem", "Produção"]) {
      expect(ehPapelConhecido(papel), papel).toBe(true);
    }
  });
});
