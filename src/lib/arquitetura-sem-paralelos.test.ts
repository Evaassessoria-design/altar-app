import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// TRAVA DE ARQUITETURA — O QUE NÃO PODE NASCER DE NOVO
//
// Este repositório já pagou três vezes pelo mesmo erro: cinco mapas de tipo de
// evento, três nomes para composição, dois blocos para um ambiente. Toda vez,
// a segunda estrutura foi criada por um motivo razoável, e toda vez ela
// divergiu da primeira dentro de semanas.
//
// A rodada do "item visual único" foi construída inteira sobre a decisão
// oposta: NADA foi criado que o modelo existente já soubesse representar.
//   · o item visual é `assemblyItems` — não há `visualItems`;
//   · a biblioteca de imagens é `eventPhotos` — não há moodboard;
//   · os documentos são a Pasta do Evento — não há segundo gerenciador;
//   · o PDF dos noivos é uma leitura do Projeto Visual — não há editor.
//
// Estes testes existem para que a próxima pessoa (ou o próximo agente) tenha
// de justificar antes de desfazer isso, em vez de descobrir tarde demais.
// ═════════════════════════════════════════════════════════════════════════════

const SCHEMA = readFileSync("convex/schema.ts", "utf-8")
  // Sem comentários: o schema EXPLICA as decisões, e a prosa cita exatamente
  // os nomes que estes testes proíbem. É a quinta vez que uma trava de leitura
  // de fonte neste repositório tropeça no próprio comentário.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

/** As tabelas realmente declaradas no schema. */
const TABELAS = [...SCHEMA.matchAll(/^\s{2}(\w+):\s*defineTable/gm)].map((m) => m[1]);

describe("nenhuma tabela paralela ao que já existe", () => {
  it.each([
    ["visualItems", "assemblyItems já é o item visual do evento"],
    ["projectItems", "idem"],
    ["decorationItems", "idem"],
    ["moodboards", "eventPhotos é a biblioteca de imagens do evento"],
    ["moodboardItems", "idem"],
    ["inspirations", "idem"],
    ["projectPhotos", "idem — foto do item é PONTEIRO para eventPhotos"],
    ["itemPhotos", "idem"],
    ["visualProjects", "o Projeto Visual é uma LEITURA, não uma tabela"],
    ["presentations", "idem — o PDF é gerado do projeto"],
    ["documents", "contracts + leadDocuments já são a Pasta do Evento"],
    ["eventFiles", "idem"],
    ["vendors", "suppliers + eventSuppliers já respondem por fornecedor"],
    // O Escritório de IA: os sete agentes vivem em código
    // (`lib/escritorio/agentes.ts`), não em cadastro. Uma tabela obrigaria
    // cada conta a ter sete linhas semeadas, com a primeira que falhasse
    // virando uma conta sem equipe.
    ["agents", "os agentes são constante, não cadastro"],
    ["agentes", "idem"],
    ["aiAgents", "idem"],
    ["agentRuns", "agentTasks já guarda pedido, status, resultado e histórico"],
    ["agentMessages", "o Escritório não é um chat — não há turno para guardar"],
  ])("não existe tabela `%s` (%s)", (nome) => {
    expect(TABELAS, `nasceu uma tabela paralela: ${nome}`).not.toContain(nome);
  });

  it("a contagem de tabelas não cresceu sem que alguém reparasse", () => {
    // Não é um teto: é um marco. Quem acrescentar uma tabela atualiza este
    // número no mesmo commit, e aí a revisão vê a tabela nova.
    //
    // 37 → 38: `agentTasks`, o Escritório de IA da decoradora. É UMA tabela, e
    // ela existe porque as administrativas (`adminWorkItems`, `adminApprovals`)
    // são do outro produto — `requireAdmin` em tudo, sem `userId` de tenant.
    // Guardar o pedido da decoradora ali misturaria os dois negócios numa
    // linha só.
    expect(TABELAS.length).toBe(38);
  });
});

describe("a foto do item é ponteiro, nunca cópia", () => {
  it("o item aponta para `eventPhotos`, e não guarda um segundo storage novo", () => {
    const campos = [...SCHEMA.matchAll(/(\w*[Pp]hoto\w*):\s*v\.optional\(v\.id\("(\w+)"\)\)/g)]
      .map((m) => [m[1], m[2]] as const);
    const doItem = campos.filter(([n]) => /^(reference|contracted)Photo/.test(n));
    expect(doItem.sort()).toEqual([
      // Os dois ponteiros para a Galeria…
      ["contractedPhotoId", "eventPhotos"],
      // …e os dois arquivos do caminho ANTIGO, que continuam existindo para
      // os itens cadastrados antes desta rodada.
      ["contractedPhotoStorageId", "_storage"],
      ["referencePhotoId", "eventPhotos"],
      ["referencePhotoStorageId", "_storage"],
    ]);
  });

  it("apagar o item não chama exclusão de foto da Galeria", () => {
    const fonte = readFileSync("convex/assemblyItems.ts", "utf-8");
    const remove = fonte.slice(fonte.indexOf("export const remove"));
    // A foto pode estar em outro item, pode ser a capa, e ela nunca pediu para
    // apagá-la. Excluir a cadeira do lounge não pode apagar a foto da cadeira.
    expect(remove).not.toContain("referencePhotoId");
    expect(remove).not.toContain("contractedPhotoId");
    expect(remove).not.toContain('db.delete(item.reference');
  });

  it("não existe mutation genérica de apagar arquivo por storageId", () => {
    // Seria a porta lateral perfeita: um id vindo do navegador apagando
    // qualquer arquivo de qualquer conta, já que o storage não é escopado.
    for (const arquivo of readdirSync("convex").filter((f) => f.endsWith(".ts") && !f.includes(".test."))) {
      const fonte = readFileSync(`convex/${arquivo}`, "utf-8");
      expect(fonte, `${arquivo} expõe exclusão de arquivo por id`).not.toMatch(
        /export const delete(Storage|File)\w*\s*=/,
      );
    }
  });
});

describe("o que sai do ALTAR passa por um lugar só", () => {
  const GERADORES = readdirSync("src/lib").filter(
    (f) => f.startsWith("generate-") && f.endsWith(".ts") && !f.includes(".test."),
  );

  it("todo gerador de PDF entrega por `entregarPdf`", () => {
    // `doc.save()` não funciona em WebView de iOS: o toque no botão não faz
    // nada, sem erro e sem arquivo. Quando existir aplicativo, o caminho
    // alternativo se escreve UMA vez.
    for (const g of GERADORES) {
      const fonte = readFileSync(`src/lib/${g}`, "utf-8");
      expect(fonte, `${g} não usa entregarPdf`).toContain("entregarPdf");
      expect(fonte, `${g} chama doc.save por conta própria`).not.toContain("doc.save(");
    }
  });

  it("o documento dos noivos é um dos geradores, e é o único com imagem grande", () => {
    expect(GERADORES).toContain("generate-projeto-visual-pdf.ts");
  });

  it("todo gerador que desenha foto respeita a orientação EXIF", () => {
    // Sem `imageOrientation: "from-image"`, foto de iPhone em retrato sai
    // DEITADA no papel — o navegador mostra certo na tela e o PDF não.
    for (const g of GERADORES) {
      const fonte = readFileSync(`src/lib/${g}`, "utf-8");
      if (!fonte.includes("createImageBitmap")) continue;
      expect(fonte, `${g} decodifica imagem sem corrigir a orientação`).toContain(
        'imageOrientation: "from-image"',
      );
    }
  });
});
