import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TELAS_DO_EVENTO, eventoDoCaminho, telaAberta } from "./telas-do-evento";
import { ETAPAS_DO_PROJETO, ROTA_DA_ETAPA } from "@/convex/lib/jornadaDoEvento.ts";

// ═════════════════════════════════════════════════════════════════════════════
// A BARRA DO EVENTO NÃO PODE MENTIR SOBRE O QUE EXISTE
//
// Mesma trava de `navigation.test.ts`, aplicada ao de dentro do evento, e pelo
// mesmo motivo histórico: na integração de novembro o Layout do salão nasceu
// com rota registrada, tela pronta e NENHUM caminho até ela. O defeito só
// apareceu porque um conflito de merge obrigou alguém a olhar.
//
// Os três sentidos conferidos aqui:
//
//  1. toda rota `/eventos/:id/*` de App.tsx aparece na barra;
//  2. toda pastilha da barra corresponde a uma rota registrada;
//  3. toda etapa da Jornada que tem rota tem pastilha.
//
// O terceiro é o que pega a etapa nova: quem acrescentar uma etapa com tela
// própria vê este teste quebrar no mesmo commit.
// ═════════════════════════════════════════════════════════════════════════════

const APP = readFileSync("src/App.tsx", "utf-8")
  // Sem comentários: o arquivo EXPLICA as rotas em prosa, e a prosa cita
  // caminhos. É a trava de leitura de fonte tropeçando no próprio comentário —
  // já aconteceu cinco vezes neste repositório.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

/** As rotas de dentro do evento declaradas no roteador, sem o prefixo. */
function rotasRegistradas(): string[] {
  return [...APP.matchAll(/path="\/eventos\/:id\/([^"]+)"/g)]
    .map((m) => m[1])
    // `checklist/:phase` vira as duas telas que a pessoa de fato abre.
    .flatMap((r) => (r === "checklist/:phase" ? ["checklist/pre", "checklist/post"] : [r]))
    .sort();
}

// `string[]` de propósito: `TELAS_DO_EVENTO` é `as const`, e a união de
// literais recusaria comparar com a rota lida do roteador — que é texto.
const naBarra: string[] = TELAS_DO_EVENTO.map((t) => t.rota).sort();

describe("a barra cobre o evento inteiro", () => {
  it("existe roteador para conferir — senão este teste passaria vazio", () => {
    expect(rotasRegistradas().length).toBeGreaterThan(8);
  });

  it("nenhuma tela do evento ficou fora da barra", () => {
    const fora = rotasRegistradas().filter((r) => !naBarra.includes(r));
    expect(
      fora.length === 0 ? "nenhuma" : `tela sem caminho na barra: ${fora.join(", ")}`,
    ).toBe("nenhuma");
  });

  it("nenhuma pastilha leva a rota que não existe", () => {
    const registradas = rotasRegistradas();
    const orfas = naBarra.filter((r) => !registradas.includes(r));
    expect(
      orfas.length === 0 ? "nenhuma" : `pastilha sem rota: ${orfas.join(", ")}`,
    ).toBe("nenhuma");
  });

  it("toda etapa da Jornada com tela própria tem pastilha", () => {
    const semPastilha = ETAPAS_DO_PROJETO.map((e) => ROTA_DA_ETAPA[e])
      .filter((rota) => rota !== "")
      .filter((rota) => !naBarra.includes(rota));
    expect(
      semPastilha.length === 0
        ? "nenhuma"
        : `etapa da jornada inalcançável pela barra: ${[...new Set(semPastilha)].join(", ")}`,
    ).toBe("nenhuma");
  });

  it("o contrato continua sendo a etapa sem tela própria", () => {
    // Se um dia ele ganhar tela, esta linha quebra e alguém acrescenta a
    // pastilha — em vez de a etapa ficar invisível na barra para sempre.
    const semRota = ETAPAS_DO_PROJETO.filter((e) => ROTA_DA_ETAPA[e] === "");
    expect(semRota).toEqual(["contrato"]);
  });

  it("nenhuma pastilha repetida: duas iguais seriam dois caminhos para o mesmo lugar", () => {
    expect(new Set(naBarra).size).toBe(naBarra.length);
  });
});

describe("eventoDoCaminho — onde a barra aparece, e onde não", () => {
  it("aparece nas telas de dentro do evento", () => {
    expect(eventoDoCaminho("/eventos/abc123/briefing")).toEqual({
      id: "abc123",
      rota: "briefing",
    });
    // Rota com duas partes continua sendo UMA tela.
    expect(eventoDoCaminho("/eventos/abc123/checklist/pre")).toEqual({
      id: "abc123",
      rota: "checklist/pre",
    });
  });

  it("NÃO aparece na capa do evento — a Jornada já está desenhada lá", () => {
    expect(eventoDoCaminho("/eventos/abc123")).toBeNull();
    expect(eventoDoCaminho("/eventos/abc123/")).toBeNull();
  });

  it("NÃO aparece fora do evento", () => {
    expect(eventoDoCaminho("/eventos")).toBeNull();
    expect(eventoDoCaminho("/dashboard")).toBeNull();
    expect(eventoDoCaminho("/compras")).toBeNull();
    expect(eventoDoCaminho("/")).toBeNull();
    // Uma tela cujo caminho COMEÇA parecido não vira tela de evento.
    expect(eventoDoCaminho("/eventos-antigos/abc")).toBeNull();
  });

  it("tela desconhecida não acende pastilha nenhuma", () => {
    // A barra desenha "esta tela" em vez de pintar a pastilha errada.
    expect(telaAberta("inventada")).toBeUndefined();
    expect(telaAberta("briefing")?.rotulo).toBe("Briefing");
  });
});
