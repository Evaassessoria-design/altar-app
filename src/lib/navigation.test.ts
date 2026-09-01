import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS, MORE_MENU_ITEMS, NAV_ITEMS, ROTAS_SEM_MENU } from "./navigation";

// TRAVA CONTRA TELA ÓRFÃ.
//
// `/dashboard` existia em App.tsx, o login mandava para lá e nenhum menu
// apontava para ele. Este teste lê as rotas do próprio App.tsx e exige que
// cada uma esteja no menu OU declarada como exceção com motivo.

function rotasDoApp(): string[] {
  // Caminho a partir da raiz do projeto: no jsdom o `import.meta.url` do
  // Vite não é um file:// utilizável pelo `node:fs`.
  const src = readFileSync(join(process.cwd(), "src/App.tsx"), "utf-8");
  return [...src.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p !== "*" && p !== "/" && !p.startsWith("/login") && !p.startsWith("/redefinir-senha"));
}

describe("toda rota do app tem caminho de navegação", () => {
  const noMenu = new Set<string>(
    [...NAV_ITEMS, ...BOTTOM_NAV_ITEMS, ...MORE_MENU_ITEMS].map((i) => i.to),
  );

  it.each(rotasDoApp())("rota %s está no menu ou é exceção declarada", (rota) => {
    const alcancavel = noMenu.has(rota) || rota in ROTAS_SEM_MENU;
    expect(alcancavel, `Rota "${rota}" não tem link em nenhum menu nem consta em ROTAS_SEM_MENU`).toBe(true);
  });

  it("/dashboard está no menu — é a tela para onde o login manda", () => {
    expect(noMenu.has("/dashboard")).toBe(true);
    expect(NAV_ITEMS[0].to).toBe("/dashboard");
    expect(BOTTOM_NAV_ITEMS[0].to).toBe("/dashboard");
  });

  it("nenhuma exceção declarada aparece também no menu — seria contradição", () => {
    for (const rota of Object.keys(ROTAS_SEM_MENU)) {
      expect(noMenu.has(rota), `"${rota}" está no menu E declarada como exceção`).toBe(false);
    }
  });

  it.each([...NAV_ITEMS, ...BOTTOM_NAV_ITEMS, ...MORE_MENU_ITEMS])(
    "o item de menu $to aponta para uma rota que existe",
    ({ to }) => {
      // O outro lado da trava: um link para uma tela que não foi criada vira
      // botão morto — o usuário clica e cai no "página não encontrada".
      expect(
        rotasDoApp(),
        `Menu aponta para "${to}", que não é uma <Route> em App.tsx`,
      ).toContain(to);
    },
  );

  it("nenhum item de menu repetido", () => {
    const tos = NAV_ITEMS.map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it("a barra inferior cabe na tela do celular", () => {
    // Com 6 itens o rótulo "Financeiro" sozinho ocupa ~62px em text-xs e a
    // barra estoura num aparelho de 320px. Quatro + "Mais" é o limite.
    expect(BOTTOM_NAV_ITEMS.length).toBeLessThanOrEqual(4);
  });

  // ── TRAVA DE ALCANCE NO CELULAR ───────────────────────────────────────────
  // O menu lateral é `hidden md:flex`: só existe no desktop. Estar em
  // NAV_ITEMS, portanto, NÃO garante que a tela seja alcançável num telefone.
  // Foi assim que /equipe sumiu do celular ao ganharmos /dashboard, e que
  // /funil já estava inalcançável antes disso.
  it.each(NAV_ITEMS)("a tela $label é alcançável no celular", ({ to }) => {
    const noCelular = new Set<string>(
      [...BOTTOM_NAV_ITEMS, ...MORE_MENU_ITEMS].map((i) => i.to),
    );
    expect(
      noCelular.has(to),
      `"${to}" está no menu lateral (desktop) mas em nenhum menu do celular`,
    ).toBe(true);
  });

  it("nenhum destino repetido entre a barra inferior e o Mais", () => {
    const barra = new Set<string>(BOTTOM_NAV_ITEMS.map((i) => i.to));
    for (const item of MORE_MENU_ITEMS) {
      expect(barra.has(item.to), `"${item.to}" aparece nos dois menus`).toBe(false);
    }
  });
});
