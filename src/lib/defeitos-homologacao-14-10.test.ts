import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// OS DEFEITOS DA HOMOLOGAÇÃO DE 14/10 QUE NÃO TINHAM GUARDA
//
// Três foram apontados nominalmente. Dois eram de EXIBIÇÃO, com mecanismo
// verificável sem navegador — e é o que estes testes travam. O terceiro
// (proposta aceita × Jornada do evento) é decisão de produto e está descrito
// em docs/checkpoint-integracao-2026-10-14.md: a correção mexe em leitura
// quente ou em escrita na conversão, e não se escolhe isso a duas horas de uma
// demonstração.
//
// Os dois guardas leem a FONTE sem comentário: a prosa dos arquivos explica
// justamente o defeito, e um guarda ingênuo acusaria a explicação como se
// fosse o código. Já aconteceu mais de uma vez neste repositório.
// ═════════════════════════════════════════════════════════════════════════════

const semComentarios = (p: string) =>
  readFileSync(p, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const FUNIL = semComentarios("src/pages/app/funil/page.tsx");
const ACERVO_DO_EVENTO = semComentarios("src/pages/app/events/[id]/acervo/page.tsx");

describe("converter lead em evento não perde a data que o lead já tinha", () => {
  it("o campo da conversão é `date` — o mesmo formato que o lead grava", () => {
    // `datetime-local` só aceita "AAAA-MM-DDTHH:mm". Com o dia puro do lead
    // ("2027-05-22") o navegador descarta o valor e o campo abre VAZIO.
    const dialogo = FUNIL.slice(FUNIL.indexOf("function ConvertDialog"));
    expect(dialogo).toContain('<Input type="date" {...register("eventDate")} />');
    expect(dialogo, "voltou a usar datetime-local na conversão").not.toContain(
      '<Input type="datetime-local" {...register("eventDate")} />',
    );
  });

  it("o valor inicial é cortado no dia, para caber no campo", () => {
    expect(FUNIL).toContain('eventDate: (lead.eventDate ?? "").slice(0, 10)');
  });

  it("o formulário DO EVENTO continua com horário — são campos diferentes", () => {
    // A tela do evento usa `datetime-local` de propósito: ali o horário faz
    // parte do evento. Esta trava existe para a correção não vazar para lá.
    const evento = semComentarios("src/pages/app/events/_components/event-form-dialog.tsx");
    expect(evento).toContain('type="datetime-local"');
  });

  it("a data continua obrigatória: o campo vazio não passa", () => {
    expect(FUNIL).toContain('eventDate: z.string().min(1, "Data obrigatória")');
  });
});

describe('"Reservar peça" não sai cortado no celular', () => {
  it("o cabeçalho do Acervo do evento quebra linha e o título cede espaço", () => {
    // Sem `flex-wrap`, título + "Reservar da ficha" + "Reservar peça" não
    // cabem em 390 px, e o grupo de botões é `flex-shrink-0`: o último sai
    // pela borda.
    const cabecalho = ACERVO_DO_EVENTO.slice(
      ACERVO_DO_EVENTO.indexOf("Acervo do evento") - 600,
      ACERVO_DO_EVENTO.indexOf("Acervo do evento"),
    );
    expect(cabecalho).toContain("flex-wrap");
    expect(cabecalho).toContain("min-w-0");
  });

  it("os dois botões continuam na tela, sem `hidden` abaixo de `sm`", () => {
    const i = ACERVO_DO_EVENTO.indexOf("Reservar da ficha");
    const bloco = ACERVO_DO_EVENTO.slice(i - 400, i + 400);
    expect(bloco).toContain("Reservar peça");
    expect(bloco).not.toMatch(/hidden\s+sm:/);
  });
});
