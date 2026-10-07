import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { descreverRecorte, lerRecorteDeEventos, nomeDoMes } from "./recorte-de-eventos.ts";

const ler = (q: string) => lerRecorteDeEventos(new URLSearchParams(q));

describe("o recorte da lista de eventos vem da URL", () => {
  it("cada atalho do Dashboard vira o recorte certo", () => {
    expect(ler("filtro=upcoming")).toEqual({ tipo: "nenhum", filtro: "upcoming" });
    expect(ler("status=confirmed")).toEqual({ tipo: "status", filtro: "all", status: "confirmed" });
    expect(ler("mes=2026-10")).toEqual({ tipo: "mes", filtro: "all", mes: "2026-10" });
    expect(ler("recorte=checklist")).toEqual({ tipo: "checklist", filtro: "upcoming" });
  });

  it("valor desconhecido mostra a lista inteira — nunca esconde eventos calado", () => {
    for (const q of ["status=arquivado", "mes=2026-13", "mes=out", "filtro=tudo", "recorte=xyz", ""]) {
      expect(ler(q)).toEqual({ tipo: "nenhum", filtro: "all" });
    }
  });

  it("o aviso diz o recorte com palavras", () => {
    expect(descreverRecorte(ler("status=in_progress"))).toBe("Eventos com status Em Andamento");
    expect(descreverRecorte(ler("mes=2026-10"))).toContain("outubro de 2026");
    expect(nomeDoMes("2026-01")).toBe("janeiro de 2026");
    expect(descreverRecorte(ler(""))).toBeNull();
  });
});

describe("a tela do Dashboard liga cada indicador ao seu recorte", () => {
  const painel = readFileSync("src/pages/app/dashboard/page.tsx", "utf-8");

  it("os quatro cards têm destino específico", () => {
    expect(painel).toContain('to="/eventos?filtro=upcoming"');
    expect(painel).toContain("to={`/financeiro?mes=${stats.mesDaReceita}`}");
    expect(painel).toContain('to="/eventos?recorte=checklist"');
    expect(painel).toContain('to="/compras?aba=eventos&recorte=pendentes"');
  });

  it("status e meses abrem a lista filtrada, por link de verdade (teclado e toque)", () => {
    expect(painel).toContain("to={`/eventos?status=${status}`}");
    expect(painel).toContain("to={`/eventos?mes=${m.mes}`}");
    expect(painel).toContain("focus-visible:ring-2");
  });

  it("o card do próximo evento não tem link dentro de link", () => {
    const i = painel.indexOf("to={`/eventos/${stats.nextEvent._id}`}");
    const fim = painel.indexOf("</Link>", i);
    expect(painel.slice(i, fim)).not.toMatch(/<Link|<a /);
  });
});

describe("cores do gráfico", () => {
  it("nenhuma tela usa hsl(var(--…)): os tokens são oklch e a cor sai inválida (preta)", () => {
    const achados = execSync('git grep -n "hsl(var(--" -- "src/*.tsx" || true', { encoding: "utf-8" }).trim();
    expect(achados).toBe("");
  });
});

describe("o destino da Receita do Mês mostra o mesmo critério do card", () => {
  it("lê as MESMAS entradas do Dashboard e explica a regra", () => {
    const fin = readFileSync("src/pages/app/financeiro/page.tsx", "utf-8");
    expect(fin).toContain("api.financeiro.recebidoNoMes");
    expect(fin).toContain("É a Receita do Mês do Dashboard");
    const painel = readFileSync("convex/dashboard.ts", "utf-8");
    expect(painel).toContain("lerEntradasDoMes(ctx, user._id, mesDaReceita)");
  });
});
