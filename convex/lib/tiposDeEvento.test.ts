import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  EVENT_TYPES,
  TIPOS_DE_EVENTO,
  ehTipoDeEventoValido,
  rotuloDoTipoDeEvento,
} from "./tiposDeEvento";
import { paraOCliente } from "./propostaComercial";

// ═════════════════════════════════════════════════════════════════════════════
// O SLUG NÃO CHEGA A NINGUÉM — MUITO MENOS À CLIENTE
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// `events.type` guarda "wedding". A proposta comercial COPIA esse campo do
// evento na criação, e `paraOCliente` o entrega ao PDF. O documento que a
// decoradora manda para a noiva, sob o timbre do estúdio dela, dizia:
//
//     Casamento Marina & Gabriel
//     wedding   ·   10 de outubro de 2026   ·   Fazenda Aurora
//
// Cada tela traduzia — com a SUA cópia do mapa. Eram cinco, e a função do
// módulo que se dizia canônico não tinha um único uso em produção. Cópia que
// ninguém chama envelhece sem avisar, e foi por uma fresta dessas que o slug
// saiu do sistema.
// ═════════════════════════════════════════════════════════════════════════════

describe("o rótulo de um tipo de evento", () => {
  it("traduz todos os tipos gravados — nenhum sobra em inglês", () => {
    for (const slug of TIPOS_DE_EVENTO) {
      const rotulo = rotuloDoTipoDeEvento(slug);
      expect(rotulo, `"${slug}" sem rótulo`).toBeTruthy();
      expect(rotulo, `"${slug}" aparece cru`).not.toBe(slug);
    }
  });

  it("a lista de rótulos cobre exatamente os valores gravados", () => {
    // Um tipo novo no schema sem rótulo vazaria como slug na primeira tela.
    expect([...EVENT_TYPES].map((t) => t.value).sort()).toEqual([...TIPOS_DE_EVENTO].sort());
  });

  it("valor desconhecido volta como veio, e não vira travessão", () => {
    // `leads.eventType` é texto livre: contas reais têm "Casamento" escrito à
    // mão. Forçá-lo para "—" apagaria informação verdadeira.
    expect(rotuloDoTipoDeEvento("Casamento")).toBe("Casamento");
    expect(rotuloDoTipoDeEvento("Bodas de prata")).toBe("Bodas de prata");
  });

  it("ausente e em branco devolvem undefined — quem exibe decide", () => {
    expect(rotuloDoTipoDeEvento(undefined)).toBeUndefined();
    expect(rotuloDoTipoDeEvento("")).toBeUndefined();
    expect(rotuloDoTipoDeEvento("   ")).toBeUndefined();
  });

  it("reconhece o que é tipo e o que não é", () => {
    expect(ehTipoDeEventoValido("wedding")).toBe(true);
    expect(ehTipoDeEventoValido("Casamento")).toBe(false);
    expect(ehTipoDeEventoValido(undefined)).toBe(false);
    expect(ehTipoDeEventoValido(7)).toBe(false);
  });
});

describe("o documento da cliente nunca carrega um slug", () => {
  const base = {
    titulo: "Proposta",
    clienteNome: "Marina",
    itens: [{ descricao: "Projeto", valor: 1000 }],
  };

  it.each([...TIPOS_DE_EVENTO])("uma proposta gravada com %s sai traduzida", (slug) => {
    // Cobre as propostas criadas ANTES da correção, que têm o slug gravado no
    // banco. Não há backfill: a tradução na saída é o que as alcança.
    const doc = paraOCliente({ ...base, eventoTipo: slug }, { nome: "Estúdio" });
    expect(doc.evento?.tipo).not.toBe(slug);
    expect(JSON.stringify(doc)).not.toContain(`"${slug}"`);
  });

  it("e o que a decoradora escreveu à mão continua intacto", () => {
    const doc = paraOCliente({ ...base, eventoTipo: "Bodas de ouro" }, { nome: "Estúdio" });
    expect(doc.evento?.tipo).toBe("Bodas de ouro");
  });
});

describe("existe UM mapa de rótulos, não cinco", () => {
  /** Toda tela e todo gerador que mostram o tipo de um evento. */
  const CONSOMEM = [
    "src/pages/app/events/page.tsx",
    "src/pages/app/events/[id]/page.tsx",
    "src/pages/app/funil/page.tsx",
    "src/lib/generate-event-pdf.ts",
    "convex/propostas.ts",
  ];

  it.each(CONSOMEM)("%s não guarda a própria cópia da tradução", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    // A assinatura da cópia: o par slug→rótulo escrito à mão no arquivo.
    expect(fonte).not.toMatch(/wedding:\s*"Casamento"/);
    expect(fonte).not.toMatch(/value:\s*"wedding",\s*label:/);
  });

  it.each(CONSOMEM)("%s usa o módulo único", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf-8");
    expect(fonte).toMatch(/tiposDeEvento|event-types/);
  });
});
