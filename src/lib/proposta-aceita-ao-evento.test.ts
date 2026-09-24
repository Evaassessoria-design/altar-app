import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// DE "ACEITA" ATÉ O EVENTO, SEM PROCURAR O CARTÃO
//
// A cadeia é LEAD → PROPOSTA → EVENTO. A tela da proposta aceita já oferecia o
// caminho de volta — mas mandava para `/funil` e pronto: a decoradora caía num
// quadro com quarenta cartões para achar o dela e clicar em "Criar Evento".
// O endereço já sabia de quem era a proposta.
//
// O que NÃO mudou, e é decisão registrada no código: aceitar a proposta NÃO
// cria evento. O evento nasce da conversão do lead, que pede data, local e
// tipo — inventá-los a partir da proposta produziria um evento errado em
// silêncio. Isto aqui encurta o caminho; não automatiza a decisão.
// ═════════════════════════════════════════════════════════════════════════════

const semComentarios = (p: string) =>
  readFileSync(p, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const PROPOSTA = semComentarios("src/pages/app/propostas/[id]/page.tsx");
const FUNIL = semComentarios("src/pages/app/funil/page.tsx");

describe("a proposta aceita leva o lead junto", () => {
  it("o endereço carrega QUAL lead converter", () => {
    expect(PROPOSTA, "voltou a mandar para o funil genérico").toContain(
      "/funil?converter=${proposta.vinculo.id}",
    );
  });

  it("e o link só aparece quando a proposta está aceita", () => {
    // Oferecer "criar o evento" numa proposta em rascunho ou recusada seria
    // empurrar um fechamento que não aconteceu.
    expect(PROPOSTA).toMatch(/proposta\.status === "aceita"[\s\S]{0,400}converter=/);
  });
});

describe("o funil abre a conversão do cartão certo", () => {
  it("lê o pedido do endereço", () => {
    expect(FUNIL).toContain('searchParams.get("converter")');
  });

  it("e confere o id contra os leads que o SERVIDOR devolveu", () => {
    // Id forjado, de outra conta ou de lead apagado não casa com cartão
    // nenhum e nada abre. A tela nunca decide posse — ela só compara com o
    // que a consulta já filtrou por dono.
    expect(FUNIL).toContain("abrirConversao={converterLeadId === lead._id}");
  });

  it("limpa o endereço ao fechar, para não prender ninguém no diálogo", () => {
    // Sem isto, fechar e recarregar a página reabriria a conversão para
    // sempre.
    expect(FUNIL).toMatch(/proximos\.delete\("converter"\)/);
    expect(FUNIL).toContain("aoFecharConversao");
  });

  it("e continua sem criar evento sozinho — a conversão pede os dados", () => {
    // O diálogo é o mesmo de sempre: nome, data, local e tipo. Nada é
    // inventado a partir da proposta.
    expect(FUNIL).toContain("convertToEvent");
    expect(FUNIL).toMatch(/ConvertDialog[\s\S]{0,600}eventDate/);
  });
});
