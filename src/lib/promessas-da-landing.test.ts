import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ═════════════════════════════════════════════════════════════════════════════
// A LANDING NÃO PODE PROMETER O QUE O PRODUTO NÃO FAZ
//
// Uma promessa falsa na landing não é exagero de marketing: é a pergunta que
// trava a reunião. A decoradora clica no menu procurando o que leu, não acha,
// e a partir dali duvida de tudo o que já viu funcionar.
//
// Cinco afirmações estavam erradas quando este teste foi escrito:
//
//   · "a IA preenche o briefing automaticamente" — a própria tela do produto
//     diz, em letras miúdas, "Nada é aplicado sem sua confirmação";
//   · "checklist ... com fotos" — `checklistItems` não tem campo de arquivo.
//     As fotos são do Caderno de Montagem, que é outra tela;
//   · "Anexe pedidos em PDF ou imagem" na lista de compras — `purchaseItems`
//     não tem `_storage` em lugar nenhum;
//   · "Notifique a equipe com um toque" — não existe. Nenhuma tela de equipe
//     manda mensagem para ninguém;
//   · "Kanban com 4 etapas" — são SETE. Esta vendia MENOS do que o produto faz,
//     e é tão errada quanto as outras.
//
// O teste lê o FONTE, não a tela renderizada: é a mesma trava de
// `posicionamento.test.ts` e `produto-generico.test.ts`. Se você mudou o texto
// e ele quebrou, confira a funcionalidade antes de consertar o teste.
// ═════════════════════════════════════════════════════════════════════════════

const landing = readFileSync("src/pages/Index.tsx", "utf-8");
const schema = readFileSync("convex/schema.ts", "utf-8");
const areasDoBriefing = readFileSync("src/lib/briefing-areas.ts", "utf-8");

/** O corpo de uma `defineTable`, para perguntar quais campos ela tem. */
function tabela(nome: string): string {
  const inicio = schema.indexOf(`${nome}: defineTable({`);
  expect(inicio, `tabela "${nome}" não encontrada no schema`).toBeGreaterThan(-1);
  return schema.slice(inicio, schema.indexOf("defineTable({", inicio + 20));
}

describe("a landing só promete o que existe", () => {
  it("não promete que a IA preenche o briefing sozinha", () => {
    // O produto PROPÕE e a pessoa confirma — e é isso que deve estar escrito.
    const dialogo = readFileSync(
      "src/pages/app/events/[id]/_components/contract-import-dialog.tsx",
      "utf-8",
    );
    expect(dialogo).toContain("Nada é aplicado sem sua confirmação");
    expect(landing).not.toMatch(/IA preenche o briefing automaticamente/i);
  });

  it("não promete foto no checklist, porque o checklist não guarda foto", () => {
    expect(tabela("checklistItems")).not.toContain("_storage");

    const cartao = landing.slice(landing.indexOf('title: "Checklist de Carregamento"'));
    const descricao = cartao.slice(0, cartao.indexOf("},"));
    expect(descricao).not.toMatch(/fotos?/i);
  });

  it("não promete anexo na compra, porque a compra não tem anexo", () => {
    expect(tabela("purchaseItems")).not.toContain("_storage");
    expect(landing).not.toMatch(/anexe pedidos/i);
  });

  it("não promete notificar a equipe, porque nada notifica a equipe", () => {
    const equipe = readFileSync("src/pages/app/equipe/page.tsx", "utf-8");
    expect(equipe).not.toMatch(/wa\.me|notificar/i);
    expect(landing).not.toMatch(/notifique a equipe/i);
  });

  it("conta os estágios do funil pelo schema, não de memória", () => {
    const inicio = schema.indexOf("const leadStage = v.union(");
    const bloco = schema.slice(inicio, schema.indexOf(");", inicio));
    const estagios = bloco.match(/v\.literal\(/g) ?? [];
    expect(estagios).toHaveLength(7);

    // O texto não pode afirmar um número menor — nem um maior.
    expect(landing).not.toMatch(/Kanban com \d+ etapas/i);
    expect(landing).toMatch(/sete estágios/i);
  });

  it("os 61 campos do briefing são 61 de verdade", () => {
    const campos = areasDoBriefing.match(/\{ key: "[a-zA-Z_]+", label:/g) ?? [];
    expect(campos).toHaveLength(61);
    expect(landing).toContain("61 campos");
  });

  it("os 14 dias de teste são os 14 dias do servidor", () => {
    const identidade = readFileSync("convex/lib/identity.ts", "utf-8");
    expect(identidade).toContain("export const TRIAL_DAYS = 14;");
    expect(landing).toContain("14 dias grátis");
  });
});
