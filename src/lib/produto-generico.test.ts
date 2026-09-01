import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// TRAVA — o ALTAR é para DECORADORES, não só para casamento.
//
// A mesma empresa decora aniversário, 15 anos, bodas, formatura, corporativo,
// festa infantil. O produto não pode ensinar o contrário nos exemplos que
// mostra: um campo com "Ex: Casamento Ana & Pedro" diz, para quem está
// cadastrando o 15 anos da Helena, que ela está no sistema errado.
//
// O teste NÃO proíbe a palavra "casamento": ela é um tipo de evento válido, e
// uma tela de um casamento pode falar de cerimônia com toda a naturalidade. O
// que ele proíbe é o casamento aparecer como o ÚNICO exemplo — nos textos de
// placeholder, que são exatamente onde o produto se apresenta.
// ─────────────────────────────────────────────────────────────────────────────

function arquivosDeTela(): string[] {
  const achados: string[] = [];
  const andar = (pasta: string) => {
    for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
      const caminho = `${pasta}/${entrada.name}`;
      if (entrada.isDirectory()) andar(caminho);
      else if (/\.tsx$/.test(entrada.name) && !entrada.name.includes(".test."))
        achados.push(caminho);
    }
  };
  andar("src");
  return achados;
}

/** Textos de `placeholder="..."` de um arquivo. */
function placeholders(fonte: string): string[] {
  return [...fonte.matchAll(/placeholder="([^"]*)"/g)].map((m) => m[1]);
}

describe("os exemplos não vendem um sistema de casamento", () => {
  it("nenhum placeholder cita casamento sem citar outro tipo de evento", () => {
    const culpados: string[] = [];
    for (const arquivo of arquivosDeTela()) {
      for (const texto of placeholders(readFileSync(arquivo, "utf-8"))) {
        const citaCasamento = /casamento|noiv/i.test(texto);
        const citaOutro = /anivers|15 anos|bodas|formatura|corporat|confra|infantil|batizado|debutante|evento/i.test(texto);
        if (citaCasamento && !citaOutro) culpados.push(`${arquivo}: "${texto}"`);
      }
    }
    expect(
      culpados,
      `Exemplo só de casamento — inclua outro tipo de evento:\n${culpados.join("\n")}`,
    ).toEqual([]);
  });

  it("a varredura enxerga as telas de verdade", () => {
    const arquivos = arquivosDeTela();
    expect(arquivos.length).toBeGreaterThan(30);
    expect(arquivos).toContain("src/pages/app/events/_components/event-form-dialog.tsx");
  });

  it("o teste detecta o padrão que procura", () => {
    // Contraprova: um regex quebrado passaria em tudo em silêncio.
    const ruim = 'placeholder="Ex: Casamento Ana & Pedro"';
    expect(placeholders(ruim)).toEqual(["Ex: Casamento Ana & Pedro"]);
    expect(/casamento|noiv/i.test(placeholders(ruim)[0])).toBe(true);
  });
});

describe("o produto fala de CLIENTE, não de casal", () => {
  it("nenhuma tela trata o cliente como 'casal'", () => {
    // Nem todo evento tem casal. Um 15 anos tem a debutante e os pais; uma
    // confraternização tem a empresa.
    const culpados = arquivosDeTela().filter((a) => /\bcasal\b/i.test(readFileSync(a, "utf-8")));
    expect(culpados).toEqual([]);
  });
});

describe("os tipos de evento cobrem a rotina de um decorador", () => {
  it("o seletor não é só casamento", () => {
    const fonte = readFileSync(
      "src/pages/app/events/_components/event-form-dialog.tsx",
      "utf-8",
    );
    for (const tipo of ["corporate", "birthday", "debutante", "other"]) {
      expect(fonte).toContain(`"${tipo}"`);
    }
  });
});
