import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// A IDENTIDADE OFICIAL, E AS DIMENSÕES QUE NINGUÉM CONFERE
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// `public/icon/icon-192.png` e `icon-512.png` eram o MESMO arquivo, byte a
// byte, de **860×1600** — um PRINT de tela inicial de iPhone: fundo branco, o
// ícone pequeno no meio e a palavra "Altar" embaixo. O manifest declarava
// aquilo como 192×192 e 512×512, com `purpose: "any maskable"`.
//
// O resultado era o que se via no aparelho: o sistema espremia um retrato em
// um quadrado, e ainda cortava a zona de segurança do `maskable`. O símbolo
// aparecia minúsculo, e a causa não era margem — era o arquivo.
//
// As mesmas duas imagens serviam de logo em CINCO telas, a 32 pixels.
//
// E o favicon era um EMOJI ⚡ embutido como data-URI: placeholder do gerador do
// projeto, que atravessou até a véspera do beta.
//
// ── O QUE ESTE TESTE LÊ ─────────────────────────────────────────────────────
// O cabeçalho do PNG. `sizes="192x192"` é uma PROMESSA do manifest, e nenhum
// teste até aqui conferia se o arquivo cumpria. É a única forma de flagrar
// outro print entrando como ícone.
// ═════════════════════════════════════════════════════════════════════════════

const raiz = (caminho: string) => caminho.replace(/^\//, "");

/** Largura e altura lidas do cabeçalho IHDR do PNG. */
function dimensoesDoPng(caminho: string): { largura: number; altura: number } {
  const buf = readFileSync(caminho);
  expect(buf.subarray(1, 4).toString("ascii"), `${caminho} não é PNG`).toBe("PNG");
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
}

const MANIFEST = JSON.parse(readFileSync("public/site.webmanifest", "utf-8")) as {
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};
const INDEX = readFileSync("index.html", "utf-8");

describe("todo ícone do manifest existe e tem o tamanho que promete", () => {
  it("são quatro: dois `any` e dois `maskable`", () => {
    // Declarar o MESMO arquivo como "any maskable" é o erro que fazia o
    // Android cortar a zona de segurança de uma arte que não tinha folga.
    const any = MANIFEST.icons.filter((i) => i.purpose === "any");
    const maskable = MANIFEST.icons.filter((i) => i.purpose === "maskable");
    expect(any.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
    expect(maskable.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
    expect(MANIFEST.icons.some((i) => i.purpose?.includes(" "))).toBe(false);
  });

  it.each(MANIFEST.icons.map((i) => [i.src, i.sizes] as const))(
    "%s existe e mede %s de verdade",
    (src, sizes) => {
      const caminho = `public/${raiz(src)}`;
      expect(existsSync(caminho), `${src} não existe — manifest aponta para o vazio`).toBe(true);
      const [l, a] = sizes.split("x").map(Number);
      expect(dimensoesDoPng(caminho)).toEqual({ largura: l, altura: a });
    },
  );

  it("nenhum ícone é cópia de outro", () => {
    // Os dois antigos eram idênticos byte a byte. Tamanhos diferentes existem
    // porque a plataforma usa cada um em um lugar.
    const conteudos = MANIFEST.icons.map((i) => readFileSync(`public/${raiz(i.src)}`).toString("base64"));
    expect(new Set(conteudos).size).toBe(conteudos.length);
  });
});

describe("os ícones que o manifest não cobre", () => {
  const ESPERADOS: readonly (readonly [string, number])[] = [
    ["public/icon/apple-touch-icon.png", 180],
    ["public/icon/favicon-16.png", 16],
    ["public/icon/favicon-32.png", 32],
    ["public/icon/favicon-48.png", 48],
    ["public/brand/altar-simbolo.png", 512],
  ];

  it.each(ESPERADOS)("%s é quadrado e mede %i", (caminho, lado) => {
    expect(existsSync(caminho), `${caminho} não existe`).toBe(true);
    expect(dimensoesDoPng(caminho)).toEqual({ largura: lado, altura: lado });
  });

  it("o favicon.ico existe — navegador antigo pede /favicon.ico sem perguntar", () => {
    expect(existsSync("public/favicon.ico")).toBe(true);
  });

  it("a imagem de compartilhamento é 1200×630, que é o que as redes recortam", () => {
    expect(dimensoesDoPng("public/brand/altar-og.png")).toEqual({ largura: 1200, altura: 630 });
  });

  it("a arte oficial fica preservada, em alta, fora do caminho das derivações", () => {
    // `brand/` na raiz é a FONTE. `public/brand/` é o que vai para a web — e a
    // arte inteira NÃO vai: são 900 KB que nenhuma página pede.
    expect(existsSync("brand/altar-arte-oficial.png")).toBe(true);
    expect(existsSync("public/brand/altar-arte-oficial.png")).toBe(false);
    const { largura, altura } = dimensoesDoPng("brand/altar-arte-oficial.png");
    expect(largura).toBe(altura);
    expect(largura).toBeGreaterThanOrEqual(1024);
  });
});

describe("o index.html aponta para arquivos que existem", () => {
  const referencias = [...INDEX.matchAll(/(?:href|content)="(\/[^"]+\.(?:png|ico))"/g)].map((m) => m[1]);
  const absolutas = [...INDEX.matchAll(/content="https:\/\/[^"]*?(\/brand\/[^"]+\.png)"/g)].map((m) => m[1]);

  it("há referências para conferir", () => {
    expect(referencias.length + absolutas.length).toBeGreaterThan(4);
  });

  it.each([...new Set([...referencias, ...absolutas])])("%s existe em public/", (src) => {
    expect(existsSync(`public/${raiz(src)}`), `${src} daria 404`).toBe(true);
  });

  it("o favicon não é mais um emoji", () => {
    expect(INDEX).not.toContain("data:image/svg+xml");
    expect(INDEX).toContain('rel="icon" href="/favicon.ico"');
    // Os três tamanhos de PNG, cada um com o seu link: o navegador escolhe, e
    // um 48 gerado sem ninguém pedindo seria arquivo órfão no `dist`.
    for (const lado of [16, 32, 48]) {
      expect(INDEX).toContain(`href="/icon/favicon-${lado}.png"`);
    }
  });

  it("o ícone da Apple declara 180×180, que é o que o iOS pede", () => {
    expect(INDEX).toMatch(/rel="apple-touch-icon" sizes="180x180"/);
  });

  it("o link compartilhado leva imagem, e a grande", () => {
    expect(INDEX).toContain('property="og:image"');
    expect(INDEX).toContain('name="twitter:image"');
    expect(INDEX).toContain('content="summary_large_image"');
  });
});

describe("a marca tem um lugar só no código", () => {
  const TELAS = [
    "src/pages/app/layout.tsx",
    "src/pages/Index.tsx",
    "src/pages/auth/Login.tsx",
    "src/pages/auth/ResetPassword.tsx",
  ];

  it.each(TELAS)("%s usa o componente, não uma <img> própria", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    expect(fonte).toContain("MarcaAltar");
    // Cinco cópias da mesma linha foi o que permitiu o print virar logo.
    expect(fonte).not.toMatch(/<img[^>]+\/icon\//);
  });

  it("o componente aponta para o símbolo oficial", () => {
    const fonte = readFileSync("src/components/marca-altar.tsx", "utf-8");
    expect(fonte).toContain("/brand/altar-simbolo.png");
  });
});

describe("a tela de abertura do aplicativo não pisca outra cor", () => {
  it("o fundo do manifest é o bege da própria arte", () => {
    // Qualquer outro tom cria uma emenda visível entre a abertura e o ícone,
    // e ela aparece toda vez que o aplicativo abre.
    expect(MANIFEST.background_color.toLowerCase()).toBe("#e7d8c8");
  });
});

describe("o service worker não serve a marca antiga para sempre", () => {
  const SW = readFileSync("public/sw.js", "utf-8");

  it("a versão do cache subiu junto com a identidade", () => {
    // Sem isso, quem já tem o aplicativo instalado continuaria recebendo do
    // cache o print de 860×1600, e a marca nova não chegaria nunca.
    expect(SW).not.toContain('CACHE_NAME = "altar-v1"');
    expect(SW).toMatch(/CACHE_NAME = "altar-v[2-9]/);
  });

  it("e pré-carrega arquivos que existem", () => {
    const lista = SW.slice(SW.indexOf("urlsToCache"), SW.indexOf("\n", SW.indexOf("urlsToCache")));
    for (const src of [...lista.matchAll(/"(\/[^"]+\.png)"/g)].map((m) => m[1])) {
      expect(existsSync(`public/${raiz(src)}`), `${src} no cache e ausente em public/`).toBe(true);
    }
  });
});
