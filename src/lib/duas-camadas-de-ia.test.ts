import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROTAS_SEM_MENU } from "./navigation.ts";

// ═════════════════════════════════════════════════════════════════════════════
// DUAS CAMADAS QUE NUNCA PODEM SE MISTURAR
//
//   ESCRITÓRIO ALTAR → nossa mesa. Administra o NEGÓCIO: carteira de
//                      assinantes, cobrança, interessados da landing.
//                      Guarda: requirePlatformOwner.
//
//   ASSISTENTE ALTAR → a IA da decoradora. Administra a EMPRESA DELA:
//                      eventos, financeiro, funil, acervo.
//                      Guarda: requireActiveAccess + posse por `userId`.
//
// O erro que este arquivo trava já aconteceu: a ferramenta da decoradora foi
// construída com o nome "Escritório". A arquitetura estava certa e o nome,
// errado — e nome errado é como camada vira camada errada.
//
// Os testes de comportamento vivem em `convex/escritorio.fronteiras.test.ts`.
// Aqui ficam as garantias que só se leem na fonte: que uma guarda não sumiu,
// que uma camada não passou a importar a outra, que ninguém escreveu um
// e-mail dentro do código.
// ═════════════════════════════════════════════════════════════════════════════

const semComentarios = (p: string) =>
  readFileSync(p, "utf-8")
    // Sem comentários: este repositório já tropeçou cinco vezes na própria
    // prosa ao ler a fonte — a trava acusava o texto que a explicava.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const ESCRITORIO = semComentarios("convex/escritorio.ts");
const GUARDA = semComentarios("convex/lib/platformGuard.ts");
const ADMIN = semComentarios("convex/admin.ts");

const ARQUIVOS_DO_ASSISTENTE = [
  "convex/assistente.ts",
  "convex/assistenteExecutor.ts",
  ...readdirSync("convex/lib/assistente")
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => `convex/lib/assistente/${f}`),
];

// ─────────────────────────────────────────────────────────────────────────────
// A GUARDA DA PLATAFORMA
// ─────────────────────────────────────────────────────────────────────────────

describe("quem é dono da plataforma é DADO, não código", () => {
  it("não há e-mail, nome nem identidade escrita na guarda", () => {
    expect(GUARDA).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(ESCRITORIO).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  it("a guarda lê UM campo, e não deriva permissão de outro estado", () => {
    expect(GUARDA).toContain("platformOwner !== true");
    // Os três estados que mais parecem permissão e não são: papel de suporte,
    // isenção de cobrança e conta de teste.
    for (const parecido of ['role !== "admin"', 'accessType', '"internal"', '"beta"']) {
      expect(GUARDA).not.toContain(parecido);
    }
  });

  it("recusa com NOT_FOUND — a superfície interna não confirma que existe", () => {
    expect(GUARDA).toContain("NOT_FOUND");
    expect(GUARDA).not.toContain("FORBIDDEN");
  });
});

describe("a concessão é um ato deliberado", () => {
  it("`grantPlatformOwnerByEmail` é interna: nenhuma tela alcança", () => {
    expect(ADMIN).toContain("export const grantPlatformOwnerByEmail = internalMutation({");
    expect(ADMIN).not.toContain("export const grantPlatformOwnerByEmail = mutation({");
  });

  it("promover a admin não concede a plataforma", () => {
    // O bloco de `grantInternalAccessByEmail` não pode ganhar um
    // `platformOwner: true` numa refatoração distraída.
    const inicio = ADMIN.indexOf("export const grantInternalAccessByEmail");
    const fim = ADMIN.indexOf("export const grantPlatformOwnerByEmail");
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    expect(ADMIN.slice(inicio, fim)).not.toContain("platformOwner: true");
  });

  it("nenhum caminho automático do produto concede a permissão", () => {
    // `platformOwner: true` só pode ser escrito pela concessão explícita.
    // Qualquer outro arquivo do backend que escreva isso está promovendo
    // alguém por inferência — exatamente o que não pode acontecer.
    const backend = readdirSync("convex")
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => `convex/${f}`);

    for (const arquivo of backend) {
      const fonte = semComentarios(arquivo);
      if (!fonte.includes("platformOwner: true")) continue;
      expect(arquivo).toBe("convex/admin.ts");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O ESCRITÓRIO NÃO É DO PRODUTO
// ─────────────────────────────────────────────────────────────────────────────

describe("toda função pública do Escritório passa pela guarda", () => {
  const publicas = [...ESCRITORIO.matchAll(/export const (\w+) = (query|mutation|action)\(/g)];

  it("existe pelo menos uma — senão este teste passaria vazio", () => {
    expect(publicas.length).toBeGreaterThan(0);
  });

  it.each(publicas.map((m) => m[1]))("`%s` exige o dono da plataforma", (nome) => {
    const inicio = ESCRITORIO.indexOf(`export const ${nome} = `);
    const proxima = ESCRITORIO.indexOf("\nexport const ", inicio + 1);
    const corpo = ESCRITORIO.slice(inicio, proxima === -1 ? undefined : proxima);

    // `souDono` é a única exceção, e é declarada: responde `false` em vez de
    // recusar porque roda em toda navegação. Ela não entrega dado nenhum.
    if (nome === "souDono") {
      expect(corpo).toContain("ehPlatformOwner(ctx)");
      return;
    }
    expect(corpo).toContain("requirePlatformOwner(ctx)");
  });
});

describe("o Escritório não usa guarda de decoradora", () => {
  it.each(["requireActiveAccess", "requireEventOwner", "requireLeadOwner", "requireUser("])(
    "não chama %s",
    (guarda) => {
      expect(ESCRITORIO).not.toContain(guarda);
    },
  );

  it("não lê nada escopado a um tenant", () => {
    // Contar eventos é agregado; abrir o evento de alguém seria outra coisa.
    expect(ESCRITORIO).not.toContain('withIndex("by_user"');
    for (const tabela of ["leads", "proposals", "briefings", "assemblyItems"]) {
      expect(ESCRITORIO).not.toContain(`query("${tabela}")`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O ASSISTENTE NÃO É DO ALTAR
// ─────────────────────────────────────────────────────────────────────────────

describe("o Assistente da decoradora não alcança o negócio ALTAR", () => {
  it("nenhum arquivo do Assistente conhece a plataforma", () => {
    for (const arquivo of ARQUIVOS_DO_ASSISTENTE) {
      const fonte = semComentarios(arquivo);
      for (const proibido of [
        "platformOwner",
        "requirePlatformOwner",
        "api.escritorio",
        "internal.escritorio",
        "panoramaDoNegocio",
      ]) {
        expect(`${arquivo}: ${fonte.includes(proibido)}`).toBe(`${arquivo}: false`);
      }
    }
  });

  it("nenhum arquivo do Assistente lê tabela administrativa", () => {
    for (const arquivo of ARQUIVOS_DO_ASSISTENTE) {
      const fonte = semComentarios(arquivo);
      // `landingLeads` são decoradoras interessadas no ALTAR; `users` inteira
      // é a carteira de assinantes. Nenhuma das duas é dado da empresa dela.
      for (const tabela of ["landingLeads", "asaasWebhookEvents", "adminWorkItems"]) {
        expect(`${arquivo}: ${fonte.includes(tabela)}`).toBe(`${arquivo}: false`);
      }
      expect(`${arquivo}: ${fonte.includes('query("users")')}`).toBe(`${arquivo}: false`);
    }
  });

  it("continua exigindo acesso ativo da decoradora — a outra fronteira segue de pé", () => {
    expect(semComentarios("convex/assistente.ts")).toContain("requireActiveAccess");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A TELA NÃO É A TRAVA, MAS TAMBÉM NÃO ENTREGA A PORTA
// ─────────────────────────────────────────────────────────────────────────────

describe("as duas telas não se confundem", () => {
  const PAGINA = semComentarios("src/pages/app/escritorio/page.tsx");
  const LAYOUT = semComentarios("src/pages/app/layout.tsx");

  it("a rota do Escritório declara por que não tem item de menu fixo", () => {
    expect(Object.keys(ROTAS_SEM_MENU)).toContain("/escritorio");
  });

  it("o link do Escritório só desenha para o dono", () => {
    expect(LAYOUT).toContain("souDono === true");
    expect(LAYOUT).toContain('to="/escritorio"');
  });

  it("a tela do Escritório só pede o panorama depois de saber que pode", () => {
    expect(PAGINA).toContain("api.escritorio.souDono");
    expect(PAGINA).toContain('souDono === true ? {} : "skip"');
  });

  it("a tela do Assistente não conhece o Escritório", () => {
    const assistente = semComentarios("src/pages/app/assistente/page.tsx");
    expect(assistente).not.toContain("api.escritorio");
    expect(assistente).not.toContain("/escritorio");
  });
});
