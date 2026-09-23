import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// O SÍMBOLO DA INTERFACE NÃO PODE VOLTAR A SER UMA IMAGEM DENTRO DE OUTRA
//
// ── O DEFEITO, REGISTRADO NO APARELHO ───────────────────────────────────────
// No iPhone, ao lado da palavra ALTAR, aparecia "uma bolinha com uma telinha
// dentro". A causa: o componente usava o símbolo COM a placa bege da arte,
// dentro de uma caixa arredondada por CSS. Três molduras encaixadas —
//
//   caixa do CSS  →  placa bege  →  arco (que é parte do desenho)
//
// — e a 32 px o olho lê a placa como moldura, não como fundo.
//
// ── A REGRA QUE ESTES TESTES GUARDAM ────────────────────────────────────────
// PLACA OPACA é do ÍCONE INSTALADO: o sistema operacional precisa de fundo,
// senão desenha o vazio. NA INTERFACE a superfície do produto já é o fundo, e
// o símbolo entra sozinho, transparente.
//
// As duas coisas vêm da MESMA arte oficial, pelo mesmo script. Nada aqui é
// redesenhado — o que muda é onde cada derivação pode ser usada.
// ═════════════════════════════════════════════════════════════════════════════

const ler = (p: string) => readFileSync(p, "utf-8");
/**
 * A fonte sem comentário.
 *
 * O cabeçalho do componente CITA o nome do arquivo antigo para explicar o
 * defeito que o iPhone mostrou. Procurar o nome no arquivo inteiro acusaria a
 * própria explicação — já aconteceu quatro vezes neste repositório.
 */
const codigoDe = (p: string) =>
  ler(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const MARCA = codigoDe("src/components/marca-altar.tsx");
const GERADOR = ler("scripts/brand/gerar-icones.py");
const SW = ler("public/sw.js");

/** Cabeçalho PNG: largura, altura e tipo de cor (6 = RGBA). */
function png(caminho: string) {
  const b = readFileSync(caminho);
  return {
    largura: b.readUInt32BE(16),
    altura: b.readUInt32BE(20),
    temAlfa: b.readUInt8(25) === 6 || b.readUInt8(25) === 4,
  };
}

describe("a interface usa o símbolo SEM placa", () => {
  it("o arquivo existe e é quadrado", () => {
    expect(existsSync("public/brand/altar-simbolo.png")).toBe(true);
    const { largura, altura } = png("public/brand/altar-simbolo.png");
    expect(largura).toBe(512);
    expect(altura).toBe(512);
  });

  it("e tem FUNDO TRANSPARENTE — é o que tira a moldura", () => {
    // Sem alfa, a placa bege volta e com ela as três molduras encaixadas.
    expect(png("public/brand/altar-simbolo.png").temAlfa).toBe(true);
  });

  it("o componente aponta para ele, e não para o da placa", () => {
    expect(MARCA).toContain('src="/brand/altar-simbolo.png"');
    expect(MARCA).not.toContain("altar-simbolo-192");
  });

  it("e leva a tinta para o tema escuro, senão some no card escuro", () => {
    // `--card` do escuro é oklch 0,21 e a tinta da arte é oklch 0,2: sem
    // inverter, a marca desaparece na barra lateral.
    expect(MARCA).toContain("dark:invert");
  });

  it("o arquivo com placa não existe mais, e ninguém o referencia", () => {
    expect(existsSync("public/brand/altar-simbolo-192.png")).toBe(false);
    for (const p of [
      "src/components/marca-altar.tsx",
      "public/sw.js",
      "public/site.webmanifest",
      "index.html",
    ]) {
      // O comentário do componente cita o nome antigo para explicar o defeito;
      // o que não pode existir é a REFERÊNCIA.
      expect(codigoDe(p), `${p} ainda referencia o símbolo com placa`).not.toContain(
        "altar-simbolo-192",
      );
    }
  });
});

describe("nenhuma tela desenha uma moldura em volta do símbolo", () => {
  const TELAS = [
    "src/pages/Index.tsx",
    "src/pages/app/layout.tsx",
    "src/pages/auth/Login.tsx",
    "src/pages/auth/ResetPassword.tsx",
  ];

  it.each(TELAS)("%s não arredonda nem emoldura a marca", (tela) => {
    // `rounded-*` só fazia sentido para a placa. Sobre o símbolo transparente
    // ele não arredonda nada — e cortaria as pontas do arco.
    for (const uso of ler(tela).match(/<MarcaAltar[^/]*\/>/g) ?? []) {
      expect(uso, `moldura em ${tela}: ${uso}`).not.toMatch(
        /rounded|border|bg-|ring-|shadow/,
      );
    }
  });

  it("e todas usam o componente — nenhuma `<img>` solta da marca", () => {
    for (const tela of TELAS) {
      expect(codigoDe(tela), `${tela} desenha a marca por fora do componente`).not.toMatch(
        /<img[^>]+\/(icon|brand)\//,
      );
    }
  });
});

describe("o ícone instalado CONTINUA com placa — e é assim que tem de ser", () => {
  it.each([
    ["public/icon/apple-touch-icon.png", 180],
    ["public/icon/icon-192.png", 192],
    ["public/icon/icon-512.png", 512],
    ["public/icon/maskable-192.png", 192],
    ["public/icon/maskable-512.png", 512],
    ["public/icon/favicon-16.png", 16],
    ["public/icon/favicon-32.png", 32],
    ["public/icon/favicon-48.png", 48],
  ])("%s é opaco e tem o lado certo", (caminho, lado) => {
    const { largura, altura, temAlfa } = png(caminho);
    expect(largura).toBe(lado);
    expect(altura).toBe(lado);
    // Ícone de app com fundo transparente vira um buraco na tela inicial.
    expect(temAlfa, `${caminho} ficou transparente`).toBe(false);
  });
});

describe("o símbolo vem da arte oficial, não de outro lugar", () => {
  it("a fonte continua sendo o arquivo-mãe versionado", () => {
    expect(existsSync("brand/altar-arte-oficial.png")).toBe(true);
    expect(GERADOR).toContain('"altar-arte-oficial.png"');
  });

  it("a derivação da interface é recorte da MESMA arte, não desenho novo", () => {
    expect(GERADOR).toContain("def simbolo_sem_placa");
    expect(GERADOR).toContain("simbolo_sem_placa(sim, 512, fundo)");
    // `sim` é `simbolo(arte)` — a arte recortada na caixa da tinta.
    expect(GERADOR).toContain("sim = simbolo(arte)");
  });

  it("e nada é redesenhado em SVG, emoji ou biblioteca de ícones", () => {
    const codigo = MARCA.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const proibido of ["<svg", "<path", "lucide", "&#", "⚡"]) {
      expect(codigo, `a marca virou ${proibido}`).not.toContain(proibido);
    }
    expect(codigo).toContain("<img");
  });

  it("o alfa sai da distância até o bege da própria arte", () => {
    // É o que preserva a anti-serrilha do traço original nas bordas.
    expect(GERADOR).toContain("distancia = max(abs(r - fundo[0])");
  });
});

describe("o aparelho que já tem o ALTAR instalado recebe a correção", () => {
  it("o cache do service worker virou de versão", () => {
    // Sem isto, o iPhone com o app na tela inicial continuaria servindo do
    // cache o símbolo com placa — a correção não chegaria a quem a reportou.
    expect(SW).toMatch(/const CACHE_NAME = "altar-v3"/);
  });

  it("e o pré-carregamento aponta para o arquivo novo", () => {
    expect(SW).toContain("/brand/altar-simbolo.png");
  });

  it("o `activate` apaga os caches de versões anteriores", () => {
    expect(SW).toContain("cacheName !== CACHE_NAME");
  });
});
