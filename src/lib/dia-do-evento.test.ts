import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// O CELULAR DA DECORADORA NO DIA DA MONTAGEM
//
// Ela está em pé, no salão, com o telefone na mão. A ação mais frequente do
// dia é: ligar para quem não chegou.
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
// A escala do evento mostrava nome, função, horário de chegada e observação —
// e NÃO o telefone. O número já vinha na consulta (`listEventTeam` devolve o
// cadastro inteiro do membro) e a tela simplesmente não o usava.
//
// Na prática: sair do evento, abrir Equipe, procurar a pessoa, copiar o número
// na mão. Três telas para uma ligação, no pior momento possível.
// ═════════════════════════════════════════════════════════════════════════════

const EVENTO = "src/pages/app/events/[id]/page.tsx";
const fonte = readFileSync(EVENTO, "utf-8");

describe("a escala do evento serve para agir", () => {
  it("mostra o telefone de quem está escalado", () => {
    const escala = fonte.slice(fonte.indexOf("sortEventTeam(eventTeam)"));
    expect(escala).toContain("assignment.member?.phone");
  });

  it("o telefone é tocável — discagem, não texto para copiar", () => {
    expect(fonte).toMatch(/href=\{`tel:\$\{assignment\.member\.phone/);
  });

  it("o alvo de toque cresce no celular", () => {
    // A tela é usada em pé, com o polegar. Um link de 12px de altura não é
    // um alvo; é uma aposta.
    const bloco = fonte.slice(
      fonte.indexOf("href={`tel:"),
      fonte.indexOf("</a>", fonte.indexOf("href={`tel:")),
    );
    expect(bloco).toMatch(/min-h-9/);
  });

  it("tem rótulo para quem não enxerga o ícone", () => {
    const bloco = fonte.slice(
      fonte.indexOf("href={`tel:"),
      fonte.indexOf("</a>", fonte.indexOf("href={`tel:")),
    );
    expect(bloco).toContain("aria-label=");
  });

  it("quem não tem telefone cadastrado não vira linha vazia", () => {
    // `phone` é opcional no cadastro da equipe. Sem ele, nada é desenhado —
    // nem um traço, nem "sem telefone".
    expect(fonte).toContain("assignment.member?.phone?.trim() &&");
  });

  it("nada é enviado por conta própria", () => {
    // `tel:` abre o discador do aparelho. Nenhuma mensagem sai do ALTAR sem
    // alguém escrever e apertar enviar.
    const bloco = fonte.slice(
      fonte.indexOf("sortEventTeam(eventTeam)"),
      fonte.indexOf("Escalar alguém", fonte.indexOf("sortEventTeam(eventTeam)")),
    );
    expect(bloco).not.toMatch(/api\.[a-z]+\.(send|enviar|notificar)/i);
  });
});
